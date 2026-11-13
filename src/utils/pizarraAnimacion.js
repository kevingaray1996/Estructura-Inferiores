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
import { limitar, LINEAS, PALETA, SUPERFICIES } from './pizarra.js'

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


// ---------------------------------------------------------------------------------------------------------------
// Etapa B: imán de la pelota y flechas automáticas. Todo se calcula con las poses: nada se guarda en el documento.

const UMBRAL_MOVIMIENTO = 2 // metros: movimientos más chicos no generan flecha automática.
const TOLERANCIA_DIBUJADA = 5 // metros: una flecha dibujada a mano que empieza y termina cerca reemplaza a la automática.

const metros = (doc, p) => { const [w, h] = SUPERFICIES[doc.superficie]; return [p.x * w / 100, p.y * h / 100] }
const porcentaje = (doc, [x, y]) => { const [w, h] = SUPERFICIES[doc.superficie]; return { x: limitar(x * 100 / w, 0, 100), y: limitar(y * 100 / h, 0, 100) } }
const redondear2 = v => Math.round(v * 100) / 100

// Radio dentro del cual, al soltar la pelota, se acomoda a los pies de una jugadora.
export function alcanceIman(jugadora, pelota) { return alcancePosesion(jugadora, pelota) + 2 }

// Dueña de cada pelota en un paso (id de jugadora o null).
export function duenasEnPaso(doc, indice) {
  const todas = posesiones(doc)
  return Object.fromEntries(Object.entries(todas).map(([id, lista]) => [id, lista[indice] ?? null]))
}

// Lugar "a los pies" de una jugadora, del lado desde donde llega la pelota (o hacia el ataque si cae encima).
export function alPie(doc, jugadora, pelota, poseJugadora, desde) {
  const pj = metros(doc, poseJugadora), pd = desde ? metros(doc, desde) : pj
  let vx = pd[0] - pj[0], vy = pd[1] - pj[1], largo = Math.hypot(vx, vy)
  if (largo < .3) { vx = doc.ataque === 'izquierda' ? -1 : 1; vy = 0; largo = 1 }
  // Apenas encimada al borde de la ficha: la pelota se dibuja encima y no tiene que tapar el número.
  const d = jugadora.tamano + pelota.tamano * .7 - .6
  const p = porcentaje(doc, [pj[0] + vx / largo * d, pj[1] + vy / largo * d])
  return { x: redondear2(p.x), y: redondear2(p.y) }
}

// Jugadora (propia o rival) que atraería a la pelota si se suelta en `pose`, o null.
export function jugadoraCercana(doc, indice, pelotaId, pose) {
  const pelota = doc.elementos.find(e => e.id === pelotaId), paso = doc.pasos[indice]
  if (!pelota || pelota.tipo !== 'pelota' || !paso) return null
  const pb = metros(doc, pose)
  let mejor = null, distancia = Infinity
  for (const j of doc.elementos) {
    if (j.tipo !== 'jugadora') continue
    const pj = metros(doc, paso.poses[j.id]), d = Math.hypot(pj[0] - pb[0], pj[1] - pb[1])
    if (d <= alcanceIman(j, pelota) && d < distancia) { mejor = j; distancia = d }
  }
  return mejor
}

// Al soltar pelotas: cada una se pega a la jugadora más cercana dentro del imán; si no hay ninguna, queda suelta.
export function imanPelotas(doc, indice, ids) {
  const paso = doc.pasos[indice]
  if (!paso) return doc
  let poses = paso.poses, cambio = false
  for (const id of ids) {
    const pelota = doc.elementos.find(e => e.id === id)
    if (pelota?.tipo !== 'pelota') continue
    const j = jugadoraCercana(doc, indice, id, poses[id])
    if (!j) continue
    const lugar = alPie(doc, j, pelota, poses[j.id], poses[id])
    poses = { ...poses, [id]: { ...poses[id], ...lugar } }; cambio = true
  }
  return cambio ? { ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, poses } : p) } : doc
}

// Pelotas que tienen en este paso las jugadoras indicadas (para que acompañen el arrastre).
export function pelotasDe(doc, indice, jugadoraIds) {
  const duenas = duenasEnPaso(doc, indice)
  return Object.entries(duenas).filter(([, j]) => j && jugadoraIds.includes(j)).map(([id]) => id)
}

