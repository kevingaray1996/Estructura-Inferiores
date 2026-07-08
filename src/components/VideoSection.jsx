import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'

function VideoSection({ jugadorInicialId, onConsumirJugadorInicial, onIrABiblioteca, perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [tipo, setTipo] = useState('colectivo')
  const [categorias, setCategorias] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [partidos, setPartidos] = useState([])
  const [videos, setVideos] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [busqueda, setBusqueda] = useState('')
  const [jugadorFiltroId, setJugadorFiltroId] = useState(null)
  const [busquedaContenido, setBusquedaContenido] = useState('')
  const [cantidadFiltro, setCantidadFiltro] = useState('')
  const [momentoFiltro, setMomentoFiltro] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [contenido, setContenido] = useState('')
  const [momentoForm, setMomentoForm] = useState('')
  const [cantidadJugadores, setCantidadJugadores] = useState('')
  const [agregarABiblioteca, setAgregarABiblioteca] = useState(false)
  const [imagenBiblioteca, setImagenBiblioteca] = useState('')
  const [subiendoImagenBiblioteca, setSubiendoImagenBiblioteca] = useState(false)
  const [url, setUrl] = useState('')
  const [catForm, setCatForm] = useState(esTecnico ? perfil.categoria_id : '')
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
    }
    cargarBase()
  }, [])

  useEffect(() => {
    async function aplicarJugadorInicial() {
      if (!jugadorInicialId) return
      setTipo('individual')
      setBusqueda('')
      setJugadorFiltroId(jugadorInicialId)
      onConsumirJugadorInicial()
    }
    aplicarJugadorInicial()
  }, [jugadorInicialId, onConsumirJugadorInicial])

  const cargarVideos = useCallback(async () => {
    const { data } = await supabase
      .from('videos')
      .select('*, categorias(nombre), jugadores(nombre, apellido, categoria_id, foto_url), partidos(rival, fecha, escudo_url)')
      .eq('tipo', tipo)
      .order('fecha', { ascending: false })
    setVideos(data || [])
  }, [tipo])

  useEffect(() => {
    async function ejecutar() {
      cargarVideos()
    }
    ejecutar()
  }, [cargarVideos])

  function cambiarTipo(t) {
    setTipo(t)
    setMostrarForm(false)
    setCategoriaId(esTecnico ? perfil.categoria_id : '')
    setBusqueda('')
    setJugadorFiltroId(null)
    setBusquedaContenido('')
    setCantidadFiltro('')
    setMomentoFiltro('')
    setAgregarABiblioteca(false)
    setImagenBiblioteca('')
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

  async function handleSubirImagenBiblioteca(archivo) {
    if (!archivo) return
    setSubiendoImagenBiblioteca(true)
    const archivoComprimido = await comprimirImagen(archivo, { maxAncho: 1000, maxAlto: 1000 })
    const nombreArchivo = `${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: true,
    })
    if (error) {
      alert('Error al subir la imagen: ' + error.message)
      setSubiendoImagenBiblioteca(false)
      return
    }
    const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
    setImagenBiblioteca(data.publicUrl)
    setSubiendoImagenBiblioteca(false)
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
        momento: momentoForm || null,
        partido_id: partidoForm || null,
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
      const cantidadNum = cantidadJugadores !== '' ? parseInt(cantidadJugadores, 10) : null
      await supabase.from('videos').insert({
        tipo: 'entrenamiento',
        fecha: fecha,
        categoria_id: catForm || null,
        contenido: contenido || null,
        descripcion: descripcion,
        cantidad_jugadores: cantidadNum,
        url: url,
      })

      if (agregarABiblioteca) {
        await supabase.from('biblioteca').insert({
          fecha: fecha,
          contenido: contenido || null,
          descripcion: descripcion,
          cantidad_jugadores: cantidadNum,
          link_video: url || null,
          imagen_url: imagenBiblioteca || null,
        })
      }
    }

    setGuardando(false)
    setFecha('')
    setDescripcion('')
    setContenido('')
    setMomentoForm('')
    setCantidadJugadores('')
    setAgregarABiblioteca(false)
    setImagenBiblioteca('')
    setUrl('')
    setCatForm(esTecnico ? perfil.categoria_id : '')
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
      if (jugadorFiltroId) return v.jugador_id === jugadorFiltroId
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
      const coincideCantidad = !cantidadFiltro || String(v.cantidad_jugadores) === cantidadFiltro
      return coincideCategoria && coincideContenido && coincideCantidad
    }
    if (tipo === 'colectivo') {
      const coincideCategoria = !categoriaId || v.categoria_id === categoriaId
      const coincideMomento = !momentoFiltro || v.momento === momentoFiltro
      return coincideCategoria && coincideMomento
    }
    return !categoriaId || v.categoria_id === categoriaId
  })

  const cantidadesDisponibles = [
    ...new Set(
      videos
        .filter((v) => v.tipo === 'entrenamiento')
        .map((v) => v.cantidad_jugadores)
        .filter(Boolean)
    ),
  ].sort((a, b) => a - b)

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

        {tipo === 'individual' && jugadorFiltroId && (
          <div
            className="flex items-center justify-between gap-3 p-3 rounded-xl mb-4"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            <p className="text-sm" style={{ color: '#8A9BB8' }}>
              Mostrando videos de:{' '}
              <span style={{ color: '#F0F2F5' }}>
                {(() => {
                  const j = jugadores.find((jug) => jug.id === jugadorFiltroId)
                  return j ? `${j.apellido}, ${j.nombre}` : 'jugador'
                })()}
              </span>
            </p>
            <button
              onClick={() => setJugadorFiltroId(null)}
              className="text-xs px-3 py-1.5 rounded-full hover:opacity-80 shrink-0"
              style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
            >
              Quitar filtro
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {!(tipo === 'individual' && jugadorFiltroId) && (
            esTecnico ? (
              <span
                className="p-2.5 rounded-xl text-sm sm:w-48 text-center"
                style={{ ...inputStyle, color: '#8A9BB8' }}
              >
                {perfil?.categorias?.nombre || 'Tu categoría'}
              </span>
            ) : (
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
            )
          )}

          {tipo === 'individual' && !jugadorFiltroId && (
            <input
              type="text"
              placeholder="Buscar jugador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm flex-1"
              style={inputStyle}
            />
          )}

          {tipo === 'colectivo' && (
            <select
              value={momentoFiltro}
              onChange={(e) => setMomentoFiltro(e.target.value)}
              className="p-2.5 rounded-xl outline-none text-sm sm:w-44"
              style={inputStyle}
            >
              <option value="">Todos los análisis</option>
              <option value="Prepartido">Prepartido</option>
              <option value="Postpartido">Postpartido</option>
              <option value="Entrenamiento">Entrenamiento</option>
            </select>
          )}

          {tipo === 'entrenamiento' && (
            <>
              <input
                type="text"
                placeholder="Buscar por contenido (ej: definición, presión...)"
                value={busquedaContenido}
                onChange={(e) => setBusquedaContenido(e.target.value)}
                className="p-2.5 rounded-xl outline-none text-sm flex-1"
                style={inputStyle}
              />
              <select
                value={cantidadFiltro}
                onChange={(e) => setCantidadFiltro(e.target.value)}
                className="p-2.5 rounded-xl outline-none text-sm sm:w-44"
                style={inputStyle}
              >
                <option value="">Cantidad de jugadores</option>
                {cantidadesDisponibles.map((c) => (
                  <option key={c} value={c}>{c} jugadores</option>
                ))}
              </select>
            </>
          )}

          <button
            onClick={abrirFormulario}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo video'}
          </button>
        </div>

        {tipo === 'entrenamiento' && onIrABiblioteca && (
          <button
            onClick={onIrABiblioteca}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 mb-4 w-full sm:w-auto"
            style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
          >
            📚 Ir a Biblioteca
          </button>
        )}

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
                {esTecnico ? (
                  <span
                    className="w-full block p-2.5 rounded-xl text-sm"
                    style={{ ...inputStyle, color: '#8A9BB8' }}
                  >
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </span>
                ) : (
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
                )}
                <select
                  value={momentoForm}
                  onChange={(e) => setMomentoForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Análisis</option>
                  <option value="Prepartido">Prepartido</option>
                  <option value="Postpartido">Postpartido</option>
                  <option value="Entrenamiento">Entrenamiento</option>
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
                {esTecnico ? (
                  <span
                    className="w-full block p-2.5 rounded-xl text-sm"
                    style={{ ...inputStyle, color: '#8A9BB8' }}
                  >
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </span>
                ) : (
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
                )}
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
                <input
                  type="number"
                  placeholder="Cantidad de jugadores"
                  value={cantidadJugadores}
                  onChange={(e) => setCantidadJugadores(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
                <label
                  className="flex items-center gap-2 p-2.5 rounded-xl text-sm cursor-pointer"
                  style={inputStyle}
                >
                  <input
                    type="checkbox"
                    checked={agregarABiblioteca}
                    onChange={(e) => setAgregarABiblioteca(e.target.checked)}
                  />
                  📚 Agregar a la Biblioteca
                </label>

                {agregarABiblioteca && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                      Imagen del ejercicio (Tactical Pad, etc.)
                    </label>
                    <div className="flex items-center gap-3">
                      {imagenBiblioteca && (
                        <img
                          src={imagenBiblioteca}
                          alt="Vista previa"
                          className="w-16 h-16 rounded-lg object-cover shrink-0"
                          style={{ border: '1px solid #2A3548' }}
                        />
                      )}
                      <label
                        className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                        style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
                      >
                        {subiendoImagenBiblioteca ? 'Subiendo...' : imagenBiblioteca ? 'Cambiar imagen' : '📤 Subir imagen'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleSubirImagenBiblioteca(e.target.files?.[0])}
                          disabled={subiendoImagenBiblioteca}
                          className="hidden"
                        />
                      </label>
                      {imagenBiblioteca && (
                        <button
                          type="button"
                          onClick={() => setImagenBiblioteca('')}
                          className="text-xs"
                          style={{ color: '#F87171' }}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
            let titulo
            let badge
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
                    {tipo === 'colectivo' && v.momento && (
                      <span
                        className="text-xs font-mono px-2 py-1 rounded-full"
                        style={{ backgroundColor: '#0F1419', color: '#4ADE80' }}
                      >
                        {v.momento}
                      </span>
                    )}
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
                    <span className="text-xs flex items-center gap-1" style={{ color: '#8A9BB8' }}>
                      ·
                      {v.partidos?.escudo_url && (
                        <img
                          src={v.partidos.escudo_url}
                          alt={v.partidos.rival}
                          className="w-4 h-4 rounded-sm object-contain inline-block shrink-0"
                          style={{ backgroundColor: '#0F1419' }}
                        />
                      )}
                      {vsPartido}
                    </span>
                  )}
                  {tipo === 'entrenamiento' && v.descripcion && (
                    <span className="text-xs" style={{ color: '#8A9BB8' }}>
                      · {v.descripcion}
                    </span>
                  )}
                  {tipo === 'entrenamiento' && v.cantidad_jugadores && (
                    <span className="text-xs" style={{ color: '#8A9BB8' }}>
                      · 👥 {v.cantidad_jugadores} jugadores
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