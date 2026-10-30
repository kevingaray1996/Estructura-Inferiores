import { validarPizarra } from './pizarra.js'
export const CAMPOS_BLOQUE = ['objetivo', 'duracion', 'indicaciones']
export const CAMPOS_EJERCICIO = ['objetivo', 'duracion', 'series', 'repeticiones', 'materiales', 'indicaciones', 'imagen_url', 'link_video', 'pizarra']
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

export function nuevoEjercicio(biblioteca) {
  return {
    id: crypto.randomUUID(), biblioteca_id: biblioteca?.id || null,
    nombre: biblioteca ? biblioteca.contenido || 'Ejercicio de biblioteca' : '',
    objetivo: '', duracion: null, series: '', repeticiones: '', materiales: '',
    indicaciones: biblioteca?.descripcion || '', notas_internas: '', visible: false,
    imagen_url: biblioteca?.imagen_url || '', link_video: biblioteca?.link_video || '',
    pizarra: biblioteca?.pizarra ? validarPizarra(structuredClone(biblioteca.pizarra)) : null,
    pizarra_miniatura: biblioteca?.pizarra_miniatura || '',
    campos_publicos: CAMPOS_EJERCICIO.filter(c => c !== 'pizarra'),
  }
}

export function nuevoBloque() {
  return { id: crypto.randomUUID(), nombre: '', objetivo: '', duracion: null, indicaciones: '',
    notas_internas: '', visible: false, campos_publicos: [...CAMPOS_BLOQUE], ejercicios: [] }
}

export function nuevaSesion(fecha, categoriaId) {
  return { categoria_id: categoriaId, fecha, hora: '', lugar: '', objetivo: '', tipo: 'entrenamiento',
    responsable: '', observaciones_internas: '', estado: 'borrador', entrenamiento_real_id: null, bloques: [] }
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

function prepararItem(item, esBloque) {
  const campos = esBloque ? CAMPOS_BLOQUE : CAMPOS_EJERCICIO
  const base = {
    id: texto(item.id), nombre: texto(item.nombre), objetivo: texto(item.objetivo), duracion: duracion(item.duracion),
    indicaciones: texto(item.indicaciones), notas_internas: texto(item.notas_internas), visible: item.visible === true,
    campos_publicos: campos.filter((c) => item.campos_publicos?.includes(c)),
  }
  if (esBloque) return { ...base, ejercicios: (item.ejercicios || []).map((e) => prepararItem(e, false)) }
  if (item.biblioteca_id && !UUID.test(item.biblioteca_id)) throw new Error('Referencia de biblioteca inválida.')
  return { ...base, biblioteca_id: item.biblioteca_id || null, series: texto(item.series), repeticiones: texto(item.repeticiones),
    materiales: texto(item.materiales), imagen_url: texto(item.imagen_url), link_video: texto(item.link_video),
    pizarra: item.pizarra ? validarPizarra(item.pizarra) : null,
    pizarra_miniatura: item.pizarra_miniatura || '' }
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
export function contenidoVisible(sesiones, categoriaId, fecha) {
  return (Array.isArray(sesiones) ? sesiones : []).filter((s) => s.categoria_id === categoriaId && s.fecha === fecha)
    .map((s) => ({ ...s, bloques: (Array.isArray(s.bloques) ? s.bloques : []).filter((b) =>
      texto(b.nombre).trim() || texto(b.objetivo).trim() || b.duracion || texto(b.indicaciones).trim() || b.ejercicios?.length) }))
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
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para planificar esta categoría.'
  return error?.message || 'No se pudo completar la operación. Revisá la conexión y recargá antes de reintentar.'
}

export function enlaceSeguro(url) {
  try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : null } catch { return null }
}
