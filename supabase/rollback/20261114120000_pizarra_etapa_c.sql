-- Reversión de la etapa C de la pizarra: deja la base exactamente como antes de
-- supabase/migrations/20261114120000_pizarra_etapa_c.sql, usando el respaldo de seguridad_privado.respaldo_etapa_c.
--
-- Devuelve las 5 funciones y las políticas de biblioteca, cmj, entrenamiento_bloques y Storage tal como estaban.
-- Saca las columnas nuevas de biblioteca y equipos, y borra biblioteca_carpetas y biblioteca_favoritos.
-- OJO: cmj y entrenamiento_bloques vuelven a quedar abiertas a cualquier usuario logueado.
--
-- Para no perder nada, NO revierte si ya se usó algo de la etapa C: ejercicios de Gimnasio, ejercicios con
-- carpeta, tipo, duración u objetivo, favoritos, carpetas nuevas o cambiadas, colores de equipos o pizarras v2
-- (en la biblioteca o en la planificación). En ese caso avisa qué encontró.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor SQL de Supabase ejecute
-- las sentencias por separado. Correr como postgres. Si algo no coincide, no se revierte nada.

DO $reversion_etapa_c$
DECLARE
  hay boolean;
  r record;
  en_uso text[] := ARRAY[]::text[];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_etapa_c') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo de la etapa C: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_etapa_c)' INTO hay;
  IF NOT hay THEN
    RAISE EXCEPTION 'El respaldo de la etapa C está vacío: no hay nada que revertir.';
  END IF;
  IF to_regclass('public.biblioteca_carpetas') IS NULL OR to_regclass('public.biblioteca_favoritos') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'biblioteca' AND column_name = 'ambito') THEN
    RAISE EXCEPTION 'La base no tiene lo que agrega la etapa C. Revisar antes de revertir.';
  END IF;

  -- ¿Ya se usó algo de la etapa C? (se lee con EXECUTE porque las columnas no existen antes de la etapa C)
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.biblioteca WHERE ambito = ''gimnasio'')' INTO hay;
  IF hay THEN en_uso := en_uso || 'ejercicios de Gimnasio'; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.biblioteca WHERE carpeta_id IS NOT NULL OR tipo <> ''ejercicio''
             OR duracion_minutos IS NOT NULL OR objetivo <> '''')' INTO hay;
  IF hay THEN en_uso := en_uso || 'ejercicios con carpeta, tipo, duración u objetivo'; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.biblioteca_favoritos)' INTO hay;
  IF hay THEN en_uso := en_uso || 'favoritos'; END IF;
  EXECUTE 'SELECT count(*) <> 14 OR count(*) FILTER (WHERE sistema) <> 1 OR max(creado_en) > min(creado_en)
             FROM public.biblioteca_carpetas' INTO hay;
  IF hay THEN en_uso := en_uso || 'carpetas creadas, borradas o cambiadas'; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.equipos WHERE color_camiseta IS NOT NULL OR color_numero IS NOT NULL)' INTO hay;
  IF hay THEN en_uso := en_uso || 'colores de equipos'; END IF;
  IF EXISTS (SELECT 1 FROM public.biblioteca WHERE pizarra->>'version' = '2') THEN
    en_uso := en_uso || 'pizarras v2 en la biblioteca';
  END IF;
  IF EXISTS (SELECT 1 FROM public.planificacion_sesiones s, LATERAL jsonb_path_query(s.bloques, 'strict $.**.pizarra') pz
             WHERE pz->>'version' = '2') THEN
    en_uso := en_uso || 'pizarras v2 en la planificación';
  END IF;
  IF cardinality(en_uso) > 0 THEN
    RAISE EXCEPTION 'No se revierte: ya hay datos de la etapa C que se perderían (%).', array_to_string(en_uso, ', ');
  END IF;

  -- 1) Políticas: se borran las actuales de las tablas tocadas y se recrean las del respaldo.
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'cmj', 'entrenamiento_bloques')) OR schemaname = 'storage' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT detalle FROM seguridad_privado.respaldo_etapa_c WHERE tipo = 'politica' ORDER BY orden LOOP
    EXECUTE r.detalle;
  END LOOP;

  -- 2) Funciones: vuelven las definiciones guardadas.
  FOR r IN SELECT detalle FROM seguridad_privado.respaldo_etapa_c WHERE tipo = 'funcion' ORDER BY orden LOOP
    EXECUTE r.detalle;
  END LOOP;

  -- 3) Tablas y columnas nuevas.
  DROP TABLE public.biblioteca_favoritos;
  ALTER TABLE public.biblioteca
    DROP CONSTRAINT biblioteca_carpeta_fkey,
    DROP CONSTRAINT biblioteca_ambito_check,
    DROP CONSTRAINT biblioteca_tipo_check,
    DROP CONSTRAINT biblioteca_duracion_check,
    DROP CONSTRAINT biblioteca_textos_check,
    DROP CONSTRAINT biblioteca_listas_check,
    DROP CONSTRAINT biblioteca_demo_check,
    DROP CONSTRAINT biblioteca_ambito_campos_check,
    ALTER COLUMN fecha DROP DEFAULT;
  DROP INDEX public.biblioteca_ambito_carpeta;
  ALTER TABLE public.biblioteca
    DROP COLUMN ambito, DROP COLUMN tipo, DROP COLUMN carpeta_id, DROP COLUMN duracion_minutos, DROP COLUMN objetivo,
    DROP COLUMN musculos, DROP COLUMN material, DROP COLUMN tecnica, DROP COLUMN demo_tipo, DROP COLUMN demo_url,
    DROP COLUMN demo_credito, DROP COLUMN creado_por, DROP COLUMN actualizado_por, DROP COLUMN actualizado_en;
  DROP TABLE public.biblioteca_carpetas;
  ALTER TABLE public.equipos
    DROP CONSTRAINT equipos_colores_check,
    DROP COLUMN color_camiseta,
    DROP COLUMN color_numero;
  DROP FUNCTION pizarra_privado.demostracion_valida(jsonb);
  DROP FUNCTION pizarra_privado.demo_url_valida(text, text);
  DROP FUNCTION pizarra_privado.puede_editar_biblioteca(text);

  -- 4) Verificación: mismas políticas y mismas funciones que en el respaldo.
  IF EXISTS (
    (SELECT detalle FROM seguridad_privado.respaldo_etapa_c WHERE tipo = 'politica'
     EXCEPT
     SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
              policyname, schemaname, tablename, permissive, cmd,
              (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
              CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
              CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
     FROM pg_policies WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'cmj', 'entrenamiento_bloques')) OR schemaname = 'storage')
    UNION ALL
    (SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
              policyname, schemaname, tablename, permissive, cmd,
              (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
              CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
              CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
     FROM pg_policies WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'cmj', 'entrenamiento_bloques')) OR schemaname = 'storage'
     EXCEPT
     SELECT detalle FROM seguridad_privado.respaldo_etapa_c WHERE tipo = 'politica')) THEN
    RAISE EXCEPTION 'Las políticas no quedaron iguales al respaldo. No se revierte nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM seguridad_privado.respaldo_etapa_c
             WHERE tipo = 'funcion' AND pg_get_functiondef(objeto::regprocedure) IS DISTINCT FROM detalle) THEN
    RAISE EXCEPTION 'Las funciones no quedaron iguales al respaldo. No se revierte nada.';
  END IF;
  IF to_regclass('public.biblioteca_carpetas') IS NOT NULL OR to_regclass('public.biblioteca_favoritos') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                AND ((table_name = 'biblioteca' AND column_name IN ('ambito', 'carpeta_id', 'actualizado_en'))
                  OR (table_name = 'equipos' AND column_name IN ('color_camiseta', 'color_numero'))))
     OR to_regprocedure('pizarra_privado.puede_editar_biblioteca(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Quedaron tablas, columnas o funciones de la etapa C. No se revierte nada.';
  END IF;

  -- 5) Sin respaldo, la etapa C se puede volver a aplicar más adelante.
  DROP TABLE seguridad_privado.respaldo_etapa_c;

  PERFORM pg_notify('pgrst', 'reload schema');
END
$reversion_etapa_c$;

-- Resultado: tienen que volver "acceso biblioteca", "preparador_fisico ve biblioteca", "Acceso total usuarios logueados"
-- (cmj y entrenamiento_bloques) y "Biblioteca subir segun rol" sin gimnasio/.
SELECT tablename AS tabla, policyname AS politica, cmd FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'cmj', 'entrenamiento_bloques')) OR schemaname = 'storage'
ORDER BY 1, 2;
