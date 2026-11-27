// Formato de los dibujos de un clip (etapa 4, docs/analisis-etapa4.md; versión 2 de la etapa 5, docs/analisis-etapa5.md).
// Lógica pura: valida y ordena el JSON antes de guardarlo y al leerlo, para que un dato raro nunca rompa la reproducción.
// La versión 2 suma campos opcionales (cancha, calibraciones, fichas, jugadora en anillo y foco, ajustes de la 2D). Un
// dibujo que no usa nada de eso se sigue guardando como versión 1, así lo puede mostrar una app que no se actualizó.
import { recortar01 } from './coordenadas.js'
import { MAXIMO_CALIBRACIONES, MAXIMO_PUNTOS, REFS, medidasCancha } from './calibracion.js'

// La versión más nueva que esta app entiende. La 3 (docs/analisis-dibujos-pro.md) suma reflector, foco en una zona,
// opciones de pase, zonas que se mueven, zona entre líneas, línea defensiva, flechas que crecen, hueco del anillo y
// tramos de cámara lenta. Un dibujo que no usa nada de eso se sigue guardando como 1 o 2.
export const VERSION_DIBUJO = 3
export const LIMITES = Object.freeze({
  objetos: 200, claves: 600, pausas: 50, subtitulos: 50, puntos: 60, texto: 140, bytes: 200 * 1024,
  lentos: 20, clavesZona: 60, opciones: 5, linea: 11,
})
export const COLORES_DIBUJO = Object.freeze(['amarillo', 'blanco', 'rojo', 'azul'])
export const GROSORES = Object.freeze([1, 2, 3])
export const TIPOS_FIJOS = Object.freeze(['pase_bajo', 'pase_alto', 'movimiento', 'linea', 'zona', 'poligono', 'texto'])
// reflector (v3): haz de luz que sigue a la jugadora.
export const TIPOS_SEGUIMIENTO = Object.freeze(['anillo', 'foco', 'nombre', 'reflector'])
// Tipos de la versión 3 que no siguen a una jugadora por sí solos.
export const TIPOS_V3 = Object.freeze(['reflector', 'foco_zona', 'opciones_pase', 'zona_lineas', 'linea_defensiva'])
// ficha (v2): jugadora marcada en un solo cuadro; se ve quieta en la pizarra 2D, no sobre el video.
export const TIPOS = Object.freeze([...TIPOS_FIJOS, ...TIPOS_SEGUIMIENTO, 'enlace', 'zoom', 'ficha', 'foco_zona', 'opciones_pase', 'zona_lineas', 'linea_defensiva'])
export const FLECHAS_QUE_CRECEN = Object.freeze(['pase_bajo', 'pase_alto', 'movimiento'])
export const MODOS_CRECER = Object.freeze(['rapida', 'normal', 'lenta', 'real'])
export const FORMAS_FOCO = Object.freeze(['circulo', 'elipse', 'rectangulo'])
export const VELOCIDADES_LENTAS = Object.freeze([0.5, 0.25])
export const ESTADOS_LINEA = Object.freeze(['en_linea', 'adelantada', 'atras'])
export const HUECO = Object.freeze({ auto: 0.28, minimo: 0.1, maximo: 0.6 })
export const UMBRAL = Object.freeze({ defecto: 2, minimo: 0.5, maximo: 6 })
export const LUZ = Object.freeze({ intensidad: 0.6, ancho: 1 })
const ZONAS = ['zona', 'poligono', 'zona_lineas']
export const MAXIMO_AJUSTES = 200
export const PAUSA_POR_DEFECTO = 3
export const PAUSA_MINIMA = 0.5
export const PAUSA_MAXIMA = 20
export const ZOOM_MINIMO = 1.2
export const ZOOM_MAXIMO = 4

// Cuántos puntos necesita cada tipo fijo (mínimo y máximo).
const PUNTOS = { pase_bajo: [2, 2], pase_alto: [2, 2], linea: [2, 2], zona: [2, 2], movimiento: [2, LIMITES.puntos], poligono: [3, 30], texto: [1, 1] }

export const esSeguimiento = (tipo) => TIPOS_SEGUIMIENTO.includes(tipo)

