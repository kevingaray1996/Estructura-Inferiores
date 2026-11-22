-- Verificación (solo lectura) de supabase/migrations/20261122150000_comet_partido.sql
-- Se puede correr cuantas veces se quiera: no cambia nada. Si algo no está como se espera, avisa con un error.
-- Al final muestra cuántos análisis tienen datos de COMET, cuántos PDFs hay guardados y cuántos nombres asociados.

DO $verificar_comet_partido$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos'
       AND ((column_name = 'comet' AND data_type = 'jsonb') OR (column_name = 'comet_pdf' AND data_type = 'text'))) <> 2 THEN
    RAISE EXCEPTION 'Faltan las columnas analisis_partidos.comet / comet_pdf: la migración no está aplicada.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.analisis_partidos'::regclass AND contype = 'c'
       AND conname IN ('analisis_partidos_comet_check', 'analisis_partidos_comet_pdf_check')) <> 2 THEN
    RAISE EXCEPTION 'Faltan las reglas de las columnas comet / comet_pdf.';
  END IF;
  IF to_regclass('public.analisis_comet_nombres') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.analisis_comet_nombres.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_comet_nombres'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_comet_nombres') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_comet_nombres'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'La seguridad de analisis_comet_nombres no es la esperada (RLS forzada, 5 reglas, red sin_cuentas_jugadoras).';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_comet_nombres', 'SELECT') OR has_table_privilege('anon', 'public.analisis_comet_nombres', 'INSERT')
     OR has_table_privilege('anon', 'public.analisis_partidos', 'SELECT') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre los datos de COMET.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'comet-pdf' AND NOT public
                   AND file_size_limit = 2097152 AND allowed_mime_types = ARRAY['application/pdf']) THEN
    RAISE EXCEPTION 'El bucket comet-pdf no existe o no es privado, solo PDF y de hasta 2 MB.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'comet-pdf%') <> 4 THEN
    RAISE EXCEPTION 'Faltan reglas del bucket comet-pdf (ver, subir, reemplazar, borrar).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
                  AND policyname = 'analisis_partidos_update_admin' AND cmd = 'UPDATE'
                  AND qual LIKE '%puede_administrar_analisis%' AND with_check LIKE '%puede_administrar_analisis%') THEN
    RAISE EXCEPTION 'La regla para modificar analisis_partidos no es la esperada (solo administradoras de Análisis).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_comet_partido') IS NULL THEN
    RAISE EXCEPTION 'Falta el respaldo seguridad_privado.respaldo_comet_partido (lo necesita la reversión).';
  END IF;
  RAISE NOTICE 'Verificación OK.';
END
$verificar_comet_partido$;

SELECT (SELECT count(*) FROM public.analisis_partidos WHERE comet IS NOT NULL) AS analisis_con_comet,
       (SELECT count(*) FROM storage.objects WHERE bucket_id = 'comet-pdf') AS pdfs_guardados,
       (SELECT count(*) FROM public.analisis_comet_nombres) AS nombres_asociados;
