-- Importar el PDF de COMET (informe oficial de la AFA) en Análisis.
--
-- Qué guarda:
--   - En cada análisis (public.analisis_partidos), dos columnas nuevas, vacías hasta la primera importación:
--       comet      (jsonb): lo leído de COMET y confirmado por el analista: torneo, fecha, hora, estadio, resultado,
--                  árbitra, asistentes y cuarta árbitra, las alineaciones de los dos equipos, los cambios y las
--                  tarjetas (con motivo) del rival. Nunca los datos de las médicas ni de quién imprimió el PDF.
--       comet_pdf  (text): dónde quedó guardado el PDF original («<id del análisis>/comet.pdf»).
--   - public.analisis_comet_nombres: qué nombre de COMET («APELLIDO, NOMBRES», en mayúsculas) corresponde a cada
--     jugadora nuestra. Se confirma la primera vez y queda guardado para los partidos siguientes.
--   - Un lugar privado de Storage («comet-pdf») para el PDF original, de respaldo.
--
-- Qué hace, en un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase):
--   1. Revisa los requisitos y que no esté aplicada.
--   2. Respaldo: no se modifica ni se borra nada existente. En seguridad_privado.respaldo_comet_partido se anota lo
--      que se crea, para que la reversión borre exactamente eso.
--   3. Agrega las dos columnas con sus reglas (comet: un objeto de hasta 60000 caracteres; comet_pdf: la ruta del
--      PDF dentro de la carpeta del mismo análisis). Las columnas quedan con las reglas de acceso que ya tiene
--      analisis_partidos: las ven quienes ven ese partido analizado y las guardan solo las administradoras de Análisis.
--   4. Crea analisis_comet_nombres:
--        - VER: las administradoras de Análisis y cualquier persona del staff (con perfil).
--        - CARGAR, CAMBIAR Y BORRAR: solo las administradoras de Análisis.
--        - Cuentas de jugadoras: nada (red RESTRICTIVE «sin_cuentas_jugadoras»). anon: ningún permiso. RLS forzada.
--   5. Crea el bucket privado «comet-pdf» (solo PDF, hasta 2 MB) y sus reglas:
--        - SUBIR, REEMPLAZAR Y BORRAR: solo las administradoras de Análisis, en la carpeta de un análisis que exista.
--        - VER: el staff que ve ese partido analizado (la misma regla de analisis_partidos). Cuentas de jugadoras: nunca.
--        - Nadie lo ve por link público.
--   6. Verifica todo, con datos de prueba que se deshacen: la administradora guarda un nombre, los datos de COMET y
--      el PDF; otra persona del staff (si hay) ve los nombres pero no carga nada; anon no tiene permisos.
--   7. Avisa a la API (PostgREST) que recargue el esquema.
--
-- Bloqueos: agregar columnas vacías y crear la clave foránea hacia jugadores necesita bloqueos cortos. Cada uno espera
-- como máximo 5 s: si una tabla está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261122150000_comet_partido.sql
-- Verificación posterior (solo lectura): supabase/verification/20261122_comet_partido.sql

