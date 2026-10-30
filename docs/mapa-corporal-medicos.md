# Mapa corporal de molestias y lesiones informadas

## Uso

En Médicos, abrir la ficha de una jugadora. Las siluetas de frente y espalda comparten las mismas regiones anatómicas. Derecha e izquierda son siempre de la jugadora: la derecha aparece a la izquierda de la vista frontal y a la derecha de la posterior. También se puede navegar con Tab y seleccionar con Enter o espacio. En celular se puede ampliar frente o espalda para facilitar la selección y volver a mostrar ambas sin perder el formulario.

Tocar una región abre el formulario, filtra el historial de esa región y permite elegir lado derecho, izquierdo o ambos. Cuello, pecho, abdomen, espalda alta y lumbar son regiones centrales. Los registros se pueden editar desde el historial; resolver una situación exige una fecha igual o posterior al inicio, conserva el antecedente y lo muestra violeta. No cambia la disponibilidad deportiva ni otorga un alta médica. La vista general respeta los filtros de categoría y nombre existentes y muestra las situaciones activas, su tipo, zona, fecha y seguimiento.

Rojo: lesión informada activa. Amarillo: molestia en seguimiento o registro anterior sin tipo confirmado. Violeta: antecedente resuelto. Gris: sin registros asociados. En una zona se prioriza rojo, luego amarillo y luego violeta; el historial mantiene todas las incidencias, aunque coincidan. No se generan diagnósticos, tratamientos ni plazos de recuperación.

## Datos existentes y compatibilidad

Se reutiliza `public.fichas_medicas`; no hay una segunda tabla de lesiones. `descripcion` contiene las observaciones y `fecha` el inicio. Se conservan los campos anteriores de informes, recuperación y alta estimada. Al clasificar un registro anterior esos valores no se borran ni se modifican automáticamente. Los controles de seguimiento son independientes de los controles antiguos de disponibilidad; «Marcar como disponible» conserva el comportamiento anterior sobre registros sin clasificar y no resuelve los nuevos seguimientos.

No se interpretan diagnósticos escritos en texto libre. Solo se puede asociar provisionalmente una descripción que coincida exactamente con un nombre del catálogo y su lado explícito (o una región central). Se informa que debe confirmarse al editar. El resto queda «Sin clasificar», visible y editable. No hay actualización automática ni migración de textos anteriores. En la inspección de producción realizada durante el desarrollo no había fichas médicas; la compatibilidad con registros anteriores se comprobó con datos sintéticos exclusivamente en memoria.

Los registros del mapa no ofrecen eliminar en la interfaz: se resuelven conservando su historia. Los permisos administrativos de borrado ya existentes de Coordinación y Médico se mantienen, para no bloquear los flujos anteriores de mantenimiento del plantel. Preparación Física no recibe permiso RLS de borrado.

## Migración aplicada y verificada

`supabase/migrations/20261030231602_mapa_corporal_medicos.sql`

Agrega a la tabla existente ocho columnas: zona, lateralidad, tipo, estado de seguimiento, fecha de resolución, revisión, fecha de modificación y usuario modificador. Agrega restricciones de coherencia y un índice por jugadora/zona/fecha. No modifica las filas anteriores, las relaciones ni las políticas existentes.

Añade una política restrictiva que limita las operaciones a Coordinación, Médico y Preparación Física con sesión autenticada. Añade políticas de INSERT y UPDATE para Preparación Física, exigiendo clasificación completa. Conserva su SELECT actual y el acceso administrativo anterior. Retira los permisos SQL de `anon` y PUBLIC sobre esta tabla y los privilegios de mantenimiento innecesarios de `authenticated`; RLS sigue controlando las operaciones de datos. No crea RPC públicas, vistas ni enlaces compartidos. El trigger, sin SECURITY DEFINER y con search_path vacío, impide cambiar la identidad/jugadora, perder una clasificación y falsificar revisión o metadatos de modificación. Su función privada no es ejecutable directamente por clientes.

El cliente actualiza con `id` y `revision` leída. Si no se actualiza ninguna fila, conserva el formulario, recarga el historial e informa el conflicto o falta de permisos sin reintentar. La revisión también aumenta ante actualizaciones de clientes antiguos; no se exige cambiar esos clientes. Las reglas de la base validan nuevamente todos los campos.

El script fue aplicado con autorización en el proyecto de Comunicaciones y verificado mediante consultas de solo lectura: ocho columnas, dos restricciones, índice, tres políticas nuevas, función privada y trigger correctos. Las fichas permanecieron en cero registros y las huellas de disponibilidad deportiva y políticas de otras tablas no cambiaron. No se debe volver a ejecutar. El archivo SQL conserva exactamente el contenido aprobado. El editor detecta si faltan las columnas en otro entorno y mantiene disponible el historial anterior; en ese caso el mapa y el registro de Preparación Física quedan deshabilitados.

## Privacidad

Solo los tres roles que actualmente tienen acceso a Médicos pueden abrir el componente o leer las fichas. El módulo se protege también al acceder desde el perfil de la jugadora. La base aplica las mismas restricciones a llamadas REST directas. Wellness público no se modifica ni consulta esta tabla. No se añaden datos a los informes, exportaciones ni enlaces públicos. La consulta de metadatos no encontró vistas ni funciones existentes que publiquen fichas médicas mediante una función con privilegios elevados.

Se reutiliza la autorización existente mediante `mi_rol()` y perfiles administrados por Coordinación; no se crea un permiso de autoservicio. Un administrador de perfiles sigue siendo una autoridad de confianza, como en el resto de la aplicación.

## Verificaciones

- `node --test --test-concurrency=1 tests/*.test.mjs`
- `node --test --test-concurrency=1 tests/mapaCorporal.interaccion.mjs tests/mapaCorporal.postgres.mjs`
- `npm run build` y compilación completa en memoria con valores públicos ficticios (sin crear archivos de entorno ni conectar a Supabase).
- ESLint de los componentes y la utilidad modificados.

Los dos tests adicionales usan jsdom y PostgreSQL WASM instalados fuera del proyecto para pruebas anteriores. Admiten `PIZARRA_DOM_PATH` y `PLANIFICACION_PG_PATH`. Ninguno realiza consultas ni escrituras de producción.

Pendiente de revisión manual: siluetas, formularios, colores y selección táctil en escritorio, tablet y celular, con los tres temas. La herramienta no obtuvo acceso autorizado a Chrome durante la preparación de publicación; no se afirma una comprobación visual real. Comprobar con cuentas autorizadas y no autorizadas el acceso real a la API; crear o editar registros reales solamente cuando corresponda y con autorización. Las pruebas automatizadas no sustituyen la revisión táctil en dispositivos físicos. La migración ya está aplicada: no repetirla al publicar.