const numero = (v, base = 0) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : base)
const tiempo = (v) => Math.max(0, Math.round(numero(v) * 1000) / 1000)
const cadena = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const coord = (v) => Math.round(recortar01(v) * 10000) / 10000
const punto = (p) => ({ x: coord(p?.x), y: coord(p?.y) })
const idValido = (v) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : '')

export function dibujoVacio(clip = null) {
  return {
    version: 1,
    clip: clip ? { inicio: tiempo(clip.inicio), fin: tiempo(clip.fin) } : null,
    objetos: [], pausas: [], subtitulos: [],
  }
}

export function estaVacio(dibujo) {
  return !dibujo || (!dibujo.objetos?.length && !dibujo.pausas?.length && !dibujo.subtitulos?.length && !dibujo.calibraciones?.length && !dibujo.lentos?.length)
}

// Id corto que no esté usado (o1, o2, … / p1 … / s1 …).
export function nuevoId(prefijo, usados) {
  const set = new Set(usados)
  let i = 1
  while (set.has(`${prefijo}${i}`)) i++
  return `${prefijo}${i}`
}

// Puntos clave de una pista: ordenados por tiempo, sin dos en el mismo instante, dentro del cuadro.
export function normalizarClaves(claves) {
  const lista = (Array.isArray(claves) ? claves : [])
    .filter((c) => c && c.t !== null && c.t !== '' && Number.isFinite(Number(c.t)))
    .map((c) => ({ t: tiempo(c.t), ...punto(c) }))
    .sort((a, b) => a.t - b.t)
  const unicas = []
  for (const c of lista) {
    if (unicas.length && Math.abs(unicas[unicas.length - 1].t - c.t) < 0.001) unicas[unicas.length - 1] = c
    else unicas.push(c)
  }
  return unicas.slice(0, LIMITES.claves)
}

function normalizarJugadora(j) {
  if (!j || typeof j !== 'object') return null
  const dorsal = cadena(String(j.dorsal ?? ''), 3)
  if (j.rival) return { rival: true, dorsal, nombre: cadena(j.nombre, 40) }
  const id = typeof j.id === 'string' ? j.id.slice(0, 40) : ''
  const foto = typeof j.foto === 'string' && /^https:\/\//.test(j.foto) ? j.foto.slice(0, 500) : ''
  return { id, nombre: cadena(j.nombre, 40), dorsal, foto }
}

// Correcciones hechas en la pizarra 2D (v2): [{ t, dx, dy }] en metros, ordenadas, una por instante.
function normalizarAjustes(lista) {
  const salida = []
  for (const a of (Array.isArray(lista) ? lista : [])) {
    if (!a || !Number.isFinite(Number(a.t))) continue
    const ajuste = { t: tiempo(a.t), dx: Math.round(Math.max(-60, Math.min(60, numero(a.dx))) * 100) / 100, dy: Math.round(Math.max(-60, Math.min(60, numero(a.dy))) * 100) / 100 }
    const i = salida.findIndex((x) => Math.abs(x.t - ajuste.t) < 0.001)
    if (i >= 0) salida[i] = ajuste
    else salida.push(ajuste)
  }
  return salida.sort((a, b) => a.t - b.t).slice(0, MAXIMO_AJUSTES)
}

// Calibraciones (v2): { id, t, puntos: [{ ref, x, y }] }, sin repetir punto conocido.
function normalizarCalibraciones(lista) {
  const ids = new Set()
  return (Array.isArray(lista) ? lista : [])
    .filter((c) => c && Number.isFinite(Number(c.t)) && Array.isArray(c.puntos))
    .map((c) => {
      const refs = new Set()
      const puntos = []
      for (const p of c.puntos) {
        if (!p || !REFS.includes(p.ref) || refs.has(p.ref) || puntos.length >= MAXIMO_PUNTOS) continue
        refs.add(p.ref)
        puntos.push({ ref: p.ref, ...punto(p) })
      }
      return { id: idValido(c.id), t: tiempo(c.t), puntos }
    })
    .filter((c) => c.puntos.length)
    .sort((a, b) => a.t - b.t)
    .slice(0, MAXIMO_CALIBRACIONES)
    .map((c) => { const id = c.id && !ids.has(c.id) ? c.id : nuevoId('c', ids); ids.add(id); return { ...c, id } })
}

