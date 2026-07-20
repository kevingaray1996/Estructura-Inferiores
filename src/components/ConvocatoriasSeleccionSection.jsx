import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatearFecha(fecha) {
  if (!fecha) return null
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

function ConvocatoriasSeleccionSection({ onVolver }) {
  const [convocatorias, setConvocatorias] = useState([])
  const [jugadoresTodos, setJugadoresTodos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [convocatoriaEditando, setConvocatoriaEditando] = useState(null)

  const [jugadorId, setJugadorId] = useState('')
  const [jugadorLabel, setJugadorLabel] = useState('')
  const [busquedaJugador, setBusquedaJugador] = useState('')
  const [seleccion, setSeleccion] = useState('Selección Nacional')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [fechaFin, setFechaFin] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const unAnioAtras = new Date()
  unAnioAtras.setFullYear(unAnioAtras.getFullYear() - 1)
  const [fechaDesde, setFechaDesde] = useState(unAnioAtras.toISOString().slice(0, 10))
  const [fechaHasta, setFechaHasta] = useState('')

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  async function cargarJugadores() {
    const { data } = await supabase
      .from('jugadores')
      .select('id, nombre, apellido, categorias(nombre)')
      .order('apellido')
    setJugadoresTodos(data || [])
  }

  useEffect(() => {
    async function ejecutar() {
      await cargarJugadores()
    }
    ejecutar()
  }, [])

  const cargarConvocatorias = useCallback(async () => {
    setCargando(true)
    let query = supabase
      .from('convocatorias_seleccion')
      .select('*, jugadores(nombre, apellido, categorias(nombre))')
      .order('fecha_inicio', { ascending: false })
    if (fechaDesde) query = query.gte('fecha_inicio', fechaDesde)
    if (fechaHasta) query = query.lte('fecha_inicio', fechaHasta)
    const { data } = await query
    setConvocatorias(data || [])
    setCargando(false)
  }, [fechaDesde, fechaHasta])

  useEffect(() => {
    async function ejecutar() {
      await cargarConvocatorias()
    }
    ejecutar()
  }, [cargarConvocatorias])

  function abrirNueva() {
    setConvocatoriaEditando(null)
    setJugadorId('')
    setJugadorLabel('')
    setBusquedaJugador('')
    setSeleccion('Selección Nacional')
    setFechaInicio(hoyISO())
    setFechaFin('')
    setObservaciones('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(c) {
    setConvocatoriaEditando(c)
    setJugadorId(c.jugador_id)
    setJugadorLabel(c.jugadores ? `${c.jugadores.apellido}, ${c.jugadores.nombre}` : '')
    setBusquedaJugador('')
    setSeleccion(c.seleccion || 'Selección Nacional')
    setFechaInicio(c.fecha_inicio || '')
    setFechaFin(c.fecha_fin || '')
    setObservaciones(c.observaciones || '')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setConvocatoriaEditando(null)
  }

  function elegirJugador(j) {
    setJugadorId(j.id)
    setJugadorLabel(`${j.apellido}, ${j.nombre}`)
    setBusquedaJugador('')
  }

  async function handleGuardar() {
    setErrorMsg('')
    if (!jugadorId || !fechaInicio) {
      setErrorMsg('Elegí un jugador y la fecha de inicio.')
      return
    }
    setGuardando(true)
    const datos = {
      jugador_id: jugadorId,
      seleccion: seleccion || 'Selección Nacional',
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || null,
      observaciones: observaciones || null,
    }
    const { error } = convocatoriaEditando
      ? await supabase.from('convocatorias_seleccion').update(datos).eq('id', convocatoriaEditando.id)
      : await supabase.from('convocatorias_seleccion').insert(datos)
    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      setMostrarForm(false)
      setConvocatoriaEditando(null)
      cargarConvocatorias()
    }
  }

  async function handleEliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar esta convocatoria?')
    if (!confirmar) return
    await supabase.from('convocatorias_seleccion').delete().eq('id', id)
    cargarConvocatorias()
  }

  const resultadosJugador = busquedaJugador
    ? jugadoresTodos
        .filter((j) => `${j.apellido} ${j.nombre}`.toLowerCase().includes(busquedaJugador.toLowerCase()))
        .slice(0, 8)
    : []

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            Convocatorias a Selección
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNueva}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva convocatoria'}
          </button>
        </div>

        {mostrarForm && (
          <div
            className="space-y-3 mb-8 p-4 rounded-xl"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Jugador
              </label>
              {jugadorLabel && (
                <div
                  className="flex items-center justify-between p-2 rounded-lg mb-1.5 text-sm"
                  style={{ backgroundColor: '#0F1419', color: '#F0F2F5' }}
                >
                  {jugadorLabel}
                  <button
                    type="button"
                    onClick={() => {
                      setJugadorId('')
                      setJugadorLabel('')
                    }}
                    className="text-xs"
                    style={{ color: '#F87171' }}
                  >
                    Cambiar
                  </button>
                </div>
              )}
              {!jugadorLabel && (
                <>
                  <input
                    type="text"
                    placeholder="Buscar jugador..."
                    value={busquedaJugador}
                    onChange={(e) => setBusquedaJugador(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  />
                  {resultadosJugador.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {resultadosJugador.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => elegirJugador(j)}
                          className="w-full text-left text-xs p-2 rounded-lg hover:opacity-80"
                          style={{ backgroundColor: '#0F1419', color: '#F0F2F5' }}
                        >
                          {j.apellido}, {j.nombre}
                          {j.categorias?.nombre && <span style={{ color: '#5B6B85' }}> · {j.categorias.nombre}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <input
              type="text"
              placeholder="Selección (ej: Selección Nacional Sub-17)"
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                  Fecha inicio
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                  Fecha fin
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
              </div>
            </div>

            <textarea
              placeholder="Observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
              style={inputStyle}
            />

            {errorMsg && (
              <p className="text-sm" style={{ color: '#F87171' }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : convocatoriaEditando ? 'Guardar cambios' : 'Guardar convocatoria'}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="flex-1 p-2 rounded-lg outline-none text-xs"
            style={inputStyle}
          />
          <span className="text-xs" style={{ color: '#5B6B85' }}>
            a
          </span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="flex-1 p-2 rounded-lg outline-none text-xs"
            style={inputStyle}
          />
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && convocatorias.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay convocatorias en ese rango de fechas.</p>
        )}

        <div className="space-y-2">
          {convocatorias.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl flex items-start justify-between gap-2"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                  {c.jugadores?.apellido}, {c.jugadores?.nombre}
                  {c.jugadores?.categorias?.nombre && (
                    <span className="text-xs ml-1" style={{ color: '#5B6B85' }}>
                      ({c.jugadores.categorias.nombre})
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: '#8A9BB8' }}>
                  {c.seleccion} · {formatearFecha(c.fecha_inicio)}
                  {c.fecha_fin && ` al ${formatearFecha(c.fecha_fin)}`}
                </p>
                {c.observaciones && (
                  <p className="text-xs mt-1" style={{ color: '#5B6B85' }}>
                    {c.observaciones}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => abrirEditar(c)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleEliminar(c.id)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ConvocatoriasSeleccionSection
