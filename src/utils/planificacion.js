import { validarPizarra } from './pizarra.js'
import { demoValida } from './biblioteca.js'
export const CAMPOS_BLOQUE = ['objetivo', 'duracion', 'indicaciones']
// Campos que se pueden compartir en Wellness. Cancha: los de siempre. Gimnasio (etapa E): series, repeticiones, carga,
// técnica y demostración. La base (planificacion_privado.item_valido) acepta los mismos.
export const CAMPOS_EJERCICIO = ['objetivo', 'duracion', 'series', 'repeticiones', 'materiales', 'indicaciones', 'imagen_url', 'link_video', 'pizarra']
export const CAMPOS_EJERCICIO_GIMNASIO = ['objetivo', 'duracion', 'series', 'repeticiones', 'carga', 'tecnica', 'demostracion', 'indicaciones']
export const CAMPOS_PUBLICABLES = [...new Set([...CAMPOS_EJERCICIO, ...CAMPOS_EJERCICIO_GIMNASIO])]
export const AMBITOS_BLOQUE = { gimnasio: 'Gimnasio', cancha: 'Cancha' }
export const camposDe = ambito => ambito === 'gimnasio' ? CAMPOS_EJERCICIO_GIMNASIO : CAMPOS_EJERCICIO
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (valor) => typeof valor === 'string' ? valor : ''

