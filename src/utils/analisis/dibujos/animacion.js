// Animaciones de los dibujos de la versión 3 (docs/analisis-dibujos-pro.md): tiempo de animación con las pausas
// adentro, flechas que crecen y el hueco del anillo detrás de las piernas. Lógica pura.
import { HUECO } from './formato.js'

export const DURACION_CRECER = Object.freeze({ rapida: 0.4, normal: 0.8, lenta: 1.5 })
export const ENCENDIDO_REFLECTOR = 0.5
export const DESPLIEGUE_ZONA = 0.5
// Opciones de pase: el pase crece en 0,5 s; la primera opción aparece a los 0,9 s y cada una 0,7 s después.
export const SECUENCIA_PASE = Object.freeze({ pase: 0.5, primera: 0.9, entre: 0.7, crecer: 0.4 })

const recortar = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u)
export const salidaSuave = (u) => 1 - (1 - recortar(u)) ** 3

// ---------- Tiempo de animación ----------
// Tiempo del clip más los segundos de las pausas que ya pasaron y lo que lleva la pausa en curso
// (pausa: { t, transcurrido } o null). Así las animaciones siguen mientras el video está congelado.
export function tiempoAnimacion(pausas, t, pausa = null) {
  let v = t
  for (const p of pausas || []) if (p.t < t - 0.0005) v += p.duracion
  if (pausa && Math.abs(pausa.t - t) < 0.002) {
    const dur = (pausas || []).find((p) => Math.abs(p.t - pausa.t) < 0.002)?.duracion ?? Infinity
    v += Math.max(0, Math.min(dur, Number(pausa.transcurrido) || 0))
  }
  return v
}

// Cuándo empieza la animación de algo que aparece en `desde`: las pausas de antes ya pasaron; una pausa justo en
// `desde` todavía no (el dibujo se anima durante esa pausa).
export function inicioAnimacion(pausas, desde) {
  let v = desde
  for (const p of pausas || []) if (p.t < desde - 0.0005) v += p.duracion
  return v
}

// Segundos de animación de un dibujo que aparece en `desde`, vistos en el instante t.
export const edadEn = (pausas, desde, t, pausa = null) => tiempoAnimacion(pausas, t, pausa) - inicioAnimacion(pausas, desde)

// ---------- Flechas que crecen ----------
// Avance de 0 a 1. Sin `crecer`, la flecha está entera. «Como el pase real» sigue el tiempo del clip (de la salida a la
// llegada): si hay una pausa en el medio, el pase espera con el video.
export function progresoFlecha(obj, t, edad) {
  const c = obj?.crecer
  if (!c) return 1
  if (c.modo === 'real') return salidaSuave((t - c.salida) / Math.max(0.05, c.llegada - c.salida))
  return salidaSuave(edad / (DURACION_CRECER[c.modo] || DURACION_CRECER.normal))
}

const mezcla = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })

export function cortarRecta(a, b, u) {
  return [a, mezcla(a, b, recortar(u))]
}

// Primera parte de la curva cuadrática a–c–b hasta u (De Casteljau): { a, c, b } de la parte que se ve.
export function cortarCuadratica(a, c, b, u) {
  const k = recortar(u)
  const ac = mezcla(a, c, k), cb = mezcla(c, b, k)
  return { a, c: ac, b: mezcla(ac, cb, k) }
}

// Primera parte de un trazo (lista de puntos) hasta la fracción u de su largo.
export function cortarPolilinea(puntos, u) {
  if (!puntos?.length) return []
  const k = recortar(u)
  if (k >= 1) return puntos
  const largos = []
  let total = 0
  for (let i = 1; i < puntos.length; i++) { const l = Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y); largos.push(l); total += l }
  if (!total) return [puntos[0]]
  let falta = total * k
  const salida = [puntos[0]]
  for (let i = 1; i < puntos.length; i++) {
    const l = largos[i - 1]
    if (falta <= l) { salida.push(mezcla(puntos[i - 1], puntos[i], l ? falta / l : 0)); return salida }
    salida.push(puntos[i])
    falta -= l
  }
  return salida
}

// ---------- Anillo detrás de las piernas ----------
// Ancho del hueco (fracción del ancho del anillo): automático, elegido o 0 (sin hueco).
export function anchoHueco(hueco) {
  if (hueco === false) return 0
  if (typeof hueco === 'number' && Number.isFinite(hueco)) return Math.min(HUECO.maximo, Math.max(HUECO.minimo, hueco))
  return HUECO.auto
}

const n = (v) => Math.round(v * 100) / 100

// Trazo y relleno del anillo (en píxeles), con el hueco en el arco de atrás (la mitad de arriba de la elipse, la más
// lejos de la cámara) centrado donde están las piernas. Devuelve { trazo, relleno, hueco: null | { desde, hasta } }.
export function geometriaAnillo(cx, cy, rx, ry, hueco) {
  const g = anchoHueco(hueco)
  if (!(g > 0) || !(rx > 0) || !(ry > 0)) {
    const d = `M${n(cx - rx)},${n(cy)} a${n(rx)},${n(ry)} 0 1,0 ${n(rx * 2)},0 a${n(rx)},${n(ry)} 0 1,0 ${n(-rx * 2)},0 Z`
    return { trazo: d, relleno: d, hueco: null }
  }
  // Ángulos que se cortan: los de la mitad de arriba con |cos θ| < g (en pantalla, y crece hacia abajo).
  const a = Math.acos(g)
  const desde = Math.PI + a, hasta = 2 * Math.PI - a
  const pt = (th) => ({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th) })
  const p1 = pt(hasta), p2 = pt(desde)
  // De un borde del hueco al otro pasando por adelante (arco grande, sentido de las agujas del reloj en pantalla).
  const trazo = `M${n(p1.x)},${n(p1.y)} A${n(rx)},${n(ry)} 0 1,1 ${n(p2.x)},${n(p2.y)}`
  const relleno = `${trazo} L${n(cx - g * rx)},${n(cy)} L${n(cx + g * rx)},${n(cy)} Z`
  return { trazo, relleno, hueco: { desde: p2, hasta: p1 } }
}
