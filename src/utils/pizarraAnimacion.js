// Motor de animación de la pizarra (etapa A). Sólo lee el documento v1: no agrega campos.
//
// Recorridos:
// - 'suave' (por defecto): jugadoras y pelota suelta recorren una curva que pasa por todos los pasos sin frenar
//   en cada uno. Cada tramo es una cúbica de Hermite con tangentes acotadas: nunca más largas que el tramo y nunca
//   hacia atrás; si la jugadora se queda quieta o gira más de 90° la tangente es cero. Con eso la proyección sobre el
//   tramo es monótona: no hay rulos, no se pasa del destino y no retrocede.
// - 'recto': línea recta con aceleración y frenado en cada paso (el comportamiento anterior).
// Pelota: si en un paso está pegada a una jugadora (la más cercana dentro del alcance), se infiere la posesión.
//   Misma jugadora en dos pasos seguidos = conducción (la acompaña); jugadoras distintas = pase (viaja de una a otra).
import { limitar, SUPERFICIES } from './pizarra.js'

const CURVAS = ['jugadora', 'pelota']
const EPS = 1e-6
const suave = t => t * t * (3 - 2 * t)
const desacelerar = t => 1 - (1 - t) * (1 - t)
const anguloCorto = (a, b, t) => a + ((((b - a + 540) % 360) - 180) * t)

// Alcance para considerar que la pelota está "pegada" a una jugadora, en metros de cancha.
export function alcancePosesion(jugadora, pelota) { return jugadora.tamano + pelota.tamano * .7 + 1 }

export function tiemposDePasos(doc) {
  const tiempos = [0]
  for (let i = 1; i < doc.pasos.length; i++) tiempos.push(tiempos[i - 1] + doc.pasos[i].duracion)
  return tiempos
}

// Para cada pelota y cada paso: id de la jugadora que la tiene (o null).
export function posesiones(doc) {
  const [w, h] = SUPERFICIES[doc.superficie]
  const jugadoras = doc.elementos.filter(e => e.tipo === 'jugadora'), pelotas = doc.elementos.filter(e => e.tipo === 'pelota')
  return Object.fromEntries(pelotas.map(b => [b.id, doc.pasos.map(p => {
    const pb = p.poses[b.id]
    let mejor = null, distancia = Infinity
    for (const j of jugadoras) {
      const pj = p.poses[j.id], d = Math.hypot((pj.x - pb.x) * w / 100, (pj.y - pb.y) * h / 100)
      if (d <= alcancePosesion(j, b) && d < distancia) { mejor = j.id; distancia = d }
    }
    return mejor
  })]))
}

// Tangentes acotadas por tramo (en metros), listas para la cúbica de Hermite.
function tangentes(puntos, duraciones) {
  const n = puntos.length, velocidad = puntos.map(() => [0, 0])
  for (let k = 1; k < n - 1; k++) {
    const antes = [puntos[k][0] - puntos[k - 1][0], puntos[k][1] - puntos[k - 1][1]]
    const despues = [puntos[k + 1][0] - puntos[k][0], puntos[k + 1][1] - puntos[k][1]]
    // Quieta en un tramo vecino o giro de más de 90°: frena en el paso (sin rulos).
    if (Math.hypot(...antes) < EPS || Math.hypot(...despues) < EPS || antes[0] * despues[0] + antes[1] * despues[1] <= 0) continue
    const tiempo = duraciones[k] + duraciones[k + 1]
    velocidad[k] = [(puntos[k + 1][0] - puntos[k - 1][0]) / tiempo, (puntos[k + 1][1] - puntos[k - 1][1]) / tiempo]
  }
  return puntos.slice(0, -1).map((p, k) => {
    const cuerda = [puntos[k + 1][0] - p[0], puntos[k + 1][1] - p[1]], largo = Math.hypot(...cuerda), d = duraciones[k + 1]
    const acotar = v => {
      let t = [v[0] * d, v[1] * d]
      if (largo < EPS || t[0] * cuerda[0] + t[1] * cuerda[1] <= 0) return [0, 0]
      const m = Math.hypot(...t)
      if (m > largo) t = [t[0] * largo / m, t[1] * largo / m]
      return t
    }
    return [acotar(velocidad[k]), acotar(velocidad[k + 1])]
  })
}

