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
export function zonaEvento(evento) {
  if (referenciaVerificada(evento)) return zonaTactica(evento.coordenada_x, evento.coordenada_y, evento.direccion_captura) || evento.zona || null
  // Nunca recalcular zonas históricas a partir de X/Y o del partido actual.
  return evento?.zona || null
}
export function referenciaNueva(partido, periodo) {
  const direccion = direccionDelPeriodo(partido, periodo)
  if (!direccion) throw Error('Configurá explícitamente la dirección de ataque antes de registrar acciones nuevas.')
  return { sistema_coordenadas: SISTEMA_VISUAL, direccion_captura: direccion, periodo_captura: Number(periodo) }
}
