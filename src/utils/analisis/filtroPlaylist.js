// Filtro de playlists (etapa 2, docs/analisis-etapa2.md). Se guarda en analisis_playlists.filtro (jsonb, versión 1).
// Lógica pura: de todas las acciones que el usuario ve, arma la lista de clips que cumplen el filtro.
import { opcionesResultado, reglasDe } from './catalogoAcciones.js'
import { esMomento } from './colectiva.js'
import { claveClip, crearClip } from './clips.js'
import { CLUB, fechaDelAnalisis, juegaEquipo, nombreDeClave } from './equipos.js'

export const RESULTADOS_CORRECTOS = ['Exitoso', 'Gol', 'Atajada']
export const RESULTADOS_INCORRECTOS = ['Fallido', 'Fuera', 'Bloqueado']

export const FILTRO_VACIO = Object.freeze({
  v: 1, equipo: null, partidos: [], ultimos: null, tipos: [], jugadoras: [], tiempo: null, resultado: null, mirada: 'marcado',
})

const MIRADAS = ['marcado', 'espejo', 'equipo', 'rival']
const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [])

// Lo que venga de la base (o de la pantalla) queda con la forma de la versión 1.
export function normalizarFiltro(f) {
  const filtro = f && typeof f === 'object' ? f : {}
  const ultimos = Number(filtro.ultimos)
  const tiempo = Number(filtro.tiempo)
  const equipo = typeof filtro.equipo === 'string' && filtro.equipo ? filtro.equipo : null
  let mirada = MIRADAS.includes(filtro.mirada) ? filtro.mirada : 'marcado'
  if (!equipo && (mirada === 'equipo' || mirada === 'rival')) mirada = 'marcado'
  return {
    v: 1,
    equipo,
    partidos: lista(filtro.partidos),
    ultimos: equipo && Number.isInteger(ultimos) && ultimos > 0 ? Math.min(ultimos, 50) : null,
    tipos: lista(filtro.tipos),
    jugadoras: lista(filtro.jugadoras),
    tiempo: tiempo === 1 || tiempo === 2 ? tiempo : null,
    resultado: ['correcta', 'incorrecta'].includes(filtro.resultado) ? filtro.resultado : null,
    mirada,
  }
}

