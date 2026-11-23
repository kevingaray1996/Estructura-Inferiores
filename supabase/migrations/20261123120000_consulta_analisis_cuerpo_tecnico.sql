-- Análisis: el cuerpo técnico puede VER los análisis de su categoría; etiquetar y editar sigue siendo solo de
-- coordinación (las dos cuentas administradoras de Análisis).
--
-- Qué cambia:
--   a) Ver. Hoy la técnica (DT o ayudante, rol «tecnico») solo ve las acciones que tienen una jugadora de su
--      categoría, y un análisis aparece solo si ya tiene alguna de esas acciones. Las acciones marcadas «sin jugadora»
--      (pendientes de completar) no las ve. Con este cambio:
--        - coordinación ve todos los análisis y todas sus acciones;
--        - la técnica ve los análisis de SU categoría y todas sus acciones (también las que todavía no tienen jugadora);
--        - lo que ya se veía (por ejemplo, el perfil individual de otras áreas) se sigue viendo igual.
--      Con eso también ven las marcas del partido (inicio y fin de cada tiempo, goles, cambios): esas reglas ya dicen
--      «ve las marcas quien ve el análisis».
--   b) Guardar, editar y borrar: NO cambia. Solo las dos cuentas administradoras de Análisis. Este script además
--      CONTROLA que en las tablas de Análisis no haya ninguna regla que deje escribir a otra persona; si la hubiera,
--      no aplica nada y avisa.
--   c) Para lo que viene (acciones que duran, como Salida o Córner): columna opcional analisis_eventos.segundo_fin
--      (segundo del video donde termina la acción). Vacía = acción de un instante, como todas las de hoy. La app
--      todavía no la usa.
--
-- Cómo, en un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase):
--   1. Revisa los requisitos y que no esté aplicada.
--   2. Respaldo en seguridad_privado.respaldo_consulta_analisis: el texto exacto de las dos reglas de lectura que
--      cambia y lo que crea, para que la reversión deje todo como estaba.
--   3. Función public.puede_consultar_analisis(partido): «¿esta persona puede ver este análisis?». Lee la tabla con
--      permisos propios (así las dos reglas no se llaman entre sí en círculo).
--   4. Suma esa función a las reglas de lectura analisis_partidos_read y analisis_eventos_read (sin sacar nada).
--   5. Agrega analisis_eventos.segundo_fin con su regla (vacía o mayor o igual que el inicio).
--   6. Verifica todo y avisa a la API que recargue el esquema.
--
-- Cuentas de jugadoras y anon: nada (red RESTRICTIVE «sin_cuentas_jugadoras» y sin permisos para anon, como hoy).
-- Bloqueos: espera como máximo 5 s por tabla; si está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261123120000_consulta_analisis_cuerpo_tecnico.sql
-- Verificación posterior (solo lectura): supabase/verification/20261123_consulta_analisis_cuerpo_tecnico.sql

