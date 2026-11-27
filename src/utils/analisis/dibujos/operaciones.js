// Operaciones del editor sobre un dibujo (cada una devuelve un dibujo nuevo, sin tocar el anterior: así funciona
// deshacer / rehacer). Lógica pura.
import { desplazar, recortar01 } from './coordenadas.js'
import { FLECHAS_QUE_CRECEN, LIMITES, LUZ, PAUSA_POR_DEFECTO, esSeguimiento, limpiarReferencias, nuevoId } from './formato.js'
import { agregarClave, posicionEn } from './interpolacion.js'
import { fijarFocoZonaEn, fijarFormaEn, focoZonaEn, formaEn, ryCirculo } from './zonas.js'

export const DURACION_OBJETO = 3
const redondear = (t) => Math.round(Number(t) * 1000) / 1000
// Dibujos que se arman con jugadoras seguidas (no se mueven ni se duplican solos).
export const DERIVADOS = Object.freeze(['enlace', 'zona_lineas', 'linea_defensiva'])
// Duran hasta el fin del clip (como el seguimiento), porque acompañan a jugadoras que se mueven.
const HASTA_EL_FIN = ['zoom', 'zona_lineas', 'linea_defensiva']

// Objeto nuevo de un tipo, que aparece en t. clip: { inicio, fin } (el objeto no pasa del fin del clip).
export function crearObjeto(tipo, { t, clip, puntos = [], color = 'amarillo', grosor = 2, texto = '', usados = [] }) {
  const desde = redondear(t)
  const finClip = clip?.fin ?? desde + DURACION_OBJETO
  const seguimiento = esSeguimiento(tipo)
  const hasta = redondear(Math.max(desde + 0.5, seguimiento || HASTA_EL_FIN.includes(tipo) ? Math.max(finClip, desde + 0.5) : Math.min(finClip, desde + DURACION_OBJETO)))
  const obj = { id: nuevoId('o', usados), tipo, desde, hasta, color, grosor }
  if (seguimiento) {
    obj.pista = { fuente: 'manual', claves: puntos[0] ? [{ t: desde, ...puntos[0] }] : [] }
    // El reflector tiene su propia entrada (se enciende en medio segundo).
    obj.efectos = tipo === 'reflector' ? { entrada: false, pulso: false, sombra: false, rastro: false } : { entrada: true, pulso: false, sombra: tipo !== 'foco', rastro: false }
    if (tipo === 'nombre') obj.jugadora = { rival: true, dorsal: '', nombre: '' }
    if (tipo === 'reflector') { obj.color = color === 'amarillo' ? 'blanco' : color; obj.luz = { color: obj.color, intensidad: LUZ.intensidad, ancho: LUZ.ancho } }
  } else if (tipo === 'foco_zona') {
    // Dos esquinas (arrastrando) → elipse; un clic → círculo.
    const [a, b] = puntos.length >= 2 ? puntos : [puntos[0] || { x: 0.5, y: 0.5 }, null]
    const x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y
    const rx = b ? Math.max(0.02, Math.abs(b.x - a.x) / 2) : 0.07
    const ry = b ? Math.max(0.02, Math.abs(b.y - a.y) / 2) : ryCirculo(0.07)
    obj.forma = b ? 'elipse' : 'circulo'
    obj.claves = [{ t: desde, x: redondear4(x), y: redondear4(y), rx: redondear4(rx), ry: redondear4(ry) }]
    obj.color = color === 'amarillo' ? 'blanco' : color
  } else if (tipo === 'opciones_pase') {
    obj.pasadora = null; obj.receptora = null; obj.opciones = []; obj.secuencia = true
    obj.color = 'rojo'
    obj.hasta = redondear(Math.max(desde + 0.5, Math.min(finClip, desde + 4)))
  } else if (tipo === 'zona_lineas') {
    obj.lineaA = []; obj.lineaB = []
  } else if (tipo === 'linea_defensiva') {
    obj.jugadoras = []; obj.rol = 'defensa'; obj.arco = 'izquierda'; obj.umbral = 2; obj.estados = {}; obj.cubiertas = {}
  } else if (tipo === 'enlace') {
    obj.a = ''; obj.b = ''
  } else if (tipo === 'ficha') {
    // Jugadora marcada en este cuadro: queda quieta en la pizarra 2D todo el clip (no se ve sobre el video).
    obj.t = desde; obj.punto = puntos[0] || { x: 0.5, y: 0.5 }
    obj.desde = redondear(clip?.inicio ?? desde); obj.hasta = redondear(Math.max(obj.desde + 0.5, finClip))
    obj.jugadora = color === 'rojo' || color === 'azul' ? { rival: true, dorsal: '', nombre: '' } : { id: '', nombre: '', dorsal: '', foto: '' }
  } else if (tipo === 'zoom') {
    obj.escala = 2; obj.objetivo = puntos[0] || { x: 0.5, y: 0.5 }; obj.seguir = null
    obj.hasta = redondear(Math.min(finClip, desde + DURACION_OBJETO))
  } else {
    obj.puntos = puntos
    if (tipo === 'texto') obj.texto = texto || 'Texto'
    // Las flechas nuevas crecen del origen al destino (las viejas, sin `crecer`, aparecen enteras como antes).
    if (FLECHAS_QUE_CRECEN.includes(tipo)) obj.crecer = { modo: 'normal', pelota: false }
  }
  return obj
}

