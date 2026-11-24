-- Verificación (solo lectura) de supabase/migrations/20261127120000_dibujos_clips.sql
-- Correr en el editor SQL de Supabase después de la migración. Si algo no está bien, frena con un mensaje claro.
-- No modifica nada.

DO $verificar_dibujos_clips$
DECLARE
  v_mal text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.analisis_dibujos') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla analisis_dibujos.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_dibujos'::regclass) THEN
    RAISE EXCEPTION 'La tabla no tiene la seguridad por filas activada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_dibujos'
                  AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'Falta la red sin_cuentas_jugadoras.';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_dibujos', 'SELECT') OR has_table_privilege('anon', 'public.analisis_dibujos', 'INSERT') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre los dibujos.';
  END IF;
  SELECT string_agg(policyname, ', ') INTO v_mal FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analisis_dibujos'
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Reglas que dejan escribir a otras cuentas: %.', v_mal; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_dibujos'
                  AND cmd = 'SELECT' AND qual LIKE '%puede_consultar_analisis%') THEN
    RAISE EXCEPTION 'La lectura no usa puede_consultar_analisis.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sellar_dibujo' AND tgrelid = 'public.analisis_dibujos'::regclass) THEN
    RAISE EXCEPTION 'Falta el trigger sellar_dibujo.';
  END IF;
  SELECT string_agg(d.id::text, ', ') INTO v_mal FROM public.analisis_dibujos d
    JOIN public.analisis_eventos e ON e.id = d.evento_id WHERE e.partido_id <> d.partido_id;
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Dibujos con un análisis distinto al de su acción: %.', v_mal; END IF;
  -- Con / sin dibujos en las playlists.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_playlist_clips'
                  AND column_name = 'con_dibujos' AND data_type = 'boolean' AND is_nullable = 'NO'
                  AND column_default = 'true') THEN
    RAISE EXCEPTION 'Falta la columna analisis_playlist_clips.con_dibujos (booleana, obligatoria y true por defecto).';
  END IF;
  RAISE NOTICE 'OK: dibujos de clips y permisos (% clips con dibujos; % clips de playlists sin dibujos).',
    (SELECT count(*) FROM public.analisis_dibujos),
    (SELECT count(*) FROM public.analisis_playlist_clips WHERE NOT con_dibujos);
END
$verificar_dibujos_clips$;
