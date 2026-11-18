-- Avisos al celular, ajustes de la etapa 2 (revisión final). Requiere 20261117120000_avisos_etapa2.sql aplicada.
-- Diseño: docs/superpowers/specs/2026-11-17-avisos-jugadoras-design.md
--
-- Qué hace:
--   1. Corte de la noche en el trigger de publicación: avisos_privado.entrenamiento_publicado() no encola el aviso de
--      entrenamiento si la sesión de hoy se publica a las 20:00 (hora de Argentina) o más tarde. El control vive en un
--      ayudante nuevo, avisos_privado.corte_publicacion(p_local timestamp): true si todavía se puede avisar (antes de
--      las 20:00). El resto del trigger queda igual, incluido que un error nunca frena el guardado del staff (WARNING).
--   2. tick() marca lo vencido: antes de mirar si hay pendientes, pasa a 'error' (con enviado_at = now()) lo que ya
--      no se puede mandar, con el mismo criterio que avisos_tomar_pendientes. Así el historial nunca muestra «En cola»
--      durante horas. El resto queda igual (Vault en el momento y net.http_post).
--   3. La tarea avisos-limpieza busca el jobid de avisos-tick por nombre en cada corrida (antes quedaba fijo el número).
--      cron.schedule con el mismo nombre la actualiza (pg_cron 1.6), sin crear otra.
--
-- Mismos permisos que antes: las dos funciones siguen SECURITY DEFINER, con search_path '' y sin permisos para anon,
-- authenticated ni service_role (CREATE OR REPLACE conserva los permisos; el ayudante nuevo nace igual).
-- No hace falta volver a desplegar la Edge Function avisos-enviar.
--
-- Bloqueos: solo reemplaza funciones y la tarea de cron; no toca tablas. Cada bloqueo espera como máximo 5 s.
-- Guarda un respaldo (las definiciones anteriores y la tarea anterior) en seguridad_privado.respaldo_avisos_ajustes,
-- que además marca que ya se aplicó. Verifica al final; si algo falla, no se aplica nada.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómica aunque el editor separe las sentencias.
-- Reversión: supabase/rollback/20261118120000_avisos_ajustes.sql. Si se revierte también la etapa 2, revertir
-- primero esta (la reversión de la etapa 2 no borra el esquema avisos_privado mientras tenga el ayudante).

