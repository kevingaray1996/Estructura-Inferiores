import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function MiniLinea({ serie, escalaMax, color }) {
  if (serie.length === 0) {
    return <p className="text-xs" style={{ color: '#5B6B85' }}>Sin registros en este período.</p>
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

function CMJComparativo() {
  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [jugadorId, setJugadorId] = useState('')
  const [periodo, setPeriodo] = useState('semana')
  const [metricas, setMetricas] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    async function cargarCategoria() {
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)
    }
    cargarCategoria()
  }, [])

  useEffect(() => {
    async function cargarJugadores() {
      if (!categoria) {
        setJugadores([])
        return
      }
      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data } = await supabase.from('jugadores').select('*').eq('categoria_id', categoria.id)
      const ordenados = (data || []).sort((a, b) => a.apellido.localeCompare(b.apellido))
      setJugadores(ordenados)
    }
    cargarJugadores()
  }, [categoria])

  useEffect(() => {
    async function cargar() {
      if (!jugadorId) {
        setMetricas(null)
        return
      }
      setCargando(true)

      const { data: registros } = await supabase
        .from('cmj')
        .select('fecha, valor_cm')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })

      const ahora = new Date()
      const ventanaDias = periodo === 'semana' ? 7 : 30
      const fechasRecientes = (registros || []).filter((r) => {
        const fechaRegistro = new Date(`${r.fecha}T00:00:00`)
        const diff = Math.floor((ahora - fechaRegistro) / 86400000)
        return diff <= ventanaDias
      })

      const serie = fechasRecientes
        .slice()
        .reverse()
        .map((r) => ({ fecha: r.fecha, valor: Number(r.valor_cm) }))

      setMetricas({ serie })
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
          CMJ
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Comparativo del salto contramovimiento por jugador en los últimos registros.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <select
            value={jugadorId}
            onChange={(e) => setJugadorId(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="">Elegí una jugadora</option>
            {jugadores.map((j) => (
              <option key={j.id} value={j.id}>
                {j.apellido}, {j.nombre}
              </option>
            ))}
          </select>

          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="semana">Última semana</option>
            <option value="mes">Último mes</option>
          </select>
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && !jugadorSeleccionado && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            Elegí una jugadora para ver su comparativo de CMJ.
          </p>
        )}

        {jugadorSeleccionado && metricas && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
              <div className="flex items-center gap-3 mb-3">
                {jugadorSeleccionado.foto_url ? (
                  <img
                    src={jugadorSeleccionado.foto_url}
                    alt={`${jugadorSeleccionado.apellido}, ${jugadorSeleccionado.nombre}`}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    {iniciales(jugadorSeleccionado.nombre, jugadorSeleccionado.apellido)}
                  </span>
                )}
                <div>
                  <p className="text-base font-semibold" style={{ color: '#F0F2F5' }}>
                    {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
                  </p>
                  <p className="text-xs" style={{ color: '#5B6B85' }}>
                    CMJ en los últimos {periodo === 'semana' ? '7 días' : '30 días'}
                  </p>
                </div>
              </div>

              <MiniLinea
                serie={metricas.serie}
                escalaMax={Math.max(50, ...metricas.serie.map((s) => s.valor))}
                color="#7DD3FC"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CMJComparativo
