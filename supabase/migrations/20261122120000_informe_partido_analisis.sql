-- Informe técnico de partido (Análisis): datos que carga el analista para el PDF.
--
-- Qué guarda: en cada análisis (public.analisis_partidos), una columna nueva «informe» (jsonb) con la árbitra, la
-- figura del partido, las 3 claves, la posición en la tabla antes y después, y las frases de lectura. Vacía (NULL)
-- hasta que se guarda el primer informe.
--
-- Qué hace, en un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase):
--   1. Revisa los requisitos y que no esté aplicada.
--   2. Respaldo: no se modifica ni se borra nada existente. En seguridad_privado.respaldo_informe_partido se anota lo
--      que se crea, para que la reversión borre exactamente eso.
--   3. Agrega public.analisis_partidos.informe (jsonb, opcional), con una regla: tiene que ser un objeto y no pasar
--      los 8000 caracteres.
--   4. Seguridad: no cambia nada. La columna queda con las reglas que ya tiene analisis_partidos: ven el informe las
--      mismas personas que ven ese partido analizado, y lo guardan solo las dos cuentas administradoras de Análisis.
--      Cuentas de jugadoras y anon: nada (como hoy).
--   5. Verifica la columna y la regla (prueba un valor inválido, que se rechaza sin guardar nada) y que las reglas
--      de acceso de analisis_partidos siguen siendo las de antes.
--   6. Avisa a la API (PostgREST) que recargue el esquema, para que la app vea la columna nueva.
--
-- Bloqueos: agregar una columna vacía es instantáneo, pero necesita un bloqueo corto de la tabla. Espera como
-- máximo 5 s: si la tabla está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261122120000_informe_partido_analisis.sql
-- Verificación posterior (solo lectura): supabase/verification/20261122_informe_partido_analisis.sql

DO $informe_partido$
DECLARE
  v_id uuid;
  v_rechazo text := 'sin probar';
  v_reglas text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_partidos') IS NULL OR to_regnamespace('seguridad_privado') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (analisis_partidos, seguridad_privado o puede_administrar_analisis). No se tocó nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_informe_partido') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'informe') THEN
    RAISE EXCEPTION 'Ya está aplicada (existe la columna informe o su respaldo). No se tocó nada.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
       AND policyname = 'analisis_partidos_update_admin' AND cmd = 'UPDATE'
       AND qual LIKE '%puede_administrar_analisis%' AND with_check LIKE '%puede_administrar_analisis%') <> 1 THEN
    RAISE EXCEPTION 'La regla para modificar analisis_partidos no es la esperada (solo administradoras de Análisis). No se tocó nada.';
  END IF;

  -- Reglas de acceso de analisis_partidos antes del cambio (al final tienen que ser las mismas).
  SELECT string_agg(policyname || ':' || cmd || ':' || permissive || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY policyname)
    INTO v_reglas FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos';

  -- 2) Respaldo: lo que se crea.
  CREATE TABLE seguridad_privado.respaldo_informe_partido (tipo text NOT NULL, nombre text NOT NULL, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_informe_partido FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_informe_partido VALUES
    ('columna', 'public.analisis_partidos.informe'),
    ('regla', 'analisis_partidos_informe_check');

  -- 3) Columna.
  ALTER TABLE public.analisis_partidos ADD COLUMN informe jsonb;
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_informe_check
    CHECK (informe IS NULL OR (jsonb_typeof(informe) = 'object' AND length(informe::text) <= 8000));
  COMMENT ON COLUMN public.analisis_partidos.informe IS
    'Datos del informe técnico de partido que carga el analista (árbitra, figura, claves, posición antes/después, lecturas).';

  -- 5) Verificación.
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'informe') IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'La columna informe no quedó como jsonb. Se deshizo todo.';
  END IF;
  SELECT id INTO v_id FROM public.analisis_partidos LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE public.analisis_partidos SET informe = '[]'::jsonb WHERE id = v_id;
      v_rechazo := 'aceptó una lista';
    EXCEPTION WHEN check_violation THEN
      v_rechazo := 'ok';
    END;
    IF v_rechazo <> 'ok' THEN RAISE EXCEPTION 'La regla de la columna no rechaza valores inválidos (%). Se deshizo todo.', v_rechazo; END IF;
    IF EXISTS (SELECT 1 FROM public.analisis_partidos WHERE informe IS NOT NULL) THEN
      RAISE EXCEPTION 'La prueba dejó datos guardados. Se deshizo todo.';
    END IF;
  END IF;
  IF (SELECT string_agg(policyname || ':' || cmd || ':' || permissive || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos') IS DISTINCT FROM v_reglas THEN
    RAISE EXCEPTION 'Las reglas de acceso de analisis_partidos cambiaron. Se deshizo todo.';
  END IF;

  -- 6) La API ve la columna nueva.
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: analisis_partidos.informe agregada (prueba de la regla: %).', CASE WHEN v_id IS NULL THEN 'sin análisis para probar' ELSE v_rechazo END;
END
$informe_partido$;
