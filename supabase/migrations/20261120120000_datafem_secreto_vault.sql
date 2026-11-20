-- DataFem: el secreto de la tarea de cron "actualizar-datafem-lunes" pasa al Vault (y se rota).
--
-- Antes: el comando del cron tenía el secreto escrito a la vista, dentro de un texto JSON:
--   headers:='{"x-datafem-secret":"***","Content-Type":"application/json"}'::jsonb, timeout_milliseconds:=1000
-- Después: el comando arma los headers con jsonb_build_object y lee el secreto del Vault ('datafem_secreto') en el
-- momento de cada corrida; el timeout sube a 30000 ms (la función baja la página de DataFem).
-- La Edge Function actualizar-datafem no cambia: sigue comparando x-datafem-secret con DATAFEM_CRON_SECRET.
--
-- Requisito: el secreto NUEVO ya cargado a mano en el Vault con el nombre exacto datafem_secreto.
-- Después de correr esto, cambiar DATAFEM_CRON_SECRET en Edge Functions → Secrets por ese mismo valor nuevo.
--
-- Todo en un único bloque DO (el editor de Supabase ignora BEGIN/COMMIT). Si algo no da, no queda nada aplicado.
-- Guarda el comando original completo en seguridad_privado.respaldo_datafem_cron (lo usa la reversión).
-- No hay secretos en este archivo.
DO $do$
DECLARE
  c_tarea    constant text := 'actualizar-datafem-lunes';
  c_url      constant text := 'https://qvjviyjkxyngiggoeqlj.supabase.co/functions/v1/actualizar-datafem';
  c_headers  constant text := 'jsonb_build_object(''x-datafem-secret'', (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = ''datafem_secreto'' LIMIT 1), ''Content-Type'', ''application/json'')';
  v_job      cron.job%ROWTYPE;
  v_url      text;
  v_headers  jsonb;
  v_viejo    text;
  v_nuevo    text;
  v_comando  text;
  v_prueba   jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 1) Requisitos.
  IF to_regclass('cron.job') IS NULL OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_cron (cron.alter_job). No se aplica nada.';
  END IF;
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta pg_net (net.http_post). No se aplica nada.';
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Falta Vault (vault.decrypted_secrets). No se aplica nada.';
  END IF;
  IF to_regnamespace('seguridad_privado') IS NULL THEN
    RAISE EXCEPTION 'Falta el esquema seguridad_privado. No se aplica nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_datafem_cron') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe seguridad_privado.respaldo_datafem_cron: este script ya se corrió. Revisar antes de seguir.';
  END IF;

  -- 2) La tarea y la forma del comando actual (url y headers en texto JSON, una sola vez cada uno; sin body ni params).
  SELECT * INTO v_job FROM cron.job j WHERE j.jobname = c_tarea;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la tarea de cron %.', c_tarea;
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_job.command, 'url\s*:=', 'g')) <> 1
     OR (SELECT count(*) FROM regexp_matches(v_job.command, 'headers\s*:=', 'g')) <> 1
     OR v_job.command ~* '(body|params)\s*:=' THEN
    RAISE EXCEPTION 'El comando de % no tiene la forma esperada (url y headers una vez, sin body ni params). No se aplica nada.', c_tarea;
  END IF;
  v_url := (regexp_match(v_job.command, 'url\s*:=\s*''([^'']+)'''))[1];
  IF v_url IS DISTINCT FROM c_url THEN
    RAISE EXCEPTION 'La tarea % no llama a la función actualizar-datafem esperada. No se aplica nada.', c_tarea;
  END IF;
  BEGIN
    v_headers := (regexp_match(v_job.command, 'headers\s*:=\s*''([^'']*)''\s*::\s*jsonb'))[1]::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NULL OR jsonb_typeof(v_headers) <> 'object'
     OR NOT (v_headers ?& ARRAY['x-datafem-secret', 'Content-Type'])
     OR (SELECT count(*) FROM jsonb_object_keys(v_headers)) <> 2 THEN
    RAISE EXCEPTION 'Los headers del comando no son {"x-datafem-secret": ..., "Content-Type": ...} en texto JSON. No se aplica nada.';
  END IF;
  v_viejo := v_headers ->> 'x-datafem-secret';
  IF nullif(btrim(v_viejo), '') IS NULL THEN
    RAISE EXCEPTION 'El comando actual no tiene secreto. Revisar antes de seguir.';
  END IF;

  -- 3) El secreto nuevo en el Vault (nunca se muestra).
  SELECT s.decrypted_secret INTO v_nuevo FROM vault.decrypted_secrets s WHERE s.name = 'datafem_secreto' LIMIT 1;
  IF v_nuevo IS NULL OR length(v_nuevo) < 32 THEN
    RAISE EXCEPTION 'Falta datafem_secreto en el Vault (o tiene menos de 32 caracteres). Cargalo primero.';
  END IF;
  IF v_nuevo ~ '^\s|\s$' THEN
    RAISE EXCEPTION 'datafem_secreto tiene espacios o saltos de línea al principio o al final. Volvé a cargarlo.';
  END IF;
  IF v_nuevo = v_viejo THEN
    RAISE EXCEPTION 'datafem_secreto es igual al secreto viejo: tiene que ser uno nuevo.';
  END IF;

  -- 4) Respaldo del comando original completo (incluye el secreto viejo; esquema no expuesto).
  CREATE TABLE seguridad_privado.respaldo_datafem_cron AS
    SELECT v_job.jobid AS jobid, v_job.jobname AS jobname, v_job.schedule AS schedule, v_job.active AS active,
           v_job.command AS command, now() AS guardado_en;
  REVOKE ALL ON TABLE seguridad_privado.respaldo_datafem_cron FROM PUBLIC, anon, authenticated, service_role;

  -- 5) Comando nuevo: mismo destino, headers armados con el secreto del Vault y timeout de 30 s.
  v_comando := format(
'select
  net.http_post(
      url:=%L,
      headers:=%s,
      timeout_milliseconds:=30000
  );', c_url, c_headers);
  PERFORM cron.alter_job(job_id := v_job.jobid, command := v_comando);

  -- 6) Verificación dentro del mismo bloque: si algo no da, se deshace todo.
  SELECT * INTO v_job FROM cron.job j WHERE j.jobname = c_tarea;
  IF v_job.command IS DISTINCT FROM v_comando THEN
    RAISE EXCEPTION 'El comando nuevo no quedó guardado. No se aplica nada.';
  END IF;
  IF position(v_viejo IN v_job.command) > 0 THEN
    RAISE EXCEPTION 'El secreto viejo sigue en el comando. No se aplica nada.';
  END IF;
  IF v_job.schedule IS DISTINCT FROM (SELECT r.schedule FROM seguridad_privado.respaldo_datafem_cron r)
     OR v_job.active IS DISTINCT FROM (SELECT r.active FROM seguridad_privado.respaldo_datafem_cron r) THEN
    RAISE EXCEPTION 'Cambió el horario o el estado de la tarea. No se aplica nada.';
  END IF;
  -- Los headers que va a mandar, armados igual que en la corrida (sin llamar a la función ni mostrar nada).
  EXECUTE 'SELECT ' || c_headers INTO v_prueba;
  IF v_prueba ->> 'x-datafem-secret' IS DISTINCT FROM v_nuevo OR v_prueba ->> 'Content-Type' <> 'application/json' THEN
    RAISE EXCEPTION 'Los headers armados desde el Vault no dan lo esperado. No se aplica nada.';
  END IF;

  RAISE NOTICE 'Listo: % lee el secreto del Vault (datafem_secreto), timeout 30000 ms. Ahora cambiá DATAFEM_CRON_SECRET en la función.', c_tarea;
END
$do$;
