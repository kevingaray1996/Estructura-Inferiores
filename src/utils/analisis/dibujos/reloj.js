// Reloj suave: YouTube informa el tiempo de a saltos (unas 4 veces por segundo). Entre lecturas se estima con la hora
// de la compu, para que los dibujos se muevan fluidos. Si la estimación se aleja mucho, se reacomoda. Lógica pura.

export const DESVIO_MAXIMO = 0.3

export function crearRelojSuave() {
  let ancla = null // { t, ms, velocidad }
  let ultimoReportado = null
  let ultimoEstimado = null
  return {
    // reportado: lo que dice YouTube; ahora: ms de la compu. Devuelve el tiempo estimado.
    muestra(reportado, { reproduciendo, velocidad = 1, ahora }) {
      const t = Number(reportado)
      if (!Number.isFinite(t)) return ultimoEstimado ?? 0
      if (!reproduciendo) {
        ancla = null; ultimoReportado = t; ultimoEstimado = t
        return t
      }
      if (!ancla || ancla.velocidad !== velocidad) ancla = { t, ms: ahora, velocidad }
      let estimado = ancla.t + ((ahora - ancla.ms) / 1000) * velocidad
      if (t !== ultimoReportado) {
        // Lectura nueva: si la estimación se fue lejos (salto, buffering), se reacomoda a lo que dice YouTube.
        if (Math.abs(estimado - t) > DESVIO_MAXIMO) { ancla = { t, ms: ahora, velocidad }; estimado = t }
        ultimoReportado = t
      }
      // Sin retroceder por redondeos mientras reproduce (sí si YouTube saltó atrás).
      if (ultimoEstimado !== null && estimado < ultimoEstimado && ultimoEstimado - estimado < DESVIO_MAXIMO) estimado = ultimoEstimado
      ultimoEstimado = estimado
      return estimado
    },
    reiniciar() { ancla = null; ultimoReportado = null; ultimoEstimado = null },
  }
}
