# Análisis: dibujos nivel profesional

Herramientas nuevas para el editor de dibujos (etapas 4 y 5): anillo detrás de las piernas, reflector, foco en una
zona, flechas que crecen, opciones de pase, zonas que se mueven, línea defensiva con cobertura, cámara lenta, pausa
explicativa en un toque y «Mi estilo».

## Base de datos

**No hace falta SQL.**

- Todo va en el mismo JSON de `analisis_dibujos.datos`, que pasa a la **versión 3**. La base acepta versiones de 1
  a 999 y hasta 200 KB, así que entra sin cambios. Leer y escribir siguen con los mismos permisos de siempre
  (escribe solo `puede_administrar_analisis()`; nada para anon ni para las cuentas de jugadoras).
- Un dibujo que no usa nada nuevo se sigue guardando como versión 1 o 2, igual que antes. Así una app que todavía no
  se actualizó lo sigue mostrando.
- La app nueva lee las versiones 1 y 2 sin cambios. No se modifica ni se mueve ningún dato que ya esté guardado.
- «Mi estilo» se guarda en los datos de la cuenta de cada persona (`user_metadata` de Supabase Auth, con
  `supabase.auth.updateUser`). Vale en cualquier compu y no necesita tablas nuevas. Ese campo no se usa para
  permisos: los permisos salen de `perfiles` y `app_metadata`, que la persona no puede cambiar. Además queda una
  copia en el navegador, para que se lea al instante y también funcione sin conexión.

## Formato de los dibujos, versión 3

Igual que la 2, más campos opcionales. Se guarda como 3 solo si usa alguno.

| Campo | Dónde | Qué es |
|---|---|---|
| `lentos` | dibujo | Hasta 20 tramos de cámara lenta: `{ id, desde, hasta, velocidad: 0.5 \| 0.25 }`. |
| `hueco` | `anillo` | Hueco del arco de atrás. Si no está, se calcula solo; `false` lo saca; un número de 0,1 a 0,6 es el ancho elegido (fracción del ancho del anillo). |
| `crecer` | `pase_bajo`, `pase_alto`, `movimiento` | `{ modo: 'rapida' \| 'normal' \| 'lenta' \| 'real', salida?, llegada?, pelota: bool }`. Si no está, la flecha aparece entera, como antes. |
| `claves` | `zona`, `poligono` | Formas en distintos momentos: `[{ t, puntos }]`, con la misma cantidad de puntos que `puntos`. Entre dos claves la forma se interpola. `puntos` sigue siendo la forma base (la del primer momento). |
| `texto`, `efectos`, `medidas` | `zona`, `poligono`, `zona_lineas` | Texto centrado que se mueve con la zona; `{ despliegue, rayado, pulso }`; `medidas: true` muestra ancho y profundidad en metros si el clip está calibrado. |
| `luz` | `reflector` | `{ color, intensidad: 0,2–1, ancho: 0,5–2 }`. |
| objeto `reflector` | | Sigue a la jugadora como el anillo (`pista`, `jugadora`, `en2d`). |
| objeto `foco_zona` | | `{ forma: 'circulo' \| 'elipse' \| 'rectangulo', claves: [{ t, x, y, rx, ry }] }`: centro y medio ancho y medio alto (0 a 1). Con una sola clave queda quieto. |
| objeto `opciones_pase` | | `{ pasadora, receptora, opciones: [...], secuencia: bool }`. Cada una es `{ punto: {x, y}, seguir: id \| null, jugadora? }`. Con `seguir`, la posición es la de esa jugadora seguida. Hasta 5 opciones. |
| objeto `zona_lineas` | | `{ lineaA: [ids], lineaB: [ids] }`: ids de jugadoras seguidas. La zona es el polígono entre las dos líneas. |
| objeto `linea_defensiva` | | `{ jugadoras: [ids], rol: 'defensa' \| 'volantes', arco: 'izquierda' \| 'derecha', umbral: 2, estados: { id: 'en_linea' \| 'adelantada' \| 'atras' }, cubiertas: { id: bool } }`. `estados` y `cubiertas` se usan solo si el clip no está calibrado. |

Si una jugadora seguida que usa la zona entre líneas, la línea defensiva o las opciones de pase se borra, sale de
esas listas. Si una lista queda vacía, el dibujo se borra.

