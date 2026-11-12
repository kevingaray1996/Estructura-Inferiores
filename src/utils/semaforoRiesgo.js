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

// Ventana común de las tres fuentes: hoy (hora local) y los 27 días previos.
function ventana28() {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return { hoy, hoyISO: fechaISO(hoy), desde28ISO: fechaISO(restarDias(hoy, 27)) }
}

const WELLNESS_MIN_RESPUESTAS = 15

// --- Cálculos puros: reciben filas ya leídas y no consultan Supabase. Los usan
// tanto la versión por jugadora como la versión por grupo, así dan lo mismo.

// 1) Wellness: z-score del promedio diario de las 5 preguntas, comparado
// contra la media/desvío de los últimos días previos (sin contar hoy).
// Necesita al menos 15 respuestas en los últimos 28 días para ser confiable;
// si no las tiene, se marca como datos insuficientes y no dispara alerta.
// `filas` son las respuestas de la jugadora entre desde28ISO y hoyISO, por fecha ascendente.
export function wellnessDesdeFilas(filas, hoyISO) {
  const porDia = (filas || [])
    .map((d) => ({
      fecha: d.fecha,
      promedio: promedio([d.sueno, d.dolor_muscular, d.fatiga, d.estres, d.animo_entrenar]),
    }))
    .filter((d) => d.promedio !== null)

  const registroHoy = porDia.find((d) => d.fecha === hoyISO)
  const anteriores = porDia.filter((d) => d.fecha !== hoyISO).map((d) => d.promedio)

  if (!registroHoy || porDia.length < WELLNESS_MIN_RESPUESTAS || anteriores.length < 3) {
    return { z: null, nivel: null, valorHoy: registroHoy?.promedio ?? null, datosInsuficientes: true }
  }

  const media = promedio(anteriores)
  const desvio = desvioEstandar(anteriores)
  if (!desvio) return { z: null, nivel: null, valorHoy: registroHoy.promedio, datosInsuficientes: true }

  const z = (registroHoy.promedio - media) / desvio
  let nivel
  if (Math.abs(z) < 0.5) nivel = 'normal'
  else if (Math.abs(z) < 1.5) nivel = 'moderado'
  else nivel = 'alerta'

  return { z, nivel, valorHoy: registroHoy.promedio, datosInsuficientes: false }
}

