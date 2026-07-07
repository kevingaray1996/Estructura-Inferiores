import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'

const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function MedicosSection({ jugadorInicialId, onConsumirJugadorInicial }) {
  const [jugadores, setJugadores] = useState([])
  const [idsConHistorial, setIdsConHistorial] = useState(new Set())
  const [todasLasFichas, setTodasLasFichas] = useState([])
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaLesion, setBusquedaLesion] = useState('')
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [categoriaAgregar, setCategoriaAgregar] = useState('')
  const [jugadorAgregarId, setJugadorAgregarId] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [fichas, setFichas] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [fichaEditando, setFichaEditando] = useState(null)
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tiempoRecuperacion, setTiempoRecuperacion] = useState('')
  const [recuperado, setRecuperado] = useState(false)
  const [linkInforme, setLinkInforme] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [guardandoEstado, setGuardandoEstado] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')
      setJugadores(data || [])

      const { data: historial } = await supabase.from('fichas_medicas').select('*')
      setTodasLasFichas(historial || [])
      setIdsConHistorial(new Set((historial || []).map((f) => f.jugador_id)))

      if (jugadorInicialId) {
        const encontrado = data?.find((j) => j.id === jugadorInicialId)
        if (encontrado) {
          abrirJugador(encontrado)
        }
        onConsumirJugadorInicial()
      }
    }
    cargar()
  }, [jugadorInicialId])

  async function refrescarTodasLasFichas() {
    const { data } = await supabase.from('fichas_medicas').select('*')
    setTodasLasFichas(data || [])
    setIdsConHistorial(new Set((data || []).map((f) => f.jugador_id)))
  }

  async function cargarFichas(jugadorId) {
    const { data } = await supabase
      .from('fichas_medicas')
      .select('*')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
    setFichas(data || [])
  }

  function abrirJugador(j) {
    setJugadorSeleccionado(j)
    setMostrarForm(false)
    setFichaEditando(null)
    cargarFichas(j.id)
  }

  function obtenerFechaHoy() {
    const hoy = new Date()
    const anio = hoy.getFullYear()
    const mes = String(hoy.getMonth() + 1).padStart(2, '0')
    const dia = String(hoy.getDate()).padStart(2, '0')
    return `${anio}-${mes}-${dia}`
  }

  function abrirNuevoRegistro() {
    setFichaEditando(null)
    setFecha(obtenerFechaHoy())
    setDescripcion('')
    setTiempoRecuperacion('')
    setRecuperado(false)
    setLinkInforme('')
    setMostrarForm(true)
  }

  function abrirEditarRegistro(f) {
    setFichaEditando(f)
    setFecha(f.fecha || '')
    setDescripcion(f.descripcion || '')
    setTiempoRecuperacion(f.tiempo_recuperacion || '')
    setRecuperado(!!f.recuperado)
    setLinkInforme(f.link_informe || '')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setFichaEditando(null)
  }

  async function handleGuardar() {
    if (!fecha) return
    setGuardando(true)

    const datos = {
      fecha,
      descripcion,
      tiempo_recuperacion: tiempoRecuperacion || null,
      recuperado,
      link_informe: linkInforme || null,
    }

    if (fichaEditando) {
      await supabase.from('fichas_medicas').update(datos).eq('id', fichaEditando.id)
    } else {
      await supabase.from('fichas_medicas').insert({
        jugador_id: jugadorSeleccionado.id,
        ...datos,
      })
    }

    const nuevoEstado = recuperado ? 'disponible' : 'lesionado'
    const nuevoDetalle = recuperado ? null : descripcion || 'Lesión'

    await supabase
      .from('jugadores')
      .update({ estado: nuevoEstado, estado_detalle: nuevoDetalle })
      .eq('id', jugadorSeleccionado.id)

    setJugadorSeleccionado((prev) => ({ ...prev, estado: nuevoEstado, estado_detalle: nuevoDetalle }))
    setJugadores((prev) =>
      prev.map((j) =>
        j.id === jugadorSeleccionado.id ? { ...j, estado: nuevoEstado, estado_detalle: nuevoDetalle } : j
      )
    )
    setIdsConHistorial((prev) => new Set(prev).add(jugadorSeleccionado.id))

    setGuardando(false)
    setFecha('')
    setDescripcion('')
    setTiempoRecuperacion('')
    setRecuperado(false)
    setLinkInforme('')
    setMostrarForm(false)
    setFichaEditando(null)
    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
  }

  async function handleEliminarFicha(fichaId) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro médico?')
    if (!confirmar) return
    await supabase.from('fichas_medicas').delete().eq('id', fichaId)

    const quedanActivas = fichas.some((f) => f.id !== fichaId && !f.recuperado)
    if (!quedanActivas && jugadorSeleccionado.estado === 'lesionado') {
      await supabase
        .from('jugadores')
        .update({ estado: 'disponible', estado_detalle: null })
        .eq('id', jugadorSeleccionado.id)
      setJugadorSeleccionado((prev) => ({ ...prev, estado: 'disponible', estado_detalle: null }))
      setJugadores((prev) =>
        prev.map((j) =>
          j.id === jugadorSeleccionado.id ? { ...j, estado: 'disponible', estado_detalle: null } : j
        )
      )
    }

    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
  }

  async function handleMarcarDisponible() {
    setGuardandoEstado(true)
    await supabase
      .from('jugadores')
      .update({ estado: 'disponible', estado_detalle: null })
      .eq('id', jugadorSeleccionado.id)
    await supabase
      .from('fichas_medicas')
      .update({ recuperado: true })
      .eq('jugador_id', jugadorSeleccionado.id)
      .eq('recuperado', false)

    setGuardandoEstado(false)
    setJugadorSeleccionado((prev) => ({ ...prev, estado: 'disponible', estado_detalle: null }))
    setJugadores((prev) =>
      prev.map((j) =>
        j.id === jugadorSeleccionado.id ? { ...j, estado: 'disponible', estado_detalle: null } : j
      )
    )
    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
  }

  const filtrados = jugadores.filter((j) => {
    const coincideCategoria = !categoriaId || j.categoria_id === categoriaId
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const lesionados = filtrados.filter((j) => j.estado === 'lesionado')
  const recuperados = filtrados.filter((j) => j.estado !== 'lesionado' && idsConHistorial.has(j.id))

  const categoriasDisponibles = [
    ...new Map(
      jugadores.filter((j) => j.categoria_id).map((j) => [j.categoria_id, j.categorias?.nombre])
    ),
  ].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))

  const jugadoresParaAgregar = jugadores
    .filter((j) => !categoriaAgregar || j.categoria_id === categoriaAgregar)
    .sort((a, b) => (a.apellido || '').localeCompare(b.apellido || ''))

  const resultadosLesion = busquedaLesion
    ? todasLasFichas
        .filter((f) => (f.descripcion || '').toLowerCase().includes(busquedaLesion.toLowerCase()))
        .map((f) => ({ ficha: f, jugador: jugadores.find((j) => j.id === f.jugador_id) }))
        .filter((r) => r.jugador)
        .sort((a, b) => (b.ficha.fecha || '').localeCompare(a.ficha.fecha || ''))
    : []

  function irAAgregar() {
    const jugador = jugadores.find((j) => j.id === jugadorAgregarId)
    if (!jugador) return
    abrirJugador(jugador)
    setMostrarAgregar(false)
    setCategoriaAgregar('')
    setJugadorAgregarId('')
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  if (jugadorSeleccionado) {
    const estadoActual = estadoConfig[jugadorSeleccionado.estado] || estadoConfig.disponible

    return (
      <div className="p-6 md:p-10">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setJugadorSeleccionado(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: '#8A9BB8' }}
          >
            ← Volver
          </button>

          <div className="flex items-center gap-3 mb-6">
            <p className="text-3xl">🩺</p>
            <div>
              <h1
                className="text-2xl"
                style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
              >
                {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
              </h1>
              <p className="text-xs" style={{ color: estadoActual.color }}>
                {estadoActual.label}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#5B6B85' }}>
              Estado del jugador
            </p>
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-sm font-medium px-3 py-1.5 rounded-xl"
                style={{
                  backgroundColor: '#0F1419',
                  color: estadoActual.color,
                  border: `1px solid ${estadoActual.color}`,
                }}
              >
                {estadoActual.label}
              </span>
              {jugadorSeleccionado.estado === 'lesionado' && (
                <button
                  onClick={handleMarcarDisponible}
                  disabled={guardandoEstado}
                  className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
                >
                  {guardandoEstado ? 'Actualizando...' : 'Marcar como disponible'}
                </button>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: '#5B6B85' }}>
              El estado se actualiza automáticamente al agregar un registro médico o marcarlo como recuperado.
            </p>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide" style={{ color: '#5B6B85' }}>
              Historial médico
            </p>
            <button
              onClick={mostrarForm ? cancelarForm : abrirNuevoRegistro}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 shrink-0"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {mostrarForm ? 'Cancelar' : '+ Agregar registro'}
            </button>
          </div>

          {mostrarForm && (
            <div className="space-y-3 mb-6 p-4 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
              {fichaEditando && (
                <p className="text-xs" style={{ color: '#8A9BB8' }}>
                  Editando registro del {fichaEditando.fecha}
                </p>
              )}
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <textarea
                placeholder="Descripción / diagnóstico / tratamiento"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Tiempo estimado de recuperación (ej: 2 semanas)"
                value={tiempoRecuperacion}
                onChange={(e) => setTiempoRecuperacion(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#F0F2F5' }}>
                <input
                  type="checkbox"
                  checked={recuperado}
                  onChange={(e) => setRecuperado(e.target.checked)}
                />
                Ya está recuperado
              </label>
              <input
                type="text"
                placeholder="Link del informe (Drive, PDF, etc.)"
                value={linkInforme}
                onChange={(e) => setLinkInforme(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
              >
                {guardando ? 'Guardando...' : fichaEditando ? 'Guardar cambios' : 'Guardar registro'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {fichas.map((f) => (
              <div key={f.id} className="p-3.5 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-mono" style={{ color: '#8A9BB8' }}>{f.fecha}</p>
                  <div className="flex items-center gap-2">
                    {f.tiempo_recuperacion && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#0F1419', color: '#FBBF24' }}
                      >
                        {f.tiempo_recuperacion}
                      </span>
                    )}
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: '#0F1419',
                        color: f.recuperado ? '#4ADE80' : '#F87171',
                      }}
                    >
                      {f.recuperado ? 'Recuperado' : 'Activo'}
                    </span>
                    <button
                      onClick={() => abrirEditarRegistro(f)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleEliminarFicha(f.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <p className="text-sm" style={{ color: '#F0F2F5' }}>{f.descripcion}</p>
                {f.link_informe && (
                  <a
                    href={f.link_informe}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs mt-1 inline-block underline"
                    style={{ color: '#8A9BB8' }}
                  >
                    📎 Ver informe
                  </a>
                )}
              </div>
            ))}
            {fichas.length === 0 && (
              <p className="text-sm" style={{ color: '#5B6B85' }}>Sin registros médicos todavía.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1
            className="text-3xl md:text-4xl flex items-center gap-3"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            <span>🩺</span> Médicos
          </h1>
          <button
            onClick={() => setMostrarAgregar((v) => !v)}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarAgregar ? 'Cancelar' : '+ Agregar jugador'}
          </button>
        </div>

        {mostrarAgregar && (
          <div className="p-4 rounded-xl mb-6 space-y-3" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
            <p className="text-xs uppercase tracking-wide" style={{ color: '#5B6B85' }}>
              Elegí categoría y jugador para abrir su ficha médica
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <select
                value={categoriaAgregar}
                onChange={(e) => {
                  setCategoriaAgregar(e.target.value)
                  setJugadorAgregarId('')
                }}
                className="p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="">Todas las categorías</option>
                {categoriasDisponibles.map(([id, nombre]) => (
                  <option key={id} value={id}>{nombre}</option>
                ))}
              </select>
              <select
                value={jugadorAgregarId}
                onChange={(e) => setJugadorAgregarId(e.target.value)}
                className="p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="">Seleccionar jugador...</option>
                {jugadoresParaAgregar.map((j) => (
                  <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>
                ))}
              </select>
            </div>
            <button
              onClick={irAAgregar}
              disabled={!jugadorAgregarId}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              Ir a la ficha
            </button>
          </div>
        )}

        <CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
        />

        <input
          type="text"
          placeholder="🔍 Buscar en diagnósticos (ej: desgarro, esguince)..."
          value={busquedaLesion}
          onChange={(e) => setBusquedaLesion(e.target.value)}
          className="w-full p-2.5 rounded-xl outline-none text-sm mb-6"
          style={inputStyle}
        />

        {busquedaLesion ? (
          <div className="space-y-2">
            {resultadosLesion.map(({ ficha, jugador }) => (
              <div
                key={ficha.id}
                onClick={() => abrirJugador(jugador)}
                className="p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                    {jugador.apellido}, {jugador.nombre}
                  </p>
                  <span className="text-xs font-mono" style={{ color: '#8A9BB8' }}>{ficha.fecha}</span>
                </div>
                <p className="text-sm" style={{ color: '#8A9BB8' }}>{ficha.descripcion}</p>
              </div>
            ))}
            {resultadosLesion.length === 0 && (
              <p className="text-sm" style={{ color: '#5B6B85' }}>
                No se encontraron diagnósticos que coincidan con "{busquedaLesion}".
              </p>
            )}
          </div>
        ) : (
          <>
            {[
          { titulo: 'Lesionados', icono: '🟡', color: '#FBBF24', lista: lesionados },
          { titulo: 'Recuperados', icono: '🟢', color: '#4ADE80', lista: recuperados },
        ].map(
          (grupo) =>
            grupo.lista.length > 0 && (
              <div key={grupo.titulo} className="mb-6">
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: grupo.color }}>
                  {grupo.icono} {grupo.titulo} ({grupo.lista.length})
                </p>
                <div className="space-y-2">
                  {grupo.lista.map((j) => (
                    <div
                      key={j.id}
                      onClick={() => abrirJugador(j)}
                      className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: '#1A2332', border: `1px solid ${grupo.color}` }}
                    >
                      <div
                        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-xs font-bold"
                        style={{ backgroundColor: '#0F1419', border: `2px solid ${grupo.color}`, color: grupo.color, fontFamily: "'Archivo Black', sans-serif" }}
                      >
                        {iniciales(j.nombre, j.apellido)}
                      </div>
                      <p className="flex-1 text-sm" style={{ color: '#F0F2F5' }}>
                        {j.apellido}, {j.nombre}
                      </p>
                      <span className="text-xs font-mono px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}>
                        {j.categorias?.nombre}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
        )}

            {lesionados.length === 0 && recuperados.length === 0 && (
              <p className="text-sm" style={{ color: '#5B6B85' }}>
                No hay jugadores lesionados ni con historial médico para ese filtro.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default MedicosSection