function hermite(p0, p1, t0, t1, u) {
  const u2 = u * u, u3 = u2 * u
  const a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u, c = -2 * u3 + 3 * u2, d = u3 - u2
  return [a * p0[0] + b * t0[0] + c * p1[0] + d * t1[0], a * p0[1] + b * t0[1] + c * p1[1] + d * t1[1]]
}

// Plan precalculado por documento y modo: se reutiliza en cada cuadro de la animación.
const planes = new WeakMap()
export function planAnimacion(doc, recorrido = 'suave') {
  const cache = planes.get(doc) || {}
  if (cache[recorrido]) return cache[recorrido]
  const [w, h] = SUPERFICIES[doc.superficie]
  const tiempos = tiemposDePasos(doc), duraciones = doc.pasos.map(p => p.duracion)
  const curvas = {}
  if (recorrido === 'suave' && doc.pasos.length > 2) {
    for (const e of doc.elementos) {
      if (!CURVAS.includes(e.tipo)) continue
      const puntos = doc.pasos.map(p => [p.poses[e.id].x * w / 100, p.poses[e.id].y * h / 100])
      curvas[e.id] = { puntos, tangentes: tangentes(puntos, duraciones) }
    }
  }
  const plan = { doc, recorrido, w, h, tiempos, total: tiempos.at(-1), curvas, posesiones: posesiones(doc), tipo: Object.fromEntries(doc.elementos.map(e => [e.id, e.tipo])) }
  planes.set(doc, { ...cache, [recorrido]: plan })
  return plan
}

function tramo(plan, tiempo) {
  const { tiempos } = plan, n = tiempos.length
  if (n < 2 || tiempo <= 0) return { k: 0, u: 0 }
  if (tiempo >= plan.total) return { k: n - 2, u: 1 }
  let k = 0
  while (k < n - 2 && tiempo > tiempos[k + 1]) k++
  return { k, u: limitar((tiempo - tiempos[k]) / (tiempos[k + 1] - tiempos[k]), 0, 1) }
}

// Posición (en %) de una ficha que se mueve sola (sin posesión): curva o recta.
function posicionLibre(plan, id, k, u) {
  const a = plan.doc.pasos[k].poses[id], b = plan.doc.pasos[k + 1].poses[id], curva = plan.curvas[id]
  if (curva) {
    const [x, y] = hermite(curva.puntos[k], curva.puntos[k + 1], curva.tangentes[k][0], curva.tangentes[k][1], u)
    return { x: limitar(x * 100 / plan.w, 0, 100), y: limitar(y * 100 / plan.h, 0, 100) }
  }
  const s = suave(u)
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }
}

function posicionPelota(plan, id, k, u) {
  const pasos = plan.doc.pasos, a = pasos[k].poses[id], b = pasos[k + 1].poses[id]
  const duena = plan.posesiones[id] || [], A = duena[k], B = duena[k + 1]
  if (!A && !B) {
    const s = suave(u)
    return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }
  }
  // Desplazamiento de la pelota respecto de quien la tiene, en el paso de salida y en el de llegada.
  const conDuena = (jid, paso, u2) => {
    const pj = posicionLibre(plan, jid, k, u2), base = pasos[paso].poses[jid], pb = pasos[paso].poses[id]
    return { x: pj.x + pb.x - base.x, y: pj.y + pb.y - base.y }
  }
  if (A && A === B) {
    // Conducción: acompaña a la jugadora; el desplazamiento cambia de a poco entre un paso y el otro.
    const pj = posicionLibre(plan, A, k, u), s = suave(u)
    const o0 = { x: a.x - pasos[k].poses[A].x, y: a.y - pasos[k].poses[A].y }, o1 = { x: b.x - pasos[k + 1].poses[A].x, y: b.y - pasos[k + 1].poses[A].y }
    return { x: limitar(pj.x + o0.x + (o1.x - o0.x) * s, 0, 100), y: limitar(pj.y + o0.y + (o1.y - o0.y) * s, 0, 100) }
  }
  // Pase (o pelota que sale/llega de un lugar libre): viaja recto y llega justo donde llega la receptora.
  const desde = A ? conDuena(A, k, u) : a, hasta = B ? conDuena(B, k + 1, u) : b, s = desacelerar(u)
  return { x: limitar(desde.x + (hasta.x - desde.x) * s, 0, 100), y: limitar(desde.y + (hasta.y - desde.y) * s, 0, 100) }
}

