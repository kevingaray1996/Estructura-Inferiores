export const UUID_EDITOR_PASES = 'f7562d52-a16a-48b5-95a0-efbcc70080d3'

export const ESTADOS_DESTINATARIA = {
  pendiente: 'Pendiente',
  identificada: 'Identificada',
  desconocida: 'Desconocida',
  no_observable: 'No observable',
}

export const esPase = (evento) => ['Pase correcto', 'Pase incorrecto'].includes(evento?.tipo)
export const nombreDestinataria = (jugadora) =>
  [jugadora?.nombre, jugadora?.apellido].filter(Boolean).join(' ') || 'Jugadora no disponible'

const CAMPOS_DETALLE = 'evento_id, destinataria_id, destinataria_estado, revision'
const CAMPOS_JUGADORA = 'id, nombre, apellido, categoria_id'

function comprobar(respuesta) {
  if (respuesta.error) throw respuesta.error
  return respuesta.data
}

export async function cargarDetallePase(client, eventoId) {
  const detalle = comprobar(await client.from('analisis_pases_detalle')
    .select(CAMPOS_DETALLE).eq('evento_id', eventoId).maybeSingle())
  if (detalle && (detalle.evento_id !== eventoId ||
      !Object.hasOwn(ESTADOS_DESTINATARIA, detalle.destinataria_estado) ||
      !Number.isSafeInteger(Number(detalle.revision)) || Number(detalle.revision) < 1 ||
      (detalle.destinataria_estado === 'identificada') !== Boolean(detalle.destinataria_id))) {
    throw new Error('El detalle recibido no es válido. No se puede editar sin una revisión confirmada.')
  }
  return detalle
}

export async function cargarResumenDestinatarias(client, eventos) {
  const ids = eventos.filter(esPase).map((evento) => evento.id)
  if (!ids.length) return { detalles: {}, nombres: {} }
  const filas = []
  // Evita URLs excesivas cuando el explorador acumula una temporada.
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    filas.push(...(comprobar(await client.from('analisis_pases_detalle')
      .select(CAMPOS_DETALLE).in('evento_id', ids.slice(inicio, inicio + 100))) || []))
  }
  const destinatarias = [...new Set(filas.map((d) => d.destinataria_id).filter(Boolean))]
  const jugadoras = []
  for (let inicio = 0; inicio < destinatarias.length; inicio += 100) {
    jugadoras.push(...(comprobar(await client.from('jugadores').select(CAMPOS_JUGADORA)
      .in('id', destinatarias.slice(inicio, inicio + 100))) || []))
  }
  return {
    detalles: Object.fromEntries(filas.map((d) => [d.evento_id, d])),
    nombres: Object.fromEntries(jugadoras.map((j) => [j.id, nombreDestinataria(j)])),
  }
}

export async function cargarOpcionesDestinatarias(client, partido, evento, detalle) {
  const calendarioId = partido?.partido_calendario_id || partido?.partido_calendario?.id
  const citaciones = calendarioId
    ? comprobar(await client.from('citaciones').select('jugador_id').eq('partido_id', calendarioId)) || []
    : []
  const ids = [...new Set(citaciones.map((c) => c.jugador_id).filter(Boolean))]
  let opciones = []
  let aviso = ''
  if (ids.length) {
    opciones = comprobar(await client.from('jugadores').select(CAMPOS_JUGADORA).in('id', ids)) || []
    if (opciones.length < ids.length) aviso = 'Algunas convocadas no están disponibles con los permisos actuales.'
  } else {
    aviso = 'No hay convocatoria disponible. Se muestran jugadoras de la categoría del partido; no se confirma su participación.'
    if (partido?.categoria_id) {
      opciones = comprobar(await client.from('jugadores').select(CAMPOS_JUGADORA)
        .eq('categoria_id', partido.categoria_id)) || []
    } else {
      aviso = 'El partido no tiene convocatoria ni categoría disponible. Podés guardar un estado sin identificar jugadora.'
    }
  }
  const guardada = detalle?.destinataria_id
  if (guardada && !opciones.some((j) => j.id === guardada)) {
    const jugadora = comprobar(await client.from('jugadores').select(CAMPOS_JUGADORA)
      .eq('id', guardada).maybeSingle())
    opciones.push({ ...(jugadora || { id: guardada }), previamenteGuardada: true })
  }
  const unicas = new Map(opciones.map((j) => [j.id, j]))
  return {
    opciones: [...unicas.values()].filter((j) => j.id !== evento.jugador_id)
      .sort((a, b) => nombreDestinataria(a).localeCompare(nombreDestinataria(b), 'es')),
    aviso,
    guardadaEsAutora: Boolean(guardada && guardada === evento.jugador_id),
  }
}

export async function guardarDestinataria(client, evento, detalle, estado, destinatariaId) {
  const usuario = comprobar(await client.auth.getUser())?.user
  if (usuario?.id !== UUID_EDITOR_PASES) {
    throw { code: '42501', message: 'No tenés autorización para guardar destinatarias.' }
  }
  if (!esPase(evento) || !Object.hasOwn(ESTADOS_DESTINATARIA, estado) ||
      (estado === 'identificada' && (!destinatariaId || destinatariaId === evento.jugador_id))) {
    throw { code: '22023', message: 'Seleccioná un pase y una destinataria válida, diferente de la autora.' }
  }
  const resultado = comprobar(await client.rpc('guardar_detalle_pase', {
    p_evento_id: evento.id,
    p_destinataria_estado: estado,
    p_destinataria_id: estado === 'identificada' ? destinatariaId : null,
    p_revision_esperada: detalle?.revision ?? null,
  }))
  const fila = Array.isArray(resultado) ? resultado[0] : resultado
  if (!fila || fila.evento_id !== evento.id || !fila.revision) {
    throw new Error('No se pudo confirmar la respuesta del guardado.')
  }
  return fila
}

export function mensajeErrorDestinataria(error) {
  if (error?.code === '40001') return 'El detalle cambió. Recargá la versión actual antes de guardar; tus cambios no se sobrescribieron.'
  if (error?.code === '42501') return 'No tenés autorización para guardar destinatarias. Revisá tu sesión.'
  if (error?.code === '23503') return 'La acción o la destinataria ya no está disponible. Recargá los datos.'
  if (error?.code === '23514' || error?.code === '22023') return error.message || 'Los datos del pase no son válidos.'
  return 'No se pudo confirmar el guardado. Conservamos tu selección. Recargá el detalle antes de volver a guardar para comprobar si el cambio llegó al servidor.'
}
