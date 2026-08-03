const RPE_MIN_DIAS_CRONICA = 12 // mínimo de días con carga calculable en 28 días para confiar en el ACWR
const RPE_MIN_DIAS_SEMANA = 3   // mínimo de días con RPE cargado en la semana (de los 4 de entrenamiento)

// --- 2) sRPE / ACWR: carga = minutos reales (bloques de entrenamiento según
// posición y asistencia, o minutos jugados en partido) × RPE de ese día.
export async function calcularCargaJugador(jugadorId, categoriaId) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyISO = fechaISO(hoy)
  const desde28ISO = fechaISO(restarDias(hoy, 27))
  const desdeSemanaISO = fechaISO(restarDias(hoy, 6))

  const [{ data: jugador }, { data: bloquesRango }, { data: asistencias }, { data: statsPartidos }, { data: rpeData }] =
    await Promise.all([
      supabase.from('jugadores').select('posicion').eq('id', jugadorId).single(),
      supabase
        .from('entrenamiento_bloques')
        .select('*')
        .eq('categoria_id', categoriaId)
        .gte('fecha', desde28ISO)
        .lte('fecha', hoyISO),
      supabase
        .from('asistencias')
        .select('fecha, estado')
        .eq('jugador_id', jugadorId)
        .gte('fecha', desde28ISO)
        .lte('fecha', hoyISO),
      supabase
        .from('estadisticas_jugador')
        .select('minutos_jugados, partidos(fecha)')
        .eq('jugador_id', jugadorId),
      supabase
        .from('sesiones_fisicas')
        .select('fecha, rpe')
        .eq('jugador_id', jugadorId)
        .not('rpe', 'is', null)
        .gte('fecha', desde28ISO)
        .lte('fecha', hoyISO),
    ])

  const posicionJugador = jugador?.posicion || null

  const asistenciaPorFecha = {}
  ;(asistencias || []).forEach((a) => {
    asistenciaPorFecha[a.fecha] = a.estado
  })

  const minutosPorFecha = {}
  ;(bloquesRango || []).forEach((b) => {
    const estado = asistenciaPorFecha[b.fecha]
    if (estado !== 'presente' && estado !== 'tarde') return
    const aplica = !b.posiciones || b.posiciones.length === 0 || b.posiciones.includes(posicionJugador)
    if (!aplica) return
    const factor = estado === 'tarde' ? 0.7 : 1
    minutosPorFecha[b.fecha] = (minutosPorFecha[b.fecha] || 0) + b.duracion_minutos * factor
  })

  ;(statsPartidos || []).forEach((s) => {
    const fecha = s.partidos?.fecha
    if (!fecha || fecha < desde28ISO || fecha > hoyISO) return
    minutosPorFecha[fecha] = (minutosPorFecha[fecha] || 0) + (s.minutos_jugados || 0)
  })

  const rpePorFecha = {}
  ;(rpeData || []).forEach((r) => {
    if (!rpePorFecha[r.fecha]) rpePorFecha[r.fecha] = []
    rpePorFecha[r.fecha].push(r.rpe)
  })

  const cargaPorFecha = {}
  Object.entries(minutosPorFecha).forEach(([fecha, minutos]) => {
    const rpes = rpePorFecha[fecha]
    if (!rpes || rpes.length === 0 || minutos <= 0) return
    const rpeProm = rpes.reduce((a, b) => a + b, 0) / rpes.length
    cargaPorFecha[fecha] = minutos * rpeProm
  })

  function sumaUltimosNDias(n) {
    const desdeISO = fechaISO(restarDias(hoy, n - 1))
    return Object.entries(cargaPorFecha)
      .filter(([fecha]) => fecha >= desdeISO && fecha <= hoyISO)
      .reduce((acc, [, valor]) => acc + valor, 0)
  }

  const cargaAguda = sumaUltimosNDias(7)
  const cargaCronicaSemanal = sumaUltimosNDias(28) / 4
  const acwrCalculado = cargaCronicaSemanal > 0 ? cargaAguda / cargaCronicaSemanal : null

  // Confiabilidad del ACWR: necesita suficientes días con carga calculable
  // (minutos + RPE) en la ventana de 28 días.
  const diasConCarga28 = Object.keys(cargaPorFecha).length
  const datosInsuficientes = diasConCarga28 < RPE_MIN_DIAS_CRONICA

  let acwr = null
  let nivel = null
  if (!datosInsuficientes && acwrCalculado !== null) {
    acwr = acwrCalculado
    if (acwr > 1.5 || acwr < 0.8) nivel = 'alerta'
    else if (acwr > 1.3) nivel = 'moderado'
    else nivel = 'normal'
  }

  // Respaldo: carga simple de esta semana, solo si hay al menos 3 de los 4
  // días de entrenamiento con RPE cargado; si no, queda nula.
  const diasConCargaSemana = Object.keys(cargaPorFecha).filter(
    (f) => f >= desdeSemanaISO && f <= hoyISO
  ).length
  const semanaInsuficiente = diasConCargaSemana < RPE_MIN_DIAS_SEMANA
  const cargaSemanal = semanaInsuficiente ? null : cargaAguda

  return {
    acwr,
    nivel,
    cargaAguda,
    cargaCronicaSemanal,
    datosInsuficientes,
    cargaSemanal,
    diasConCargaSemana,
    semanaInsuficiente,
  }
}

export default RPEComparativo