// ---------- Versión 3 ----------
const entre = (v, min, max, base) => Math.min(max, Math.max(min, numero(v, base)))
const tres = (v) => Math.round(v * 1000) / 1000

// Flecha que crece: { modo, pelota, salida?, llegada? } o null (aparece entera, como antes).
function normalizarCrecer(c, desde) {
  if (!c || typeof c !== 'object' || !MODOS_CRECER.includes(c.modo)) return null
  const r = { modo: c.modo, pelota: Boolean(c.pelota) }
  if (c.modo === 'real') {
    const salida = tiempo(c.salida ?? desde)
    const llegada = numero(c.llegada, salida + 0.8) > salida + 0.05 ? tiempo(c.llegada) : tres(salida + 0.8)
    r.salida = salida
    r.llegada = llegada
  }
  return r
}

// Hueco del anillo: undefined (automático), false (sin hueco) o un número entre HUECO.minimo y HUECO.maximo.
function normalizarHueco(h) {
  if (h === false) return false
  if (typeof h !== 'number' || !Number.isFinite(h)) return undefined
  return Math.round(Math.min(HUECO.maximo, Math.max(HUECO.minimo, h)) * 100) / 100
}

// Formas de una zona en distintos momentos: [{ t, puntos }] con la misma cantidad de puntos que la base.
function normalizarClavesZona(lista, cantidad) {
  const salida = []
  for (const c of (Array.isArray(lista) ? lista : [])) {
    if (!c || !Number.isFinite(Number(c.t)) || !Array.isArray(c.puntos) || c.puntos.length !== cantidad) continue
    const clave = { t: tiempo(c.t), puntos: c.puntos.map(punto) }
    const i = salida.findIndex((x) => Math.abs(x.t - clave.t) < 0.001)
    if (i >= 0) salida[i] = clave
    else salida.push(clave)
  }
  return salida.sort((a, b) => a.t - b.t).slice(0, LIMITES.clavesZona)
}

// Texto, efectos y metros de una zona (v3).
function extrasZona(o, base) {
  const texto = cadena(o.texto, 60)
  if (texto) base.texto = texto
  const e = o.efectos
  if (e && typeof e === 'object' && (e.despliegue || e.rayado || e.pulso)) {
    base.efectos = { despliegue: Boolean(e.despliegue), rayado: Boolean(e.rayado), pulso: Boolean(e.pulso) }
  }
  if (o.medidas === true) base.medidas = true
}

function normalizarLuz(l) {
  return {
    color: COLORES_DIBUJO.includes(l?.color) ? l.color : 'blanco',
    intensidad: Math.round(entre(l?.intensidad, 0.2, 1, LUZ.intensidad) * 100) / 100,
    ancho: Math.round(entre(l?.ancho, 0.5, 2, LUZ.ancho) * 100) / 100,
  }
}

function normalizarClavesFoco(lista) {
  const salida = []
  for (const c of (Array.isArray(lista) ? lista : [])) {
    if (!c || !Number.isFinite(Number(c.t))) continue
    const clave = { t: tiempo(c.t), ...punto(c), rx: Math.round(entre(c.rx, 0.01, 0.5, 0.06) * 10000) / 10000, ry: Math.round(entre(c.ry, 0.01, 0.5, 0.1) * 10000) / 10000 }
    const i = salida.findIndex((x) => Math.abs(x.t - clave.t) < 0.001)
    if (i >= 0) salida[i] = clave
    else salida.push(clave)
  }
  return salida.sort((a, b) => a.t - b.t).slice(0, LIMITES.clavesZona)
}

// Participante de «Opciones de pase»: { punto, seguir, jugadora? }.
function normalizarParticipante(p) {
  if (!p || typeof p !== 'object' || !p.punto || typeof p.punto !== 'object') return null
  const r = { punto: punto(p.punto), seguir: idValido(p.seguir) || null }
  const j = p.jugadora ? normalizarJugadora(p.jugadora) : null
  if (j) r.jugadora = j
  return r
}

const listaIds = (v, max) => [...new Set((Array.isArray(v) ? v : []).map(idValido).filter(Boolean))].slice(0, max)

