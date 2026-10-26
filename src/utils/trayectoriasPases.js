import { cargarDetallePase, esPase, nombreDestinataria, UUID_EDITOR_PASES } from './destinatariasPases.js'

export function puntoExacto(x, y) {
  const valido = (v) => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' &&
    Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100
  return valido(x) && valido(y) ? { x: Number(x), y: Number(y) } : null
}

export function trayectoriaExacta(evento, detalle) {
  if (!esPase(evento)) return null
  const origen = puntoExacto(evento.coordenada_x, evento.coordenada_y)
  const destino = puntoExacto(detalle?.destino_x, detalle?.destino_y)
  return origen && destino ? { origen, destino } : null
}

// Solo informa la direccion existente. No determina la referencia historica de X/Y.
export function direccionAtaquePase(partido, evento) {
  const inicial = partido?.direccion_primer_tiempo
  const periodo = Number(evento?.periodo)
  if (!['derecha', 'izquierda'].includes(inicial) || ![1, 2].includes(periodo)) return null
  return periodo === 1 ? inicial : inicial === 'derecha' ? 'izquierda' : 'derecha'
}

export async function cargarFichaDestino(client, eventoId) {
  const detalle = await cargarDetallePase(client, eventoId)
  const tieneX = detalle?.destino_x != null
  const tieneY = detalle?.destino_y != null
  if (tieneX !== tieneY || (tieneX && !puntoExacto(detalle.destino_x, detalle.destino_y))) {
    throw new Error('El destino recibido no es válido. Recargá antes de guardar.')
  }
  let destinataria = null
  if (detalle?.destinataria_id) {
    const { data, error } = await client.from('jugadores').select('id, nombre, apellido')
      .eq('id', detalle.destinataria_id).maybeSingle()
    if (error) throw error
    destinataria = data ? nombreDestinataria(data) : 'Jugadora no disponible'
  }
  return { detalle, destinataria }
}

export async function guardarDestinoPase(client, evento, detalle, destino) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (data?.user?.id !== UUID_EDITOR_PASES) {
    throw { code: '42501', message: 'No tenés autorización para guardar destinos.' }
  }
  const punto = destino === null ? null : puntoExacto(destino?.x, destino?.y)
  if (!esPase(evento) || (destino !== null && !punto) || (!detalle && destino === null)) {
    throw { code: '22023', message: 'Seleccioná un destino válido o un detalle existente para quitarlo.' }
  }
  if (detalle && (detalle.evento_id !== evento.id ||
      !Number.isSafeInteger(Number(detalle.revision)) || Number(detalle.revision) < 1)) {
    throw { code: '40001', message: 'Recargá el detalle para confirmar su revisión.' }
  }
  const resultado = await client.rpc('guardar_destino_pase', {
    p_evento_id: evento.id,
    p_destino_x: punto?.x ?? null,
    p_destino_y: punto?.y ?? null,
    p_revision_esperada: detalle?.revision ?? null,
  })
  if (resultado.error) throw resultado.error
  const fila = Array.isArray(resultado.data) ? resultado.data[0] : resultado.data
  const esperado = (Number(detalle?.revision) || 0) + 1
  if (!fila || fila.evento_id !== evento.id || Number(fila.revision) !== esperado ||
      fila.destino_x !== (punto?.x ?? null) || fila.destino_y !== (punto?.y ?? null)) {
    throw new Error('No se pudo confirmar el guardado. Recargá antes de reintentar.')
  }
  return fila
}

export function mensajeErrorDestino(error) {
  if (error?.code === '40001') return 'La destinataria o el destino cambió. Recargá el detalle antes de guardar; no se sobrescribieron cambios.'
  if (error?.code === '42501') return 'No tenés autorización para guardar el destino. Revisá tu sesión.'
  if (error?.code === '23503') return 'La acción ya no está disponible. Recargá las acciones.'
  if (['22023', '23514'].includes(error?.code)) return error.message
  return 'No se pudo confirmar el guardado. Conservamos tu selección; recargá para comprobar si el cambio llegó al servidor antes de reintentar.'
}
