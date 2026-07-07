import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'

function EntrenamientosSection() {
  const [entrenamientos, setEntrenamientos] = useState([])
  const [contenidoFiltro, setContenidoFiltro] = useState('')
  const [cantidadFiltro, setCantidadFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [entrenamientoEditando, setEntrenamientoEditando] = useState(null)

  const [fecha, setFecha] = useState('')
  const [contenido, setContenido] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidadJugadores, setCantidadJugadores] = useState('')
  const [imagenUrl, setImagenUrl] = useState('')
  const [linkVideo, setLinkVideo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendoImagen, setSubiendoImagen] = useState(false)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    cargarEntrenamientos()
  }, [])

  async function cargarEntrenamientos() {
    const { data } = await supabase
      .from('biblioteca')
      .select('*')
      .order('fecha', { ascending: false })
    setEntrenamientos(data || [])
  }

  const contenidos = [...new Set(entrenamientos.map((e) => e.contenido).filter(Boolean))].sort()
  const cantidades = [...new Set(entrenamientos.map((e) => e.cantidad_jugadores).filter(Boolean))].sort(
    (a, b) => a - b
  )

  const filtrados = entrenamientos.filter((e) => {
    const coincideContenido = !contenidoFiltro || e.contenido === contenidoFiltro
    const coincideCantidad = !cantidadFiltro || String(e.cantidad_jugadores) === cantidadFiltro
    const coincideBusqueda =
      !busqueda || (e.descripcion || '').toLowerCase().includes(busqueda.toLowerCase())
    return coincideContenido && coincideCantidad && coincideBusqueda
  })

  function abrirNuevo() {
    setEntrenamientoEditando(null)
    setFecha(obtenerFechaHoy())
    setContenido('')
    setDescripcion('')
    setCantidadJugadores('')
    setImagenUrl('')
    setLinkVideo('')
    setMostrarForm(true)
  }

  function abrirEditar(e) {
    setEntrenamientoEditando(e)
    setFecha(e.fecha || '')
    setContenido(e.contenido || '')
    setDescripcion(e.descripcion || '')
    setCantidadJugadores(e.cantidad_jugadores ?? '')
    setImagenUrl(e.imagen_url || '')
    setLinkVideo(e.link_video || '')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setEntrenamientoEditando(null)
  }

  async function handleSubirImagen(archivo) {
    if (!archivo) return
    setSubiendoImagen(true)
    const nombreArchivo = `${Date.now()}-${archivo.name.replace(/\s+/g, '_')}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivo, {
      upsert: true,
    })
    if (error) {
      alert('Error al subir la imagen: ' + error.message)
      setSubiendoImagen(false)
      return
    }
    const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
    setImagenUrl(data.publicUrl)
    setSubiendoImagen(false)
  }

  async function handleGuardar() {
    if (!fecha || !descripcion) return
    setGuardando(true)

    const datos = {
      fecha,
      contenido: contenido || null,
      descripcion,
      cantidad_jugadores: cantidadJugadores !== '' ? parseInt(cantidadJugadores, 10) : null,
      imagen_url: imagenUrl || null,
      link_video: linkVideo || null,
    }

    if (entrenamientoEditando) {
      await supabase.from('biblioteca').update(datos).eq('id', entrenamientoEditando.id)
    } else {
      await supabase.from('biblioteca').insert(datos)
    }

    setGuardando(false)
    setMostrarForm(false)
    setEntrenamientoEditando(null)
    cargarEntrenamientos()
  }

  async function handleEliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este entrenamiento?')
    if (!confirmar) return
    await supabase.from('biblioteca').delete().eq('id', id)
    cargarEntrenamientos()
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <h1
            className="text-3xl md:text-4xl flex items-center gap-3"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            <span>🏋️</span> Entrenamientos
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo entrenamiento'}
          </button>
        </div>

        {mostrarForm && (
          <div className="space-y-3 mb-8 p-4 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
            {entrenamientoEditando && (
              <p className="text-xs" style={{ color: '#8A9BB8' }}>
                Editando entrenamiento del {entrenamientoEditando.fecha}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <input
                type="text"
                list="contenidos-lista"
                placeholder="Contenido (ej: Tenencia, Ofensivos, Tácticos...)"
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <datalist id="contenidos-lista">
                {contenidos.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <textarea
              placeholder="Descripción del ejercicio"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
              style={inputStyle}
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="number"
                min="1"
                placeholder="Cantidad de jugadores"
                value={cantidadJugadores}
                onChange={(e) => setCantidadJugadores(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Link de video (opcional)"
                value={linkVideo}
                onChange={(e) => setLinkVideo(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Imagen del ejercicio (Tactical Pad, etc.)
              </label>
              <div className="flex items-center gap-3">
                {imagenUrl && (
                  <img
                    src={imagenUrl}
                    alt="Vista previa"
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                    style={{ border: '1px solid #2A3548' }}
                  />
                )}
                <label
                  className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
                >
                  {subiendoImagen ? 'Subiendo...' : imagenUrl ? 'Cambiar imagen' : '📤 Subir imagen'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSubirImagen(e.target.files?.[0])}
                    disabled={subiendoImagen}
                    className="hidden"
                  />
                </label>
                {imagenUrl && (
                  <button
                    type="button"
                    onClick={() => setImagenUrl('')}
                    className="text-xs"
                    style={{ color: '#F87171' }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : entrenamientoEditando ? 'Guardar cambios' : 'Guardar entrenamiento'}
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={contenidoFiltro}
            onChange={(e) => setContenidoFiltro(e.target.value)}
            className="p-2.5 rounded-xl outline-none text-sm sm:w-56"
            style={inputStyle}
          >
            <option value="">Todos los contenidos</option>
            {contenidos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={cantidadFiltro}
            onChange={(e) => setCantidadFiltro(e.target.value)}
            className="p-2.5 rounded-xl outline-none text-sm sm:w-48"
            style={inputStyle}
          >
            <option value="">Cantidad de jugadores</option>
            {cantidades.map((c) => (
              <option key={c} value={c}>{c} jugadores</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Buscar en la descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="p-2.5 rounded-xl outline-none text-sm flex-1"
            style={inputStyle}
          />
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtrados.map((e) => (
            <div
              key={e.id}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <div
                className="w-full aspect-[2/1] flex items-center justify-center"
                style={{ backgroundColor: '#0F1419' }}
              >
                {e.imagen_url ? (
                  <img src={e.imagen_url} alt={e.contenido || 'Entrenamiento'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl">🏟️</span>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  {e.contenido && (
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#4ADE80' }}
                    >
                      {e.contenido}
                    </span>
                  )}
                  <span className="text-[10px] font-mono" style={{ color: '#5B6B85' }}>{e.fecha}</span>
                </div>
                <p className="text-xs mb-2" style={{ color: '#F0F2F5' }}>{e.descripcion}</p>
                {e.cantidad_jugadores && (
                  <p className="text-[10px] mb-2" style={{ color: '#8A9BB8' }}>
                    👥 {e.cantidad_jugadores} jugadores
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  {e.link_video ? (
                    <a
                      href={e.link_video}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium underline"
                      style={{ color: '#8A9BB8' }}
                    >
                      ▶ Ver video
                    </a>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => abrirEditar(e)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleEliminar(e.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtrados.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>No hay entrenamientos cargados con ese filtro.</p>
        )}
      </div>
    </div>
  )
}

export default EntrenamientosSection
