-- Reversión de los avisos al celular, etapa 2: deja la base como antes de
-- supabase/migrations/20261117120000_avisos_etapa2.sql.
--
-- Desagenda las tareas de pg_cron "avisos-tick" y "avisos-limpieza" y borra los triggers de planificacion_sesiones
-- y categorias, todas las funciones (avisos_*, portal_avisos_* y avisos_privado.*), las 5 tablas (con sus políticas), el esquema
-- avisos_privado y el respaldo seguridad_privado.respaldo_avisos.
-- OJO: se pierden la config de horarios, las pausas, las preferencias de las jugadoras y el historial de envíos.
--
-- NO revierte si hay celulares suscriptos: las jugadoras perderían los avisos sin enterarse. Para revertir igual,
-- primero borrar las suscripciones en el editor SQL (después tendrán que volver a activar los avisos):
--   DELETE FROM public.avisos_suscripciones;
-- y recién después correr este archivo.
--
-- Si se revierte también la etapa 1 (cuentas de jugadoras), revertir primero esta.
-- Si se aplicaron los ajustes (20261118120000_avisos_ajustes), revertí primero esos; si no, esta reversión falla sin aplicar nada.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor SQL de Supabase ejecute las
-- sentencias por separado. Correr como postgres. Si algo no coincide, no se revierte nada.

DO $reversion_avisos$
DECLARE
  n bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_avisos') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo de los avisos: no hay nada que revertir.';
  END IF;
  IF to_regnamespace('avisos_privado') IS NULL
     OR to_regclass('public.avisos_config') IS NULL OR to_regclass('public.avisos_pausas') IS NULL
     OR to_regclass('public.avisos_suscripciones') IS NULL OR to_regclass('public.avisos_preferencias') IS NULL
     OR to_regclass('public.avisos_envios') IS NULL THEN
    RAISE EXCEPTION 'La base no tiene lo que agrega la migración de avisos. Revisar antes de revertir.';
  END IF;
  -- Nadie puede suscribirse entre el conteo y el borrado.
  LOCK TABLE public.avisos_suscripciones IN ACCESS EXCLUSIVE MODE;
  EXECUTE 'SELECT count(*) FROM public.avisos_suscripciones' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % celulares suscriptos en avisos_suscripciones. Para revertir igual, primero correr: DELETE FROM public.avisos_suscripciones;', n;
  END IF;

  -- 1) Tareas de cron.
  IF to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-tick') THEN
    PERFORM cron.unschedule('avisos-tick');
  END IF;
  IF to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'avisos-limpieza') THEN
    PERFORM cron.unschedule('avisos-limpieza');
  END IF;

  -- 2) Triggers.
  DROP TRIGGER avisos_entrenamiento_publicado ON public.planificacion_sesiones;
  DROP TRIGGER avisos_config_por_defecto ON public.categorias;

  -- 3) Funciones.
  DROP FUNCTION public.portal_avisos_estado();
  DROP FUNCTION public.portal_avisos_suscribir(text, text, text, text);
  DROP FUNCTION public.portal_avisos_desuscribir(text);
  DROP FUNCTION public.portal_avisos_preferencias(boolean, boolean, boolean, boolean, boolean);
  DROP FUNCTION public.avisos_panel();
  DROP FUNCTION public.avisos_jugadoras(uuid);
  DROP FUNCTION public.avisos_guardar_config(uuid, boolean, smallint[], time, time);
  DROP FUNCTION public.avisos_crear_pausa(uuid, date, date, text);
  DROP FUNCTION public.avisos_borrar_pausa(uuid);
  DROP FUNCTION public.avisos_mandar(uuid, uuid[], text);
  DROP FUNCTION public.avisos_avisar_convocatoria(uuid);
  DROP FUNCTION public.avisos_historial(uuid, integer);
  DROP FUNCTION public.avisos_tomar_pendientes(integer);
  DROP FUNCTION public.avisos_destinos(uuid);
  DROP FUNCTION public.avisos_contar_sin_avisos(uuid);
  DROP FUNCTION public.avisos_cerrar_envio(uuid, integer, integer, integer, uuid[], uuid[]);
  DROP FUNCTION avisos_privado.tick();
  DROP FUNCTION avisos_privado.objetivo(uuid);
  DROP FUNCTION avisos_privado.config_por_defecto();
  DROP FUNCTION avisos_privado.entrenamiento_publicado();
  DROP FUNCTION avisos_privado.programar(timestamptz);
  DROP FUNCTION avisos_privado.dia(uuid, date);

  -- 4) Tablas (con sus políticas) y esquema. Sin CASCADE: si algo de otra etapa depende de esto, se detiene acá.
  DROP TABLE public.avisos_envios;
  DROP TABLE public.avisos_preferencias;
  DROP TABLE public.avisos_suscripciones;
  DROP TABLE public.avisos_pausas;
  DROP TABLE public.avisos_config;
  DROP SCHEMA avisos_privado;

  -- 5) Verificación: nada de la migración en pie.
  IF to_regnamespace('avisos_privado') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'avisos\_%')
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%'))
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('avisos_entrenamiento_publicado', 'avisos_config_por_defecto'))
     OR to_regprocedure('seguridad_privado.avisos_contar(uuid,text)') IS NOT NULL
     OR (to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname IN ('avisos-tick', 'avisos-limpieza'))) THEN
    RAISE EXCEPTION 'Quedaron tablas, funciones, triggers o la tarea de cron de los avisos. No se revierte nada.';
  END IF;

  -- 6) Sin respaldo, la migración se puede volver a aplicar más adelante.
  DROP TABLE seguridad_privado.respaldo_avisos;

  PERFORM pg_notify('pgrst', 'reload schema');
END
$reversion_avisos$;

-- Resultado: no tiene que quedar nada de los avisos (consulta vacía).
SELECT 'quedó' AS que, c.relname::text AS detalle FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'avisos\_%'
UNION ALL
SELECT 'función', p.oid::regprocedure::text FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'avisos\_%' OR p.proname LIKE 'portal\_avisos\_%')
UNION ALL
SELECT 'cron', jobname FROM cron.job WHERE jobname IN ('avisos-tick', 'avisos-limpieza');
