// Documento editable v2: identidad y estilo globales, poses relativas por fotograma.
// v2 (etapa C de la base) suma recorrido y placa por jugada; vínculo por ficha; zona sombreada; y por paso
// subtítulo, pausa, pase alto/bajo, foco y elementos ocultos. Un v1 se lee igual y se guarda como v2.
// Las mismas reglas valida la base (pizarra_privado.validar): cambiar una sin la otra rompe el guardado.
export const SUPERFICIES = { completa: [105, 68, 'Cancha completa'], media: [52.5, 68, 'Media cancha'], cuarto: [52.5, 34, 'Cuarto de cancha'], area: [35, 50, 'Área y definición'], reducida: [40, 25, 'Cancha reducida'], libre: [40, 25, 'Espacio libre'] }
export const HERRAMIENTAS = { jugadora: 'Jugadora', cono: 'Cono', tortuga: 'Tortuguita', escalera: 'Escalera', valla: 'Valla', aro: 'Aro', pelota: 'Pelota', arco: 'Arco grande', mini: 'Arco pequeño', pica: 'Pica', zona: 'Zona', flecha: 'Flecha recta', curva: 'Flecha curva', punteada: 'Flecha punteada', conduccion: 'Conducción', pase: 'Pase', movimiento: 'Desplazamiento', remate: 'Remate', rectangulo: 'Rectángulo', circulo: 'Círculo', texto: 'Texto', sombra: 'Zona sombreada' }
const COLOR = /^#[0-9a-f]{6}$/i
const ID = /^[a-zA-Z0-9_-]{1,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const limitar = (v, min, max) => Math.max(min, Math.min(max, v))
export const RECORRIDOS = ['suave', 'recto']
export const PAUSA_MAXIMA = 30
const pasoNuevoV2 = (nombre, poses = {}) => ({ id: crypto.randomUUID(), nombre, duracion: 2, texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [], poses })
export function nuevaPizarra() { return { version: 2, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1, recorrido: 'suave', placa: { titulo: '', analista: '' }, elementos: [], pasos: [pasoNuevoV2('Inicio')] } }
const numero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const texto = (v, max) => typeof v === 'string' && v.length <= max
export function validarPizarra(doc) {
  if (!doc || ![1, 2].includes(doc.version) || !Object.hasOwn(SUPERFICIES, doc.superficie) || !['horizontal', 'vertical'].includes(doc.orientacion) || !['izquierda', 'derecha'].includes(doc.ataque) || typeof doc.bucle !== 'boolean' || !numero(doc.velocidad, .25, 3)) throw Error('Formato de pizarra no compatible.')
  // Lo que falta se completa con el valor por defecto (v1, o un v2 armado a mano); lo que viene mal se rechaza.
  // La base exige todos los campos v2: este validador siempre los devuelve completos.
  const v2 = doc.version === 2, placa = (v2 && doc.placa) || { titulo: '', analista: '' }, recorrido = (v2 && doc.recorrido) || 'suave'
  if (!RECORRIDOS.includes(recorrido) || typeof placa !== 'object' || !texto(placa.titulo ?? '', 80) || !texto(placa.analista ?? '', 80)) throw Error('Formato de pizarra no compatible.')
  if (!Array.isArray(doc.elementos) || doc.elementos.length > 200 || !Array.isArray(doc.pasos) || !doc.pasos.length || doc.pasos.length > 60 || JSON.stringify(doc).length > 900000) throw Error('La pizarra supera el límite de 200 elementos o 60 pasos.')
  const ids = new Set(), jugadoras = new Set()
  const elementos = doc.elementos.map(e => {
    if (typeof e.id !== 'string' || !ID.test(e.id) || ids.has(e.id) || !Object.hasOwn(HERRAMIENTAS, e.tipo) || (!v2 && e.tipo === 'sombra') || !COLOR.test(e.color) || !COLOR.test(e.tinta) || !numero(e.tamano, 1, 12) || !numero(e.grosor, .1, 2) || !numero(e.dx, -80, 80) || !numero(e.dy, -80, 80) || !numero(e.curva, -50, 50) || typeof e.texto !== 'string' || e.texto.length > 200 || typeof e.numero !== 'string' || e.numero.length > 4) throw Error('Elemento de pizarra inválido.')
    ids.add(e.id)
    const limpio = { id: e.id, tipo: e.tipo, color: e.color, tinta: e.tinta, tamano: e.tamano, grosor: e.grosor, dx: e.dx, dy: e.dy, curva: e.curva, texto: e.texto, numero: e.numero }
    const vinculo = v2 ? e.vinculo ?? null : null
    if (e.tipo === 'jugadora') {
      jugadoras.add(e.id)
      if (vinculo !== null && (typeof vinculo !== 'object' || !['jugadora', 'rival'].includes(vinculo.tipo) || typeof vinculo.id !== 'string' || !UUID.test(vinculo.id))) throw Error('Vínculo de ficha inválido.')
      limpio.vinculo = vinculo && { tipo: vinculo.tipo, id: vinculo.id.toLowerCase() }
    } else if (vinculo !== null) throw Error('Vínculo de ficha inválido.')
    if (e.tipo === 'sombra') {
      if (!Array.isArray(e.puntos) || e.puntos.length < 3 || e.puntos.length > 16 || e.puntos.some(p => !p || !numero(p.x, -100, 100) || !numero(p.y, -100, 100))) throw Error('Zona sombreada inválida.')
      limpio.puntos = e.puntos.map(p => ({ x: p.x, y: p.y }))
    }
    return limpio
  })
  const pasosId = new Set()
  const pasos = doc.pasos.map(p => {
    if (typeof p.id !== 'string' || !ID.test(p.id) || pasosId.has(p.id) || typeof p.nombre !== 'string' || p.nombre.length > 80 || !numero(p.duracion, .1, 60) || !p.poses || Array.isArray(p.poses) || typeof p.poses !== 'object' || Object.keys(p.poses).length !== ids.size) throw Error('Fotograma inválido o incompleto.')
    pasosId.add(p.id)
    const extra = v2 ? { texto: p.texto ?? '', pausa: p.pausa ?? 0, pase: p.pase ?? 'bajo', foco: p.foco ?? null, ocultos: p.ocultos ?? [] } : { texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [] }
    if (!texto(extra.texto, 200) || !numero(extra.pausa, 0, PAUSA_MAXIMA) || !['bajo', 'alto'].includes(extra.pase) || (extra.foco !== null && !jugadoras.has(extra.foco))
      || !Array.isArray(extra.ocultos) || extra.ocultos.some(id => typeof id !== 'string' || !ids.has(id)) || new Set(extra.ocultos).size !== extra.ocultos.length) throw Error('Paso de pizarra inválido.')
    const poses = Object.fromEntries(elementos.map(e => {
      const pose = p.poses[e.id]
      if (!pose || !numero(pose.x, 0, 100) || !numero(pose.y, 0, 100) || !numero(pose.rotacion, -360, 360)) throw Error('Posición inválida.')
      return [e.id, { x: pose.x, y: pose.y, rotacion: pose.rotacion }]
    }))
    return { id: p.id, nombre: p.nombre, duracion: p.duracion, texto: extra.texto, pausa: extra.pausa, pase: extra.pase, foco: extra.foco, ocultos: [...extra.ocultos], poses }
  })
  return { version: 2, superficie: doc.superficie, orientacion: doc.orientacion, ataque: doc.ataque, bucle: doc.bucle, velocidad: doc.velocidad,
    recorrido, placa: { titulo: placa.titulo ?? '', analista: placa.analista ?? '' }, elementos, pasos }
}
// Colores guardados en el documento: el validador (cliente y Supabase) exige hex,
// y el visor de Wellness y el PNG los dibujan tal cual. Única fuente de estos valores.
export const PALETA = { local: '#F2C230', rival: '#2563EB', pelota: '#FFFFFF', material: '#FF7B24', trazo: '#FFFFFF', tinta: '#111111', tintaClara: '#FFFFFF', sombra: '#EF4444', rapidos: ['#F2C230', '#2563EB', '#EF4444', '#FFFFFF', '#111111', '#FF7B24'] }
export const LINEAS = ['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate']
// Atajos de interfaz que crean tipos v1 existentes con otro estilo (sin tipos nuevos en la base).
export const ATAJOS = { rival: { tipo: 'jugadora', nombre: 'Rival', extra: { color: PALETA.rival, tinta: PALETA.tintaClara } } }
export const plantillaHerramienta = id => ATAJOS[id] || (Object.hasOwn(HERRAMIENTAS, id) ? { tipo: id, nombre: HERRAMIENTAS[id], extra: {} } : null)
const redondear = v => Math.round(v * 100) / 100
// Zona sombreada nueva: un rectángulo de 12 × 8 m alrededor del punto donde se coloca (puntos en % de la superficie).
function puntosIniciales(doc) {
  const [w, h] = SUPERFICIES[doc.superficie], ax = redondear(6 * 100 / w), ay = redondear(4 * 100 / h)
  return [{ x: -ax, y: -ay }, { x: ax, y: -ay }, { x: ax, y: ay }, { x: -ax, y: ay }]
}
export function agregarElemento(doc, tipo, x = 50, y = 50, extra = {}) {
  if (!Object.hasOwn(HERRAMIENTAS, tipo) || doc.elementos.length >= 200) return doc
  const color = extra.color || (tipo === 'jugadora' ? PALETA.local : tipo === 'pelota' ? PALETA.pelota : tipo === 'sombra' ? PALETA.sombra : LINEAS.includes(tipo) ? PALETA.trazo : PALETA.material)
  // Cada equipo (color) numera sus jugadoras por separado.
  const numero = tipo === 'jugadora' ? String(doc.elementos.filter(e => e.tipo === tipo && e.color.toLowerCase() === color.toLowerCase()).length + 1) : ''
  const e = { id: crypto.randomUUID(), tipo, numero, texto: tipo === 'texto' ? 'Texto' : '', tinta: PALETA.tinta, tamano: 3, grosor: .4, dx: 15, dy: 0, curva: tipo === 'curva' ? 12 : 0,
    ...(tipo === 'jugadora' ? { vinculo: null } : {}), ...(tipo === 'sombra' ? { puntos: puntosIniciales(doc) } : {}), ...extra, color }
  return { ...doc, elementos: [...doc.elementos, e], pasos: doc.pasos.map(p => ({ ...p, poses: { ...p.poses, [e.id]: { x, y, rotacion: 0 } } })) }
}
// Flecha dibujada de origen a destino (coordenadas 0-100). El formato v1 limita el vector a ±80.
export function colocarFlecha(doc, tipo, origen, destino, extra = {}) {
  return agregarElemento(doc, tipo, redondear(limitar(origen.x, 0, 100)), redondear(limitar(origen.y, 0, 100)), { ...extra, dx: redondear(limitar(destino.x - origen.x, -80, 80)), dy: redondear(limitar(destino.y - origen.y, -80, 80)) })
}
// Mueve la salida o la punta de una flecha en el paso indicado, respetando su rotación.
// La forma (dx/dy) es del elemento y vale para todos los pasos; la salida es la pose del paso.
export function moverExtremo(doc, indice, id, extremo, p) {
  const [w, h] = SUPERFICIES[doc.superficie], e = doc.elementos.find(x => x.id === id), pose = doc.pasos[indice]?.poses[id]
  if (!e || !pose || !LINEAS.includes(e.tipo)) return doc
  const r = pose.rotacion * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r)
  const lx = e.dx * w / 100, ly = e.dy * h / 100
  const salida = extremo === 'origen' ? { x: limitar(p.x, 0, 100) * w / 100, y: limitar(p.y, 0, 100) * h / 100 } : { x: pose.x * w / 100, y: pose.y * h / 100 }
  const punta = extremo === 'punta' ? { x: p.x * w / 100, y: p.y * h / 100 } : { x: pose.x * w / 100 + lx * cos - ly * sin, y: pose.y * h / 100 + lx * sin + ly * cos }
  const vx = punta.x - salida.x, vy = punta.y - salida.y
  const dx = redondear(limitar((vx * cos + vy * sin) * 100 / w, -80, 80)), dy = redondear(limitar((-vx * sin + vy * cos) * 100 / h, -80, 80))
  return { ...doc, elementos: doc.elementos.map(x => x.id === id ? { ...x, dx, dy } : x), pasos: doc.pasos.map((f, i) => i !== indice ? f : { ...f, poses: { ...f.poses, [id]: { ...pose, x: redondear(salida.x * 100 / w), y: redondear(salida.y * 100 / h) } } }) }
}
// Mueve un vértice de una zona sombreada. Los puntos son de la forma (valen para todos los pasos) y giran con la pose.
export function moverVertice(doc, indice, id, vertice, p) {
  const [w, h] = SUPERFICIES[doc.superficie], e = doc.elementos.find(x => x.id === id), pose = doc.pasos[indice]?.poses[id]
  if (e?.tipo !== 'sombra' || !pose || !e.puntos[vertice]) return doc
  const r = -pose.rotacion * Math.PI / 180, vx = (limitar(p.x, 0, 100) - pose.x) * w / 100, vy = (limitar(p.y, 0, 100) - pose.y) * h / 100
  const punto = { x: redondear(limitar((vx * Math.cos(r) - vy * Math.sin(r)) * 100 / w, -100, 100)), y: redondear(limitar((vx * Math.sin(r) + vy * Math.cos(r)) * 100 / h, -100, 100)) }
  return { ...doc, elementos: doc.elementos.map(x => x.id === id ? { ...x, puntos: x.puntos.map((q, i) => i === vertice ? punto : q) } : x) }
}
// Al borrar elementos también se limpian el foco y los ocultos de cada paso.
export function quitarElementos(doc, ids) {
  return { ...doc, elementos: doc.elementos.filter(e => !ids.includes(e.id)), pasos: doc.pasos.map(p => ({ ...p, foco: ids.includes(p.foco) ? null : p.foco, ocultos: p.ocultos.filter(id => !ids.includes(id)),
    poses: Object.fromEntries(Object.entries(p.poses).filter(([id]) => !ids.includes(id))) })) }
}
// Oculta (o vuelve a mostrar) elementos en un paso. Al reproducir aparecen y desaparecen con un fundido.
export function alternarOcultos(doc, indice, ids) {
  const paso = doc.pasos[indice]
  if (!paso || !ids.length) return doc
  const todos = ids.every(id => paso.ocultos.includes(id))
  const ocultos = todos ? paso.ocultos.filter(id => !ids.includes(id)) : [...paso.ocultos, ...ids.filter(id => !paso.ocultos.includes(id))]
  return { ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, ocultos } : p) }
}
// Foco en una jugadora en un paso (o lo saca si ya lo tenía).
export function alternarFoco(doc, indice, id) {
  const paso = doc.pasos[indice], e = doc.elementos.find(x => x.id === id)
  if (!paso || (id !== null && e?.tipo !== 'jugadora')) return doc
  return { ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, foco: p.foco === id ? null : id } : p) }
}
// Pasos: eliminar (queda al menos uno), duplicar tal cual y mover de lugar.
export function eliminarPaso(doc, indice) {
  if (doc.pasos.length < 2 || !doc.pasos[indice]) return doc
  return { ...doc, pasos: doc.pasos.filter((_, i) => i !== indice) }
}
export function duplicarPaso(doc, indice) {
  if (doc.pasos.length >= 60 || !doc.pasos[indice]) return doc
  const pasos = [...doc.pasos], original = pasos[indice]
  pasos.splice(indice + 1, 0, { ...structuredClone(original), id: crypto.randomUUID(), nombre: `${original.nombre} (copia)`.slice(0, 80) })
  return { ...doc, pasos }
}
export function moverPaso(doc, desde, hasta) {
  if (desde === hasta || !doc.pasos[desde] || hasta < 0 || hasta >= doc.pasos.length) return doc
  const pasos = [...doc.pasos], [paso] = pasos.splice(desde, 1)
  pasos.splice(hasta, 0, paso)
  return { ...doc, pasos }
}
// Textos y zonas sombreadas son anotaciones: están en el mismo lugar en todos los pasos (se muestran u ocultan por paso).
// Así un texto no puede quedar movido en un solo paso por estar dentro de una selección.
export const FIJOS = ['texto', 'sombra']
export function fijarAnotaciones(doc, indice) {
  const ids = doc.elementos.filter(e => FIJOS.includes(e.tipo)).map(e => e.id), origen = doc.pasos[indice]?.poses
  if (!ids.length || !origen) return doc
  return { ...doc, pasos: doc.pasos.map((p, i) => i === indice ? p : { ...p, poses: { ...p.poses, ...Object.fromEntries(ids.map(id => [id, { ...origen[id] }])) } }) }
}

