import { supabase } from '../supabaseClient'

export const METRICAS_BIENESTAR = [
  { clave: 'sueno', label: 'Sueño', escalaMax: 5 },
  { clave: 'dolor_muscular', label: 'Dolor muscular', escalaMax: 5 },
  { clave: 'fatiga', label: 'Fatiga', escalaMax: 5 },
  { clave: 'estres', label: 'Estrés', escalaMax: 5 },
  { clave: 'rpe', label: 'Esfuerzo (RPE)', escalaMax: 10 },
]

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Para "semana": últimos 7 días (incluye hoy) vs los 7 días anteriores a esos.
// Para "mes": últimos 30 días vs los 30 días anteriores.
export function rangoPeriodo(periodo) {
  const dias = periodo === 'mes' ? 30 : 7
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const finActual = new Date(hoy)
  const inicioActual = new Date(hoy)
  inicioActual.setDate(inicioActual.getDate() - (dias - 1))

  const finAnterior = new Date(inicioActual)
  finAnterior.setDate(finAnterior.getDate() - 1)
  const inicioAnterior = new Date(finAnterior)
  inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1))

  return {
    inicioActualISO: fechaISO(inicioActual),
    finActualISO: fechaISO(finActual),
    inicioAnteriorISO: fechaISO(inicioAnterior),
    finAnteriorISO: fechaISO(finAnterior),
  }
}

function promedio(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length === 0) return null
  return limpios.reduce((a, b) => a + b, 0) / limpios.length
}

export async function cargarDatosBienestar(jugadorId, periodo) {
  const { inicioActualISO, finActualISO, inicioAnteriorISO, finAnteriorISO } = rangoPeriodo(periodo)

  const { data: bienestarData } = await supabase
    .from('bienestar')
    .select('*')
    .eq('jugador_id', jugadorId)
    .gte('fecha', inicioAnteriorISO)
    .lte('fecha', finActualISO)
    .order('fecha', { ascending: true })

  const { data: fisicoData } = await supabase
    .from('sesiones_fisicas')
    .select('fecha, rpe')
    .eq('jugador_id', jugadorId)
    .not('rpe', 'is', null)
    .gte('fecha', inicioAnteriorISO)
    .lte('fecha', finActualISO)
    .order('fecha', { ascending: true })

  // RPE: si hay más de un registro el mismo día (entrenamiento + partido), promediamos ese día.
  const rpePorDia = {}
  ;(fisicoData || []).forEach((f) => {
    if (!rpePorDia[f.fecha]) rpePorDia[f.fecha] = []
    rpePorDia[f.fecha].push(f.rpe)
  })
  const rpeSerieCompleta = Object.entries(rpePorDia)
    .map(([fecha, valores]) => ({ fecha, valor: promedio(valores) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const metricas = METRICAS_BIENESTAR.map((m) => {
    let serieCompleta
    if (m.clave === 'rpe') {
      serieCompleta = rpeSerieCompleta
    } else {
      serieCompleta = (bienestarData || [])
        .filter((b) => b[m.clave] !== null && b[m.clave] !== undefined)
        .map((b) => ({ fecha: b.fecha, valor: b[m.clave] }))
    }

    const serieActual = serieCompleta.filter((s) => s.fecha >= inicioActualISO && s.fecha <= finActualISO)
    const serieAnterior = serieCompleta.filter((s) => s.fecha >= inicioAnteriorISO && s.fecha <= finAnteriorISO)

    const promedioActual = promedio(serieActual.map((s) => s.valor))
    const promedioAnterior = promedio(serieAnterior.map((s) => s.valor))

    let tendencia = null
    if (promedioActual !== null && promedioAnterior !== null) {
      const diff = promedioActual - promedioAnterior
      if (Math.abs(diff) < 0.15) tendencia = 'estable'
      else tendencia = diff > 0 ? 'sube' : 'baja'
    }

    return {
      ...m,
      promedioActual,
      promedioAnterior,
      tendencia,
      serie: serieActual,
    }
  })

  return { metricas }
}

// Revisa a un grupo de jugadores y devuelve, para cada uno que tenga algo
// preocupante en la semana, un resumen con las métricas que dispararon la alerta.
export async function cargarAlertasBienestar(jugadores) {
  const alertas = []

  for (const j of jugadores) {
    const { metricas } = await cargarDatosBienestar(j.id, 'semana')
    const motivos = []

    metricas.forEach((m) => {
      if (m.promedioActual === null) return
      const escala5 = m.escalaMax === 5
      const valorAlto = escala5 ? m.promedioActual >= 4 : m.promedioActual >= 8
      const empeoroFuerte =
        m.promedioAnterior !== null && m.promedioActual - m.promedioAnterior >= (escala5 ? 1.2 : 2)

      if (valorAlto) {
        motivos.push(`${m.label} alto (${m.promedioActual.toFixed(1)}/${m.escalaMax})`)
      } else if (empeoroFuerte) {
        motivos.push(`${m.label} empeoró (${m.promedioAnterior.toFixed(1)} → ${m.promedioActual.toFixed(1)})`)
      }
    })

    if (motivos.length > 0) {
      alertas.push({
        jugadorId: j.id,
        nombre: j.nombre,
        apellido: j.apellido,
        resumenTexto: motivos.join(', '),
      })
    }
  }

  return alertas
}