// 2) sRPE / ACWR: carga = minutos reales (bloques de entrenamiento según
// posición y asistencia, o minutos jugados en partido) × RPE de ese día.
export function cargaDesdeFilas({ posicion, bloques, asistencias, statsPartidos, rpe }, { hoy, hoyISO, desde28ISO }) {
  const posicionJugador = posicion || null

  const asistenciaPorFecha = {}
  ;(asistencias || []).forEach((a) => {
    asistenciaPorFecha[a.fecha] = a.estado
  })

  const minutosPorFecha = {}
  ;(bloques || []).forEach((b) => {
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
  ;(rpe || []).forEach((r) => {
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
    if (acwr > 1.5 || acwr < 0.8) nivel = 'alerta'
    else if (acwr > 1.3) nivel = 'moderado'
    else nivel = 'normal'
  }

  return { acwr, nivel, cargaAguda, cargaCronicaSemanal }
}

// 3) CMJ: % de baja del último registro contra el promedio de las 3
// mediciones semanales previas. `registros`: los últimos 4, del más nuevo al más viejo.
export function cmjDesdeFilas(registros) {
  registros = registros || []
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
export function combinarSemaforo(wellness, carga, cmj) {
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

// Texto corto con la fuente que más suma al semáforo (en empate: carga, wellness, CMJ).
export function motivoPrincipalSemaforo(resultado) {
  if (!resultado) return null
  const decimal = (n, d = 1) => n.toFixed(d).replace('.', ',')
  const fuentes = [
    resultado.carga?.nivel && resultado.carga.acwr != null && {
      puntos: PUNTOS_NIVEL[resultado.carga.nivel],
      texto: `Carga ${resultado.carga.acwr < 0.8 ? 'baja' : 'alta'} · ACWR ${decimal(resultado.carga.acwr, 2)}`,
    },
    resultado.wellness?.nivel && resultado.wellness.z != null && {
      puntos: PUNTOS_NIVEL[resultado.wellness.nivel],
      texto: `Wellness fuera de lo habitual · z ${decimal(resultado.wellness.z)}`,
    },
    resultado.cmj?.nivel && resultado.cmj.porcentaje != null && {
      puntos: PUNTOS_NIVEL[resultado.cmj.nivel],
      texto: `CMJ ${resultado.cmj.porcentaje >= 0 ? '−' : '+'}${decimal(Math.abs(resultado.cmj.porcentaje))} % vs. su promedio`,
    },
  ].filter((f) => f && f.puntos > 0)
  if (!fuentes.length) return null
  return fuentes.reduce((mejor, f) => (f.puntos > mejor.puntos ? f : mejor)).texto
}

// --- Versión por jugadora (Perfil, Físico, comparativos).

export async function calcularWellnessZScore(jugadorId, { exigirLectura = false } = {}) {
  const { hoyISO, desde28ISO } = ventana28()

  const { data, error } = await supabase
    .from('bienestar')
    .select('fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar')
    .eq('jugador_id', jugadorId)
    .gte('fecha', desde28ISO)
    .lte('fecha', hoyISO)
    .order('fecha', { ascending: true })

  if (exigirLectura && error) throw error
  return wellnessDesdeFilas(data, hoyISO)
}

export async function calcularCargaJugador(jugadorId, categoriaId) {
  const rango = ventana28()
  const { hoyISO, desde28ISO } = rango

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

  return cargaDesdeFilas({
    posicion: jugador?.posicion,
    bloques: bloquesRango,
    asistencias,
    statsPartidos,
    rpe: rpeData,
  }, rango)
}

export async function calcularCMJDrop(jugadorId) {
  const { data } = await supabase
    .from('cmj')
    .select('fecha, valor_cm')
    .eq('jugador_id', jugadorId)
    .order('fecha', { ascending: false })
    .limit(4)

  return cmjDesdeFilas(data)
}

export async function calcularSemaforoJugador(jugadorId, categoriaId) {
  const [wellness, carga, cmj] = await Promise.all([
    calcularWellnessZScore(jugadorId),
    calcularCargaJugador(jugadorId, categoriaId),
    calcularCMJDrop(jugadorId),
  ])

  return combinarSemaforo(wellness, carga, cmj)
}

// --- Versión por grupo: unas 7 consultas en total, sin importar cuántas
// jugadoras haya, con los mismos cálculos que la versión por jugadora.

const TAMANO_PAGINA = 1000

// Supabase corta cada respuesta en 1000 filas: pide páginas hasta traer todo.
// `construir` arma la consulta de nuevo en cada página y debe tener un orden total
// (columnas que identifiquen la fila) para que las páginas no se pisen.
export async function leerTodasLasFilas(construir) {
  const filas = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await construir().range(desde, desde + TAMANO_PAGINA - 1)
    if (error) return { data: filas, error }
    filas.push(...(data || []))
    if (!data || data.length < TAMANO_PAGINA) return { data: filas, error: null }
  }
}

function agruparPorJugadora(filas) {
  const grupos = new Map()
  for (const fila of filas || []) {
    if (!grupos.has(fila.jugador_id)) grupos.set(fila.jugador_id, [])
    grupos.get(fila.jugador_id).push(fila)
  }
  return grupos
}

// `jugadoras`: [{ id, posicion? }]. Si todas traen `posicion`, no se vuelve a leer.
// Devuelve un objeto { [jugadorId]: resultado } con la misma forma que calcularSemaforoJugador.
export async function calcularSemaforoGrupo(jugadoras, categoriaId) {
  const ids = [...new Set((jugadoras || []).map((j) => j.id).filter(Boolean))]
  if (!ids.length) return {}
  const rango = ventana28()
  const { hoyISO, desde28ISO } = rango
  const traePosicion = jugadoras.every((j) => 'posicion' in j)

  const [posiciones, bienestar, bloques, asistencias, statsPartidos, rpe, cmj] = await Promise.all([
    traePosicion
      ? { data: jugadoras.map((j) => ({ id: j.id, posicion: j.posicion })) }
      : leerTodasLasFilas(() => supabase.from('jugadores').select('id, posicion').in('id', ids).order('id')),
    leerTodasLasFilas(() => supabase
      .from('bienestar')
      .select('jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar')
      .in('jugador_id', ids)
      .gte('fecha', desde28ISO)
      .lte('fecha', hoyISO)
      .order('fecha', { ascending: true })
      .order('jugador_id')),
    leerTodasLasFilas(() => supabase
      .from('entrenamiento_bloques')
      .select('*')
      .eq('categoria_id', categoriaId)
      .gte('fecha', desde28ISO)
      .lte('fecha', hoyISO)
      .order('id')),
    leerTodasLasFilas(() => supabase
      .from('asistencias')
      .select('jugador_id, fecha, estado')
      .in('jugador_id', ids)
      .gte('fecha', desde28ISO)
      .lte('fecha', hoyISO)
      .order('fecha')
      .order('jugador_id')),
    // Solo partidos de la ventana: el cálculo descarta el resto igual.
    leerTodasLasFilas(() => supabase
      .from('estadisticas_jugador')
      .select('jugador_id, partido_id, minutos_jugados, partidos!inner(fecha)')
      .in('jugador_id', ids)
      .gte('partidos.fecha', desde28ISO)
      .lte('partidos.fecha', hoyISO)
      .order('partido_id')
      .order('jugador_id')),
    leerTodasLasFilas(() => supabase
      .from('sesiones_fisicas')
      .select('jugador_id, fecha, tipo, rpe')
      .in('jugador_id', ids)
      .not('rpe', 'is', null)
      .gte('fecha', desde28ISO)
      .lte('fecha', hoyISO)
      .order('fecha')
      .order('jugador_id')
      .order('tipo')),
    // El CMJ toma las últimas 4 mediciones de cada una, sin límite de fecha.
    leerTodasLasFilas(() => supabase
      .from('cmj')
      .select('jugador_id, fecha, valor_cm')
      .in('jugador_id', ids)
      .order('fecha', { ascending: false })
      .order('jugador_id')),
  ])

  const posicionPorId = new Map((posiciones.data || []).map((j) => [j.id, j.posicion]))
  const bienestarPor = agruparPorJugadora(bienestar.data)
  const asistenciasPor = agruparPorJugadora(asistencias.data)
  const statsPor = agruparPorJugadora(statsPartidos.data)
  const rpePor = agruparPorJugadora(rpe.data)
  const cmjPor = agruparPorJugadora(cmj.data)

  const resultados = {}
  for (const id of ids) {
    const wellness = wellnessDesdeFilas(bienestarPor.get(id), hoyISO)
    const carga = cargaDesdeFilas({
      posicion: posicionPorId.get(id),
      bloques: bloques.data,
      asistencias: asistenciasPor.get(id),
      statsPartidos: statsPor.get(id),
      rpe: rpePor.get(id),
    }, rango)
    const ultimosCmj = cmjDesdeFilas((cmjPor.get(id) || []).slice(0, 4))
    resultados[id] = combinarSemaforo(wellness, carga, ultimosCmj)
  }
  return resultados
}
