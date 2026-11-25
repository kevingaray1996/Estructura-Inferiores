// Qué se ve en un instante del clip: objetos visibles con su posición (los que siguen a una jugadora), efectos,
// subtítulo y zoom de cámara. Lógica pura; la capa de dibujo solo pinta lo que devuelve.
import { aCancha, distanciaMetros } from './calibracion.js'
import { esSeguimiento } from './formato.js'
import { posicionEn, recorrido } from './interpolacion.js'

export const DURACION_ENTRADA = 0.45
export const DURACION_RASTRO = 1.5
export const RAMPA_ZOOM = 0.6

export const visibleEn = (obj, t) => t >= obj.desde && t <= obj.hasta

// Rebote de entrada: arranca chico, se pasa un poco y vuelve a su tamaño.
export function rebote(u) {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
}

const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))

function escalaDe(obj, t) {
  let escala = 1
  if (obj.efectos?.entrada) escala *= rebote((t - obj.desde) / DURACION_ENTRADA)
  if (obj.efectos?.pulso) escala *= 1 + 0.08 * Math.sin(2 * Math.PI * 1.2 * (t - obj.desde))
  return escala
}

// Zoom de cámara en t: { escala, origen: {x, y} } o null. Entra y sale suave (RAMPA_ZOOM segundos).
export function zoomEn(dibujo, t) {
  const z = (dibujo?.objetos || []).find((o) => o.tipo === 'zoom' && visibleEn(o, t))
  if (!z) return null
  const rampa = Math.min(RAMPA_ZOOM, (z.hasta - z.desde) / 2)
  const f = suave(Math.min((t - z.desde) / rampa, (z.hasta - t) / rampa, 1))
  const seguido = z.seguir ? dibujo.objetos.find((o) => o.id === z.seguir) : null
  const origen = (seguido && posicionEn(seguido.pista.claves, t)) || z.objetivo
  const escala = 1 + (z.escala - 1) * f
  return escala > 1.001 ? { escala, origen } : null
}

export function subtituloEn(dibujo, t) {
  return (dibujo?.subtitulos || []).find((s) => t >= s.desde && t < s.hasta)?.texto || ''
}

// Elementos para pintar en t. Cada uno: { obj, posicion?, escala, rastro?, a?, b? }.
// elegidoId: en el editor se ve también el objeto elegido fuera de su tiempo (tenue). animar: false en el editor
// (sin rebote ni pulso, para ver cada objeto a su tamaño al dibujar).
export function escenaEn(dibujo, t, { elegidoId = null, animar = true } = {}) {
  const objetos = dibujo?.objetos || []
  const porId = new Map(objetos.map((o) => [o.id, o]))
  const elementos = []
  for (const obj of objetos) {
    if (obj.tipo === 'zoom' || obj.tipo === 'ficha') continue // la ficha solo se ve en la pizarra 2D
    const visible = visibleEn(obj, t)
    if (!visible && obj.id !== elegidoId) continue
    const base = { obj, fuera: !visible, escala: visible && animar ? escalaDe(obj, t) : 1 }
    if (esSeguimiento(obj.tipo)) {
      base.posicion = posicionEn(obj.pista.claves, t)
      if (obj.efectos?.rastro && visible) {
        base.rastro = recorrido(obj.pista.claves, Math.max(obj.desde, t - DURACION_RASTRO), t, 1 / 20)
      }
    } else if (obj.tipo === 'enlace') {
      const a = porId.get(obj.a), b = porId.get(obj.b)
      if (!a || !b) continue
      base.a = posicionEn(a.pista.claves, t)
      base.b = posicionEn(b.pista.claves, t)
      if (!base.a || !base.b) continue
      // Con la cancha calibrada, la línea muestra la distancia en metros.
      const metros = distanciaMetros(aCancha(dibujo, t, base.a), aCancha(dibujo, t, base.b))
      if (metros !== null) base.metros = metros
    }
    elementos.push(base)
  }
  // El foco va primero (oscurece todo lo de abajo); después lo demás en su orden.
  elementos.sort((x, y) => (x.obj.tipo === 'foco' ? 0 : 1) - (y.obj.tipo === 'foco' ? 0 : 1))
  return { elementos, subtitulo: subtituloEn(dibujo, t), zoom: zoomEn(dibujo, t) }
}

// Transformación CSS del contenedor del video para el zoom: se agranda alrededor del punto, sin mostrar bordes negros.
export function transformZoom(zoom) {
  if (!zoom) return { transform: 'none', transformOrigin: '50% 50%' }
  return {
    transform: `scale(${zoom.escala.toFixed(4)})`,
    transformOrigin: `${(zoom.origen.x * 100).toFixed(2)}% ${(zoom.origen.y * 100).toFixed(2)}%`,
  }
}

// ¿El clip tiene algo para mostrar? (ícono ✎ y fila «Dibujos»)
export const tieneDibujos = (dibujo) => Boolean(dibujo && (dibujo.objetos?.length || dibujo.pausas?.length || dibujo.subtitulos?.length))
