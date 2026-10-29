# Planificación semanal

Disponible en el menú **Planificación semanal**, con accesos desde Entrenamientos y Asistencia. Coordinación puede administrar todas las categorías; técnicos y preparadores físicos, únicamente la categoría asignada en su perfil.

Permite sesiones opcionales de lunes a domingo, varios entrenamientos por día, bloques y tareas ordenados, biblioteca existente o ejercicios libres, copias y publicación. Copiar siempre genera borradores, sin reemplazar sesiones ni crear asistencia, RPE o cargas reales. La vinculación opcional con `entrenamiento_bloques` representa lo realizado; no lo genera.

## SQL aplicado

Se aplicó, con autorización, únicamente `supabase/migrations/20261026190426_planificacion_semanal.sql` al proyecto de Comunicaciones. No volver a ejecutarla ni ejecutar `db push` sobre toda la carpeta: contiene migraciones anteriores ajenas a esta entrega. La migración es transaccional y rechaza una instalación previa; no modifica registros ni políticas de tablas existentes.

Antes y después pueden ejecutarse las secciones correspondientes de `supabase/verification/planificacion_semanal.sql`, exclusivamente de lectura. Hasta aplicar la migración, el administrador informa que falta instalarla; Wellness conserva su funcionamiento y no muestra tarjetas adicionales.

## Contenido compartido y seguridad

Los bloques y ejercicios comienzan ocultos. Cada uno permite habilitar su visibilidad y elegir campos compartidos. Las notas internas nunca forman parte de la respuesta pública. El nombre de cada elemento visible y los metadatos de sesión (horario, tipo, lugar y objetivo general) se comparten al publicar contenido visible.

El Wellness público existente funciona por enlace de categoría y selección de jugadora, sin autenticar su identidad. La consulta nueva conserva ese modelo: valida la pertenencia de la jugadora a la categoría, pero conocer esos identificadores permite consultar el contenido intencionalmente publicado. No debe publicarse información confidencial. Una verificación de identidad personal requeriría ampliar el acceso público actual.

La tabla privada tiene RLS forzada; el cliente sólo puede leer su categoría autorizada y guardar mediante RPC con control de revisión. Los conflictos requieren recargar, sin reintentar ni sobrescribir automáticamente. Las funciones tienen permisos explícitos y `search_path` fijo.

## Wellness

"Tu entrenamiento de hoy" aparece sólo con bloques o tareas visibles y publicados para la fecha de Argentina y la categoría seleccionada. Se consulta al ingresar, al recuperar foco y cada 30 segundos mientras la pantalla está visible. Retirar la publicación lo oculta en la siguiente consulta. Ausencia, borrador, contenido vacío o fallo de lectura no agregan mensajes ni espacios. No interviene en respuestas ni guardados de Wellness.

## Comprobaciones

- `node --test --test-concurrency=1 tests/*.test.mjs`: suite completa sin escrituras en Supabase.
- `node --test tests/planificacion.postgres.mjs`: integración con PostgreSQL en memoria mediante PGlite, instalado fuera del proyecto. Puede indicarse la ruta del paquete con `PLANIFICACION_PG_PATH`.
- `npm run build`: compilación habitual. Sin variables locales, el proyecto compila su pantalla de diagnóstico; también se verificó la compilación completa en memoria con valores ficticios, sin guardar configuración.

Revisión manual después de instalar el SQL autorizado:

1. Probar coordinación, técnico y preparador con categoría asignada; comprobar que médico no dispone de edición.
2. Crear un borrador parcial, ordenar bloques, añadir biblioteca y tarea libre; comprobar que Wellness no cambia.
3. Publicar sólo un bloque y ciertos campos; comprobar desde móvil que no aparecen notas ni tareas ocultas.
4. Editar desde dos pestañas: la segunda revisión debe producir conflicto y pedir recarga.
5. Retirar publicación, cambiar de categoría y comprobar días sin contenido: no debe quedar tarjeta vacía.
6. Copiar día y semana: comprobar borradores independientes y ausencia de altas de asistencia/cargas.
7. Revisar claro, oscuro y automático, calendario móvil y enlaces hacia Asistencia.

La migración se aplicó y se verificaron objetos, permisos, RLS, filtrado de notas internas y conservación de políticas anteriores. No se realizaron escrituras de prueba contra Supabase. La comprobación visual con sesión autenticada queda pendiente: el acceso automatizado a Chrome no estuvo disponible.