## Cómo se anima cada cosa

### Tiempo de animación (con las pausas adentro)

Durante una Pausa el video queda quieto, pero las animaciones tienen que seguir: el pase que se dibuja, las opciones
que se encienden o el reflector que se prende. Por eso se usa un **tiempo de animación**: el tiempo del clip más los
segundos de las pausas que ya pasaron, más lo que lleva la pausa actual.

`virtual(t) = t + Σ duración de las pausas con p.t < t + (si hay una pausa en curso: lo que lleva)`.

Cada animación arranca en `virtual(desde)`, contando solo las pausas de antes de `desde`. Si el dibujo empieza justo
en una pausa, se anima durante esa pausa. En el editor, fuera de la Vista previa, todo se ve terminado (como pasa hoy
con el rebote y el pulso).

### Anillo detrás de las piernas

La elipse está centrada en los pies. El arco de atrás es la mitad de arriba de la elipse (la más lejos de la cámara).
Se corta un hueco centrado arriba, donde están las piernas. El arco de adelante se ve completo.

Con un hueco de ancho `g` (fracción del ancho del anillo), los ángulos que se cortan son los de la mitad de arriba
con `|cos θ| < g`, es decir de `π + acos(g)` a `2π − acos(g)`. El trazo es un solo arco que va de un borde del hueco
al otro pasando por adelante. El relleno transparente también deja la muesca, así las piernas no quedan tapadas.

El hueco automático es `0,28` (calibrado contra el ancho de las piernas a la distancia típica de la cámara). Se puede
elegir de 0,1 a 0,6 o desactivar. Vale también para los anillos de «Opciones de pase».

### Flechas que crecen

- Duración: rápida 0,4 s, normal 0,8 s, lenta 1,5 s. «Como el pase real» va del momento de salida al de llegada que
  se marcan en el clip; esas dos marcas se guardan en tiempo de clip.
- El avance `u` (de 0 a 1) se suaviza al final (*ease-out*).
- Pase por bajo: el final es el punto a una fracción `u` del recorrido.
- Pase por alto: la curva se corta con De Casteljau en `u`, así la parte que se ve es la misma curva. La sombra en el
  piso (la recta) crece con el mismo `u`.
- Movimiento: el trazo se corta en la fracción `u` del largo total.
- La punta de la flecha va siempre en el extremo que avanza, en la dirección de la tangente.
- Pelotita (opcional): un círculo en la punta mientras crece. En el pase alto, además, su sombra va por el piso.

### Reflector

Un cono que baja desde el borde de arriba del video hasta los pies de la jugadora (arriba mide un tercio del ancho de
abajo), relleno con un degradé del color de la luz (transparente arriba, más fuerte abajo). Abajo termina en una
elipse iluminada. El resto de la imagen se oscurece apenas (velo negro de 0,15 a 0,4 según la intensidad), con un
agujero del mismo cono. Entrada: el brillo va de 0 a 1 en 0,5 s de tiempo de animación. Ancho del haz: de 0,5 a 2
veces el ancho base.

### Foco en una zona

El mismo velo del Foco, con un agujero de la forma elegida. Con dos o más claves, el centro y el tamaño se interpolan
en línea recta entre ellas.

### Opciones de pase

- Pase que se hizo: flecha roja de la pasadora a la receptora.
- Opciones: líneas punteadas verdes de la pasadora a cada compañera, con un número (1, 2, 3…) y un anillo (con
  hueco) debajo de cada una.
- Secuencia (tiempo de animación desde que aparece): el pase crece en 0,5 s y cada opción aparece 0,7 s después de la
  anterior (la primera a 0,9 s). Si el dibujo empieza en una Pausa, todo pasa durante la pausa.
- En la 2D: las mismas flechas y números, en el lugar del momento en que aparece.

### Zonas dinámicas

- Forma en t: entre dos claves, cada punto se interpola. Antes de la primera y después de la última, queda la del
  borde.
- Despliegue: la zona crece desde su centro en 0,5 s. Pulso: el relleno sube y baja suave. Rayado: líneas diagonales.
- Zona entre líneas: las jugadoras de cada línea se ordenan de izquierda a derecha en el video. El polígono es la línea
  A de izquierda a derecha y la línea B de derecha a izquierda. Se arma de nuevo en cada cuadro, así se estira y se
  achica con ellas.
