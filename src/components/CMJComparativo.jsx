import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { calcularCMJDrop } from '../utils/semaforoRiesgo'
import { generarCMJIndividualPDF, generarCMJCategoriaPDF } from '../utils/generarCMJPDF'

function promedio(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length === 0) return null
  return limpios.reduce((a, b) => a + b, 0) / limpios.length
}

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

function CMJComparativo() {
  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [jugadorId, setJugadorId] = useState('')
  const [historial, setHistorial] = useState([])
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
      if (!jugadorId) {
        setHistorial([])
        return
      }
      const { data } = await supabase
        .from('cmj')
        .select('fecha, valor_cm')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })
        .limit(16)
      setHistorial(data || [])
    }
    cargarIndividual()
  }, [jugadorId])

  useEffect(() => {
    async function cargarGeneral() {
      if (jugadorId || jugadores.length === 0) {
        setResumenGeneral([])
        return
      }
      const resultados = await Promise.all(jugadores.map((j) => calcularCMJDrop(j.id)))
      setResumenGeneral(jugadores.map((j, i) => ({ jugador: j, resultado: resultados[i] })))
    }
    cargarGeneral()
  }, [jugadorId, jugadores])

  const hoy = new Date()
  const desdeSemana = fechaISO(restarDias(hoy, 6))
  const desdeMes = fechaISO(restarDias(hoy, 27))
  const promedioSemanal = promedio(historial.filter((h) => h.fecha >= desdeSemana).map((h) => h.valor_cm))
  const promedioMensual = promedio(historial.filter((h) => h.fecha >= desdeMes).map((h) => h.valor_cm))
  const ultimoValor = historial[0]?.valor_cm ?? null
  const jugadorSeleccionado = jugadores.find((j) => j.id === jugadorId)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  async function descargarPDF() {
    setGenerando(true)
    try {
      if (jugadorId && jugadorSeleccionado) {
        const resultado = await calcularCMJDrop(jugadorId)
        await generarCMJIndividualPDF(jugadorSeleccionado, historial, resultado)
      } else {
        await generarCMJCategoriaPDF(categoria?.nombre, resumenGeneral)
      }
    } finally {
      setGenerando(false)
    }
  }

  if (cargando) return <p style={{ color: '#5B6B85' }}>Cargando...</p>

  return (
    <div>
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
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Último (cm)</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>% baja</th>
                <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {resumenGeneral.map(({ jugador, resultado }, i) => (
                <tr key={jugador.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {jugador.apellido}, {jugador.nombre}
                  </td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>{resultado.ultimoValor ?? '—'}</td>
                  <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                    {resultado.porcentaje !== null ? `${resultado.porcentaje.toFixed(1)}%` : '—'}
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
                        {resultado.bajaConsecutiva ? ' · consecutiva' : ''}
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

      {jugadorId && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                Último
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {ultimoValor ?? '—'} cm
              </p>
            </div>
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                Prom. semanal
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {promedioSemanal !== null ? promedioSemanal.toFixed(1) : '—'} cm
              </p>
            </div>
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: '#5B6B85' }}>
                Prom. mensual
              </p>
              <p className="text-lg font-bold" style={{ color: '#F0F2F5' }}>
                {promedioMensual !== null ? promedioMensual.toFixed(1) : '—'} cm
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2A3548' }}>
            <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#1A2332' }}>
                  <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>
                    Fecha
                  </th>
                  <th className="text-left p-2.5" style={{ color: '#8A9BB8' }}>
                    Valor (cm)
                  </th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-2.5 text-sm" style={{ color: '#5B6B85' }}>
                      Sin mediciones cargadas.
                    </td>
                  </tr>
                )}
                {historial.map((h, i) => (
                  <tr key={h.fecha} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                    <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                      {h.fecha}
                    </td>
                    <td className="p-2.5" style={{ color: '#F0F2F5' }}>
                      {h.valor_cm}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default CMJComparativo