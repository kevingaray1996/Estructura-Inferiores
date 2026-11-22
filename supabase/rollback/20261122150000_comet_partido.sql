-- Reversión de supabase/migrations/20261122150000_comet_partido.sql
--
-- Borra exactamente lo que creó la migración (anotado en seguridad_privado.respaldo_comet_partido): las columnas
-- analisis_partidos.comet y comet_pdf, la tabla analisis_comet_nombres, las 4 reglas del bucket comet-pdf y el bucket.
-- No toca nada más.
--
-- No corre si:
--   - hay PDFs guardados en el bucket comet-pdf: Storage no deja borrarlos por SQL. Borralos antes desde el panel de
--     Supabase (Storage → comet-pdf) y volvé a correr esto;
--   - hay datos de COMET o nombres asociados guardados: se perderían. Para revertir igual, cambiar v_borrar_datos a
--     true (esos datos se pierden).
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase).

DO $revertir_comet_partido$
DECLARE
  v_borrar_datos constant boolean := false;
  v_n bigint;
  v_m bigint;
  v_bucket text := 'borrado';
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_comet_partido') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo: la migración no está aplicada o ya se revirtió. No se tocó nada.';
  END IF;
  IF (SELECT count(*) FROM seguridad_privado.respaldo_comet_partido) <> 8
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_comet_partido WHERE tipo = 'tabla' AND nombre = 'public.analisis_comet_nombres')
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_comet_partido WHERE tipo = 'bucket' AND nombre = 'comet-pdf') THEN
    RAISE EXCEPTION 'El respaldo no es el esperado. No se tocó nada.';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'comet-pdf') THEN
    RAISE EXCEPTION 'Hay PDFs de COMET guardados. Borralos desde el panel de Supabase (Storage → comet-pdf) y volvé a correr esto. No se tocó nada.';
  END IF;
  v_n := 0; v_m := 0;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos' AND column_name = 'comet') THEN
    EXECUTE 'SELECT count(*) FROM public.analisis_partidos WHERE comet IS NOT NULL OR comet_pdf IS NOT NULL' INTO v_n;
  END IF;
  IF to_regclass('public.analisis_comet_nombres') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.analisis_comet_nombres' INTO v_m;
  END IF;
  IF (v_n > 0 OR v_m > 0) AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % análisis con datos de COMET y % nombres asociados. No se tocó nada (ver v_borrar_datos al principio).', v_n, v_m;
  END IF;

  DROP POLICY IF EXISTS "comet-pdf ver" ON storage.objects;
  DROP POLICY IF EXISTS "comet-pdf subir" ON storage.objects;
  DROP POLICY IF EXISTS "comet-pdf reemplazar" ON storage.objects;
  DROP POLICY IF EXISTS "comet-pdf borrar" ON storage.objects;
  -- El bucket está vacío. Algunas versiones de Storage piden permiso explícito para borrar por SQL; si igual no deja,
  -- se avisa y se borra a mano desde el panel (no afecta al resto de la reversión).
  BEGIN
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.buckets WHERE id = 'comet-pdf';
  EXCEPTION WHEN OTHERS THEN
    v_bucket := 'no se pudo borrar por SQL: borralo desde el panel (Storage → comet-pdf → Delete bucket)';
  END;

  DROP TABLE IF EXISTS public.analisis_comet_nombres;
  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_comet_check;
  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_comet_pdf_check;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS comet;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS comet_pdf;
  DROP TABLE seguridad_privado.respaldo_comet_partido;

  IF to_regclass('public.analisis_comet_nombres') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos'
                 AND column_name IN ('comet', 'comet_pdf'))
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'comet-pdf%') THEN
    RAISE EXCEPTION 'No se pudo borrar todo. Se deshizo la reversión.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Revertido: columnas, tabla y reglas de COMET borradas. Bucket comet-pdf: %.', v_bucket;
END
$revertir_comet_partido$;
