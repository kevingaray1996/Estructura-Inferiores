import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function VideoSection({ jugadorInicialId, onConsumirJugadorInicial }) {
  const [tipo, setTipo] = useState('colectivo')
  const [categorias, setCategorias] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [partidos, setPartidos] = useState([])
  const [videos, setVideos] = useState([])
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaContenido, setBusquedaContenido] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [contenido, setContenido] = useState('')
  const [url, setUrl] = useState('')
  const [catForm, setCatForm] = useState('')
  const [jugadorForm, setJugadorForm] = useState('')
  const [partidoForm, setPartidoForm] = useState('')

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    async function cargarBase() {
      const { data: cats } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(cats || [])
      const { data: jugs } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')
      setJugadores(jugs || [])
      const { data: parts } = await supabase
        .from('partidos')
        .select('*')
        .order('fecha', { ascending: false })
      setPartidos(parts || [])

      if (jugadorInicialId) {
        setTipo('individual')
        setBusqueda('')
        onConsumirJugadorInicial()
      }
    }
    cargarBase()
  }, [])

  useEffect(() => {
    cargarVideos()
  }, [tipo])

  async function cargarVideos() {
    const { data } = await supabase
      .from('videos')
      .select('*, categorias(nombre), jugadores(nombre, apellido, categoria_id), partidos(rival, fecha)')
      .eq('tipo', tipo)
      .order('fecha', { ascending: false })
    setVideos(data || [])
  }

  function cambiarTipo(t) {
    setTipo(t)
    setMostrarForm(false)
    setCategoriaId('')
    setBusqueda('')
    setBusquedaContenido('')
  }

  function obtenerFechaHoy() {
    const hoy = new Date()
    const anio = hoy.getFullYear()
    const mes = String(hoy.getMonth() + 1).padStart(2, '0')
    const dia = String(hoy.getDate()).padStart(2, '0')
    return `${anio}-${mes}-${dia}`
  }

  function abrirFormulario() {
    if (!mostrarForm) {
      setFecha(obtenerFechaHoy())
    }
    setMostrarForm(!mostrarForm)
  }

  async function handleGuardar() {
    if (!fecha || !url) return
    setGuardando(true)

    if (tipo === 'colectivo') {
      await supabase.from('videos').insert({
        tipo: 'colectivo',
        fecha: fecha,
        descripcion: descripcion,
        categoria_id: catForm || null,
        url: url,
      })
    } else if (tipo === 'individual') {
      await supabase.from('videos').insert({
        tipo: 'individual',
        fecha: fecha,
        jugador_id: jugadorForm || null,
        partido_id: partidoForm || null,
        url: url,
      })
    } else {
      await supabase.from('videos').insert({
        tipo: 'entrenamiento',
        fecha: fecha,
        categoria_id: catForm || null,
        contenido: contenido || null,
        descripcion: descripcion,
        url: url,
      })
    }

    setGuardando(false)
    setFecha('')
    setDescripcion('')
    setContenido('')
    setUrl('')
    setCatForm('')
    setJugadorForm('')
    setPartidoForm('')
    setMostrarForm(false)
    cargarVideos()
  }

  async function handleEliminarVideo(e, videoId) {
    e.preventDefault()
    e.stopPropagation()
    const confirmar = window.confirm('¿Seguro que querés eliminar este video?')
    if (!confirmar) return
    await supabase.from('videos').delete().eq('id', videoId)
    cargarVideos()
  }

  const videosFiltrados = videos.filter((v) => {
    if (tipo === 'individual') {
      const categoriaDelJugador = v.jugadores ? v.jugadores.categoria_id : null
      const coincideCategoria = !categoriaId || categoriaDelJugador === categoriaId
      const nombreJugador = v.jugadores ? v.jugadores.nombre : ''
      const apellidoJugador = v.jugadores ? v.jugadores.apellido : ''
      const nombreCompleto = (nombreJugador + ' ' + apellidoJugador).toLowerCase()
      const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
      return coincideCategoria && coincideBusqueda
    }
    if (tipo === 'entrenamiento') {
      const coincideCategoria = !categoriaId || v.categoria_id === categoriaId
      const coincideContenido =
        !busquedaContenido || (v.contenido || '').toLowerCase().includes(busquedaContenido.toLowerCase())
      return coincideCategoria && coincideContenido
    }
    return !categoriaId || v.categoria_id === categoriaId
  })

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6 flex items-center gap-3"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          <span>🎥</span>
          <span>Videoanálisis</span>
        </h1>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => cambiarTipo('colectivo')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'colectivo' ? '#4ADE80' : '#1A2332',
              color: tipo === 'colectivo' ? '#0F1419' : '#8A9BB8',
              border: '1px solid #2A3548',
            }}
          >
            Colectivos
          </button>
          <button
            onClick={() => cambiarTipo('individual')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'individual' ? '#4ADE80' : '#1A2332',
              color: tipo === 'individual' ? '#0F1419' : '#8A9BB8',
              border: '1px solid #2A3548',
            }}
          >
            Individuales
          </button>
          <button
            onClick={() => cambiarTipo('entrenamiento')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'entrenamiento' ? '#4ADE80' : '#1A2332',
              color: tipo === 'entrenamiento' ? '#0F1419' : '#8A9BB8',
              border: '1px solid #2A3548',
            }}
          >
            Entrenamientos
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="p-2.5 rounded-xl outline-none text-sm sm:w-48"
            style={inputStyle}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          {tipo === 'individual' && (
            <input
              type="text"
              placeholder="Buscar jugador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm flex-1"
              style={inputStyle}
            />
          )}

          {tipo === 'entrenamiento' && (
            <input
              type="text"
              placeholder="Buscar por contenido (ej: definición, presión...)"
              value={busquedaContenido}
              onChange={(e) => setBusquedaContenido(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm flex-1"
              style={inputStyle}
            />
          )}

          <button
            onClick={abrirFormulario}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo video'}
          </button>
        </div>

        {mostrarForm && (
          <div
            className="space-y-3 mb-6 p-4 rounded-xl"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />

            {tipo === 'colectivo' && (
              <>
                <select
                  value={catForm}
                  onChange={(e) => setCatForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Descripción (ej: entrenamiento martes, partido vs Boca)"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
                  style={inputStyle}
                />
              </>
            )}

            {tipo === 'individual' && (
              <>
                <select
                  value={jugadorForm}
                  onChange={(e) => setJugadorForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Jugador</option>
                  {jugadores.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.apellido}, {j.nombre} ({j.categorias ? j.categorias.nombre : ''})
                    </option>
                  ))}
                </select>
                <select
                  value={partidoForm}
                  onChange={(e) => setPartidoForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Partido (opcional)</option>
                  {partidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      vs {p.rival} — {p.fecha}
                    </option>
                  ))}
                </select>
              </>
            )}

            {tipo === 'entrenamiento' && (
              <>
                <select
                  value={catForm}
                  onChange={(e) => setCatForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Contenido (ej: definición, presión alta, salida de arco)"
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
                <textarea
                  placeholder="Descripción adicional (opcional)"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
                  style={inputStyle}
                />
              </>
            )}

            <input
              type="text"
              placeholder="Link de YouTube"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar video'}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {videosFiltrados.map((v) => {
            let titulo = ''
            let badge = ''
            if (tipo === 'colectivo') {
              titulo = v.descripcion || (v.categorias ? v.categorias.nombre : '')
              badge = v.categorias ? v.categorias.nombre : ''
            } else if (tipo === 'individual') {
              titulo = v.jugadores ? v.jugadores.apellido + ', ' + v.jugadores.nombre : ''
              badge = v.fecha
            } else {
              titulo = v.contenido || (v.categorias ? v.categorias.nombre : 'Entrenamiento')
              badge = v.categorias ? v.categorias.nombre : ''
            }
            const vsPartido = v.partidos ? `vs ${v.partidos.rival}` : null

            return (
              
                <a key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="block p-3.5 rounded-xl hover:-translate-y-0.5 transition-all duration-200"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                    {titulo}
                  </p>
                  <div className="flex items-center gap-2">
                    {badge && (
                      <span
                        className="text-xs font-mono px-2 py-1 rounded-full"
                        style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                      >
                        {badge}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleEliminarVideo(e, v.id)}
                      className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs" style={{ color: '#5B6B85' }}>
                    {v.fecha}
                  </p>
                  {vsPartido && (
                    <span className="text-xs" style={{ color: '#8A9BB8' }}>
                      · {vsPartido}
                    </span>
                  )}
                  {tipo === 'entrenamiento' && v.descripcion && (
                    <span className="text-xs" style={{ color: '#8A9BB8' }}>
                      · {v.descripcion}
                    </span>
                  )}
                </div>
              </a>
            )
          })}
        </div>

        {videosFiltrados.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            No hay videos cargados con ese filtro.
          </p>
        )}
      </div>
    </div>
  )
}

export default VideoSection