function redondear4(v) { return Math.round(v * 10000) / 10000 }

const ids = (d) => d.objetos.map((o) => o.id)

// «Seguir a esta jugadora»: la ficha quieta pasa a ser un anillo que la sigue, con su primer punto ya puesto (el lugar
// y el cuadro donde se agregó la ficha). Conserva la misma jugadora y el mismo id. Devuelve el dibujo nuevo.
export function fichaASeguimiento(d, id) {
  const f = d.objetos.find((o) => o.id === id && o.tipo === 'ficha')
  if (!f) return d
  const rival = Boolean(f.jugadora?.rival)
  const anillo = {
    id: f.id, tipo: 'anillo', desde: f.t, hasta: Math.max(f.hasta, f.t + 0.5), color: rival ? 'rojo' : 'amarillo', grosor: f.grosor || 2,
    pista: { fuente: 'manual', claves: [{ t: f.t, x: f.punto.x, y: f.punto.y }] },
    efectos: { entrada: true, pulso: false, sombra: true, rastro: false },
    jugadora: f.jugadora,
  }
  return { ...d, objetos: d.objetos.map((o) => (o.id === id ? anillo : o)) }
}

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

// Borra un objeto. Los enlaces que lo usaban se borran; el zoom que lo seguía queda fijo en su punto. (v3) Sale de las
// zonas entre líneas y las líneas defensivas (si quedan cortas, se borran) y las opciones de pase que la seguían quedan
// quietas donde estaba al aparecer.
export function borrarObjeto(d, id) {
  const borrado = d.objetos.find((o) => o.id === id)
  if (!borrado) return d
  const fijar = (p, desde) => (p?.seguir === id ? { ...p, seguir: null, punto: (borrado.pista && posicionEn(borrado.pista.claves, desde)) || p.punto } : p)
  const objetos = d.objetos.filter((o) => o.id !== id && !(o.tipo === 'enlace' && (o.a === id || o.b === id)))
    .map((o) => {
      if (o.tipo === 'zoom' && o.seguir === id) return { ...o, seguir: null }
      if (o.tipo === 'opciones_pase') return { ...o, pasadora: fijar(o.pasadora, o.desde), receptora: fijar(o.receptora, o.desde), opciones: o.opciones.map((p) => fijar(p, o.desde)) }
      if (o.tipo === 'zona_lineas') return { ...o, lineaA: o.lineaA.filter((x) => x !== id), lineaB: o.lineaB.filter((x) => x !== id) }
      if (o.tipo === 'linea_defensiva') return { ...o, jugadoras: o.jugadoras.filter((x) => x !== id) }
      return o
    })
  return { ...d, objetos: limpiarReferencias(objetos) }
}

// Duplica un objeto un poco corrido (para que se vea que hay dos). Devuelve { dibujo, id }.
export function duplicarObjeto(d, id, corrimiento = 0.03) {
  const o = d.objetos.find((x) => x.id === id)
  if (!o || DERIVADOS.includes(o.tipo)) return { dibujo: d, id: null }
  const copia = moverGeometria(structuredClone(o), corrimiento, corrimiento)
  copia.id = nuevoId('o', ids(d))
  return { dibujo: { ...d, objetos: [...d.objetos, copia] }, id: copia.id }
}

