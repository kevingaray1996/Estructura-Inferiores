-- Reversión de supabase/migrations/20261127120000_dibujos_clips.sql
--
-- Borra la tabla de dibujos de los clips y su función, y la columna analisis_playlist_clips.con_dibujos.
-- Las acciones, los clips de las playlists y todo lo demás no se tocan.
-- Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
-- Si ya hay dibujos guardados o clips marcados «sin dibujos», NO corre (para no perderlos). Para seguir igual,
-- cambiar v_borrar_datos a true.

DO $revertir_dibujos_clips$
DECLARE
  v_borrar_datos constant boolean := false;
  v_dibujos bigint := 0;
  v_sin bigint := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_dibujos_clips') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_dibujos_clips): la migración no está aplicada. No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_dibujos') IS NOT NULL THEN
    SELECT count(*) INTO v_dibujos FROM public.analisis_dibujos;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'analisis_playlist_clips' AND column_name = 'con_dibujos') THEN
    EXECUTE 'SELECT count(*) FROM public.analisis_playlist_clips WHERE NOT con_dibujos' INTO v_sin;
  END IF;
  IF (v_dibujos > 0 OR v_sin > 0) AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % clips con dibujos y % clips de playlists marcados «sin dibujos». No se tocó nada (cambiar v_borrar_datos a true para borrarlos igual).',
      v_dibujos, v_sin;
  END IF;

  DROP TABLE IF EXISTS public.analisis_dibujos;
  DROP FUNCTION IF EXISTS analisis_privado.sellar_dibujo();
  ALTER TABLE public.analisis_playlist_clips DROP COLUMN IF EXISTS con_dibujos;
  DROP TABLE seguridad_privado.respaldo_dibujos_clips;

  IF to_regclass('public.analisis_dibujos') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'analisis_playlist_clips' AND column_name = 'con_dibujos') THEN
    RAISE EXCEPTION 'La reversión no quedó completa. Se deshizo todo.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: se revirtieron los dibujos de los clips y la opción con / sin dibujos.';
END
$revertir_dibujos_clips$;
