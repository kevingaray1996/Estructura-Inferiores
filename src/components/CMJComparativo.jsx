import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { calcularCMJDrop } from '../utils/semaforoRiesgo'
import { generarCMJIndividualPDF, generarCMJCategoriaPDF } from '../utils/generarCMJPDF'
import { COLORES } from '../theme'

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

function formatearFechaCorta(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-')
  return `${dia}.${mes}.${anio.slice(2)}`
}

function GraficoCMJ({ historial }) {
  if (historial.length < 2) {
    return (
      <p className="text-sm mb-6" style={{ color: COLORES.textoMuted }}>
        Hace falta al menos 2 mediciones para mostrar el gráfico de evolución.
      </p>
    )
  }

  const datos = [...historial].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const valores = datos.map((d) => d.valor_cm)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const w = 700
  const h = 190
  const padX = 12
  const padTop = 18
  const padBottom = 10

  const puntos = datos.map((d, i) => {
    const x = datos.length === 1 ? w / 2 : padX + (i / (datos.length - 1)) * (w - padX * 2)
    const y = padTop + (1 - (d.valor_cm - min) / rango) * (h - padTop - padBottom)
    return { x, y, ...d }
  })

  const lineaPath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${lineaPath} L ${puntos[puntos.length - 1].x} ${h} L ${puntos[0].x} ${h} Z`
  const medio = Math.floor(datos.length / 2)

  return (
    <div className="mb-6">
      <p className="text-xs tracking-widest uppercase mb-2" style={{ color: COLORES.textoMuted }}>
        Altura de salto (cm)
      </p>
      <div className="rounded-xl p-3" style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${COLORES.borde}` }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 180, display: 'block' }}>
          <defs>
            <linearGradient id="gradienteCMJ" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORES.peligro} stopOpacity="0.35" />
              <stop offset="100%" stopColor={COLORES.peligro} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#gradienteCMJ)" stroke="none" />
          <path d={lineaPath} fill="none" stroke={COLORES.peligro} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {puntos.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={COLORES.peligro} stroke={COLORES.fondoTarjeta} strokeWidth="1.5" />
          ))}
        </svg>
        <div className="flex justify-between text-xs mt-1" style={{ color: COLORES.textoMuted }}>
          <span>{formatearFechaCorta(datos[0].fecha)}</span>
          {datos.length > 2 && <span>{formatearFechaCorta(datos[medio].fecha)}</span>}
          <span>{formatearFechaCorta(datos[datos.length - 1].fecha)}</span>
        </div>
      </div>
    </div>
  )
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
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
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

  if (cargando) return <p style={{ color: COLORES.textoMuted }}>Cargando...</p>

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
          style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
        >
          {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      {!jugadorId && (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${COLORES.borde}` }}>
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: COLORES.fondoTarjeta }}>
                <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>Jugadora</th>
                <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>Último (cm)</th>
                <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>% baja</th>
                <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {resumenGeneral.map(({ jugador, resultado }, i) => (
                <tr
                  key={jugador.id}
                  onClick={() => setJugadorId(jugador.id)}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#1F1F1D' }}
                >
                  <td className="p-2.5" style={{ color: COLORES.texto }}>
                    {jugador.apellido}, {jugador.nombre}
                  </td>
                  <td className="p-2.5" style={{ color: COLORES.texto }}>{resultado.ultimoValor ?? '—'}</td>
                  <td className="p-2.5" style={{ color: COLORES.texto }}>
                    {resultado.porcentaje !== null ? `${resultado.porcentaje.toFixed(1)}%` : '—'}
                  </td>
                  <td className="p-2.5">
                    {resultado.nivel ? (
                      <span
                        className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{
                          backgroundColor:
                            resultado.nivel === 'alerta'
                              ? COLORES.peligro
                              : resultado.nivel === 'moderado'
                              ? COLORES.acento
                              : COLORES.exito,
                          color: '#1A1A1A',
                        }}
                      >
                        {resultado.nivel === 'alerta' ? 'Alerta' : resultado.nivel === 'moderado' ? 'Moderado' : 'Normal'}
                        {resultado.bajaConsecutiva ? ' · consecutiva' : ''}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: COLORES.textoMuted }}>
                        Sin datos
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs p-2.5" style={{ color: COLORES.textoMuted }}>
            Tocá una jugadora para ver su evolución individual.
          </p>
        </div>
      )}

      {jugadorId && (
        <>
          <button
            onClick={() => setJugadorId('')}
            className="text-sm mb-4 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver al plantel
          </button>

          <p className="text-sm font-medium mb-4" style={{ color: COLORES.texto }}>
            {jugadorSeleccionado?.apellido}, {jugadorSeleccionado?.nombre}
          </p>

          <GraficoCMJ historial={historial} />

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: COLORES.textoMuted }}>
                Último
              </p>
              <p className="text-lg font-bold" style={{ color: COLORES.texto }}>
                {ultimoValor ?? '—'} cm
              </p>
            </div>
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: COLORES.textoMuted }}>
                Prom. semanal
              </p>
              <p className="text-lg font-bold" style={{ color: COLORES.texto }}>
                {promedioSemanal !== null ? promedioSemanal.toFixed(1) : '—'} cm
              </p>
            </div>
            <div className="p-3 rounded-xl" style={inputStyle}>
              <p className="text-xs" style={{ color: COLORES.textoMuted }}>
                Prom. mensual
              </p>
              <p className="text-lg font-bold" style={{ color: COLORES.texto }}>
                {promedioMensual !== null ? promedioMensual.toFixed(1) : '—'} cm
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${COLORES.borde}` }}>
            <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: COLORES.fondoTarjeta }}>
                  <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>
                    Fecha
                  </th>
                  <th className="text-left p-2.5" style={{ color: COLORES.textoSecundario }}>
                    Valor (cm)
                  </th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-2.5 text-sm" style={{ color: COLORES.textoMuted }}>
                      Sin mediciones cargadas.
                    </td>
                  </tr>
                )}
                {historial.map((h, i) => (
                  <tr key={h.fecha} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#1F1F1D' }}>
                    <td className="p-2.5" style={{ color: COLORES.texto }}>
                      {h.fecha}
                    </td>
                    <td className="p-2.5" style={{ color: COLORES.texto }}>
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