function moverGeometria(o, dx, dy) {
  if (o.puntos) o.puntos = o.puntos.map((p) => desplazar(p, dx, dy))
  if (o.pista) o.pista = { ...o.pista, claves: o.pista.claves.map((c) => ({ ...c, ...desplazar(c, dx, dy) })) }
  if (o.objetivo) o.objetivo = desplazar(o.objetivo, dx, dy)
  // v3: zonas que se mueven, foco en una zona y opciones de pase (lo que sigue a una jugadora no se toca).
  if (o.claves && o.tipo !== 'foco_zona') o.claves = o.claves.map((c) => ({ ...c, puntos: c.puntos.map((p) => desplazar(p, dx, dy)) }))
  if (o.tipo === 'foco_zona') o.claves = o.claves.map((c) => ({ ...c, ...desplazar(c, dx, dy) }))
  if (o.tipo === 'opciones_pase') {
    const mover = (p) => (p && !p.seguir ? { ...p, punto: desplazar(p.punto, dx, dy) } : p)
    o.pasadora = mover(o.pasadora); o.receptora = mover(o.receptora); o.opciones = o.opciones.map(mover)
  }
  return o
}

// Arrastrar un objeto fijo: corre todos sus puntos. (Los que siguen a una jugadora se mueven con marcarPosicion.)
export function moverObjeto(d, id, dx, dy) {
  return actualizarObjeto(d, id, (o) => moverGeometria({ ...o }, dx, dy))
}

// Arrastrar en el cuadro t: las zonas y focos que se mueven con puntos clave guardan la forma en t; lo demás se corre
// entero (moverObjeto). Lo que se arma con jugadoras seguidas no se mueve.
export function moverEn(d, id, t, dx, dy) {
  return actualizarObjeto(d, id, (o) => {
    if (DERIVADOS.includes(o.tipo)) return {}
    if ((o.tipo === 'zona' || o.tipo === 'poligono') && o.claves?.length) {
      return fijarFormaEn(o, t, formaEn(o, t).map((p) => desplazar(p, dx, dy)))
    }
    if (o.tipo === 'foco_zona') {
      const c = focoZonaEn(o, t)
      return c ? fijarFocoZonaEn(o, t, { x: c.x + dx, y: c.y + dy }) : {}
    }
    return moverGeometria({ ...o }, dx, dy)
  })
}

// Agarres (puntos que se pueden arrastrar) de un objeto en t, en coordenadas del video.
export function agarresDe(o, t) {
  if (o.tipo === 'zona' || o.tipo === 'poligono') return formaEn(o, t)
  if (o.tipo === 'foco_zona') { const c = focoZonaEn(o, t); return c ? [{ x: c.x, y: c.y }, { x: recortar01(c.x + c.rx), y: recortar01(c.y + c.ry) }] : [] }
  if (o.tipo === 'opciones_pase') return [o.pasadora, o.receptora, ...o.opciones].filter((p) => p && !p.seguir).map((p) => p.punto)
  if (o.tipo === 'movimiento') return [o.puntos[0], o.puntos[o.puntos.length - 1]]
  if (['pase_bajo', 'pase_alto', 'linea', 'texto'].includes(o.tipo)) return o.puntos
  return []
}

