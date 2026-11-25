# Análisis etapa 5: Pizarra 2D desde la jugada

La jugada dibujada sobre el video (etapa 4) se ve también en una cancha vista desde arriba, con fichas que se mueven
en sincronía con el clip, y se puede guardar como jugada de la Pizarra en la Biblioteca.

## Base de datos

**No hace falta SQL.** Todo entra en lo que ya existe:

- Los dibujos siguen en `analisis_dibujos.datos` (uno por clip). La base solo exige un objeto JSON con `version`
  entre 1 y 999 y hasta 200 KB: la versión 2 entra sin cambios. Leer: quien ve Análisis; escribir:
  `puede_administrar_analisis()`; nada para anon ni cuentas de jugadoras (políticas de la etapa 4, sin tocar).
- Guardar en la Biblioteca usa la RPC existente `guardar_ejercicio_pizarra` (tipo `jugada`, ámbito `cancha`, la
  carpeta elegida, la pizarra validada por `pizarra_privado.validar` y `link_video` con el enlace al clip). Sus
  permisos son los de la Biblioteca (coordinación y técnicos escriben Cancha); en Análisis el botón solo aparece en el
  editor, que es de coordinación.
- No se modifica ni se mueve ningún dato existente.

## Calibración (cómo se pasa del video a la cancha)

- Medidas: `cancha: { largo, ancho }` en metros, por defecto 100 × 64 (de 50 a 120 × 30 a 90). Al calibrar el primer
  clip de un partido se proponen las medidas de otro clip ya calibrado de ese partido.
- Puntos conocidos (en metros, con las medidas reglamentarias de áreas y círculo): banderines, mitad de cancha con
  cada lateral, centro, cuatro puntos del círculo central, esquinas de área grande y chica de cada lado y puntos
  penales. El eje x va a lo largo (0 = arco de la izquierda de la cámara) y el y a lo ancho (0 = lateral de arriba).
- Una calibración es `{ id, t, puntos: [{ ref, x, y }] }`: el nombre del punto conocido y dónde se marcó en el video
  (0 a 1, relativo al cuadro, como el resto de los dibujos). Se guardan los puntos, no la cuenta: la transformación se
  recalcula al leer.
- Transformación: homografía (proyección de un plano en otro) por mínimos cuadrados con 4 o más puntos, con los
  puntos normalizados para que la cuenta sea estable. Se rechaza si hay menos de 4 puntos, si tres de cuatro están en
  línea o si la cuenta no da (puntos demasiado juntos).
- Varias calibraciones por clip (si la cámara se mueve, «Recalibrar en este cuadro» copia los puntos de la más
  cercana y se corrigen los que cambiaron). Cada momento usa la calibración más cercana en el tiempo.
- Control de calidad: se dibujan las líneas de la cancha proyectadas sobre el video y, por cada punto, cuánto se
  aleja la línea calculada de donde se marcó. Un punto con error grande se marca y se puede volver a marcar.

## Formato de los dibujos, versión 2

Igual que la 1, más campos opcionales. Un dibujo sin nada de lo nuevo se sigue guardando como versión 1 (así una
app vieja que todavía no se actualizó lo sigue mostrando). La app nueva lee la versión 1 sin cambios.

| Campo | Qué es |
|---|---|
| `cancha` | `{ largo, ancho }` en metros. |
| `calibraciones` | Hasta 20: `{ id, t, puntos: [{ ref, x, y }] }` (de 4 a 20 puntos, sin repetir `ref`). |
| objeto `ficha` | Jugadora agregada en un cuadro: `{ t, punto: {x, y}, jugadora }`. Se ve quieta en la 2D, no sobre el video. |
| `jugadora` en anillo y foco | Igual que en «Nombre y dorsal»: nuestra (`id`, `nombre`, `dorsal`, `foto`) o rival (`dorsal`, `nombre`). |
| `en2d: false` | En objetos que siguen a una jugadora: no se muestra en la 2D (por ejemplo, si un anillo y un nombre siguen a la misma). |
| `ajustes2d` | Correcciones hechas en la 2D: `[{ t, dx, dy }]` en metros. Se suman a la posición calculada (entre dos ajustes se interpola). No cambian los puntos del video. |

Equipo de cada ficha: el de su `jugadora`; si no tiene, por el color del dibujo (amarillo o blanco = nuestra, rojo o
azul = rival). Nuestras van en amarillo con dorsal o foto (a elección de quien mira); las rivales, con la camiseta
del equipo rival cargada en Equipos (igual que la Pizarra).

## Vista Pizarra 2D

- Se arma con el mismo dibujo de cancha de la Pizarra (`PizarraCancha`). Los metros de la cancha real se pasan a la
  cancha de la Pizarra (105 × 68) respetando las áreas: lo que está dentro de 16,5 m de cada arco y del ancho del
  área conserva su distancia a esas líneas; el resto se estira.
- Posición de cada jugadora seguida: su punto del video en ese momento (los pies) pasado por la calibración.
- Otros dibujos: pases (por bajo y por alto), movimientos, líneas, zonas y textos se pasan a la cancha con la
  calibración del momento en que aparecen; subtítulos y pausas siguen al video. La «Línea entre dos jugadoras»
  muestra los metros, en la 2D y sobre el video, si el clip está calibrado.
- Corregir: arrastrar una ficha en la 2D guarda un ajuste en ese momento.

## Guardar en la Biblioteca y exportar

- Se convierte a un documento de Pizarra versión 2 (cancha completa): una ficha por jugadora, con su dorsal, nombre y
  vínculo (nuestra) o la camiseta del rival; pases y movimientos como flechas; zonas como zona sombreada; textos.
- Pasos: uno al inicio, uno en cada comienzo de subtítulo y en cada pausa, y el resto cada 1 s (máximo 60). Cada paso
  lleva su subtítulo, su pausa y oculta lo que no se ve en ese momento. La duración de cada paso es el tiempo real
  entre ellos.
- Se guarda con el nombre, la carpeta y el enlace al clip original (YouTube en el segundo justo).
- Exportar PNG o video usa la misma ventana de exportar de la Pizarra con ese documento. El video real con dibujos es
  de la etapa 6.

## Quién hace qué

- Calibrar, agregar fichas, corregir y guardar en la Biblioteca: el editor (coordinación, en la compu).
- Ver la 2D: también el cuerpo técnico y en el celular, desde el reproductor de playlists (botón «2D»).
