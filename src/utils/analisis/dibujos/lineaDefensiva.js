// Línea defensiva (o de volantes) con cobertura (versión 3, docs/analisis-dibujos-pro.md §Línea defensiva).
// Con el clip calibrado, el estado de cada jugadora sale de los metros; sin calibrar, se marca a mano. Lógica pura.
import { ASPECTO_VIDEO } from './coordenadas.js'

export const COBERTURA = Object.freeze({ distancia: 8, fondo: 6 })
export const NOMBRE_ESTADO = Object.freeze({ en_linea: 'En línea', adelantada: 'Adelantada', atras: 'Rompe la línea' })

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const distVideo = (a, b, aspecto = ASPECTO_VIDEO) => Math.hypot(a.x - b.x, (a.y - b.y) / aspecto)

// Arco que defienden, para elegirlo solo al crear la línea: el más cercano al promedio de las jugadoras.
// metros: [{x, y}] (o null sin calibrar); video: [{x, y}]; largo: de la cancha.
export function arcoProbable({ metros = null, video = [], largo = 100 }) {
  if (metros?.length && metros.every(Boolean)) return metros.reduce((s, p) => s + p.x, 0) / metros.length <= largo / 2 ? 'izquierda' : 'derecha'
  const prom = video.length ? video.reduce((s, p) => s + p.x, 0) / video.length : 0.5
  return prom <= 0.5 ? 'izquierda' : 'derecha'
}

// Estado en metros: jugadoras [{ id, metros: {x, y} }], arco, umbral → { referencia, adelante, filas: [{ id, d, estado }] }.
// Referencia: la mediana de las x (con dos jugadoras, la más retrasada). d > 0 es hacia el arco rival.
export function estadosEnMetros(jugadoras, { arco = 'izquierda', umbral = 2 } = {}) {
  const adelante = arco === 'derecha' ? -1 : 1
  const xs = jugadoras.map((j) => j.metros.x)
  const referencia = jugadoras.length >= 3 ? mediana(xs) : (adelante > 0 ? Math.min(...xs) : Math.max(...xs))
  const filas = jugadoras.map((j) => {
    const d = (j.metros.x - referencia) * adelante
    return { id: j.id, d, estado: d > umbral ? 'adelantada' : d < -umbral ? 'atras' : 'en_linea' }
  })
  return { referencia, adelante, filas }
}

// Cobertura de una adelantada (metros): el espacio que dejó es el punto de la línea a su altura; la compañera de al lado
// es la más cercana a ese punto. Cubierta si está a COBERTURA.distancia m o menos y no está adelantada.
export function coberturaEnMetros(adelantada, otras, { referencia, adelante }) {
  const hueco = { x: referencia, y: adelantada.metros.y }
  const vecina = otras.reduce((m, o) => (!m || dist(o.metros, hueco) < dist(m.metros, hueco) ? o : m), null)
  if (!vecina) return null
  const atras = { x: referencia - COBERTURA.fondo * adelante, y: adelantada.metros.y }
  return {
    vecina: vecina.id, hueco, atras,
    cubierto: dist(vecina.metros, hueco) <= COBERTURA.distancia && vecina.estado !== 'adelantada',
    distancia: dist(vecina.metros, hueco),
  }
}

// Punto de la línea de las demás a la altura (x del video) de una jugadora (sin calibración).
function huecoEnVideo(adelantada, otras) {
  const pts = otras.map((o) => o.video).sort((a, b) => a.x - b.x)
  if (!pts.length) return null
  const x = adelantada.video.x
  if (x <= pts[0].x) return { x, y: pts[0].y }
  if (x >= pts[pts.length - 1].x) return { x, y: pts[pts.length - 1].y }
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const u = (x - pts[i - 1].x) / Math.max(1e-6, pts[i].x - pts[i - 1].x)
      return { x, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u }
    }
  }
  return null
}

// Todo lo que se dibuja en un instante.
// jugadoras: [{ id, video: {x, y}, metros: {x, y} | null }] (las que están en el video en ese momento).
// obj: la línea (arco, umbral, estados y cubiertas a mano). aVideo(metros) → punto del video o null.
// Devuelve { calibrada, puntos: [{ id, video, estado, d? }] en el orden de la línea, triangulos: [{ id, vecina, vertices, cubierto }] }.
export function lineaDefensivaEn(jugadoras, obj, aVideo = null) {
  const presentes = (jugadoras || []).filter((j) => j?.video)
  const calibrada = presentes.length >= 2 && presentes.every((j) => j.metros) && typeof aVideo === 'function'
  if (presentes.length < 2) return { calibrada: false, puntos: presentes.map((j) => ({ id: j.id, video: j.video, estado: 'en_linea' })), triangulos: [] }

  if (calibrada) {
    const r = estadosEnMetros(presentes, { arco: obj?.arco, umbral: obj?.umbral ?? 2 })
    const porId = new Map(r.filas.map((f) => [f.id, f]))
    const filas = presentes.map((j) => ({ ...j, ...porId.get(j.id) }))
    // La línea va a lo ancho de la cancha: se ordena por y (metros), así queda bien aunque la cámara esté en diagonal.
    const orden = [...filas].sort((a, b) => a.metros.y - b.metros.y)
    const triangulos = []
    for (const a of filas.filter((f) => f.estado === 'adelantada')) {
      const c = coberturaEnMetros(a, filas.filter((f) => f.id !== a.id), r)
      if (!c) continue
      const vecina = filas.find((f) => f.id === c.vecina)
      const vertices = [vecina.metros, c.hueco, c.atras].map(aVideo)
      if (vertices.some((v) => !v)) continue
      triangulos.push({ id: a.id, vecina: c.vecina, vertices, cubierto: c.cubierto, metros: c.distancia })
    }
    return { calibrada: true, puntos: orden.map((f) => ({ id: f.id, video: f.video, estado: f.estado, d: f.d })), triangulos }
  }

  // Sin calibrar: de izquierda a derecha en el video; estados y cobertura marcados a mano.
  const estados = obj?.estados || {}
  const filas = presentes.map((j) => ({ ...j, estado: estados[j.id] || 'en_linea' })).sort((a, b) => a.video.x - b.video.x)
  const triangulos = []
  for (const a of filas.filter((f) => f.estado === 'adelantada')) {
    const otras = filas.filter((f) => f.id !== a.id)
    const hueco = huecoEnVideo(a, otras)
    if (!hueco) continue
    const vecina = otras.reduce((m, o) => (!m || distVideo(o.video, hueco) < distVideo(m.video, hueco) ? o : m), null)
    triangulos.push({ id: a.id, vecina: vecina.id, vertices: [vecina.video, hueco, a.video], cubierto: Boolean(obj?.cubiertas?.[a.id]) })
  }
  return { calibrada: false, puntos: filas.map((f) => ({ id: f.id, video: f.video, estado: f.estado })), triangulos }
}
