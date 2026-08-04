const RPE_MIN_DIAS_CRONICA = 12 // mínimo de días con carga calculable en 28 días para confiar en el ACWR
const RPE_MIN_DIAS_SEMANA = 3   // mínimo de días con RPE cargado en la semana (de los 4 de entrenamiento)

<<<<<<< HEAD
const ESTADO_COLORS = {
  normal: '#4ADE80',
  moderado: '#FBBF24',
  alerta: '#F87171',
}

function EstadoChip({ resultado }) {
  if (resultado?.nivel) {
    return (
      <span
        className="text-xs font-medium px-2 py-1 rounded-full"
        style={{
          backgroundColor: ESTADO_COLORS[resultado.nivel] || '#4ADE80',
          color: '#0F1419',
        }}
      >
        {resultado.nivel === 'alerta' ? 'Alerta' : resultado.nivel === 'moderado' ? 'Moderado' : 'Normal'}
      </span>
    )
  }

  if (resultado?.datosInsuficientes && resultado?.cargaSemanal !== null && resultado?.cargaSemanal !== undefined) {
    return (
      <span
        className="text-xs font-medium px-2 py-1 rounded-full"
        style={{
          backgroundColor: '#7DD3FC',
          color: '#082F49',
        }}
      >
        Respaldo: {resultado.cargaSemanal.toFixed(0)}
      </span>
    )
  }

  return (
    <span className="text-xs" style={{ color: '#5B6B85' }}>
      Sin datos
    </span>
  )
}

function formatearValor(valor, decimales = 0) {
  if (valor === null || valor === undefined) return '—'
  return Number(valor).toFixed(decimales)
}

function RPEComparativo() {
  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [jugadorId, setJugadorId] = useState('')
  const [resultadoIndividual, setResultadoIndividual] = useState(null)
  const [resumenGeneral, setResumenGeneral] = useState([])
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    async function cargarBase() {
      setCargando(true)
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)

      if (cat) {
        const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
        const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, cat.id, categoriasData)
        setJugadores(jugadoresData || [])
      }

      setCargando(false)
    }

    cargarBase()
  }, [])

  useEffect(() => {
    async function cargarIndividual() {
      if (!jugadorId || !categoria) {
        setResultadoIndividual(null)
        return
      }

      const resultado = await calcularCargaJugador(jugadorId, categoria.id)
      setResultadoIndividual(resultado)
    }

    cargarIndividual()
  }, [jugadorId, categoria])

  useEffect(() => {
    async function cargarGeneral() {
      if (jugadorId || jugadores.length === 0 || !categoria) {
        setResumenGeneral([])
        return
      }

      const resultados = await Promise.all(jugadores.map((jugador) => calcularCargaJugador(jugador.id, categoria.id)))
      setResumenGeneral(jugadores.map((jugador, index) => ({ jugador, resultado: resultados[index] })))
    }

    cargarGeneral()
  }, [jugadorId, jugadores, categoria])

  const jugadorSeleccionado = jugadores.find((jugador) => jugador.id === jugadorId)
=======
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
>>>>>>> b78d0358b0861f104b7430c40c28d51632dd887e

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

<<<<<<< HEAD
  async function descargarPDF() {
    setGenerando(true)
    try {
      if (jugadorId && jugadorSeleccionado && resultadoIndividual) {
        await generarRPEIndividualPDF(jugadorSeleccionado, resultadoIndividual)
        return
      }

      await generarRPECategoriaPDF(categoria?.nombre || 'Primera División', resumenGeneral)
    } finally {
      setGenerando(false)
    }
=======
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
>>>>>>> b78d0358b0861f104b7430c40c28d51632dd887e
  }

  // Respaldo: carga simple de esta semana, solo si hay al menos 3 de los 4
  // días de entrenamiento con RPE cargado; si no, queda nula.
  const diasConCargaSemana = Object.keys(cargaPorFecha).filter(
    (f) => f >= desdeSemanaISO && f <= hoyISO
  ).length
  const semanaInsuficiente = diasConCargaSemana < RPE_MIN_DIAS_SEMANA
  const cargaSemanal = semanaInsuficiente ? null : cargaAguda

<<<<<<< HEAD
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
        <div
          className="px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: '#1A2332',
            border: '1px solid #2A3548',
            color: '#8A9BB8',
          }}
        >
          Categoría fija: Primera División
        </div>

        <select
          value={jugadorId}
          onChange={(event) => setJugadorId(event.target.value)}
          className="w-full sm:w-72 p-2.5 rounded-xl outline-none text-sm"
          style={inputStyle}
        >
          <option value="">Todo el plantel (general)</option>
          {jugadores.map((jugador) => (
            <option key={jugador.id} value={jugador.id}>
              {jugador.apellido}, {jugador.nombre}
            </option>
          ))}
        </select>

        <button
          onClick={descargarPDF}
          disabled={generando}
          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
        >
          {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <p className="text-sm mb-4" style={{ color: '#5B6B85' }}>
        Carga (minutos reales × RPE) y ACWR (carga aguda de 7 días / carga crónica promedio de 28 días).
      </p>

      {!jugadorId && (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2A3548' }}>
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#1A2332' }}>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Jugadora</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Carga aguda (7d)</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Carga crónica</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>ACWR</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {resumenGeneral.map(({ jugador, resultado }, index) => (
                <tr key={jugador.id} style={{ backgroundColor: index % 2 === 0 ? 'transparent' : '#151D2A' }}>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {jugador.apellido}, {jugador.nombre}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {formatearValor(resultado?.cargaAguda, 0)}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {formatearValor(resultado?.cargaCronicaSemanal, 0)}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {formatearValor(resultado?.acwr, 2)}
                  </td>
                  <td className="p-2.5">
                    <EstadoChip resultado={resultado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {jugadorId && resultadoIndividual && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                Carga aguda (7 días)
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {formatearValor(resultadoIndividual.cargaAguda, 0)}
              </p>
            </div>

            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                Carga crónica (prom. semanal)
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {formatearValor(resultadoIndividual.cargaCronicaSemanal, 0)}
              </p>
            </div>

            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                ACWR
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {formatearValor(resultadoIndividual.acwr, 2)}
              </p>
            </div>
          </div>

          {resultadoIndividual.datosInsuficientes && (
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: '#172235',
                border: '1px solid #2A3548',
                color: '#F0F2F5',
              }}
            >
              <strong>Datos insuficientes para ACWR.</strong>{' '}
              {resultadoIndividual.cargaSemanal !== null && resultadoIndividual.cargaSemanal !== undefined
                ? `Carga semanal de respaldo: ${resultadoIndividual.cargaSemanal.toFixed(0)}`
                : resultadoIndividual.semanaInsuficiente
                ? 'Carga semanal de respaldo: Nula'
                : 'Carga semanal de respaldo: Nula'}
            </div>
          )}
        </div>
      )}
    </div>
  )
=======
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
>>>>>>> b78d0358b0861f104b7430c40c28d51632dd887e
}

export default RPEComparativo
