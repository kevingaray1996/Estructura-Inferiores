// Formato de los dibujos de un clip (etapa 4, docs/analisis-etapa4.md). Lógica pura: valida y ordena el JSON antes de
// guardarlo y al leerlo, para que un dato raro nunca rompa la reproducción.
import { recortar01 } from './coordenadas.js'

export const VERSION_DIBUJO = 1
export const LIMITES = Object.freeze({
  objetos: 200, claves: 600, pausas: 50, subtitulos: 50, puntos: 60, texto: 140, bytes: 200 * 1024,
})
export const COLORES_DIBUJO = Object.freeze(['amarillo', 'blanco', 'rojo', 'azul'])
export const GROSORES = Object.freeze([1, 2, 3])
export const TIPOS_FIJOS = Object.freeze(['pase_bajo', 'pase_alto', 'movimiento', 'linea', 'zona', 'poligono', 'texto'])
export const TIPOS_SEGUIMIENTO = Object.freeze(['anillo', 'foco', 'nombre'])
export const TIPOS = Object.freeze([...TIPOS_FIJOS, ...TIPOS_SEGUIMIENTO, 'enlace', 'zoom'])
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
    version: VERSION_DIBUJO,
    clip: clip ? { inicio: tiempo(clip.inicio), fin: tiempo(clip.fin) } : null,
    objetos: [], pausas: [], subtitulos: [],
  }
}

export function estaVacio(dibujo) {
  return !dibujo || (!dibujo.objetos?.length && !dibujo.pausas?.length && !dibujo.subtitulos?.length)
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
  const limpios = objetos.filter((o) => o.tipo !== 'enlace' || (seguidos.has(o.a) && seguidos.has(o.b) && o.a !== o.b))
    .map((o) => (o.tipo === 'zoom' && o.seguir && !seguidos.has(o.seguir) ? { ...o, seguir: null } : o))

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
  return { ok: true, dibujo: { version: VERSION_DIBUJO, clip, objetos: limpios, pausas, subtitulos }, aviso: '' }
}

// Bytes del JSON (lo que controla la base: máximo 200 KB).
export function tamanoDibujo(dibujo) {
  const texto = JSON.stringify(dibujo)
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(texto).length : texto.length
}

export function excedeTamano(dibujo) {
  return tamanoDibujo(dibujo) > LIMITES.bytes
}
