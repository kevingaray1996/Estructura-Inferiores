-- Reversión de supabase/migrations/20261126120000_posesion_tramos.sql
--
-- Borra la tabla de tramos de posesión marcados a mano y su función. Lo automático (momentos colectivos) no se toca.
-- Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
-- Si ya hay tramos marcados, NO corre (para no perderlos). Para borrarlos igual, cambiar v_borrar_datos a true.

DO $revertir_posesion_tramos$
DECLARE
  v_borrar_datos constant boolean := false;
  v_tramos bigint := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_posesion_tramos') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_posesion_tramos): la migración no está aplicada. No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_posesion_tramos') IS NOT NULL THEN
    SELECT count(*) INTO v_tramos FROM public.analisis_posesion_tramos;
  END IF;
  IF v_tramos > 0 AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % tramos de posesión marcados a mano. No se tocó nada (cambiar v_borrar_datos a true para borrarlos igual).', v_tramos;
  END IF;

  DROP TABLE IF EXISTS public.analisis_posesion_tramos;
  DROP FUNCTION IF EXISTS analisis_privado.sellar_tramo_posesion();
  DROP TABLE seguridad_privado.respaldo_posesion_tramos;

  IF to_regclass('public.analisis_posesion_tramos') IS NOT NULL THEN
    RAISE EXCEPTION 'La reversión no quedó completa. Se deshizo todo.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: se revirtieron los tramos de posesión.';
END
$revertir_posesion_tramos$;