// Tramos de cámara lenta: { id, desde, hasta, velocidad }, ordenados y sin superponerse.
function normalizarLentos(lista) {
  const ids = new Set()
  const salida = []
  const crudos = (Array.isArray(lista) ? lista : [])
    .map((l) => ({ id: idValido(l?.id), desde: tiempo(l?.desde), hasta: tiempo(l?.hasta), velocidad: VELOCIDADES_LENTAS.includes(Number(l?.velocidad)) ? Number(l.velocidad) : 0.5 }))
    .filter((l) => l.hasta - l.desde >= 0.2)
    .sort((a, b) => a.desde - b.desde)
  for (const l of crudos) {
    if (salida.length >= LIMITES.lentos) break
    if (salida.length && l.desde < salida[salida.length - 1].hasta) continue
    const id = l.id && !ids.has(l.id) ? l.id : nuevoId('l', ids)
    ids.add(id)
    salida.push({ ...l, id })
  }
  return salida
}

// ¿Usa algo de la versión 3? (si no, se guarda como 2 o 1)
export function usaVersion3(d) {
  return Boolean(d?.lentos?.length || (d?.objetos || []).some((o) => TIPOS_V3.includes(o.tipo) || o.crecer || o.hueco !== undefined
    || (ZONAS.includes(o.tipo) && (o.claves?.length || o.texto || o.efectos || o.medidas))))
}

// ¿Usa algo de la versión 2? (si no, se guarda como 1)
export function usaVersion2(d) {
  return Boolean(d?.cancha || d?.calibraciones?.length || (d?.objetos || []).some((o) => o.tipo === 'ficha' || o.ajustes2d?.length || o.en2d === false
    || (o.jugadora && o.tipo !== 'nombre')))
}

