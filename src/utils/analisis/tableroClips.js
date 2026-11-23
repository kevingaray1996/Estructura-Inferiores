// Tablero de estadísticas clickeable (etapa 2): cada número trae la lista de acciones (o clips) que lo forman, para
// reproducirlas como playlist temporal. Lógica pura.
import { crucesDeClips, esMomento } from './colectiva.js'
import { crearClip } from './clips.js'
import { CLUB } from './equipos.js'

// Cruces destacados: acciones individuales de Comunicaciones dentro de un momento de Comunicaciones.
export const CRUCES = Object.freeze([
  { id: 'remates_pelota_parada', titulo: 'Remates de pelota parada', tipos: ['Remate'], momentos: ['Córner a favor', 'Tiro libre a favor'] },
  { id: 'faltas_transicion_defensiva', titulo: 'Faltas en transición defensiva', tipos: ['Falta cometida'], momentos: ['Transición defensiva'] },
  { id: 'perdidas_en_salida', titulo: 'Pérdidas en salida', tipos: ['Pérdida'], momentos: ['Salida'] },
])

// «1:32» (o «45 s» si dura menos de un minuto).
export function textoDuracion(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0))
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Clips de un partido (o varios), con su dueño. Para el tablero se usan los clips en vez de las filas, así el espejo
// (momentos del otro equipo) ya viene resuelto.
// vista: 'club' (lo nuestro), o una clave de equipo.
export function clipsDeAnalisis({ analisis, acciones, catalogo, equipos, marcasPorPartido = null }) {
  const porId = new Map((analisis || []).map((a) => [a.id, a]))
  const salida = []
  for (const evento of acciones || []) {
    const a = porId.get(evento.partido_id)
    if (!a) continue
    const opciones = { analisis: a, catalogo, equipos, marcas: marcasPorPartido?.get?.(a.id) || null }
    const clip = crearClip(evento, opciones)
    if (clip) salida.push(clip)
    if (esMomento(evento, catalogo)) {
      const espejo = crearClip(evento, { ...opciones, espejo: true })
      if (espejo) salida.push(espejo)
    }
  }
  return salida.sort((x, y) => String(x.partidoId).localeCompare(String(y.partidoId)) || x.segundo - y.segundo)
}

// Momentos colectivos de un equipo, agrupados por tipo: cantidad, tiempo total y promedio, con sus clips.
export function estadisticasColectivas(clips, equipo) {
  const grupos = new Map()
  for (const c of clips || []) {
    if (!c.colectiva || c.equipo !== equipo) continue
    if (!grupos.has(c.tipo)) grupos.set(c.tipo, { tipo: c.tipo, clips: [], total: 0 })
    const g = grupos.get(c.tipo)
    g.clips.push(c)
    g.total += Math.max(0, (c.segundoFin ?? c.segundo) - c.segundo)
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, cantidad: g.clips.length, promedio: g.clips.length ? g.total / g.clips.length : 0 }))
    .sort((a, b) => b.cantidad - a.cantidad || a.tipo.localeCompare(b.tipo))
}

// Acciones individuales por tipo (de Comunicaciones), con sus clips.
export function individualesPorTipo(clips) {
  const grupos = new Map()
  for (const c of clips || []) {
    if (c.colectiva) continue
    if (!grupos.has(c.tipo)) grupos.set(c.tipo, [])
    grupos.get(c.tipo).push(c)
  }
  return [...grupos.entries()].map(([tipo, lista]) => ({ tipo, clips: lista })).sort((a, b) => b.clips.length - a.clips.length)
}

// Cruces destacados de Comunicaciones. Una acción dentro de dos momentos que se superponen cuenta una sola vez.
export function crucesDestacados(clips) {
  const nuestros = (clips || []).filter((c) => c.equipo === CLUB)
  const individuales = nuestros.filter((c) => !c.colectiva)
  return CRUCES.map((cruce) => {
    const momentos = nuestros.filter((c) => c.colectiva && cruce.momentos.includes(c.tipo))
    const candidatas = individuales.filter((c) => cruce.tipos.includes(c.tipo))
    const vistos = new Set(), adentro = []
    for (const partidoId of new Set(momentos.map((m) => m.partidoId))) {
      const ms = momentos.filter((m) => m.partidoId === partidoId).map((m) => ({ ...m, segundo_fin: m.segundoFin }))
      const evs = candidatas.filter((c) => c.partidoId === partidoId)
      for (const { eventos } of crucesDeClips(ms, evs)) {
        for (const e of eventos) if (!vistos.has(e.clave)) { vistos.add(e.clave); adentro.push(e) }
      }
    }
    return { ...cruce, clips: adentro.sort((a, b) => String(a.partidoId).localeCompare(String(b.partidoId)) || a.segundo - b.segundo) }
  })
}

// Tabla jugadora × acción: filas jugadoras (las que tienen acciones), columnas tipos individuales; cada celda, sus clips.
export function tablaJugadoraAccion(clips, { orden = [] } = {}) {
  const individuales = (clips || []).filter((c) => !c.colectiva && c.jugadoraId)
  const tipos = [...new Set(individuales.map((c) => c.tipo))]
    .sort((a, b) => (orden.indexOf(a) >>> 0) - (orden.indexOf(b) >>> 0) || a.localeCompare(b))
  const filas = new Map()
  for (const c of individuales) {
    if (!filas.has(c.jugadoraId)) filas.set(c.jugadoraId, { jugadoraId: c.jugadoraId, celdas: {}, total: 0 })
    const f = filas.get(c.jugadoraId)
    ;(f.celdas[c.tipo] ||= []).push(c)
    f.total += 1
  }
  return { tipos, filas: [...filas.values()].sort((a, b) => b.total - a.total) }
}
