import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'

const CAMPOS = [
  const CAMPOS = [
  { clave: 'sueno', label: '¿Cómo dormiste?' },
  { clave: 'dolor_muscular', label: '¿Tenés dolor muscular?' },
  { clave: 'fatiga', label: '¿Qué tan cansado estás?' },
  { clave: 'estres', label: '¿Cómo está tu estrés?' },
  { clave: 'animo_entrenar', label: '¿Cómo estás de ánimo para entrenar?' },
]

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function fechaHaceNDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function BienestarPublico({ categoriaId }) {
  const fecha = obtenerFechaHoy()
  const fechaMinima = fechaHaceNDias(3)

  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [vista, setVista] = useState('bienestar')
  const [cargando, setCargando] = useState(true)

  // Bienestar (hoy)
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  // Esfuerzo percibido (RPE)
  const [fechaRpe, setFechaRpe] = useState(fecha)
  const [tipoRpe, setTipoRpe] = useState('entrenamiento')
  const [valorRpe, setValorRpe] = useState(null)
  const [rpeGuardando, setRpeGuardando] = useState(false)
  const [rpeEnviado, setRpeEnviado] = useState(false)
  const [rpeError, setRpeError] = useState('')

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const { data: categoriaData } = await supabase
        .from('categorias')
        .select('nombre')
        .eq('id', categoriaId)
        .maybeSingle()
      setCategoria(categoriaData)

      const { data: jugadoresData } = await supabase
        .from('jugadores_publico')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('apellido')
      setJugadores(jugadoresData || [])
      setCargando(false)
    }
    cargar()
  }, [categoriaId])

  async function elegirJugador(j) {
    setJugadorSeleccionado(j)
    setVista('bienestar')
    setEnviado(false)
    setError('')
    setRpeEnviado(false)
    setRpeError('')
    setFechaRpe(fecha)
    setTipoRpe('entrenamiento')
    const { data } = await supabase
      .from('bienestar')
      .select('*')
      .eq('jugador_id', j.id)
      .eq('fecha', fecha)
      .maybeSingle()
    setValores(data || {})
  }

  useEffect(() => {
    async function cargarRpe() {
      if (!jugadorSeleccionado || vista !== 'rpe') return
      setRpeEnviado(false)
      setRpeError('')
      const { data } = await supabase
        .from('sesiones_fisicas')
        .select('rpe')
        .eq('jugador_id', jugadorSeleccionado.id)
        .eq('fecha', fechaRpe)
        .eq('tipo', tipoRpe)
        .maybeSingle()
      setValorRpe(data?.rpe ?? null)
    }
    cargarRpe()
  }, [jugadorSeleccionado, vista, fechaRpe, tipoRpe])

  function marcar(campo, valor) {
    setValores((prev) => ({
      ...prev,
      [campo]: prev[campo] === valor ? null : valor,
    }))
  }

  async function handleEnviar() {
    const completo = CAMPOS.every((c) => valores[c.clave])
    if (!completo) {
      setError('Completá las 4 preguntas antes de enviar.')
      return
    }
    setGuardando(true)
    setError('')

    const registro = { fecha, jugador_id: jugadorSeleccionado.id }
    CAMPOS.forEach((c) => {
      registro[c.clave] = valores[c.clave]
    })

    const { error: errorGuardar } = await supabase
      .from('bienestar')
      .upsert(registro, { onConflict: 'fecha,jugador_id' })

    setGuardando(false)

    if (errorGuardar) {
      setError('No se pudo guardar: ' + errorGuardar.message)
      return
    }
    setEnviado(true)
  }

  async function handleEnviarRpe() {
    if (!valorRpe) {
      setRpeError('Elegí un valor del 1 al 10.')
      return
    }
    setRpeGuardando(true)
    setRpeError('')

    const { error: errorGuardar } = await supabase
      .from('sesiones_fisicas')
      .upsert(
        { fecha: fechaRpe, jugador_id: jugadorSeleccionado.id, tipo: tipoRpe, rpe: valorRpe },
        { onConflict: 'fecha,jugador_id,tipo' }
      )

    setRpeGuardando(false)

    if (errorGuardar) {
      setRpeError('No se pudo guardar: ' + errorGuardar.message)
      return
    }
    setRpeEnviado(true)
  }

  const jugadoresFiltrados = jugadores.filter((j) => {
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    return !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
  })

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0F1419' }}>
      <div className="max-w-md mx-auto pt-6">
        <h1
          className="text-2xl mb-1 flex items-center gap-2"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          <span>🧠</span> Bienestar
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          {categoria?.nombre ? `${categoria.nombre} · ` : ''}
          {fecha}
        </p>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && !jugadorSeleccionado && (
          <>
            <input
              type="text"
              placeholder="Buscá tu nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full p-3 rounded-xl outline-none text-sm mb-4"
              style={inputStyle}
            />
            <div className="space-y-2">
              {jugadoresFiltrados.map((j) => (
                <div
                  key={j.id}
                  onClick={() => elegirJugador(j)}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                  style={inputStyle}
                >
                  {j.foto_url ? (
                    <img
                      src={j.foto_url}
                      alt={`${j.apellido}, ${j.nombre}`}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                    >
                      {iniciales(j.nombre, j.apellido)}
                    </span>
                  )}
                  <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                    {j.apellido}, {j.nombre}
                  </p>
                </div>
              ))}
              {jugadoresFiltrados.length === 0 && (
                <p className="text-sm" style={{ color: '#5B6B85' }}>No se encontraron jugadores.</p>
              )}
            </div>
          </>
        )}

        {jugadorSeleccionado && (
          <>
            <button
              onClick={() => setJugadorSeleccionado(null)}
              className="text-sm mb-4 flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: '#8A9BB8' }}
            >
              ← No soy yo
            </button>

            <p className="text-sm font-medium mb-4" style={{ color: '#F0F2F5' }}>
              Hola, {jugadorSeleccionado.nombre} 👋
            </p>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setVista('bienestar')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'bienestar' ? '#4ADE80' : '#1A2332',
                  color: vista === 'bienestar' ? '#0F1419' : '#8A9BB8',
                  border: '1px solid #2A3548',
                }}
              >
                🧠 Bienestar
              </button>
              <button
                onClick={() => setVista('rpe')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'rpe' ? '#7DD3FC' : '#1A2332',
                  color: vista === 'rpe' ? '#0F1419' : '#8A9BB8',
                  border: '1px solid #2A3548',
                }}
              >
                💪 Esfuerzo (RPE)
              </button>
            </div>

            {vista === 'bienestar' && !enviado && (
              <>
                <div className="space-y-5 mb-6">
                  {CAMPOS.map((c) => (
                    <div key={c.clave}>
                      <p className="text-sm mb-2" style={{ color: '#F0F2F5' }}>{c.label}</p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((v) => {
                          const activo = valores[c.clave] === v
                          return (
                            <button
                              key={v}
                              onClick={() => marcar(c.clave, v)}
                              className="flex-1 py-3 rounded-xl text-sm font-mono transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: activo ? '#7DD3FC' : '#1A2332',
                                color: activo ? '#0F1419' : '#8A9BB8',
                                fontWeight: activo ? 700 : 400,
                                border: '1px solid #2A3548',
                              }}
                            >
                              {v}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px]" style={{ color: '#5B6B85' }}>Mejor</span>
                        <span className="text-[10px]" style={{ color: '#5B6B85' }}>Peor</span>
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <p className="text-sm mb-4" style={{ color: '#F87171' }}>{error}</p>
                )}

                <button
                  onClick={handleEnviar}
                  disabled={guardando}
                  className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
                >
                  {guardando ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}

            {vista === 'bienestar' && enviado && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm" style={{ color: '#F0F2F5' }}>
                  ¡Gracias! Ya se guardó tu bienestar de hoy.
                </p>
              </div>
            )}

            {vista === 'rpe' && !rpeEnviado && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Día</label>
                    <input
                      type="date"
                      value={fechaRpe}
                      min={fechaMinima}
                      max={fecha}
                      onChange={(e) => setFechaRpe(e.target.value)}
                      className="w-full p-2.5 rounded-xl outline-none text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Actividad</label>
                    <select
                      value={tipoRpe}
                      onChange={(e) => setTipoRpe(e.target.value)}
                      className="w-full p-2.5 rounded-xl outline-none text-sm"
                      style={inputStyle}
                    >
                      <option value="entrenamiento">Entrenamiento</option>
                      <option value="partido">Partido</option>
                    </select>
                  </div>
                </div>

                <p className="text-sm mb-2" style={{ color: '#F0F2F5' }}>
                  ¿Qué tan duro sentiste el esfuerzo?
                </p>
                <div className="grid grid-cols-5 gap-2 mb-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
                    const activo = valorRpe === v
                    return (
                      <button
                        key={v}
                        onClick={() => setValorRpe(v)}
                        className="py-3 rounded-xl text-sm font-mono transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: activo ? '#7DD3FC' : '#1A2332',
                          color: activo ? '#0F1419' : '#8A9BB8',
                          fontWeight: activo ? 700 : 400,
                          border: '1px solid #2A3548',
                        }}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
                <div className="flex justify-between mb-6">
                  <span className="text-[10px]" style={{ color: '#5B6B85' }}>Muy suave</span>
                  <span className="text-[10px]" style={{ color: '#5B6B85' }}>Al máximo</span>
                </div>

                {rpeError && (
                  <p className="text-sm mb-4" style={{ color: '#F87171' }}>{rpeError}</p>
                )}

                <button
                  onClick={handleEnviarRpe}
                  disabled={rpeGuardando}
                  className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#7DD3FC', color: '#0F1419' }}
                >
                  {rpeGuardando ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}

            {vista === 'rpe' && rpeEnviado && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm" style={{ color: '#F0F2F5' }}>
                  ¡Gracias! Ya se guardó tu esfuerzo de ese día.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default BienestarPublico
