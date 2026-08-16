import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { COLORES } from '../theme'

 const CAMPOS = [
  { clave: 'sueno', label: '¿Cómo dormiste?' },
  { clave: 'dolor_muscular', label: '¿Tenés dolor muscular?' },
  { clave: 'fatiga', label: '¿Qué tan cansado estás?' },
  { clave: 'estres', label: '¿Cómo está tu estrés?' },
  { clave: 'animo_entrenar', label: '¿Cómo estás de ánimo para entrenar?' },
]

const FASES_CICLO = [
  { valor: 'menstrual', label: 'Menstrual' },
  { valor: 'folicular', label: 'Folicular' },
  { valor: 'ovulacion', label: 'Ovulación' },
  { valor: 'lutea', label: 'Lútea' },
  { valor: 'no_responde', label: 'No estoy segura / Prefiero no responder' },
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
  const [mostrarAyudaCiclo, setMostrarAyudaCiclo] = useState(false)

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
    const yaCompleto = data && CAMPOS.every((c) => data[c.clave])
    setEnviado(!!yaCompleto)
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

  function actualizarTexto(campo, valor) {
    setValores((prev) => ({
      ...prev,
      [campo]: valor,
    }))
  }

  function elegirFase(valor) {
    setValores((prev) => ({
      ...prev,
      fase_ciclo: prev.fase_ciclo === valor ? null : valor,
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

    const registro = {
      fecha,
      jugador_id: jugadorSeleccionado.id,
      zona_dolor: valores.zona_dolor?.trim() || null,
      fase_ciclo: valores.fase_ciclo || null,
    }
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
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: COLORES.fondoPagina }}>
      <div className="max-w-md mx-auto pt-6">
        <h1
          className="text-2xl mb-1 flex items-center gap-2"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          <span>🧠</span> Bienestar
        </h1>
        <p className="text-sm mb-6" style={{ color: COLORES.textoMuted }}>
          {categoria?.nombre ? `${categoria.nombre} · ` : ''}
          {fecha}
        </p>

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

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
                      style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                    >
                      {iniciales(j.nombre, j.apellido)}
                    </span>
                  )}
                  <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                    {j.apellido}, {j.nombre}
                  </p>
                </div>
              ))}
              {jugadoresFiltrados.length === 0 && (
                <p className="text-sm" style={{ color: COLORES.textoMuted }}>No se encontraron jugadores.</p>
              )}
            </div>
          </>
        )}

        {jugadorSeleccionado && (
          <>
            <button
              onClick={() => setJugadorSeleccionado(null)}
              className="text-sm mb-4 flex items-center gap-1 hover:opacity-70 transition-opacity"
              style={{ color: COLORES.textoSecundario }}
            >
              ← No soy yo
            </button>

            <p className="text-sm font-medium mb-4" style={{ color: COLORES.texto }}>
              Hola, {jugadorSeleccionado.nombre} 👋
            </p>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setVista('bienestar')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'bienestar' ? COLORES.acento : COLORES.fondoTarjeta,
                  color: vista === 'bienestar' ? '#1A1A1A' : COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                🧠 Bienestar
              </button>
              <button
                onClick={() => setVista('rpe')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: vista === 'rpe' ? COLORES.acento : COLORES.fondoTarjeta,
                  color: vista === 'rpe' ? '#1A1A1A' : COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
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
                      <p className="text-sm mb-2" style={{ color: COLORES.texto }}>{c.label}</p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((v) => {
                          const activo = valores[c.clave] === v
                          return (
                            <button
                              key={v}
                              onClick={() => marcar(c.clave, v)}
                              className="flex-1 py-3 rounded-xl text-sm font-mono transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: activo ? COLORES.acento : COLORES.fondoTarjeta,
                                color: activo ? '#1A1A1A' : COLORES.textoSecundario,
                                fontWeight: activo ? 700 : 400,
                                border: `1px solid ${COLORES.borde}`,
                              }}
                            >
                              {v}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Mejor</span>
                        <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Peor</span>
                      </div>
                      {c.clave === 'dolor_muscular' && (
                        <div className="mt-3">
                          <label className="text-sm mb-2 block" style={{ color: COLORES.texto }}>
                            ¿Qué parte del cuerpo te duele?
                          </label>
                          <textarea
                            rows={3}
                            value={valores.zona_dolor || ''}
                            onChange={(e) => actualizarTexto('zona_dolor', e.target.value)}
                            placeholder="Ej: rodilla, espalda, hombro..."
                            className="w-full p-3 rounded-xl outline-none text-sm"
                            style={{
                              ...inputStyle,
                              resize: 'vertical',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mb-6" style={{ borderTop: `1px solid ${COLORES.borde}`, paddingTop: '1.25rem' }}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm" style={{ color: COLORES.texto }}>Fase del ciclo menstrual</p>
                    <button
                      type="button"
                      onClick={() => setMostrarAyudaCiclo((v) => !v)}
                      className="text-xs"
                      style={{ color: COLORES.acento }}
                    >
                      ❔ ¿Qué es esto?
                    </button>
                  </div>
                  <p className="text-xs mb-2" style={{ color: COLORES.textoMuted }}>
                    Solo lo ven preparación física, coordinación y cuerpo técnico.
                  </p>

                  {mostrarAyudaCiclo && (
                    <div
                      className="rounded-xl p-3 mb-3 text-xs"
                      style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${COLORES.borde}` }}
                    >
                      <p className="font-medium mb-1" style={{ color: COLORES.acento }}>Menstrual (días 1 a 5 aprox.)</p>
                      <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Cuando tenés tu período.</p>
                      <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Folicular (después del período)</p>
                      <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Los días siguientes, hasta la ovulación.</p>
                      <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Ovulación (mitad del ciclo)</p>
                      <p className="mb-2" style={{ color: COLORES.textoSecundario }}>Alrededor del día 14, aprox.</p>
                      <p className="font-medium mb-1" style={{ color: COLORES.textoSecundario }}>Lútea (previo al próximo período)</p>
                      <p style={{ color: COLORES.textoSecundario }}>Los días antes de que vuelva a empezar.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {FASES_CICLO.map((f) => {
                      const activo = valores.fase_ciclo === f.valor
                      return (
                        <button
                          key={f.valor}
                          type="button"
                          onClick={() => elegirFase(f.valor)}
                          className="text-left px-3 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: activo ? COLORES.acento : COLORES.fondoTarjeta,
                            color: activo ? '#1A1A1A' : f.valor === 'no_responde' ? COLORES.textoMuted : COLORES.textoSecundario,
                            border: `1px solid ${COLORES.borde}`,
                            fontWeight: activo ? 500 : 400,
                          }}
                        >
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {error && (
                  <p className="text-sm mb-4" style={{ color: COLORES.peligro }}>{error}</p>
                )}

                <button
                  onClick={handleEnviar}
                  disabled={guardando}
                  className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
                >
                  {guardando ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}

            {vista === 'bienestar' && enviado && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm mb-4" style={{ color: COLORES.texto }}>
                  ¡Gracias! Ya se guardó tu bienestar de hoy.
                </p>
                <button
                  onClick={() => setEnviado(false)}
                  className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
                >
                  ✏️ Editar mi respuesta
                </button>
              </div>
            )}

            {vista === 'rpe' && !rpeEnviado && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Día</label>
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
                    <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Actividad</label>
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

                <p className="text-sm mb-2" style={{ color: COLORES.texto }}>
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
                          backgroundColor: activo ? COLORES.acento : COLORES.fondoTarjeta,
                          color: activo ? '#1A1A1A' : COLORES.textoSecundario,
                          fontWeight: activo ? 700 : 400,
                          border: `1px solid ${COLORES.borde}`,
                        }}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
                <div className="flex justify-between mb-6">
                  <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Muy suave</span>
                  <span className="text-[10px]" style={{ color: COLORES.textoMuted }}>Al máximo</span>
                </div>

                {rpeError && (
                  <p className="text-sm mb-4" style={{ color: COLORES.peligro }}>{rpeError}</p>
                )}

                <button
                  onClick={handleEnviarRpe}
                  disabled={rpeGuardando}
                  className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
                >
                  {rpeGuardando ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}

            {vista === 'rpe' && rpeEnviado && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm" style={{ color: COLORES.texto }}>
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