// Arrastrar el agarre i de un objeto en t: cambia la forma (zonas, foco en una zona) o la punta (flechas, líneas).
export function moverAgarre(d, id, t, i, p) {
  const q = { x: redondear4(recortar01(p.x)), y: redondear4(recortar01(p.y)) }
  return actualizarObjeto(d, id, (o) => {
    if (o.tipo === 'zona' || o.tipo === 'poligono') {
      const forma = formaEn(o, t).map((x, k) => (k === i ? q : x))
      return fijarFormaEn(o, t, forma)
    }
    if (o.tipo === 'foco_zona') {
      const c = focoZonaEn(o, t)
      if (!c) return {}
      if (i === 0) return fijarFocoZonaEn(o, t, { x: q.x, y: q.y })
      const rx = Math.max(0.01, Math.abs(q.x - c.x))
      return fijarFocoZonaEn(o, t, { rx, ry: o.forma === 'circulo' ? ryCirculo(rx) : Math.max(0.01, Math.abs(q.y - c.y)) })
    }
    if (o.tipo === 'opciones_pase') {
      const lista = [['pasadora'], ['receptora'], ...o.opciones.map((_, k) => ['opciones', k])].filter(([campo, k]) => {
        const x = campo === 'opciones' ? o.opciones[k] : o[campo]
        return x && !x.seguir
      })
      const [campo, k] = lista[i] || []
      if (!campo) return {}
      if (campo === 'opciones') return { opciones: o.opciones.map((x, j) => (j === k ? { ...x, punto: q } : x)) }
      return { [campo]: { ...o[campo], punto: q } }
    }
    if (o.puntos) {
      const indice = o.tipo === 'movimiento' && i === 1 ? o.puntos.length - 1 : i
      return { puntos: o.puntos.map((x, k) => (k === indice ? q : x)) }
    }
    return {}
  })
}

// ---------- Opciones de pase ----------
// participante: { punto, seguir, jugadora? }. Crea el dibujo con la pasadora y la receptora (el pase que salió mal).
export function crearOpcionesPase(d, { t, clip, pasadora, receptora, usados = ids(d) }) {
  const obj = { ...crearObjeto('opciones_pase', { t, clip, usados }), pasadora, receptora }
  return { dibujo: agregarObjeto(d, obj), id: obj.id }
}

export function agregarOpcion(d, id, participante) {
  return actualizarObjeto(d, id, (o) => (o.opciones.length >= LIMITES.opciones ? {} : { opciones: [...o.opciones, participante] }))
}

// ---------- Pausa explicativa en un toque ----------
// En el cuadro t: una pausa, un foco (sobre la jugadora seguida que se tocó, o un foco en una zona redonda en el punto)
// y un subtítulo listo para escribir (si ya había uno en t, se usa ese). Devuelve { dibujo, pausa, foco, subtitulo }.
export function pausaExplicativa(d, t, { punto, seguida = null, clip = d.clip, duracion = PAUSA_POR_DEFECTO, texto = 'Escribí la explicación' }) {
  const tt = redondear(t)
  let dibujo = d
  const existente = (dibujo.pausas || []).find((p) => Math.abs(p.t - tt) < 0.05)
  let pausa = existente?.id || null
  if (!existente) { const r = agregarPausa(dibujo, tt, duracion); dibujo = r.dibujo; pausa = r.id }
  const fin = clip?.fin ?? tt + 2
  const hasta = redondear(Math.max(tt + 0.5, Math.min(fin, tt + 1.5)))
  const usados = ids(dibujo)
  let foco
  if (seguida?.pista) {
    foco = { ...crearObjeto('foco', { t: tt, clip, usados }), hasta, pista: { fuente: seguida.pista.fuente, claves: seguida.pista.claves.map((c) => ({ ...c })) } }
    foco.efectos = { entrada: true, pulso: false, sombra: false, rastro: false }
    if (seguida.jugadora) foco.jugadora = seguida.jugadora
    foco.en2d = false // la 2D ya muestra a esa jugadora (la del objeto que se tocó)
  } else {
    foco = { ...crearObjeto('foco_zona', { t: tt, clip, puntos: [punto || { x: 0.5, y: 0.5 }], usados }), hasta }
  }
  dibujo = agregarObjeto(dibujo, foco)
  const enT = (dibujo.subtitulos || []).find((s) => tt >= s.desde && tt < s.hasta)
  let subtitulo = enT?.id || null
  if (!enT) { const r = agregarSubtitulo(dibujo, tt, Math.max(hasta, tt + 0.5), texto); dibujo = r.dibujo; subtitulo = r.id }
  return { dibujo, pausa, foco: foco.id, subtitulo }
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
  zoom: 'Zoom de cámara', ficha: 'Ficha (solo 2D)',
  reflector: 'Reflector', foco_zona: 'Foco en una zona', opciones_pase: 'Opciones de pase', zona_lineas: 'Zona entre líneas',
  linea_defensiva: 'Línea defensiva',
})