function normalizarObjeto(o) {
  if (!o || typeof o !== 'object' || !TIPOS.includes(o.tipo)) return null
  const desde = tiempo(o.desde)
  const hasta = numero(o.hasta, desde + 1) > desde ? tiempo(o.hasta) : desde + 1
  const base = {
    id: idValido(o.id),
    tipo: o.tipo,
    desde,
    hasta,
    color: COLORES_DIBUJO.includes(o.color) ? o.color : 'amarillo',
    grosor: GROSORES.includes(Number(o.grosor)) ? Number(o.grosor) : 2,
  }
  if (PUNTOS[o.tipo]) {
    const [min, max] = PUNTOS[o.tipo]
    const puntos = (Array.isArray(o.puntos) ? o.puntos : []).slice(0, max).map(punto)
    if (puntos.length < min) return null
    base.puntos = puntos
    if (o.tipo === 'texto') {
      base.texto = cadena(o.texto, LIMITES.texto)
      if (!base.texto) return null
    }
    if (FLECHAS_QUE_CRECEN.includes(o.tipo)) { const c = normalizarCrecer(o.crecer, desde); if (c) base.crecer = c } // v3
    if (o.tipo === 'zona' || o.tipo === 'poligono') { // v3
      const claves = normalizarClavesZona(o.claves, puntos.length)
      if (claves.length) base.claves = claves
      extrasZona(o, base)
    }
    return base
  }
  if (o.tipo === 'foco_zona') {
    const claves = normalizarClavesFoco(o.claves)
    if (!claves.length) return null
    base.forma = FORMAS_FOCO.includes(o.forma) ? o.forma : 'circulo'
    base.claves = claves
    if (o.animado === true) base.animado = true
    return base
  }
  if (o.tipo === 'opciones_pase') {
    const pasadora = normalizarParticipante(o.pasadora), receptora = normalizarParticipante(o.receptora)
    if (!pasadora || !receptora) return null
    base.pasadora = pasadora
    base.receptora = receptora
    base.opciones = (Array.isArray(o.opciones) ? o.opciones : []).map(normalizarParticipante).filter(Boolean).slice(0, LIMITES.opciones)
    base.secuencia = o.secuencia !== false
    const h = normalizarHueco(o.hueco)
    if (h !== undefined) base.hueco = h
    return base
  }
  if (o.tipo === 'zona_lineas') {
    base.lineaA = listaIds(o.lineaA, LIMITES.linea)
    base.lineaB = listaIds(o.lineaB, LIMITES.linea).filter((id) => !base.lineaA.includes(id))
    extrasZona(o, base)
    return base
  }
  if (o.tipo === 'linea_defensiva') {
    base.jugadoras = listaIds(o.jugadoras, LIMITES.linea)
    base.rol = o.rol === 'volantes' ? 'volantes' : 'defensa'
    base.arco = o.arco === 'derecha' ? 'derecha' : 'izquierda'
    base.umbral = Math.round(entre(o.umbral, UMBRAL.minimo, UMBRAL.maximo, UMBRAL.defecto) * 10) / 10
    base.estados = Object.fromEntries(Object.entries(o.estados && typeof o.estados === 'object' ? o.estados : {})
      .filter(([id, v]) => base.jugadoras.includes(id) && ESTADOS_LINEA.includes(v) && v !== 'en_linea'))
    base.cubiertas = Object.fromEntries(Object.entries(o.cubiertas && typeof o.cubiertas === 'object' ? o.cubiertas : {})
      .filter(([id, v]) => base.jugadoras.includes(id) && v === true))
    return base
  }
  if (esSeguimiento(o.tipo)) {
    const claves = normalizarClaves(o.pista?.claves)
    if (!claves.length) return null
    base.pista = { fuente: cadena(o.pista?.fuente, 20) || 'manual', claves }
    base.efectos = {
      entrada: Boolean(o.efectos?.entrada), pulso: Boolean(o.efectos?.pulso),
      sombra: Boolean(o.efectos?.sombra), rastro: Boolean(o.efectos?.rastro),
    }
    if (o.tipo === 'nombre') base.jugadora = normalizarJugadora(o.jugadora) || { rival: true, dorsal: '', nombre: '' }
    else if (o.jugadora) { const j = normalizarJugadora(o.jugadora); if (j) base.jugadora = j } // v2
    if (o.en2d === false) base.en2d = false // v2
    const ajustes = normalizarAjustes(o.ajustes2d)
    if (ajustes.length) base.ajustes2d = ajustes // v2
    if (o.tipo === 'anillo') { const h = normalizarHueco(o.hueco); if (h !== undefined) base.hueco = h } // v3
    if (o.tipo === 'reflector') base.luz = normalizarLuz(o.luz) // v3
    return base
  }
  if (o.tipo === 'ficha') {
    if (!o.punto || typeof o.punto !== 'object') return null
    base.t = tiempo(o.t ?? desde)
    base.punto = punto(o.punto)
    base.jugadora = normalizarJugadora(o.jugadora) || { rival: false, id: '', nombre: '', dorsal: '', foto: '' }
    const ajustes = normalizarAjustes(o.ajustes2d)
    if (ajustes.length) base.ajustes2d = ajustes
    return base
  }
  if (o.tipo === 'enlace') {
    base.a = idValido(o.a)
    base.b = idValido(o.b)
    return base
  }
  // zoom
  base.escala = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, numero(o.escala, 2)))
  base.objetivo = punto(o.objetivo || { x: 0.5, y: 0.5 })
  base.seguir = idValido(o.seguir) || null
  return base
}

