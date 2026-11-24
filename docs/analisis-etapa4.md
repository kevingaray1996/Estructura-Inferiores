# Análisis · Etapa 4: dibujos sobre el video

Rama `analisis-dibujo`. Editor de dibujos por clip (estilo Metrica / KlipDraw) y reproducción con los dibujos encima.
Fuera de esta etapa: pizarra 2D (etapa 5), exportar a MP4 y compartir con jugadoras (etapa 6), seguimiento con IA.

## 1. Qué es un clip y dónde se guardan sus dibujos

Un clip es una acción (`analisis_eventos`) vista desde su equipo o desde el otro (`espejo`), como en la etapa 2. Los
dibujos se guardan **uno por clip**: tabla nueva `public.analisis_dibujos` con `(evento_id, espejo)` único.

| columna | qué es |
|---|---|
| `evento_id` | la acción (si se borra la acción, se borran sus dibujos) |
| `espejo` | false: el clip normal; true: el espejo del momento colectivo |
| `partido_id` | lo pone la base desde la acción (para los permisos); no se puede cambiar |
| `datos` | JSON con el formato de abajo, máximo 200 KB, con `version` |
| `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en` | sellos que pone la base |

Permisos: escribir solo `puede_administrar_analisis()`; leer quien puede ver el análisis
(`puede_consultar_analisis(partido_id)`). Nada para anon; red RESTRICTIVE `sin_cuentas_jugadoras`.

Además, `analisis_playlist_clips.con_dibujos` (boolean, true por defecto también para los clips que ya existen): la
opción «con dibujos / sin dibujos» de cada clip de una playlist. No cambia ni mueve ningún dato existente.

Los tiempos de los dibujos son **segundos del video**, no del clip: si una playlist corre el clip ±1 s, los dibujos
siguen pegados a la jugada (lo que queda afuera del tramo simplemente no se ve).

## 2. Formato del JSON (versión 1)

```js
{
  version: 1,
  clip: { inicio: 1415, fin: 1427 },          // tramo con el que se dibujó (referencia)
  objetos: [                                    // máximo 200
    {
      id: 'o1', tipo: 'pase_bajo',              // ver tipos abajo
      desde: 1416.2, hasta: 1419.5,             // cuándo se ve (segundos del video)
      color: 'amarillo',                        // amarillo | blanco | rojo | azul
      grosor: 2,                                // 1 fino | 2 medio | 3 grueso
      puntos: [{ x: 0.21, y: 0.64 }, { x: 0.48, y: 0.55 }],   // 0 a 1 sobre el cuadro del video
      texto: '',                                // texto (tipo texto)
      pista: { fuente: 'manual', claves: [{ t: 1416.2, x: 0.3, y: 0.7 }] }, // seguimiento
      jugadora: { id: 'uuid', nombre: 'A. Pérez', dorsal: '7', foto: 'https://…' }, // o { rival: true, dorsal: '9' }
      efectos: { entrada: true, pulso: false, sombra: true, rastro: false },
      a: 'o2', b: 'o3',                         // enlace: los dos objetos de seguimiento que une
      escala: 2, objetivo: { x: 0.5, y: 0.5 }, seguir: 'o2', // zoom de cámara
    },
  ],
  pausas: [{ id: 'p1', t: 1418.0, duracion: 3 }],          // máximo 50, duración 0,5 a 20 s
  subtitulos: [{ id: 's1', desde: 1415, hasta: 1418, texto: 'Salida por la izquierda' }], // máximo 50, 140 letras
}
```

Tipos: `pase_bajo` (recta), `pase_alto` (curva con sombra en el piso), `movimiento` (flecha punteada, trazo libre),
`linea`, `zona` (rectángulo, 2 puntos), `poligono` (3 a 30 puntos), `texto` (1 punto), `anillo`, `foco`, `nombre`
(siguen una `pista`), `enlace` (une dos objetos de seguimiento), `zoom`.

Reglas (función `normalizarDibujo`, la usa el editor antes de guardar y el reproductor al leer):
- `x`, `y` se recortan a 0–1; tiempos ≥ 0 y `hasta > desde`; colores y grosores fuera de la lista vuelven al de base.
- `pista.fuente` dice de dónde salen los puntos clave (`manual` hoy; mañana `ia` u otra). El reproductor no mira la
  fuente: solo usa `claves` ordenadas por `t`. Máximo 600 claves por pista.
