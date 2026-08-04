import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function PaseCategoriaSection() {
  const [categorias, setCategorias] = useState([])
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [temporada, setTemporada] = useState('')
  const [jugadores, setJugadores] = useState([])
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [])

  useEffect(() => {
    async function cargarJugadores() {
      if (!origenId) {
        setJugadores([])
        setSeleccionados(new Set())
        return
      }
      setCargando(true)
      const { data } = await supabase
        .from('jugadores')
        .select('*')
        .eq('categoria_id', origenId)
        .order('apellido')
      setJugadores(data || [])
      setSeleccionados(new Set((data || []).map((j) => j.id)))
      setCargando(false)
    }
    cargarJugadores()
  }, [origenId])

  function toggleJugador(id) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  function toggleTodos() {
    if (seleccionados.size === jugadores.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(jugadores.map((j) => j.id)))
    }
  }

  async function handleConfirmar() {
    setMensaje('')
    if (!origenId || !destinoId) {
      setMensaje('Elegí categoría de origen y destino.')
      return
    }
    if (origenId === destinoId) {
      setMensaje('El origen y el destino no pueden ser la misma categoría.')
      return
    }
    if (seleccionados.size === 0) {
      setMensaje('Seleccioná al menos un jugador.')
      return
    }

    const confirmar = window.confirm(
      `¿Confirmás el pase de ${seleccionados.size} jugador(es) a la nueva categoría? Esta acción actualiza su categoría actual.`
    )
    if (!confirmar) return

    setGuardando(true)

    const ids = [...seleccionados]

    const { error: errorUpdate } = await supabase
      .from('jugadores')
      .update({ categoria_id: destinoId })
      .in('id', ids)

    if (errorUpdate) {
      setMensaje('Error al actualizar jugadores: ' + errorUpdate.message)
      setGuardando(false)
      return
    }

    const filasHistorial = ids.map((jugadorId) => ({
      jugador_id: jugadorId,
      categoria_anterior_id: origenId,
      categoria_nueva_id: destinoId,
      temporada: temporada || null,
    }))

    const { error: errorHistorial } = await supabase.from('historial_categorias').insert(filasHistorial)

    setGuardando(false)
    if (errorHistorial) {
      setMensaje('Los jugadores se actualizaron, pero hubo un error guardando el historial: ' + errorHistorial.message)
      return
    }

    setMensaje(`Listo: ${ids.length} jugador(es) pasaron de categoría.`)
    setJugadores((prev) => prev.filter((j) => !seleccionados.has(j.id)))
    setSeleccionados(new Set())
  }

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <h1
          className="text-2xl md:text-3xl mb-2"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          Pase de categoría
        </h1>
        <p className="text-xs mb-6" style={{ color: COLORES.textoMuted }}>
          Para usar a fin de temporada: elegí de qué categoría a cuál pasan los jugadores
          seleccionados. Queda guardado en la trayectoria de cada jugador.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select
            value={origenId}
            onChange={(e) => setOrigenId(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="">Categoría origen</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="">Categoría destino</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          placeholder="Temporada (ej: 2026, opcional)"
          value={temporada}
          onChange={(e) => setTemporada(e.target.value)}
          className="w-full p-2.5 rounded-xl outline-none text-sm mb-6"
          style={inputStyle}
        />

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando jugadores...</p>}

        {!cargando && origenId && jugadores.length === 0 && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>
            No hay jugadores en esa categoría.
          </p>
        )}

        {jugadores.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide" style={{ color: COLORES.textoMuted }}>
                Jugadores ({seleccionados.size}/{jugadores.length})
              </p>
              <button
                onClick={toggleTodos}
                className="text-xs"
                style={{ color: COLORES.exito }}
              >
                {seleccionados.size === jugadores.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="space-y-1.5 mb-6 max-h-80 overflow-y-auto">
              {jugadores.map((j) => (
                <label
                  key={j.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer"
                  style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
                >
                  <input
                    type="checkbox"
                    checked={seleccionados.has(j.id)}
                    onChange={() => toggleJugador(j.id)}
                  />
                  {j.foto_url ? (
                    <img
                      src={j.foto_url}
                      alt={`${j.apellido}, ${j.nombre}`}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                    >
                      {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm" style={{ color: COLORES.texto }}>
                    {j.apellido}, {j.nombre}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {mensaje && (
          <p className="text-sm mb-4" style={{ color: mensaje.startsWith('Listo') ? COLORES.exito : COLORES.peligro }}>
            {mensaje}
          </p>
        )}

        <button
          onClick={handleConfirmar}
          disabled={guardando || jugadores.length === 0}
          className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
        >
          {guardando ? 'Procesando...' : 'Confirmar pase'}
        </button>
      </div>
    </div>
  )
}

export default PaseCategoriaSection



