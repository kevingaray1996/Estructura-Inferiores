# Edge Functions

| Función | Verify JWT | Cómo se protege | Quién la llama |
| --- | --- | --- | --- |
| `cuentas-jugadoras` | Encendido | JWT del usuario más su rol dentro de la función | El sistema del staff |
| `avisos-enviar` | **Apagado, a propósito** | Header `x-avisos-secreto` = `AVISOS_SECRETO`; responde 401 si no coincide | pg_cron (`avisos-tick`), con el secreto leído del Vault (`avisos_secreto`) |
| `actualizar-datafem` | **Apagado, a propósito** | Header `x-datafem-secret` = `DATAFEM_CRON_SECRET`; responde 401 si no coincide | pg_cron (`actualizar-datafem-lunes`), con el secreto leído del Vault (`datafem_secreto`) |

## actualizar-datafem

- Baja la página de DataFem (Primera B) y actualiza la fila única de `public.datafem_tablas` (`id = 1`).
- La llama la tarea de cron `actualizar-datafem-lunes`, con un timeout de 30 s.
- **Verify JWT está apagado a propósito.** El cron no manda un JWT, y con Verify JWT encendido el gateway respondía 401 "Missing authorization header": DataFem no se actualizó desde el 24/10/2026 hasta el 20/11/2026. Su única puerta es el secreto `DATAFEM_CRON_SECRET`. No volver a encenderlo.
- **Rotar el secreto:**
  1. Generar uno nuevo fuera del repo.
  2. Cargarlo en el Vault como `datafem_secreto`.
  3. Cargar el mismo valor en `DATAFEM_CRON_SECRET`.

  El comando del cron no cambia, porque lee el secreto del Vault en cada corrida.
- `index.ts` es una copia de lo que está publicado, para que quede versionado. No se publica desde acá.
- El paso al Vault es `supabase/migrations/20261120120000_datafem_secreto_vault.sql`. Tiene su reversión, la verificación y la prueba manual en `supabase/verification/20261120_*datafem*.sql`.
- **Pendiente:** después del 27/11/2026, borrar el respaldo del comando viejo, que tiene el secreto viejo (ya no sirve):

  ```sql
  DROP TABLE seguridad_privado.respaldo_datafem_cron;
  ```

  Ese día también se puede limpiar el historial viejo de la tarea, que guarda el comando con el secreto viejo:

  ```sql
  DELETE FROM cron.job_run_details
  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'actualizar-datafem-lunes')
    AND command NOT LIKE '%datafem_secreto%';
  ```
