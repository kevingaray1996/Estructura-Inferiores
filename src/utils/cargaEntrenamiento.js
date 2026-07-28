import { supabase } from '../supabaseClient'

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function restarDias(fecha, dias) {
  const d = new Date(fecha)
  d.setDate(d.getDate() - dias)
  return d
}

// Calcula, para un jugador puntual, la carga diaria de los últimos 28 días
// (minutos reales de entrenamiento/partido × RPE de ese día), y el ACWR
// (carga aguda de 7 días / promedio semanal de carga crónica de 28 días).
export async function calcularCargaJugador(jugadorId, categoriaId) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyISO = fechaISO(hoy)
  const desde28ISO = fechaISO(restarDias(hoy, 27))

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

  // Minutos de entrenamiento por fecha, según los bloques que aplican a su posición
  // y solo si asistió (presente cuenta completo, tarde cuenta al 70%).
  const minutosPorFecha = {}
  ;(bloquesRango || []).forEach((b) => {
    const estado = asistenciaPorFecha[b.fecha]
    if (estado !== 'presente' && estado !== 'tarde') return
    const aplica = !b.posiciones || b.posiciones.length === 0 || b.posiciones.includes(posicionJugador)
    if (!aplica) return
    const factor = estado === 'tarde' ? 0.7 : 1
    minutosPorFecha[b.fecha] = (minutosPorFecha[b.fecha] || 0) + b.duracion_minutos * factor
  })

  // Minutos de partido por fecha (de estadisticas_jugador, ya cargados en Convocados)
  ;(statsPartidos || []).forEach((s) => {
    const fecha = s.partidos?.fecha
    if (!fecha || fecha < desde28ISO || fecha > hoyISO) return
    minutosPorFecha[fecha] = (minutosPorFecha[fecha] || 0) + (s.minutos_jugados || 0)
  })

  // RPE promedio por fecha (puede haber uno de entrenamiento y otro de partido el mismo día)
  const rpePorFecha = {}
  ;(rpeData || []).forEach((r) => {
    if (!rpePorFecha[r.fecha]) rpePorFecha[r.fecha] = []
    rpePorFecha[r.fecha].push(r.rpe)
  })

  // Carga diaria = minutos × RPE promedio de ese día. Si un día tiene minutos
  // pero no RPE cargado, no se puede calcular carga ese día (se omite del total,
  // en vez de asumir un valor).
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
  const acwr = cargaCronicaSemanal > 0 ? cargaAguda / cargaCronicaSemanal : null

  let riesgo = null
  if (acwr !== null) {
    if (acwr > 1.5) riesgo = 'alto'
    else if (acwr > 1.3) riesgo = 'precaucion'
    else if (acwr >= 0.8) riesgo = 'optimo'
    else riesgo = 'bajo'
  }

  return { cargaAguda, cargaCronicaSemanal, acwr, riesgo, cargaPorFecha }
}

export const RIESGO_INFO = {
  alto: { label: 'Riesgo alto', color: '#F87171', detalle: 'Aumento brusco de carga — alto riesgo de lesión' },
  precaucion: { label: 'Precaución', color: '#FBBF24', detalle: 'Carga por encima de lo habitual, vigilar' },
  optimo: { label: 'Zona óptima', color: '#4ADE80', detalle: 'Carga dentro del rango recomendado' },
  bajo: { label: 'Carga baja', color: '#8A9BB8', detalle: 'Por debajo de lo habitual (puede indicar desentrenamiento)' },
}
