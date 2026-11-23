-- Verificación (solo lectura) de supabase/migrations/20261123120000_consulta_analisis_cuerpo_tecnico.sql
-- Correr en el editor SQL de Supabase después de la migración. Si algo no está bien, frena con un mensaje claro.
-- No modifica nada.

DO $verificar_consulta_analisis$
DECLARE
  v_escritura text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regprocedure('public.puede_consultar_analisis(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta la función public.puede_consultar_analisis(uuid).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'analisis_eventos' AND column_name = 'segundo_fin') THEN
    RAISE EXCEPTION 'Falta la columna analisis_eventos.segundo_fin.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
                  AND policyname = 'analisis_partidos_read' AND qual LIKE '%puede_consultar_analisis%')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_eventos'
                  AND policyname = 'analisis_eventos_read' AND qual LIKE '%puede_consultar_analisis%') THEN
    RAISE EXCEPTION 'Las reglas de lectura de Análisis no usan puede_consultar_analisis.';
  END IF;
  IF has_function_privilege('anon', 'public.puede_consultar_analisis(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar puede_consultar_analisis.';
  END IF;
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_partido_eventos', 'analisis_pases_detalle',
                       'analisis_tipos_accion', 'analisis_comet_nombres')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reglas que dejan escribir en Análisis a otras cuentas: %.', v_escritura;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tablename IN ('analisis_partidos', 'analisis_eventos')
              AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename
                               AND p.policyname = 'sin_cuentas_jugadoras' AND p.permissive = 'RESTRICTIVE')) THEN
    RAISE EXCEPTION 'Falta la red sin_cuentas_jugadoras en analisis_partidos o analisis_eventos.';
  END IF;
  RAISE NOTICE 'OK: lectura para coordinación y cuerpo técnico de la categoría; escribir solo administradoras; segundo_fin presente.';
END
$verificar_consulta_analisis$;