// Partidos del filtro: donde jugó el equipo, los elegidos y, si se pide, los últimos N (más recientes primero).
export function partidosDelFiltro(analisis, filtroCrudo, equipos) {
  const filtro = normalizarFiltro(filtroCrudo)
  let elegidos = (analisis || []).filter((a) => juegaEquipo(a, filtro.equipo, equipos))
  if (filtro.partidos.length) elegidos = elegidos.filter((a) => filtro.partidos.includes(a.id))
  elegidos = [...elegidos].sort((a, b) => String(fechaDelAnalisis(b)).localeCompare(String(fechaDelAnalisis(a)))
    || String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return filtro.ultimos ? elegidos.slice(0, filtro.ultimos) : elegidos
}

export function esCorrecta(evento, catalogo) {
  const r = evento.resultado || reglasDe(catalogo, evento.tipo).resultado_implicito
  return RESULTADOS_CORRECTOS.includes(r)
}
export function esIncorrecta(evento, catalogo) {
  const r = evento.resultado || reglasDe(catalogo, evento.tipo).resultado_implicito
  return RESULTADOS_INCORRECTOS.includes(r)
}

// Clips de un análisis según la mirada.
function clipsDelAnalisis(analisis, acciones, { filtro, catalogo, equipos, marcas }) {
  const salida = []
  for (const evento of acciones) {
    const momento = esMomento(evento, catalogo)
    const opciones = { analisis, catalogo, equipos, marcas }
    if (filtro.mirada === 'marcado') { salida.push(crearClip(evento, opciones)); continue }
    if (filtro.mirada === 'espejo') { if (momento) salida.push(crearClip(evento, { ...opciones, espejo: true })); continue }
    // equipo / rival: todos los clips con su dueño (individuales de Comunicaciones; momento y su espejo).
    salida.push(crearClip(evento, opciones))
    if (momento) salida.push(crearClip(evento, { ...opciones, espejo: true }))
  }
  return salida.filter(Boolean).filter((clip) => {
    if (filtro.mirada === 'equipo') return clip.equipo === filtro.equipo
    if (filtro.mirada === 'rival') return clip.equipo !== filtro.equipo
    return true
  })
}

// Lista de clips del filtro, en orden: partido más reciente primero y, dentro del partido, por segundo del video.
// acciones: todas las filas de analisis_eventos que se ven. marcasPorPartido: Map partido_id → marcas (opcional).
export function clipsDeFiltro({ filtro: filtroCrudo, analisis, acciones, catalogo, equipos, marcasPorPartido = null }) {
  const filtro = normalizarFiltro(filtroCrudo)
  const partidos = partidosDelFiltro(analisis, filtro, equipos)
  const porPartido = new Map()
  for (const e of acciones || []) {
    if (!porPartido.has(e.partido_id)) porPartido.set(e.partido_id, [])
    porPartido.get(e.partido_id).push(e)
  }
  const soloIndividuales = filtro.jugadoras.length > 0 || filtro.resultado !== null
  const salida = []
  for (const a of partidos) {
    const propias = [...(porPartido.get(a.id) || [])].sort((x, y) => Number(x.segundo) - Number(y.segundo))
    const clips = clipsDelAnalisis(a, propias, { filtro, catalogo, equipos, marcas: marcasPorPartido?.get?.(a.id) || null })
    const porEvento = new Map(propias.map((e) => [e.id, e]))
    for (const clip of clips) {
      if (filtro.tipos.length && !filtro.tipos.includes(clip.tipo)) continue
      if (soloIndividuales && clip.colectiva) continue
      if (filtro.jugadoras.length && !filtro.jugadoras.includes(clip.jugadoraId)) continue
      if (filtro.tiempo && clip.periodo !== filtro.tiempo) continue
      const evento = porEvento.get(clip.eventoId)
      if (filtro.resultado === 'correcta' && !esCorrecta(evento, catalogo)) continue
      if (filtro.resultado === 'incorrecta' && !esIncorrecta(evento, catalogo)) continue
      salida.push(clip)
    }
  }
  return salida
}

// «Actualizar con el filtro»: clips del filtro que todavía no están en la playlist y no se sacaron a mano.
export function clipsParaSumar(clipsFiltro, clavesActuales, quitados = []) {
  const ya = new Set([...(clavesActuales || []), ...(quitados || [])])
  return (clipsFiltro || []).filter((c) => !ya.has(c.clave))
}

// Fila para guardar en analisis_playlist_clips.
export const filaDeClip = (playlistId, clip, orden) => ({
  playlist_id: playlistId, evento_id: clip.eventoId, espejo: clip.espejo, orden,
  nota: clip.nota || null, ajuste_inicio: clip.ajuste_inicio || 0, ajuste_fin: clip.ajuste_fin || 0,
})

export { claveClip }

// Texto corto del filtro: «Camioneros · últimos 5 · Pérdida, Transición defensiva · 2T».
export function resumenFiltro(filtroCrudo, { equipos, etiqueta = (t) => t, jugadoras = [] } = {}) {
  const f = normalizarFiltro(filtroCrudo)
  const partes = []
  if (f.equipo) partes.push(nombreDeClave(f.equipo, equipos))
  if (f.ultimos) partes.push(`últimos ${f.ultimos}`)
  if (f.partidos.length) partes.push(f.partidos.length === 1 ? '1 partido' : `${f.partidos.length} partidos`)
  if (f.tipos.length) partes.push(f.tipos.map(etiqueta).join(', '))
  if (f.jugadoras.length) {
    const nombres = f.jugadoras.map((id) => jugadoras.find((j) => j.id === id)).filter(Boolean).map((j) => j.apellido || j.nombre)
    partes.push(nombres.length ? nombres.join(', ') : `${f.jugadoras.length} jugadoras`)
  }
  if (f.tiempo) partes.push(`${f.tiempo}T`)
  if (f.resultado) partes.push(f.resultado === 'correcta' ? 'correctas' : 'incorrectas')
  if (f.mirada === 'espejo') partes.push('desde el otro equipo')
  if (f.mirada === 'equipo' && f.equipo) partes.push(`de ${nombreDeClave(f.equipo, equipos)}`)
  if (f.mirada === 'rival' && f.equipo) partes.push('de sus rivales')
  return partes.join(' · ') || 'Todas las acciones'
}

// ¿Tiene sentido el filtro de resultado para estos tipos? (solo si alguno tiene resultado)
export function tiposConResultado(catalogo) {
  return (catalogo?.tipos || []).filter((t) => t.botonera !== 'colectiva' && opcionesResultado(catalogo, t.codigo).length > 0).map((t) => t.codigo)
}

export const CLAVE_CLUB = CLUB
