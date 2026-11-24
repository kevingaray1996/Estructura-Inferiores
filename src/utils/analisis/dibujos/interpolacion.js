// Seguimiento de una jugadora: de los puntos clave (clics en algunos cuadros, o en el futuro otra fuente) a una
// posición en cualquier instante. Curva Catmull-Rom: pasa por cada punto clave y suaviza el recorrido. Lógica pura.
import { recortar01 } from './coordenadas.js'

// Índice del último punto clave con t <= tiempo (búsqueda binaria). -1 si el tiempo es anterior al primero.
function tramo(claves, t) {
  let bajo = 0, alto = claves.length - 1, r = -1
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1
    if (claves[medio].t <= t) { r = medio; bajo = medio + 1 } else alto = medio - 1
  }
  return r
}

const catmull = (p0, p1, p2, p3, u) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
  + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)

// Posición { x, y } en el tiempo t, o null si no hay puntos clave. Antes del primero y después del último queda
// quieta en ese punto.
export function posicionEn(claves, t) {
  if (!claves?.length) return null
  const primero = claves[0], ultimo = claves[claves.length - 1]
  if (t <= primero.t) return { x: primero.x, y: primero.y }
  if (t >= ultimo.t) return { x: ultimo.x, y: ultimo.y }
  const i = tramo(claves, t)
  const p1 = claves[i], p2 = claves[i + 1]
  const p0 = claves[i - 1] || p1, p3 = claves[i + 2] || p2
  const largo = p2.t - p1.t
  const u = largo > 0 ? (t - p1.t) / largo : 0
  return { x: recortar01(catmull(p0.x, p1.x, p2.x, p3.x, u)), y: recortar01(catmull(p0.y, p1.y, p2.y, p3.y, u)) }
}

// Recorrido entre dos tiempos (para el rastro): puntos cada «paso» segundos, incluido el final.
export function recorrido(claves, desde, hasta, paso = 1 / 30) {
  if (!claves?.length || hasta < desde) return []
  const salida = []
  for (let t = desde; t < hasta; t += paso) salida.push(posicionEn(claves, t))
  salida.push(posicionEn(claves, hasta))
  return salida
}

// Agrega un punto clave en t (si ya hay uno a menos de «tolerancia» segundos, lo reemplaza). Devuelve la lista nueva.
export function agregarClave(claves, clave, tolerancia = 0.05) {
  const nueva = { t: Math.max(0, Math.round(Number(clave.t) * 1000) / 1000), x: recortar01(clave.x), y: recortar01(clave.y) }
  const sin = (claves || []).filter((c) => Math.abs(c.t - nueva.t) >= tolerancia)
  return [...sin, nueva].sort((a, b) => a.t - b.t)
}

// Saca el punto clave más cercano a t (dentro de la tolerancia). Nunca deja la pista vacía.
export function quitarClave(claves, t, tolerancia = 0.05) {
  if (!claves || claves.length <= 1) return claves || []
  let mejor = -1, distancia = Infinity
  claves.forEach((c, i) => { const d = Math.abs(c.t - t); if (d < distancia) { distancia = d; mejor = i } })
  if (mejor < 0 || distancia >= tolerancia) return claves
  return claves.filter((_, i) => i !== mejor)
}

// ¿Hay un punto clave en este instante? (para marcar el rombo como «actual»)
export function claveEn(claves, t, tolerancia = 0.05) {
  return (claves || []).find((c) => Math.abs(c.t - t) < tolerancia) || null
}