DO $avisos_ajustes$
DECLARE
  v_limpieza text := 'DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = ''avisos-tick'')'
                     || ' AND coalesce(end_time, start_time) < now() - interval ''7 days''';
  v_cmd_antes text; v_horario_antes text;
  ya boolean;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===================================================================================================
  -- 0) Controles previos.
  -- ===================================================================================================
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_avisos') IS NULL THEN
    RAISE EXCEPTION 'Falta la etapa 2 de avisos (20261117120000_avisos_etapa2.sql). No continuar.';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_avisos)' INTO ya;
  IF NOT ya THEN
    RAISE EXCEPTION 'La etapa 2 de avisos no tiene respaldo guardado. Revisar antes de seguir.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_avisos_ajustes') IS NOT NULL THEN
    RAISE EXCEPTION 'Los ajustes de avisos ya se aplicaron (hay respaldo guardado).';
  END IF;
  IF to_regprocedure('avisos_privado.entrenamiento_publicado()') IS NULL OR to_regprocedure('avisos_privado.tick()') IS NULL
     OR to_regprocedure('avisos_privado.dia(uuid,date)') IS NULL
     OR to_regprocedure('public.avisos_tomar_pendientes(integer)') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones de la etapa 2 de avisos. Revisar antes de seguir.';
  END IF;
  IF to_regprocedure('avisos_privado.corte_publicacion(timestamp without time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe avisos_privado.corte_publicacion. Revisar antes de seguir.';
  END IF;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL OR to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_cron (cron.schedule). No continuar.';
  END IF;
  SELECT j.command, j.schedule INTO v_cmd_antes, v_horario_antes FROM cron.job j WHERE j.jobname = 'avisos-limpieza';
  IF v_cmd_antes IS NULL THEN
    RAISE EXCEPTION 'No existe la tarea de cron avisos-limpieza. Revisar antes de seguir.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-tick') THEN
    RAISE EXCEPTION 'No existe la tarea de cron avisos-tick. Revisar antes de seguir.';
  END IF;

  -- ===================================================================================================
  -- 1) Respaldo: las definiciones anteriores y la tarea de limpieza como estaba. También marca que se aplicó.
  -- ===================================================================================================
  CREATE TABLE seguridad_privado.respaldo_avisos_ajustes (
    nombre text PRIMARY KEY,
    tipo text NOT NULL,
    detalle text NOT NULL,
    creado_at timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_avisos_ajustes FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO seguridad_privado.respaldo_avisos_ajustes (nombre, tipo, detalle) VALUES
    ('avisos_privado.entrenamiento_publicado()', 'funcion', pg_get_functiondef('avisos_privado.entrenamiento_publicado()'::regprocedure)),
    ('avisos_privado.tick()', 'funcion', pg_get_functiondef('avisos_privado.tick()'::regprocedure)),
    ('avisos-limpieza', 'cron_comando', v_cmd_antes),
    ('avisos-limpieza horario', 'cron_horario', v_horario_antes);

  -- ===================================================================================================
  -- 2) Corte de la noche: ayudante y trigger.
  -- ===================================================================================================
  -- true si a esa hora local (Argentina) todavía se puede avisar de una sesión publicada: antes de las 20:00.
  CREATE FUNCTION avisos_privado.corte_publicacion(p_local timestamp)
   RETURNS boolean
   LANGUAGE sql
   IMMUTABLE SECURITY DEFINER
   SET search_path TO ''
  AS $f$
    SELECT p_local IS NOT NULL AND p_local::time < time '20:00';
  $f$;
  REVOKE ALL ON FUNCTION avisos_privado.corte_publicacion(timestamp) FROM PUBLIC, anon, authenticated, service_role;

  -- Igual que en la etapa 2, más el corte de la noche: publicada a las 20:00 o después, no avisa.
  CREATE OR REPLACE FUNCTION avisos_privado.entrenamiento_publicado()
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
      -- A la noche (20:00 o más tarde) no se avisa: llegaría fuera de contexto.
      IF NOT avisos_privado.corte_publicacion(v_local) THEN RETURN NULL; END IF;
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

  -- ===================================================================================================
  -- 3) tick(): primero marca lo vencido (mismo criterio que avisos_tomar_pendientes), después igual que antes.
  -- ===================================================================================================
  CREATE OR REPLACE FUNCTION avisos_privado.tick()
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
    -- Lo vencido queda en 'error' ya, para que el historial no lo muestre «En cola» (mismo criterio que
    -- avisos_tomar_pendientes).
    BEGIN
      UPDATE public.avisos_envios e SET estado = 'error', enviado_at = now()
       WHERE (e.estado = 'pendiente' OR (e.estado = 'enviando' AND e.tomado_at < now() - interval '10 minutes'))
         AND ((e.tipo IN ('wellness', 'combinado', 'rpe', 'entrenamiento') AND e.fecha < v_hoy)
           OR (e.tipo IN ('wellness', 'combinado', 'rpe') AND e.creado_at < now() - interval '90 minutes')
           OR (e.tipo = 'entrenamiento' AND e.creado_at < now() - interval '3 hours')
           OR (e.tipo IN ('manual', 'convocatoria') AND e.creado_at < now() - interval '24 hours'));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'avisos: no se pudo marcar lo vencido (%: %).', SQLSTATE, SQLERRM;
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
  -- 4) avisos-limpieza: el jobid de avisos-tick se busca por nombre en cada corrida.
  -- ===================================================================================================
  PERFORM cron.schedule('avisos-limpieza', '17 4 * * *', v_limpieza);

  -- ===================================================================================================
  -- 5) Verificación.
  -- ===================================================================================================
  IF EXISTS (SELECT 1 FROM pg_proc p
             WHERE p.oid IN ('avisos_privado.entrenamiento_publicado()'::regprocedure, 'avisos_privado.tick()'::regprocedure,
                             'avisos_privado.corte_publicacion(timestamp)'::regprocedure)
               AND (NOT p.prosecdef OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']
                    OR has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'Las funciones de avisos no quedaron SECURITY DEFINER, con search_path vacío y sin permisos. No se aplica nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'avisos_entrenamiento_publicado'
                   AND t.tgrelid = 'public.planificacion_sesiones'::regclass
                   AND t.tgfoid = 'avisos_privado.entrenamiento_publicado()'::regprocedure) THEN
    RAISE EXCEPTION 'El trigger avisos_entrenamiento_publicado no apunta a la función. No se aplica nada.';
  END IF;
  IF (SELECT count(*) FROM cron.job j WHERE j.jobname = 'avisos-limpieza') <> 1
     OR NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-limpieza' AND j.command = v_limpieza AND j.schedule = '17 4 * * *') THEN
    RAISE EXCEPTION 'La tarea de cron avisos-limpieza no quedó actualizada. No se aplica nada.';
  END IF;
  IF avisos_privado.corte_publicacion('2026-11-18 19:59:00') IS NOT TRUE
     OR avisos_privado.corte_publicacion('2026-11-18 20:00:00') IS NOT FALSE
     OR avisos_privado.corte_publicacion('2026-11-18 23:30:00') IS NOT FALSE
     OR avisos_privado.corte_publicacion('2026-11-18 07:10:00') IS NOT TRUE THEN
    RAISE EXCEPTION 'PRUEBA_FALLIDA: el corte de las 20:00 no anda. No se aplica nada.';
  END IF;
  IF pg_get_functiondef('avisos_privado.entrenamiento_publicado()'::regprocedure) NOT LIKE '%avisos_privado.corte_publicacion(v_local)%'
     OR pg_get_functiondef('avisos_privado.tick()'::regprocedure) NOT LIKE '%SET estado = ''error'', enviado_at = now()%' THEN
    RAISE EXCEPTION 'Las funciones no quedaron con los cambios. No se aplica nada.';
  END IF;

  RAISE NOTICE 'Ajustes de avisos aplicados: corte de las 20:00, tick marca lo vencido y avisos-limpieza busca avisos-tick por nombre.';
  PERFORM pg_notify('pgrst', 'reload schema');
END
$avisos_ajustes$;

-- Resultado: la tarea de limpieza y las funciones tocadas.
SELECT 'cron' AS que, jobname || ' · ' || schedule || ' · ' || command AS detalle FROM cron.job WHERE jobname IN ('avisos-tick', 'avisos-limpieza')
UNION ALL
SELECT 'función', p.oid::regprocedure::text FROM pg_proc p
WHERE p.pronamespace = to_regnamespace('avisos_privado') AND p.proname IN ('entrenamiento_publicado', 'tick', 'corte_publicacion')
ORDER BY 1, 2;
