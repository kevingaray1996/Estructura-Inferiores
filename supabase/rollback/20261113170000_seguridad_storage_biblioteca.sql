-- Reversión de Seguridad Storage: devuelve exactamente las políticas de Storage y la configuración del bucket
-- Biblioteca guardadas en seguridad_privado.respaldo_storage.
-- OJO: vuelve a dejar que cualquier usuario logueado liste, reemplace y borre cualquier archivo (incluido el escudo).
-- El código nuevo (upsert: false, carpetas propias) sigue funcionando igual después de revertir.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor SQL de Supabase ejecute
-- las sentencias por separado. Correr como postgres. Si algo no coincide, no se revierte nada.

DO $reversion_storage$
DECLARE
  hay boolean;
  r record;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_storage') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo de Storage: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_storage)' INTO hay;
  IF NOT hay THEN
    RAISE EXCEPTION 'El respaldo de Storage está vacío: no hay nada que revertir.';
  END IF;

  -- Políticas: se borran las actuales de Storage y se recrean las del respaldo.
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'storage' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT detalle FROM seguridad_privado.respaldo_storage WHERE tipo = 'politica' ORDER BY orden LOOP
    EXECUTE r.detalle;
  END LOOP;

  -- Bucket.
  UPDATE storage.buckets b
  SET public = s.publico, file_size_limit = s.limite_bytes, allowed_mime_types = s.tipos_permitidos
  FROM seguridad_privado.respaldo_storage s
  WHERE s.tipo = 'bucket' AND b.id = s.objeto;

  -- Verificación: mismas políticas (nombre y sentencia) y mismo bucket que en el respaldo.
  IF EXISTS (
    (SELECT detalle FROM seguridad_privado.respaldo_storage WHERE tipo = 'politica'
     EXCEPT
     SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
              policyname, schemaname, tablename, permissive, cmd,
              (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
              CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
              CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
     FROM pg_policies WHERE schemaname = 'storage')
    UNION ALL
    (SELECT format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
              policyname, schemaname, tablename, permissive, cmd,
              (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
              CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
              CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
     FROM pg_policies WHERE schemaname = 'storage'
     EXCEPT
     SELECT detalle FROM seguridad_privado.respaldo_storage WHERE tipo = 'politica')) THEN
    RAISE EXCEPTION 'Las políticas de Storage no quedaron iguales al respaldo. No se revierte nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM seguridad_privado.respaldo_storage s
             LEFT JOIN storage.buckets b ON b.id = s.objeto
             WHERE s.tipo = 'bucket'
               AND (b.id IS NULL OR b.public IS DISTINCT FROM s.publico OR b.file_size_limit IS DISTINCT FROM s.limite_bytes
                    OR b.allowed_mime_types IS DISTINCT FROM s.tipos_permitidos)) THEN
    RAISE EXCEPTION 'El bucket no quedó igual al respaldo. No se revierte nada.';
  END IF;

  -- Se vacía el respaldo para poder volver a aplicar el cambio si hace falta.
  DELETE FROM seguridad_privado.respaldo_storage;
END
$reversion_storage$;

SELECT 'politica' AS que, policyname AS nombre, cmd AS detalle FROM pg_policies WHERE schemaname = 'storage'
UNION ALL
SELECT 'bucket', id, format('publico=%s, limite=%s, tipos=%s', public, file_size_limit, allowed_mime_types)
FROM storage.buckets WHERE id = 'Biblioteca';
