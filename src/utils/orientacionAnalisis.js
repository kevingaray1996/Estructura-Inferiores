// X/Y son posiciones visuales: nunca se transforman al guardar ni dibujar.
export const SISTEMA_VISUAL = 'visual_v1'
export function direccionDelPeriodo(partido, periodo) {
  const d = partido?.direccion_primer_tiempo
  if (!['derecha', 'izquierda'].includes(d) || ![1, 2].includes(Number(periodo))) return null
  return Number(periodo) === 1 ? d : d === 'derecha' ? 'izquierda' : 'derecha'
}
export function referenciaVerificada(evento) {
  return evento?.sistema_coordenadas === SISTEMA_VISUAL &&
    ['derecha', 'izquierda'].includes(evento.direccion_captura) && [1, 2].includes(Number(evento.periodo_captura))
}
export function zonaTactica(x, y, direccion) {
  const valido = v => ['number', 'string'].includes(typeof v) && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100
  if (!valido(x) || !valido(y) || !['derecha', 'izquierda'].includes(direccion)) return null
  // Carriles desde la perspectiva del equipo: se gira la referencia táctica,
  // no el punto visual. Atacando a la derecha, arriba es izquierda táctica.
  const avance = direccion === 'derecha' ? Number(x) : 100 - Number(x)
  const lateral = direccion === 'derecha' ? Number(y) : 100 - Number(y)
  return `${avance < 33.333 ? 'Defensa' : avance < 66.666 ? 'Medio' : 'Ataque'} ${lateral < 33.333 ? 'izquierda' : lateral < 66.666 ? 'centro' : 'derecha'}`
}
// Zona de una acción y de dónde sale. calculada: true si se calculó desde el punto con la dirección del partido
// (acciones viejas, cargadas sin la dirección de captura).
//   - Con dirección de captura: desde el punto con esa dirección (o la zona guardada si no hay punto).
//   - Acción vieja con zona guardada: esa, nunca se pisa.
//   - Acción vieja con punto y sin zona, y con el partido: desde el punto, con la dirección del 1T del partido
//     (el 2T, la contraria). Decisión del usuario (2026-11-21), con la dirección de cada partido confirmada.
export function zonaConOrigen(evento, partido = null) {
  if (referenciaVerificada(evento)) {
    return { zona: zonaTactica(evento.coordenada_x, evento.coordenada_y, evento.direccion_captura) || evento.zona || null, calculada: false }
  }
  if (evento?.zona) return { zona: evento.zona, calculada: false }
  const direccion = partido ? direccionDelPeriodo(partido, evento?.periodo ?? 1) : null
  const calculada = direccion ? zonaTactica(evento?.coordenada_x, evento?.coordenada_y, direccion) : null
  return calculada ? { zona: calculada, calculada: true } : { zona: null, calculada: false }
}

// Sin el partido, las acciones viejas conservan solo la zona guardada.
export function zonaEvento(evento, partido = null) {
  return zonaConOrigen(evento, partido).zona
}

// Dirección con la que se lee el punto de una acción: la de captura o, si es vieja, la del partido en ese tiempo.
export function direccionDeLaAccion(evento, partido = null) {
  if (referenciaVerificada(evento)) return evento.direccion_captura
  return partido ? direccionDelPeriodo(partido, evento?.periodo ?? 1) : null
}
export function referenciaNueva(partido, periodo) {
  const direccion = direccionDelPeriodo(partido, periodo)
  if (!direccion) throw Error('Configurá explícitamente la dirección de ataque antes de registrar acciones nuevas.')
  return { sistema_coordenadas: SISTEMA_VISUAL, direccion_captura: direccion, periodo_captura: Number(periodo) }
}
