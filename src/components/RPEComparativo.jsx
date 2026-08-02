import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { calcularCargaJugador } from '../utils/semaforoRiesgo'
import { generarRPEIndividualPDF, generarRPECategoriaPDF } from '../utils/generarRPEPDF'

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
      const resultados = await Promise.all(jugadores.map((j) => calcularCargaJugador(j.id, categoria.id)))
      setResumenGeneral(jugadores.map((j, i) => ({ jugador: j, resultado: resultados[i] })))
    }
    cargarGeneral()
  }, [jugadorId, jugadores, categoria])

  const jugadorSeleccionado = jugadores.find((j) => j.id === jugadorId)

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
      } else {
        await generarRPECategoriaPDF(categoria?.nombre, resumenGeneral)
      }
    } finally {
      setGenerando(false)
    }
  }

  if (cargando) return <p style={{ color: '#5B6B85' }}>Cargando...</p>

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: '#5B6B85' }}>
        Carga (minutos reales × RPE) y ACWR (carga aguda de 7 días / carga crónica promedio de 28 días).
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={jugadorId}
          onChange={(e) => setJugadorId(e.target.value)}
          className="w-full sm:w-64 p-2.5 rounded-xl outline-none text-sm"
          style={inputStyle}
        >
          <option value="">Todo el plantel (general)</option>
          {jugadores.map((j) => (
            <option key={j.id} value={j.id}>
              {j.apellido}, {j.nombre}
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
              {resumenGeneral.map(({ jugador, resultado }, i) => (
                <tr key={jugador.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {jugador.apellido}, {jugador.nombre}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {resultado.cargaAguda !== null ? resultado.cargaAguda.toFixed(0) : '—'}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {resultado.cargaCronicaSemanal !== null ? resultado.cargaCronicaSemanal.toFixed(0) : '—'}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {resultado.acwr !== null ? resultado.acwr.toFixed(2) : '—'}
                  </td>
                  <td className="p-2.5">
                    {resultado.nivel ? (
                      <span
                        className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{
                          backgroundColor:
                            resultado.nivel === 'alerta'
                              ? '#F87171'
                              : resultado.nivel === 'moderado'
                              ? '#FBBF24'
                              : '#4ADE80',
                          color: '#0F1419',
                        }}
                      >
                        {resultado.nivel === 'alerta' ? 'Alerta' : resultado.nivel === 'moderado' ? 'Moderado' : 'Normal'}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: '#5B6B85' }}>
                        Sin datos
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {jugadorId && resultadoIndividual && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl" style={inputStyle}>
            <p className="text-xs" style={{ color: '#5B6B85' }}>
              Carga aguda (7 días)
            </p>
            <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
              {resultadoIndividual.cargaAguda !== null ? resultadoIndividual.cargaAguda.toFixed(0) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={inputStyle}>
            <p className="text-xs" style={{ color: '#5B6B85' }}>
              Carga crónica (prom. semanal)
            </p>
            <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
              {resultadoIndividual.cargaCronicaSemanal !== null
                ? resultadoIndividual.cargaCronicaSemanal.toFixed(0)
                : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={inputStyle}>
            <p className="text-xs" style={{ color: '#5B6B85' }}>
              ACWR
            </p>
            <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
              {resultadoIndividual.acwr !== null ? resultadoIndividual.acwr.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default RPEComparativo