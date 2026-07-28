import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { cargarDatosBienestar } from '../utils/bienestar' 
import { generarBienestarPDF } from '../utils/generarBienestarPDF'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function MiniLinea({ serie, escalaMax, color }) {
  if (serie.length === 0) {
    return (
      <p className="text-xs" style={{ color: '#5B6B85' }}>
        Sin registros en este período.
      </p>
    )
  }

  const ancho = 320
  const alto = 90
  const paddingX = 10
  const paddingY = 10

  const puntos = serie.map((s, i) => {
    const x = serie.length === 1 ? ancho / 2 : paddingX + (i / (serie.length - 1)) * (ancho - paddingX * 2)
    const y = paddingY + (1 - s.valor / escalaMax) * (alto - paddingY * 2)
    return { x, y, valor: s.valor, fecha: s.fecha }
  })

  const pathD = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${ancho} ${alto + 16}`} width="100%" height={alto + 16}>
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
      {puntos.map((p, i) => (
        <text key={`t-${i}`} x={p.x} y={alto + 14} fontSize="7" fill="#5B6B85" textAnchor="middle">
          {p.fecha.slice(5).replace('-', '/')}
        </text>
      ))}
    </svg>
  )
}

function BienestarComparativo({ perfil, jugadorInicialId, onConsumirJugadorInicial }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [jugadores, setJugadores] = useState([])
  const [jugadorId, setJugadorId] = useState('')
  const [periodo, setPeriodo] = useState('semana')
  const [metricas, setMetricas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  async function handleDescargarPdf() {
  if (!jugadorSeleccionado) return
  setGenerandoPdf(true)
  try {
    await generarBienestarPDF(jugadorSeleccionado, periodo)
  } finally {
    setGenerandoPdf(false)
  }
}

  useEffect(() => {
    if (esTecnico) return
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [esTecnico])

  useEffect(() => {
    async function aplicarJugadorInicial() {
      if (!jugadorInicialId) return
      const { data: jugadorData } = await supabase
        .from('jugadores')
        .select('id, categoria_id')
        .eq('id', jugadorInicialId)
        .single()
      if (jugadorData) {
        setCategoriaId(jugadorData.categoria_id)
        setJugadorId(jugadorData.id)
      }
      onConsumirJugadorInicial?.()
    }
    aplicarJugadorInicial()
  }, [jugadorInicialId, onConsumirJugadorInicial])

  useEffect(() => {
    async function cargarJugadores() {
      if (!categoriaId) {
        setJugadores([])
        return
      }
      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data } = await obtenerJugadoresDeCategoria(supabase, categoriaId, categoriasData)
      setJugadores(data || [])
    }
    cargarJugadores()
  }, [categoriaId])

  useEffect(() => {
    async function cargar() {
      if (!jugadorId) {
        setMetricas(null)
        return
      }
      setCargando(true)
      const { metricas: m } = await cargarDatosBienestar(jugadorId, periodo)
      setMetricas(m)
      setCargando(false)
    }
    cargar()
  }, [jugadorId, periodo])

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  const jugadorSeleccionado = jugadores.find((j) => j.id === jugadorId)

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-1"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Bienestar
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Comparativo semanal y mensual de sueño, dolor muscular, fatiga, estrés y esfuerzo percibido (RPE).
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {!esTecnico && (
            <select
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value)
                setJugadorId('')
              }}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            >
              <option value="">Elegí una categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
          <select
            value={jugadorId}
            onChange={(e) => setJugadorId(e.target.value)}
            disabled={!categoriaId}
            className="w-full p-2.5 rounded-xl outline-none text-sm disabled:opacity-50"
            style={inputStyle}
          >
            <option value="">Elegí una jugadora</option>
            {jugadores.map((j) => (
              <option key={j.id} value={j.id}>
                {j.apellido}, {j.nombre}
              </option>
            ))}
          </select>
        </div>

        {jugadorSeleccionado && (
          <div className="flex items-center gap-3 mb-6">
            {jugadorSeleccionado.foto_url ? (
              <img
                src={jugadorSeleccionado.foto_url}
                alt={jugadorSeleccionado.apellido}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: '#1A2332', color: '#8A9BB8' }}
              >
                {iniciales(jugadorSeleccionado.nombre, jugadorSeleccionado.apellido)}
              </span>
            )}
            <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
              {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
            </p>
          </div>
        )}

       {jugadorId && (
          <div className="flex gap-2 mb-6">
            {[
              { key: 'semana', label: 'Última semana' },
              { key: 'mes', label: 'Último mes' },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className="flex-1 p-2.5 rounded-xl text-sm font-medium transition-opacity"
                style={
                  periodo === p.key
                    ? { backgroundColor: '#4ADE80', color: '#0F1419' }
                    : { backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#8A9BB8' }
                }
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={handleDescargarPdf}
              disabled={generandoPdf}
              className="px-4 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
            >
              {generandoPdf ? '...' : '📄 PDF'}
            </button>
          </div>
        )}

        {!jugadorId && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            Elegí una categoría y una jugadora para ver su comparativo.
          </p>
        )}

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && metricas && (
          <div className="space-y-4">
            {metricas.map((m) => {
              const colorLinea = m.clave === 'rpe' ? '#FBBF24' : '#7DD3FC'
              const colorTendencia =
                m.tendencia === null
                  ? '#5B6B85'
                  : m.tendencia === 'estable'
                  ? '#8A9BB8'
                  : m.clave === 'rpe'
                  ? '#FBBF24'
                  : m.tendencia === 'sube'
                  ? '#F87171'
                  : '#4ADE80'
              const flecha = m.tendencia === 'sube' ? '↑ subió' : m.tendencia === 'baja' ? '↓ bajó' : m.tendencia === 'estable' ? '→ estable' : ''

              return (
                <div key={m.clave} className="p-4 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                      {m.label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-mono" style={{ color: '#F0F2F5' }}>
                        {m.promedioActual !== null ? m.promedioActual.toFixed(1) : '—'}
                        <span className="text-xs" style={{ color: '#5B6B85' }}> / {m.escalaMax}</span>
                      </span>
                      {flecha && (
                        <span className="text-xs" style={{ color: colorTendencia }}>
                          {flecha}
                          {m.promedioAnterior !== null && ` (antes ${m.promedioAnterior.toFixed(1)})`}
                        </span>
                      )}
                    </div>
                  </div>
                  <MiniLinea serie={m.serie} escalaMax={m.escalaMax} color={colorLinea} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default BienestarComparativo
