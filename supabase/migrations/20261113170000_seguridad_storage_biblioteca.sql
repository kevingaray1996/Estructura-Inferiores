-- Seguridad Storage: bucket Biblioteca.
--
-- Correr SOLO cuando producción ya tenga el código nuevo (upsert: false, carpetas entrenamientos/ y videos/).
-- Antes de eso, las imágenes de ejercicios y de video se suben a la raíz y quedarían bloqueadas.
--
-- Hoy: cualquier usuario logueado puede listar, subir, reemplazar y borrar cualquier archivo (incluido el escudo).
-- Después:
--   - Ver por link público: igual que hoy (Wellness sin login, escudo en los PDF).
--   - Listar por la API: nadie.
--   - Subir (solo archivos nuevos, en una carpeta y sin subcarpetas):
--       jugadores/, escudos/, entrenamientos/, videos/  → coordinación y cuerpo técnico
--       staff/                                         → solo coordinación
--   - Reemplazar y borrar: nadie desde la app (se hace desde el panel de Supabase si hace falta).
--   - El bucket solo acepta imágenes, de hasta 5 MB.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor separe las sentencias.
-- Guarda un respaldo exacto en seguridad_privado.respaldo_storage, verifica al final simulando cada rol con
-- usuarios reales (las subidas de prueba se deshacen) y, si algo falla, no se aplica nada.
--
-- Reversión: supabase/rollback/20261113170000_seguridad_storage_biblioteca.sql

