// Zonas dinámicas (versión 3, docs/analisis-dibujos-pro.md): formas que cambian con puntos clave, zona entre dos
// líneas de jugadoras, foco en una zona y medidas en metros. Lógica pura.
import { aCancha, aplicar, calibracionEn } from './calibracion.js'
import { ASPECTO_VIDEO, recortar01 } from './coordenadas.js'

const mezcla = (a, b, u) => a + (b - a) * u
const redondear = (v) => Math.round(v * 10000) / 10000
const tiempo = (t) => Math.round(Number(t) * 1000) / 1000

// Índice de la última clave con t <= tiempo, o -1.
function tramo(claves, t) {
  let r = -1
  for (let i = 0; i < claves.length; i++) if (claves[i].t <= t) r = i
  return r
}

// Forma de una zona (rectangular o libre) en t: con claves se interpola punto por punto; sin claves, la base.
export function formaEn(obj, t) {
  const claves = obj?.claves
  if (!claves?.length) return obj?.puntos || []
  if (t <= claves[0].t) return claves[0].puntos
  const i = tramo(claves, t)
  if (i >= claves.length - 1) return claves[claves.length - 1].puntos
  const a = claves[i], b = claves[i + 1]
  const u = (t - a.t) / Math.max(0.001, b.t - a.t)
  return a.puntos.map((p, k) => ({ x: mezcla(p.x, b.puntos[k].x, u), y: mezcla(p.y, b.puntos[k].y, u) }))
}

// Deja la forma `puntos` en el instante t. Si la zona no se mueve (sin claves), cambia la forma de siempre.
export function fijarFormaEn(obj, t, puntos) {
  const limpios = puntos.map((p) => ({ x: redondear(recortar01(p.x)), y: redondear(recortar01(p.y)) }))
  if (!obj.claves?.length) return { ...obj, puntos: limpios }
  const tt = tiempo(t)
  const claves = [...obj.claves.filter((c) => Math.abs(c.t - tt) >= 0.05), { t: tt, puntos: limpios }].sort((a, b) => a.t - b.t)
  return { ...obj, claves, puntos: claves[0].puntos }
}

// Prende o apaga «Se mueve con puntos clave». Al prender, la forma actual queda como primera clave.
export function animarZona(obj, activo, t) {
  if (activo) return obj.claves?.length ? obj : { ...obj, claves: [{ t: tiempo(Math.max(obj.desde, Math.min(obj.hasta, t))), puntos: obj.puntos }] }
  const { claves, ...resto } = obj
  return claves?.length ? { ...resto, puntos: formaEn(obj, t) } : obj
}

// Foco en una zona: { x, y, rx, ry } en t (centro y medio ancho / medio alto, de 0 a 1).
export function focoZonaEn(obj, t) {
  const claves = obj?.claves || []
  if (!claves.length) return null
  if (t <= claves[0].t || claves.length === 1) return claves[0]
  const i = tramo(claves, t)
  if (i >= claves.length - 1) return claves[claves.length - 1]
  const a = claves[i], b = claves[i + 1]
  const u = (t - a.t) / Math.max(0.001, b.t - a.t)
  return { t, x: mezcla(a.x, b.x, u), y: mezcla(a.y, b.y, u), rx: mezcla(a.rx, b.rx, u), ry: mezcla(a.ry, b.ry, u) }
}

// Mueve o agranda el foco en t. Si no se mueve con puntos clave, cambia todas sus claves igual.
export function fijarFocoZonaEn(obj, t, cambio) {
  const actual = focoZonaEn(obj, t)
  if (!actual) return obj
  const nuevo = {
    x: redondear(recortar01(cambio.x ?? actual.x)), y: redondear(recortar01(cambio.y ?? actual.y)),
    rx: redondear(Math.min(0.5, Math.max(0.01, cambio.rx ?? actual.rx))), ry: redondear(Math.min(0.5, Math.max(0.01, cambio.ry ?? actual.ry))),
  }
  if (!obj.animado) {
    const dx = nuevo.x - actual.x, dy = nuevo.y - actual.y, kx = nuevo.rx / actual.rx, ky = nuevo.ry / actual.ry
    return { ...obj, claves: obj.claves.map((c) => ({ ...c, x: redondear(recortar01(c.x + dx)), y: redondear(recortar01(c.y + dy)), rx: redondear(Math.min(0.5, c.rx * kx)), ry: redondear(Math.min(0.5, c.ry * ky)) })) }
  }
  const tt = tiempo(t)
  return { ...obj, claves: [...obj.claves.filter((c) => Math.abs(c.t - tt) >= 0.05), { t: tt, ...nuevo }].sort((a, b) => a.t - b.t) }
}

// Radio vertical de un círculo (en el video 16:9, un círculo tiene el mismo radio en píxeles a lo ancho y a lo alto).
export const ryCirculo = (rx, aspecto = ASPECTO_VIDEO) => Math.min(0.5, rx * aspecto)

// Zona entre dos líneas de jugadoras: la línea A de izquierda a derecha y la B de derecha a izquierda.
export function poligonoEntreLineas(posA, posB) {
  const a = posA.filter(Boolean).sort((p, q) => p.x - q.x)
  const b = posB.filter(Boolean).sort((p, q) => q.x - p.x)
  return a.length && b.length ? [...a, ...b] : []
}

export function centroide(puntos) {
  if (!puntos?.length) return null
  return { x: puntos.reduce((s, p) => s + p.x, 0) / puntos.length, y: puntos.reduce((s, p) => s + p.y, 0) / puntos.length }
}

// Metros de una zona (clip calibrado): profundidad = lo que ocupa a lo largo de la cancha; ancho = a lo ancho.
export function medidasZona(dibujo, t, puntos) {
  const m = (puntos || []).map((p) => aCancha(dibujo, t, p))
  if (m.length < 2 || m.some((p) => !p)) return null
  const xs = m.map((p) => p.x), ys = m.map((p) => p.y)
  return { profundidad: Math.max(...xs) - Math.min(...xs), ancho: Math.max(...ys) - Math.min(...ys) }
}

// Metros de la zona entre líneas: profundidad = distancia entre los promedios de las dos líneas a lo largo de la cancha.
export function medidasEntreLineas(dibujo, t, posA, posB) {
  const a = posA.map((p) => p && aCancha(dibujo, t, p)), b = posB.map((p) => p && aCancha(dibujo, t, p))
  if (!a.length || !b.length || [...a, ...b].some((p) => !p)) return null
  const prom = (l) => l.reduce((s, p) => s + p.x, 0) / l.length
  const ys = [...a, ...b].map((p) => p.y)
  return { profundidad: Math.abs(prom(a) - prom(b)), ancho: Math.max(...ys) - Math.min(...ys) }
}

// Metros de la cancha en t → punto del video (0 a 1), o null sin calibración.
export function aVideo(dibujo, t, m) {
  const c = calibracionEn(dibujo, t)
  const q = c && m && aplicar(c.inversa, m)
  return q && q.w > 0 ? { x: q.x, y: q.y } : null
}
