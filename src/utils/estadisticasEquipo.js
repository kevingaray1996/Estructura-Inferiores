// Datos de «Estadísticas del equipo» (Partidos → Video). Supabase corta cada respuesta en 1000 filas, así que todo se
// pide en tandas hasta traer la última. El filtro por categoría se hace en la base, no en el teléfono.

export const TAMANO_TANDA = 1000

// `construir` arma la consulta de nuevo en cada tanda y tiene que traer un orden total (por id) para que las tandas
// no se pisen. Devuelve { data, error }; ante un error corta y lo devuelve.
export async function leerEnTandas(construir, tamano = TAMANO_TANDA) {
  const filas = []
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await construir().range(desde, desde + tamano - 1)
    if (error) return { data: null, error }
    filas.push(...(data || []))
    if (!data || data.length < tamano) return { data: filas, error: null }
  }
}

export function calcularResultado(p) {
  if (p.goles_local == null || p.goles_visitante == null) return null
  const golesPropios = p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
  const golesRivales = p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante

  let etiqueta
  if (golesPropios > golesRivales) etiqueta = 'Victoria'
  else if (golesPropios < golesRivales) etiqueta = 'Derrota'
  else etiqueta = 'Empate'

  if (golesPropios === golesRivales && p.penales_favor != null && p.penales_contra != null) {
    if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
    else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
  }

  return { etiqueta, golesPropios, golesRivales }
}

function ranking(totales, campo) {
  return [...totales.values()]
    .map((t) => ({ nombre: t.nombre, valor: t[campo] }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)
}

export function resumirEstadisticasEquipo(partidos, estadisticas) {
  let victorias = 0, empates = 0, derrotas = 0, favor = 0, contra = 0
  const conteoFormaciones = {}
  for (const p of partidos || []) {
    const r = calcularResultado(p)
    if (r) {
      if (r.etiqueta === 'Victoria') victorias++
      else if (r.etiqueta === 'Empate') empates++
      else derrotas++
      favor += r.golesPropios
      contra += r.golesRivales
    }
    if (p.formacion) conteoFormaciones[p.formacion] = (conteoFormaciones[p.formacion] || 0) + 1
  }

  // Se suma por jugadora (id), no por nombre: dos jugadoras con el mismo nombre no se mezclan.
  const totales = new Map()
  for (const s of estadisticas || []) {
    if (!s.jugadores) continue
    const t = totales.get(s.jugador_id) || { nombre: `${s.jugadores.apellido}, ${s.jugadores.nombre}`, goles: 0, asistencias: 0 }
    t.goles += s.goles || 0
    t.asistencias += s.asistencias || 0
    totales.set(s.jugador_id, t)
  }

  return {
    resultados: { victorias, empates, derrotas },
    goles: { favor, contra },
    formaciones: Object.entries(conteoFormaciones)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor),
    golesJugadoras: ranking(totales, 'goles'),
    asistJugadoras: ranking(totales, 'asistencias'),
  }
}

// Devuelve { datos } o { error }. Nunca lanza.
export async function leerEstadisticasEquipo(supabase, categoriaId) {
  try {
    const partidos = await leerEnTandas(() => {
      let q = supabase.from('partidos').select('*')
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null)
      if (categoriaId) q = q.eq('categoria_id', categoriaId)
      return q.order('id')
    })
    if (partidos.error) return { error: partidos.error }

    const estadisticas = await leerEnTandas(() => {
      // Con categoría, «!inner» deja solo las filas cuya jugadora es de esa categoría (filtro en la base).
      let q = supabase.from('estadisticas_jugador').select(categoriaId
        ? 'id, goles, asistencias, jugador_id, jugadores!inner(nombre, apellido, categoria_id)'
        : 'id, goles, asistencias, jugador_id, jugadores(nombre, apellido, categoria_id)')
      if (categoriaId) q = q.eq('jugadores.categoria_id', categoriaId)
      return q.order('id')
    })
    if (estadisticas.error) return { error: estadisticas.error }

    return { datos: resumirEstadisticasEquipo(partidos.data, estadisticas.data) }
  } catch (error) {
    return { error }
  }
}
