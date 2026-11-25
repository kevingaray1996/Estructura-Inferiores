// Equipos de Análisis (etapa 2, docs/analisis-etapa2.md): el listado es public.equipos. Cada análisis tiene dos
// lados (el equipo analizado y el otro), y cada lado es una «clave» de equipo:
//   'club'            Comunicaciones (nosotros)
//   '<uuid>'          un equipo del listado
//   'nombre:<texto>'  un nombre que no está en el listado (scouting viejo o partido sin equipo): se lee igual
// Lógica pura: no guarda nada. Un partido sin equipo elegido se junta con el equipo de mismo nombre solo al leer.
import { NOMBRE_CLUB } from './colectiva.js'

export const CLUB = 'club'

export function normalizarNombre(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase().trim()
}

// Sin la columna activo (antes de la migración) todos están activos.
export const estaActivo = (equipo) => equipo?.activo !== false

// El club (Comunicaciones) no es un rival: no se ofrece para elegir en scouting.
export const esNombreDelClub = (nombre) => normalizarNombre(nombre).includes(normalizarNombre(NOMBRE_CLUB))

// Para cargar (scouting, nuevo partido): solo los activos y nunca el club, salvo los ya elegidos. Para filtrar: todos.
export function equiposParaElegir(equipos, { elegidos = [] } = {}) {
  return (equipos || []).filter((e) => elegidos.includes(e.id) || (estaActivo(e) && !esNombreDelClub(e.nombre)))
}

// Buscador: por nombre, sin mayúsculas ni acentos.
export function buscarEquipos(equipos, texto) {
  const t = normalizarNombre(texto)
  const lista = [...(equipos || [])].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  return t ? lista.filter((e) => normalizarNombre(e.nombre).includes(t)) : lista
}

// El equipo del listado con ese nombre (comparando sin mayúsculas, acentos ni espacios de más), o null.
export function equipoPorNombre(equipos, nombre) {
  const n = normalizarNombre(nombre)
  if (!n) return null
  return (equipos || []).find((e) => normalizarNombre(e.nombre) === n) || null
}

function claveDe(id, nombre, equipos) {
  if (id) return id
  const e = equipoPorNombre(equipos, nombre)
  if (e) return e.id
  const n = normalizarNombre(nombre)
  if (n === normalizarNombre(NOMBRE_CLUB) || n === `club ${normalizarNombre(NOMBRE_CLUB)}`) return CLUB
  return n ? `nombre:${n}` : null
}

// Lados de un análisis: { analizado, otro } (claves) y, para mostrar, { local, visitante }.
export function ladosDelAnalisis(analisis, equipos) {
  if (!analisis) return { analizado: null, otro: null, local: null, visitante: null }
  if (analisis.tipo_partido === 'scouting') {
    const local = claveDe(analisis.equipo_local_id, analisis.equipo_local, equipos)
    const visitante = claveDe(analisis.equipo_visitante_id, analisis.equipo_visitante, equipos)
    return analisis.equipo_analizado === 'visitante'
      ? { analizado: visitante, otro: local, local, visitante }
      : { analizado: local, otro: visitante, local, visitante }
  }
  const cal = analisis.partido_calendario || null
  const rival = claveDe(cal?.equipo_id, cal?.rival || analisis.rival, equipos)
  const deVisitante = String(cal?.local_visitante || '').toLowerCase().startsWith('visit')
  const local = deVisitante ? rival : CLUB, visitante = deVisitante ? CLUB : rival
  return analisis.equipo_analizado === 'rival'
    ? { analizado: rival, otro: CLUB, local, visitante }
    : { analizado: CLUB, otro: rival, local, visitante }
}

// Equipo rival de un análisis (de Equipos, con sus colores), o null. En scouting, el que no es el analizado.
export function equipoRivalDe(analisis, equipos) {
  const lados = ladosDelAnalisis(analisis, equipos)
  const clave = lados.otro === CLUB ? lados.analizado : lados.otro
  return (equipos || []).find((e) => e.id === clave) || null
}

export function juegaEquipo(analisis, clave, equipos) {
  if (!clave) return true
  const { analizado, otro } = ladosDelAnalisis(analisis, equipos)
  return analizado === clave || otro === clave
}

// Biblioteca y filtros: análisis donde jugó ese equipo (scouting como local o visitante, o nuestros partidos contra él).
export function filtrarPorEquipo(lista, clave, equipos) {
  return clave ? (lista || []).filter((a) => juegaEquipo(a, clave, equipos)) : (lista || [])
}

export function nombreDeClave(clave, equipos) {
  if (!clave) return ''
  if (clave === CLUB) return NOMBRE_CLUB
  if (clave.startsWith('nombre:')) return clave.slice(7).replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase())
  return (equipos || []).find((e) => e.id === clave)?.nombre || 'Equipo'
}

// «Estrella del Sur vs Camioneros» (local primero).
export function tituloPartido(analisis, equipos) {
  if (!analisis) return ''
  if (analisis.tipo_partido === 'scouting') return `${analisis.equipo_local || 'Local'} vs ${analisis.equipo_visitante || 'Visitante'}`
  const rival = analisis.partido_calendario?.rival || analisis.rival || 'Rival'
  const { local } = ladosDelAnalisis(analisis, equipos)
  return local === CLUB ? `${NOMBRE_CLUB} vs ${rival}` : `${rival} vs ${NOMBRE_CLUB}`
}

// Fecha del análisis para ordenar (la del calendario si la tiene).
export const fechaDelAnalisis = (a) => a?.partido_calendario?.fecha || a?.fecha || ''

// Equipos que aparecen en los análisis (para elegir en el tablero por equipo), con Comunicaciones primero.
export function equiposConAnalisis(lista, equipos) {
  const claves = new Set()
  for (const a of lista || []) {
    const { analizado, otro } = ladosDelAnalisis(a, equipos)
    if (analizado) claves.add(analizado)
    if (otro) claves.add(otro)
  }
  return [...claves]
    .map((clave) => ({ clave, nombre: nombreDeClave(clave, equipos) }))
    .sort((a, b) => (a.clave === CLUB ? -1 : b.clave === CLUB ? 1 : a.nombre.localeCompare(b.nombre, 'es')))
}

// Nuevo equipo desde Análisis: nombre limpio y que no exista ya (con otra escritura).
export function validarEquipoNuevo(nombre, equipos) {
  const limpio = String(nombre || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return { ok: false, motivo: 'Escribí el nombre del equipo.' }
  if (limpio.length > 60) return { ok: false, motivo: 'El nombre puede tener hasta 60 letras.' }
  const existente = equipoPorNombre(equipos, limpio)
  if (existente) return { ok: false, motivo: `Ya existe «${existente.nombre}» en el listado.`, existente }
  if (claveDe(null, limpio, []) === CLUB) return { ok: false, motivo: `${NOMBRE_CLUB} no va en el listado de rivales.` }
  return { ok: true, nombre: limpio }
}
