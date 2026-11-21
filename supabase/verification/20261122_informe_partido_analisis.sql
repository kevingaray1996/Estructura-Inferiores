-- Verificación (solo lectura) de supabase/migrations/20261122120000_informe_partido_analisis.sql
-- Se puede correr cuantas veces se quiera: no cambia nada. Si algo no está como se espera, avisa con un error.
-- Al final muestra cuántos análisis tienen datos del informe guardados.

DO $verificar_informe_partido$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'informe') IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'Falta la columna analisis_partidos.informe (jsonb): la migración no está aplicada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analisis_partidos'::regclass
                  AND conname = 'analisis_partidos_informe_check' AND contype = 'c') THEN
    RAISE EXCEPTION 'Falta la regla analisis_partidos_informe_check (objeto de hasta 8000 caracteres).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_informe_partido') IS NULL THEN
    RAISE EXCEPTION 'Falta el respaldo seguridad_privado.respaldo_informe_partido (lo necesita la reversión).';
  END IF;
  -- Guardar sigue limitado a las cuentas administradoras de Análisis.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
                  AND policyname = 'analisis_partidos_update_admin' AND cmd = 'UPDATE'
                  AND qual LIKE '%puede_administrar_analisis%' AND with_check LIKE '%puede_administrar_analisis%') THEN
    RAISE EXCEPTION 'La regla para modificar analisis_partidos no es la esperada (solo administradoras de Análisis).';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_partidos', 'SELECT') OR has_table_privilege('anon', 'public.analisis_partidos', 'UPDATE') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre analisis_partidos.';
  END IF;
  RAISE NOTICE 'Verificación OK.';
END
$verificar_informe_partido$;

SELECT count(*) FILTER (WHERE informe IS NOT NULL) AS analisis_con_informe, count(*) AS analisis_total
FROM public.analisis_partidos;
