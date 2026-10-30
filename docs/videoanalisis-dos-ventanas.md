# Videoanálisis en dos ventanas

En **Análisis → Video y etiquetas**, elegir **Separar reproductor** o **Separar botonera**. Son distribuciones alternativas de la misma sesión; se abre una única ventana auxiliar que puede trasladarse a otro monitor, maximizarse y redimensionarse. **Acoplar ventana / Volver a integrar** devuelve la sección a su lugar. No se cambia el catálogo, formación, mapa, explorador ni los informes.

## Una sesión, un reproductor y un escritor

Se usa `createPortal` sobre los componentes existentes, no una segunda aplicación. El estado, autenticación, permisos, selección de partido/jugadora/acción/resultado/zona/coordenadas y guardados viven exclusivamente en la raíz React principal. Los eventos del portal llaman a los mismos handlers. No hay BroadcastChannel global, mensajes con credenciales ni parámetros de sesión en URL/storage. Cada pestaña principal crea un nombre aleatorio de ventana; no reclama la auxiliar de otra pestaña.

Hay un solo iframe activo. Al separar/acoplar el video se pausa el anterior y se conserva una lectura de tiempo, estado y velocidad; se desmonta y se crea el reproductor en su nueva ventana, cargando allí su API de YouTube. Puede existir una breve reconexión o recarga del buffer; no se garantiza continuidad sin interrupción. La restauración sólo se aplica al mismo partido y video.

Reproducción, pausa, saltos, ±5 segundos, Tomar tiempo y velocidades admitidas se controlan desde ambas ventanas. Los comandos esperan confirmación de la API. Durante saltos pendientes, reconexiones o errores, las etiquetas automáticas quedan bloqueadas. Después de un timeout se ofrece **Reconectar video**. No se estima el tiempo con un cronómetro: `getCurrentTime()` debe devolver un número válido y el reproductor debe corresponder al partido actual.

YouTube devuelve tiempo aproximado de reproducción mediante su API y el esquema existente guarda segundos enteros, redondeados hacia abajo; no es precisión de fotograma. Hay restricciones de autoplay, incrustación, red y políticas del navegador. Puede ser necesario pulsar reproducción directamente dentro del video.

Un bloqueo síncrono compartido impide envíos concurrentes entre el formulario completo y las acciones rápidas. Cada inserción lleva un UUID generado una vez para ese envío y su respuesta se confirma por ID. No hay reintentos automáticos. Ante transporte o respuesta incierta se bloquean nuevos registros hasta revisar las acciones y recargar Análisis, para evitar duplicaciones por reenvío. Esto no impide que un usuario registre deliberadamente otra acción después de completar la anterior, ni pretende deduplicar sesiones distintas abiertas de forma independiente.

## Cierres y recuperación

- Popup bloqueado: se informa cómo permitirlo, sin desmontar el video actual.
- Recarga de la auxiliar: se bloquean controles dependientes del tiempo y se reconstruye el portal cuando el documento vuelve a estar disponible.
- Cierre de la auxiliar: se recupera automáticamente la vista integrada. Los campos permanecen en el estado principal y las acciones guardadas no se eliminan.
- Recarga/cierre/navegación de la principal: se cierra la auxiliar; no queda una segunda aplicación guardando ni un video auxiliar reproduciéndose sin su sesión. Después de recargar, volver a separar si se desea. Se recuperan de Supabase las acciones persistidas; los campos sin guardar no sobreviven a la recarga completa.
- Cambio de sección o salida de Análisis: se acopla/cierra la auxiliar. Si el documento deja de ser accesible o navega fuera de `about:blank`, se desconecta y se recupera la principal.

La sincronización usa memoria y eventos de una sola raíz, más una comprobación local de disponibilidad cada 500 ms; no consulta Supabase para transmitir tiempo ni estado de reproducción. Los estilos y el tema efectivo se reflejan desde la principal. No se añaden atajos globales duplicados; los controles nativos de YouTube actúan sobre el único iframe.

## Verificación

- `node --test --test-concurrency=1 tests/*.test.mjs`: pruebas existentes y casos de ventana bloqueada, sesiones únicas, cierre, reconexión, reloj válido y bloqueo compartido.
- `node --test tests/ventanasAnalisis.interaccion.mjs`: dos documentos DOM con React real y API de YouTube/Supabase simuladas, usando el jsdom temporal externo ya empleado por las pruebas de Pizarra (`PIZARRA_DOM_PATH` opcional). Comprueba portales, una sola instancia de reproductor, comandos bidireccionales, latencia de saltos, una inserción por acción, cambio de partido y recuperación.
- Compilación habitual y compilación completa en memoria sin escribir configuración local.

No necesita migraciones ni cambios en Supabase. No se efectuaron escrituras de prueba en producción.

## Revisión manual necesaria

Con YouTube real y una cuenta autorizada, sin crear datos ficticios:

1. Permitir ventanas emergentes, separar cada alternativa y moverla entre monitores. Comprobar dimensiones y pantalla completa.
2. Reproducir/pausar desde ambas vistas; usar controles nativos, ±5 segundos, salto y velocidades. Observar confirmación y latencia al mover el reproductor.
3. Seleccionar jugadora/acción/resultado/zona/coordenadas y comprobar que sobreviven a separar/acoplar. Usar Tomar tiempo sin guardar.
4. Recargar y cerrar la auxiliar; cambiar partido y recuperar la vista. No debe quedar un segundo video reproduciéndose.
5. Revisar claro/oscuro/automático y funcionamiento con un solo monitor. Comprobar en el uso real autorizado que una etiqueta se guarda una sola vez y actualiza el explorador.

La simulación DOM no verifica el protocolo real de la API entre ventanas, autoplay, buffering, políticas del navegador ni dos monitores físicos. Esas comprobaciones quedan pendientes antes de afirmar que la experiencia real está validada.
