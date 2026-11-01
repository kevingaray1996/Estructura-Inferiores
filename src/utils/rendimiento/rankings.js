import { METRICAS, detalleMetrica } from './comparativas.js'
import { puestoPlantel } from '../../components/plantel/posicionesPlantel.js'

export const METRICAS_RANKING = [
  { id: 'minutos', etiqueta: 'Minutos disputados', participacion: true },
  { id: 'partidos', etiqueta: 'Partidos jugados', participacion: true },
  ...METRICAS,
  { id: 'duelosDefensivos', etiqueta: 'Duelos defensivos', tipos: ['Duelo defensivo'] },
  { id: 'duelosOfensivos', etiqueta: 'Duelos ofensivos', tipos: ['Duelo ofensivo'] },
]
export const modalidadesMetrica = m => m?.porcentaje ? ['porcentaje'] : m?.participacion ? ['absoluta'] : ['absoluta', 'por90']
const valido = v => typeof v === 'number' && Number.isFinite(v) && v >= 0
export const nombreRanking = j => [j.apellido, j.nombre].filter(Boolean).join(', ')

export function participacionRanking(r) {
  const filas = r?.partidos || []
  // Sin fila deportiva no se supone que la jugadora jugó cero partidos.
  const partidos = filas.length && filas.every(f => valido(f.participacion?.minutos)) ? filas.filter(f => f.participacion.minutos > 0).length : null
  return { minutos: r?.participacion?.minutos ?? null, partidos }
}

/** Orden descriptivo descendente. Empates exactos comparten puesto (1,1,3).
 * El nombre y luego el ID solo estabilizan el orden, no desempatan deportivamente.
 * No se redondea antes de comparar. Los ceros confirmados se conservan como registros.
 */
export function construirRanking(motor, jugadoras, { metricaId = 'minutos', modalidad = 'absoluta', posicion = '', grupo = '' } = {}) {
  const metrica = METRICAS_RANKING.find(m => m.id === metricaId)
  if (!metrica || !modalidadesMetrica(metrica).includes(modalidad)) throw new Error('Métrica o modalidad de ranking inválida.')
  const candidatas = jugadoras.filter(j => (!posicion || j.posicion === posicion) && (!grupo || puestoPlantel(j.posicion).grupo === grupo))
  const filas = [], excluidas = [], vistos = new Set()
  for (const jugadora of candidatas) {
    if (vistos.has(jugadora.id)) continue
    vistos.add(jugadora.id)
    const r = motor?.jugadoras.find(f => f.jugadorId === jugadora.id)
    const participacion = participacionRanking(r)
    const detalle = metrica.participacion ? { valor: participacion[metrica.id], numerador: null, denominador: null, tasa: null } : detalleMetrica(r, metrica)
    const valor = modalidad === 'por90' ? detalle.tasa : detalle.valor
    const evidenciaPropia = r?.acciones?.total > 0
    if (!metrica.participacion && !(participacion.minutos > 0) && !evidenciaPropia) {
      excluidas.push({ jugadora, motivo: 'Sin participación positiva confirmada ni eventos propios suficientes para clasificar acciones.' })
      continue
    }
    if (!valido(valor)) {
      excluidas.push({ jugadora, motivo: metrica.participacion ? 'Participación ausente, incompleta o inválida.' : modalidad === 'por90' ?
        'Faltan análisis vinculados y/o minutos positivos válidos en el mismo conjunto de partidos.' : 'No hay un valor calculable con las fuentes y filtros actuales.' })
      continue
    }
    filas.push({ jugadora, valor, ...participacion, numerador: detalle.numerador, denominador: detalle.denominador,
      muestraPequena: participacion.minutos === null || participacion.minutos < 180 || participacion.partidos === null || participacion.partidos < 3 || Boolean(metrica.porcentaje && detalle.denominador < 10),
      participacionConfirmada: participacion.minutos > 0,
      pendientes: r?.acciones?.resultados.pendientes ?? null })
  }
  filas.sort((a, b) => b.valor - a.valor || nombreRanking(a.jugadora).localeCompare(nombreRanking(b.jugadora), 'es') || String(a.jugadora.id).localeCompare(String(b.jugadora.id)))
  let puesto = 0
  for (let i = 0; i < filas.length; i++) { if (i === 0 || filas[i].valor !== filas[i - 1].valor) puesto = i + 1; filas[i].puesto = puesto }
  return { metrica, modalidad, filas, excluidas, podio: filas.slice(0, 3), maximo: filas[0]?.valor ?? null }
}
