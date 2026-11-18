-- Avisos al celular para las jugadoras, etapa 2: tablas, funciones de la jugadora, del staff y de la Edge Function,
-- calendario automático, trigger de publicación, tick y tarea de pg_cron.
-- Diseño: docs/superpowers/specs/2026-11-17-avisos-jugadoras-design.md
--
-- Qué hace:
--   1. Tablas nuevas en public (todas con RLS, ningún permiso para anon ni authenticated y la red RESTRICTIVE
--      "sin_cuentas_jugadoras" de la etapa 1): avisos_config (una fila por categoría, se carga para las que ya existen
--      y un trigger la crea para las nuevas), avisos_pausas, avisos_suscripciones, avisos_preferencias y
--      avisos_envios (la cola: toda alta de aviso es una fila; la clave única evita duplicados automáticos).
--   2. Funciones de la jugadora (authenticated, solo con una cuenta activa; si no, 42501 «Esta cuenta no está
--      activa.»): portal_avisos_estado, portal_avisos_suscribir, portal_avisos_desuscribir y
--      portal_avisos_preferencias. La identidad sale siempre de la cuenta (portal_privado), nunca de un parámetro.
--   3. Funciones del staff (authenticated, con control de rol por mi_rol() y mi_categoria()): avisos_panel,
--      avisos_jugadoras, avisos_guardar_config, avisos_crear_pausa, avisos_borrar_pausa (solo coordinación),
--      avisos_mandar (coordinación a cualquier categoría; técnico y PF solo a la suya), avisos_avisar_convocatoria
--      (coordinación o el técnico de la categoría del partido) y avisos_historial.
--      Límites: 5 manuales por remitente y 10 por categoría por día; 3 avisos de convocatoria por partido por día.
--   4. Funciones de la Edge Function avisos-enviar (solo service_role): avisos_tomar_pendientes, avisos_destinos,
--      avisos_contar_sin_avisos y avisos_cerrar_envio.
--   5. Esquema avisos_privado (sin permisos para nadie más que postgres):
--        programar(): crea los recordatorios de Wellness (o combinado) y RPE que tocan según la config, la
--                     planificación (Descanso, sesiones publicadas) y las pausas, en hora de Argentina, con una
--                     ventana de 90 minutos;
--        entrenamiento_publicado(): trigger de planificacion_sesiones; si la sesión de hoy se publica después de la
--                     hora de Wellness, encola el aviso de entrenamiento. Nunca frena el guardado: un error queda
--                     como WARNING;
--        tick():      lo corre pg_cron cada minuto (tarea "avisos-tick"): programa y, si hay pendientes, llama a la
--                     Edge Function con net.http_post. La URL y el secreto salen del Vault en el momento
--                     (avisos_funcion_url y avisos_secreto); si falta alguno, no llama.
--
-- anon no gana nada. El staff ve exactamente lo mismo que antes en las tablas que ya existen (se verifica).
-- No hay secretos en este archivo.
--
-- Requisitos: la etapa 1 (cuentas de jugadoras) aplicada; pg_cron (cron.schedule), pg_net (net.http_post) y Vault.
-- Si falta algo, la migración aborta sin aplicar nada.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómica aunque el editor separe las sentencias.
-- Tareas de pg_cron: avisos-tick (cada minuto) y avisos-limpieza (diaria a las 4:17 UTC; borra el registro de
-- corridas de avisos-tick de más de 7 días).
-- Bloqueos: crea dos triggers (planificacion_sesiones y categorias), así que toma bloqueos fuertes sobre esas dos
-- tablas unos segundos. Cada bloqueo espera como máximo 5 s (lock_timeout): si una tabla está ocupada, aborta sin
-- aplicar nada y se vuelve a correr.
-- Guarda un respaldo (lo que se creó) en seguridad_privado.respaldo_avisos y verifica al final, con datos de prueba
-- que se deshacen (una categoría, una jugadora con su cuenta y su celular, sesiones y pausas):
--   - el calendario, con programar() a horas fijas;
--   - los destinos y textos;
--   - lo que puede y no puede hacer cada rol: la jugadora de prueba, coordinación, técnico, médico, alguien sin rol,
--     anon y service_role;
--   - que la jugadora no ve ninguna tabla y que el staff ve las mismas cantidades que antes.
-- Si algo falla, no se aplica nada.
--
-- Reversión: supabase/rollback/20261117120000_avisos_etapa2.sql (no corre si hay celulares suscriptos).