export function fechaArgentina(ahora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ahora).map((p) => [p.type, p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false
  const d = new Date(`${fecha}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

export function sumarDias(fecha, dias) {
  if (!fechaValida(fecha)) throw new Error('Fecha inválida.')
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function inicioSemana(fecha) {
  if (!fechaValida(fecha)) throw new Error('Fecha inválida.')
  return sumarDias(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7))
}

export function puedePlanificar(perfil, categoriaId = perfil?.categoria_id) {
  return perfil?.rol === 'coordinacion' ||
    (['tecnico', 'preparador_fisico'].includes(perfil?.rol) && Boolean(perfil.categoria_id) && perfil.categoria_id === categoriaId)
}

// Copia de un ejercicio de la biblioteca (o tarea libre si no hay). La sesión guarda su propia copia: cambiar la
// biblioteca después no la modifica. Los de gimnasio traen técnica, músculos, material y demostración.
export function nuevoEjercicio(biblioteca, ambito = null) {
  const gimnasio = (biblioteca?.ambito || ambito) === 'gimnasio'
  const base = {
    id: crypto.randomUUID(), biblioteca_id: biblioteca?.id || null,
    nombre: biblioteca ? biblioteca.contenido || 'Ejercicio de biblioteca' : '',
    objetivo: biblioteca?.objetivo || '', duracion: biblioteca?.duracion_minutos ?? null, series: '', repeticiones: '', materiales: '',
    indicaciones: biblioteca?.descripcion || '', notas_internas: '', visible: Boolean(biblioteca), // de la biblioteca: visible por defecto
    imagen_url: biblioteca?.imagen_url || '', link_video: biblioteca?.link_video || '',
    pizarra: biblioteca?.pizarra ? validarPizarra(structuredClone(biblioteca.pizarra)) : null,
    pizarra_miniatura: biblioteca?.pizarra_miniatura || '',
    campos_publicos: CAMPOS_EJERCICIO.filter(c => c !== 'pizarra'),
  }
  if (!gimnasio) return base
  const demostracion = biblioteca?.demo_url && demoValida(biblioteca.demo_tipo, biblioteca.demo_url)
    ? { tipo: biblioteca.demo_tipo, url: biblioteca.demo_url, credito: biblioteca.demo_credito || '' } : null
  return { ...base, pizarra: null, pizarra_miniatura: '', imagen_url: '', link_video: '', carga: '', tecnica: biblioteca?.tecnica || '',
    musculos: [...(biblioteca?.musculos || [])], material: [...(biblioteca?.material || [])], materiales: (biblioteca?.material || []).join(', '),
    demostracion, campos_publicos: ['series', 'repeticiones', 'carga', 'tecnica', 'indicaciones', ...(demostracion ? ['demostracion'] : [])] }
}

// Bloque con ámbito (gimnasio o cancha) o libre (sin ámbito).
export function nuevoBloque(ambito = null) {
  return { id: crypto.randomUUID(), nombre: AMBITOS_BLOQUE[ambito] || '', objetivo: '', duracion: null, indicaciones: '',
    notas_internas: '', visible: false, campos_publicos: [...CAMPOS_BLOQUE], ejercicios: [], ...(AMBITOS_BLOQUE[ambito] ? { ambito } : {}) }
}

export function nuevaSesion(fecha, categoriaId) {
  return { categoria_id: categoriaId, fecha, hora: '', lugar: '', objetivo: '', tipo: 'entrenamiento',
    responsable: '', observaciones_internas: '', estado: 'borrador', entrenamiento_real_id: null, bloques: [] }
}
// Entrenamiento nuevo (etapa E): Bloque 1 Gimnasio y Bloque 2 Cancha; se pueden sumar bloques libres.
export function nuevoEntrenamiento(fecha, categoriaId) {
  return { ...nuevaSesion(fecha, categoriaId), bloques: [nuevoBloque('gimnasio'), nuevoBloque('cancha')] }
}

export function moverElemento(elementos, desde, hasta) {
  if (desde < 0 || hasta < 0 || desde >= elementos.length || hasta >= elementos.length) return elementos
  const copia = [...elementos]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

export function copiarSesion(sesion, fecha) {
  return { ...nuevaSesion(fecha, sesion.categoria_id), ...structuredClone(sesion),
    id: undefined, revision: undefined, fecha, estado: 'borrador', entrenamiento_real_id: null }
}

function duracion(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0 || n > 1440) throw new Error('La duración debe ser mayor que 0 y de hasta 1440 minutos, o quedar vacía.')
  return n
}

const lista = v => (Array.isArray(v) ? v : []).map(x => texto(x).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
function prepararItem(item, esBloque) {
  const campos = esBloque ? CAMPOS_BLOQUE : CAMPOS_PUBLICABLES
  const base = {
    id: texto(item.id), nombre: texto(item.nombre), objetivo: texto(item.objetivo), duracion: duracion(item.duracion),
    indicaciones: texto(item.indicaciones), notas_internas: texto(item.notas_internas), visible: item.visible === true,
    campos_publicos: campos.filter((c) => item.campos_publicos?.includes(c)),
  }
  if (esBloque) return { ...base, ...(AMBITOS_BLOQUE[item.ambito] ? { ambito: item.ambito } : {}), ejercicios: (item.ejercicios || []).map((e) => prepararItem(e, false)) }
  if (item.biblioteca_id && !UUID.test(item.biblioteca_id)) throw new Error('Referencia de biblioteca inválida.')
  return { ...base, biblioteca_id: item.biblioteca_id || null, series: texto(item.series), repeticiones: texto(item.repeticiones),
    materiales: texto(item.materiales), imagen_url: texto(item.imagen_url), link_video: texto(item.link_video),
    pizarra: item.pizarra ? validarPizarra(item.pizarra) : null,
    pizarra_miniatura: item.pizarra_miniatura || '',
    // Gimnasio (etapa E): solo si vienen, para no cambiar las sesiones viejas.
    ...(item.carga != null ? { carga: texto(item.carga).slice(0, 80) } : {}),
    ...(item.tecnica != null ? { tecnica: texto(item.tecnica).slice(0, 2000) } : {}),
    ...(item.musculos != null ? { musculos: lista(item.musculos) } : {}),
    ...(item.material != null ? { material: lista(item.material) } : {}),
    ...(item.demostracion !== undefined ? { demostracion: item.demostracion && demoValida(item.demostracion.tipo, item.demostracion.url)
      ? { tipo: item.demostracion.tipo, url: item.demostracion.url, credito: texto(item.demostracion.credito).slice(0, 200) } : null } : {}) }
}

export function prepararSesion(sesion) {
  if (!UUID.test(sesion.categoria_id || '') || !fechaValida(sesion.fecha)) throw new Error('Elegí una categoría y una fecha válidas.')
  if (!['entrenamiento', 'descanso', 'partido'].includes(sesion.tipo) || !['borrador', 'publicado'].includes(sesion.estado)) throw new Error('Estado o jornada inválidos.')
  if (sesion.id && (!UUID.test(sesion.id) || !Number.isSafeInteger(sesion.revision) || sesion.revision < 1)) throw new Error('Recargá la sesión antes de editarla: falta su revisión.')
  if (sesion.entrenamiento_real_id && !UUID.test(sesion.entrenamiento_real_id)) throw new Error('Entrenamiento registrado inválido.')
  if (sesion.hora && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(sesion.hora)) throw new Error('Horario inválido.')
  return { id: sesion.id || null, categoria_id: sesion.categoria_id, fecha: sesion.fecha,
    hora: sesion.hora || null, lugar: texto(sesion.lugar), objetivo: texto(sesion.objetivo), tipo: sesion.tipo,
    responsable: texto(sesion.responsable), observaciones_internas: texto(sesion.observaciones_internas),
    estado: sesion.estado, entrenamiento_real_id: sesion.entrenamiento_real_id || null,
    bloques: (sesion.bloques || []).map((b) => prepararItem(b, true)) }
}

export async function cargarSemana(cliente, categoriaId, lunes) {
  const { data, error } = await cliente.from('planificacion_sesiones').select('*')
    .eq('categoria_id', categoriaId).gte('fecha', lunes).lte('fecha', sumarDias(lunes, 6))
    .order('fecha').order('hora', { nullsFirst: true }).order('id')
  if (error) throw error
  return data || []
}

export async function guardarSesion(cliente, sesion) {
  let payload
  try { payload = prepararSesion(sesion) } catch (error) { error.code = 'VALIDACION_LOCAL'; throw error }
  const { data, error } = await cliente.rpc('guardar_planificacion_sesion', {
    p_sesion: payload, p_revision: payload.id ? sesion.revision : null,
  })
  if (error) throw error
  if (!data?.id || !Number.isSafeInteger(data.revision) || data.revision < 1) {
    const e = new Error('No se pudo confirmar el guardado. Recargá la semana antes de intentar nuevamente.')
    e.code = 'RESULTADO_INCIERTO'
    throw e
  }
  return data
}

export async function eliminarSesion(cliente, sesion) {
  prepararSesion(sesion)
  if (!sesion.id) throw new Error('La sesión todavía no está guardada.')
  const { error } = await cliente.rpc('eliminar_planificacion_sesion', { p_id: sesion.id, p_revision: sesion.revision })
  if (error) throw error
}

export async function copiarSemana(cliente, categoriaId, origen, destino) {
  if (!UUID.test(categoriaId || '') || inicioSemana(origen) !== origen || inicioSemana(destino) !== destino || origen === destino) throw new Error('Elegí una semana de destino diferente.')
  const { data, error } = await cliente.rpc('copiar_planificacion_semana', {
    p_categoria_id: categoriaId, p_origen: origen, p_destino: destino,
  })
  if (error) throw error
  return data
}

// Defensa adicional de presentación. La separación de datos privados se realiza en la RPC.
// Aviso del editor: un bloque que se comparte con las jugadoras pero que en Wellness no mostraría ejercicios.
export function avisoBloque(b) {
  if (b?.visible !== true) return ''
  const ejercicios = Array.isArray(b.ejercicios) ? b.ejercicios : []
  if (ejercicios.length && !ejercicios.some((e) => e.visible === true)) return 'Este bloque se comparte, pero ningún ejercicio está visible: las jugadoras no van a ver ninguno. En cada uno, abrí "Editar" y marcá "Compartir este ejercicio al publicar".'
  if (!ejercicios.length && !texto(b.objetivo).trim() && !texto(b.indicaciones).trim()) return 'Este bloque se comparte, pero no tiene ejercicios ni indicaciones: en Wellness no se va a mostrar.'
  return ''
}
// Un bloque sin ejercicios ni texto para leer (solo nombre o duración) no se muestra en Wellness.
export const bloqueConContenido = (b) => Boolean(texto(b?.objetivo).trim() || texto(b?.indicaciones).trim() || (Array.isArray(b?.ejercicios) && b.ejercicios.length))
export function contenidoVisible(sesiones, categoriaId, fecha) {
  return (Array.isArray(sesiones) ? sesiones : []).filter((s) => s.categoria_id === categoriaId && s.fecha === fecha)
    .map((s) => ({ ...s, bloques: (Array.isArray(s.bloques) ? s.bloques : []).filter(bloqueConContenido) }))
    .filter((s) => s.bloques.length > 0)
}

export async function cargarEntrenamientoHoy(cliente, categoriaId, jugadoraId) {
  if (!UUID.test(categoriaId || '') || !UUID.test(jugadoraId || '')) return []
  const { data, error } = await cliente.rpc('planificacion_publica_hoy', { p_categoria_id: categoriaId, p_jugadora_id: jugadoraId })
  if (error) throw error
  return contenidoVisible(data, categoriaId, fechaArgentina())
}

export function mensajePlanificacion(error) {
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error?.code)) return 'Falta aplicar la migración de planificación semanal en Supabase. No se modificaron datos.'
  if (error?.code === '40001') return 'Otra persona modificó o eliminó esta sesión. Recargá la versión guardada; tus cambios no se sobrescribieron.'
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para planificar esta categoría. Se conservó el formulario; actualizá tu sesión o perfil y recargá antes de reintentar.'
  return error?.message || 'No se pudo completar la operación. Revisá la conexión y recargá antes de reintentar.'
}

export function enlaceSeguro(url) {
  try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : null } catch { return null }
}

// Etapa E: cambios de un ejercicio de la sesión que también pueden ir a la biblioteca. Series, repeticiones, carga,
// notas y lo que ven las jugadoras son siempre de ese día.
const CAMPOS_COMPARTIDOS = ['nombre', 'objetivo', 'duracion', 'indicaciones', 'imagen_url', 'link_video', 'pizarra', 'tecnica', 'musculos', 'material', 'demostracion']
export function cambiaLaBiblioteca(antes, despues) {
  return CAMPOS_COMPARTIDOS.some(c => JSON.stringify(antes?.[c] ?? null) !== JSON.stringify(despues?.[c] ?? null))
}
// Datos para guardar_ejercicio_pizarra a partir del ejercicio de la sesión. Con `fila` (la de la biblioteca) conserva
// lo que la sesión no tiene (fecha, carpeta, tipo, cantidad de jugadoras).
export function datosBibliotecaDesde(e, ambito, fila = null) {
  const gimnasio = (fila?.ambito || ambito) === 'gimnasio'
  const duracion = Number(e.duracion) >= 1 ? Math.min(600, Math.round(Number(e.duracion))) : null
  return {
    ...(fila ? { fecha: fila.fecha, tipo: fila.tipo, carpeta_id: fila.carpeta_id, cantidad_jugadores: fila.cantidad_jugadores } : { ambito: gimnasio ? 'gimnasio' : 'cancha', tipo: 'ejercicio', carpeta_id: null }),
    contenido: texto(e.nombre).trim() || 'Ejercicio', descripcion: texto(e.indicaciones), objetivo: texto(e.objetivo).slice(0, 500), duracion_minutos: duracion,
    imagen_url: gimnasio ? null : e.imagen_url || null, link_video: gimnasio ? null : e.link_video || null,
    pizarra: gimnasio ? null : e.pizarra || null, pizarra_miniatura: gimnasio ? '' : e.pizarra_miniatura || '',
    musculos: gimnasio ? lista(e.musculos) : [], material: gimnasio ? lista(e.material) : [], tecnica: gimnasio ? texto(e.tecnica) : '',
    demo_tipo: gimnasio && e.demostracion ? e.demostracion.tipo : null, demo_url: gimnasio && e.demostracion ? e.demostracion.url : null,
    demo_credito: gimnasio && e.demostracion ? texto(e.demostracion.credito) : '',
  }
}

// Etapa F: Wellness muestra la sesión con sus bloques de Gimnasio y Cancha. Solo presentación: lo público lo decide la RPC.
export const ambitoBloque = (b) => (Object.hasOwn(AMBITOS_BLOQUE, b?.ambito) ? b.ambito : null)
// "4 × 8 · 20 kg": la receta del día de un ejercicio de gimnasio (lo que esté cargado).
export function recetaGimnasio(e) {
  const series = texto(e?.series).trim(), reps = texto(e?.repeticiones).trim(), carga = texto(e?.carga).trim()
  const volumen = series && reps ? `${series} × ${reps}` : series ? `${series} series` : reps ? `${reps} repeticiones` : ''
  return [volumen, carga].filter(Boolean).join(' · ')
}
export const lineasTecnica = (t) => texto(t).split('\n').map((l) => l.replace(/^\s*[-•·*]\s*/, '').trim()).filter(Boolean)
// Resumen de la sesión para la cabecera: "Gimnasio · 3 ejercicios", "Cancha · 2 tareas".
export function resumenBloques(bloques) {
  return (Array.isArray(bloques) ? bloques : []).map((b, i) => {
    const ambito = ambitoBloque(b), n = Array.isArray(b.ejercicios) ? b.ejercicios.length : 0
    const nombre = AMBITOS_BLOQUE[ambito] || texto(b.nombre).trim() || `Bloque ${i + 1}`
    const cuenta = n ? ` · ${n} ${ambito === 'gimnasio' ? (n === 1 ? 'ejercicio' : 'ejercicios') : (n === 1 ? 'tarea' : 'tareas')}` : ''
    return { ambito, texto: nombre + cuenta }
  })
}