DO $comet_partido$
DECLARE
  r record;
  v_admin uuid; v_admin_email text;
  v_otro uuid; v_otro_email text;
  v_analisis uuid; v_jugadora uuid;
  v_reglas text;
  v_n integer;
  v_admin_res text := 'sin correr';
  v_otro_res text := 'sin correr';
  v_rechazo text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_partidos') IS NULL OR to_regclass('public.jugadores') IS NULL
     OR to_regclass('public.perfiles') IS NULL OR to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL OR to_regprocedure('public.mi_rol()') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL OR to_regnamespace('seguridad_privado') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (Análisis, Storage o la etapa 1 de cuentas de jugadoras). No se tocó nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_comet_partido') IS NOT NULL
     OR to_regclass('public.analisis_comet_nombres') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos'
                 AND column_name IN ('comet', 'comet_pdf'))
     OR EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'comet-pdf')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'comet-pdf%') THEN
    RAISE EXCEPTION 'Ya está aplicada (existe una columna, la tabla, el bucket o el respaldo). No se tocó nada.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos'
       AND policyname = 'analisis_partidos_update_admin' AND cmd = 'UPDATE'
       AND qual LIKE '%puede_administrar_analisis%' AND with_check LIKE '%puede_administrar_analisis%') <> 1 THEN
    RAISE EXCEPTION 'La regla para modificar analisis_partidos no es la esperada (solo administradoras de Análisis). No se tocó nada.';
  END IF;

  -- Reglas de acceso de analisis_partidos antes del cambio (al final tienen que ser las mismas).
  SELECT string_agg(policyname || ':' || cmd || ':' || permissive || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY policyname)
    INTO v_reglas FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos';

  -- Una cuenta administradora de Análisis y alguien del staff que no lo sea (si hay), para probar.
  FOR r IN SELECT u.id, u.email FROM auth.users u JOIN public.perfiles p ON lower(p.email) = lower(u.email) ORDER BY u.email LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.id, 'email', r.email, 'role', 'authenticated')::text, true);
    IF public.puede_administrar_analisis() THEN
      IF v_admin IS NULL THEN v_admin := r.id; v_admin_email := r.email; END IF;
    ELSIF v_otro IS NULL THEN
      v_otro := r.id; v_otro_email := r.email;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No se encontró una cuenta administradora de Análisis para probar. No se tocó nada.'; END IF;
  SELECT id INTO v_analisis FROM public.analisis_partidos ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_jugadora FROM public.jugadores ORDER BY id LIMIT 1;

  -- 2) Respaldo: lo que se crea.
  CREATE TABLE seguridad_privado.respaldo_comet_partido (tipo text NOT NULL, nombre text NOT NULL, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_comet_partido FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO seguridad_privado.respaldo_comet_partido VALUES
    ('columna', 'public.analisis_partidos.comet'),
    ('columna', 'public.analisis_partidos.comet_pdf'),
    ('tabla', 'public.analisis_comet_nombres'),
    ('bucket', 'comet-pdf'),
    ('politica', 'comet-pdf ver'),
    ('politica', 'comet-pdf subir'),
    ('politica', 'comet-pdf reemplazar'),
    ('politica', 'comet-pdf borrar');

  -- 3) Columnas del análisis.
  ALTER TABLE public.analisis_partidos ADD COLUMN comet jsonb;
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_comet_check
    CHECK (comet IS NULL OR (jsonb_typeof(comet) = 'object' AND length(comet::text) <= 60000));
  ALTER TABLE public.analisis_partidos ADD COLUMN comet_pdf text;
  -- La ruta tiene que estar en la carpeta del mismo análisis: «<id>/comet.pdf».
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_comet_pdf_check
    CHECK (comet_pdf IS NULL OR comet_pdf = id::text || '/comet.pdf');
  COMMENT ON COLUMN public.analisis_partidos.comet IS
    'Datos del informe oficial de COMET (AFA) confirmados por el analista: oficiales, alineaciones, cambios y tarjetas del rival. Sin datos de médicas ni de quién imprimió.';
  COMMENT ON COLUMN public.analisis_partidos.comet_pdf IS 'Ruta del PDF original de COMET en el bucket privado comet-pdf.';

  -- 4) Nombres de COMET → jugadoras.
  CREATE TABLE public.analisis_comet_nombres (
    nombre_comet text PRIMARY KEY,
    jugador_id uuid NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    creado_por uuid DEFAULT auth.uid(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT analisis_comet_nombres_nombre_check
      CHECK (char_length(nombre_comet) BETWEEN 3 AND 120 AND nombre_comet = upper(btrim(nombre_comet)))
  );
  COMMENT ON TABLE public.analisis_comet_nombres IS
    'Análisis: nombre de una jugadora en COMET («APELLIDO, NOMBRES», en mayúsculas y sin acentos) y a qué jugadora nuestra corresponde.';
  CREATE INDEX analisis_comet_nombres_jugadora_idx ON public.analisis_comet_nombres (jugador_id);
  ALTER TABLE public.analisis_comet_nombres ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_comet_nombres FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.analisis_comet_nombres FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analisis_comet_nombres TO authenticated;
  GRANT ALL ON TABLE public.analisis_comet_nombres TO service_role;
  CREATE POLICY comet_nombres_lectura ON public.analisis_comet_nombres AS PERMISSIVE FOR SELECT TO authenticated
    USING ((SELECT public.puede_administrar_analisis()) OR (SELECT public.mi_rol()) IS NOT NULL);
  CREATE POLICY comet_nombres_alta ON public.analisis_comet_nombres AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY comet_nombres_edicion ON public.analisis_comet_nombres AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY comet_nombres_baja ON public.analisis_comet_nombres AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_comet_nombres AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  -- 5) Bucket privado del PDF original y sus reglas. La carpeta es el id del análisis.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('comet-pdf', 'comet-pdf', false, 2097152, ARRAY['application/pdf']);
  CREATE POLICY "comet-pdf ver" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
    USING (bucket_id = 'comet-pdf' AND NOT (SELECT portal_privado.es_cuenta_jugadora())
      AND EXISTS (SELECT 1 FROM public.analisis_partidos a WHERE a.id::text = split_part(name, '/', 1)));
  CREATE POLICY "comet-pdf subir" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'comet-pdf' AND (SELECT public.puede_administrar_analisis())
      AND name ~ '^[0-9a-f-]{36}/comet\.pdf$'
      AND EXISTS (SELECT 1 FROM public.analisis_partidos a WHERE a.id::text = split_part(name, '/', 1)));
  CREATE POLICY "comet-pdf reemplazar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
    USING (bucket_id = 'comet-pdf' AND (SELECT public.puede_administrar_analisis()))
    WITH CHECK (bucket_id = 'comet-pdf' AND (SELECT public.puede_administrar_analisis())
      AND name ~ '^[0-9a-f-]{36}/comet\.pdf$'
      AND EXISTS (SELECT 1 FROM public.analisis_partidos a WHERE a.id::text = split_part(name, '/', 1)));
  CREATE POLICY "comet-pdf borrar" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
    USING (bucket_id = 'comet-pdf' AND (SELECT public.puede_administrar_analisis()));

  -- 6) Verificación de la estructura.
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos'
       AND ((column_name = 'comet' AND data_type = 'jsonb') OR (column_name = 'comet_pdf' AND data_type = 'text'))) <> 2 THEN
    RAISE EXCEPTION 'Las columnas comet / comet_pdf no quedaron como se esperaba. Se deshizo todo.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_comet_nombres'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_comet_nombres') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_comet_nombres'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE')
     OR has_table_privilege('anon', 'public.analisis_comet_nombres', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_comet_nombres', 'INSERT') THEN
    RAISE EXCEPTION 'La seguridad de analisis_comet_nombres no quedó como se esperaba. Se deshizo todo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'comet-pdf' AND NOT public
                   AND file_size_limit = 2097152 AND allowed_mime_types = ARRAY['application/pdf'])
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'comet-pdf%') <> 4 THEN
    RAISE EXCEPTION 'El bucket comet-pdf o sus reglas no quedaron como se esperaba. Se deshizo todo.';
  END IF;
  IF (SELECT string_agg(policyname || ':' || cmd || ':' || permissive || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partidos') IS DISTINCT FROM v_reglas THEN
    RAISE EXCEPTION 'Las reglas de acceso de analisis_partidos cambiaron. Se deshizo todo.';
  END IF;

  -- Prueba de uso, con datos que se deshacen al final.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'email', v_admin_email, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_admin_res := 'ok';
    IF v_jugadora IS NOT NULL THEN
      INSERT INTO public.analisis_comet_nombres (nombre_comet, jugador_id) VALUES ('PRUEBA, COMET (SE DESHACE)', v_jugadora);
      IF (SELECT count(*) FROM public.analisis_comet_nombres WHERE nombre_comet = 'PRUEBA, COMET (SE DESHACE)') <> 1 THEN
        v_admin_res := 'no ve el nombre que guardó';
      END IF;
      BEGIN
        INSERT INTO public.analisis_comet_nombres (nombre_comet, jugador_id) VALUES ('prueba minúscula', v_jugadora);
        v_admin_res := 'aceptó un nombre en minúsculas';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
    END IF;
    IF v_admin_res = 'ok' AND v_analisis IS NOT NULL THEN
      UPDATE public.analisis_partidos SET comet = '{"arbitra":"Prueba"}'::jsonb, comet_pdf = v_analisis::text || '/comet.pdf' WHERE id = v_analisis;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN v_admin_res := 'no pudo guardar los datos de COMET'; END IF;
      BEGIN
        UPDATE public.analisis_partidos SET comet_pdf = 'otro/comet.pdf' WHERE id = v_analisis;
        v_admin_res := 'aceptó una ruta de PDF de otra carpeta';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      IF v_admin_res = 'ok' THEN
        INSERT INTO storage.objects (bucket_id, name) VALUES ('comet-pdf', v_analisis::text || '/comet.pdf');
        IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'comet-pdf') <> 1 THEN v_admin_res := 'no ve el PDF que subió'; END IF;
        BEGIN
          INSERT INTO storage.objects (bucket_id, name) VALUES ('comet-pdf', 'suelto.pdf');
          v_admin_res := 'subió un PDF fuera de la carpeta de un análisis';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END IF;
    END IF;

    -- Otra persona del staff: ve los nombres; no carga nombres ni PDF.
    IF v_otro IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_otro, 'email', v_otro_email, 'role', 'authenticated')::text, true);
      v_otro_res := 'ok';
      IF v_jugadora IS NOT NULL AND (SELECT count(*) FROM public.analisis_comet_nombres WHERE nombre_comet = 'PRUEBA, COMET (SE DESHACE)') <> 1 THEN
        v_otro_res := 'no ve los nombres';
      END IF;
      IF v_otro_res = 'ok' AND v_jugadora IS NOT NULL THEN
        BEGIN
          INSERT INTO public.analisis_comet_nombres (nombre_comet, jugador_id) VALUES ('PRUEBA, OTRA', v_jugadora);
          v_otro_res := 'pudo cargar un nombre';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END IF;
      IF v_otro_res = 'ok' AND v_analisis IS NOT NULL THEN
        BEGIN
          INSERT INTO storage.objects (bucket_id, name) VALUES ('comet-pdf', v_analisis::text || '/comet.pdf');
          v_otro_res := 'pudo subir un PDF';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        -- Borrar no se prueba acá: Storage no deja borrar filas directo por SQL. Lo cubre la regla «comet-pdf borrar».
      END IF;
    ELSE
      v_otro_res := 'no hay otra cuenta del staff para probar';
    END IF;
    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_rechazo := 'error ' || SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_rechazo IS NOT NULL THEN RAISE EXCEPTION 'La prueba falló (%). Se deshizo todo.', v_rechazo; END IF;
  IF v_admin_res <> 'ok' THEN RAISE EXCEPTION 'Prueba de la cuenta administradora: %. Se deshizo todo.', v_admin_res; END IF;
  IF v_otro_res NOT IN ('ok', 'no hay otra cuenta del staff para probar') THEN
    RAISE EXCEPTION 'Prueba de otra cuenta del staff: %. Se deshizo todo.', v_otro_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_comet_nombres) OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'comet-pdf')
     OR EXISTS (SELECT 1 FROM public.analisis_partidos WHERE comet IS NOT NULL OR comet_pdf IS NOT NULL) THEN
    RAISE EXCEPTION 'Los datos de prueba no se deshicieron. Se deshizo todo.';
  END IF;

  -- 7) La API ve lo nuevo.
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: COMET aplicado. Administradora: ok%. Otra cuenta del staff: %.',
    CASE WHEN v_analisis IS NULL THEN ' (sin análisis para probar el PDF)' ELSE '' END, v_otro_res;
END
$comet_partido$;