DO $consulta_analisis$
DECLARE
  v_qual_partidos text;
  v_qual_eventos text;
  v_escritura text;
  v_rechazo text := 'sin probar';
  v_evento uuid;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_partidos') IS NULL OR to_regclass('public.analisis_eventos') IS NULL
     OR to_regnamespace('seguridad_privado') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('public.mi_rol()') IS NULL OR to_regprocedure('public.mi_categoria()') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (tablas de Análisis, seguridad_privado, puede_administrar_analisis, mi_rol o mi_categoria). No se tocó nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_consulta_analisis') IS NOT NULL
     OR to_regprocedure('public.puede_consultar_analisis(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'analisis_eventos' AND column_name = 'segundo_fin') THEN
    RAISE EXCEPTION 'Ya está aplicada (existe el respaldo, la función puede_consultar_analisis o la columna segundo_fin). No se tocó nada.';
  END IF;

  SELECT qual INTO v_qual_partidos FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analisis_partidos' AND policyname = 'analisis_partidos_read' AND cmd = 'SELECT';
  SELECT qual INTO v_qual_eventos FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analisis_eventos' AND policyname = 'analisis_eventos_read' AND cmd = 'SELECT';
  IF v_qual_partidos IS NULL OR v_qual_eventos IS NULL THEN
    RAISE EXCEPTION 'No están las reglas de lectura analisis_partidos_read y analisis_eventos_read. No se tocó nada.';
  END IF;

  -- Escribir en Análisis: solo las administradoras. Cualquier regla que deje escribir sin puede_administrar_analisis
  -- se informa y no se aplica nada (no se corrige sola: hay que revisarla a mano).
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_partido_eventos', 'analisis_pases_detalle',
                       'analisis_tipos_accion', 'analisis_comet_nombres')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reglas que dejan escribir en Análisis a otras cuentas: %. No se tocó nada.', v_escritura;
  END IF;

  -- 2) Respaldo.
  CREATE TABLE seguridad_privado.respaldo_consulta_analisis (
    tipo text NOT NULL, nombre text NOT NULL, tabla text, definicion text, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_consulta_analisis FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_consulta_analisis VALUES
    ('regla', 'analisis_partidos_read', 'analisis_partidos', v_qual_partidos),
    ('regla', 'analisis_eventos_read', 'analisis_eventos', v_qual_eventos),
    ('funcion', 'public.puede_consultar_analisis(uuid)', NULL, NULL),
    ('columna', 'public.analisis_eventos.segundo_fin', 'analisis_eventos', NULL);

  -- 3) ¿Puede ver este análisis? Coordinación: todos. Técnica: los de su categoría. Resto: no (por esta vía).
  CREATE FUNCTION public.puede_consultar_analisis(p_partido_id uuid)
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $funcion$
    SELECT coalesce(auth.role() = 'authenticated' AND (
      public.puede_administrar_analisis()
      OR EXISTS (SELECT 1 FROM public.analisis_partidos p
                  WHERE p.id = p_partido_id
                    AND (public.mi_rol() = 'coordinacion'
                         OR (public.mi_rol() = 'tecnico' AND p.categoria_id = public.mi_categoria())))), false);
  $funcion$;
  COMMENT ON FUNCTION public.puede_consultar_analisis(uuid) IS
    'Análisis: true si la cuenta puede VER ese análisis (coordinación: todos; técnica: los de su categoría). No da permiso para escribir.';
  REVOKE ALL ON FUNCTION public.puede_consultar_analisis(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.puede_consultar_analisis(uuid) TO authenticated;

  -- 4) Reglas de lectura: lo de antes, o poder consultar ese análisis.
  EXECUTE format('ALTER POLICY analisis_partidos_read ON public.analisis_partidos USING ((%s) OR public.puede_consultar_analisis(id))', v_qual_partidos);
  EXECUTE format('ALTER POLICY analisis_eventos_read ON public.analisis_eventos USING ((%s) OR public.puede_consultar_analisis(partido_id))', v_qual_eventos);

  -- 5) Fin de la acción (para acciones que duran). Todas las de hoy quedan vacías.
  ALTER TABLE public.analisis_eventos ADD COLUMN segundo_fin integer;
  ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_segundo_fin_check
    CHECK (segundo_fin IS NULL OR segundo_fin >= segundo);
  COMMENT ON COLUMN public.analisis_eventos.segundo_fin IS
    'Segundo del video donde termina la acción (acciones que duran, como Salida o Córner). NULL = acción de un instante.';

  -- 6) Verificación.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
                  AND policyname = 'analisis_partidos_read' AND qual LIKE '%puede_consultar_analisis%')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_eventos'
                  AND policyname = 'analisis_eventos_read' AND qual LIKE '%puede_consultar_analisis%') THEN
    RAISE EXCEPTION 'Las reglas de lectura no quedaron con puede_consultar_analisis. Se deshizo todo.';
  END IF;
  IF has_function_privilege('anon', 'public.puede_consultar_analisis(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar puede_consultar_analisis. Se deshizo todo.';
  END IF;
  SELECT id INTO v_evento FROM public.analisis_eventos WHERE segundo > 0 LIMIT 1;
  IF v_evento IS NOT NULL THEN
    BEGIN
      UPDATE public.analisis_eventos SET segundo_fin = segundo - 1 WHERE id = v_evento;
      v_rechazo := 'aceptó un fin antes del inicio';
    EXCEPTION WHEN check_violation THEN
      v_rechazo := 'ok';
    END;
    IF v_rechazo <> 'ok' THEN RAISE EXCEPTION 'La regla de segundo_fin no rechaza valores inválidos (%). Se deshizo todo.', v_rechazo; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_eventos WHERE segundo_fin IS NOT NULL) THEN
    RAISE EXCEPTION 'La prueba dejó datos guardados. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: el cuerpo técnico ve los análisis de su categoría (escribir sigue siendo solo de coordinación) y existe analisis_eventos.segundo_fin.';
END
$consulta_analisis$;
