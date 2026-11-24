// Operaciones del editor sobre un dibujo (cada una devuelve un dibujo nuevo, sin tocar el anterior: así funciona
// deshacer / rehacer). Lógica pura.
import { desplazar } from './coordenadas.js'
import { PAUSA_POR_DEFECTO, esSeguimiento, nuevoId } from './formato.js'
import { agregarClave } from './interpolacion.js'

export const DURACION_OBJETO = 3
const redondear = (t) => Math.round(Number(t) * 1000) / 1000

// Objeto nuevo de un tipo, que aparece en t. clip: { inicio, fin } (el objeto no pasa del fin del clip).
export function crearObjeto(tipo, { t, clip, puntos = [], color = 'amarillo', grosor = 2, texto = '', usados = [] }) {
  const desde = redondear(t)
  const finClip = clip?.fin ?? desde + DURACION_OBJETO
  const seguimiento = esSeguimiento(tipo)
  const hasta = redondear(Math.max(desde + 0.5, seguimiento || tipo === 'zoom' ? Math.max(finClip, desde + 0.5) : Math.min(finClip, desde + DURACION_OBJETO)))
  const obj = { id: nuevoId('o', usados), tipo, desde, hasta, color, grosor }
  if (seguimiento) {
    obj.pista = { fuente: 'manual', claves: puntos[0] ? [{ t: desde, ...puntos[0] }] : [] }
    obj.efectos = { entrada: true, pulso: false, sombra: tipo !== 'foco', rastro: false }
    if (tipo === 'nombre') obj.jugadora = { rival: true, dorsal: '', nombre: '' }
  } else if (tipo === 'enlace') {
    obj.a = ''; obj.b = ''
  } else if (tipo === 'zoom') {
    obj.escala = 2; obj.objetivo = puntos[0] || { x: 0.5, y: 0.5 }; obj.seguir = null
    obj.hasta = redondear(Math.min(finClip, desde + DURACION_OBJETO))
  } else {
    obj.puntos = puntos
    if (tipo === 'texto') obj.texto = texto || 'Texto'
  }
  return obj
}

const ids = (d) => d.objetos.map((o) => o.id)

export function agregarObjeto(d, obj) {
  const id = ids(d).includes(obj.id) ? nuevoId('o', ids(d)) : obj.id
  return { ...d, objetos: [...d.objetos, { ...obj, id }] }
}

export function actualizarObjeto(d, id, cambios) {
  let cambio = false
  const objetos = d.objetos.map((o) => {
    if (o.id !== id) return o
    cambio = true
    const nuevo = { ...o, ...(typeof cambios === 'function' ? cambios(o) : cambios) }
    if (nuevo.hasta <= nuevo.desde) nuevo.hasta = redondear(nuevo.desde + 0.1)
    return nuevo
  })
  return cambio ? { ...d, objetos } : d
}

// Borra un objeto. Los enlaces que lo usaban se borran; el zoom que lo seguía queda fijo en su punto.
export function borrarObjeto(d, id) {
  if (!d.objetos.some((o) => o.id === id)) return d
  return {
    ...d,
    objetos: d.objetos.filter((o) => o.id !== id && !(o.tipo === 'enlace' && (o.a === id || o.b === id)))
      .map((o) => (o.tipo === 'zoom' && o.seguir === id ? { ...o, seguir: null } : o)),
  }
}

// Duplica un objeto un poco corrido (para que se vea que hay dos). Devuelve { dibujo, id }.
export function duplicarObjeto(d, id, corrimiento = 0.03) {
  const o = d.objetos.find((x) => x.id === id)
  if (!o) return { dibujo: d, id: null }
  const copia = moverGeometria(structuredClone(o), corrimiento, corrimiento)
  copia.id = nuevoId('o', ids(d))
  if (copia.tipo === 'enlace') return { dibujo: d, id: null }
  return { dibujo: { ...d, objetos: [...d.objetos, copia] }, id: copia.id }
}

function moverGeometria(o, dx, dy) {
  if (o.puntos) o.puntos = o.puntos.map((p) => desplazar(p, dx, dy))
  if (o.pista) o.pista = { ...o.pista, claves: o.pista.claves.map((c) => ({ ...c, ...desplazar(c, dx, dy) })) }
  if (o.objetivo) o.objetivo = desplazar(o.objetivo, dx, dy)
  return o
}

// Arrastrar un objeto fijo: corre todos sus puntos. (Los que siguen a una jugadora se mueven con marcarPosicion.)
export function moverObjeto(d, id, dx, dy) {
  return actualizarObjeto(d, id, (o) => moverGeometria({ ...o }, dx, dy))
}

// Clic sobre la jugadora con un objeto de seguimiento elegido: punto clave en t (reemplaza si ya había uno ahí).
// Si el clic es antes de que aparezca o después de que desaparezca, se estira su tiempo visible.
export function marcarPosicion(d, id, t, punto) {
  return actualizarObjeto(d, id, (o) => {
    if (!o.pista) return {}
    const claves = agregarClave(o.pista.claves, { t, ...punto })
    return { pista: { ...o.pista, claves }, desde: Math.min(o.desde, redondear(t)), hasta: Math.max(o.hasta, redondear(t)) }
  })
}

// Pausas y subtítulos.
export function agregarPausa(d, t, duracion = PAUSA_POR_DEFECTO) {
  const tt = redondear(t)
  if (d.pausas.some((p) => Math.abs(p.t - tt) < 0.05)) return { dibujo: d, id: null }
  const id = nuevoId('p', d.pausas.map((p) => p.id))
  return { dibujo: { ...d, pausas: [...d.pausas, { id, t: tt, duracion }].sort((a, b) => a.t - b.t) }, id }
}

export function agregarSubtitulo(d, desde, hasta, texto = 'Nuevo paso') {
  const id = nuevoId('s', d.subtitulos.map((s) => s.id))
  const sub = { id, desde: redondear(desde), hasta: redondear(Math.max(hasta, desde + 0.5)), texto }
  return { dibujo: { ...d, subtitulos: [...d.subtitulos, sub].sort((a, b) => a.desde - b.desde) }, id }
}

export function actualizarEnLista(d, lista, id, cambios) {
  if (!d[lista].some((x) => x.id === id)) return d
  const nuevos = d[lista].map((x) => (x.id === id ? { ...x, ...cambios } : x))
  const orden = lista === 'pausas' ? (a, b) => a.t - b.t : (a, b) => a.desde - b.desde
  return { ...d, [lista]: nuevos.sort(orden) }
}

export function borrarDeLista(d, lista, id) {
  return d[lista].some((x) => x.id === id) ? { ...d, [lista]: d[lista].filter((x) => x.id !== id) } : d
}

// Nombre de cada tipo para la interfaz.
export const NOMBRE_TIPO = Object.freeze({
  pase_bajo: 'Pase por bajo', pase_alto: 'Pase por alto', movimiento: 'Movimiento', linea: 'Línea', zona: 'Zona',
  poligono: 'Zona libre', texto: 'Texto', anillo: 'Anillo', foco: 'Foco', nombre: 'Nombre y dorsal', enlace: 'Línea entre dos',
  zoom: 'Zoom de cámara',
})
