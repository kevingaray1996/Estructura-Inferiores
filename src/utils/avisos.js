// Avisos del staff: mensajes de error, días y textos de la sección Avisos y del botón de convocatoria.

const MENSAJES = {
  sin_permiso: 'No tenés permiso para esto.',
  texto_invalido: 'El mensaje tiene que tener entre 3 y 140 caracteres.',
  jugadoras_invalidas: 'Alguna jugadora elegida ya no es de esta categoría. Actualizá la lista.',
  categoria_invalida: 'Esa categoría ya no existe. Actualizá la página.',
  limite_remitente: 'Ya mandaste 5 avisos hoy. Probá mañana.',
  limite_categoria: 'Esta categoría ya recibió 10 avisos hoy. Probá mañana.',
  limite_partido: 'Ya se avisó 3 veces esta convocatoria hoy.',
  duplicado: 'Ese aviso ya se mandó hace un momento.',
  sin_convocadas: 'Guardá la convocatoria con al menos una jugadora antes de avisar.',
  partido_inexistente: 'El partido ya no existe.',
  config_invalida: 'Revisá los horarios: elegí al menos un día y las dos horas.',
  pausa_invalida: 'Revisá las fechas: «hasta» no puede ser antes que «desde».',
}

// El código viene en el mensaje del error de la base (RAISE EXCEPTION '<código>').
// accion: 'guardar' (horarios, pausas) o 'mandar' (avisos manuales y de convocatoria), para el texto genérico.
export function mensajeErrorAvisos(error, accion = 'guardar') {
  const texto = String(error?.message || '')
  const codigo = Object.keys(MENSAJES).find((c) => texto.includes(c))
  if (codigo) return MENSAJES[codigo]
  if (error?.code === '42501') return MENSAJES.sin_permiso
  if (accion === 'mandar') return 'No se pudo mandar. Revisá la conexión y probá de nuevo.'
  return 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

// Numeración ISO de la base: 1 = lunes … 7 = domingo.
export const DIAS = [
  { numero: 1, corto: 'Lun' }, { numero: 2, corto: 'Mar' }, { numero: 3, corto: 'Mié' }, { numero: 4, corto: 'Jue' },
  { numero: 5, corto: 'Vie' }, { numero: 6, corto: 'Sáb' }, { numero: 7, corto: 'Dom' },
]

const HOY = {
  dia_de_entrenamiento: 'Hoy salen: día de entrenamiento',
  sesion_publicada: 'Hoy salen: hay una sesión publicada',
  descanso: 'Hoy no salen: día de descanso',
  pausa: 'Hoy no salen: pausa',
  sin_entrenamiento: 'Hoy no salen: no es día de entrenamiento',
  inactivo: 'Avisos automáticos apagados',
}
export const textoHoy = (motivo) => HOY[motivo] || 'Sin datos de hoy'

const TIPOS = {
  wellness: 'Wellness', combinado: 'Entrenamiento y Wellness', entrenamiento: 'Entrenamiento', rpe: 'RPE',
  convocatoria: 'Convocatoria', manual: 'Mensaje',
}
export const etiquetaTipo = (tipo) => TIPOS[tipo] || tipo

// 18/11 09:10, en hora de Argentina.
export function fechaHoraCorta(iso) {
  if (!iso) return ''
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

// «a todo el plantel de Primera (20 jugadoras)» o «a 3 jugadoras de Primera».
export function destinoTexto({ todas, cantidad, categoria }) {
  if (todas) return `Va a todo el plantel de ${categoria} (${cantidad} ${cantidad === 1 ? 'jugadora' : 'jugadoras'}).`
  return `Va a ${cantidad} ${cantidad === 1 ? 'jugadora' : 'jugadoras'} de ${categoria}.`
}
