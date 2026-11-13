import { COLORES } from '../theme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'
import EstadisticasEquipo from './EstadisticasEquipo'
import EncabezadoFotografico from './EncabezadoFotografico'
import BarraFiltros from './ui/BarraFiltros'
import EstadoContenido from './ui/EstadoContenido'
import TarjetaIndicador from './ui/TarjetaIndicador'
import './audiovisualPremium.css'
import { fechaCorta } from '../utils/formatoFecha'

// Solo una vista previa de YouTube; el enlace original, incluidos sus tiempos,
// sigue siendo el destino de reproducción. Otros proveedores conservan su enlace.
function miniaturaVideo(valor) {
  try {
    const url = new URL(valor)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0]
      : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)
        ? url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
        : null
    return /^[\w-]{11}$/.test(id || '') ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
  } catch { return null }
}

function VideoSection({ jugadorInicialId, onConsumirJugadorInicial, onIrABiblioteca, perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [tipo, setTipo] = useState('colectivo')
  const [categorias, setCategorias] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [partidos, setPartidos] = useState([])
  const [videos, setVideos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const solicitudVideos = useRef(0)
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
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
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
    const solicitud = ++solicitudVideos.current
    if (tipo === 'estadisticas') {
      setVideos([])
      setCargando(false)
      setErrorCarga(null)
      return
    }
    setCargando(true)
    const { data, error } = await supabase
      .from('videos')
      .select('*, categorias(nombre), jugadores(nombre, apellido, categoria_id, foto_url), partidos(rival, fecha, escudo_url)')
      .eq('tipo', tipo)
      .order('fecha', { ascending: false })
    if (solicitud !== solicitudVideos.current) return
    setVideos(data || [])
    setErrorCarga(error || null)
    setCargando(false)
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
    const nombreArchivo = `videos/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: false,
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

  const nombreCategoriaSeleccionada = categorias.find((c) => c.id === categoriaId)?.nombre

  return (
    <div className="av-premium av-video" style={{ color: COLORES.texto }}>
      <div className="av-contenido">
        <EncabezadoFotografico eyebrowResaltado="Biblioteca audiovisual" titulo="Video" resaltado="análisis" imagen="/images/fotos-comunicaciones/banner_videoanalisis.jpg" descripcionImagen="Cámara registrando un partido de Comunicaciones desde la tribuna" posicion="video-premium" />

        <div className="av-tipos" role="group" aria-label="Tipo de biblioteca">
          <button
            aria-pressed={tipo === 'colectivo'} onClick={() => cambiarTipo('colectivo')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'colectivo' ? 'var(--marca-amarillo)' : COLORES.fondoTarjeta,
              color: tipo === 'colectivo' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            Colectivos
          </button>
          <button
            aria-pressed={tipo === 'individual'} onClick={() => cambiarTipo('individual')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'individual' ? 'var(--marca-amarillo)' : COLORES.fondoTarjeta,
              color: tipo === 'individual' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            Individuales
          </button>
          <button
            aria-pressed={tipo === 'entrenamiento'} onClick={() => cambiarTipo('entrenamiento')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'entrenamiento' ? 'var(--marca-amarillo)' : COLORES.fondoTarjeta,
              color: tipo === 'entrenamiento' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            Entrenamientos
          </button>
          <button
            aria-pressed={tipo === 'estadisticas'} onClick={() => cambiarTipo('estadisticas')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: tipo === 'estadisticas' ? 'var(--marca-amarillo)' : COLORES.fondoTarjeta,
              color: tipo === 'estadisticas' ? 'var(--ui-texto-sobre-acento)' : COLORES.textoSecundario,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            📊 Estadísticas
          </button>
        </div>

        {tipo === 'individual' && jugadorFiltroId && (
          <div
            className="flex items-center justify-between gap-3 p-3 rounded-xl mb-4"
            style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
          >
            <p className="text-sm" style={{ color: COLORES.textoSecundario }}>
              Mostrando videos de:{' '}
              <span style={{ color: COLORES.texto }}>
                {(() => {
                  const j = jugadores.find((jug) => jug.id === jugadorFiltroId)
                  return j ? `${j.apellido}, ${j.nombre}` : 'jugador'
                })()}
              </span>
            </p>
            <button
              onClick={() => setJugadorFiltroId(null)}
              className="text-xs px-3 py-1.5 rounded-full hover:opacity-80 shrink-0"
              style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
            >
              Quitar filtro
            </button>
          </div>
        )}

        <BarraFiltros etiqueta="Filtros de videos">
          {!(tipo === 'individual' && jugadorFiltroId) && (
            esTecnico ? (
              <span
                className="p-2.5 rounded-xl text-sm sm:w-48 text-center"
                style={{ ...inputStyle, color: COLORES.textoSecundario }}
              >
                {perfil?.categorias?.nombre || 'Tu categoría'}
              </span>
            ) : (
              <label className="av-campo"><span>Categoría</span><select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="p-2.5 rounded-xl ui-control outline-none text-sm sm:w-48"
                style={inputStyle}
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select></label>
            )
          )}

          {tipo === 'individual' && !jugadorFiltroId && (
            <label className="av-campo"><span>Buscar jugadora</span><input
              type="text"
              placeholder="Buscar jugador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="p-2.5 rounded-xl ui-control outline-none text-sm flex-1"
              style={inputStyle}
            /></label>
          )}

          {tipo === 'colectivo' && (
            <label className="av-campo"><span>Momento del análisis</span><select
              value={momentoFiltro}
              onChange={(e) => setMomentoFiltro(e.target.value)}
              className="p-2.5 rounded-xl ui-control outline-none text-sm sm:w-44"
              style={inputStyle}
            >
              <option value="">Todos los análisis</option>
              <option value="Prepartido">Prepartido</option>
              <option value="Postpartido">Postpartido</option>
              <option value="Entrenamiento">Entrenamiento</option>
            </select></label>
          )}

          {tipo === 'entrenamiento' && (
            <>
              <label className="av-campo"><span>Buscar por contenido</span><input
                type="text"
                placeholder="Buscar por contenido (ej: definición, presión...)"
                value={busquedaContenido}
                onChange={(e) => setBusquedaContenido(e.target.value)}
                className="p-2.5 rounded-xl ui-control outline-none text-sm flex-1"
                style={inputStyle}
              /></label>
              <label className="av-campo"><span>Cantidad de jugadores</span><select
                value={cantidadFiltro}
                onChange={(e) => setCantidadFiltro(e.target.value)}
                className="p-2.5 rounded-xl ui-control outline-none text-sm sm:w-44"
                style={inputStyle}
              >
                <option value="">Cantidad de jugadores</option>
                {cantidadesDisponibles.map((c) => (
                  <option key={c} value={c}>{c} jugadores</option>
                ))}
              </select></label>
            </>
          )}

          {tipo !== 'estadisticas' && (
            <button
              onClick={abrirFormulario}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
              data-primario=""
            >
              {mostrarForm ? 'Cancelar' : '+ Nuevo video'}
            </button>
          )}
        </BarraFiltros>

        {tipo === 'entrenamiento' && onIrABiblioteca && (
          <button
            onClick={onIrABiblioteca}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 mb-4 w-full sm:w-auto"
            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
          >
            📚 Ir a Biblioteca
          </button>
        )}

        {mostrarForm && tipo !== 'estadisticas' && (
          <div
            className="av-editor av-form-campos"
            style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
          >
            <header className="av-titulo-panel av-campo-completo"><p>BIBLIOTECA AUDIOVISUAL</p><h2>Nuevo video</h2><span>Conservá el vínculo con su categoría, jugadora o partido.</span></header>
            <label className="av-campo"><span>Fecha</span><input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
              style={inputStyle}
            /></label>

            {tipo === 'colectivo' && (
              <>
                {esTecnico ? (
                  <span
                    className="w-full block p-2.5 rounded-xl text-sm"
                    style={{ ...inputStyle, color: COLORES.textoSecundario }}
                  >
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </span>
                ) : (
                <label className="av-campo"><span>Categoría</span><select
                  value={catForm}
                  onChange={(e) => setCatForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select></label>
                )}
                <label className="av-campo"><span>Momento del análisis</span><select
                  value={momentoForm}
                  onChange={(e) => setMomentoForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Análisis</option>
                  <option value="Prepartido">Prepartido</option>
                  <option value="Postpartido">Postpartido</option>
                  <option value="Entrenamiento">Entrenamiento</option>
                </select></label>
                <label className="av-campo"><span>Partido (opcional)</span><select
                  value={partidoForm}
                  onChange={(e) => setPartidoForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Partido (opcional)</option>
                  {partidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      vs {p.rival} — {fechaCorta(p.fecha)}
                    </option>
                  ))}
                </select></label>
                <label className="av-campo"><span>Descripción</span><textarea
                  placeholder="Descripción (ej: entrenamiento martes, partido vs Boca)"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm resize-none"
                  style={inputStyle}
                /></label>
              </>
            )}

            {tipo === 'individual' && (
              <>
                <label className="av-campo"><span>Jugadora</span><select
                  value={jugadorForm}
                  onChange={(e) => setJugadorForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Jugador</option>
                  {jugadores.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.apellido}, {j.nombre} ({j.categorias ? j.categorias.nombre : ''})
                    </option>
                  ))}
                </select></label>
                <label className="av-campo"><span>Partido (opcional)</span><select
                  value={partidoForm}
                  onChange={(e) => setPartidoForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Partido (opcional)</option>
                  {partidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      vs {p.rival} — {fechaCorta(p.fecha)}
                    </option>
                  ))}
                </select></label>
              </>
            )}

            {tipo === 'entrenamiento' && (
              <>
                {esTecnico ? (
                  <span
                    className="w-full block p-2.5 rounded-xl text-sm"
                    style={{ ...inputStyle, color: COLORES.textoSecundario }}
                  >
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </span>
                ) : (
                <label className="av-campo"><span>Categoría</span><select
                  value={catForm}
                  onChange={(e) => setCatForm(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select></label>
                )}
                <label className="av-campo"><span>Contenido</span><input
                  type="text"
                  placeholder="Contenido (ej: definición, presión alta, salida de arco)"
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                /></label>
                <label className="av-campo"><span>Descripción</span><textarea
                  placeholder="Descripción adicional (opcional)"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm resize-none"
                  style={inputStyle}
                /></label>
                <label className="av-campo"><span>Cantidad de jugadores</span><input
                  type="number"
                  placeholder="Cantidad de jugadores"
                  value={cantidadJugadores}
                  onChange={(e) => setCantidadJugadores(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                /></label>
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
                    <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: COLORES.textoMuted }}>
                      Imagen del ejercicio (Tactical Pad, etc.)
                    </label>
                    <div className="flex items-center gap-3">
                      {imagenBiblioteca && (
                        <img
                          src={imagenBiblioteca}
                          alt="Vista previa"
                          className="w-16 h-16 rounded-lg object-cover shrink-0"
                          style={{ border: `1px solid ${COLORES.borde}` }}
                        />
                      )}
                      <label
                        className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                        style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
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
                          style={{ color: COLORES.peligro }}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <label className="av-campo"><span>Link de YouTube</span><input
              type="text"
              placeholder="Link de YouTube"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
              style={inputStyle}
            /></label>

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              data-primario=""
            >
              {guardando ? 'Guardando...' : 'Guardar video'}
            </button>
          </div>
        )}

        {tipo === 'estadisticas' ? (
          <EstadisticasEquipo
            categoriaId={esTecnico ? perfil.categoria_id : categoriaId}
            categoriaNombre={esTecnico ? perfil?.categorias?.nombre : nombreCategoriaSeleccionada}
          />
        ) : (
          <>
            <div className="av-resumen"><TarjetaIndicador etiqueta="Videos visibles" valor={videosFiltrados.length} sinDato={cargando || Boolean(errorCarga)} cobertura="Según el tipo y los filtros actuales" /><div className="av-titulo-panel"><p>ARCHIVO AUDIOVISUAL</p><h2>{tipo === 'colectivo' ? 'Mirada colectiva' : tipo === 'individual' ? 'Seguimiento individual' : 'Ejercicios en video'}</h2><span>Los videos se abren en su enlace original, en otra pestaña.</span></div></div>
            {cargando && <EstadoContenido estado="cargando" titulo="Cargando videos" />}
            {!cargando && errorCarga && <EstadoContenido estado={errorCarga.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la biblioteca audiovisual" mensaje="Un error de consulta no equivale a una biblioteca vacía. Los filtros se conservan." onReintentar={cargarVideos} />}
            <div className="av-videos">
              {!cargando && !errorCarga && videosFiltrados.map((v) => {
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
                const miniatura = miniaturaVideo(v.url)

                return (
                  <article key={v.id} className="av-video-tarjeta">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="av-video-enlace" aria-label={`Abrir video: ${titulo || 'Video sin título'}`}
                  >
                    <div className="av-video-miniatura">
                      <span className="av-reproducir" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="3" y="9" width="42" height="30" rx="5" stroke="currentColor" strokeWidth="2" /><path d="m20 16 13 8-13 8Z" fill="currentColor" /></svg></span>
                      {miniatura && <img src={miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true }} />}
                      <span className="av-abrir-video">Abrir video ↗</span>
                    </div>
                    <div className="av-video-datos">
                    <div className="flex items-center justify-between">
                      <h3>{titulo || 'Video sin título'}</h3>
                      <div className="flex items-center gap-2">
                        {tipo === 'colectivo' && v.momento && (
                          <span
                            className="text-xs font-mono px-2 py-1 rounded-full"
                            style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.exito }}
                          >
                            {v.momento}
                          </span>
                        )}
                        {badge && (
                          <span
                            className="text-xs font-mono px-2 py-1 rounded-full"
                            style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                          >
                            {badge}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs" style={{ color: COLORES.textoMuted }}>
                        {fechaCorta(v.fecha)}
                      </p>
                      {vsPartido && (
                        <span className="text-xs flex items-center gap-1" style={{ color: COLORES.textoSecundario }}>
                          ·
                          {v.partidos?.escudo_url && (
                            <img
                              src={v.partidos.escudo_url}
                              alt={v.partidos.rival}
                              className="w-4 h-4 rounded-sm object-contain inline-block shrink-0"
                              style={{ backgroundColor: COLORES.fondoPagina }}
                            />
                          )}
                          {vsPartido}
                        </span>
                      )}
                      {tipo === 'entrenamiento' && v.descripcion && (
                        <span className="text-xs" style={{ color: COLORES.textoSecundario }}>
                          · {v.descripcion}
                        </span>
                      )}
                      {tipo === 'entrenamiento' && v.cantidad_jugadores && (
                        <span className="text-xs" style={{ color: COLORES.textoSecundario }}>
                          · 👥 {v.cantidad_jugadores} jugadores
                        </span>
                      )}
                    </div>
                    </div>
                  </a>
                  <footer className="av-video-pie"><span>Enlace original · {v.fecha || 'Sin fecha'}</span><button type="button" onClick={(e) => handleEliminarVideo(e, v.id)} className="av-accion av-peligro" aria-label={`Eliminar video ${titulo || v.id}`}>Eliminar</button></footer>
                  </article>
                )
              })}
            </div>

            {!cargando && !errorCarga && videosFiltrados.length === 0 && <EstadoContenido estado="vacio" titulo="Sin videos para estos filtros" mensaje="No hay videos cargados con ese filtro. Podés cambiar la categoría o el tipo de biblioteca." />}
          </>
        )}
      </div>
    </div>
  )
}

export default VideoSection
