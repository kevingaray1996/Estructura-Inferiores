// Reglas diarias originales de Inicio; no son diagnósticos ni el Z-score histórico.
export const CAMPOS_WELLNESS_INICIO = {
  sueno: 'Sueño', dolor_muscular: 'Dolor muscular', fatiga: 'Fatiga',
  estres: 'Estrés', animo_entrenar: 'Ánimo para entrenar',
}

export function puedeConsultarWellnessInicio(perfil, primeraId) {
  return Boolean(primeraId) && (['coordinacion', 'preparador_fisico'].includes(perfil?.rol) ||
    perfil?.rol === 'tecnico' && perfil.categoria_id === primeraId)
}

export function resumirWellnessInicio(jugadoras, respuestas) {
  const porId = new Map()
  for (const fila of respuestas) {
    if (porId.has(fila.jugador_id)) throw new Error('Existen respuestas duplicadas; consultá Wellness antes de interpretar el resumen.')
    porId.set(fila.jugador_id, fila)
  }
  const alertas = [], pendientes = []
  let respondieron = 0, incompletas = 0, estresAlto = 0
  for (const jugadora of jugadoras) {
    const fila = porId.get(jugadora.id)
    const valores = Object.entries(CAMPOS_WELLNESS_INICIO).map(([campo, label]) => ({ campo, label, valor: fila?.[campo] }))
      .filter(v => v.valor !== null && v.valor !== undefined && v.valor !== '' && Number.isFinite(Number(v.valor)))
      .map(v => ({ ...v, valor: Number(v.valor) }))
    if (!valores.length) { pendientes.push(jugadora); continue }
    respondieron++
    if (valores.length < 5) incompletas++
    if (Number(fila.estres) > 3) estresAlto++
    const promedio = valores.reduce((s, v) => s + v.valor, 0) / valores.length
    const factores = valores.filter(v => v.valor >= 4)
    if (promedio <= 3 && factores.length === 0) continue
    const alta = promedio > 4 || factores.some(v => v.valor === 5)
    alertas.push({ jugadora, nivel: alta ? 'alta' : 'seguimiento', promedio,
      motivo: `Wellness del día: ${promedio.toFixed(1)}${factores.length ? ' · ' + factores.map(v => `${v.label} ${v.valor}`).join(', ') : ''}` })
  }
  return { total: jugadoras.length, respondieron, pendientes, incompletas, alertas, estresAlto }
}

export function mensajeErrorWellness(error) {
  return ['42501', 'PGRST301', 'PGRST302'].includes(error?.code) || [401, 403].includes(error?.status)
    ? 'Tu sesión no tiene acceso a las respuestas de Wellness. No se modificaron permisos.'
    : error?.message?.startsWith('Existen respuestas duplicadas') ? error.message
      : 'No se pudo leer Wellness. Revisá la conexión y volvé a intentar.'
}
