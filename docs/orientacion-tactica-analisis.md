# Orientación táctica — React pendiente de publicación

Estado informado por el responsable: migración aplicada y verificada en Supabase de producción, con tres columnas y trigger habilitado, 188 eventos históricos sin convertir y permisos existentes conservados. No se volvió a ejecutar SQL desde este trabajo. Los pasos siguientes documentan el orden de activación; no implican repetir la migración ya aplicada.

## Convención
X/Y permanecen fijos en pantalla (0–100). Atacando a la derecha: X crece hacia ataque y Y crece desde izquierda táctica hacia derecha. Atacando a la izquierda se utiliza 100-X y 100-Y exclusivamente para clasificar; nunca para guardar o dibujar puntos exactos. Los puntos aproximados derivados de una zona verificada se proyectan al plano visual una sola vez.

Cada acción nueva incluye `sistema_coordenadas=visual_v1`, `direccion_captura` y `periodo_captura`. El trigger verifica la orientación contra el partido durante INSERT, bloqueando concurrentemente cambios del partido durante la transacción; conserva esa referencia en futuras ediciones. Si se corrige el período del evento, la referencia de captura original permanece inmutable y explícita. El servidor calcula la zona de las ubicaciones exactas con la misma convención que React.

Las filas antiguas quedan con los tres campos NULL: ni backfill ni inversión ni cambio de zona. Su zona se presenta como registrada, con referencia no verificada. No puede confirmarse retrospectivamente que se capturaron en coordenadas visuales o normalizadas. Los clientes anteriores pueden seguir insertando referencias NULL (no verificadas); no se certifican automáticamente.

Los mapas con referencias mezcladas usan izquierda/derecha **visual**, no ataque/defensa global. Los informes indican cuántas acciones no tienen referencia verificada. Las estadísticas conservan zonas históricas, sin acreditarlas como verificadas. Los mapas individuales preservan los puntos originales y sus advertencias. Los destinos de pases siguen siendo coordenadas visuales, sin transformación adicional.

## Activación segura
1. Revisar y autorizar `supabase/migrations/202611020001_orientacion_tactica_analisis.sql`. Es transaccional y deliberadamente falla si ya existen sus objetos; comprobar antes si fue aplicada, no repetirla.
2. Aplicarla únicamente con autorización en el proyecto correcto. No cambia RLS, RPC, roles ni filas existentes. Validar columnas, restricción y trigger; comparar conteos y datos previos con consultas de lectura.
3. Validar INSERT/UPDATE y concurrencia en un entorno autorizado con datos sintéticos. Las pruebas locales JS no acreditan ejecución PostgreSQL ni Supabase real.
4. Publicar React solamente después: los SELECT explícitos ahora requieren las tres columnas y los INSERT nuevos envían esos campos. Antes de la migración esta versión no es desplegable.
5. Comprobar dos períodos, ambos sentidos, PDF, filtros y preservación de una referencia tras cambiar la orientación del partido. No cambiar registros reales para probar sin autorización.

## Recuperación
Ante un fallo de aplicación la transacción revierte automáticamente. Ante un fallo del frontend, volver a la versión React anterior manteniendo columnas y trigger: los clientes previos no envían metadatos y sus nuevas filas se reconocen como no verificadas. No borrar columnas ni revertir datos; las nuevas acciones verificadas conservan protección y clasificación en servidor. No se ejecutó SQL en Supabase ni en producción.

## Ensayo PostgreSQL local aislado
Ejecutado con `node --test tests/orientacionAnalisis.postgres.mjs` sobre PGlite en memoria y esquema/datos exclusivamente sintéticos. Se aplicó el archivo completo sin sustituciones. El primer intento detectó el identificador reservado `lateral`; se corrigió a `v_carril` y el ensayo completo pasó.

Verificado: tres columnas nullable sin default, históricos idénticos, captura de ambos períodos, clasificación por dirección, edición sin alterar la captura tras cambiar la dirección del partido, rechazo de modificación de captura, cliente antiguo sin metadatos, rechazo RLS al usuario sintético no autorizado, igualdad de políticas/ACL/estados RLS antes y después. La segunda aplicación devuelve `42701`; tras ROLLBACK no cambia datos, políticas ni duplica el trigger.

SHA256 del SQL ensayado: `223d1c437a40af37f07ee3376ae8339e578995af6368d4e39e7610ed0fcde523`.

Límites: PostgreSQL embebido, no servidor Supabase, Auth y políticas de prueba sintéticos, sin PostgREST ni ensayo de dos conexiones concurrentes. No se usaron credenciales, conexiones ni datos de producción. La activación remota continúa pendiente de autorización.