- Metros (si el clip está calibrado): se pasan las esquinas a la cancha. Profundidad es lo que ocupa a lo largo de la
  cancha y ancho lo que ocupa a lo ancho. En la zona entre líneas, la profundidad es la distancia entre los promedios
  de las dos líneas a lo largo de la cancha.

### Línea defensiva (cálculo en metros)

1. Se pasa cada jugadora a metros con la calibración del momento: `x` a lo largo de la cancha, `y` a lo ancho.
2. Hacia adelante es hacia el arco rival. Con `arco = 'izquierda'` (defienden el arco de la izquierda), adelante es
   `+x`; con `'derecha'`, `−x`. Al crear la línea se elige solo el arco más cercano al promedio de las jugadoras, y se
   puede cambiar en Propiedades.
3. Referencia de la línea: la mediana de las `x` (lo que marca la mayoría). Con dos jugadoras, la más retrasada.
4. Diferencia de cada una: `d = (x − referencia) × adelante`. Si `|d| ≤ umbral` está en línea (amarillo); si
   `d > umbral`, adelantada (naranja); si `d < −umbral`, atrás (rojo, «Rompe la línea»). El umbral es 2 m por defecto
   y se ajusta de 0,5 a 6 m.
5. Cobertura de una adelantada: el espacio que dejó es el punto de la línea a su misma altura `(referencia, y)`. La
   compañera de al lado es la de la línea más cerca de ese punto. El triángulo va de la compañera al punto y a 6 m
   detrás del punto. Es verde si la compañera está a 8 m o menos del espacio y no está adelantada; si no, rojo.
6. Los vértices se pasan de vuelta al video con la calibración inversa.

Sin calibración: la línea une a las jugadoras de izquierda a derecha en el video. El estado de cada una y si está
cubierta se marcan a mano en Propiedades. El triángulo se arma en el video: el espacio es el punto de la línea de las
demás a la misma altura del video.

Lo mismo sirve para la línea de volantes (`rol: 'volantes'`): solo cambia el nombre.

### Cámara lenta

- `velocidadEn(lentos, t)` dice si `t` está en un tramo lento. Mientras se reproduce, un controlador guarda la
  velocidad que había al entrar al tramo, pone 0,5x o 0,25x en YouTube y la devuelve al salir. Si la persona cambia la
  velocidad fuera de un tramo, esa es la que se devuelve.
- Funciona en la Vista previa del editor, en el video de Análisis con dibujos y en el reproductor de playlists. Las
  animaciones se ven más lentas, porque siguen el tiempo del video.
- La línea de tiempo del clip (en el editor) tiene una fila «Cámara lenta» con cada tramo. Sobre el video aparece
  «Cámara lenta 0,5x» mientras dura.

### Pausa explicativa en un toque

En el cuadro actual se crea una Pausa (3 s), un foco y un subtítulo listo para escribir. Si se toca una jugadora ya
seguida, se crea un Foco que la sigue (con sus mismos puntos clave). Si no, un Foco en una zona redonda en ese punto.

## Mi estilo

Por herramienta: color, grosor, efectos, modo de crecimiento, pelotita, hueco del anillo y luz del reflector. «Guardar
como mi estilo» en Propiedades toma lo del dibujo elegido. Cada dibujo nuevo de esa herramienta arranca así. Se guarda
en la cuenta (`user_metadata.analisis_estilo`, menos de 2 KB) y en el navegador. Si no hay conexión, queda en el
navegador y se avisa.

## Rendimiento

- Nada de filtros de desenfoque: solo degradés y máscaras, que el navegador pinta rápido.
- La escena se calcula una vez por cuadro. La calibración resuelta queda en memoria (como en la etapa 5).
- La línea defensiva y la zona entre líneas hacen una cuenta chica por jugadora.
- La capa se vuelve a pintar como mucho unas 90 veces por segundo, solo si el tiempo cambió.

## Atajos nuevos

H reflector · Z foco en una zona · I opciones de pase · W zona entre líneas · D línea defensiva · J cámara lenta desde
acá · X pausa explicativa. No chocan con los de antes (V B A M L R G T O F N E C P S, Ctrl+D, Ctrl+Z, Ctrl+Y).
