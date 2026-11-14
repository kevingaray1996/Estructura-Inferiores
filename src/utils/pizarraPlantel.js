// Etapa J: jugadoras reales en la pizarra. Fichas propias vinculadas a jugadoras del plantel (foto chiquita, dorsal y
// apellido), convocadas de un partido (titulares en su lugar de la Formación, suplentes en el banco) y rivales con la
// camiseta y el número de su equipo (cargados una vez en Equipos).
// Las funciones de armado son puras (reciben datos ya leídos); las de lectura reciben el cliente de Supabase.
import { agregarElemento, esRival, FORMACIONES, limitar, lugaresFormacion, PALETA, quitarElementos } from './pizarra.js'

const COLOR = /^#[0-9a-f]{6}$/i
const URL_FOTO = /^https:\/\/[^\s"'<>]+$/i
const redondear = v => Math.round(v * 100) / 100
export const MAX_SUPLENTES = 14

// Una titular guardada en la Formación del partido (ConvocarPartido): "x,y" con x de izquierda a derecha y
// y = 0 en el arco rival y 100 en el arco propio. Devuelve el lugar en la pizarra (en %) o null si no entra en la vista.
export function lugarConvocada(doc, posicion) {
  if (typeof posicion !== 'string' || !posicion.includes(',')) return null
  const [xc, yc] = posicion.split(',').map(Number)
  if (!Number.isFinite(xc) || !Number.isFinite(yc)) return null
  const t = limitar((100 - yc) / 100, 0, 1), atacaDerecha = doc.ataque === 'derecha'
  let x
  if (doc.superficie === 'media') {
    // Media cancha: se ve el arco de la izquierda. Si es el propio, el equipo se para atrás; si es el rival, adelantado
    // (la arquera quedaría fuera de la vista).
    if (atacaDerecha) x = t * 100
    else { if (t < .15) return null; x = (1 - t) * 100 }
  } else {
    // Cancha completa: el equipo en su mitad.
    x = atacaDerecha ? t * 50 : 100 - t * 50
  }
  const y = atacaDerecha ? xc : 100 - xc
  return { x: redondear(limitar(x, 2, 98)), y: redondear(limitar(y, 4, 96)) }
}

// Banco de suplentes: una fila sobre la línea lateral de abajo, del lado propio, con lugar para el apellido.
export function lugarBanco(doc, i) {
  const paso = 6.8, x = 3 + i * paso
  return { x: redondear(doc.ataque === 'derecha' ? x : 100 - x), y: 97 }
}

const apellido = j => (j?.apellido || j?.nombre || '').trim().slice(0, 40)

// Carga las convocadas de un partido en el paso indicado. Reemplaza a las fichas propias (las rivales no se tocan).
// `citaciones`: [{ jugador_id, dorsal, titular, posicion_cancha }]; `jugadores`: plantel visible; `formacion`: la del partido.
export function cargarConvocadas(doc, { citaciones = [], jugadores = [], formacion = '4-4-2', equipo = null } = {}) {
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const propias = doc.elementos.filter(e => e.tipo === 'jugadora' && !esRival(e)).map(e => e.id)
  let siguiente = propias.length ? quitarElementos(doc, propias) : doc
  const conJugadora = citaciones.filter(c => porId.has(c.jugador_id))
  const titulares = conJugadora.filter(c => c.titular), suplentes = conJugadora.filter(c => !c.titular)
    .sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999))
  // Titulares sin lugar guardado: los lugares libres del sistema del partido (o 4-4-2).
  const sistema = Object.hasOwn(FORMACIONES, formacion) ? formacion : '4-4-2'
  const libres = lugaresFormacion(siguiente, sistema, 'propio')
  const usados = []
  const ficha = (c, lugar, extra = {}) => {
    const j = porId.get(c.jugador_id), antes = siguiente
    siguiente = agregarElemento(siguiente, 'jugadora', lugar.x, lugar.y, {
      numero: c.dorsal != null ? String(c.dorsal).slice(0, 4) : '', texto: apellido(j), vinculo: { tipo: 'jugadora', id: j.id }, ...extra })
    return siguiente !== antes
  }
  const sinLugar = []
  for (const c of titulares) {
    const lugar = lugarConvocada(siguiente, c.posicion_cancha)
    if (lugar) { ficha(c, lugar); usados.push(lugar) } else sinLugar.push(c)
  }
  for (const c of sinLugar) {
    // El lugar libre más lejano de los ya ocupados, para no encimarlas.
    const lugar = libres.filter(l => !usados.includes(l)).sort((a, b) =>
      Math.min(...usados.map(u => Math.hypot(u.x - b.x, u.y - b.y)), 999) - Math.min(...usados.map(u => Math.hypot(u.x - a.x, u.y - a.y)), 999))[0]
    if (!lugar) break
    ficha(c, lugar); usados.push(lugar)
  }
  suplentes.slice(0, MAX_SUPLENTES).forEach((c, i) => ficha(c, lugarBanco(siguiente, i), { tamano: 2.4 }))
  return equipo ? colorearRival(siguiente, equipo) : siguiente
}

