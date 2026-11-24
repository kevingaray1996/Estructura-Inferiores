# Análisis · Etapa 3: estadísticas visuales

Rama `analisis-estadisticas-visuales`. Sale de main con la etapa 2 (equipos, clips, playlists, tablero clickeable).

## 1. Posesión

### Qué se guarda

Una sola tabla nueva, `analisis_posesion_tramos`, con **solo lo marcado a mano**:

| Columna | Qué es |
|---|---|
| `partido_id` | El análisis (se borra con él). |
| `inicio`, `fin` | Segundos del video (`fin > inicio`). |
| `estado` | `analizado` (pelota del equipo analizado), `otro` (pelota del otro) o `detenida` (afuera, falta, cambio, lesión). |
| `creado_por`, `creado_en`, `actualizado_en` | Sellos. |

Los tramos a mano de un mismo análisis no se pisan entre sí (lo controla un trigger). Lo automático **no se guarda**:
se calcula cada vez desde los momentos colectivos. Permisos: escribir `puede_administrar_analisis()`, leer
`puede_consultar_analisis(partido_id)`, red `sin_cuentas_jugadoras`, nada para anon.

### Cómo se calcula (`src/utils/analisis/posesion.js`)

1. **Automático**, desde los momentos colectivos tal como se marcaron (desde el equipo analizado; el espejo da lo
   mismo visto del otro lado):
   - pelota del analizado: Salida, Ataque posicional, Transición ofensiva, Córner a favor, Tiro libre a favor;
   - pelota del otro: Presión alta, Defensa organizada, Transición defensiva, Salida rival, Córner en contra, Tiro libre
     en contra;
   - Charla (Error defensivo, Acción destacada) no cuenta. Un botón nuevo sin lista usa su grupo (con pelota / sin
     pelota). Si dos momentos se superponen, vale el que empezó después.
2. **A mano** pisa lo automático. Lo automático solo llena lo que no está marcado a mano.
3. Lo que queda sin nada es **sin datos**.
4. Con las marcas del partido se mira solo 1T y 2T (el entretiempo no cuenta). Sin marcas, todo el video con datos.

Resultados:

- **% de posesión** = tiempo del analizado ÷ (tiempo del analizado + tiempo del otro). La pelota detenida y lo sin
  datos no cuentan.
- **Cobertura** = tiempo con algún dato (incluida la pelota detenida) ÷ tiempo del partido. Se muestra «Posesión 56% ·
  calculada sobre el 82% del partido». Menos del 50% lleva la marca **dato parcial**.
- **Dominio por bloques de 5 minutos**, por tiempo: segundos de cada equipo en cada bloque (barra hacia arriba el
  analizado, hacia abajo el otro).

### Modo posesión

Pestaña «Posesión» del panel al lado del video (coordinación). Indicador grande de quién tiene la pelota en el segundo
actual y dos teclas que se cambian y se guardan en la compu (por defecto **Q**: cambia de equipo; **W**: pelota
detenida). Cada toque cierra el tramo abierto en ese segundo, lo guarda y abre el siguiente. Desde «detenida», la tecla
de cambio sigue con el equipo que no tenía la pelota antes de la detención (otro toque la da vuelta). También hay
botones grandes para el celular.

### Línea de tiempo

Fila «Posesión»: amarillo el analizado, blanco el otro, gris pelota detenida, rayado sin datos. Coordinación arrastra
los bordes de un tramo como las otras barras; el resultado queda como tramo a mano (si era automático, lo marcado a
mano pasa a mandar en ese rango; el momento colectivo no cambia).

## 2. Mapa de acciones

Ya dibujaba siempre atacando hacia la derecha (`orientar`, `direccionDe`): el 2T usa el lado contrario al del 1T, con
el lado de `analisis_partidos.direccion_primer_tiempo`. La base no deja ese dato vacío (por defecto «derecha»), así
que en el mapa se muestra el lado del 1T de cada partido incluido, con un botón para corregirlo (coordinación).
Se suma: filtro por tipo de acción, incorrectas en rojo bien visible, calor de cualquier filtro (Pérdidas en rojo) y
tocar un punto abre su clip.

## 3. Minutos jugados sugeridos (solo propios)

`minutosDetallados` (en `eventosPartido.js`): para cada tiempo, las titulares desde el inicio y las que entran desde su
cambio, hasta que salen, son expulsadas (roja o segunda amarilla) o termina el tiempo. Usa las marcas reales del
video, así que incluye el tiempo agregado. Se redondea a minutos enteros.

Avisos en vez de inventar: faltan marcas, no hay titulares, una jugadora tiene acciones mientras figura afuera de la
cancha («¿falta marcar un cambio?»), una tarjeta roja sin jugadora.

Tabla: jugadora, sugeridos, cargados hoy, diferencia. «Confirmar» por jugadora y «Confirmar todos» (con vista previa
de lo que cambia) son lo único que escribe en `estadisticas_jugador.minutos_jugados`.

## 4. Pantalla del partido

En Estadísticas → «Partido seleccionado» (propio o scouting), arriba de todo, un resumen pensado para el celular:
encabezado con escudos (tabla `equipos`, y el del club desde `config/club.js`), resultado, fecha y número de fecha;
barra de posesión y dominio por bloques; comparación nosotros vs rival en barras (solo datos de los dos: posesión,
momentos colectivos con su espejo, goles, tarjetas); resumen de momentos colectivos; línea de tiempo con goles,
cambios y tarjetas; jugadoras destacadas (minutos y acciones clave). Todo abre sus clips. Los datos con poca cobertura
llevan «dato parcial».

## 5. Detalles

- El selector de equipos del scouting no muestra al club.
- Test `etiquetadoSinEsperas`: usaba la tecla X, que desde la etapa del marcador es «Cambio». Era el test.
