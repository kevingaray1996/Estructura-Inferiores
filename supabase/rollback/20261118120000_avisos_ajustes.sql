-- Reversión de los ajustes de avisos: deja la base como antes de supabase/migrations/20261118120000_avisos_ajustes.sql.
--
-- Vuelve a crear avisos_privado.entrenamiento_publicado() y avisos_privado.tick() con las definiciones guardadas en
-- el respaldo, borra el ayudante avisos_privado.corte_publicacion, vuelve a agendar avisos-limpieza con el comando y
-- el horario de antes, y borra el respaldo seguridad_privado.respaldo_avisos_ajustes (después se puede volver a aplicar).
-- No toca datos: ni la config, ni las pausas, ni las suscripciones, ni el historial.
--
-- Si se revierte también la etapa 2, correr primero este archivo.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor SQL de Supabase ejecute las
-- sentencias por separado. Correr como postgres. Si algo no coincide, no se revierte nada.

DO $reversion_avisos_ajustes$
DECLARE
  v_def_trigger text; v_def_tick text; v_cmd text; v_horario text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_avisos_ajustes') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo de los ajustes de avisos: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT max(detalle) FILTER (WHERE nombre = ''avisos_privado.entrenamiento_publicado()''),
                  max(detalle) FILTER (WHERE nombre = ''avisos_privado.tick()''),
                  max(detalle) FILTER (WHERE nombre = ''avisos-limpieza''),
                  max(detalle) FILTER (WHERE nombre = ''avisos-limpieza horario'')
             FROM seguridad_privado.respaldo_avisos_ajustes'
    INTO v_def_trigger, v_def_tick, v_cmd, v_horario;
  IF v_def_trigger IS NULL OR v_def_tick IS NULL OR v_cmd IS NULL OR v_horario IS NULL THEN
    RAISE EXCEPTION 'El respaldo de los ajustes de avisos está incompleto. Revisar antes de revertir.';
  END IF;
  IF to_regprocedure('avisos_privado.corte_publicacion(timestamp without time zone)') IS NULL
     OR to_regprocedure('avisos_privado.entrenamiento_publicado()') IS NULL OR to_regprocedure('avisos_privado.tick()') IS NULL THEN
    RAISE EXCEPTION 'La base no tiene lo que agregan los ajustes de avisos. Revisar antes de revertir.';
  END IF;

  -- 1) Funciones como estaban (CREATE OR REPLACE conserva los permisos).
  EXECUTE v_def_trigger;
  EXECUTE v_def_tick;
  DROP FUNCTION avisos_privado.corte_publicacion(timestamp);

  -- 2) avisos-limpieza como estaba.
  PERFORM cron.schedule('avisos-limpieza', v_horario, v_cmd);

  -- 3) Verificación: las definiciones y la tarea son exactamente las guardadas, y los permisos siguen igual.
  IF pg_get_functiondef('avisos_privado.entrenamiento_publicado()'::regprocedure) IS DISTINCT FROM v_def_trigger
     OR pg_get_functiondef('avisos_privado.tick()'::regprocedure) IS DISTINCT FROM v_def_tick
     OR to_regprocedure('avisos_privado.corte_publicacion(timestamp without time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'Las funciones no volvieron a como estaban. No se revierte nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
             WHERE p.oid IN ('avisos_privado.entrenamiento_publicado()'::regprocedure, 'avisos_privado.tick()'::regprocedure)
               AND (NOT p.prosecdef OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']
                    OR has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'Los permisos de las funciones de avisos cambiaron. No se revierte nada.';
  END IF;
  IF (SELECT count(*) FROM cron.job j WHERE j.jobname = 'avisos-limpieza') <> 1
     OR NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-limpieza' AND j.command = v_cmd AND j.schedule = v_horario) THEN
    RAISE EXCEPTION 'La tarea avisos-limpieza no volvió a como estaba. No se revierte nada.';
  END IF;

  -- 4) Sin respaldo, los ajustes se pueden volver a aplicar.
  DROP TABLE seguridad_privado.respaldo_avisos_ajustes;

  PERFORM pg_notify('pgrst', 'reload schema');
END
$reversion_avisos_ajustes$;

-- Resultado: la tarea de limpieza como estaba y ningún corte_publicacion.
SELECT 'cron' AS que, jobname || ' · ' || schedule || ' · ' || command AS detalle FROM cron.job WHERE jobname = 'avisos-limpieza'
UNION ALL
SELECT 'quedó', p.oid::regprocedure::text FROM pg_proc p
WHERE p.pronamespace = to_regnamespace('avisos_privado') AND p.proname = 'corte_publicacion';