- Versión desconocida: no se dibuja (se avisa), nunca se rompe la reproducción.
- La base frena JSON de más de 200 KB, sin `version` o que no sea objeto.

## 3. Coordenadas e interpolación

- Posición relativa al cuadro del video: `x = (px − izquierda) / ancho`, `y = (py − arriba) / alto`. El cuadro es el
  contenedor 16:9 del reproductor, así que se ve igual en cualquier pantalla.
- Seguimiento: entre dos puntos clave, curva Catmull-Rom (pasa por cada clic y suaviza el recorrido). Antes del primer
  punto clave y después del último, la jugadora queda quieta en ese punto.
- Rastro: la estela de los últimos 1,5 s del recorrido.

## 4. Sincronización con YouTube (incluidas las pausas)

YouTube informa el tiempo de a saltos (~4 veces por segundo). Un **reloj suave** toma la última lectura y la hora de
la compu y estima el tiempo entre lecturas (a la velocidad elegida); si la estimación se aleja más de 0,3 s, se
reacomoda. Con eso los dibujos se mueven a 60 cuadros por segundo.

**Pausas** (motor puro `pasoPausas`, probado sin YouTube):
1. Si el video va reproduciendo y el tiempo cruza el instante de una pausa (avance normal, menos de 1 s entre
   lecturas: un salto no cuenta), se pausa el video, se lo deja exactamente en ese instante y se congelan los dibujos.
2. Se esperan N segundos (por defecto 3) y se reanuda solo. Si la persona aprieta reproducir antes, sigue.
3. Cada pausa se hace una vez por pasada; si el video vuelve atrás (repetir clip, otro clic), se puede volver a hacer.

## 5. Pantallas que cambian

- **Ventana de dibujo** (nueva, `EditorDibujo`, se carga solo al abrirla con `React.lazy`): pantalla completa.
  Arriba título, «Video real | Pizarra 2D (Próximamente)», Cancelar y «Pegar en la línea de tiempo». Izquierda
  herramientas, centro el video del tramo (YouTube con `start`/`end` del clip), derecha propiedades y pasos
  (subtítulos), abajo línea de tiempo del clip (fila por objeto, rombos de puntos clave, pausas y subtítulos).
  Deshacer/rehacer (Ctrl+Z / Ctrl+Y), duplicar (Ctrl+D), borrar (Supr), atajos por herramienta, ← → cuadro a cuadro
  (0,1 s), Vista previa. Solo coordinación y en la compu (pantalla de al menos 1024 px con mouse).
- **Botón «Dibujar»**: en el momento elegido de la línea de tiempo, en cada acción de la lista de Acciones y en cada
  clip al editar una playlist. Solo para quien puede editar; en celular no aparece.
- **Línea de tiempo del partido**: fila «Dibujos» con los clips que tienen dibujos; tocarla reproduce el clip con sus
  dibujos.
- **Video de Análisis**: al reproducir un clip con dibujos (barra de la línea de tiempo, fila «Dibujos» o la lista
  de Acciones), los dibujos aparecen encima, con pausas y subtítulos. Botón «⛶» que pone en pantalla completa el
  video con los dibujos.
- **Reproductor de playlists y estadísticas clickeables**: dibujos encima, sincronizados; ícono ✎ en los clips con
  dibujos; pantalla completa del contenedor (el botón de YouTube queda oculto). Al editar una playlist, cada clip tiene
  «Con dibujos / Sin dibujos» (con dibujos por defecto).
- El zoom de cámara agranda el contenedor del video (CSS `transform`), no lee la imagen de YouTube.

## 6. Archivos

- SQL: `supabase/migrations/20261127120000_dibujos_clips.sql`, `supabase/rollback/…`, `supabase/verification/20261127_dibujos_clips.sql`.
- Lógica pura: `src/utils/analisis/dibujos/` (formato, coordenadas, interpolación, escena, pausas, reloj, historial).
- Componentes: `src/components/analisis/dibujo/` (capa de dibujos, editor, reproducción).
- Tests: `tests/dibujosAnalisis.test.mjs`, `tests/dibujosClips.postgres.mjs`.
