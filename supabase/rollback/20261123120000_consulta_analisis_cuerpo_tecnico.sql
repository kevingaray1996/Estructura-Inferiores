-- Reversión de supabase/migrations/20261123120000_consulta_analisis_cuerpo_tecnico.sql
--
-- Deja las reglas de lectura de analisis_partidos y analisis_eventos exactamente como estaban (texto guardado en el
-- respaldo), borra la función puede_consultar_analisis y la columna analisis_eventos.segundo_fin, y por último el
-- respaldo. Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
--
-- Si alguna acción ya tiene segundo_fin cargado, NO corre (para no perder datos). Para borrarlos igual, cambiar
-- v_borrar_datos a true.

DO $revertir_consulta_analisis$
DECLARE
  v_borrar_datos constant boolean := false;
  v_qual text;
  v_con_fin bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_consulta_analisis') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_consulta_analisis): la migración no está aplicada. No se tocó nada.';
  END IF;

  SELECT count(*) INTO v_con_fin FROM public.analisis_eventos WHERE segundo_fin IS NOT NULL;
  IF v_con_fin > 0 AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % acciones con segundo_fin cargado. No se tocó nada (cambiar v_borrar_datos a true para borrarlo igual).', v_con_fin;
  END IF;

  -- Reglas de lectura como estaban.
  SELECT definicion INTO v_qual FROM seguridad_privado.respaldo_consulta_analisis WHERE tipo = 'regla' AND nombre = 'analisis_partidos_read';
  IF v_qual IS NULL THEN RAISE EXCEPTION 'Falta en el respaldo la regla analisis_partidos_read. No se tocó nada.'; END IF;
  EXECUTE format('ALTER POLICY analisis_partidos_read ON public.analisis_partidos USING (%s)', v_qual);
  SELECT definicion INTO v_qual FROM seguridad_privado.respaldo_consulta_analisis WHERE tipo = 'regla' AND nombre = 'analisis_eventos_read';
  IF v_qual IS NULL THEN RAISE EXCEPTION 'Falta en el respaldo la regla analisis_eventos_read. Se deshizo todo.'; END IF;
  EXECUTE format('ALTER POLICY analisis_eventos_read ON public.analisis_eventos USING (%s)', v_qual);

  DROP FUNCTION IF EXISTS public.puede_consultar_analisis(uuid);
  ALTER TABLE public.analisis_eventos DROP CONSTRAINT IF EXISTS analisis_eventos_segundo_fin_check;
  ALTER TABLE public.analisis_eventos DROP COLUMN IF EXISTS segundo_fin;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analisis_partidos', 'analisis_eventos')
              AND qual LIKE '%puede_consultar_analisis%') THEN
    RAISE EXCEPTION 'Alguna regla sigue usando puede_consultar_analisis. Se deshizo todo.';
  END IF;

  DROP TABLE seguridad_privado.respaldo_consulta_analisis;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Revertido: Análisis vuelve a ser visible como antes y ya no existe segundo_fin.';
END
$revertir_consulta_analisis$;
