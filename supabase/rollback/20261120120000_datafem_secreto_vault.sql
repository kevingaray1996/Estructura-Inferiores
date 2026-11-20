-- Reversión de 20261120120000_datafem_secreto_vault.sql: vuelve a poner en "actualizar-datafem-lunes" el comando
-- original completo, tal como quedó en seguridad_privado.respaldo_datafem_cron.
--
-- Ojo: el comando original manda el secreto VIEJO. Para que la actualización funcione, DATAFEM_CRON_SECRET en la
-- Edge Function también tiene que volver al valor viejo (está dentro del comando guardado en el respaldo).
-- No borra el respaldo ni el secreto del Vault. Un único bloque DO; no hay secretos en este archivo.
DO $do$
DECLARE
  v_jobid   bigint;
  v_comando text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('seguridad_privado.respaldo_datafem_cron') IS NULL THEN
    RAISE EXCEPTION 'No existe seguridad_privado.respaldo_datafem_cron: no hay nada que restaurar.';
  END IF;
  IF (SELECT count(*) FROM seguridad_privado.respaldo_datafem_cron) <> 1 THEN
    RAISE EXCEPTION 'El respaldo no tiene exactamente una fila. Revisar antes de seguir.';
  END IF;
  SELECT r.jobid, r.command INTO v_jobid, v_comando FROM seguridad_privado.respaldo_datafem_cron r;
  IF NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid = v_jobid AND j.jobname = 'actualizar-datafem-lunes') THEN
    RAISE EXCEPTION 'La tarea actualizar-datafem-lunes ya no existe con el mismo jobid. Revisar antes de seguir.';
  END IF;

  PERFORM cron.alter_job(job_id := v_jobid, command := v_comando);

  IF (SELECT j.command FROM cron.job j WHERE j.jobid = v_jobid) IS DISTINCT FROM v_comando THEN
    RAISE EXCEPTION 'No se pudo restaurar el comando original.';
  END IF;
  RAISE NOTICE 'Restaurado el comando original. Volvé a poner el secreto viejo en DATAFEM_CRON_SECRET.';
END
$do$;
