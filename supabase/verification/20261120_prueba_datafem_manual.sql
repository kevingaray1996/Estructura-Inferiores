-- Prueba a mano de la actualización de DataFem (sin esperar al lunes).
-- Correr DESPUÉS de cambiar DATAFEM_CRON_SECRET en la Edge Function. Cada paso por separado, en orden.
-- Ninguno muestra un secreto.

-- Paso A. Anotar cuándo se actualizó por última vez.
SELECT updated_at FROM public.datafem_tablas WHERE id = 1;

-- Paso B. Correr la tarea a mano: ejecuta exactamente el comando que va a correr el lunes.
DO $$ BEGIN EXECUTE (SELECT j.command FROM cron.job j WHERE j.jobname = 'actualizar-datafem-lunes'); END $$;

-- Paso C. Esperar unos 40 segundos y mirar la respuesta. Esperado: status_code 200 y "ok":true.
SELECT id, status_code, timed_out, error_msg, left(content::text, 300) AS respuesta, created
FROM net._http_response
ORDER BY created DESC
LIMIT 3;

-- Paso D. La tabla tiene que tener updated_at de recién y las tres tablas con filas.
SELECT updated_at,
       jsonb_array_length(zona_a)  AS filas_zona_a,
       jsonb_array_length(zona_b)  AS filas_zona_b,
       jsonb_array_length(general) AS filas_general
FROM public.datafem_tablas
WHERE id = 1;

-- Paso E. El secreto viejo ya no sirve: manda los headers originales del respaldo (sin mostrarlos).
-- Anotar el id_pedido que devuelve.
SELECT net.http_post(
         url := (regexp_match(r.command, 'url\s*:=\s*''([^'']+)'''))[1],
         headers := (regexp_match(r.command, 'headers\s*:=\s*''([^'']*)''\s*::\s*jsonb'))[1]::jsonb,
         timeout_milliseconds := 30000
       ) AS id_pedido
FROM seguridad_privado.respaldo_datafem_cron r;

-- Paso F. Unos segundos después, con el id del paso E. Esperado: status_code 401 y "No autorizado.".
-- SELECT status_code, left(content::text, 200) AS respuesta FROM net._http_response WHERE id = <id_pedido>;