DO $avisos$
DECLARE
  r record;
  t record;
  ya boolean;
  v_tabla text;
  v_coord text; v_tecnico text; v_medico text;
  sub_coord uuid; sub_tecnico uuid; sub_medico uuid;
  v_cat uuid; v_jug uuid; v_sub uuid; v_email text; v_cuenta_sub uuid; v_cuenta_email text;
  v_envio uuid; v_jobid bigint; v_jobid_limpieza bigint; v_limpieza text;
  v_p256 text := 'B' || repeat('A', 86);
  v_auth text := 'abcdefghij_-KLMNOPQRST';
  v_endpoint text;
  staff_antes jsonb := '{}';
  staff_despues jsonb;
  vistas jsonb;
  sentencia text;
  v_texto text;
  n bigint;
  tablas text[] := ARRAY['avisos_config', 'avisos_pausas', 'avisos_suscripciones', 'avisos_preferencias', 'avisos_envios'];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===================================================================================================
  -- 0) Controles previos.
  -- ===================================================================================================
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_avisos') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_avisos)' INTO ya;
    IF ya THEN RAISE EXCEPTION 'La migración de avisos ya se aplicó (hay respaldo guardado).'; END IF;
  END IF;
  IF to_regnamespace('avisos_privado') IS NOT NULL
     OR EXISTS (SELECT 1 FROM unnest(tablas) x WHERE to_regclass('public.' || x) IS NOT NULL)
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%')) THEN
    RAISE EXCEPTION 'Ya hay tablas, funciones o un esquema de avisos. Revisar antes de seguir.';
  END IF;
  -- La etapa 1 tiene que estar aplicada: la red y la identidad de la jugadora salen de ahí.
  IF to_regclass('public.cuentas_jugadoras') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL
     OR to_regprocedure('portal_privado.mi_jugadora_id()') IS NULL
     OR to_regprocedure('portal_privado.jugadora_activa()') IS NULL
     OR to_regprocedure('public.cuentas_jugadoras_registrar(uuid,uuid,text,uuid)') IS NULL
     OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity
                  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                                    AND p.policyname = 'sin_cuentas_jugadoras' AND p.permissive = 'RESTRICTIVE')) THEN
    RAISE EXCEPTION 'Falta la etapa 1 (cuentas de jugadoras) o su red RESTRICTIVE no está en todas las tablas. No continuar.';
  END IF;
  IF to_regprocedure('public.mi_rol()') IS NULL OR to_regprocedure('public.mi_categoria()') IS NULL
     OR to_regclass('public.planificacion_sesiones') IS NULL OR to_regclass('public.citaciones') IS NULL
     OR to_regclass('public.sesiones_fisicas') IS NULL OR to_regclass('public.bienestar') IS NULL THEN
    RAISE EXCEPTION 'Falta mi_rol(), mi_categoria() o alguna tabla que usan los avisos. No continuar.';
  END IF;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL OR to_regprocedure('cron.unschedule(text)') IS NULL
     OR to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_cron (cron.schedule). Activarlo en Database → Extensions antes de seguir.';
  END IF;
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_net (net.http_post). Activarlo en Database → Extensions antes de seguir.';
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Falta Vault (vault.decrypted_secrets). No continuar.';
  END IF;
  IF to_regclass('cron.job_run_details') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_cron (cron.job_run_details). No continuar.';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-tick') THEN
    RAISE EXCEPTION 'Ya existe la tarea de cron avisos-tick. Revisar antes de seguir.';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-limpieza') THEN
    RAISE EXCEPTION 'Ya existe la tarea de cron avisos-limpieza. Revisar antes de seguir.';
  END IF;

  -- Usuarios reales para la prueba final (coordinación es obligatorio).
  SELECT p.email, u.id INTO v_coord, sub_coord FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'coordinacion' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_tecnico, sub_tecnico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'tecnico' AND p.categoria_id IS NOT NULL ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_medico, sub_medico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'medico' ORDER BY p.email LIMIT 1;
  IF v_coord IS NULL THEN RAISE EXCEPTION 'No hay ningún perfil de coordinación con usuario para probar.'; END IF;

  -- Ayudante de la verificación (se borra al final): cuántas filas ve un usuario en cada tabla y vista de public, o el
  -- código de error. Igual al de la etapa 1: corre como authenticated, con el search_path de la app, y se deshace.
  IF to_regnamespace('seguridad_privado') IS NULL THEN
    CREATE SCHEMA seguridad_privado;
    REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated, service_role;
  END IF;
  CREATE FUNCTION seguridad_privado.avisos_contar(p_sub uuid, p_email text)
   RETURNS jsonb
   LANGUAGE plpgsql
  AS $f$
  DECLARE r record; n bigint; v jsonb; salida jsonb := '{}';
  BEGIN
    FOR r IN SELECT c.relname FROM pg_catalog.pg_class c
             WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY 1 LOOP
      BEGIN
        PERFORM pg_catalog.set_config('request.jwt.claims',
          pg_catalog.json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I', r.relname) INTO n;
        v := pg_catalog.to_jsonb(n);
        RAISE EXCEPTION 'DESHACER_PRUEBA';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'DESHACER_PRUEBA' THEN v := pg_catalog.to_jsonb(SQLSTATE); END IF;
      END;
      salida := salida || pg_catalog.jsonb_build_object(r.relname, v);
    END LOOP;
    RETURN salida;
  END $f$;
  REVOKE ALL ON FUNCTION seguridad_privado.avisos_contar(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

  -- Lo que ve hoy el staff, para comparar al final.
  FOR t IN SELECT * FROM (VALUES ('coordinacion', sub_coord, v_coord), ('tecnico', sub_tecnico, v_tecnico),
                                 ('medico', sub_medico, v_medico)) AS x(rol, sub, email)
           WHERE x.email IS NOT NULL LOOP
    staff_antes := staff_antes || jsonb_build_object(t.rol, seguridad_privado.avisos_contar(t.sub, t.email));
  END LOOP;

  -- ===================================================================================================
  -- 1) Respaldo (privado): lo que crea esta migración. También marca que ya se aplicó.
  -- ===================================================================================================
  CREATE TABLE seguridad_privado.respaldo_avisos (
    orden integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('tabla', 'trigger', 'cron', 'config')),
    nombre text NOT NULL,
    detalle text,
    guardado_en timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_avisos FROM PUBLIC, anon, authenticated, service_role;

  -- ===================================================================================================
  -- 2) Tablas.
  -- ===================================================================================================
  CREATE TABLE public.avisos_config (
    categoria_id uuid PRIMARY KEY REFERENCES public.categorias (id) ON DELETE CASCADE,
    activo boolean NOT NULL DEFAULT true,
    -- Numeración ISO: 1 = lunes … 7 = domingo. Sin repetidos y al menos uno.
    dias smallint[] NOT NULL DEFAULT '{3,4,5}',
    hora_wellness time NOT NULL DEFAULT '07:10',
    hora_rpe time NOT NULL DEFAULT '10:15',
    actualizado_por uuid,
    actualizado_at timestamptz,
    CONSTRAINT avisos_config_dias_check CHECK (
      cardinality(dias) BETWEEN 1 AND 7 AND array_ndims(dias) = 1 AND dias <@ '{1,2,3,4,5,6,7}'::smallint[]
      AND cardinality(array_positions(dias, 1::smallint)) <= 1 AND cardinality(array_positions(dias, 2::smallint)) <= 1
      AND cardinality(array_positions(dias, 3::smallint)) <= 1 AND cardinality(array_positions(dias, 4::smallint)) <= 1
      AND cardinality(array_positions(dias, 5::smallint)) <= 1 AND cardinality(array_positions(dias, 6::smallint)) <= 1
      AND cardinality(array_positions(dias, 7::smallint)) <= 1)
  );

  -- Una pausa con categoria_id NULL vale para todas las categorías.
  CREATE TABLE public.avisos_pausas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id uuid REFERENCES public.categorias (id) ON DELETE CASCADE,
    desde date NOT NULL,
    hasta date NOT NULL CHECK (hasta >= desde),
    motivo text CHECK (length(btrim(motivo)) BETWEEN 1 AND 80),
    creada_por uuid,
    creada_at timestamptz DEFAULT now()
  );

  CREATE TABLE public.avisos_suscripciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jugador_id uuid NOT NULL REFERENCES public.jugadores (id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    dispositivo text NOT NULL CHECK (dispositivo IN ('iphone', 'android', 'compu', 'otro')),
    creada_at timestamptz DEFAULT now(),
    ultimo_ok_at timestamptz
  );
  CREATE INDEX avisos_suscripciones_jugador_idx ON public.avisos_suscripciones (jugador_id);
  CREATE INDEX avisos_suscripciones_usuario_idx ON public.avisos_suscripciones (usuario_id);

  CREATE TABLE public.avisos_preferencias (
    jugador_id uuid PRIMARY KEY REFERENCES public.jugadores (id) ON DELETE CASCADE,
    wellness boolean NOT NULL DEFAULT true,
    rpe boolean NOT NULL DEFAULT true,
    entrenamiento boolean NOT NULL DEFAULT true,
    convocatoria boolean NOT NULL DEFAULT true,
    mensajes boolean NOT NULL DEFAULT true,
    actualizada_at timestamptz DEFAULT now()
  );

  CREATE TABLE public.avisos_envios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo text NOT NULL CHECK (tipo IN ('wellness', 'combinado', 'entrenamiento', 'rpe', 'convocatoria', 'manual')),
    categoria_id uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
    fecha date NOT NULL,
    -- Solo los automáticos tienen clave (manana:/rpe:/entrenamiento:{categoría}:{fecha}); manuales y convocatorias, NULL.
    clave text UNIQUE,
    partido_id uuid REFERENCES public.partidos (id) ON DELETE SET NULL,
    jugadoras uuid[],
    texto text CHECK (texto IS NULL OR char_length(texto) BETWEEN 1 AND 140),
    enviado_por uuid,
    rol_remitente text,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'error')),
    tomado_at timestamptz,
    destinatarias integer,
    entregados integer,
    fallidos integer,
    sin_avisos integer,
    creado_at timestamptz DEFAULT now(),
    enviado_at timestamptz
  );
  CREATE INDEX avisos_envios_categoria_fecha_idx ON public.avisos_envios (categoria_id, fecha);
  CREATE INDEX avisos_envios_remitente_idx ON public.avisos_envios (enviado_por, fecha) WHERE tipo = 'manual';
  CREATE INDEX avisos_envios_partido_idx ON public.avisos_envios (partido_id, fecha) WHERE partido_id IS NOT NULL;
  CREATE INDEX avisos_envios_cola_idx ON public.avisos_envios (creado_at) WHERE estado IN ('pendiente', 'enviando');
  CREATE INDEX avisos_envios_creado_idx ON public.avisos_envios (creado_at DESC);

  -- RLS, sin permisos para anon ni authenticated (solo service_role y las funciones) y la red RESTRICTIVE.
  FOREACH v_tabla IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabla);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_tabla);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_tabla);
    EXECUTE format('CREATE POLICY sin_cuentas_jugadoras ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()))', v_tabla);
    INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre) VALUES ('tabla', v_tabla);
  END LOOP;

  -- Una fila de config por categoría existente, con los valores por defecto.
  INSERT INTO public.avisos_config (categoria_id) SELECT c.id FROM public.categorias c ON CONFLICT (categoria_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre, detalle) VALUES ('config', 'filas iniciales', n::text);

  -- ===================================================================================================
  -- 3) Esquema avisos_privado: calendario, trigger y tick. Nadie más que postgres lo usa.
  -- ===================================================================================================
  CREATE SCHEMA avisos_privado;
  REVOKE ALL ON SCHEMA avisos_privado FROM PUBLIC, anon, authenticated, service_role;

  -- Cómo es un día para una categoría: si salen los recordatorios automáticos, por qué, y si hay sesión publicada
  -- (Entrenamiento o Partido; 'partido' si hay alguna de Partido).
  CREATE FUNCTION avisos_privado.dia(p_categoria_id uuid, p_fecha date, OUT aplica boolean, OUT motivo text, OUT publicada text)
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_activo boolean; v_dias smallint[];
  BEGIN
    aplica := false;
    SELECT c.activo, c.dias INTO v_activo, v_dias FROM public.avisos_config c WHERE c.categoria_id = p_categoria_id;
    SELECT CASE WHEN bool_or(s.tipo = 'partido') THEN 'partido' WHEN count(*) > 0 THEN 'entrenamiento' END INTO publicada
      FROM public.planificacion_sesiones s
     WHERE s.categoria_id = p_categoria_id AND s.fecha = p_fecha AND s.estado = 'publicado' AND s.tipo IN ('entrenamiento', 'partido');
    IF v_activo IS NOT TRUE THEN
      motivo := 'inactivo';
    ELSIF EXISTS (SELECT 1 FROM public.avisos_pausas p
                  WHERE (p.categoria_id IS NULL OR p.categoria_id = p_categoria_id) AND p_fecha BETWEEN p.desde AND p.hasta) THEN
      motivo := 'pausa';
    -- Descanso publicado o en borrador.
    ELSIF EXISTS (SELECT 1 FROM public.planificacion_sesiones s
                  WHERE s.categoria_id = p_categoria_id AND s.fecha = p_fecha AND s.tipo = 'descanso') THEN
      motivo := 'descanso';
    ELSIF extract(isodow FROM p_fecha)::smallint = ANY (v_dias) THEN
      aplica := true; motivo := 'dia_de_entrenamiento';
    ELSIF publicada IS NOT NULL THEN
      aplica := true; motivo := 'sesion_publicada';
    ELSE
      motivo := 'sin_entrenamiento';
    END IF;
  END $f$;

  -- Crea los recordatorios que tocan a esta hora (por defecto, ahora). Ventana: desde la hora fijada hasta 90 minutos
  -- después (si la tarea no corrió en ese rato, ese día no sale). La clave única evita duplicados.
  -- Devuelve cuántos envíos creó.
  CREATE FUNCTION avisos_privado.programar(p_ahora timestamptz DEFAULT now())
   RETURNS integer
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_local timestamp := p_ahora AT TIME ZONE 'America/Argentina/Buenos_Aires';
    v_fecha date := v_local::date;
    v_dia text := to_char(v_local::date, 'YYYY-MM-DD');
    v_hora time := date_trunc('minute', v_local)::time;
    c record; d record; v_tipo text; v_n integer; v_total integer := 0;
  BEGIN
    FOR c IN SELECT x.categoria_id, x.hora_wellness, x.hora_rpe FROM public.avisos_config x WHERE x.activo ORDER BY x.categoria_id LOOP
      IF NOT ((v_hora - c.hora_wellness) BETWEEN interval '0' AND interval '90 minutes'
           OR (v_hora - c.hora_rpe) BETWEEN interval '0' AND interval '90 minutes') THEN
        CONTINUE;
      END IF;
      SELECT * INTO d FROM avisos_privado.dia(c.categoria_id, v_fecha);
      IF NOT d.aplica THEN CONTINUE; END IF;

      IF (v_hora - c.hora_wellness) BETWEEN interval '0' AND interval '90 minutes' THEN
        -- Mismo candado que el trigger de publicación: los dos miran qué hay del día antes de encolar.
        PERFORM pg_advisory_xact_lock(hashtext('avisos_dia:' || c.categoria_id || ':' || v_dia));
        -- Combinado si hay sesión publicada, salvo que ya haya salido el aviso de entrenamiento de hoy.
        v_tipo := CASE WHEN d.publicada IS NOT NULL AND NOT EXISTS (
                         SELECT 1 FROM public.avisos_envios e WHERE e.clave = 'entrenamiento:' || c.categoria_id || ':' || v_dia)
                       THEN 'combinado' ELSE 'wellness' END;
        INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, clave)
        VALUES (v_tipo, c.categoria_id, v_fecha, 'manana:' || c.categoria_id || ':' || v_dia)
        ON CONFLICT (clave) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total := v_total + v_n;
      END IF;

      IF (v_hora - c.hora_rpe) BETWEEN interval '0' AND interval '90 minutes' THEN
        INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, clave)
        VALUES ('rpe', c.categoria_id, v_fecha, 'rpe:' || c.categoria_id || ':' || v_dia)
        ON CONFLICT (clave) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total := v_total + v_n;
      END IF;
    END LOOP;
    RETURN v_total;
  END $f$;

  -- Trigger de planificacion_sesiones: la sesión de hoy publicada después de la hora de Wellness encola el aviso de
  -- entrenamiento (una sola vez por día y categoría). Barato y nunca frena el guardado del staff.
  CREATE FUNCTION avisos_privado.entrenamiento_publicado()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_local timestamp; v_hora_wellness time; d record; v_dia text;
  BEGIN
    IF NEW.estado IS DISTINCT FROM 'publicado' OR NEW.tipo IS NULL OR NEW.tipo NOT IN ('entrenamiento', 'partido') THEN
      RETURN NULL;
    END IF;
    -- Ya estaba publicada con la misma fecha: no hay nada nuevo.
    IF TG_OP = 'UPDATE' AND OLD.estado = 'publicado' AND OLD.tipo IN ('entrenamiento', 'partido') AND OLD.fecha = NEW.fecha THEN
      RETURN NULL;
    END IF;
    BEGIN
      v_local := now() AT TIME ZONE 'America/Argentina/Buenos_Aires';
      IF NEW.fecha IS DISTINCT FROM v_local::date THEN RETURN NULL; END IF;
      SELECT c.hora_wellness INTO v_hora_wellness FROM public.avisos_config c WHERE c.categoria_id = NEW.categoria_id AND c.activo;
      IF v_hora_wellness IS NULL OR v_local::time < v_hora_wellness THEN RETURN NULL; END IF;
      SELECT * INTO d FROM avisos_privado.dia(NEW.categoria_id, NEW.fecha);
      IF NOT d.aplica THEN RETURN NULL; END IF;
      v_dia := to_char(NEW.fecha, 'YYYY-MM-DD');
      -- Mismo candado que programar(): si los dos corren en el mismo instante, el segundo ve lo que encoló el primero.
      PERFORM pg_advisory_xact_lock(hashtext('avisos_dia:' || NEW.categoria_id || ':' || v_dia));
      -- Si a la mañana salió el combinado, ya avisó del entrenamiento.
      IF EXISTS (SELECT 1 FROM public.avisos_envios e
                 WHERE e.clave = 'manana:' || NEW.categoria_id || ':' || v_dia AND e.tipo = 'combinado') THEN
        RETURN NULL;
      END IF;
      INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, clave)
      VALUES ('entrenamiento', NEW.categoria_id, NEW.fecha, 'entrenamiento:' || NEW.categoria_id || ':' || v_dia)
      ON CONFLICT (clave) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'avisos: no se pudo encolar el aviso de entrenamiento (%: %). La sesión se guardó igual.', SQLSTATE, SQLERRM;
    END;
    RETURN NULL;
  END $f$;
  CREATE TRIGGER avisos_entrenamiento_publicado AFTER INSERT OR UPDATE OF estado, tipo, fecha ON public.planificacion_sesiones
    FOR EACH ROW EXECUTE FUNCTION avisos_privado.entrenamiento_publicado();
  INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre, detalle) VALUES ('trigger', 'avisos_entrenamiento_publicado', 'planificacion_sesiones');

  -- Trigger de categorias: cada categoría nueva arranca con la config por defecto.
  CREATE FUNCTION avisos_privado.config_por_defecto()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  BEGIN
    INSERT INTO public.avisos_config (categoria_id) VALUES (NEW.id) ON CONFLICT (categoria_id) DO NOTHING;
    RETURN NULL;
  END $f$;
  CREATE TRIGGER avisos_config_por_defecto AFTER INSERT ON public.categorias
    FOR EACH ROW EXECUTE FUNCTION avisos_privado.config_por_defecto();
  INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre, detalle) VALUES ('trigger', 'avisos_config_por_defecto', 'categorias');

  -- Las jugadoras a las que apunta un envío (con las reglas del diseño) y el aviso que le toca a cada una.
  -- usuario_id y los textos quedan en NULL si no le llega: sin cuenta activa o con esa preferencia apagada.
  -- Wellness excluye a quien completó los cinco campos; RPE, a quien tiene cualquier RPE de ese día. Siempre según
  -- la categoría actual de la jugadora, salvo la convocatoria, que va a las citadas.
  CREATE FUNCTION avisos_privado.objetivo(p_envio_id uuid)
   RETURNS TABLE(jugador_id uuid, usuario_id uuid, titulo text, cuerpo text, url text, tag text, ttl integer)
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    WITH e AS (
      SELECT x.id, x.tipo, x.categoria_id, x.fecha, x.jugadoras, x.texto, x.rol_remitente,
             EXISTS (SELECT 1 FROM public.planificacion_sesiones s
                     WHERE s.categoria_id = x.categoria_id AND s.fecha = x.fecha AND s.estado = 'publicado' AND s.tipo = 'partido') AS hay_partido,
             (SELECT 'Estás convocada: vs ' || p.rival || ' · ' || to_char(p.fecha, 'DD/MM')
                     || coalesce(' ' || to_char(p.hora, 'HH24:MI'), '') || '.'
                FROM public.partidos p WHERE p.id = x.partido_id) AS texto_convocatoria
        FROM public.avisos_envios x
       WHERE x.id = p_envio_id
    ), base AS (
      SELECT j.id AS jugador_id, c.usuario_id,
             coalesce(pr.wellness, true) AS q_wellness, coalesce(pr.rpe, true) AS q_rpe,
             coalesce(pr.entrenamiento, true) AS q_entrenamiento, coalesce(pr.convocatoria, true) AS q_convocatoria,
             coalesce(pr.mensajes, true) AS q_mensajes,
             EXISTS (SELECT 1 FROM public.bienestar b
                     WHERE b.jugador_id = j.id AND b.fecha = e.fecha
                       AND b.sueno IS NOT NULL AND b.dolor_muscular IS NOT NULL AND b.fatiga IS NOT NULL
                       AND b.estres IS NOT NULL AND b.animo_entrenar IS NOT NULL) AS completo,
             EXISTS (SELECT 1 FROM public.sesiones_fisicas f
                     WHERE f.jugador_id = j.id AND f.fecha = e.fecha AND f.rpe IS NOT NULL) AS con_rpe
        FROM e
        JOIN public.jugadores j
          ON CASE WHEN e.tipo = 'convocatoria' THEN j.id = ANY (e.jugadoras)
                  ELSE j.categoria_id = e.categoria_id AND (e.tipo <> 'manual' OR e.jugadoras IS NULL OR j.id = ANY (e.jugadoras)) END
        LEFT JOIN public.cuentas_jugadoras c ON c.jugador_id = j.id AND c.activa
        LEFT JOIN public.avisos_preferencias pr ON pr.jugador_id = j.id
       WHERE e.tipo <> 'convocatoria' OR e.texto_convocatoria IS NOT NULL
    ), v AS (
      SELECT b.jugador_id, b.usuario_id,
             CASE WHEN b.usuario_id IS NULL THEN NULL
                  WHEN e.tipo = 'wellness' THEN CASE WHEN b.q_wellness THEN 'wellness' END
                  WHEN e.tipo = 'rpe' THEN CASE WHEN b.q_rpe THEN 'rpe' END
                  WHEN e.tipo = 'entrenamiento' THEN CASE WHEN b.q_entrenamiento THEN 'entrenamiento' END
                  -- Combinado: Wellness y Entrenamiento se respetan por separado; quien completó, solo entrenamiento.
                  WHEN e.tipo = 'combinado' THEN CASE WHEN NOT b.completo AND b.q_wellness AND b.q_entrenamiento THEN 'combinado'
                                                      WHEN NOT b.completo AND b.q_wellness THEN 'wellness'
                                                      WHEN b.q_entrenamiento THEN 'entrenamiento' END
                  WHEN e.tipo = 'convocatoria' THEN CASE WHEN b.q_convocatoria THEN 'convocatoria' END
                  WHEN e.tipo = 'manual' THEN CASE WHEN b.q_mensajes THEN 'manual' END
             END AS variante
        FROM e CROSS JOIN base b
       WHERE CASE e.tipo WHEN 'wellness' THEN NOT b.completo WHEN 'rpe' THEN NOT b.con_rpe ELSE true END
    )
    SELECT v.jugador_id,
           CASE WHEN v.variante IS NOT NULL THEN v.usuario_id END,
           CASE v.variante
             WHEN 'wellness' THEN 'Wellness'
             WHEN 'combinado' THEN CASE WHEN e.hay_partido THEN 'Hoy hay partido' ELSE 'Hoy entrenás' END
             WHEN 'entrenamiento' THEN 'Entrenamiento'
             WHEN 'rpe' THEN 'RPE'
             WHEN 'convocatoria' THEN 'Convocatoria'
             WHEN 'manual' THEN CASE WHEN e.rol_remitente = 'coordinacion' THEN 'Mensaje de coordinación' ELSE 'Mensaje del cuerpo técnico' END
           END,
           CASE v.variante
             WHEN 'wellness' THEN 'Completá tu Wellness de hoy.'
             WHEN 'combinado' THEN CASE WHEN e.hay_partido THEN 'Hoy hay partido · Completá tu Wellness.'
                                        ELSE 'Ya está tu entrenamiento de hoy · Completá tu Wellness.' END
             WHEN 'entrenamiento' THEN 'Ya está tu entrenamiento de hoy.'
             WHEN 'rpe' THEN 'Cargá tu RPE de hoy.'
             WHEN 'convocatoria' THEN e.texto_convocatoria
             WHEN 'manual' THEN e.texto
           END,
           CASE WHEN v.variante IS NULL THEN NULL
                WHEN v.variante IN ('wellness', 'combinado') THEN '/jugadora/?seccion=wellness'
                WHEN v.variante = 'rpe' THEN '/jugadora/?seccion=rpe'
                ELSE '/jugadora/?seccion=inicio' END,
           e.tipo || '-' || CASE WHEN e.tipo IN ('manual', 'convocatoria') THEN e.id::text ELSE to_char(e.fecha, 'YYYY-MM-DD') END,
           CASE e.tipo WHEN 'entrenamiento' THEN 21600 WHEN 'convocatoria' THEN 86400 WHEN 'manual' THEN 86400 ELSE 10800 END
      FROM e CROSS JOIN v;
  $f$;

  -- Lo corre pg_cron cada minuto: programa y, si hay pendientes (o tomados hace más de 10 minutos), llama a la
  -- Edge Function. La URL y el secreto se leen del Vault en el momento; nunca se guardan ni se muestran.
  CREATE FUNCTION avisos_privado.tick()
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_url text; v_secreto text; v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  BEGIN
    BEGIN
      PERFORM avisos_privado.programar();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'avisos: programar falló (%: %).', SQLSTATE, SQLERRM;
    END;
    -- Solo cuenta lo que todavía se puede mandar: lo vencido (mismo criterio que avisos_tomar_pendientes) no llama.
    IF NOT EXISTS (SELECT 1 FROM public.avisos_envios e
                   WHERE (e.estado = 'pendiente' OR (e.estado = 'enviando' AND e.tomado_at < now() - interval '10 minutes'))
                     AND NOT ((e.tipo IN ('wellness', 'combinado', 'rpe', 'entrenamiento') AND e.fecha < v_hoy)
                           OR (e.tipo IN ('wellness', 'combinado', 'rpe') AND e.creado_at < now() - interval '90 minutes')
                           OR (e.tipo = 'entrenamiento' AND e.creado_at < now() - interval '3 hours')
                           OR (e.tipo IN ('manual', 'convocatoria') AND e.creado_at < now() - interval '24 hours'))) THEN
      RETURN;
    END IF;
    SELECT s.decrypted_secret INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'avisos_funcion_url' LIMIT 1;
    SELECT s.decrypted_secret INTO v_secreto FROM vault.decrypted_secrets s WHERE s.name = 'avisos_secreto' LIMIT 1;
    IF nullif(btrim(v_url), '') IS NULL OR nullif(btrim(v_secreto), '') IS NULL THEN
      RAISE NOTICE 'avisos: faltan los secretos avisos_funcion_url o avisos_secreto en el Vault; no se llama a la función.';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := btrim(v_url),
      body := '{}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-secreto', v_secreto),
      timeout_milliseconds := 5000);
  END $f$;

  -- ===================================================================================================
  -- 4) Funciones de la jugadora (authenticated; la identidad sale de la cuenta activa).
  -- ===================================================================================================
  CREATE FUNCTION public.portal_avisos_estado()
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa(); salida jsonb;
  BEGIN
    SELECT jsonb_build_object(
             'preferencias', jsonb_build_object('wellness', coalesce(p.wellness, true), 'rpe', coalesce(p.rpe, true),
                                                'entrenamiento', coalesce(p.entrenamiento, true),
                                                'convocatoria', coalesce(p.convocatoria, true), 'mensajes', coalesce(p.mensajes, true)),
             'dispositivos', (SELECT count(*) FROM public.avisos_suscripciones s WHERE s.jugador_id = v_id))
      INTO salida
      FROM (SELECT 1) x LEFT JOIN public.avisos_preferencias p ON p.jugador_id = v_id;
    RETURN salida;
  END $f$;

  -- Alta o reasociación de un celular. Solo servicios de push conocidos; hasta 3 por jugadora (se borran los más
  -- viejos). Un endpoint que era de otra jugadora (celular compartido) pasa a esta.
  CREATE FUNCTION public.portal_avisos_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_id uuid := portal_privado.jugadora_activa();
    v_host text := substring(p_endpoint FROM '^https://([^/?#@:[:space:]]+)(/|$)');
  BEGIN
    IF p_endpoint IS NULL OR length(p_endpoint) > 1000 OR p_endpoint ~ '[[:space:]]'
       OR v_host IS NULL
       OR v_host !~ '^(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$'
       OR p_p256dh IS NULL OR p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$'
       OR p_auth IS NULL OR p_auth !~ '^[A-Za-z0-9_-]{16,32}$'
       OR p_dispositivo IS NULL OR p_dispositivo NOT IN ('iphone', 'android', 'compu', 'otro') THEN
      RAISE EXCEPTION 'suscripcion_invalida' USING ERRCODE = '22023';
    END IF;
    -- Una alta por vez por jugadora, para que el tope de 3 se respete.
    PERFORM pg_advisory_xact_lock(hashtext('avisos_suscripciones:' || v_id::text));
    INSERT INTO public.avisos_suscripciones AS s (jugador_id, usuario_id, endpoint, p256dh, auth, dispositivo, creada_at)
    VALUES (v_id, auth.uid(), p_endpoint, p_p256dh, p_auth, p_dispositivo, clock_timestamp())
    ON CONFLICT (endpoint) DO UPDATE
      SET jugador_id = EXCLUDED.jugador_id, usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth, dispositivo = EXCLUDED.dispositivo, creada_at = EXCLUDED.creada_at,
          ultimo_ok_at = CASE WHEN s.jugador_id = EXCLUDED.jugador_id THEN s.ultimo_ok_at END;
    DELETE FROM public.avisos_suscripciones x
     WHERE x.id IN (SELECT y.id FROM public.avisos_suscripciones y WHERE y.jugador_id = v_id
                    ORDER BY y.creada_at DESC, y.id DESC OFFSET 3);
  END $f$;

  -- Borra solo si el endpoint es de esta jugadora; si no, no hace nada.
  CREATE FUNCTION public.portal_avisos_desuscribir(p_endpoint text)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    DELETE FROM public.avisos_suscripciones s WHERE s.endpoint = p_endpoint AND s.jugador_id = v_id;
  END $f$;

  CREATE FUNCTION public.portal_avisos_preferencias(p_wellness boolean, p_rpe boolean, p_entrenamiento boolean,
    p_convocatoria boolean, p_mensajes boolean)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    IF p_wellness IS NULL OR p_rpe IS NULL OR p_entrenamiento IS NULL OR p_convocatoria IS NULL OR p_mensajes IS NULL THEN
      RAISE EXCEPTION 'preferencias_invalidas' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.avisos_preferencias AS p (jugador_id, wellness, rpe, entrenamiento, convocatoria, mensajes, actualizada_at)
    VALUES (v_id, p_wellness, p_rpe, p_entrenamiento, p_convocatoria, p_mensajes, now())
    ON CONFLICT (jugador_id) DO UPDATE
      SET wellness = EXCLUDED.wellness, rpe = EXCLUDED.rpe, entrenamiento = EXCLUDED.entrenamiento,
          convocatoria = EXCLUDED.convocatoria, mensajes = EXCLUDED.mensajes, actualizada_at = EXCLUDED.actualizada_at;
  END $f$;

  -- ===================================================================================================
  -- 5) Funciones del staff (authenticated; control de rol adentro).
  -- ===================================================================================================
  -- Coordinación: config y estado de hoy de cada categoría, y pausas vigentes o futuras.
  CREATE FUNCTION public.avisos_panel()
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date; v_categorias jsonb; v_pausas jsonb;
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'categoria_id', c.id, 'nombre', c.nombre,
             'activo', coalesce(cfg.activo, false),
             'dias', coalesce(to_jsonb(cfg.dias), '[]'::jsonb),
             'hora_wellness', to_char(cfg.hora_wellness, 'HH24:MI'),
             'hora_rpe', to_char(cfg.hora_rpe, 'HH24:MI'),
             'jugadoras', (SELECT count(*) FROM public.jugadores j WHERE j.categoria_id = c.id),
             'con_avisos', (SELECT count(DISTINCT j.id) FROM public.jugadores j
                              JOIN public.cuentas_jugadoras cu ON cu.jugador_id = j.id AND cu.activa
                              JOIN public.avisos_suscripciones s ON s.jugador_id = j.id AND s.usuario_id = cu.usuario_id
                             WHERE j.categoria_id = c.id),
             'hoy', (SELECT jsonb_build_object('aplica', d.aplica, 'motivo', d.motivo) FROM avisos_privado.dia(c.id, v_hoy) d))
           ORDER BY c.orden, c.nombre), '[]'::jsonb)
      INTO v_categorias
      FROM public.categorias c LEFT JOIN public.avisos_config cfg ON cfg.categoria_id = c.id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'categoria', c.nombre,
                                                 'desde', p.desde, 'hasta', p.hasta, 'motivo', p.motivo)
                              ORDER BY p.desde, p.hasta, p.id), '[]'::jsonb)
      INTO v_pausas
      FROM public.avisos_pausas p LEFT JOIN public.categorias c ON c.id = p.categoria_id
     WHERE p.hasta >= v_hoy;
    RETURN jsonb_build_object('categorias', v_categorias, 'pausas', v_pausas);
  END $f$;

  -- Coordinación: las jugadoras de una categoría con su cuenta, sus celulares y sus preferencias.
  CREATE FUNCTION public.avisos_jugadoras(p_categoria_id uuid)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'jugador_id', j.id, 'nombre', j.nombre, 'apellido', j.apellido,
               'cuenta', CASE WHEN cu.jugador_id IS NULL THEN NULL WHEN cu.activa THEN 'activa' ELSE 'desactivada' END,
               'dispositivos', coalesce(sx.cantidad, 0),
               'tipos', coalesce(to_jsonb(sx.tipos), '[]'::jsonb),
               'preferencias', jsonb_build_object('wellness', coalesce(p.wellness, true), 'rpe', coalesce(p.rpe, true),
                                                  'entrenamiento', coalesce(p.entrenamiento, true),
                                                  'convocatoria', coalesce(p.convocatoria, true), 'mensajes', coalesce(p.mensajes, true)))
             ORDER BY j.apellido, j.nombre, j.id)
        FROM public.jugadores j
        LEFT JOIN public.cuentas_jugadoras cu ON cu.jugador_id = j.id
        LEFT JOIN public.avisos_preferencias p ON p.jugador_id = j.id
        LEFT JOIN LATERAL (SELECT count(*) AS cantidad, array_agg(DISTINCT s.dispositivo ORDER BY s.dispositivo) AS tipos
                             FROM public.avisos_suscripciones s WHERE s.jugador_id = j.id) sx ON true
       WHERE j.categoria_id = p_categoria_id), '[]'::jsonb);
  END $f$;

  -- Coordinación: horarios y días de una categoría.
  CREATE FUNCTION public.avisos_guardar_config(p_categoria_id uuid, p_activo boolean, p_dias smallint[],
    p_hora_wellness time, p_hora_rpe time)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_dias smallint[];
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF p_categoria_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.categorias c WHERE c.id = p_categoria_id)
       OR p_activo IS NULL OR p_hora_wellness IS NULL OR p_hora_rpe IS NULL
       OR p_dias IS NULL OR cardinality(p_dias) = 0 OR array_ndims(p_dias) <> 1
       OR EXISTS (SELECT 1 FROM unnest(p_dias) x WHERE x IS NULL OR x NOT BETWEEN 1 AND 7)
       OR (SELECT count(DISTINCT x) FROM unnest(p_dias) x) <> cardinality(p_dias) THEN
      RAISE EXCEPTION 'config_invalida' USING ERRCODE = '22023';
    END IF;
    v_dias := ARRAY(SELECT x FROM unnest(p_dias) x ORDER BY x);
    INSERT INTO public.avisos_config AS c (categoria_id, activo, dias, hora_wellness, hora_rpe, actualizado_por, actualizado_at)
    VALUES (p_categoria_id, p_activo, v_dias,
            make_time(extract(hour FROM p_hora_wellness)::integer, extract(minute FROM p_hora_wellness)::integer, 0),
            make_time(extract(hour FROM p_hora_rpe)::integer, extract(minute FROM p_hora_rpe)::integer, 0),
            auth.uid(), now())
    ON CONFLICT (categoria_id) DO UPDATE
      SET activo = EXCLUDED.activo, dias = EXCLUDED.dias, hora_wellness = EXCLUDED.hora_wellness, hora_rpe = EXCLUDED.hora_rpe,
          actualizado_por = EXCLUDED.actualizado_por, actualizado_at = EXCLUDED.actualizado_at;
  END $f$;

  -- Coordinación: pausa para una categoría o para todas (p_categoria_id NULL).
  CREATE FUNCTION public.avisos_crear_pausa(p_categoria_id uuid, p_desde date, p_hasta date, p_motivo text)
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_motivo text := nullif(btrim(p_motivo), ''); v_id uuid;
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR char_length(v_motivo) > 80
       OR (p_categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categorias c WHERE c.id = p_categoria_id)) THEN
      RAISE EXCEPTION 'pausa_invalida' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.avisos_pausas (categoria_id, desde, hasta, motivo, creada_por)
    VALUES (p_categoria_id, p_desde, p_hasta, v_motivo, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END $f$;

  CREATE FUNCTION public.avisos_borrar_pausa(p_id uuid)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.avisos_pausas p WHERE p.id = p_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pausa_invalida' USING ERRCODE = '22023';
    END IF;
  END $f$;

  -- Aviso manual: coordinación a cualquier categoría; técnico y PF solo a la suya. p_jugadoras NULL = todo el plantel.
  CREATE FUNCTION public.avisos_mandar(p_categoria_id uuid, p_jugadoras uuid[], p_texto text)
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_rol text := public.mi_rol();
    v_yo uuid := auth.uid();
    v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    v_texto text := btrim(p_texto, E' \t\r\n');
    v_jugadoras uuid[];
    v_id uuid;
  BEGIN
    IF v_yo IS NULL OR NOT coalesce(v_rol = 'coordinacion'
         OR (v_rol IN ('tecnico', 'preparador_fisico') AND p_categoria_id IS NOT NULL AND public.mi_categoria() = p_categoria_id), false) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.categorias c WHERE c.id = p_categoria_id) THEN
      RAISE EXCEPTION 'categoria_invalida' USING ERRCODE = '22023';
    END IF;
    IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 3 AND 140 THEN
      RAISE EXCEPTION 'texto_invalido' USING ERRCODE = '22023';
    END IF;
    IF p_jugadoras IS NOT NULL THEN
      SELECT array_agg(DISTINCT x ORDER BY x) INTO v_jugadoras FROM unnest(p_jugadoras) x;
      IF v_jugadoras IS NULL OR EXISTS (SELECT 1 FROM unnest(v_jugadoras) x
                                        WHERE x IS NULL OR NOT EXISTS (SELECT 1 FROM public.jugadores j
                                                                       WHERE j.id = x AND j.categoria_id = p_categoria_id)) THEN
        RAISE EXCEPTION 'jugadoras_invalidas' USING ERRCODE = '22023';
      END IF;
    END IF;
    -- Límites del día (hora de Argentina). Siempre en este orden (categoría y después remitente), sin abrazos mortales.
    PERFORM pg_advisory_xact_lock(hashtext('avisos_categoria:' || p_categoria_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('avisos_remitente:' || v_yo::text));
    -- Doble clic: el mismo texto del mismo remitente a la misma categoría y jugadoras en el último minuto.
    IF EXISTS (SELECT 1 FROM public.avisos_envios e
               WHERE e.tipo = 'manual' AND e.enviado_por = v_yo AND e.categoria_id = p_categoria_id AND e.texto = v_texto
                 AND e.jugadoras IS NOT DISTINCT FROM v_jugadoras AND e.creado_at > now() - interval '60 seconds') THEN
      RAISE EXCEPTION 'duplicado' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.avisos_envios e WHERE e.tipo = 'manual' AND e.enviado_por = v_yo AND e.fecha = v_hoy) >= 5 THEN
      RAISE EXCEPTION 'limite_remitente' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.avisos_envios e WHERE e.tipo = 'manual' AND e.categoria_id = p_categoria_id AND e.fecha = v_hoy) >= 10 THEN
      RAISE EXCEPTION 'limite_categoria' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, jugadoras, texto, enviado_por, rol_remitente)
    VALUES ('manual', p_categoria_id, v_hoy, v_jugadoras, v_texto, v_yo, v_rol)
    RETURNING id INTO v_id;
    RETURN v_id;
  END $f$;

  -- «Avisar convocatoria»: coordinación o el técnico de la categoría del partido. Va a las citadas.
  CREATE FUNCTION public.avisos_avisar_convocatoria(p_partido_id uuid)
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_rol text := public.mi_rol();
    v_yo uuid := auth.uid();
    v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
    v_cat uuid; v_jugadoras uuid[]; v_id uuid;
  BEGIN
    SELECT p.categoria_id INTO v_cat FROM public.partidos p WHERE p.id = p_partido_id;
    IF v_yo IS NULL OR NOT coalesce(v_rol = 'coordinacion'
         OR (v_rol = 'tecnico' AND v_cat IS NOT NULL AND public.mi_categoria() = v_cat), false) THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    IF v_cat IS NULL THEN
      RAISE EXCEPTION 'partido_inexistente' USING ERRCODE = 'P0002';
    END IF;
    SELECT array_agg(DISTINCT c.jugador_id ORDER BY c.jugador_id) INTO v_jugadoras
      FROM public.citaciones c WHERE c.partido_id = p_partido_id;
    IF v_jugadoras IS NULL THEN
      RAISE EXCEPTION 'sin_convocadas' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('avisos_partido:' || p_partido_id::text));
    -- Doble clic: otro aviso del mismo partido en el último minuto.
    IF EXISTS (SELECT 1 FROM public.avisos_envios e
               WHERE e.tipo = 'convocatoria' AND e.partido_id = p_partido_id AND e.creado_at > now() - interval '60 seconds') THEN
      RAISE EXCEPTION 'duplicado' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM public.avisos_envios e WHERE e.tipo = 'convocatoria' AND e.partido_id = p_partido_id AND e.fecha = v_hoy) >= 3 THEN
      RAISE EXCEPTION 'limite_partido' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, partido_id, jugadoras, enviado_por, rol_remitente)
    VALUES ('convocatoria', v_cat, v_hoy, p_partido_id, v_jugadoras, v_yo, v_rol)
    RETURNING id INTO v_id;
    RETURN v_id;
  END $f$;

  -- Historial: coordinación ve cualquier categoría (NULL = todas); técnico y PF, solo la suya.
  CREATE FUNCTION public.avisos_historial(p_categoria_id uuid, p_limite integer DEFAULT 50)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_rol text := public.mi_rol();
    v_cat uuid;
    v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 500);
  BEGIN
    IF v_rol = 'coordinacion' THEN
      v_cat := p_categoria_id;
    ELSIF v_rol IN ('tecnico', 'preparador_fisico') THEN
      v_cat := public.mi_categoria();
      IF v_cat IS NULL OR (p_categoria_id IS NOT NULL AND p_categoria_id <> v_cat) THEN
        RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((
      SELECT jsonb_agg(x.fila ORDER BY x.creado_at DESC, x.id DESC) FROM (
        SELECT e.id, e.creado_at,
               jsonb_build_object('id', e.id, 'tipo', e.tipo, 'categoria', c.nombre, 'fecha', e.fecha, 'texto', e.texto,
                 'remitente', CASE WHEN e.enviado_por IS NULL THEN 'Automático'
                                   ELSE coalesce((SELECT nullif(btrim(p.nombre), '') FROM auth.users u
                                                    JOIN public.perfiles p ON lower(p.email) = lower(u.email)
                                                   WHERE u.id = e.enviado_por LIMIT 1), 'Sin nombre') END,
                 'estado', e.estado, 'destinatarias', e.destinatarias, 'entregados', e.entregados, 'fallidos', e.fallidos,
                 'sin_avisos', e.sin_avisos, 'creado_at', e.creado_at) AS fila
          FROM public.avisos_envios e JOIN public.categorias c ON c.id = e.categoria_id
         WHERE v_cat IS NULL OR e.categoria_id = v_cat
         ORDER BY e.creado_at DESC, e.id DESC
         LIMIT v_limite) x), '[]'::jsonb);
  END $f$;

  -- ===================================================================================================
  -- 6) Funciones de la Edge Function avisos-enviar (solo service_role).
  -- ===================================================================================================
  -- Toma hasta p_max pendientes (y los que quedaron «enviando» hace más de 10 minutos) y los marca como enviando.
  -- Antes, lo vencido queda en 'error' y nunca sale tarde y fuera de contexto:
  --   recordatorios automáticos de otro día; Wellness, combinado y RPE creados hace más de 90 minutos;
  --   entrenamiento, hace más de 3 horas; manuales y convocatorias, hace más de 24 horas.
  CREATE FUNCTION public.avisos_tomar_pendientes(p_max integer DEFAULT 10)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date; salida jsonb;
  BEGIN
    UPDATE public.avisos_envios e SET estado = 'error', enviado_at = now()
     WHERE (e.estado = 'pendiente' OR (e.estado = 'enviando' AND e.tomado_at < now() - interval '10 minutes'))
       AND ((e.tipo IN ('wellness', 'combinado', 'rpe', 'entrenamiento') AND e.fecha < v_hoy)
         OR (e.tipo IN ('wellness', 'combinado', 'rpe') AND e.creado_at < now() - interval '90 minutes')
         OR (e.tipo = 'entrenamiento' AND e.creado_at < now() - interval '3 hours')
         OR (e.tipo IN ('manual', 'convocatoria') AND e.creado_at < now() - interval '24 hours'));
    WITH tomados AS (
      SELECT e.id FROM public.avisos_envios e
       WHERE e.estado = 'pendiente' OR (e.estado = 'enviando' AND e.tomado_at < now() - interval '10 minutes')
       ORDER BY e.creado_at, e.id
       LIMIT least(greatest(coalesce(p_max, 10), 0), 50)
       FOR UPDATE SKIP LOCKED
    ), marcados AS (
      UPDATE public.avisos_envios e SET estado = 'enviando', tomado_at = now()
        FROM tomados t WHERE e.id = t.id
      RETURNING e.id, e.tipo, e.categoria_id, e.fecha, e.creado_at
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'categoria_id', m.categoria_id, 'fecha', m.fecha)
                              ORDER BY m.creado_at, m.id), '[]'::jsonb)
      INTO salida FROM marcados m;
    RETURN salida;
  END $f$;

  -- Un renglón por celular que tiene que recibir el envío, con el título, el cuerpo, la url, el tag y el ttl fijos.
  CREATE FUNCTION public.avisos_destinos(p_envio_id uuid)
   RETURNS TABLE(suscripcion_id uuid, jugador_id uuid, endpoint text, p256dh text, auth text, titulo text, cuerpo text,
                 url text, tag text, ttl integer)
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    SELECT s.id, o.jugador_id, s.endpoint, s.p256dh, s.auth, o.titulo, o.cuerpo, o.url, o.tag, o.ttl
      FROM avisos_privado.objetivo(p_envio_id) o
      JOIN public.avisos_suscripciones s ON s.jugador_id = o.jugador_id AND s.usuario_id = o.usuario_id
     WHERE o.titulo IS NOT NULL
     ORDER BY o.jugador_id, s.creada_at, s.id;
  $f$;

  -- Cuántas de las jugadoras a las que apunta el envío no lo reciben en ningún celular (sin cuenta activa, sin
  -- avisos activados o con ese tipo apagado). Es el «sin avisos» del historial.
  CREATE FUNCTION public.avisos_contar_sin_avisos(p_envio_id uuid)
   RETURNS integer
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    SELECT count(*)::integer FROM avisos_privado.objetivo(p_envio_id) o
     WHERE o.titulo IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.avisos_suscripciones s WHERE s.jugador_id = o.jugador_id AND s.usuario_id = o.usuario_id);
  $f$;

  -- Cierra un envío: borra las suscripciones vencidas (404/410), anota el último OK y deja el resultado.
  -- Solo cierra un envío que está 'enviando': un cierre tardío o repetido no pisa uno terminado (no hace nada).
  CREATE FUNCTION public.avisos_cerrar_envio(p_envio_id uuid, p_entregados integer, p_fallidos integer, p_sin_avisos integer,
    p_ok uuid[], p_vencidas uuid[])
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_entregados integer := coalesce(p_entregados, 0);
    v_fallidos integer := coalesce(p_fallidos, 0);
    v_sin integer := coalesce(p_sin_avisos, 0);
    v_vencidas uuid[] := coalesce(p_vencidas, '{}');
    v_estado text;
  BEGIN
    IF v_entregados < 0 OR v_fallidos < 0 OR v_sin < 0 THEN
      RAISE EXCEPTION 'cierre_invalido' USING ERRCODE = '22023';
    END IF;
    SELECT e.estado INTO v_estado FROM public.avisos_envios e WHERE e.id = p_envio_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'envio_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF v_estado <> 'enviando' THEN
      RETURN;
    END IF;
    DELETE FROM public.avisos_suscripciones s WHERE s.id = ANY (v_vencidas);
    UPDATE public.avisos_suscripciones s SET ultimo_ok_at = now() WHERE s.id = ANY (coalesce(p_ok, '{}'));
    UPDATE public.avisos_envios e
       SET estado = CASE WHEN v_entregados = 0 AND v_fallidos + cardinality(v_vencidas) > 0 THEN 'error' ELSE 'enviado' END,
           entregados = v_entregados, fallidos = v_fallidos, sin_avisos = v_sin,
           destinatarias = (SELECT count(*) FROM avisos_privado.objetivo(p_envio_id)),
           enviado_at = now()
     WHERE e.id = p_envio_id AND e.estado = 'enviando';
  END $f$;

  -- Permisos: nada para PUBLIC ni anon; authenticated, la jugadora y el staff; service_role, la Edge Function.
  REVOKE ALL ON FUNCTION avisos_privado.dia(uuid, date), avisos_privado.programar(timestamptz),
    avisos_privado.entrenamiento_publicado(), avisos_privado.config_por_defecto(), avisos_privado.objetivo(uuid),
    avisos_privado.tick(),
    public.portal_avisos_estado(), public.portal_avisos_suscribir(text, text, text, text), public.portal_avisos_desuscribir(text),
    public.portal_avisos_preferencias(boolean, boolean, boolean, boolean, boolean),
    public.avisos_panel(), public.avisos_jugadoras(uuid), public.avisos_guardar_config(uuid, boolean, smallint[], time, time),
    public.avisos_crear_pausa(uuid, date, date, text), public.avisos_borrar_pausa(uuid), public.avisos_mandar(uuid, uuid[], text),
    public.avisos_avisar_convocatoria(uuid), public.avisos_historial(uuid, integer),
    public.avisos_tomar_pendientes(integer), public.avisos_destinos(uuid), public.avisos_contar_sin_avisos(uuid),
    public.avisos_cerrar_envio(uuid, integer, integer, integer, uuid[], uuid[])
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION
    public.portal_avisos_estado(), public.portal_avisos_suscribir(text, text, text, text), public.portal_avisos_desuscribir(text),
    public.portal_avisos_preferencias(boolean, boolean, boolean, boolean, boolean),
    public.avisos_panel(), public.avisos_jugadoras(uuid), public.avisos_guardar_config(uuid, boolean, smallint[], time, time),
    public.avisos_crear_pausa(uuid, date, date, text), public.avisos_borrar_pausa(uuid), public.avisos_mandar(uuid, uuid[], text),
    public.avisos_avisar_convocatoria(uuid), public.avisos_historial(uuid, integer)
    TO authenticated;
  GRANT EXECUTE ON FUNCTION
    public.avisos_tomar_pendientes(integer), public.avisos_destinos(uuid), public.avisos_contar_sin_avisos(uuid),
    public.avisos_cerrar_envio(uuid, integer, integer, integer, uuid[], uuid[])
    TO service_role;

  -- ===================================================================================================
  -- 7a) Verificación de la estructura y los permisos.
  -- ===================================================================================================
  IF EXISTS (SELECT 1 FROM unnest(tablas) x JOIN pg_class c ON c.oid = ('public.' || x)::regclass
             WHERE NOT c.relrowsecurity
                OR has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
                OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = x
                                 AND p.policyname = 'sin_cuentas_jugadoras' AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL')
                OR EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = x AND p.permissive = 'PERMISSIVE')) THEN
    RAISE EXCEPTION 'Las tablas nuevas no quedaron con RLS, sin permisos y con la red. No se aplica nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity
               AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                                 AND p.policyname = 'sin_cuentas_jugadoras' AND p.permissive = 'RESTRICTIVE')) THEN
    RAISE EXCEPTION 'La red RESTRICTIVE no está en todas las tablas. No se aplica nada.';
  END IF;
  IF has_schema_privilege('anon', 'avisos_privado', 'USAGE') OR has_schema_privilege('authenticated', 'avisos_privado', 'USAGE')
     OR has_schema_privilege('service_role', 'avisos_privado', 'USAGE')
     OR EXISTS (SELECT 1 FROM pg_proc p
                WHERE (p.pronamespace = 'avisos_privado'::regnamespace
                       OR (p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%')))
                  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT p.prosecdef
                       OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']
                       OR (p.pronamespace = 'avisos_privado'::regnamespace
                           AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('service_role', p.oid, 'EXECUTE')))
                       OR (p.proname IN ('avisos_tomar_pendientes', 'avisos_destinos', 'avisos_contar_sin_avisos', 'avisos_cerrar_envio')
                           AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')))
                       OR (p.pronamespace = 'public'::regnamespace
                           AND p.proname NOT IN ('avisos_tomar_pendientes', 'avisos_destinos', 'avisos_contar_sin_avisos', 'avisos_cerrar_envio')
                           AND (NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('service_role', p.oid, 'EXECUTE')))))
     OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'avisos_privado'::regnamespace
            OR (p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%'))) <> 22 THEN
    RAISE EXCEPTION 'Los permisos de las funciones nuevas no quedaron como se esperaba. No se aplica nada.';
  END IF;
  IF (SELECT count(*) FROM public.avisos_config) <> (SELECT count(*) FROM public.categorias) THEN
    RAISE EXCEPTION 'No quedó una fila de config por categoría. No se aplica nada.';
  END IF;

  -- ===================================================================================================
  -- 7b) El staff ve exactamente lo mismo que antes en las tablas existentes, y nada en las nuevas.
  -- ===================================================================================================
  FOR t IN SELECT * FROM (VALUES ('coordinacion', sub_coord, v_coord), ('tecnico', sub_tecnico, v_tecnico),
                                 ('medico', sub_medico, v_medico)) AS x(rol, sub, email) LOOP
    IF t.email IS NULL THEN
      RAISE NOTICE 'Sin usuario de % para comparar: se saltea.', t.rol;
      CONTINUE;
    END IF;
    staff_despues := seguridad_privado.avisos_contar(t.sub, t.email);
    FOR r IN SELECT key, value FROM jsonb_each(staff_antes->t.rol) LOOP
      IF staff_despues->r.key IS DISTINCT FROM r.value THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % veía % en public.% y ahora ve %. No se aplica nada.', t.rol, r.value, r.key, staff_despues->r.key;
      END IF;
    END LOOP;
    FOREACH v_tabla IN ARRAY tablas LOOP
      IF staff_despues->v_tabla IS DISTINCT FROM '"42501"'::jsonb THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % lee public.% directamente (%). No se aplica nada.', t.rol, v_tabla, staff_despues->v_tabla;
      END IF;
    END LOOP;
  END LOOP;

  -- ===================================================================================================
  -- 7c) Prueba con datos que se deshacen: una categoría, una jugadora con cuenta y celular, el calendario a horas
  --     fijas, los destinos y lo que puede hacer cada rol.
  --     espera: 'ok' (anda), 'rechazo' (42501) o 'invalido' (22023); si hay valor esperado, se compara.
  -- ===================================================================================================
  v_cuenta_sub := gen_random_uuid();
  v_cuenta_email := 'prueba-avisos-' || replace(v_cuenta_sub::text, '-', '') || '@prueba.invalid';
  v_endpoint := 'https://fcm.googleapis.com/fcm/send/prueba-avisos-' || replace(v_cuenta_sub::text, '-', '');
  BEGIN
    -- Categoría nueva: el trigger le crea la config por defecto.
    INSERT INTO public.categorias (nombre, orden)
    VALUES ('Prueba de avisos ' || left(v_cuenta_sub::text, 8), (SELECT coalesce(max(c.orden), 0) + 1 FROM public.categorias c))
    RETURNING id INTO v_cat;
    IF NOT EXISTS (SELECT 1 FROM public.avisos_config c WHERE c.categoria_id = v_cat AND c.activo AND c.dias = '{3,4,5}'
                     AND c.hora_wellness = '07:10' AND c.hora_rpe = '10:15') THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: una categoría nueva no recibió la config por defecto.';
    END IF;
    UPDATE public.avisos_config SET dias = '{4}' WHERE categoria_id = v_cat;

    INSERT INTO public.jugadores (nombre, apellido, categoria_id) VALUES ('Prueba', 'Avisos', v_cat) RETURNING id INTO v_jug;
    INSERT INTO auth.users (id, email, aud, role) VALUES (v_cuenta_sub, v_cuenta_email, 'authenticated', 'authenticated');
    PERFORM public.cuentas_jugadoras_registrar(v_jug, v_cuenta_sub, v_cuenta_email, sub_coord);
    INSERT INTO public.avisos_suscripciones (jugador_id, usuario_id, endpoint, p256dh, auth, dispositivo)
    VALUES (v_jug, v_cuenta_sub, v_endpoint, v_p256, v_auth, 'android');

    -- Jueves 1/1/2026 a las 7:10 de Argentina: Wellness. Segunda corrida: nada nuevo.
    PERFORM avisos_privado.programar('2026-01-01 10:10:00+00');
    SELECT e.id INTO v_envio FROM public.avisos_envios e
     WHERE e.categoria_id = v_cat AND e.tipo = 'wellness' AND e.clave = 'manana:' || v_cat || ':2026-01-01';
    IF v_envio IS NULL THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: programar no creó el Wellness del día de entrenamiento.'; END IF;
    PERFORM avisos_privado.programar('2026-01-01 10:40:00+00');
    IF (SELECT count(*) FROM public.avisos_envios e WHERE e.categoria_id = v_cat) <> 1 THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: programar duplicó el Wellness.';
    END IF;
    -- Destinos: la jugadora con su celular y el texto fijo; si completó el Wellness, nada.
    IF (SELECT count(*) FROM public.avisos_destinos(v_envio) d
         WHERE d.jugador_id = v_jug AND d.endpoint = v_endpoint AND d.titulo = 'Wellness' AND d.cuerpo = 'Completá tu Wellness de hoy.'
           AND d.url = '/jugadora/?seccion=wellness' AND d.tag = 'wellness-2026-01-01' AND d.ttl = 10800) <> 1
       OR (SELECT count(*) FROM public.avisos_destinos(v_envio)) <> 1
       OR public.avisos_contar_sin_avisos(v_envio) <> 0 THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: avisos_destinos no devolvió el Wellness de la jugadora de prueba.';
    END IF;
    INSERT INTO public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar)
    VALUES (v_jug, '2026-01-01', 3, 3, 3, 3, 3);
    IF EXISTS (SELECT 1 FROM public.avisos_destinos(v_envio)) THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: el Wellness le llega a quien ya lo completó.';
    END IF;
    -- 8:41: fuera de la ventana. 10:15: RPE.
    PERFORM avisos_privado.programar('2026-01-01 11:41:00+00');
    PERFORM avisos_privado.programar('2026-01-01 13:15:00+00');
    IF (SELECT array_agg(e.tipo ORDER BY e.tipo) FROM public.avisos_envios e WHERE e.categoria_id = v_cat) IS DISTINCT FROM ARRAY['rpe', 'wellness'] THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: el RPE de las 10:15 o la ventana de 90 minutos no anduvieron.';
    END IF;
    -- Miércoles 31/12 (no es día de la categoría) con partido publicado: combinado.
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado) VALUES (v_cat, '2025-12-31', 'partido', 'publicado');
    PERFORM avisos_privado.programar('2025-12-31 10:10:00+00');
    IF NOT EXISTS (SELECT 1 FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha = '2025-12-31' AND e.tipo = 'combinado') THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: un día extra con partido publicado no dio el combinado.';
    END IF;
    -- Jueves 8/1 con Descanso en borrador, y jueves 15/1 con pausa de todas: nada.
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado) VALUES (v_cat, '2026-01-08', 'descanso', 'borrador');
    INSERT INTO public.avisos_pausas (categoria_id, desde, hasta, motivo) VALUES (NULL, '2026-01-15', '2026-01-15', 'Prueba');
    PERFORM avisos_privado.programar('2026-01-08 10:10:00+00');
    PERFORM avisos_privado.programar('2026-01-15 10:10:00+00');
    IF EXISTS (SELECT 1 FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha IN ('2026-01-08', '2026-01-15')) THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: salió un recordatorio en un día de Descanso o en pausa.';
    END IF;

    -- La jugadora no ve ninguna fila de ninguna tabla ni vista (incluidas las nuevas).
    vistas := seguridad_privado.avisos_contar(v_cuenta_sub, v_cuenta_email);
    IF NOT vistas ? 'avisos_envios' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: no se recorrieron las tablas de public.'; END IF;
    FOR r IN SELECT key, value FROM jsonb_each(vistas) LOOP
      IF r.value NOT IN ('0'::jsonb, '"42501"'::jsonb) THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: la cuenta de jugadora ve % en public.%. No se aplica nada.', r.value, r.key;
      END IF;
    END LOOP;

    FOR t IN
      SELECT * FROM (VALUES
        ('jugadora', 'ok',       'SELECT public.portal_avisos_estado()->>''dispositivos''',                          '1'),
        ('jugadora', 'ok',       'SELECT public.portal_avisos_suscribir(:endpoint || ''-2'', :p256, :auth, ''iphone'')::text', NULL),
        ('jugadora', 'invalido', 'SELECT public.portal_avisos_suscribir(''https://evil.example.com/x'', :p256, :auth, ''android'')::text', NULL),
        ('jugadora', 'ok',       'SELECT public.portal_avisos_preferencias(true, false, true, true, true)::text',     NULL),
        ('jugadora', 'ok',       'SELECT public.portal_avisos_desuscribir(:endpoint)::text',                          NULL),
        ('jugadora', 'rechazo',  'SELECT public.avisos_panel()::text',                                                NULL),
        ('jugadora', 'rechazo',  'SELECT public.avisos_mandar(:cat, NULL, ''Hola plantel'')::text',                   NULL),
        ('jugadora', 'rechazo',  'SELECT public.avisos_tomar_pendientes()::text',                                     NULL),
        ('jugadora', 'rechazo',  'SELECT count(*)::text FROM public.avisos_destinos(:envio)',                         NULL),
        ('coord',    'ok',       'SELECT jsonb_typeof(public.avisos_panel())',                                        'object'),
        ('coord',    'ok',       'SELECT (SELECT x->>''con_avisos'' FROM jsonb_array_elements(public.avisos_panel()->''categorias'') x WHERE x->>''categoria_id'' = :cat::text)', '1'),
        ('coord',    'ok',       'SELECT (public.avisos_mandar(:cat, NULL, ''Prueba de avisos'') IS NOT NULL)::text', 'true'),
        ('coord',    'invalido', 'SELECT public.avisos_mandar(:cat, NULL, ''ab'')::text',                             NULL),
        ('coord',    'ok',       'SELECT jsonb_typeof(public.avisos_historial(NULL))',                                'array'),
        ('coord',    'ok',       'SELECT jsonb_array_length(public.avisos_jugadoras(:cat))::text',                    '1'),
        ('coord',    'rechazo',  'SELECT count(*)::text FROM public.avisos_destinos(:envio)',                         NULL),
        ('coord',    'rechazo',  'SELECT public.portal_avisos_estado()::text',                                        NULL),
        ('coord',    'rechazo',  'SELECT count(*)::text FROM public.avisos_envios',                                   NULL),
        ('tecnico',  'rechazo',  'SELECT public.avisos_mandar(:cat, NULL, ''Hola plantel'')::text',                   NULL),
        ('tecnico',  'rechazo',  'SELECT public.avisos_panel()::text',                                                NULL),
        ('tecnico',  'rechazo',  'SELECT public.avisos_historial(:cat)::text',                                        NULL),
        ('tecnico',  'ok',       'SELECT jsonb_typeof(public.avisos_historial(NULL))',                                'array'),
        ('medico',   'rechazo',  'SELECT public.avisos_panel()::text',                                                NULL),
        ('medico',   'rechazo',  'SELECT public.avisos_mandar(:cat, NULL, ''Hola plantel'')::text',                   NULL),
        ('medico',   'rechazo',  'SELECT public.avisos_historial(NULL)::text',                                        NULL),
        ('nadie',    'rechazo',  'SELECT public.avisos_mandar(:cat, NULL, ''Hola plantel'')::text',                   NULL),
        ('anon',     'rechazo',  'SELECT public.avisos_panel()::text',                                                NULL),
        ('anon',     'rechazo',  'SELECT public.portal_avisos_estado()::text',                                        NULL),
        ('anon',     'rechazo',  'SELECT public.avisos_tomar_pendientes()::text',                                     NULL),
        ('service',  'ok',       'SELECT count(*)::text FROM public.avisos_destinos(:envio)',                         '0'),
        ('service',  'rechazo',  'SELECT avisos_privado.tick()::text',                                                NULL)
      ) AS v(cuenta, espera, plantilla, esperado)
    LOOP
      v_email := CASE t.cuenta WHEN 'jugadora' THEN v_cuenta_email WHEN 'coord' THEN v_coord WHEN 'tecnico' THEN v_tecnico
                               WHEN 'medico' THEN v_medico WHEN 'nadie' THEN 'sin-perfil@prueba.invalid' ELSE '' END;
      v_sub := CASE t.cuenta WHEN 'jugadora' THEN v_cuenta_sub WHEN 'coord' THEN sub_coord WHEN 'tecnico' THEN sub_tecnico
                             WHEN 'medico' THEN sub_medico WHEN 'nadie' THEN '00000000-0000-4000-8000-0000000000ff'::uuid END;
      IF v_email IS NULL THEN
        RAISE NOTICE 'Sin usuario de % para probar: se saltea "%".', t.cuenta, t.plantilla;
        CONTINUE;
      END IF;
      sentencia := replace(replace(replace(replace(replace(t.plantilla,
        ':cat', quote_literal(v_cat) || '::uuid'), ':envio', quote_literal(v_envio) || '::uuid'),
        ':endpoint', quote_literal(v_endpoint)), ':p256', quote_literal(v_p256)), ':auth', quote_literal(v_auth));
      BEGIN
        PERFORM set_config('request.jwt.claims',
          CASE t.cuenta WHEN 'anon' THEN '{"role":"anon"}' WHEN 'service' THEN '{"role":"service_role"}'
               ELSE json_build_object('email', v_email, 'sub', v_sub, 'role', 'authenticated')::text END, true);
        EXECUTE format('SET LOCAL ROLE %I', CASE t.cuenta WHEN 'anon' THEN 'anon' WHEN 'service' THEN 'service_role' ELSE 'authenticated' END);
        EXECUTE sentencia INTO v_texto;
        IF t.espera <> 'ok' THEN
          RAISE EXCEPTION 'PRUEBA_FALLIDA: % pudo hacer: %', t.cuenta, sentencia;
        ELSIF t.esperado IS NOT NULL AND v_texto IS DISTINCT FROM t.esperado THEN
          RAISE EXCEPTION 'PRUEBA_FALLIDA: % obtuvo "%" con: %', t.cuenta, v_texto, sentencia;
        END IF;
        RAISE EXCEPTION 'DESHACER_PRUEBA';
      EXCEPTION
        WHEN insufficient_privilege THEN
          IF t.espera <> 'rechazo' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: % no pudo hacer: % (%)', t.cuenta, sentencia, SQLERRM; END IF;
        WHEN invalid_parameter_value THEN
          IF t.espera <> 'invalido' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: % recibió un dato inválido en: % (%)', t.cuenta, sentencia, SQLERRM; END IF;
        WHEN OTHERS THEN
          IF SQLERRM = 'DESHACER_PRUEBA' THEN NULL;
          ELSIF SQLERRM LIKE 'PRUEBA_FALLIDA%' THEN RAISE;
          ELSE RAISE EXCEPTION 'Prueba de % con "%": error inesperado: %', t.cuenta, sentencia, SQLERRM;
          END IF;
      END;
    END LOOP;

    -- Un manual de coordinación le llega con su título; desactivada la cuenta, ya no (ni usa las funciones de avisos).
    INSERT INTO public.avisos_envios (tipo, categoria_id, fecha, texto, rol_remitente)
    VALUES ('manual', v_cat, '2026-01-01', 'Prueba', 'coordinacion') RETURNING id INTO v_envio;
    IF (SELECT count(*) FROM public.avisos_destinos(v_envio) d
         WHERE d.jugador_id = v_jug AND d.titulo = 'Mensaje de coordinación' AND d.cuerpo = 'Prueba'
           AND d.url = '/jugadora/?seccion=inicio' AND d.tag = 'manual-' || v_envio AND d.ttl = 86400) <> 1 THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: avisos_destinos no devolvió el manual de la jugadora de prueba.';
    END IF;
    PERFORM public.cuentas_jugadoras_estado(v_jug, false);
    IF EXISTS (SELECT 1 FROM public.avisos_destinos(v_envio)) OR public.avisos_contar_sin_avisos(v_envio) <> 1 THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: una cuenta desactivada aparece en los destinos.';
    END IF;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('email', v_cuenta_email, 'sub', v_cuenta_sub, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      PERFORM public.portal_avisos_estado();
      RAISE EXCEPTION 'PRUEBA_FALLIDA: una cuenta desactivada pudo usar portal_avisos_estado.';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'Esta cuenta no está activa.' THEN RAISE; END IF;
    END;

    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- No quedó nada de la prueba.
  IF EXISTS (SELECT 1 FROM public.avisos_envios) OR EXISTS (SELECT 1 FROM public.avisos_suscripciones)
     OR EXISTS (SELECT 1 FROM public.avisos_pausas) OR EXISTS (SELECT 1 FROM public.avisos_preferencias)
     OR EXISTS (SELECT 1 FROM public.categorias c WHERE c.id = v_cat)
     OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_cuenta_sub) THEN
    RAISE EXCEPTION 'Quedaron datos de prueba. No se aplica nada.';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'La verificación no volvió al usuario postgres. No se aplica nada.';
  END IF;
  DROP FUNCTION seguridad_privado.avisos_contar(uuid, text);

  -- ===================================================================================================
  -- 8) Tarea de pg_cron: cada minuto, como postgres.
  -- ===================================================================================================
  v_jobid := cron.schedule('avisos-tick', '* * * * *', 'SELECT avisos_privado.tick()');
  IF (SELECT count(*) FROM cron.job j WHERE j.jobname = 'avisos-tick' AND j.command = 'SELECT avisos_privado.tick()'
        AND j.schedule = '* * * * *') <> 1 THEN
    RAISE EXCEPTION 'La tarea de cron avisos-tick no quedó agendada. No se aplica nada.';
  END IF;
  INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre, detalle) VALUES ('cron', 'avisos-tick', v_jobid::text);

  -- Limpieza diaria del registro de corridas de avisos-tick (1440 por día): a las 4:17 UTC (1:17 en Argentina) borra
  -- las de más de 7 días, solo de esa tarea (por su jobid).
  v_limpieza := format('DELETE FROM cron.job_run_details WHERE jobid = %s AND coalesce(end_time, start_time) < now() - interval ''7 days''', v_jobid);
  v_jobid_limpieza := cron.schedule('avisos-limpieza', '17 4 * * *', v_limpieza);
  IF (SELECT count(*) FROM cron.job j WHERE j.jobname = 'avisos-limpieza' AND j.command = v_limpieza
        AND j.schedule = '17 4 * * *') <> 1 THEN
    RAISE EXCEPTION 'La tarea de cron avisos-limpieza no quedó agendada. No se aplica nada.';
  END IF;
  INSERT INTO seguridad_privado.respaldo_avisos (tipo, nombre, detalle) VALUES ('cron', 'avisos-limpieza', v_jobid_limpieza::text);

  RAISE NOTICE 'Avisos aplicados: 5 tablas con la red, 22 funciones, 2 triggers y las tareas avisos-tick (job %) y avisos-limpieza (job %).',
    v_jobid, v_jobid_limpieza;
  PERFORM pg_notify('pgrst', 'reload schema');
END
$avisos$;

-- Resultado: tablas, funciones, triggers y la tarea de cron.
SELECT 'tabla' AS que, c.relname::text AS detalle FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'avisos\_%' AND c.relkind = 'r'
UNION ALL
SELECT 'config', c.nombre || ' · ' || CASE WHEN a.activo THEN 'activo' ELSE 'inactivo' END || ' · días ' || a.dias::text
       || ' · ' || to_char(a.hora_wellness, 'HH24:MI') || ' / ' || to_char(a.hora_rpe, 'HH24:MI')
FROM public.avisos_config a JOIN public.categorias c ON c.id = a.categoria_id
UNION ALL
SELECT 'función', p.oid::regprocedure::text FROM pg_proc p
WHERE p.pronamespace = to_regnamespace('avisos_privado')
   OR (p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%'))
UNION ALL
SELECT 'trigger', tgrelid::regclass::text || ' · ' || tgname FROM pg_trigger
WHERE tgname IN ('avisos_entrenamiento_publicado', 'avisos_config_por_defecto')
UNION ALL
SELECT 'cron', jobname || ' · ' || schedule || ' · ' || command FROM cron.job WHERE jobname IN ('avisos-tick', 'avisos-limpieza')
ORDER BY 1, 2;
