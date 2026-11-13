# Esquema real de la base

[`esquema_real.sql`](esquema_real.sql) es la estructura **real** de la base de Supabase de producción, **sin datos**:
tablas, columnas, claves, índices, restricciones, vistas, funciones, triggers, políticas RLS, permisos (GRANT),
privilegios por defecto, políticas de Storage y configuración de los buckets.

- **Fecha de la exportación:** 2026-11-13. Estado en ese momento: pasos 0, A y B de seguridad aplicados.
  El cambio de Storage (`20261113170000_seguridad_storage_biblioteca.sql`) se aplicó **después** de exportar, el
  mismo día: este archivo todavía muestra las 4 políticas viejas de Storage y el bucket sin límites. Hoy hay una
  sola política ("Biblioteca subir segun rol", INSERT) y el bucket acepta `image/*` hasta 5 MB. Se actualiza en
  la próxima regeneración (alcanza con volver a exportar `e7a` y `e7b`).
- **Qué incluye:** `public` y los esquemas propios (`analisis_privado`, `medicos_privado`, `pizarra_privado`,
  `planificacion_privado`, `seguridad_privado`).
- **Qué no incluye:** filas, `auth` (usuarios, emails), los archivos de Storage, ni los esquemas propios de Supabase
  (`auth`, `storage`, `realtime`, `cron`, `vault`, etc.). Las tareas de `pg_cron` y los secretos de `vault` tampoco.
- **UUID fijos:** los IDs escritos dentro de funciones (por ejemplo, las cuentas administradoras de Análisis en
  `puede_administrar_analisis`) se reemplazan por marcadores `00000000-0000-4000-8000-00000000000N`.
- Es una **referencia**, no una migración: no correrlo sobre producción. Los cambios se siguen haciendo con
  [`../migrations`](../migrations) (con su reversión en [`../rollback`](../rollback)).

`schema_completo.sql` y `script_maestro.sql` (en la raíz) son **históricos**: no reflejan la base.

## Cómo regenerarlo

1. En el editor SQL de Supabase, correr **cada una por separado** las consultas de
   [`consultas_exportar.sql`](consultas_exportar.sql) (`e1` … `e8`, con `e7a` y `e7b`). Son de solo lectura.
2. Exportar cada resultado como CSV a `supabase/auditoria-seguridad/e1.csv` … `e8.csv` (esa carpeta está en
   `.gitignore`). Cada uno tiene que empezar con la cantidad de sentencias y terminar con `-- fin eN`.
3. Desde la raíz del repo:

   ```
   node supabase/esquema/armar_esquema.mjs supabase/auditoria-seguridad AAAA-MM-DD
   ```

   Controla que ningún CSV esté cortado, reemplaza los UUID fijos y **no escribe nada** si encuentra algo que
   parezca un dato sensible (emails, tokens, claves, contraseñas).
4. Revisar el `git diff` de `esquema_real.sql`: ahí se ve qué cambió en la base desde la exportación anterior.
5. Correr `node --test tests/esquemaReal.postgres.mjs` (con PGlite; ver `PLANIFICACION_PG_PATH` en el test).
   Comprueba que el archivo no tenga datos sensibles y que se cargue completo en una base vacía.
