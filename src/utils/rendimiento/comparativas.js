import { calcularPor90, percentilInterno } from './metricas.js'
import { puestoPlantel } from '../../components/plantel/posicionesPlantel.js'

export const METRICAS = [
  ['pasesCorrectos', 'Pases correctos', ['Pase correcto']], ['pasesIncorrectos', 'Pases incorrectos', ['Pase incorrecto']],
  ['precision', 'Precisión de pases', null, true], ['recuperaciones', 'Recuperaciones', ['Recuperación']],
  ['intercepciones', 'Intercepciones', ['Intercepción']], ['despejes', 'Despejes', ['Despeje']],
  ['duelos', 'Duelos', ['Duelo ofensivo', 'Duelo defensivo', 'Duelo aéreo']], ['remates', 'Remates', ['Remate']],
  ['goles', 'Goles etiquetados', ['Gol']], ['atajadas', 'Atajadas', ['Atajada']],
  ['salidas', 'Salidas de arquera', ['Salida de arquera']], ['efectividad', 'Efectividad evaluada', null, true],
].map(([id, etiqueta, tipos, porcentaje]) => ({ id, etiqueta, tipos, porcentaje: Boolean(porcentaje) }))

export function valorMetrica(resumen, metrica) {
  if (!resumen) return null
  if (metrica.id === 'precision') return resumen.pases.precision
  if (metrica.id === 'efectividad') return resumen.efectividad.porcentaje
  return metrica.tipos.reduce((s, tipo) => s + (resumen.tipos[tipo] || 0), 0)
}
export function detalleMetrica(jugadora, metrica) {
  const valor = valorMetrica(jugadora?.acciones, metrica)
  const numerador = metrica.id === 'precision' ? jugadora?.acciones?.pases.correctos : metrica.id === 'efectividad' ? jugadora?.acciones?.efectividad.exitosos : null
  const denominador = metrica.id === 'precision' ? jugadora?.acciones?.pases.total : metrica.id === 'efectividad' ? jugadora?.acciones?.efectividad.evaluadas : null
  const tasa = metrica.porcentaje ? null : calcularPor90((jugadora?.partidos || []).map(p => ({
    partidoId: p.partidoId, acciones: valorMetrica(p.acciones, metrica), minutos: p.participacion.minutos, estadoAnalisis: p.estadoAnalisis,
  }))).valor
  return { valor, numerador, denominador, tasa }
}
export function metricasRadar(modo, posicion) {
  const grupo = puestoPlantel(posicion).grupo
  const ids = modo === 'libre' ? ['precision', 'recuperaciones', 'duelos', 'remates', 'pasesCorrectos', 'efectividad'] :
    grupo === 'arqueras' ? ['atajadas', 'salidas', 'precision', 'pasesCorrectos', 'despejes', 'efectividad'] :
    grupo === 'defensoras' ? ['recuperaciones', 'intercepciones', 'despejes', 'duelos', 'precision', 'efectividad'] :
    grupo === 'delanteras' ? ['remates', 'goles', 'duelos', 'precision', 'pasesCorrectos', 'efectividad'] :
    ['precision', 'pasesCorrectos', 'recuperaciones', 'intercepciones', 'duelos', 'efectividad']
  return ids.map(id => METRICAS.find(m => m.id === id))
}
// Magnitud registrada, no nota de calidad. Cada eje utiliza la misma escala para todas.
// Porcentajes: 0–100. Conteos: 0–máximo del grupo completo con los filtros actuales.
export function crearRadar(seleccion, referencia, metricas, percentiles = false) {
  const ejes = metricas.map(m => {
    const muestra = referencia.map(j => ({ jugadorId: j.jugadorId, valor: valorMetrica(j.acciones, m) }))
    const valores = muestra.filter(j => j.valor !== null)
    const muestraPercentil = muestra.filter(f => referencia.some(j => j.jugadorId === f.jugadorId && j.participacion?.minutos > 0))
    return { ...m, muestra: muestraPercentil, n: muestraPercentil.filter(j => j.valor !== null).length, maximo: m.porcentaje ? 100 : Math.max(1, ...valores.map(j => j.valor)) }
  })
  const percentilesDisponibles = ejes.every(e => new Set(e.muestra.filter(j => j.valor !== null).map(j => j.jugadorId)).size >= 10)
  return { ejes, percentilesDisponibles, series: seleccion.map(j => ({ jugadorId: j.jugadorId,
    valores: ejes.map(e => {
      const valor = valorMetrica(j.acciones, e)
      return valor === null ? null : percentiles && percentilesDisponibles ?
        j.participacion?.minutos > 0 ? percentilInterno(valor, e.muestra) : null : valor * 100 / e.maximo
    }),
  })) }
}