// Devuelve { ok, dibujo, aviso }. ok = false solo si la versión es más nueva que esta app (no se dibuja nada).
export function normalizarDibujo(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return { ok: true, dibujo: dibujoVacio(), aviso: '' }
  const version = numero(datos.version, VERSION_DIBUJO)
  if (version > VERSION_DIBUJO) {
    return { ok: false, dibujo: dibujoVacio(), aviso: 'Estos dibujos son de una versión más nueva de la app: actualizá la página.' }
  }
  const objetos = []
  const usados = new Set()
  for (const crudo of (Array.isArray(datos.objetos) ? datos.objetos : []).slice(0, LIMITES.objetos)) {
    const o = normalizarObjeto(crudo)
    if (!o) continue
    if (!o.id || usados.has(o.id)) o.id = nuevoId('o', usados)
    usados.add(o.id)
    objetos.push(o)
  }
  // Enlaces y zooms que apuntan a objetos de seguimiento que no están.
  const seguidos = new Set(objetos.filter((o) => esSeguimiento(o.tipo)).map((o) => o.id))
  const limpios = limpiarReferencias(objetos.filter((o) => o.tipo !== 'enlace' || (seguidos.has(o.a) && seguidos.has(o.b) && o.a !== o.b))
    .map((o) => (o.tipo === 'zoom' && o.seguir && !seguidos.has(o.seguir) ? { ...o, seguir: null } : o)), seguidos)

  const idsPausa = new Set()
  const pausas = (Array.isArray(datos.pausas) ? datos.pausas : [])
    .filter((p) => p && p.t !== null && p.t !== '' && Number.isFinite(Number(p.t)))
    .map((p) => ({ id: idValido(p.id), t: tiempo(p.t), duracion: Math.min(PAUSA_MAXIMA, Math.max(PAUSA_MINIMA, numero(p.duracion, PAUSA_POR_DEFECTO))) }))
    .sort((a, b) => a.t - b.t)
    .slice(0, LIMITES.pausas)
    .map((p) => { const id = p.id && !idsPausa.has(p.id) ? p.id : nuevoId('p', idsPausa); idsPausa.add(id); return { ...p, id } })

  const idsSub = new Set()
  const subtitulos = (Array.isArray(datos.subtitulos) ? datos.subtitulos : [])
    .map((s) => ({ id: idValido(s?.id), desde: tiempo(s?.desde), hasta: tiempo(s?.hasta), texto: cadena(s?.texto, LIMITES.texto) }))
    .filter((s) => s.texto && s.hasta > s.desde)
    .sort((a, b) => a.desde - b.desde)
    .slice(0, LIMITES.subtitulos)
    .map((s) => { const id = s.id && !idsSub.has(s.id) ? s.id : nuevoId('s', idsSub); idsSub.add(id); return { ...s, id } })

  const clip = datos.clip && Number.isFinite(Number(datos.clip.inicio)) && Number.isFinite(Number(datos.clip.fin))
    ? { inicio: tiempo(datos.clip.inicio), fin: tiempo(datos.clip.fin) } : null
  const dibujo = { version: 1, clip, objetos: limpios, pausas, subtitulos }
  // v2: medidas de la cancha y calibraciones (sin calibraciones, las medidas no hacen falta).
  const calibraciones = normalizarCalibraciones(datos.calibraciones)
  if (calibraciones.length || (datos.cancha && typeof datos.cancha === 'object')) dibujo.cancha = medidasCancha(datos.cancha)
  if (calibraciones.length) dibujo.calibraciones = calibraciones
  const lentos = normalizarLentos(datos.lentos) // v3
  if (lentos.length) dibujo.lentos = lentos
  if (usaVersion3(dibujo)) dibujo.version = 3
  else if (usaVersion2(dibujo)) dibujo.version = 2
  return { ok: true, dibujo, aviso: '' }
}

// v3: las zonas entre líneas, las líneas defensivas y las opciones de pase apuntan a jugadoras seguidas. Si una ya no
// está, sale de la lista (la opción queda quieta donde se marcó). Si la lista queda corta, el dibujo no se puede armar.
export function limpiarReferencias(objetos, seguidos = new Set(objetos.filter((o) => esSeguimiento(o.tipo)).map((o) => o.id))) {
  const salida = []
  for (const o of objetos) {
    if (o.tipo === 'zona_lineas') {
      const lineaA = o.lineaA.filter((id) => seguidos.has(id)), lineaB = o.lineaB.filter((id) => seguidos.has(id))
      if (!lineaA.length || !lineaB.length || lineaA.length + lineaB.length < 3) continue
      salida.push({ ...o, lineaA, lineaB })
    } else if (o.tipo === 'linea_defensiva') {
      const jugadoras = o.jugadoras.filter((id) => seguidos.has(id))
      if (jugadoras.length < 2) continue
      const quedan = (m) => Object.fromEntries(Object.entries(m || {}).filter(([id]) => jugadoras.includes(id)))
      salida.push({ ...o, jugadoras, estados: quedan(o.estados), cubiertas: quedan(o.cubiertas) })
    } else if (o.tipo === 'opciones_pase') {
      const sin = (p) => (p.seguir && !seguidos.has(p.seguir) ? { ...p, seguir: null } : p)
      salida.push({ ...o, pasadora: sin(o.pasadora), receptora: sin(o.receptora), opciones: o.opciones.map(sin) })
    } else salida.push(o)
  }
  return salida
}

// Bytes del JSON (lo que controla la base: máximo 200 KB).
export function tamanoDibujo(dibujo) {
  const texto = JSON.stringify(dibujo)
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(texto).length : texto.length
}

export function excedeTamano(dibujo) {
  return tamanoDibujo(dibujo) > LIMITES.bytes
}
