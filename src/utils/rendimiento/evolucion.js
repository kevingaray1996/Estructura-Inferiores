import { construirRendimiento, filtrarPartidos } from './metricas.js'
import { detalleMetrica } from './comparativas.js'
import { METRICAS_RANKING, modalidadesMetrica, participacionRanking } from './rankings.js'
import { fechaValida } from '../planificacion.js'

export const METRICAS_EVOLUCION = METRICAS_RANKING.filter(m => m.id !== 'partidos')
const finito = v => typeof v === 'number' && Number.isFinite(v)
function indicador(metricaId, modalidad) {
  const m = METRICAS_EVOLUCION.find(m => m.id === metricaId)
  if (!m || !modalidadesMetrica(m).includes(modalidad)) throw new Error('Indicador o modalidad de evolución inválidos.')
  return m
}
export function valorEvolucion(r, metrica, modalidad) {
  const d = metrica.participacion ? { valor: r?.participacion?.minutos ?? null, numerador: null, denominador: null } : detalleMetrica(r, metrica)
  const valor = modalidad === 'por90' ? d.tasa : d.valor
  return { valor: finito(valor) ? valor : null, numerador: d.numerador ?? null, denominador: d.denominador ?? null,
    motivo: finito(valor) ? null : metrica.participacion ? 'Minutos ausentes, duplicados o inválidos.' : modalidad === 'por90' ?
      'Faltan análisis vinculados y/o minutos positivos del mismo conjunto de partidos.' : 'Sin análisis accesible vinculado o sin denominador válido.' }
}
export function construirEvolucion(datos, jugadoraIds, metricaId, modalidad, filtros = {}) {
  const metrica = indicador(metricaId, modalidad)
  const motor = construirRendimiento(datos, { ...filtros, jugadoraIds })
  const partidos = motor.partidos.filter(p => fechaValida(p.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)))
  return { motor, metrica, partidos, sinFecha: motor.partidos.filter(p => !fechaValida(p.fecha)),
    series: motor.jugadoras.map(j => ({ jugadorId: j.jugadorId, puntos: partidos.map(p => {
      const fila = j.partidos.find(f => f.partidoId === p.id)
      const r = fila ? { acciones: fila.acciones, participacion: fila.participacion, partidos: [fila] } : null
      return { partidoId: p.id, ...valorEvolucion(r, metrica, modalidad), minutos: fila?.participacion.minutos ?? null }
    }) })) }
}
// Solo une pares adyacentes observados. Nunca atraviesa un dato ausente.
export function segmentosObservados(puntos) {
  const segmentos = []; let tramo = []
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].valor === null) { if (tramo.length > 1) segmentos.push(tramo); tramo = [] }
    else tramo.push(i)
  }
  if (tramo.length > 1) segmentos.push(tramo)
  return segmentos
}
export function diferenciaPeriodos(a, b) {
  if (!finito(a) || !finito(b)) return { diferencia: null, variacion: null }
  const diferencia = b - a
  return { diferencia, variacion: a === 0 ? null : diferencia * 100 / a }
}
export function compararPeriodos(datos, jugadoraIds, metricaId, modalidad, filtros, periodoA, periodoB) {
  const metrica = indicador(metricaId, modalidad)
  const base = construirRendimiento(datos, { ...filtros, jugadoraIds })
  const calcular = periodo => {
    const ids = filtrarPartidos(base.partidos, periodo).map(p => p.id)
    const motor = construirRendimiento(datos, { partidoIds: ids, jugadoraIds })
    return { ids, filas: motor.jugadoras.map(j => ({ jugadorId: j.jugadorId, ...valorEvolucion(j, metrica, modalidad),
      minutos: participacionRanking(j).minutos, partidosJugados: participacionRanking(j).partidos, partidosIncluidos: motor.partidos.length,
      pendientes: j.acciones?.resultados.pendientes ?? null })) }
  }
  const a = calcular(periodoA), b = calcular(periodoB)
  return { solapados: a.ids.filter(id => b.ids.includes(id)), filas: jugadoraIds.map(id => {
    const ausente = { valor: null, numerador: null, denominador: null, minutos: null, partidosIncluidos: null, partidosJugados: null, motivo: 'La lectura de partidos no está disponible.' }
    const A = a.filas.find(f => f.jugadorId === id) || ausente, B = b.filas.find(f => f.jugadorId === id) || ausente
    return { jugadorId: id, a: A, b: B, ...diferenciaPeriodos(A?.valor, B?.valor) }
  }) }
}
