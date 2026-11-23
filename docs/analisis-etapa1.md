# Análisis · Etapa 1: botonera colectiva para la charla de video

Rama `analisis-botonera-colectiva`. Sale de main con la etapa 0 (cola de guardado, atajos, panel, marcas de tiempo,
modo consulta, `analisis_eventos.segundo_fin`).

## Regla de oro

Cada dato sale de **una sola botonera**:

- **Individual** (la de hoy, con jugadora): pases, remates, faltas, recuperaciones, pérdidas, duelos…
- **Colectiva** (nueva, sin jugadora): fases del juego y pelota parada. Son **momentos que duran**: tienen inicio y fin.

## Modelo de datos

Sin tablas nuevas. Todo en un único bloque DO (migración `20261124120000_botonera_colectiva.sql`), con respaldo,
verificación de solo lectura y reversión. No modifica ni mueve datos existentes: solo agrega columnas con valor por
defecto, amplía una regla y agrega filas nuevas al catálogo.

### `analisis_tipos_accion` (el catálogo que ya existe)

| Columna nueva | Qué es |
|---|---|
| `botonera` | `'individual'` (todas las de hoy, por defecto) o `'colectiva'`. |
| `duracion_defecto` | Segundos que dura el momento si no se cierra a mano. Obligatoria en las colectivas; vacía en las individuales. |
| `espejo` | Código del tipo colectivo que estaba haciendo **el otro equipo** en ese momento. Opcional. |

- Grupos nuevos para la colectiva: `con_pelota`, `sin_pelota`, `charla` (más `pelota_parada`, que ya existía).
- Un tipo con espejo tiene que ser colectivo y su espejo también (lo controla un trigger en `analisis_privado`).
- Las teclas siguen guardándose en cada compu (como en la individual); la columna `atajo` no se usa.

Botones colectivos que crea la migración:

| Grupo | Botones (duración por defecto) |
|---|---|
| Con pelota | Salida (15 s), Ataque posicional (30 s), Transición ofensiva (10 s) |
| Sin pelota | Presión alta (10 s), Defensa organizada (30 s), Transición defensiva (10 s), Salida rival (15 s) |
| Pelota parada | Córner a favor, Córner en contra, Tiro libre a favor, Tiro libre en contra (15 s) |
| Charla | Error defensivo (6 s), Acción destacada (6 s) — se superponen a la fase abierta |

### `analisis_eventos` (las acciones que ya existen)

Una acción colectiva es una fila más, con `tipo` colectivo, `segundo` = inicio, `segundo_fin` = fin, sin jugadora,
sin resultado y sin ubicación. Un trigger nuevo (`analisis_privado.validar_forma_accion`) obliga a esa forma:

- tipo colectivo → `jugador_id` vacío y `segundo_fin` cargado (y fin ≥ inicio, regla que ya existía);
- tipo individual → `segundo_fin` vacío (hoy todas lo tienen vacío).

### `analisis_partidos` (los análisis)

| Columna nueva | Qué es |
|---|---|
| `tipo_partido` | `'propio'` (por defecto, todos los de hoy) o `'scouting'` (no juega Comunicaciones). |
| `equipo_local`, `equipo_visitante` | Nombres de los equipos. Obligatorios en scouting. |
| `equipo_analizado` | Propio: `'propio'` (por defecto) o `'rival'`. Scouting: `'local'` o `'visitante'`. |

Un scouting nunca está vinculado al calendario (`partido_calendario_id` vacío), así que no entra en convocatorias ni
en minutos. En `rival` se guarda el nombre del equipo analizado, para buscar y filtrar por rival.

### Permisos

Iguales que hoy: escribir solo `puede_administrar_analisis()`, leer `puede_consultar_analisis()` (las reglas de
lectura de la etapa 0 ya cubren las filas nuevas). Nada para anon ni para cuentas de jugadoras.

## Espejo: cómo se calcula

Nunca se guardan dos acciones por marca. Cada marca colectiva está escrita desde el punto de vista del **equipo
analizado**. Para verla desde el otro equipo, al consultar:

```
espejo(marca) = { ...marca, tipo: catalogo[marca.tipo].espejo, equipo: 'otro' }   // si tiene espejo
              = nada                                                              // si no tiene (Error defensivo, Acción destacada, Salida)
```

Pares cargados: Transición ofensiva ↔ Transición defensiva, Ataque posicional ↔ Defensa organizada,
Córner a favor ↔ Córner en contra, Tiro libre a favor ↔ Tiro libre en contra, Presión alta → Salida,
Salida rival → Salida. Funciones en `src/utils/analisis/colectiva.js` (`espejoDe`, `momentosDesde`).

## Eventos dentro de un clip

`eventosEnClip(momento, individuales)`: las acciones individuales con `segundo` entre el inicio y el fin del momento.
`crucesDeClips(momentos, individuales)` devuelve todos los cruces (lo usará la etapa de estadísticas y playlists).

## Pantallas que cambian

1. **Pestaña Etiquetado**: selector «Colectiva | Individual». La colectiva muestra los botones por grupo con su
   tecla. Tocar (o la tecla) abre el momento en el segundo del video; la misma tecla o Enter lo cierra. Mientras está
   abierto: aviso «Grabando: Transición ofensiva · 6 s». Si no se cierra, al llegar a la duración por defecto se
   cierra solo. Tocar otra fase cierra la fase abierta en ese segundo y abre la nueva. Los botones de Charla (Error
   defensivo, Acción destacada) se superponen: no cierran la fase abierta y se ven en su propia fila. Enter cierra el
   último que se abrió.
2. **Línea de tiempo** (debajo del video): una fila por tipo colectivo con marcas (barras de inicio a fin), una fila
   de eventos individuales (puntos verdes / rojos) y las marcas de los tiempos. Línea que sigue al video, tocar una
   barra la reproduce, zoom. Coordinación arrastra bordes o la barra entera y borra; cuerpo técnico solo mira. Vista
   «desde el equipo analizado / desde el otro equipo» (espejo).
3. **Panel del clip**: al elegir una barra, qué eventos individuales caen adentro.
4. **Nuevo análisis**: opción «Partido de scouting» (local, visitante, fecha, YouTube, equipo analizado, categoría).
   En scouting la botonera individual, el marcador y COMET quedan deshabilitados.
5. **Biblioteca de análisis**: marca «Scouting», filtro Propios / Scouting y buscador por rival.
6. **Rendimiento del club** (`utils/rendimiento/lecturas.js`): ignora los scouting y las acciones colectivas.

## Lo que queda para la etapa siguiente

Estadísticas cruzadas, playlists de varios partidos, botonera individual en scouting y dibujo sobre el video.
