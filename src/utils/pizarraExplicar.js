// Etapa I: lo que explica la jugada además de las posiciones. Todo sale del documento v2 y de las poses del instante:
// - subtítulo: el texto del paso (en una transición, el del paso al que se va);
// - visibilidad: cada elemento oculto en un paso aparece o desaparece con un fundido durante la transición;
// - foco: la jugadora elegida se resalta, el resto se oscurece y la cámara se acerca de a poco.
// La cámara está en metros de cancha, igual que el modelo de escena: el video (etapa K) y una vista 3D la reutilizan.
import { limitar, SUPERFICIES } from './pizarra.js'
import { enMovimiento } from './pizarraAnimacion.js'

export const ACERCAMIENTO_FOCO = 1.6 // escala de la cámara con el foco completo
export const OSCURECER_FOCO = .6 // cuánto se apaga lo que no está en foco

const suave = t => t * t * (3 - 2 * t)

// Tramo que se ve: paso de salida `k`, paso de llegada `k + 1` y avance `s` (0 = en k, 1 = en k + 1).
// Sin tiempo (editando un paso), queda quieto en ese paso.
export function tramoVisible(doc, tiempo, indice) {
  if (tiempo === null || doc.pasos.length < 2) return { k: indice, s: 0 }
  const info = enMovimiento(doc, tiempo)
  return info.pausa ? { k: info.paso, s: 0 } : { k: info.paso, s: suave(info.u) }
}

export function subtitulo(doc, tiempo, indice) {
  const { k, s } = tramoVisible(doc, tiempo, indice)
  return (s > 0 ? doc.pasos[k + 1]?.texto : doc.pasos[k]?.texto) || ''
}

// Opacidad de cada elemento (0 a 1). Solo aparecen los que cambian.
export function opacidades(doc, tiempo, indice) {
  const { k, s } = tramoVisible(doc, tiempo, indice), a = doc.pasos[k].ocultos || [], b = (s > 0 ? doc.pasos[k + 1].ocultos : a) || []
  if (!a.length && !b.length) return {}
  const salida = {}
  for (const id of new Set([...a, ...b])) salida[id] = (a.includes(id) ? 0 : 1) * (1 - s) + (b.includes(id) ? 0 : 1) * s
  return salida
}

// Foco y cámara del instante. `poses` son las del instante (para seguir a la jugadora mientras se mueve).
// Devuelve { foco: { id, peso } | null, camara: { x, y, escala } } con x, y en metros (centro de la vista).
export function focoYCamara(doc, tiempo, indice, poses) {
  const [w, h] = SUPERFICIES[doc.superficie], { k, s } = tramoVisible(doc, tiempo, indice)
  const fa = doc.pasos[k].foco || null, fb = s > 0 ? doc.pasos[k + 1].foco || null : fa
  const peso = (fa ? 1 : 0) * (1 - s) + (fb ? 1 : 0) * s
  const centro = { x: w / 2, y: h / 2, escala: 1 }
  if (!peso || (!fa && !fb)) return { foco: null, camara: centro }
  const lugar = id => poses[id] ? { x: poses[id].x * w / 100, y: poses[id].y * h / 100 } : null
  const pa = fa && lugar(fa), pb = fb && lugar(fb)
  const objetivo = pa && pb ? { x: pa.x + (pb.x - pa.x) * s, y: pa.y + (pb.y - pa.y) * s } : pa || pb
  if (!objetivo) return { foco: null, camara: centro }
  const escala = 1 + (ACERCAMIENTO_FOCO - 1) * peso
  // La vista acercada nunca muestra afuera de la cancha.
  const mx = w / (2 * escala), my = h / (2 * escala)
  const camara = { x: limitar(centro.x + (objetivo.x - centro.x) * peso, mx, w - mx), y: limitar(centro.y + (objetivo.y - centro.y) * peso, my, h - my), escala }
  return { foco: { id: s < .5 ? fa || fb : fb || fa, peso }, camara }
}
