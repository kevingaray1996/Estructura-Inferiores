// Documento editable v1: identidad y estilo globales, poses relativas por fotograma.
export const SUPERFICIES = { completa: [105, 68, 'Cancha completa'], media: [52.5, 68, 'Media cancha'], cuarto: [52.5, 34, 'Cuarto de cancha'], area: [35, 50, 'Área y definición'], reducida: [40, 25, 'Cancha reducida'], libre: [40, 25, 'Espacio libre'] }
export const HERRAMIENTAS = { jugadora: 'Jugadora', cono: 'Cono', tortuga: 'Tortuguita', escalera: 'Escalera', valla: 'Valla', aro: 'Aro', pelota: 'Pelota', arco: 'Arco grande', mini: 'Arco pequeño', pica: 'Pica', zona: 'Zona', flecha: 'Flecha recta', curva: 'Flecha curva', punteada: 'Flecha punteada', conduccion: 'Conducción', pase: 'Pase', movimiento: 'Desplazamiento', remate: 'Remate', rectangulo: 'Rectángulo', circulo: 'Círculo', texto: 'Texto' }
const COLOR = /^#[0-9a-f]{6}$/i
const ID = /^[a-zA-Z0-9_-]{1,80}$/
export const limitar = (v, min, max) => Math.max(min, Math.min(max, v))
export function nuevaPizarra() { return { version: 1, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1, elementos: [], pasos: [{ id: crypto.randomUUID(), nombre: 'Inicio', duracion: 2, poses: {} }] } }
const numero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
export function validarPizarra(doc) {
  if (!doc || doc.version !== 1 || !Object.hasOwn(SUPERFICIES, doc.superficie) || !['horizontal', 'vertical'].includes(doc.orientacion) || !['izquierda', 'derecha'].includes(doc.ataque) || typeof doc.bucle !== 'boolean' || !numero(doc.velocidad, .25, 3)) throw Error('Formato de pizarra no compatible.')
  if (!Array.isArray(doc.elementos) || doc.elementos.length > 200 || !Array.isArray(doc.pasos) || !doc.pasos.length || doc.pasos.length > 60 || JSON.stringify(doc).length > 900000) throw Error('La pizarra supera el límite de 200 elementos o 60 pasos.')
  const ids = new Set()
  const elementos = doc.elementos.map(e => {
    if (typeof e.id !== 'string' || !ID.test(e.id) || ids.has(e.id) || !Object.hasOwn(HERRAMIENTAS, e.tipo) || !COLOR.test(e.color) || !COLOR.test(e.tinta) || !numero(e.tamano, 1, 12) || !numero(e.grosor, .1, 2) || !numero(e.dx, -80, 80) || !numero(e.dy, -80, 80) || !numero(e.curva, -50, 50) || typeof e.texto !== 'string' || e.texto.length > 200 || typeof e.numero !== 'string' || e.numero.length > 4) throw Error('Elemento de pizarra inválido.')
    ids.add(e.id)
    return { id: e.id, tipo: e.tipo, color: e.color, tinta: e.tinta, tamano: e.tamano, grosor: e.grosor, dx: e.dx, dy: e.dy, curva: e.curva, texto: e.texto, numero: e.numero }
  })
  const pasosId = new Set()
  const pasos = doc.pasos.map(p => {
    if (typeof p.id !== 'string' || !ID.test(p.id) || pasosId.has(p.id) || typeof p.nombre !== 'string' || p.nombre.length > 80 || !numero(p.duracion, .1, 60) || !p.poses || Array.isArray(p.poses) || typeof p.poses !== 'object' || Object.keys(p.poses).length !== ids.size) throw Error('Fotograma inválido o incompleto.')
    pasosId.add(p.id)
    const poses = Object.fromEntries(elementos.map(e => {
      const pose = p.poses[e.id]
      if (!pose || !numero(pose.x, 0, 100) || !numero(pose.y, 0, 100) || !numero(pose.rotacion, -360, 360)) throw Error('Posición inválida.')
      return [e.id, { x: pose.x, y: pose.y, rotacion: pose.rotacion }]
    }))
    return { id: p.id, nombre: p.nombre, duracion: p.duracion, poses }
  })
  return { version: 1, superficie: doc.superficie, orientacion: doc.orientacion, ataque: doc.ataque, bucle: doc.bucle, velocidad: doc.velocidad, elementos, pasos }
}
export function agregarElemento(doc, tipo, x = 50, y = 50) {
  if (!Object.hasOwn(HERRAMIENTAS, tipo) || doc.elementos.length >= 200) return doc
  const e = { id: crypto.randomUUID(), tipo, numero: tipo === 'jugadora' ? String(doc.elementos.filter(e => e.tipo === tipo).length + 1) : '', texto: tipo === 'texto' ? 'Texto' : '', color: tipo === 'jugadora' ? '#F2C230' : tipo === 'pelota' ? '#FFFFFF' : '#FF7B24', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 12 }
  return { ...doc, elementos: [...doc.elementos, e], pasos: doc.pasos.map(p => ({ ...p, poses: { ...p.poses, [e.id]: { x, y, rotacion: 0 } } })) }
}
export function quitarElementos(doc, ids) { return { ...doc, elementos: doc.elementos.filter(e => !ids.includes(e.id)), pasos: doc.pasos.map(p => ({ ...p, poses: Object.fromEntries(Object.entries(p.poses).filter(([id]) => !ids.includes(id))) })) } }
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
export const duracionTotal = doc => doc.pasos.slice(1).reduce((n, p) => n + p.duracion, 0)
export function historialInicial(doc) { return { actual: validarPizarra(doc), antes: [], despues: [] } }
export function historial(h, accion, doc) {
  if (accion === 'deshacer') return h.antes.length ? { actual: h.antes.at(-1), antes: h.antes.slice(0, -1), despues: [h.actual, ...h.despues] } : h
  if (accion === 'rehacer') return h.despues.length ? { actual: h.despues[0], antes: [...h.antes, h.actual], despues: h.despues.slice(1) } : h
  const limpio = validarPizarra(doc)
  return JSON.stringify(limpio) === JSON.stringify(h.actual) ? h : { actual: limpio, antes: [...h.antes.slice(-39), h.actual], despues: [] }
}