// Formaciones prearmadas. Líneas de atrás hacia adelante (la primera es la arquera) con los números de cada puesto,
// ordenados de izquierda a derecha desde el punto de vista del equipo.
export const FORMACIONES = {
  '4-4-2': [[1], [3, 6, 2, 4], [11, 5, 8, 7], [10, 9]],
  '4-3-3': [[1], [3, 6, 2, 4], [8, 5, 10], [11, 9, 7]],
  '4-2-3-1': [[1], [3, 6, 2, 4], [8, 5], [11, 10, 7], [9]],
  '3-5-2': [[1], [3, 2, 6], [11, 8, 5, 4, 7], [10, 9]],
  '3-4-3': [[1], [3, 2, 6], [10, 8, 5, 4], [11, 9, 7]],
  '4-1-4-1': [[1], [3, 6, 2, 4], [5], [11, 10, 8, 7], [9]],
}
const ANCHOS = { 1: [.5], 2: [.36, .64], 3: [.24, .5, .76], 4: [.13, .38, .62, .87], 5: [.1, .3, .5, .7, .9] }
export const esRival = e => e.tipo === 'jugadora' && e.color.toLowerCase() === PALETA.rival.toLowerCase()
// Lugares (en %) de una formación. `profundidad` va de 0 (arco propio) a 1 (arco rival).
// Cancha completa: cada equipo en su mitad. Media cancha (se ve el arco de la izquierda): el equipo que defiende ese arco
// se para atrás y el que ataca se para adelantado, sin arquera (quedaría fuera de la vista).
export function lugaresFormacion(doc, sistema, equipo) {
  const lineas = FORMACIONES[sistema]
  if (!lineas) return []
  const media = doc.superficie === 'media', largo = 105
  // ¿Hacia dónde ataca este equipo? El propio según el documento; el rival, al revés.
  const atacaDerecha = (doc.ataque === 'derecha') === (equipo === 'propio')
  const defiendeVisible = atacaDerecha // con media cancha se ve el arco de la izquierda
  const adelantado = media && !defiendeVisible
  const salida = []
  lineas.forEach((numeros, i) => {
    if (i === 0 && adelantado) return
    const t = i === 0 ? .04 : adelantado ? .56 + (i - 1) * (.34 / Math.max(1, lineas.length - 2)) : .17 + (i - 1) * (.28 / Math.max(1, lineas.length - 2))
    const xMetros = atacaDerecha ? t * largo : largo - t * largo
    numeros.forEach((numero, k) => {
      const s = ANCHOS[numeros.length][k], y = (atacaDerecha ? s : 1 - s) * 100
      const x = media ? xMetros * 100 / 52.5 : xMetros * 100 / largo
      salida.push({ numero: String(numero), x: redondear(limitar(x, 2, 98)), y: redondear(limitar(y, 4, 96)) })
    })
  })
  return salida
}
// Aplica una formación en el paso indicado: reubica a las jugadoras de ese equipo que ya están (por número, y las demás
// en orden) y agrega solo las que faltan. Nunca duplica fichas.
export function aplicarFormacion(doc, indice, sistema, equipo) {
  const lugares = lugaresFormacion(doc, sistema, equipo)
  if (!lugares.length || !doc.pasos[indice]) return doc
  const delEquipo = doc.elementos.filter(e => e.tipo === 'jugadora' && (equipo === 'rival') === esRival(e))
  const libres = [...delEquipo], asignadas = new Map()
  for (const lugar of lugares) {
    const i = libres.findIndex(e => e.numero === lugar.numero)
    if (i >= 0) asignadas.set(lugar, libres.splice(i, 1)[0])
  }
  for (const lugar of lugares) if (!asignadas.has(lugar) && libres.length) asignadas.set(lugar, libres.shift())
  let siguiente = doc
  const extra = equipo === 'rival' ? { color: PALETA.rival, tinta: PALETA.tintaClara } : {}
  for (const lugar of lugares) {
    const e = asignadas.get(lugar)
    if (e) {
      siguiente = { ...siguiente, pasos: siguiente.pasos.map((p, i) => i === indice ? { ...p, poses: { ...p.poses, [e.id]: { ...p.poses[e.id], x: lugar.x, y: lugar.y } } } : p) }
    } else {
      const antes = siguiente
      siguiente = agregarElemento(siguiente, 'jugadora', lugar.x, lugar.y, { ...extra, numero: lugar.numero })
      if (siguiente === antes) break
    }
  }
  return siguiente
}

