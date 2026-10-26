import { PARTIDOS as P } from '../appearance/partidos'
import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { calcularCargaJugador } from '../utils/semaforoRiesgo'
import { generarRPEIndividualPDF, generarRPECategoriaPDF } from '../utils/generarRPEPDF'

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
    <span className="text-xs" style={{ color: P.tenue }}>
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
  const [filaExpandida, setFilaExpandida] = useState(null)

  useEffect(() => {
    async function cargarBase() {
      setCargando(true)

      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)

      if (cat) {
        const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
        const { data: jugadoresData } = await obtenerJugadoresDeCategoria(
          supabase,
          cat.id,
          categoriasData,
          { soloDisponibles: true }
        )
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

      const resultados = await Promise.all(
        jugadores.map((jugador) => calcularCargaJugador(jugador.id, categoria.id))
      )

      setResumenGeneral(jugadores.map((jugador, index) => ({ jugador, resultado: resultados[index] })))
    }

    cargarGeneral()
  }, [jugadorId, jugadores, categoria])

  const jugadorSeleccionado = jugadores.find((jugador) => jugador.id === jugadorId)

  const inputStyle = {
    backgroundColor: P.superficie,
    border: "1px solid var(--ui-compartido-borde, #2A3548)",
    color: P.texto,
  }

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
  }

  if (cargando) return <p style={{ color: P.tenue }}>Cargando...</p>

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
        <div
          className="px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: P.superficie,
            border: "1px solid var(--ui-compartido-borde, #2A3548)",
            color: P.secundario,
          }}
        >
          Categoría fija: Primera División
        </div>

        <select
          value={jugadorId}
          onChange={(event) => setJugadorId(event.target.value)}
          className="w-full sm:w-72 p-2.5 rounded-xl ui-control outline-none text-sm"
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
          style={{ backgroundColor: P.primario, color: P.sobrePrimario }}
        >
          {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <p className="text-sm mb-4" style={{ color: P.tenue }}>
        Carga (minutos reales × RPE) y ACWR (carga aguda de 7 días / carga crónica promedio de 28 días).
      </p>

      {!jugadorId && (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--ui-compartido-borde, #2A3548)" }}>
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: P.superficie }}>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>Jugadora</th>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>Carga aguda (7d)</th>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>Carga crónica</th>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>ACWR</th>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>Días sin RPE (28d)</th>
                <th className="text-left p-2.5" style={{ color: P.secundario }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {resumenGeneral.map(({ jugador, resultado }, index) => {
                const expandida = filaExpandida === jugador.id
                const fechasSinRPE = resultado?.diasFaltantesRPE || []

                return (
                  <Fragment key={jugador.id}>
                    <tr
                      onClick={() => setFilaExpandida((actual) => (actual === jugador.id ? null : jugador.id))}
                      style={{
                        backgroundColor: index % 2 === 0 ? 'transparent' : P.fila,
                        cursor: 'pointer',
                      }}
                    >
                      <td className="p-2.5" style={{ color: P.texto }}>
                        {jugador.apellido}, {jugador.nombre}
                      </td>
                      <td className="p-2.5" style={{ color: P.texto }}>
                        {formatearValor(resultado?.cargaAguda, 0)}
                      </td>
                      <td className="p-2.5" style={{ color: P.texto }}>
                        {formatearValor(resultado?.cargaCronicaSemanal, 0)}
                      </td>
                      <td className="p-2.5" style={{ color: P.texto }}>
                        {formatearValor(resultado?.acwr, 2)}
                      </td>
                      <td className="p-2.5" style={{ color: P.texto }}>
                        {fechasSinRPE.length}
                      </td>
                      <td className="p-2.5">
                        <EstadoChip resultado={resultado} />
                      </td>
                    </tr>
                    {expandida && (
                      <tr>
                        <td className="p-2.5" colSpan={6} style={{ color: P.texto, backgroundColor: 'var(--riesgo-detalle, #121A28)' }}>
                          <div className="text-sm">
                            <div className="font-semibold mb-2">Fechas sin RPE cargado (28d)</div>
                            {fechasSinRPE.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {fechasSinRPE.map((fecha) => (
                                  <span
                                    key={fecha}
                                    className="px-2 py-1 rounded-full text-xs"
                                    style={{ backgroundColor: P.superficie, color: P.texto }}
                                  >
                                    {fecha}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: P.tenue }}>Sin fechas pendientes</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {jugadorId && resultadoIndividual && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: P.tenue }}>
                Carga aguda (7 días)
              </p>
              <p className="text-lg font-bold" style={{ color: P.texto }}>
                {formatearValor(resultadoIndividual.cargaAguda, 0)}
              </p>
            </div>

            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: P.tenue }}>
                Carga crónica (prom. semanal)
              </p>
              <p className="text-lg font-bold" style={{ color: P.texto }}>
                {formatearValor(resultadoIndividual.cargaCronicaSemanal, 0)}
              </p>
            </div>

            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: P.tenue }}>
                ACWR
              </p>
              <p className="text-lg font-bold" style={{ color: P.texto }}>
                {formatearValor(resultadoIndividual.acwr, 2)}
              </p>
            </div>
          </div>

          {resultadoIndividual.datosInsuficientes && (
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--riesgo-respaldo, #172235)',
                border: "1px solid var(--ui-compartido-borde, #2A3548)",
                color: P.texto,
              }}
            >
              <strong>Datos insuficientes para ACWR.</strong>{' '}
              {resultadoIndividual.cargaSemanal !== null && resultadoIndividual.cargaSemanal !== undefined
                ? `Carga semanal de respaldo: ${resultadoIndividual.cargaSemanal.toFixed(0)}`
                : 'Carga semanal de respaldo: Nula'}
            </div>
          )}

          {resultadoIndividual.diasFaltantesRPE?.length > 0 && (
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: 'var(--riesgo-respaldo, #172235)',
                border: "1px solid var(--ui-compartido-borde, #2A3548)",
                color: P.texto,
              }}
            >
              <div className="font-semibold mb-2">Fechas con entrenamiento/partido sin RPE cargado</div>
              <div className="flex flex-wrap gap-2">
                {resultadoIndividual.diasFaltantesRPE.map((fecha) => (
                  <span
                    key={fecha}
                    className="px-2 py-1 rounded-full text-xs"
                    style={{ backgroundColor: P.superficie, color: P.texto }}
                  >
                    {fecha}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RPEComparativo
