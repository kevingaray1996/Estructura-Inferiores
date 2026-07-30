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

function promedio(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length === 0) return null
  return limpios.reduce((a, b) => a + b, 0) / limpios.length
}

function desvioEstandar(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length < 2) return null
  const media = promedio(limpios)
  const varianza = limpios.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / (limpios.length - 1)
  return Math.sqrt(varianza)
}

// --- 1) Wellness: z-score del promedio diario de las 5 preguntas, comparado
// contra la media/desvío de los últimos días previos (sin contar hoy).
export async function calcularWellnessZScore(jugadorId) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyISO = fechaISO(hoy)
  const desde28ISO = fechaISO(restarDias(hoy, 27))

  const { data } = await supabase
    .from('bienestar')
    .select('fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar')
    .eq('jugador_id', jugadorId)
    .gte('fecha', desde28ISO)
    .lte('fecha', hoyISO)
    .order('fecha', { ascending: true })

  const porDia = (data || [])
    .map((d) => ({
      fecha: d.fecha,
      promedio: promedio([d.sueno, d.dolor_muscular, d.fatiga, d.estres, d.animo_entrenar]),
    }))
    .filter((d) => d.promedio !== null)

  const registroHoy = porDia.find((d) => d.fecha === hoyISO)
  const anteriores = porDia.filter((d) => d.fecha !== hoyISO).map((d) => d.promedio)

  if (!registroHoy || anteriores.length < 3) {
    return { z: null, nivel: null, valorHoy: registroHoy?.promedio ?? null }
  }

  const media = promedio(anteriores)
  const desvio = desvioEstandar(anteriores)
  if (!desvio) return { z: null, nivel: null, valorHoy: registroHoy.promedio }

  const z = (registroHoy.promedio - media) / desvio
  let nivel
  if (Math.abs(z) < 0.5) nivel = 'normal'
  else if (Math.abs(z) < 1.5) nivel = 'moderado'
  else nivel = 'alerta'

  return { z, nivel, valorHoy: registroHoy.promedio }
}

// --- 2) sRPE / ACWR: carga = minutos reales (bloques de entrenamiento según
// posición y asistencia, o minutos jugados en partido) × RPE de ese día.
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
    const rpeProm = promedio(rpes)
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

  let nivel = null
  if (acwr !== null) {
    if (acwr > 1.5) nivel = 'alerta'
    else if (acwr > 1.3) nivel = 'moderado'
    else nivel = 'normal'
  }

  return { acwr, nivel, cargaAguda, cargaCronicaSemanal }
}

// --- 3) CMJ: % de baja del último registro contra el promedio de las 3
// mediciones semanales previas.
export async function calcularCMJDrop(jugadorId) {
  const { data } = await supabase
    .from('cmj')
    .select('fecha, valor_cm')
    .eq('jugador_id', jugadorId)
    .order('fecha', { ascending: false })
    .limit(4)

  const registros = data || []
  if (registros.length < 2) {
    return { porcentaje: null, nivel: null, ultimoValor: registros[0]?.valor_cm ?? null }
  }

  const [ultimo, ...anteriores] = registros
  const promedioAnterior = promedio(anteriores.map((r) => r.valor_cm))
  if (!promedioAnterior) return { porcentaje: null, nivel: null, ultimoValor: ultimo.valor_cm }

  const porcentaje = ((promedioAnterior - ultimo.valor_cm) / promedioAnterior) * 100

  let nivel
  if (porcentaje < 3) nivel = 'normal'
  else if (porcentaje <= 6) nivel = 'moderado'
  else nivel = 'alerta'

  let bajaConsecutiva = false
  if (registros.length >= 3) {
    bajaConsecutiva = registros[0].valor_cm < registros[1].valor_cm && registros[1].valor_cm < registros[2].valor_cm
  }

  return { porcentaje, nivel, ultimoValor: ultimo.valor_cm, bajaConsecutiva }
}

const PUNTOS_NIVEL = { normal: 0, moderado: 1, alerta: 2 }

export const SEMAFORO_INFO = {
  verde: { label: 'Verde', color: '#4ADE80' },
  amarillo: { label: 'Amarillo', color: '#FBBF24' },
  rojo: { label: 'Rojo', color: '#F87171' },
}

// Combina las 3 fuentes en el semáforo final (0-6 puntos).
export async function calcularSemaforoJugador(jugadorId, categoriaId) {
  const [wellness, carga, cmj] = await Promise.all([
    calcularWellnessZScore(jugadorId),
    calcularCargaJugador(jugadorId, categoriaId),
    calcularCMJDrop(jugadorId),
  ])

  const puntos =
    (wellness.nivel ? PUNTOS_NIVEL[wellness.nivel] : 0) +
    (carga.nivel ? PUNTOS_NIVEL[carga.nivel] : 0) +
    (cmj.nivel ? PUNTOS_NIVEL[cmj.nivel] : 0)

  let semaforo
  if (puntos >= 4) semaforo = 'rojo'
  else if (puntos >= 2) semaforo = 'amarillo'
  else semaforo = 'verde'

  return { wellness, carga, cmj, puntos, semaforo }
}