// "Pegar pelota": la pelota más cercana (o la que ya tiene) va a los pies de la jugadora en este paso.
export function pegarPelota(doc, indice, jugadoraId) {
  const jugadora = doc.elementos.find(e => e.id === jugadoraId), paso = doc.pasos[indice]
  const pelotas = doc.elementos.filter(e => e.tipo === 'pelota')
  if (jugadora?.tipo !== 'jugadora' || !paso || !pelotas.length) return doc
  const pj = metros(doc, paso.poses[jugadoraId])
  const pelota = pelotas.reduce((mejor, b) => {
    const pb = metros(doc, paso.poses[b.id]), d = Math.hypot(pb[0] - pj[0], pb[1] - pj[1])
    return !mejor || d < mejor.d ? { b, d } : mejor
  }, null).b
  const lugar = alPie(doc, jugadora, pelota, paso.poses[jugadoraId], paso.poses[pelota.id])
  return { ...doc, pasos: doc.pasos.map((p, i) => i !== indice ? p : { ...p, poses: { ...p.poses, [pelota.id]: { ...p.poses[pelota.id], ...lugar } } }) }
}

// Extremos (en metros) de una flecha dibujada en un paso, respetando su rotación.
function extremosDibujada(doc, e, pose) {
  const [w, h] = SUPERFICIES[doc.superficie], r = pose.rotacion * Math.PI / 180
  const lx = e.dx * w / 100, ly = e.dy * h / 100, s = metros(doc, pose)
  return [s, [s[0] + lx * Math.cos(r) - ly * Math.sin(r), s[1] + lx * Math.sin(r) + ly * Math.cos(r)]]
}

// Flechas automáticas de la transición del paso `j - 1` al paso `j`:
// pase (pelota que cambia de dueña o sale suelta), conducción (jugadora que se mueve con la pelota)
// y desplazamiento sin pelota. Se omiten movimientos chicos y las que ya están dibujadas a mano.
export function flechasAutomaticas(doc, j) {
  if (j < 1 || j >= doc.pasos.length) return []
  const antes = doc.pasos[j - 1].poses, ahora = doc.pasos[j].poses
  const duenasAntes = duenasEnPaso(doc, j - 1), duenasAhora = duenasEnPaso(doc, j)
  const dibujadas = doc.elementos.filter(e => LINEAS.includes(e.tipo)).flatMap(e => [j - 1, j].map(s => extremosDibujada(doc, e, doc.pasos[s].poses[e.id])))
  const yaDibujada = (a, b) => dibujadas.some(([s, f]) => Math.hypot(s[0] - a[0], s[1] - a[1]) <= TOLERANCIA_DIBUJADA && Math.hypot(f[0] - b[0], f[1] - b[1]) <= TOLERANCIA_DIBUJADA)
  const flecha = (id, tipo, color, origen, destino, r0, r1) => {
    const a = metros(doc, origen), b = metros(doc, destino), largo = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (largo < UMBRAL_MOVIMIENTO || yaDibujada(a, b) || largo - r0 - r1 < 1.5) return []
    const ux = (b[0] - a[0]) / largo, uy = (b[1] - a[1]) / largo
    const inicio = porcentaje(doc, [a[0] + ux * r0, a[1] + uy * r0]), fin = porcentaje(doc, [b[0] - ux * r1, b[1] - uy * r1])
    return [{ id: `auto-${tipo}-${id}`, tipo, color, x: inicio.x, y: inicio.y, dx: fin.x - inicio.x, dy: fin.y - inicio.y }]
  }
  const conduce = id => Object.keys(duenasAntes).some(b => duenasAntes[b] === id && duenasAhora[b] === id)
  return doc.elementos.flatMap(e => {
    if (e.tipo === 'jugadora') return flecha(e.id, conduce(e.id) ? 'conduccion' : 'movimiento', PALETA.trazo, antes[e.id], ahora[e.id], e.tamano, e.tamano)
    if (e.tipo === 'pelota') {
      const A = duenasAntes[e.id], B = duenasAhora[e.id]
      if (A && A === B) return [] // conducción: la dibuja la jugadora.
      // Con receptora, la punta termina en su borde (la pelota a sus pies quedaría tapada por la ficha).
      const receptora = B && doc.elementos.find(x => x.id === B)
      return receptora
        ? flecha(e.id, 'pase', PALETA.trazo, antes[e.id], ahora[B], e.tamano * .7, receptora.tamano + .4)
        : flecha(e.id, 'pase', PALETA.trazo, antes[e.id], ahora[e.id], e.tamano * .7, e.tamano * .7)
    }
    return []
  })
}