// Paso nuevo copiado del actual: conserva posiciones, ocultos y foco; subtítulo, pausa y pase arrancan de cero.
export function copiarPaso(doc, indice) {
  if (doc.pasos.length >= 60) return doc
  const pasos = [...doc.pasos]
  pasos.splice(indice + 1, 0, { ...structuredClone(pasos[indice]), id: crypto.randomUUID(), nombre: `Paso ${pasos.length + 1}`, texto: '', pausa: 0, pase: 'bajo' })
  return { ...doc, pasos }
}
export function duplicarElementos(doc, ids) {
  const elegidos = doc.elementos.filter(e => ids.includes(e.id))
  if (elegidos.length + doc.elementos.length > 200) return doc
  const copias = elegidos.map(e => ({ ...e, id: crypto.randomUUID() }))
  return { ...doc, elementos: [...doc.elementos, ...copias], pasos: doc.pasos.map(p => ({ ...p, poses: { ...p.poses, ...Object.fromEntries(copias.map((e, i) => [e.id, { ...p.poses[elegidos[i].id], x: limitar(p.poses[elegidos[i].id].x + 3, 0, 100), y: limitar(p.poses[elegidos[i].id].y + 3, 0, 100) }])) } })) }
}
export function interpolar(doc, tiempo) {
  let restante = Math.max(0, tiempo)
  for (let i = 1; i < doc.pasos.length; i++) {
    const fin = doc.pasos[i], inicio = doc.pasos[i - 1]
    if (restante <= fin.duracion) {
      const t = limitar(restante / fin.duracion, 0, 1), suave = t * t * (3 - 2 * t)
      return { indice: i - 1, poses: Object.fromEntries(doc.elementos.map(e => {
        const a = inicio.poses[e.id], b = fin.poses[e.id], angulo = ((b.rotacion - a.rotacion + 540) % 360) - 180
        return [e.id, { x: a.x + (b.x - a.x) * suave, y: a.y + (b.y - a.y) * suave, rotacion: a.rotacion + angulo * suave }]
      })) }
    }
    restante -= fin.duracion
  }
  return { indice: doc.pasos.length - 1, poses: doc.pasos.at(-1).poses }
}
// Duración de la reproducción: transiciones entre pasos más la pausa de cada paso (también la del último).
export const duracionTotal = doc => doc.pasos.reduce((n, p, i) => n + (i ? p.duracion : 0) + (p.pausa || 0), 0)
export const LIMITE_HISTORIAL = 100
export function historialInicial(doc) { return { actual: validarPizarra(doc), antes: [], despues: [], clave: null } }
// `clave` agrupa ediciones continuas (un deslizador, un texto) en un único paso de deshacer.
export function historial(h, accion, doc, clave = null) {
  if (accion === 'deshacer') return h.antes.length ? { actual: h.antes.at(-1), antes: h.antes.slice(0, -1), despues: [h.actual, ...h.despues], clave: null } : h
  if (accion === 'rehacer') return h.despues.length ? { actual: h.despues[0], antes: [...h.antes, h.actual], despues: h.despues.slice(1), clave: null } : h
  const limpio = validarPizarra(doc)
  if (JSON.stringify(limpio) === JSON.stringify(h.actual)) return h
  if (clave && h.clave === clave && h.antes.length) return { actual: limpio, antes: h.antes, despues: [], clave }
  return { actual: limpio, antes: [...h.antes.slice(-(LIMITE_HISTORIAL - 1)), h.actual], despues: [], clave }
}
