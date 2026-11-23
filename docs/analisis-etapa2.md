# Análisis · Etapa 2: equipos, clips, playlists y tablero clickeable

Rama `analisis-clips-playlists`. Sale de main con la etapa 1 (botonera colectiva, espejo, scouting, línea de tiempo,
cruces).

## Modelo de datos

Un único bloque DO (migración `20261125120000_equipos_clips_playlists.sql`) con respaldo en `seguridad_privado`,
verificación de solo lectura y reversión. **No modifica ni mueve datos existentes**: agrega columnas con valor por
defecto, dos tablas nuevas y filas nuevas en `equipos`.

### Equipos: se reutiliza `public.equipos`

Ya existe (la pantalla «Equipos · Rivales y escudos») y los partidos del calendario ya apuntan a ella
(`partidos.equipo_id`). No se crea otra tabla.

| Cambio | Qué es |
|---|---|
| `equipos.activo` (nuevo, `true` por defecto) | Un equipo inactivo no aparece al cargar, pero sus datos siguen en los filtros. |
| Carga inicial | Se **agregan** los nombres distintos que aparecen como rival en `partidos`, en los análisis propios y como local/visitante en los scouting, si no están ya (comparando sin mayúsculas, acentos ni espacios de más). |

No lleva categoría: un club es el mismo en todas las categorías (y así lo usa hoy la pantalla de Equipos). Los
permisos de `equipos` no cambian (hoy coordinación y técnica la administran desde Partidos); en Análisis solo
coordinación ve «+ Agregar equipo».

### `analisis_partidos`

| Columna nueva | Qué es |
|---|---|
| `equipo_local_id`, `equipo_visitante_id` | Scouting: referencia al equipo del listado (además del nombre, que se sigue guardando). Vacías en los propios y en los scouting viejos. |

Un partido propio toma su rival de `partidos.equipo_id` (el calendario). Si el partido no tiene equipo vinculado, al
**leer** se busca un equipo con el mismo nombre (no se guarda nada). Los scouting viejos con texto libre se leen igual.

### `analisis_tipos_accion` (catálogo)

| Columna nueva | Qué es |
|---|---|
| `margen_antes`, `margen_despues` | Segundos del clip antes y después de la acción. Individuales: Pase −4/+2, Pérdida −5/+5, Remate −6/+3, Falta −3/+8, Gol −15/+5, resto −4/+3. Colectivas: −2/+2 (desde el inicio hasta el fin). |

### Tablas nuevas

`analisis_playlists`: `id`, `categoria_id` (quién la ve), `nombre`, `descripcion`, `filtro` (jsonb, ver abajo, o vacío
si se armó a mano), `quitados` (claves de clips que se sacaron a mano, para que «Actualizar con el filtro» no los
vuelva a sumar), `creado_por`, `creado_en`, `actualizado_en`.

`analisis_playlist_clips`: `id`, `playlist_id` (se borra con la playlist), `evento_id` (la acción; si se borra la
acción, se borra el clip), `espejo` (true: el clip muestra el momento visto desde el otro equipo), `orden`, `nota`,
`ajuste_inicio`, `ajuste_fin` (segundos que se suman al rango calculado: **solo de esta playlist, la acción original no
se toca**). Una misma acción (y lado) una sola vez por playlist.

### Permisos

- Escribir playlists y clips: solo `puede_administrar_analisis()`.
- Leer: coordinación todas; cuerpo técnico las de su categoría (`public.puede_consultar_playlist(categoria)`).
- Nada para anon; red RESTRICTIVE `sin_cuentas_jugadoras` en las dos tablas nuevas.

## Clips

Un clip es un rango del video de YouTube; no se corta ni se descarga nada (`src/utils/analisis/clips.js`):

```
individual:  inicio = max(0, segundo − margen_antes)   fin = segundo + margen_despues
colectiva:   inicio = max(0, segundo − 2)              fin = segundo_fin + 2
con ajuste:  inicio += ajuste_inicio, fin += ajuste_fin   (inicio ≥ 0, fin ≥ inicio + 1)
```

Cada clip sabe de qué equipo es: las individuales son de Comunicaciones; un momento es del equipo analizado y su
espejo, del otro.

## El filtro (jsonb, versión 1)

```json
{ "v": 1,
  "equipo": "club" | "<uuid de equipos>" | null,
  "partidos": ["<uuid de analisis_partidos>"],
  "ultimos": 5 | null,
  "tipos": ["Pérdida", "Transición defensiva"],
  "jugadoras": ["<uuid>"],
  "tiempo": 1 | 2 | null,
  "resultado": "correcta" | "incorrecta" | null,
  "mirada": "marcado" | "espejo" | "equipo" | "rival" }
```

1. Partidos: todos los que el usuario ve; si hay `equipo`, solo donde jugó (scouting como local o visitante, o
   nuestros partidos contra él; `club` = nuestros partidos); si hay `partidos`, solo esos; `ultimos` se queda con los
   N más recientes.
2. Clips de esos partidos según la `mirada`: `marcado` (como se cargaron), `espejo` (lo que hacía el otro equipo),
   `equipo` (clips del equipo elegido: momentos de cuando fue el analizado y espejos de cuando fue el otro) o `rival`
   (lo mismo para sus rivales).
3. Después tipos, jugadoras, tiempo y resultado. Con jugadora o resultado elegidos solo quedan individuales.

La playlist guarda la lista **fija** de clips y el filtro. «Actualizar con el filtro» vuelve a calcularlo y suma los
clips que no están (sin los `quitados`).

## Pantallas que cambian

1. **Panel al lado del video**: la pestaña «Playlist» pasa a llamarse **«Acciones»**. En una acción elegida y en el
   momento elegido de la línea de tiempo: «Agregar a playlist» (coordinación).
2. **Nuevo análisis → Scouting**: local y visitante se eligen del listado con buscador; «+ Agregar equipo».
3. **Biblioteca de análisis**: filtro por equipo (incluye inactivos).
4. **Nueva sección «Playlists»**: biblioteca de playlists; «Nueva playlist» con el filtro y la cuenta de clips antes de
   guardar; editar (quitar, arrastrar para reordenar, nota, ±1 s inicio/fin, «Actualizar con el filtro»); borrar.
5. **Reproductor de playlist** (pantalla encima de todo): clips seguidos aunque cambie el video, rótulo
   «Clip 3/12 · Salida · Estrella del Sur vs Camioneros · 2T 14'» y nota, anterior/siguiente/repetir, pausa al final
   de cada clip, velocidad 0,5x/1x/2x, pantalla completa, atajos (← → R P espacio F), lista al costado (PC) o debajo
   (celular).
6. **Estadísticas**: cada número abre sus clips (playlist temporal con «Guardar como playlist»). Se suman: momentos
   colectivos (cantidad, tiempo total, promedio), cruces (remates en pelota parada a favor, faltas en transición
   defensiva, pérdidas en salida), tabla jugadora × acción y un tablero por equipo. Las del club siguen sin scouting;
   en un scouting solo se ve lo colectivo.

## Para después

Portal de jugadoras con playlists; vincular a mano scouting viejos y partidos propios sin equipo (ver propuesta en el
resumen de la rama).
