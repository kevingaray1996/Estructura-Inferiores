# Pizarra táctica editable y animada

## Uso

En **Entrenamientos**, crear o editar un ejercicio y pulsar **Abrir pizarra táctica**. Se conservan imágenes, cantidad de jugadoras y video.

### Pantalla (etapa 1: base táctil)

- **Barra superior, en una fila:** Cerrar · Deshacer · Rehacer · Completa/Media · ⋯ · Aplicar. En ⋯ quedan zoom, Ajustar vista, pantalla completa, orientación guardada, sentido de ataque, PNG, respaldo JSON, recuperar JSON y Borrar todo. En pantallas de 380 px o menos, Aplicar se muestra como ✓.
- **Barra de herramientas, fija abajo:** Mover · Propia · Rival · Pelota · Cono · Pase · Conducción · Sin pelota · Más. **Más** abre la paleta completa: en el celular, como panel desde abajo; en escritorio, a la izquierda de la cancha.
- **Barra del objeto**, con alto fijo debajo de la cancha: duplicar, girar, 6 colores rápidos, tamaño y eliminar. Sin selección, muestra una ayuda corta. El resto de las propiedades está en **Más propiedades del objeto**, que en el celular queda al final.

### Gestos

- **Colocar:** se toca una herramienta y después la cancha. La herramienta queda activa para colocar varias seguidas; Mover, Esc o volver a tocar la herramienta la desactivan. También se puede arrastrar una ficha desde la barra hasta la cancha con el dedo, o desde la paleta con el mouse.
- **Numeración:** propias y rivales se numeran por separado. Rival es una jugadora v1 con color `PALETA.rival`, no un tipo nuevo.
- **Flechas:** Pase, Conducción, Sin pelota y el resto de las líneas se dibujan arrastrando de la salida al destino. Un toque sin arrastre coloca una flecha corta. Con la flecha seleccionada aparecen dos manijas para mover la salida y la punta. La forma (`dx/dy`) es del elemento y vale en todos los pasos; la salida es la pose del paso actual. El formato v1 limita el vector a ±80 % de la cancha.
- **Convención de trazos:** pase con línea continua y punta llena, conducción ondulada (una onda cada ~3 m), sin pelota con guiones y flecha punteada con puntos. Las flechas guardadas antes cambian de aspecto según esta convención.
- **Mover fichas:** zona táctil mínima de ~44 px en pantalla con cualquier zoom. Hay un umbral de 4 px, así que un toque con temblor no mueve nada ni agrega una entrada al historial. Se dibuja un cuadro por frame y se guarda un solo cambio al soltar. Las líneas se dibujan debajo de las fichas.
- **Fondo:** sin zoom, arrastrar el fondo selecciona varias fichas con un rectángulo; con zoom, desplaza la vista. Dos dedos amplían y desplazan, también en el visor de Wellness, sin tocar los datos.
- **Deshacer/Rehacer:** hasta 100 pasos. Cada gesto es uno solo: un arrastre, un deslizador o un texto mientras se escribe. Deshacer conserva la selección. Eliminar no pide confirmación: aparece un aviso con **Deshacer**.
- **Celular vertical:** las superficies apaisadas (completa, cuarto, reducida, libre) se muestran de pie, con el ataque hacia arriba. Es solo la vista: la orientación guardada, Wellness, la miniatura y el PNG no cambian. Media cancha y área ya son verticales y no se giran. En vista vertical, números, pelota, conos y textos se mantienen derechos.

### Pasos y animación

Debajo de las barras: **Pasos (n)** se despliega (en el celular arranca plegado), **▶ Reproducir** y el tiempo. **Agregar paso** duplica las posiciones actuales. Cada paso contiene las poses de los mismos elementos; color, número y tamaño se comparten entre pasos. Se puede reordenar, eliminar pasos y controlar velocidad y bucle. La primera duración no se reproduce: cada transición usa la duración del paso destino. En secuencias de más de doce pasos solo se dibujan las miniaturas cercanas a la selección.

**Aplicar** actualiza el formulario; después hay que **Guardar entrenamiento** o **Guardar borrador/cambios** en Planificación. PNG descarga la cancha con la orientación guardada. Respaldo editable descarga JSON v1.

Las tareas libres de Planificación pueden tener una pizarra propia, sin obligación de registrarse en biblioteca. Los ejercicios de biblioteca se copian completos: los cambios posteriores no afectan la sesión. Duplicar ejercicio crea una copia independiente.

### Colores

La interfaz usa solo tokens del tema. Los de la cancha están en `src/appearance/apariencia.css` (`--pizarra-cesped`, `--pizarra-linea`, `--pizarra-seleccion`, etc.). Los colores de las fichas se guardan como hex en el documento, porque el validador de Supabase lo exige y Wellness los dibuja tal cual; su única fuente es `PALETA` en `src/utils/pizarra.js`. Al exportar, `pizarraExportar.js` convierte los tokens en sus valores calculados.