// Colores de un equipo de Equipos para sus fichas (con los del rival por defecto si no los cargaron).
export function coloresEquipo(equipo) {
  return { color: COLOR.test(equipo?.color_camiseta || '') ? equipo.color_camiseta : PALETA.rival,
    tinta: COLOR.test(equipo?.color_numero || '') ? equipo.color_numero : PALETA.tintaClara }
}

// Las fichas rivales toman la camiseta y el número del equipo y quedan vinculadas a él.
export function colorearRival(doc, equipo) {
  if (!equipo?.id) return doc
  const { color, tinta } = coloresEquipo(equipo)
  let cambio = false
  const elementos = doc.elementos.map(e => {
    if (!esRival(e)) return e
    cambio = true
    return { ...e, color, tinta, vinculo: { tipo: 'rival', id: equipo.id } }
  })
  return cambio ? { ...doc, elementos } : doc
}

// Vincula (o desvincula, con null) una ficha propia a una jugadora del plantel. Pone el apellido si no tenía nombre.
export function vincularJugadora(doc, id, jugadora) {
  return { ...doc, elementos: doc.elementos.map(e => {
    if (e.id !== id || e.tipo !== 'jugadora' || esRival(e)) return e
    if (!jugadora) return { ...e, vinculo: null }
    return { ...e, vinculo: { tipo: 'jugadora', id: jugadora.id }, texto: e.texto || apellido(jugadora) }
  }) }
}

// Foto de cada ficha vinculada a una jugadora del plantel recibido. En Wellness el plantel es el de la categoría:
// una jugadora de otra categoría queda con su número, sin foto.
export function fotosDeFichas(doc, plantel = []) {
  if (!plantel.length) return null
  const porId = new Map(plantel.map(j => [j.id, j.foto_url]))
  const fotos = {}
  for (const e of doc.elementos) {
    if (e.tipo !== 'jugadora' || e.vinculo?.tipo !== 'jugadora') continue
    const url = porId.get(e.vinculo.id)
    if (typeof url === 'string' && URL_FOTO.test(url)) fotos[e.id] = url
  }
  return Object.keys(fotos).length ? fotos : null
}

// Equipo rival de la jugada (el vinculado a las fichas rivales).
export function equipoRival(doc, equipos = []) {
  const id = doc.elementos.find(e => esRival(e) && e.vinculo?.tipo === 'rival')?.vinculo.id
  return id ? equipos.find(e => e.id === id) || null : null
}

// ------------------------------------------------------------------------------------------------------------------
// Lecturas (solo con sesión; RLS limita a lo que cada rol puede ver).
export async function leerDatosPizarra(supabase, categoriaId = null) {
  const desde = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10)
  let jugadores = supabase.from('jugadores').select('id,nombre,apellido,foto_url,categoria_id').order('apellido').order('nombre')
  let partidos = supabase.from('partidos').select('id,fecha,rival,equipo_id,formacion,categoria_id').gte('fecha', desde).order('fecha', { ascending: false }).limit(40)
  if (categoriaId) { jugadores = jugadores.eq('categoria_id', categoriaId); partidos = partidos.eq('categoria_id', categoriaId) }
  const equipos = supabase.from('equipos').select('id,nombre,escudo_url,color_camiseta,color_numero').order('nombre')
  const [j, p, e] = await Promise.all([jugadores, partidos, equipos])
  const error = [j.error, p.error, e.error].find(Boolean)
  return { jugadores: j.data || [], partidos: p.data || [], equipos: e.data || [], error: error ? error.message || 'No se pudieron leer los datos del club.' : '' }
}
export async function leerCitaciones(supabase, partidoId) {
  const { data, error } = await supabase.from('citaciones').select('jugador_id,dorsal,titular,posicion_cancha').eq('partido_id', partidoId)
  if (error) throw error
  return data || []
}
