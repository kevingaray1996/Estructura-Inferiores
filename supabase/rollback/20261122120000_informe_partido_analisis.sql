-- Reversión de supabase/migrations/20261122120000_informe_partido_analisis.sql
--
-- Borra exactamente lo que creó la migración (anotado en seguridad_privado.respaldo_informe_partido): la columna
-- public.analisis_partidos.informe y su regla. No toca nada más del análisis.
--
-- Si algún análisis ya tiene datos del informe guardados, NO corre: se perderían (árbitra, figura, claves, etc.).
-- Para revertir igual, cambiar v_borrar_datos a true (esos datos se pierden).
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase).

DO $revertir_informe_partido$
DECLARE
  v_borrar_datos constant boolean := false;
  v_n bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_informe_partido') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo: la migración no está aplicada o ya se revirtió. No se tocó nada.';
  END IF;
  IF (SELECT count(*) FROM seguridad_privado.respaldo_informe_partido) <> 2
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_informe_partido WHERE tipo = 'columna' AND nombre = 'public.analisis_partidos.informe')
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_informe_partido WHERE tipo = 'regla' AND nombre = 'analisis_partidos_informe_check') THEN
    RAISE EXCEPTION 'El respaldo no es el esperado. No se tocó nada.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'informe') THEN
    EXECUTE 'SELECT count(*) FROM public.analisis_partidos WHERE informe IS NOT NULL' INTO v_n;
    IF v_n > 0 AND NOT v_borrar_datos THEN
      RAISE EXCEPTION 'Hay % análisis con datos del informe guardados. No se tocó nada (ver v_borrar_datos al principio).', v_n;
    END IF;
    ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_informe_check;
    ALTER TABLE public.analisis_partidos DROP COLUMN informe;
  END IF;
  DROP TABLE seguridad_privado.respaldo_informe_partido;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'informe') THEN
    RAISE EXCEPTION 'No se pudo borrar la columna. Se deshizo la reversión.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Revertido: analisis_partidos.informe borrada.';
END
$revertir_informe_partido$;