DO $storage$
DECLARE
  ya_aplicado boolean;
  r record;
  t record;
  n bigint;
  v_coord text;
  v_tecnico text;
  v_pf text;
  v_medico text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- Controles previos.
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regprocedure('public.mi_rol()') IS NULL THEN
    RAISE EXCEPTION 'No existe public.mi_rol(). No continuar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'Biblioteca' AND public) THEN
    RAISE EXCEPTION 'No existe el bucket Biblioteca público. Revisar antes de seguir.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_storage') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_storage)' INTO ya_aplicado;
    IF ya_aplicado THEN
      RAISE EXCEPTION 'El cambio de Storage ya se aplicó (hay respaldo guardado).';
    END IF;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage') <> 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname IN ('Biblioteca select autenticados', 'Biblioteca insert autenticados',
                              'Biblioteca update autenticados', 'Biblioteca delete autenticados')) <> 4 THEN
    RAISE EXCEPTION 'Las políticas de Storage no son las 4 auditadas. Revisar antes de seguir.';
  END IF;

  -- Usuarios reales para la prueba final (uno por rol; solo coordinación es obligatorio).
  SELECT email INTO v_coord FROM public.perfiles WHERE rol::text = 'coordinacion' ORDER BY email LIMIT 1;
  SELECT email INTO v_tecnico FROM public.perfiles WHERE rol::text = 'tecnico' ORDER BY email LIMIT 1;
  SELECT email INTO v_pf FROM public.perfiles WHERE rol::text = 'preparador_fisico' ORDER BY email LIMIT 1;
  SELECT email INTO v_medico FROM public.perfiles WHERE rol::text = 'medico' ORDER BY email LIMIT 1;
  IF v_coord IS NULL THEN
    RAISE EXCEPTION 'No hay ningún perfil de coordinación para probar.';
  END IF;

  -- 1) Respaldo exacto (privado).
  CREATE SCHEMA IF NOT EXISTS seguridad_privado;
  REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated;
  CREATE TABLE IF NOT EXISTS seguridad_privado.respaldo_storage (
    orden integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('politica', 'bucket')),
    objeto text NOT NULL,
    detalle text,
    publico boolean,
    limite_bytes bigint,
    tipos_permitidos text[],
    guardado_en timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_storage FROM PUBLIC, anon, authenticated;

  INSERT INTO seguridad_privado.respaldo_storage (tipo, objeto, detalle)
  SELECT 'politica', format('%I.%I', schemaname, tablename),
         format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
           policyname, schemaname, tablename, permissive, cmd,
           (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
           CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
           CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
  FROM pg_policies WHERE schemaname = 'storage'
  ORDER BY tablename, policyname;

  INSERT INTO seguridad_privado.respaldo_storage (tipo, objeto, publico, limite_bytes, tipos_permitidos)
  SELECT 'bucket', id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'Biblioteca';

  -- 2) Fuera las 4 políticas amplias.
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'storage' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- 3) Única política: subir archivos nuevos, en la carpeta que corresponde a cada rol.
  --    Sin políticas de SELECT, UPDATE ni DELETE: nadie lista, reemplaza ni borra por la API.
  CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));

  -- 4) Solo imágenes, hasta 5 MB. Sigue público para leer por link.
  UPDATE storage.buckets SET file_size_limit = 5242880, allowed_mime_types = ARRAY['image/*']
  WHERE id = 'Biblioteca';

  -- 5a) Verificación de la configuración.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                      AND policyname = 'Biblioteca subir segun rol' AND cmd = 'INSERT' AND roles = '{authenticated}') THEN
    RAISE EXCEPTION 'Las políticas de Storage no quedaron como se esperaba. No se aplica nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'Biblioteca' AND public
                   AND file_size_limit = 5242880 AND allowed_mime_types = ARRAY['image/*']) THEN
    RAISE EXCEPTION 'El bucket Biblioteca no quedó como se esperaba. No se aplica nada.';
  END IF;

  -- 5b) Prueba con usuarios reales de cada rol. Todo lo que se escribe acá se deshace.
  --     espera: 'sube' (tiene que poder), 'rechazo' (permission denied) o 'cero' (no ve ni toca ninguna fila).
  FOR t IN
    SELECT * FROM (VALUES
      ('coordinación', 'authenticated', v_coord, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''escudos/prueba-seguridad.png'')'),
      ('coordinación', 'authenticated', v_coord, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''entrenamientos/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''videos/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''staff/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''institucional/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/otra/prueba-seguridad.jpg'')'),
      ('coordinación', 'authenticated', v_coord, 'cero',    'SELECT 1 FROM storage.objects WHERE bucket_id = ''Biblioteca'''),
      ('coordinación', 'authenticated', v_coord, 'cero',    'UPDATE storage.objects SET metadata = metadata WHERE bucket_id = ''Biblioteca'''),
      ('coordinación', 'authenticated', v_coord, 'cero',    'DELETE FROM storage.objects WHERE bucket_id = ''Biblioteca'' AND name = ''escudos/Escudo simplificado.png'''),
      ('técnico',      'authenticated', v_tecnico, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('técnico',      'authenticated', v_tecnico, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''escudos/prueba-seguridad.png'')'),
      ('técnico',      'authenticated', v_tecnico, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''entrenamientos/prueba-seguridad.jpg'')'),
      ('técnico',      'authenticated', v_tecnico, 'sube',    'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''videos/prueba-seguridad.jpg'')'),
      ('técnico',      'authenticated', v_tecnico, 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''staff/prueba-seguridad.jpg'')'),
      ('técnico',      'authenticated', v_tecnico, 'cero',    'SELECT 1 FROM storage.objects WHERE bucket_id = ''Biblioteca'''),
      ('técnico',      'authenticated', v_tecnico, 'cero',    'UPDATE storage.objects SET metadata = metadata WHERE bucket_id = ''Biblioteca'''),
      ('técnico',      'authenticated', v_tecnico, 'cero',    'DELETE FROM storage.objects WHERE bucket_id = ''Biblioteca'' AND name = ''escudos/Escudo simplificado.png'''),
      ('PF',           'authenticated', v_pf,     'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('médico',       'authenticated', v_medico, 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('sin perfil',   'authenticated', 'sin-perfil@prueba.invalid', 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('sin login',    'anon',          '',       'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''jugadores/prueba-seguridad.jpg'')'),
      ('sin login',    'anon',          '',       'cero',    'SELECT 1 FROM storage.objects WHERE bucket_id = ''Biblioteca''')
    ) AS v(quien, rol_db, email, espera, sentencia)
  LOOP
    IF t.email IS NULL THEN
      RAISE NOTICE 'Sin usuario de % para probar: se saltea "%".', t.quien, t.sentencia;
      CONTINUE;
    END IF;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        CASE WHEN t.email = '' THEN '{"role":"anon"}' ELSE json_build_object('email', t.email, 'role', 'authenticated')::text END, true);
      EXECUTE format('SET LOCAL ROLE %I', t.rol_db);
      EXECUTE t.sentencia;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF t.espera = 'rechazo' THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % pudo hacer: %', t.quien, t.sentencia;
      ELSIF t.espera = 'cero' AND n <> 0 THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % alcanzó % filas con: %', t.quien, n, t.sentencia;
      END IF;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF t.espera <> 'rechazo' THEN
          RAISE EXCEPTION 'PRUEBA_FALLIDA: % no pudo hacer: % (%)', t.quien, t.sentencia, SQLERRM;
        END IF;
      WHEN OTHERS THEN
        IF SQLERRM = 'DESHACER_PRUEBA' THEN
          NULL;
        ELSIF SQLERRM LIKE 'PRUEBA_FALLIDA%' THEN
          RAISE;
        ELSIF t.espera = 'cero' AND t.sentencia LIKE 'DELETE%' THEN
          NULL; -- Storage bloquea borrar por SQL con su propio trigger: también cuenta como "no borró".
        ELSE
          RAISE EXCEPTION 'Prueba de % con "%": error inesperado: %', t.quien, t.sentencia, SQLERRM;
        END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'Biblioteca' AND name = 'escudos/Escudo simplificado.png') THEN
    RAISE EXCEPTION 'El escudo del club no está. No se aplica nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'Biblioteca' AND name LIKE '%prueba-seguridad%') THEN
    RAISE EXCEPTION 'Quedaron archivos de prueba. No se aplica nada.';
  END IF;
END
$storage$;

-- Resultado: tiene que mostrar una sola política (INSERT) y el bucket público, con 5 MB e image/*.
SELECT 'politica' AS que, policyname AS nombre, cmd AS detalle FROM pg_policies WHERE schemaname = 'storage'
UNION ALL
SELECT 'bucket', id, format('publico=%s, limite=%s, tipos=%s', public, file_size_limit, allowed_mime_types)
FROM storage.buckets WHERE id = 'Biblioteca';
