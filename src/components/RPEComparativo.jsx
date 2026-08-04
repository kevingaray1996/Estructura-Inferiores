import { useEffect, useState } from 'react'
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

      const resultados = await Promise.all(
        jugadores.map((jugador) => calcularCargaJugador(jugador.id, categoria.id))
      )

      setResumenGeneral(jugadores.map((jugador, index) => ({ jugador, resultado: resultados[index] })))
    }

    cargarGeneral()
  }, [jugadorId, jugadores, categoria])

  const jugadorSeleccionado = jugadores.find((jugador) => jugador.id === jugadorId)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
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

  if (cargando) return <p style={{ color: '#5B6B85' }}>Cargando...</p>

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
                : 'Carga semanal de respaldo: Nula'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RPEComparativo
