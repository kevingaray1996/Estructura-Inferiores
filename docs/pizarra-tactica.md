# Pizarra táctica editable y animada

## Uso

En **Entrenamientos**, crear o editar un ejercicio y pulsar **Abrir pizarra táctica**. Se conservan imágenes, cantidad de jugadoras y video. Elegir herramienta y tocar la cancha para colocarla; volver a Seleccionar para moverla. Shift o el rectángulo de selección permiten seleccionar varias. Propiedades cambia colores, números, texto, tamaño, grosor, rotación y extremos de flechas. El selector de superficies conserva posiciones relativas; el sentido de ataque es propio del ejercicio, independiente de Análisis.

Para animar, construir el Inicio, **Duplicar paso y continuar**, mover jugadoras/pelota y ajustar la duración de transición. Cada paso contiene las poses de los mismos elementos; color/número/tamaño son compartidos entre pasos. Materiales permanecen quietos hasta que se mueven explícitamente en otro paso. Se puede reordenar, eliminar pasos, pausar, reiniciar y controlar velocidad/bucle. La primera duración no se reproduce: cada transición usa la duración del paso destino.

**Aplicar pizarra al ejercicio** actualiza el formulario; después hay que **Guardar entrenamiento** o **Guardar borrador/cambios** en Planificación. PNG descarga la vista actual. Respaldo editable descarga JSON v1, que se puede recuperar en el editor. No se implementa exportación de video/GIF en esta entrega.

Las tareas libres de Planificación pueden tener una pizarra propia, sin obligación de registrarse en biblioteca. Los ejercicios seleccionados de biblioteca se copian completos: modificaciones posteriores no cambian la sesión ni otra planificación. Duplicar ejercicio crea un nuevo registro con copia independiente.

## Publicación y privacidad

Para compartir, habilitar bloque, tarea y el campo **Pizarra animada (publicación explícita)**, y publicar la sesión. La casilla de pizarra comienza desactivada incluso al reutilizar biblioteca. La RPC de Wellness devuelve únicamente un documento validado por lista permitida; notas y miniaturas no se comparten. Nombre de pasos, textos y números del dibujo sí forman parte del contenido que se decide publicar: no escribir ahí notas confidenciales.

Wellness muestra **Ver ejercicio** sólo cuando hay documento válido, con visor de reproducción sin herramientas de edición. El acceso sigue siendo el Wellness público por enlace/categoría, no autenticación personal. Nunca se exponen borradores ni ejercicios de otra categoría. Sin planificación publicada visible no aparece ningún elemento adicional.

## Migración aplicada

**Aplicada y verificada con autorización:** `supabase/migrations/20261030002005_pizarra_tactica.sql`.

Agrega `pizarra`, `pizarra_miniatura` y `pizarra_revision` a biblioteca; crea un validador de documentos, un trigger para validación/revisión y la RPC `guardar_ejercicio_pizarra` con SECURITY INVOKER. Conserva RLS de biblioteca (coordinación/técnico escriben, preparador físico lee) y los permisos actuales de Planificación. Extiende únicamente las funciones privadas de validación y proyección de tareas para admitir el campo opcional. No transforma registros históricos ni recrea la planificación.

No volver a ejecutar ese archivo ni ejecutar todas las migraciones del directorio. Se verificaron las tres columnas, funciones, RPC y trigger, la conservación de datos y políticas RLS y la exclusión de contenido privado en la respuesta pública. Los guardados fallidos conservan el formulario.

Límites: 200 elementos, 60 pasos, transiciones de 0,1 a 60 segundos. Las sesiones mantienen el límite total de 1 MB de la RPC existente; varios diseños muy grandes pueden requerir simplificar la sesión. Las fotos o enlaces externos nunca se embeben dentro del SVG.

## Verificación

- Suite habitual: `node --test --test-concurrency=1 tests/*.test.mjs`.
- `node --test tests/pizarra.interaccion.mjs`: DOM en memoria, desde paquete jsdom temporal externo (ruta opcional `PIZARRA_DOM_PATH`). Comprueba colocación, arrastre, color, rotación, selección múltiple, historial e interpolación RAF.
- `node --test tests/pizarra.postgres.mjs`: PostgreSQL PGlite en memoria, sin credenciales (`PLANIFICACION_PG_PATH` opcional). Comprueba migración, registros antiguos, RLS, RPC, conflictos, independencia de copias y privacidad pública.
- `npm run build` y compilación completa en memoria sin configurar credenciales locales.

No se efectuaron escrituras de prueba en Supabase. Queda pendiente comprobar en navegador/tablet real la experiencia táctil, pantalla completa, exportación PNG e integración visual con Planificación y Wellness: el acceso automatizado a Chrome no fue aprobado. La simulación DOM no sustituye esa comprobación visual. Los tres SQL anteriores sin seguimiento permanecen intactos.
