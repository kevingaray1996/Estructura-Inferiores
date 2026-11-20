-- Verificación (solo lectura) después de 20261120120000_datafem_secreto_vault.sql.
-- Todas las columnas tienen que dar true. No muestra ningún secreto.
SELECT
  j.schedule = r.schedule                                       AS mismo_horario,
  j.active = r.active                                           AS mismo_estado,
  j.command LIKE '%url:=''https://qvjviyjkxyngiggoeqlj.supabase.co/functions/v1/actualizar-datafem''%' AS misma_funcion,
  j.command LIKE '%vault.decrypted_secrets%datafem_secreto%'    AS lee_del_vault,
  j.command LIKE '%timeout_milliseconds:=30000%'                AS timeout_30s,
  position(((regexp_match(r.command, 'headers\s*:=\s*''([^'']*)''\s*::\s*jsonb'))[1]::jsonb ->> 'x-datafem-secret')
           IN j.command) = 0                                    AS sin_secreto_viejo,
  coalesce((SELECT length(s.decrypted_secret) >= 32 FROM vault.decrypted_secrets s WHERE s.name = 'datafem_secreto'), false)
                                                                AS secreto_vault_cargado,
  (SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = 'datafem_secreto')
    IS DISTINCT FROM ((regexp_match(r.command, 'headers\s*:=\s*''([^'']*)''\s*::\s*jsonb'))[1]::jsonb ->> 'x-datafem-secret')
                                                                AS secreto_nuevo_distinto
FROM cron.job j
CROSS JOIN seguridad_privado.respaldo_datafem_cron r
WHERE j.jobname = 'actualizar-datafem-lunes';
