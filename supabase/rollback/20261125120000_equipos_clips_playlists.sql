-- Reversión de supabase/migrations/20261125120000_equipos_clips_playlists.sql
--
-- Deja todo como estaba: borra las tablas de playlists, las funciones nuevas, las columnas nuevas (equipos.activo,
-- analisis_partidos.equipo_local_id / equipo_visitante_id, analisis_tipos_accion.margen_antes / margen_despues) y
-- los equipos que agregó la migración (solo los que no se usan en ningún partido del calendario; los que se usan
-- quedan y se avisan).
-- Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
--
-- Si ya hay playlists, scouting vinculados al listado, equipos marcados inactivos o márgenes cambiados a mano, NO
-- corre (para no perder datos). Para seguir igual, cambiar v_borrar_datos a true.

DO $revertir_equipos_clips_playlists$
DECLARE
  v_borrar_datos constant boolean := false;
  v_playlists bigint := 0;
  v_vinculados bigint;
  v_inactivos bigint;
  v_margenes bigint;
  v_quedan text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_clips_playlists') IS NULL
     OR to_regclass('seguridad_privado.respaldo_equipos_agregados') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_clips_playlists): la migración no está aplicada. No se tocó nada.';
  END IF;

  IF to_regclass('public.analisis_playlists') IS NOT NULL THEN
    SELECT count(*) INTO v_playlists FROM public.analisis_playlists;
  END IF;
  SELECT count(*) INTO v_vinculados FROM public.analisis_partidos WHERE equipo_local_id IS NOT NULL OR equipo_visitante_id IS NOT NULL;
  SELECT count(*) INTO v_inactivos FROM public.equipos WHERE NOT activo;
  -- Márgenes distintos de los que puso la migración (alguien los ajustó).
  SELECT count(*) INTO v_margenes FROM public.analisis_tipos_accion t
   WHERE (t.botonera = 'colectiva' AND (t.margen_antes::int, t.margen_despues::int) <> (2, 2))
      OR (t.botonera = 'individual' AND (t.margen_antes::int, t.margen_despues::int) <> CASE t.codigo
            WHEN 'Pase correcto' THEN (4, 2) WHEN 'Pase incorrecto' THEN (4, 2) WHEN 'Pérdida' THEN (5, 5)
            WHEN 'Remate' THEN (6, 3) WHEN 'Falta cometida' THEN (3, 8) WHEN 'Falta recibida' THEN (3, 8)
            WHEN 'Gol' THEN (15, 5) ELSE (4, 3) END);
  IF (v_playlists > 0 OR v_vinculados > 0 OR v_inactivos > 0 OR v_margenes > 0) AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % playlists, % scouting vinculados al listado, % equipos inactivos y % márgenes cambiados. No se tocó nada (cambiar v_borrar_datos a true para borrarlos igual).',
      v_playlists, v_vinculados, v_inactivos, v_margenes;
  END IF;

  DROP TABLE IF EXISTS public.analisis_playlist_clips;
  DROP TABLE IF EXISTS public.analisis_playlists;
  DROP FUNCTION IF EXISTS analisis_privado.sellar_clip_playlist();
  DROP FUNCTION IF EXISTS analisis_privado.sellar_playlist();
  DROP FUNCTION IF EXISTS public.puede_consultar_playlist(uuid);

  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT IF EXISTS tipos_margenes_check;
  ALTER TABLE public.analisis_tipos_accion DROP COLUMN IF EXISTS margen_despues;
  ALTER TABLE public.analisis_tipos_accion DROP COLUMN IF EXISTS margen_antes;

  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_equipos_ids_check;
  DROP INDEX IF EXISTS public.analisis_partidos_equipo_local_idx;
  DROP INDEX IF EXISTS public.analisis_partidos_equipo_visitante_idx;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS equipo_visitante_id;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS equipo_local_id;

  -- Equipos agregados por la migración: se borran los que nadie usa (el calendario puede haberlos elegido después).
  SELECT string_agg(r.nombre, ', ' ORDER BY r.nombre) INTO v_quedan FROM seguridad_privado.respaldo_equipos_agregados r
   WHERE EXISTS (SELECT 1 FROM public.partidos p WHERE p.equipo_id = r.id);
  DELETE FROM public.equipos e USING seguridad_privado.respaldo_equipos_agregados r
   WHERE e.id = r.id AND NOT EXISTS (SELECT 1 FROM public.partidos p WHERE p.equipo_id = r.id);
  ALTER TABLE public.equipos DROP COLUMN IF EXISTS activo;
  DROP FUNCTION IF EXISTS analisis_privado.nombre_equipo_normalizado(text);

  DROP TABLE seguridad_privado.respaldo_equipos_agregados;
  DROP TABLE seguridad_privado.respaldo_clips_playlists;

  -- Verificación.
  IF to_regclass('public.analisis_playlists') IS NOT NULL OR to_regclass('public.analisis_playlist_clips') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND ((table_name = 'equipos' AND column_name = 'activo')
                   OR (table_name = 'analisis_partidos' AND column_name IN ('equipo_local_id', 'equipo_visitante_id'))
                   OR (table_name = 'analisis_tipos_accion' AND column_name IN ('margen_antes', 'margen_despues')))) THEN
    RAISE EXCEPTION 'La reversión no quedó completa. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  IF v_quedan IS NOT NULL THEN
    RAISE NOTICE 'Quedan en el listado (ya los usa algún partido del calendario): %', v_quedan;
  END IF;
  RAISE NOTICE 'Listo: se revirtieron equipos, clips y playlists de la etapa 2.';
END
$revertir_equipos_clips_playlists$;
