-- Cuentas de jugadoras, etapa 1: la cuenta de cada jugadora, el cierre de lectura y las funciones del portal.
--
-- Qué hace:
--   1. Tabla public.cuentas_jugadoras (una cuenta por jugadora, atada a un usuario de Auth). Tiene RLS y ningún
--      permiso para anon ni authenticated: solo la usan las funciones de abajo y service_role (la Edge Function).
--   2. Esquema portal_privado con:
--        mi_jugadora_id():     el jugador_id de la cuenta ACTIVA de quien llama, o NULL (la usan las portal_*);
--        es_cuenta_jugadora(): true si quien llama tiene una cuenta de jugadora, activa o no (la usa la red).
--   3. Funciones del portal (solo authenticated, y solo responden a una cuenta activa; si no, 42501
--      «Esta cuenta no está activa.»): portal_mi_perfil, portal_mis_numeros, portal_wellness_respondio,
--      portal_wellness_guardar, portal_rpe_guardar y portal_entrenamiento_hoy. Wellness, RPE y entrenamiento usan
--      las funciones públicas que ya existen, con la categoría y el id que salen de la cuenta: mismas validaciones.
--   4. Funciones de administración: cuentas_jugadoras_listar (solo coordinación) y cuentas_jugadoras_registrar /
--      cuentas_jugadoras_estado (solo service_role, las llama la Edge Function).
--      cuentas_jugadoras_registrar exige que el mail del usuario de Auth (p_usuario_id) sea el mismo p_email; si no,
--      error 22023 «usuario_no_coincide» (también si p_usuario_id no existe en Auth). Así un usuario del staff nunca
--      queda atado a una jugadora.
--   5. Un mail no puede ser staff y jugadora a la vez: control al registrar y trigger en perfiles, que rechaza el mail
--      guardado en la cuenta y también el mail actual del usuario en Auth (por si la jugadora lo cambia).
--   6. Red RESTRICTIVE "sin_cuentas_jugadoras" en todas las tablas de public con RLS: ninguna cuenta de jugadora
--      (activa o desactivada) lee ni escribe ninguna tabla, aunque más adelante alguien agregue por error una
--      política permisiva.
--   7. Cierre de las 4 políticas de lectura abiertas a cualquier logueado (analisis_tipos_accion, categorias,
--      datafem_tablas y evaluacion_criterios): pasan a pedir un rol del staff (mi_rol() IS NOT NULL).
--      El staff ve exactamente lo mismo que antes.
--
-- anon no gana nada: sigue con sus 5 funciones públicas.
--
-- Sabido y aceptado: una cuenta de jugadora es un usuario authenticated y puede llamar a las funciones del link
-- público (wellness_publico_*, rpe_publico_guardar, planificacion_publica_hoy) exactamente como anon, con cualquier
-- jugadora de la categoría. No abre nada nuevo: el link público sigue como respaldo, como dice el diseño.
--
-- Cuándo correrla: en el orden de «Puesta en producción» del plan de cuentas de jugadoras, antes de subir la Edge
-- Function y la app /jugadora/. Es compatible con el código que hoy está en producción.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómica aunque el editor separe las sentencias.
-- Bloqueos: crea una política en cada tabla de public con RLS, así que durante la corrida toma bloqueos fuertes
-- sobre todas ellas (la app queda frenada unos segundos). Correrla con poco uso, por ejemplo de noche. Cada bloqueo
-- espera como máximo 5 s (lock_timeout): si una tabla está ocupada, la migración aborta sin aplicar nada y se vuelve
-- a correr.
-- Guarda un respaldo en seguridad_privado.respaldo_cuentas_jugadoras y verifica al final:
--   - con una cuenta de prueba (usuario de Auth y cuenta creados y deshechos dentro de la verificación), que la
--     jugadora ve 0 filas o recibe 42501 en todas las tablas y vistas de public, y que cada función del portal anda;
--   - que coordinación, técnico, PF y médico (usuarios reales) ven las mismas cantidades que antes en cada tabla.
-- Si algo falla, no se aplica nada.
--
-- Reversión: supabase/rollback/20261116120000_cuentas_jugadoras_etapa1.sql (no corre si ya hay cuentas).

