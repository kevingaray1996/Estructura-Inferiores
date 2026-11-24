// Editor de dibujos: qué objeto se tocó con un clic, atajos de teclado y textos de tiempo. Lógica pura.
import { ASPECTO_VIDEO } from './coordenadas.js'

// Distancia de un punto a un segmento, en unidades del ancho del cuadro (corrige que el cuadro es 16:9).
function distSegmento(p, a, b, aspecto) {
  const ax = a.x, ay = a.y / aspecto, bx = b.x, by = b.y / aspecto, px = p.x, py = p.y / aspecto
  const dx = bx - ax, dy = by - ay
  const largo = dx * dx + dy * dy
  const u = largo ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo)) : 0
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy))
}

function dentroPoligono(p, puntos) {
  let dentro = false
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const a = puntos[i], b = puntos[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

const TOLERANCIA = 0.02

// Elemento de la escena (escenaEn) que está bajo el punto p (relativo), el de más arriba primero. null si ninguno.
export function objetoEnPunto(elementos, p, aspecto = ASPECTO_VIDEO) {
  for (const el of [...(elementos || [])].reverse()) {
    const o = el.obj
    let d = Infinity
    if (el.posicion) d = Math.hypot(p.x - el.posicion.x, (p.y - el.posicion.y) / aspecto) - (o.tipo === 'foco' ? 0.06 : 0.035)
    else if (o.tipo === 'enlace' && el.a && el.b) d = distSegmento(p, el.a, el.b, aspecto)
    else if (o.tipo === 'zona') {
      const [a, b] = o.puntos
      const dentro = p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
      d = dentro ? 0 : Infinity
    } else if (o.tipo === 'poligono') d = dentroPoligono(p, o.puntos) ? 0 : Infinity
    else if (o.tipo === 'texto') d = Math.hypot(p.x - o.puntos[0].x, (p.y - o.puntos[0].y) / aspecto) - 0.04
    else if (o.puntos?.length >= 2) {
      for (let i = 1; i < o.puntos.length; i++) d = Math.min(d, distSegmento(p, o.puntos[i - 1], o.puntos[i], aspecto))
    }
    if (d <= TOLERANCIA) return el
  }
  return null
}

// Herramientas y su tecla.
export const HERRAMIENTAS = Object.freeze([
  { id: 'seleccionar', tecla: 'V', texto: 'Elegir y mover', icono: '➚' },
  { id: 'pase_bajo', tecla: 'B', texto: 'Pase por bajo', icono: '→' },
  { id: 'pase_alto', tecla: 'A', texto: 'Pase por alto', icono: '⤻' },
  { id: 'movimiento', tecla: 'M', texto: 'Movimiento (punteada)', icono: '⇢' },
  { id: 'linea', tecla: 'L', texto: 'Línea', icono: '／' },
  { id: 'zona', tecla: 'R', texto: 'Zona rectangular', icono: '▭' },
  { id: 'poligono', tecla: 'G', texto: 'Zona libre (polígono)', icono: '⬠' },
  { id: 'texto', tecla: 'T', texto: 'Texto', icono: 'T' },
  { id: 'anillo', tecla: 'O', texto: 'Anillo bajo los pies', icono: '◯' },
  { id: 'foco', tecla: 'F', texto: 'Foco', icono: '◉' },
  { id: 'nombre', tecla: 'N', texto: 'Nombre y dorsal', icono: '#' },
  { id: 'enlace', tecla: 'E', texto: 'Línea entre dos jugadoras', icono: '⟷' },
  { id: 'zoom', tecla: 'C', texto: 'Zoom de cámara', icono: '⌕' },
])

// Orden de una tecla en el editor, o null. No actúa mientras se escribe en un campo (salvo Escape).
export function ordenTeclaEditor(e) {
  const destino = e.target
  const escribiendo = destino && (['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName) || destino.isContentEditable)
  if (escribiendo && e.key !== 'Escape') return null
  const k = e.key
  if (e.ctrlKey || e.metaKey) {
    const l = k.toLowerCase()
    if (l === 'z') return e.shiftKey ? 'rehacer' : 'deshacer'
    if (l === 'y') return 'rehacer'
    if (l === 'd') return 'duplicar'
    return null
  }
  if (e.altKey) return null
  if (k === 'ArrowRight') return e.shiftKey ? 'avanzar:1' : 'avanzar:0.1'
  if (k === 'ArrowLeft') return e.shiftKey ? 'retroceder:1' : 'retroceder:0.1'
  if (k === ' ') return 'reproducir'
  if (k === 'Home') return 'inicio'
  if (k === 'End') return 'fin'
  if (k === 'Delete' || k === 'Backspace') return 'borrar'
  if (k === 'Escape') return 'escape'
  if (k === 'Enter') return 'cerrarPoligono'
  const letra = k.length === 1 ? k.toUpperCase() : ''
  if (letra === 'P') return 'pausa'
  if (letra === 'S') return 'paso'
  const h = HERRAMIENTAS.find((x) => x.tecla === letra)
  return h ? `herramienta:${h.id}` : null
}

// «23:38,2» (minutos:segundos con décimas): el editor trabaja cuadro a cuadro.
export function tiempoPreciso(t) {
  const total = Math.max(0, Number(t) || 0)
  const decimas = Math.round(total * 10)
  const min = Math.floor(decimas / 600)
  const seg = Math.floor((decimas % 600) / 10)
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')},${decimas % 10}`
}

// Paso cuadro a cuadro sin salir del clip.
export function moverTiempo(t, delta, clip) {
  return Math.round(Math.min(clip.fin, Math.max(clip.inicio, Number(t) + Number(delta))) * 1000) / 1000
}

// ¿Se puede editar en este dispositivo? Solo en la compu: mouse y pantalla de al menos 1024 px.
export function esCompu(ventana = typeof window === 'undefined' ? null : window) {
  try {
    return Boolean(ventana) && ventana.matchMedia('(hover: hover) and (pointer: fine)').matches && ventana.innerWidth >= 1024
  } catch {
    return false
  }
}
