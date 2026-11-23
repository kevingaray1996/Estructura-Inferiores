// Botonera colectiva de Análisis (etapa 1, docs/analisis-etapa1.md): momentos que duran (inicio y fin), sin jugadora,
// marcados desde el punto de vista del «equipo analizado». El espejo (lo que hacía el otro equipo) se calcula acá, al
// consultar: nunca se guardan dos acciones por marca.
import { reglasDe } from './catalogoAcciones.js'

export const NOMBRE_CLUB = 'Comunicaciones'

export const GRUPOS_COLECTIVA = Object.freeze([
  ['con_pelota', 'Con pelota'],
  ['sin_pelota', 'Sin pelota'],
  ['pelota_parada', 'Pelota parada'],
  ['charla', 'Charla'],
])

// Teclas por defecto de la colectiva (se guardan en cada compu, aparte de las de la individual).
export const CLAVE_ATAJOS_COLECTIVA = 'analisis_atajos_colectiva_v1'
export const ATAJOS_COLECTIVA_POR_DEFECTO = Object.freeze({
  'Salida': 's',
  'Ataque posicional': 'a',
  'Transición ofensiva': 'o',
  'Presión alta': 'p',
  'Defensa organizada': 'd',
  'Transición defensiva': 't',
  'Salida rival': 'r',
  'Córner a favor': 'c',
  'Córner en contra': 'v',
  'Tiro libre a favor': 'l',
  'Tiro libre en contra': 'k',
  'Error defensivo': 'e',
  'Acción destacada': 'h',
})

// Teclas que nunca son de un botón: video, ayuda y marcador (como en la individual) y Enter (cierra el momento).
const NO_ASIGNABLES = new Set([' ', '?', 'g', 'y', 'x'])

function almacenLocal() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function leerAtajosColectiva(almacen = almacenLocal()) {
  try {
    const guardado = JSON.parse(almacen?.getItem(CLAVE_ATAJOS_COLECTIVA) || 'null')
    if (!guardado || typeof guardado !== 'object') return { ...ATAJOS_COLECTIVA_POR_DEFECTO }
    const mapa = {}, usadas = new Set()
    for (const [accion, tecla] of Object.entries(guardado)) {
      const t = typeof tecla === 'string' ? tecla.toLowerCase() : ''
      if (t.length === 1 && !NO_ASIGNABLES.has(t) && !usadas.has(t)) { mapa[accion] = t; usadas.add(t) }
    }
    return mapa
  } catch {
    return { ...ATAJOS_COLECTIVA_POR_DEFECTO }
  }
}

export function guardarAtajosColectiva(mapa, almacen = almacenLocal()) {
  try { almacen?.setItem(CLAVE_ATAJOS_COLECTIVA, JSON.stringify(mapa)); return true } catch { return false }
}

export function esTipoColectivo(catalogo, codigo) {
  return catalogo?.porCodigo?.[codigo]?.botonera === 'colectiva'
}

// Una acción es un «momento» si su tipo es colectivo. Si el catálogo todavía no lo sabe (por ejemplo, antes de leerlo),
// el fin cargado la delata: las individuales nunca tienen fin.
export function esMomento(evento, catalogo) {
  return esTipoColectivo(catalogo, evento?.tipo) || (evento?.segundo_fin !== null && evento?.segundo_fin !== undefined)
}

// Separa las acciones de un análisis: individuales (con jugadora) y momentos colectivos.
export function separarAcciones(eventos, catalogo) {
  const individuales = [], momentos = []
  for (const e of eventos || []) (esMomento(e, catalogo) ? momentos : individuales).push(e)
  return { individuales, momentos }
}

// ---------- Equipos ----------

// Nombres del equipo analizado y del otro. Propio: Comunicaciones contra el rival (o al revés si se analiza al rival).
// Scouting: local contra visitante, según cuál se analiza.
export function equiposDelAnalisis(analisis, club = NOMBRE_CLUB) {
  if (!analisis) return { analizado: club, otro: 'Rival', scouting: false }
  if (analisis.tipo_partido === 'scouting') {
    const local = analisis.equipo_local || 'Local', visitante = analisis.equipo_visitante || 'Visitante'
    return analisis.equipo_analizado === 'visitante'
      ? { analizado: visitante, otro: local, scouting: true }
      : { analizado: local, otro: visitante, scouting: true }
  }
  const rival = analisis.partido_calendario?.rival || analisis.rival || 'Rival'
  return analisis.equipo_analizado === 'rival'
    ? { analizado: rival, otro: club, scouting: false }
    : { analizado: club, otro: rival, scouting: false }
}

export const esScouting = (analisis) => analisis?.tipo_partido === 'scouting'