function poseEn(plan, id, k, u) {
  const a = plan.doc.pasos[k].poses[id], b = plan.doc.pasos[k + 1].poses[id]
  const rotacion = anguloCorto(a.rotacion, b.rotacion, suave(u))
  const lugar = plan.tipo[id] === 'pelota' ? posicionPelota(plan, id, k, u) : posicionLibre(plan, id, k, u)
  return { ...lugar, rotacion }
}

// Poses de todos los elementos en un instante de la animación.
export function animar(doc, tiempo, recorrido = 'suave') {
  if (doc.pasos.length < 2) return { indice: 0, poses: doc.pasos[0].poses }
  const plan = planAnimacion(doc, recorrido)
  if (tiempo >= plan.total) return { indice: doc.pasos.length - 1, poses: doc.pasos.at(-1).poses }
  const { k, u } = tramo(plan, tiempo)
  if (u <= 0) return { indice: k, poses: doc.pasos[k].poses }
  return { indice: k, poses: Object.fromEntries(doc.elementos.map(e => [e.id, poseEn(plan, e.id, k, u)])) }
}

export const MODOS_RECORRIDO = ['estela', 'completo', 'oculto']
const MUESTRAS_POR_SEGUNDO = 24, VENTANA_ESTELA = 1.2, MAX_MUESTRAS = 240

// Recorridos visibles: para cada jugadora o pelota que se movió, los puntos (en %) desde hace un rato
// ('estela') o desde el principio ('completo') hasta el instante actual.
export function estelas(doc, tiempo, modo = 'estela', recorrido = 'suave') {
  if (modo === 'oculto' || doc.pasos.length < 2 || tiempo <= 0) return []
  const plan = planAnimacion(doc, recorrido), fin = Math.min(tiempo, plan.total)
  const inicio = modo === 'completo' ? 0 : Math.max(0, fin - VENTANA_ESTELA)
  const muestras = Math.max(2, Math.min(MAX_MUESTRAS, Math.ceil((fin - inicio) * MUESTRAS_POR_SEGUNDO) + 1))
  const ids = doc.elementos.filter(e => CURVAS.includes(e.tipo)).map(e => e.id)
  const puntos = Object.fromEntries(ids.map(id => [id, []]))
  for (let i = 0; i < muestras; i++) {
    const t = inicio + (fin - inicio) * i / (muestras - 1), { k, u } = tramo(plan, t)
    for (const id of ids) {
      const p = u <= 0 ? doc.pasos[k].poses[id] : poseEn(plan, id, k, u)
      puntos[id].push([p.x, p.y])
    }
  }
  return doc.elementos.filter(e => ids.includes(e.id)).flatMap(e => {
    const lista = puntos[e.id]
    let largo = 0
    for (let i = 1; i < lista.length; i++) largo += Math.hypot((lista[i][0] - lista[i - 1][0]) * plan.w / 100, (lista[i][1] - lista[i - 1][1]) * plan.h / 100)
    return largo < .3 ? [] : [{ id: e.id, tipo: e.tipo, color: e.color, puntos: lista }]
  })
}

