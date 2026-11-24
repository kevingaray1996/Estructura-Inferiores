// Pantalla del partido (etapa 3): resultado, comparación de los dos equipos, línea de tiempo resumida y jugadoras
// destacadas. Lógica pura. Solo se comparan datos que existen para los dos equipos.
import { reglasDe } from './catalogoAcciones.js'
import { minutoReal } from './eventosPartido.js'

// Goles de cada lado: del calendario si está; si no, de las marcas de gol del video.
// lados: 'nuestro' = Comunicaciones (propio) o el analizado (scouting).
export function resultadoPartido(analisis, eventosPartido = []) {
  const cal = analisis?.partido_calendario
  if (cal && Number.isFinite(Number(cal.goles_local)) && Number.isFinite(Number(cal.goles_visitante))
      && cal.goles_local !== null && cal.goles_visitante !== null) {
    const deVisitante = String(cal.local_visitante || '').toLowerCase().startsWith('visit')
    return { local: Number(cal.goles_local), visitante: Number(cal.goles_visitante), origen: 'calendario', nuestroEsLocal: !deVisitante }
  }
  const goles = (eventosPartido || []).filter((e) => e.tipo === 'gol')
  if (!goles.length) return null
  const nuestros = goles.filter((g) => g.equipo === 'propio').length
  const suyos = goles.length - nuestros
  return { local: nuestros, visitante: suyos, origen: 'video', nuestroEsLocal: true }
}

// Tipos colectivos que pueden aparecer para los dos equipos (tienen espejo o son el espejo de otro).
export function tiposComparables(catalogo) {
  const colectivos = (catalogo?.tipos || []).filter((t) => t.botonera === 'colectiva')
  const destinos = new Set(colectivos.map((t) => t.espejo).filter(Boolean))
  return colectivos.filter((t) => t.espejo || destinos.has(t.codigo)).map((t) => t.codigo)
}

// Comparación en barras: [{ id, titulo, nuestro, rival, clipsNuestro, clipsRival, sufijo? }].
// clips: los del partido (clipsDeAnalisis), con su equipo. ladoNuestro / ladoRival: claves de equipo.
export function comparacion({ clips, catalogo, ladoNuestro, ladoRival, nuestroEsAnalizado = true, posesion = null, eventosPartido = [], etiqueta = (t) => t }) {
  const filas = []
  if (posesion?.porcentaje != null) {
    const delAnalizado = nuestroEsAnalizado
    filas.push({ id: 'posesion', titulo: 'Posesión', sufijo: '%', parcial: posesion.parcial,
      nuestro: delAnalizado ? posesion.porcentaje : posesion.porcentajeOtro, rival: delAnalizado ? posesion.porcentajeOtro : posesion.porcentaje,
      clipsNuestro: [], clipsRival: [] })
  }
  const goles = (eventosPartido || []).filter((e) => e.tipo === 'gol')
  if (goles.length) filas.push({ id: 'goles', titulo: 'Goles', nuestro: goles.filter((g) => g.equipo === 'propio').length, rival: goles.filter((g) => g.equipo === 'rival').length, eventos: goles })
  const tarjetas = (eventosPartido || []).filter((e) => e.tipo === 'tarjeta')
  if (tarjetas.length) filas.push({ id: 'tarjetas', titulo: 'Tarjetas', nuestro: tarjetas.filter((g) => g.equipo === 'propio').length, rival: tarjetas.filter((g) => g.equipo === 'rival').length, eventos: tarjetas })
  for (const tipo of tiposComparables(catalogo)) {
    const de = (lado) => (clips || []).filter((c) => c.colectiva && c.tipo === tipo && c.equipo === lado)
    const a = de(ladoNuestro), b = de(ladoRival)
    if (!a.length && !b.length) continue
    filas.push({ id: `col:${tipo}`, titulo: etiqueta(tipo), nuestro: a.length, rival: b.length, clipsNuestro: a, clipsRival: b })
  }
  return filas
}

// Línea de tiempo resumida: goles, cambios y tarjetas con su minuto real.
export function lineaResumen(eventosPartido, marcas) {
  return (eventosPartido || [])
    .filter((e) => ['gol', 'cambio', 'tarjeta'].includes(e.tipo))
    .sort((a, b) => Number(a.segundo) - Number(b.segundo))
    .map((e) => {
      const real = minutoReal(e.segundo, marcas)
      return { ...e, minuto: real?.estado === 'juego' ? real.texto : null }
    })
}

const POSITIVOS = ['Exitoso', 'Gol', 'Atajada']
const esGol = (c) => c.tipo === 'Gol' || c.resultado === 'Gol'

// Jugadoras destacadas: las de más acciones clave (goles, remates, recuperaciones), con sus minutos.
export function destacadas(clipsNuestros, minutos = {}, catalogo = null, cantidad = 5) {
  const porJugadora = new Map()
  for (const c of clipsNuestros || []) {
    if (c.colectiva || !c.jugadoraId) continue
    if (!porJugadora.has(c.jugadoraId)) porJugadora.set(c.jugadoraId, { jugadoraId: c.jugadoraId, clips: [], goles: [], remates: [], recuperaciones: [], correctas: 0 })
    const f = porJugadora.get(c.jugadoraId)
    f.clips.push(c)
    if (esGol(c)) f.goles.push(c)
    if (c.tipo === 'Remate') f.remates.push(c)
    if (['Recuperación', 'Intercepción'].includes(c.tipo)) f.recuperaciones.push(c)
    const r = c.resultado || (catalogo ? reglasDe(catalogo, c.tipo).resultado_implicito : null)
    if (POSITIVOS.includes(r)) f.correctas += 1
  }
  return [...porJugadora.values()]
    .map((f) => ({ ...f, minutos: minutos?.[f.jugadoraId] ?? null, puntaje: f.goles.length * 5 + f.remates.length * 2 + f.recuperaciones.length * 2 + f.correctas * 0.5 + f.clips.length * 0.1 }))
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, cantidad)
}

// Clip de un evento del partido (gol, cambio, tarjeta): unos segundos antes y después.
export function clipDeEventoPartido(evento, partidoId, etiqueta) {
  const s = Math.max(0, Math.floor(Number(evento.segundo) || 0))
  return { clave: `pe:${evento.id}`, eventoId: null, partidoId, tipo: etiqueta, colectiva: false, espejo: false,
    inicio: Math.max(0, s - 10), fin: s + 5, segundo: s, periodo: 1, etiqueta, nota: '' }
}