### Etapas siguientes (pendientes, no implementadas)

1. **Biblioteca de jugadas:** formaciones prearmadas (4-4-2, 4-3-3, 3-5-2…), jugadas y ejercicios guardados y reutilizables, búsqueda por categoría o etiqueta. Probablemente necesite una tabla nueva y RLS; el SQL se entregará aparte.
2. **Animación:** línea de tiempo más clara, recorridos visibles entre pasos, pelota que acompaña a la jugadora, flechas que aparecen por paso y curvas en pase/conducción (requiere decidir cómo tratar `curva` en los documentos existentes).
3. **Exportar:** PNG en alta resolución y con la orientación elegida, video o GIF de la animación, PDF de la sesión con sus pizarras y compartir directo (WhatsApp).

## Publicación y privacidad

Para compartir, habilitar bloque, tarea y el campo **Pizarra animada (publicación explícita)**, y publicar la sesión. La casilla de pizarra comienza desactivada incluso al reutilizar biblioteca. La RPC de Wellness devuelve únicamente un documento validado por lista permitida; notas y miniaturas no se comparten. Nombre de pasos, textos y números del dibujo sí forman parte del contenido que se decide publicar: no escribir ahí notas confidenciales.

Wellness muestra **Ver ejercicio** sólo cuando hay documento válido, con visor de reproducción sin herramientas de edición. El acceso sigue siendo el Wellness público por enlace/categoría, no autenticación personal. Nunca se exponen borradores ni ejercicios de otra categoría. Sin planificación publicada visible no aparece ningún elemento adicional.

## Migración aplicada

**Aplicada y verificada con autorización:** `supabase/migrations/20261030002005_pizarra_tactica.sql`.

Agrega `pizarra`, `pizarra_miniatura` y `pizarra_revision` a biblioteca; crea un validador de documentos, un trigger para validación/revisión y la RPC `guardar_ejercicio_pizarra` con SECURITY INVOKER. Conserva RLS de biblioteca (coordinación/técnico escriben, preparador físico lee) y los permisos actuales de Planificación. Extiende únicamente las funciones privadas de validación y proyección de tareas para admitir el campo opcional. No transforma registros históricos ni recrea la planificación.

No volver a ejecutar ese archivo ni ejecutar todas las migraciones del directorio. Se verificaron las tres columnas, funciones, RPC y trigger, la conservación de datos y políticas RLS y la exclusión de contenido privado en la respuesta pública. Los guardados fallidos conservan el formulario.

Límites: 200 elementos, 60 pasos, transiciones de 0,1 a 60 segundos. Las sesiones mantienen el límite total de 1 MB de la RPC existente; varios diseños muy grandes pueden requerir simplificar la sesión. Las fotos o enlaces externos nunca se embeben dentro del SVG.

## Verificación

- Suite habitual: `node --test --test-concurrency=1 tests/*.test.mjs`. `tests/pizarra.test.mjs` cubre flechas, extremos con rotación, numeración por equipo, historial agrupado y su límite, trazos, colores del tema y vista vertical.
- `node --test tests/pizarra.interaccion.mjs`: DOM en memoria con jsdom en `$TMPDIR/comunicaciones-pizarra-dom` (ruta opcional `PIZARRA_DOM_PATH`). Cubre colocación, arrastre, propiedades, multiselección, historial, RAF, colocación encadenada, flechas con el dedo, manijas, umbral de temblor, aviso de borrado, arrastre desde la barra, media cancha y panel de objetos.
- `node --test tests/pizarra.postgres.mjs`: PGlite en memoria (`$TMPDIR/comunicaciones-planificacion-pg`, `PLANIFICACION_PG_PATH` opcional). Además de la migración, RLS y RPC, confirma que el validador SQL acepta sin pérdidas un documento de etapa 1 (rival, flechas dibujadas, extremos movidos, media cancha).
- `tests/bibliotecasPremium.test.mjs` ya no congela la lógica de `PizarraTactica.jsx`, rediseñada a propósito; la cubren los tests anteriores.
- `npm run build` y `npm run lint` (los errores que quedan son de otras secciones y ya existían).
- Etapa 1 probada en Chromium (Playwright) con toques reales en Pixel 7, iPhone SE, iPhone 14 Pro Max, Galaxy S9+, iPad Mini, Pixel 7 horizontal y escritorio 1366×820: sin desborde horizontal, barra de herramientas visible, flechas, arrastre, deshacer, panel de objetos, menú, Aplicar y PNG. Falta probar en teléfonos y tablets reales desde la preview de Vercel.
