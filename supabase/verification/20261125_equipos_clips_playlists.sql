-- Verificación (solo lectura) de supabase/migrations/20261125120000_equipos_clips_playlists.sql
-- Correr en el editor SQL de Supabase después de la migración. Si algo no está bien, frena con un mensaje claro.
-- No modifica nada.

DO $verificar_equipos_clips_playlists$
DECLARE
  v_escritura text;
  v_mal text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
       AND ((table_name = 'equipos' AND column_name = 'activo')
         OR (table_name = 'analisis_partidos' AND column_name IN ('equipo_local_id', 'equipo_visitante_id'))
         OR (table_name = 'analisis_tipos_accion' AND column_name IN ('margen_antes', 'margen_despues')))) <> 5 THEN
    RAISE EXCEPTION 'Faltan columnas nuevas (equipos.activo, equipo_local_id, equipo_visitante_id, margen_antes, margen_despues).';
  END IF;
  IF to_regclass('public.analisis_playlists') IS NULL OR to_regclass('public.analisis_playlist_clips') IS NULL THEN
    RAISE EXCEPTION 'Faltan las tablas analisis_playlists o analisis_playlist_clips.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_playlists'::regclass)
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_playlist_clips'::regclass) THEN
    RAISE EXCEPTION 'Las tablas de playlists no tienen la seguridad por filas activada y forzada.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analisis_playlists', 'analisis_playlist_clips')
        AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') <> 2 THEN
    RAISE EXCEPTION 'Falta la red sin_cuentas_jugadoras en las tablas de playlists.';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_playlists', 'SELECT') OR has_table_privilege('anon', 'public.analisis_playlist_clips', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_playlists', 'INSERT') OR has_table_privilege('anon', 'public.analisis_playlist_clips', 'INSERT')
     OR has_function_privilege('anon', 'public.puede_consultar_playlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre las playlists.';
  END IF;
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_partido_eventos', 'analisis_pases_detalle',
                       'analisis_tipos_accion', 'analisis_comet_nombres', 'analisis_playlists', 'analisis_playlist_clips')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reglas que dejan escribir en Análisis a otras cuentas: %.', v_escritura;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_playlists'
                  AND cmd = 'SELECT' AND qual LIKE '%puede_consultar_playlist%') THEN
    RAISE EXCEPTION 'La lectura de playlists no usa puede_consultar_playlist.';
  END IF;
  SELECT string_agg(codigo, ', ') INTO v_mal FROM public.analisis_tipos_accion
   WHERE margen_antes NOT BETWEEN 0 AND 60 OR margen_despues NOT BETWEEN 0 AND 60;
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Márgenes fuera de rango: %.', v_mal; END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_partidos WHERE tipo_partido <> 'scouting'
              AND (equipo_local_id IS NOT NULL OR equipo_visitante_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Hay análisis propios con equipos del listado cargados (solo van en scouting).';
  END IF;
  RAISE NOTICE 'OK: equipos, márgenes de clips, playlists y permisos.';
END
$verificar_equipos_clips_playlists$;
