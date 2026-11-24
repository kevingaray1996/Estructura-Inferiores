-- Reversión de supabase/migrations/20261126120000_posesion_tramos.sql
--
-- Borra la tabla de tramos de posesión marcados a mano y su función, y la columna analisis_partidos.direccion_confirmada.
-- Lo automático (momentos colectivos) y el lado de ataque (direccion_primer_tiempo) no se tocan.
-- Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
-- Si ya hay tramos marcados o lados confirmados, NO corre (para no perderlos). Para seguir igual, cambiar
-- v_borrar_datos a true.

DO $revertir_posesion_tramos$
DECLARE
  v_borrar_datos constant boolean := false;
  v_tramos bigint := 0;
  v_confirmados bigint := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_posesion_tramos') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_posesion_tramos): la migración no está aplicada. No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_posesion_tramos') IS NOT NULL THEN
    SELECT count(*) INTO v_tramos FROM public.analisis_posesion_tramos;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'analisis_partidos' AND column_name = 'direccion_confirmada') THEN
    EXECUTE 'SELECT count(*) FROM public.analisis_partidos WHERE direccion_confirmada' INTO v_confirmados;
  END IF;
  IF (v_tramos > 0 OR v_confirmados > 0) AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % tramos de posesión marcados a mano y % análisis con el lado del 1T confirmado. No se tocó nada (cambiar v_borrar_datos a true para borrarlos igual).',
      v_tramos, v_confirmados;
  END IF;

  DROP TABLE IF EXISTS public.analisis_posesion_tramos;
  DROP FUNCTION IF EXISTS analisis_privado.sellar_tramo_posesion();
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS direccion_confirmada;
  DROP TABLE seguridad_privado.respaldo_posesion_tramos;

  IF to_regclass('public.analisis_posesion_tramos') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'analisis_partidos' AND column_name = 'direccion_confirmada') THEN
    RAISE EXCEPTION 'La reversión no quedó completa. Se deshizo todo.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: se revirtieron los tramos de posesión y el lado confirmado.';
END
$revertir_posesion_tramos$;