DO $cuentas_jugadoras$
DECLARE
  r record;
  t record;
  n bigint;
  ya boolean;
  v_coord text; v_tecnico text; v_pf text; v_medico text;
  sub_coord uuid; sub_tecnico uuid; sub_pf uuid; sub_medico uuid;
  v_jugadora uuid; v_nombre text; v_cat uuid;
  v_sub uuid; v_email text; v_cuenta_email text; v_cuenta_sub uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  staff_antes jsonb := '{}';
  staff_despues jsonb;
  vistas jsonb;
  sentencia text;
  v_texto text;
  restrictivas integer := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===================================================================================================
  -- 0) Controles previos: que la base esté como la auditamos y que esto no se haya aplicado.
  -- ===================================================================================================
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_cuentas_jugadoras') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_cuentas_jugadoras)' INTO ya;
    IF ya THEN RAISE EXCEPTION 'La migración de cuentas de jugadoras ya se aplicó (hay respaldo guardado).'; END IF;
  END IF;
  IF to_regclass('public.cuentas_jugadoras') IS NOT NULL OR to_regnamespace('portal_privado') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sin_cuentas_jugadoras') THEN
    RAISE EXCEPTION 'Ya hay una tabla, un esquema o políticas de cuentas de jugadoras. Revisar antes de seguir.';
  END IF;
  IF to_regprocedure('public.mi_rol()') IS NULL
     OR to_regprocedure('public.wellness_publico_respondio(uuid,uuid)') IS NULL
     OR to_regprocedure('public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)') IS NULL
     OR to_regprocedure('public.rpe_publico_guardar(uuid,uuid,date,text,integer)') IS NULL
     OR to_regprocedure('public.planificacion_publica_hoy(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta mi_rol() o alguna de las funciones públicas de Wellness, RPE o entrenamiento. No continuar.';
  END IF;

  -- Las 4 políticas de lectura abiertas tienen que estar exactamente como en la auditoría (Tarea 0).
  IF (SELECT count(*) FROM pg_policies p
      JOIN (VALUES
        ('analisis_tipos_accion', 'tipos_accion_lectura',                      ARRAY['authenticated'], 'true'),
        ('categorias',            'leer categorias',                           ARRAY['public'],        '(auth.role() = ''authenticated''::text)'),
        ('datafem_tablas',        'Usuarios autenticados pueden leer DataFem', ARRAY['authenticated'], 'true'),
        ('evaluacion_criterios',  'criterios_select',                          ARRAY['authenticated'], 'true')
      ) AS a(tabla, politica, roles, qual)
        ON p.schemaname = 'public' AND p.tablename = a.tabla AND p.policyname = a.politica
      WHERE p.permissive = 'PERMISSIVE' AND p.cmd = 'SELECT' AND p.roles::text[] = a.roles
        AND p.qual = a.qual AND p.with_check IS NULL) <> 4 THEN
    RAISE EXCEPTION 'Las 4 políticas de lectura abierta no son las auditadas (Tarea 0). Revisar antes de seguir.';
  END IF;

  -- Ninguna tabla de public sin RLS (ni vista que no respete el RLS de quien consulta) puede estar abierta a
  -- authenticated: la red RESTRICTIVE no la cubriría.
  FOR r IN
    SELECT c.relname, c.relkind FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND ((c.relkind IN ('r', 'p') AND NOT c.relrowsecurity)
        OR c.relkind IN ('m', 'f')
        OR (c.relkind = 'v' AND NOT EXISTS (SELECT 1 FROM pg_options_to_table(c.reloptions) o
                                            WHERE o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true', 'on', '1', 'yes'))))
      AND (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
  LOOP
    RAISE EXCEPTION 'public.% (%) está sin RLS (o es una vista sin security_invoker) y authenticated tiene permisos. Revisar antes de seguir.',
      r.relname, r.relkind;
  END LOOP;

  -- Usuarios reales para la prueba final (uno por rol; coordinación es obligatorio).
  SELECT p.email, u.id INTO v_coord, sub_coord FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'coordinacion' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_tecnico, sub_tecnico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'tecnico' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_pf, sub_pf FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'preparador_fisico' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_medico, sub_medico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'medico' ORDER BY p.email LIMIT 1;
  IF v_coord IS NULL THEN RAISE EXCEPTION 'No hay ningún perfil de coordinación con usuario para probar.'; END IF;
  SELECT j.id, j.nombre, j.categoria_id INTO v_jugadora, v_nombre, v_cat FROM public.jugadores j ORDER BY j.id LIMIT 1;
  IF v_jugadora IS NULL THEN RAISE EXCEPTION 'No hay jugadoras para probar la cuenta.'; END IF;

  -- Ayudante de la verificación (se borra al final): cuántas filas ve un usuario en cada tabla y vista de public,
  -- o el código de error. Cada consulta corre como authenticated y se deshace.
  -- No fija search_path a propósito: tiene que correr con el mismo que la app, porque algunas funciones que usan las
  -- políticas (por ejemplo categoria_de_jugador) nombran las tablas sin esquema. No es SECURITY DEFINER.
  IF to_regnamespace('seguridad_privado') IS NULL THEN
    CREATE SCHEMA seguridad_privado;
    REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated, service_role;
  END IF;
  CREATE FUNCTION seguridad_privado.cuentas_jugadoras_contar(p_sub uuid, p_email text)
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
  REVOKE ALL ON FUNCTION seguridad_privado.cuentas_jugadoras_contar(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

  -- Lo que ve hoy el staff, para comparar al final.
  FOR t IN SELECT * FROM (VALUES ('coordinacion', sub_coord, v_coord), ('tecnico', sub_tecnico, v_tecnico),
                                 ('preparador_fisico', sub_pf, v_pf), ('medico', sub_medico, v_medico)) AS x(rol, sub, email)
           WHERE x.email IS NOT NULL LOOP
    staff_antes := staff_antes || jsonb_build_object(t.rol, seguridad_privado.cuentas_jugadoras_contar(t.sub, t.email));
  END LOOP;

  -- ===================================================================================================
  -- 1) Respaldo (privado): la definición exacta de las 4 políticas que se cierran. Las tablas donde se agrega la
  --    red RESTRICTIVE se anotan en el paso 4.
  -- ===================================================================================================
  CREATE TABLE seguridad_privado.respaldo_cuentas_jugadoras (
    orden integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('politica', 'restrictiva')),
    tabla text NOT NULL,
    politica text NOT NULL,
    permisiva text,
    cmd text,
    roles text[],
    qual text,
    with_check text,
    detalle text,
    guardado_en timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_cuentas_jugadoras FROM PUBLIC, anon, authenticated, service_role;

  INSERT INTO seguridad_privado.respaldo_cuentas_jugadoras (tipo, tabla, politica, permisiva, cmd, roles, qual, with_check, detalle)
  SELECT 'politica', tablename, policyname, permissive, cmd, roles::text[], qual, with_check,
         format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
           policyname, schemaname, tablename, permissive, cmd,
           (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
           CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
           CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
  FROM pg_policies
  WHERE schemaname = 'public' AND (tablename, policyname) IN (
    ('analisis_tipos_accion', 'tipos_accion_lectura'), ('categorias', 'leer categorias'),
    ('datafem_tablas', 'Usuarios autenticados pueden leer DataFem'), ('evaluacion_criterios', 'criterios_select'))
  ORDER BY tablename;

  -- ===================================================================================================
  -- 2) Tabla de cuentas.
  -- ===================================================================================================
  CREATE TABLE public.cuentas_jugadoras (
    jugador_id uuid PRIMARY KEY REFERENCES public.jugadores (id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    activa boolean NOT NULL DEFAULT true,
    creada_por uuid,
    creada_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.cuentas_jugadoras ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.cuentas_jugadoras FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.cuentas_jugadoras TO service_role;

  -- ===================================================================================================
  -- 3) Esquema portal_privado, funciones y trigger.
  -- ===================================================================================================
  CREATE SCHEMA portal_privado;
  REVOKE ALL ON SCHEMA portal_privado FROM PUBLIC, anon, authenticated, service_role;
  -- authenticated necesita usar el esquema: la red RESTRICTIVE llama a es_cuenta_jugadora() como el usuario.
  GRANT USAGE ON SCHEMA portal_privado TO authenticated;

  -- La identidad de la jugadora sale siempre de acá: la cuenta activa del usuario logueado, o NULL.
  CREATE FUNCTION portal_privado.mi_jugadora_id()
   RETURNS uuid
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    SELECT c.jugador_id FROM public.cuentas_jugadoras c WHERE c.usuario_id = auth.uid() AND c.activa;
  $f$;

  -- Para la red RESTRICTIVE: ¿quien llama tiene una cuenta de jugadora? Activa o no: una cuenta desactivada
  -- tampoco puede leer ni escribir tablas.
  CREATE FUNCTION portal_privado.es_cuenta_jugadora()
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    SELECT EXISTS (SELECT 1 FROM public.cuentas_jugadoras c WHERE c.usuario_id = auth.uid());
  $f$;

  -- Igual, pero corta si la cuenta no está activa. Solo la usan las funciones portal_*.
  CREATE FUNCTION portal_privado.jugadora_activa()
   RETURNS uuid
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.mi_jugadora_id();
  BEGIN
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Esta cuenta no está activa.' USING ERRCODE = '42501';
    END IF;
    RETURN v_id;
  END $f$;

  -- Un mail de jugadora no puede pasar a ser del staff.
  CREATE FUNCTION portal_privado.perfil_no_es_jugadora()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  BEGIN
    -- Se compara con el mail guardado en la cuenta y con el mail ACTUAL del usuario en Auth (la jugadora podría
    -- cambiarlo, y mi_rol() busca el perfil por el mail del token).
    IF EXISTS (SELECT 1 FROM public.cuentas_jugadoras c WHERE c.email = lower(btrim(NEW.email)))
       OR EXISTS (SELECT 1 FROM public.cuentas_jugadoras c JOIN auth.users u ON u.id = c.usuario_id
                  WHERE lower(btrim(u.email)) = lower(btrim(NEW.email))) THEN
      RAISE EXCEPTION 'email_en_uso' USING ERRCODE = '23505', DETAIL = 'Ese mail es de una cuenta de jugadora.';
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER perfil_no_es_jugadora BEFORE INSERT OR UPDATE OF email ON public.perfiles
    FOR EACH ROW EXECUTE FUNCTION portal_privado.perfil_no_es_jugadora();

  -- Perfil básico: nombre, apellido, foto y categoría actual.
  CREATE FUNCTION public.portal_mi_perfil()
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa(); salida jsonb;
  BEGIN
    SELECT jsonb_build_object('nombre', j.nombre, 'apellido', j.apellido, 'foto_url', j.foto_url, 'categoria', c.nombre)
      INTO salida
      FROM public.jugadores j LEFT JOIN public.categorias c ON c.id = j.categoria_id
     WHERE j.id = v_id;
    RETURN salida;
  END $f$;

  -- Partidos (cada fila de estadisticas_jugador es un partido jugado, como en el perfil del staff) y asistencia
  -- del año pedido (por defecto, el año actual de Argentina). Justificadas = lesionado + enfermo, sin el motivo.
  CREATE FUNCTION public.portal_mis_numeros(p_anio integer DEFAULT NULL)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE
    v_id uuid := portal_privado.jugadora_activa();
    v_anio integer := coalesce(p_anio, extract(year FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::integer);
    v_desde date; v_hasta date;
    v_anios jsonb; v_partidos jsonb; v_asistencia jsonb;
  BEGIN
    IF v_anio NOT BETWEEN 1900 AND 2200 THEN
      RAISE EXCEPTION 'Año no válido.' USING ERRCODE = '22023';
    END IF;
    v_desde := make_date(v_anio, 1, 1);
    v_hasta := make_date(v_anio + 1, 1, 1);

    SELECT coalesce(jsonb_agg(x.anio ORDER BY x.anio DESC), '[]'::jsonb) INTO v_anios FROM (
      SELECT extract(year FROM p.fecha)::integer AS anio
        FROM public.estadisticas_jugador e JOIN public.partidos p ON p.id = e.partido_id
       WHERE e.jugador_id = v_id
      UNION
      SELECT extract(year FROM a.fecha)::integer FROM public.asistencias a WHERE a.jugador_id = v_id) x;

    SELECT jsonb_build_object('jugados', count(*), 'titularidades', count(*) FILTER (WHERE e.titular),
                              'minutos', coalesce(sum(e.minutos_jugados), 0))
      INTO v_partidos
      FROM public.estadisticas_jugador e JOIN public.partidos p ON p.id = e.partido_id
     WHERE e.jugador_id = v_id AND p.fecha >= v_desde AND p.fecha < v_hasta;

    SELECT jsonb_build_object('presentes', x.presentes, 'tardes', x.tardes, 'ausentes', x.ausentes,
                              'justificadas', x.justificadas, 'total', x.total,
                              'porcentaje', CASE WHEN x.total = 0 THEN NULL
                                                 ELSE round(100.0 * (x.presentes + x.tardes) / x.total)::integer END)
      INTO v_asistencia
      FROM (SELECT count(*) FILTER (WHERE a.estado = 'presente') AS presentes,
                   count(*) FILTER (WHERE a.estado = 'tarde') AS tardes,
                   count(*) FILTER (WHERE a.estado = 'ausente') AS ausentes,
                   count(*) FILTER (WHERE a.estado IN ('lesionado', 'enfermo')) AS justificadas,
                   count(*) AS total
              FROM public.asistencias a
             WHERE a.jugador_id = v_id AND a.fecha >= v_desde AND a.fecha < v_hasta) x;

    RETURN jsonb_build_object('anios', v_anios, 'anio', v_anio, 'partidos', v_partidos, 'asistencia', v_asistencia);
  END $f$;

  -- Wellness, RPE y entrenamiento de hoy: las mismas funciones del link público, con la categoría actual y el id
  -- que salen de la cuenta.
  CREATE FUNCTION public.portal_wellness_respondio()
   RETURNS boolean
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    RETURN public.wellness_publico_respondio((SELECT j.categoria_id FROM public.jugadores j WHERE j.id = v_id), v_id);
  END $f$;

  CREATE FUNCTION public.portal_wellness_guardar(p_sueno integer, p_dolor_muscular integer, p_fatiga integer, p_estres integer,
    p_animo_entrenar integer, p_zona_dolor text DEFAULT NULL, p_fase_ciclo text DEFAULT NULL)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    PERFORM public.wellness_publico_guardar((SELECT j.categoria_id FROM public.jugadores j WHERE j.id = v_id), v_id,
      p_sueno, p_dolor_muscular, p_fatiga, p_estres, p_animo_entrenar, p_zona_dolor, p_fase_ciclo);
  END $f$;

  CREATE FUNCTION public.portal_rpe_guardar(p_fecha date, p_tipo text, p_rpe integer)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    PERFORM public.rpe_publico_guardar((SELECT j.categoria_id FROM public.jugadores j WHERE j.id = v_id), v_id, p_fecha, p_tipo, p_rpe);
  END $f$;

  CREATE FUNCTION public.portal_entrenamiento_hoy()
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_id uuid := portal_privado.jugadora_activa();
  BEGIN
    RETURN public.planificacion_publica_hoy((SELECT j.categoria_id FROM public.jugadores j WHERE j.id = v_id), v_id);
  END $f$;

  -- Coordinación: las jugadoras de una categoría con el estado de su cuenta (NULL si no tiene).
  CREATE FUNCTION public.cuentas_jugadoras_listar(p_categoria_id uuid)
   RETURNS jsonb
   LANGUAGE plpgsql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  BEGIN
    IF public.mi_rol() IS DISTINCT FROM 'coordinacion' THEN
      RAISE EXCEPTION 'Solo coordinación puede ver las cuentas de las jugadoras.' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('jugador_id', j.id, 'nombre', j.nombre, 'apellido', j.apellido, 'foto_url', j.foto_url,
                                          'email', c.email, 'activa', c.activa, 'ultimo_ingreso', u.last_sign_in_at)
                       ORDER BY j.apellido, j.nombre, j.id)
        FROM public.jugadores j
        LEFT JOIN public.cuentas_jugadoras c ON c.jugador_id = j.id
        LEFT JOIN auth.users u ON u.id = c.usuario_id
       WHERE j.categoria_id = p_categoria_id), '[]'::jsonb);
  END $f$;

  -- Edge Function (service_role): guarda la cuenta recién creada en Auth.
  CREATE FUNCTION public.cuentas_jugadoras_registrar(p_jugador_id uuid, p_usuario_id uuid, p_email text, p_creada_por uuid)
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_email text := lower(btrim(p_email));
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = p_jugador_id) THEN
      RAISE EXCEPTION 'jugadora_inexistente' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.cuentas_jugadoras c WHERE c.jugador_id = p_jugador_id) THEN
      RAISE EXCEPTION 'ya_tiene_cuenta' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (SELECT 1 FROM public.cuentas_jugadoras c WHERE c.email = v_email)
       OR EXISTS (SELECT 1 FROM public.perfiles p WHERE lower(btrim(p.email)) = v_email) THEN
      RAISE EXCEPTION 'email_en_uso' USING ERRCODE = '23505';
    END IF;
    -- El usuario de Auth tiene que ser el que se creó con ese mail (nunca uno del staff).
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_usuario_id AND lower(btrim(u.email)) = v_email) THEN
      RAISE EXCEPTION 'usuario_no_coincide' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.cuentas_jugadoras (jugador_id, usuario_id, email, creada_por)
    VALUES (p_jugador_id, p_usuario_id, v_email, p_creada_por);
  END $f$;

  -- Edge Function (service_role): activa o desactiva la cuenta y devuelve el usuario de Auth para bloquearlo.
  CREATE FUNCTION public.cuentas_jugadoras_estado(p_jugador_id uuid, p_activa boolean)
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO ''
  AS $f$
  DECLARE v_usuario uuid;
  BEGIN
    UPDATE public.cuentas_jugadoras SET activa = p_activa WHERE jugador_id = p_jugador_id RETURNING usuario_id INTO v_usuario;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sin_cuenta' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_usuario;
  END $f$;

  REVOKE ALL ON FUNCTION portal_privado.mi_jugadora_id(), portal_privado.es_cuenta_jugadora(), portal_privado.jugadora_activa(),
    portal_privado.perfil_no_es_jugadora(),
    public.portal_mi_perfil(), public.portal_mis_numeros(integer), public.portal_wellness_respondio(),
    public.portal_wellness_guardar(integer, integer, integer, integer, integer, text, text),
    public.portal_rpe_guardar(date, text, integer), public.portal_entrenamiento_hoy(),
    public.cuentas_jugadoras_listar(uuid), public.cuentas_jugadoras_registrar(uuid, uuid, text, uuid),
    public.cuentas_jugadoras_estado(uuid, boolean)
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION portal_privado.mi_jugadora_id(), portal_privado.es_cuenta_jugadora(),
    public.portal_mi_perfil(), public.portal_mis_numeros(integer), public.portal_wellness_respondio(),
    public.portal_wellness_guardar(integer, integer, integer, integer, integer, text, text),
    public.portal_rpe_guardar(date, text, integer), public.portal_entrenamiento_hoy(),
    public.cuentas_jugadoras_listar(uuid)
    TO authenticated;
  GRANT EXECUTE ON FUNCTION public.cuentas_jugadoras_registrar(uuid, uuid, text, uuid), public.cuentas_jugadoras_estado(uuid, boolean)
    TO service_role;

  -- ===================================================================================================
  -- 4) Red RESTRICTIVE en todas las tablas de public con RLS (incluida cuentas_jugadoras).
  -- ===================================================================================================
  FOR r IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity ORDER BY 1 LOOP
    EXECUTE format('CREATE POLICY sin_cuentas_jugadoras ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()))', r.relname);
    INSERT INTO seguridad_privado.respaldo_cuentas_jugadoras (tipo, tabla, politica) VALUES ('restrictiva', r.relname, 'sin_cuentas_jugadoras');
    restrictivas := restrictivas + 1;
  END LOOP;

  -- ===================================================================================================
  -- 5) Cierre de las 4 políticas de lectura abiertas: mismo nombre, mismos roles, solo para el staff.
  -- ===================================================================================================
  FOR r IN SELECT tabla, politica FROM seguridad_privado.respaldo_cuentas_jugadoras WHERE tipo = 'politica' ORDER BY orden LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (public.mi_rol() IS NOT NULL)', r.politica, r.tabla);
  END LOOP;

  -- ===================================================================================================
  -- 6a) Verificación de la estructura.
  -- ===================================================================================================
  IF (SELECT count(*) FROM seguridad_privado.respaldo_cuentas_jugadoras WHERE tipo = 'politica') <> 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND qual LIKE '%mi_rol() IS NOT NULL%' AND (tablename, policyname) IN (
          ('analisis_tipos_accion', 'tipos_accion_lectura'), ('categorias', 'leer categorias'),
          ('datafem_tablas', 'Usuarios autenticados pueden leer DataFem'), ('evaluacion_criterios', 'criterios_select'))) <> 4 THEN
    RAISE EXCEPTION 'Las 4 políticas de lectura no quedaron cerradas. No se aplica nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relrowsecurity
               AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                                 AND p.policyname = 'sin_cuentas_jugadoras' AND p.permissive = 'RESTRICTIVE'))
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cuentas_jugadoras' AND policyname = 'sin_cuentas_jugadoras')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cuentas_jugadoras' AND permissive = 'PERMISSIVE') THEN
    RAISE EXCEPTION 'La red RESTRICTIVE no quedó en todas las tablas. No se aplica nada.';
  END IF;
  IF has_table_privilege('authenticated', 'public.cuentas_jugadoras', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.cuentas_jugadoras', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_schema_privilege('anon', 'portal_privado', 'USAGE')
     OR EXISTS (SELECT 1 FROM pg_proc p
                WHERE (p.pronamespace = 'portal_privado'::regnamespace
                       OR (p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'portal\_%' OR p.proname LIKE 'cuentas\_jugadoras\_%')))
                  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT p.prosecdef
                       OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
     OR has_function_privilege('authenticated', 'public.cuentas_jugadoras_registrar(uuid,uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cuentas_jugadoras_estado(uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'portal_privado.jugadora_activa()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'portal_privado.es_cuenta_jugadora()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Los permisos de la tabla o las funciones nuevas no quedaron como se esperaba. No se aplica nada.';
  END IF;

  -- ===================================================================================================
  -- 6b) El staff ve exactamente lo mismo que antes (usuarios reales de cada rol).
  -- ===================================================================================================
  FOR t IN SELECT * FROM (VALUES ('coordinacion', sub_coord, v_coord), ('tecnico', sub_tecnico, v_tecnico),
                                 ('preparador_fisico', sub_pf, v_pf), ('medico', sub_medico, v_medico)) AS x(rol, sub, email) LOOP
    IF t.email IS NULL THEN
      RAISE NOTICE 'Sin usuario de % para comparar: se saltea.', t.rol;
      CONTINUE;
    END IF;
    staff_despues := seguridad_privado.cuentas_jugadoras_contar(t.sub, t.email);
    FOR r IN SELECT key, value FROM jsonb_each(staff_antes->t.rol) LOOP
      IF staff_despues->r.key IS DISTINCT FROM r.value THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % veía % en public.% y ahora ve %. No se aplica nada.', t.rol, r.value, r.key, staff_despues->r.key;
      END IF;
    END LOOP;
  END LOOP;

  -- ===================================================================================================
  -- 6c) Prueba con una cuenta de jugadora de prueba, atada a la primera jugadora. Todo se deshace: el usuario de
  --     Auth, la cuenta y lo que se guarda por el portal.
  --     espera: 'ok' (anda), 'rechazo' (42501) o 'invalido' (22023); si hay valor esperado, se compara.
  -- ===================================================================================================
  v_cuenta_sub := gen_random_uuid();
  v_cuenta_email := 'prueba-cuentas-' || replace(v_cuenta_sub::text, '-', '') || '@prueba.invalid';
  BEGIN
    INSERT INTO auth.users (id, email, aud, role) VALUES (v_cuenta_sub, v_cuenta_email, 'authenticated', 'authenticated');
    -- Registrar no acepta un usuario de Auth que no sea el del mail: ni uno del staff ni uno que no existe.
    FOREACH v_sub IN ARRAY ARRAY[sub_coord, gen_random_uuid()] LOOP
      BEGIN
        PERFORM public.cuentas_jugadoras_registrar(v_jugadora, v_sub, v_cuenta_email, sub_coord);
        RAISE EXCEPTION 'PRUEBA_FALLIDA: registrar aceptó un usuario de Auth que no es el del mail.';
      EXCEPTION WHEN invalid_parameter_value THEN
        IF SQLERRM <> 'usuario_no_coincide' THEN RAISE; END IF;
      END;
    END LOOP;
    PERFORM public.cuentas_jugadoras_registrar(v_jugadora, v_cuenta_sub, v_cuenta_email, sub_coord);

    -- La jugadora no ve ninguna fila de ninguna tabla ni vista.
    vistas := seguridad_privado.cuentas_jugadoras_contar(v_cuenta_sub, v_cuenta_email);
    IF NOT vistas ? 'cuentas_jugadoras' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: no se recorrieron las tablas de public.'; END IF;
    FOR r IN SELECT key, value FROM jsonb_each(vistas) LOOP
      IF r.value NOT IN ('0'::jsonb, '"42501"'::jsonb) THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: la cuenta de jugadora ve % en public.%. No se aplica nada.', r.value, r.key;
      END IF;
    END LOOP;

    -- Un mail de jugadora no puede entrar a perfiles.
    BEGIN
      INSERT INTO public.perfiles (email, rol) VALUES (upper(v_cuenta_email), 'tecnico');
      RAISE EXCEPTION 'PRUEBA_FALLIDA: perfiles aceptó el mail de una cuenta de jugadora.';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    FOR t IN
      SELECT * FROM (VALUES
        ('jugadora', 'ok',       'SELECT public.portal_mi_perfil()->>''nombre''',                                  ':nombre'),
        ('jugadora', 'ok',       'SELECT jsonb_typeof(public.portal_mis_numeros()->''asistencia'')',                'object'),
        ('jugadora', 'ok',       'SELECT public.portal_wellness_respondio()',                                       NULL),
        ('jugadora', 'ok',       'SELECT jsonb_typeof(public.portal_entrenamiento_hoy())',                          'array'),
        ('jugadora', 'ok',       'SELECT public.portal_wellness_guardar(3, 3, 3, 3, 3)',                            NULL),
        ('jugadora', 'ok',       'SELECT public.portal_rpe_guardar(:hoy, ''entrenamiento'', 5)',                     NULL),
        ('jugadora', 'invalido', 'SELECT public.portal_rpe_guardar(:hoy - 4, ''entrenamiento'', 5)',                 NULL),
        ('jugadora', 'rechazo',  'SELECT public.cuentas_jugadoras_listar(:cat)',                                     NULL),
        ('jugadora', 'rechazo',  'SELECT public.cuentas_jugadoras_estado(:jugadora, true)',                          NULL),
        ('jugadora', 'rechazo',  'INSERT INTO public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar) VALUES (:jugadora, :hoy + 1, 3, 3, 3, 3, 3) RETURNING ''x''', NULL),
        ('coord',    'ok',       'SELECT count(*) FROM jsonb_array_elements(public.cuentas_jugadoras_listar(:cat)) x WHERE x->>''email'' = :email', '1'),
        ('coord',    'rechazo',  'SELECT public.portal_mi_perfil()',                                                 NULL),
        ('tecnico',  'rechazo',  'SELECT public.cuentas_jugadoras_listar(:cat)',                                     NULL),
        ('nadie',    'rechazo',  'SELECT public.portal_mi_perfil()',                                                 NULL),
        ('nadie',    'ok',       'SELECT count(*) FROM public.analisis_tipos_accion',                                '0'),
        ('nadie',    'ok',       'SELECT count(*) FROM public.categorias',                                           '0'),
        ('nadie',    'ok',       'SELECT count(*) FROM public.datafem_tablas',                                       '0'),
        ('nadie',    'ok',       'SELECT count(*) FROM public.evaluacion_criterios',                                 '0'),
        ('anon',     'rechazo',  'SELECT public.portal_mi_perfil()',                                                 NULL),
        ('anon',     'rechazo',  'SELECT public.cuentas_jugadoras_listar(:cat)',                                     NULL)
      ) AS v(cuenta, espera, plantilla, esperado)
    LOOP
      v_email := CASE t.cuenta WHEN 'jugadora' THEN v_cuenta_email WHEN 'coord' THEN v_coord WHEN 'tecnico' THEN v_tecnico
                               WHEN 'nadie' THEN 'sin-perfil@prueba.invalid' ELSE '' END;
      v_sub := CASE t.cuenta WHEN 'jugadora' THEN v_cuenta_sub WHEN 'coord' THEN sub_coord WHEN 'tecnico' THEN sub_tecnico
                             WHEN 'nadie' THEN '00000000-0000-4000-8000-0000000000ff'::uuid END;
      IF v_email IS NULL THEN
        RAISE NOTICE 'Sin usuario de % para probar: se saltea "%".', t.cuenta, t.plantilla;
        CONTINUE;
      END IF;
      sentencia := replace(replace(replace(replace(t.plantilla,
        ':hoy', quote_literal(v_hoy) || '::date'), ':cat', quote_literal(v_cat) || '::uuid'),
        ':jugadora', quote_literal(v_jugadora) || '::uuid'), ':email', quote_literal(v_cuenta_email));
      BEGIN
        PERFORM set_config('request.jwt.claims',
          CASE WHEN t.cuenta = 'anon' THEN '{"role":"anon"}'
               ELSE json_build_object('email', v_email, 'sub', v_sub, 'role', 'authenticated')::text END, true);
        EXECUTE format('SET LOCAL ROLE %I', CASE WHEN t.cuenta = 'anon' THEN 'anon' ELSE 'authenticated' END);
        EXECUTE sentencia INTO v_texto;
        IF t.espera <> 'ok' THEN
          RAISE EXCEPTION 'PRUEBA_FALLIDA: % pudo hacer: %', t.cuenta, sentencia;
        ELSIF t.esperado IS NOT NULL AND v_texto IS DISTINCT FROM (CASE t.esperado WHEN ':nombre' THEN v_nombre ELSE t.esperado END) THEN
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

    -- Desactivada, la cuenta no usa el portal.
    IF public.cuentas_jugadoras_estado(v_jugadora, false) IS DISTINCT FROM v_cuenta_sub THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: cuentas_jugadoras_estado no devolvió el usuario de la cuenta.';
    END IF;
    FOREACH sentencia IN ARRAY ARRAY['SELECT public.portal_mi_perfil()', 'SELECT public.portal_mis_numeros()',
      'SELECT public.portal_wellness_respondio()', 'SELECT public.portal_entrenamiento_hoy()',
      'SELECT public.portal_wellness_guardar(3, 3, 3, 3, 3)',
      format('SELECT public.portal_rpe_guardar(%L::date, ''entrenamiento'', 5)', v_hoy)] LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('email', v_cuenta_email, 'sub', v_cuenta_sub, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        EXECUTE sentencia;
        RAISE EXCEPTION 'PRUEBA_FALLIDA: una cuenta desactivada pudo hacer: %', sentencia;
      EXCEPTION WHEN insufficient_privilege THEN
        IF SQLERRM <> 'Esta cuenta no está activa.' THEN RAISE; END IF;
      END;
    END LOOP;

    -- Desactivada, la red la sigue frenando en todas las tablas, aun con una política abierta por error
    -- (se crea acá y se deshace con el resto de la prueba).
    CREATE POLICY prueba_abierta_por_error ON public.jugadores AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
    vistas := seguridad_privado.cuentas_jugadoras_contar('00000000-0000-4000-8000-0000000000ff'::uuid, 'sin-perfil@prueba.invalid');
    IF coalesce((vistas->>'jugadores')::bigint, 0) = 0 THEN
      RAISE EXCEPTION 'PRUEBA_FALLIDA: la política abierta de prueba no abrió jugadores (la prueba no sirve).';
    END IF;
    vistas := seguridad_privado.cuentas_jugadoras_contar(v_cuenta_sub, v_cuenta_email);
    FOR r IN SELECT key, value FROM jsonb_each(vistas) LOOP
      IF r.value NOT IN ('0'::jsonb, '"42501"'::jsonb) THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: la cuenta desactivada ve % en public.%. No se aplica nada.', r.value, r.key;
      END IF;
    END LOOP;

    -- Si la jugadora cambia su mail en Auth, ese mail nuevo tampoco puede entrar a perfiles.
    UPDATE auth.users SET email = 'nuevo-' || v_cuenta_email WHERE id = v_cuenta_sub;
    BEGIN
      INSERT INTO public.perfiles (email, rol) VALUES (upper('nuevo-' || v_cuenta_email), 'tecnico');
      RAISE EXCEPTION 'PRUEBA_FALLIDA: perfiles aceptó el mail actual de Auth de una cuenta de jugadora.';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- No quedó nada de la prueba.
  -- (Solo se mira el usuario de prueba: alguien puede registrarse de verdad mientras corre la migración.)
  IF EXISTS (SELECT 1 FROM public.cuentas_jugadoras) OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_cuenta_sub) THEN
    RAISE EXCEPTION 'Quedaron datos de prueba. No se aplica nada.';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'La verificación no volvió al usuario postgres. No se aplica nada.';
  END IF;

  DROP FUNCTION seguridad_privado.cuentas_jugadoras_contar(uuid, text);

  RAISE NOTICE 'Cuentas de jugadoras aplicadas: red RESTRICTIVE en % tablas y 4 políticas de lectura cerradas.', restrictivas;
  PERFORM pg_notify('pgrst', 'reload schema');
END
$cuentas_jugadoras$;

-- Resultado: tablas con la red, políticas cerradas y funciones nuevas.
SELECT 'red RESTRICTIVE' AS que, tablename::text AS detalle FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'sin_cuentas_jugadoras'
UNION ALL
SELECT 'política cerrada', tablename || ' · ' || policyname || ' · ' || qual FROM pg_policies
WHERE schemaname = 'public' AND (tablename, policyname) IN (
  ('analisis_tipos_accion', 'tipos_accion_lectura'), ('categorias', 'leer categorias'),
  ('datafem_tablas', 'Usuarios autenticados pueden leer DataFem'), ('evaluacion_criterios', 'criterios_select'))
UNION ALL
SELECT 'función', p.oid::regprocedure::text FROM pg_proc p
WHERE p.pronamespace = to_regnamespace('portal_privado')
   OR (p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'portal\_%' OR p.proname LIKE 'cuentas\_jugadoras\_%'))
ORDER BY 1, 2;