// Lista de análisis: tipo ('todos' | 'propio' | 'scouting') y texto de rival (busca en rival y en los dos equipos).
export function filtrarAnalisis(lista, { tipo = 'todos', rival = '' } = {}) {
  const texto = normalizarTexto(rival)
  return (lista || []).filter((a) => {
    if (tipo === 'scouting' && !esScouting(a)) return false
    if (tipo === 'propio' && esScouting(a)) return false
    if (!texto) return true
    return [a.rival, a.partido_calendario?.rival, a.equipo_local, a.equipo_visitante]
      .some((n) => normalizarTexto(n).includes(texto))
  })
}

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Valida el formulario de scouting. Devuelve { ok: true, registro } o { ok: false, motivo }.
export function validarScouting({ local, visitante, analizado, fecha, categoriaId, videoUrl }, esYoutubeValido = () => true) {
  const l = String(local || '').trim(), v = String(visitante || '').trim()
  if (!l || !v) return { ok: false, motivo: 'Completá el equipo local y el visitante.' }
  if (l.length > 60 || v.length > 60) return { ok: false, motivo: 'Cada nombre de equipo puede tener hasta 60 letras.' }
  if (normalizarTexto(l) === normalizarTexto(v)) return { ok: false, motivo: 'El local y el visitante no pueden ser el mismo equipo.' }
  if (!['local', 'visitante'].includes(analizado)) return { ok: false, motivo: 'Elegí qué equipo se analiza.' }
  if (!categoriaId) return { ok: false, motivo: 'Elegí la categoría que va a usar este análisis.' }
  const url = String(videoUrl || '').trim()
  if (url && !esYoutubeValido(url)) return { ok: false, motivo: 'Ingresá un enlace válido de YouTube.' }
  return {
    ok: true,
    registro: {
      tipo_partido: 'scouting',
      equipo_local: l,
      equipo_visitante: v,
      equipo_analizado: analizado,
      rival: analizado === 'local' ? l : v,
      fecha: fecha || null,
      categoria_id: categoriaId,
      partido_calendario_id: null,
      video_url: url || null,
    },
  }
}

// ---------- Espejo ----------

// Lo que estaba haciendo el otro equipo en ese momento, o null si el botón no tiene espejo.
export function espejoDe(momento, catalogo) {
  const espejo = reglasDe(catalogo, momento?.tipo).espejo
  if (!espejo || !esTipoColectivo(catalogo, espejo)) return null
  return { ...momento, id: `${momento.id}:espejo`, tipo: espejo, origen: momento.tipo, origenId: momento.id, equipo: 'otro' }
}

// Momentos vistos desde un equipo: 'analizado' (como se marcaron) u 'otro' (los espejos; los que no tienen, no
// aparecen).
export function momentosDesde(momentos, catalogo, vista = 'analizado') {
  if (vista === 'otro') return (momentos || []).map((m) => espejoDe(m, catalogo)).filter(Boolean)
  return (momentos || []).map((m) => ({ ...m, equipo: 'analizado' }))
}

// ---------- Eventos dentro de un clip ----------

const finDe = (m) => Number(m.segundo_fin ?? m.segundo)

// Acciones individuales que caen dentro del momento (bordes incluidos), en orden.
export function eventosEnClip(momento, eventos) {
  if (!momento) return []
  const desde = Number(momento.segundo), hasta = finDe(momento)
  return (eventos || [])
    .filter((e) => Number(e.segundo) >= desde && Number(e.segundo) <= hasta)
    .sort((a, b) => Number(a.segundo) - Number(b.segundo))
}

// Todos los cruces momento → acciones individuales. Base de las estadísticas cruzadas y las playlists (etapa 2).
export function crucesDeClips(momentos, eventos) {
  const ordenados = [...(eventos || [])].sort((a, b) => Number(a.segundo) - Number(b.segundo))
  return (momentos || []).map((momento) => ({ momento, eventos: eventosEnClip(momento, ordenados) }))
}

// Texto corto de los eventos de un clip: «Pase + (N.º 8) · Remate (N.º 11)».
export function resumenEventosClip(eventos, { etiqueta = (t) => t, dorsal = () => null } = {}) {
  return (eventos || []).map((e) => {
    const d = dorsal(e.jugador_id)
    return d ? `${etiqueta(e.tipo)} (N.º ${d})` : etiqueta(e.tipo)
  }).join(' · ')
}

// ---------- Grabación (abrir y cerrar un momento) ----------

// Abre un momento en el segundo actual del video.
export function abrirGrabacion(tipo, segundo, catalogo) {
  const duracion = reglasDe(catalogo, tipo).duracion_defecto || 10
  return { tipo, inicio: Math.max(0, Math.floor(Number(segundo) || 0)), duracion }
}

// Fin al cerrar: el segundo actual si ya pasó el inicio; si no (video en pausa o volvió atrás), la duración por defecto.
export function cerrarGrabacion(grabacion, segundoActual) {
  const actual = Math.floor(Number(segundoActual))
  const fin = Number.isFinite(actual) && actual > grabacion.inicio ? actual : grabacion.inicio + grabacion.duracion
  return { tipo: grabacion.tipo, segundo: grabacion.inicio, segundo_fin: fin }
}

// Si no se cierra a mano, se cierra sola al llegar a la duración por defecto.
export function debeCerrarseSola(grabacion, segundoActual) {
  return Boolean(grabacion) && Number(segundoActual) >= grabacion.inicio + grabacion.duracion
}

// Segundos que lleva abierta (nunca negativo).
export function segundosGrabando(grabacion, segundoActual) {
  return grabacion ? Math.max(0, Math.floor(Number(segundoActual) || 0) - grabacion.inicio) : 0
}
