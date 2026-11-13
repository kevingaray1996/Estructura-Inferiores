import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'
import PizarraEjercicio from './PizarraEjercicio'
import { validarPizarra } from '../utils/pizarra'
import EncabezadoFotografico from './EncabezadoFotografico'
import BarraFiltros from './ui/BarraFiltros'
import TarjetaIndicador from './ui/TarjetaIndicador'
import EstadoContenido from './ui/EstadoContenido'
import './audiovisualPremium.css'
import { fechaCorta, fechaLarga } from '../utils/formatoFecha'

function EntrenamientosSection({ onPlanificar }) {
  const [entrenamientos, setEntrenamientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
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
  const [pizarra, setPizarra] = useState(null)
  const [miniatura, setMiniatura] = useState('')
  const [pizarraCambiada, setPizarraCambiada] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  useEffect(() => {
    cargarEntrenamientos()
  }, [])

  useEffect(() => {
    if (!mostrarForm || !pizarraCambiada) return
    const avisar = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [mostrarForm, pizarraCambiada])

  async function cargarEntrenamientos() {
    setCargando(true)
    const { data, error } = await supabase
      .from('biblioteca')
      .select('*')
      .order('fecha', { ascending: false })
    setEntrenamientos(data || [])
    setErrorCarga(error || null)
    setCargando(false)
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
    setPizarra(null); setMiniatura(''); setPizarraCambiada(false); setErrorGuardar('')
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
    setPizarra(e.pizarra || null); setMiniatura(e.pizarra_miniatura || ''); setPizarraCambiada(false); setErrorGuardar('')
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
    if (pizarraCambiada && !window.confirm('¿Descartar la pizarra sin guardar el ejercicio?')) return
    setMostrarForm(false)
    setEntrenamientoEditando(null)
  }

  async function handleSubirImagen(archivo) {
    if (!archivo) return
    setSubiendoImagen(true)
    const archivoComprimido = await comprimirImagen(archivo, { maxAncho: 1000, maxAlto: 1000 })
    const nombreArchivo = `entrenamientos/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: false,
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
    if (!fecha || !descripcion || guardando) return
    setGuardando(true)
    setErrorGuardar('')

    const datos = {
      fecha,
      contenido: contenido || null,
      descripcion,
      cantidad_jugadores: cantidadJugadores !== '' ? parseInt(cantidadJugadores, 10) : null,
      imagen_url: imagenUrl || null,
      link_video: linkVideo || null,
    }

    try {
      let respuesta
      if (pizarraCambiada || entrenamientoEditando?.pizarra) {
        const doc = pizarra ? validarPizarra(pizarra) : null
        respuesta = await supabase.rpc('guardar_ejercicio_pizarra', { p_id: entrenamientoEditando?.id || null,
          p_revision: entrenamientoEditando ? entrenamientoEditando.pizarra_revision : null,
          p_datos: { ...datos, pizarra: doc, pizarra_miniatura: miniatura } })
        if (!respuesta.error && !respuesta.data?.id) throw Error('No se pudo confirmar el guardado. Recargá antes de reintentar.')
      } else if (entrenamientoEditando) {
        respuesta = await supabase.from('biblioteca').update(datos).eq('id', entrenamientoEditando.id)
      } else {
        respuesta = await supabase.from('biblioteca').insert(datos)
      }
      if (respuesta.error) throw respuesta.error
    } catch (e) {
      setErrorGuardar(e.code === '40001' ? 'El ejercicio cambió en otra sesión. Conservá un respaldo JSON y recargá antes de guardar.' :
        ['PGRST202', '42883'].includes(e.code) ? 'Falta aplicar la migración de pizarra. El diseño sigue en este formulario; podés descargar su respaldo JSON.' : e.message || 'No se pudo guardar el ejercicio.')
      setGuardando(false); return
    }

    setGuardando(false)
    setMostrarForm(false)
    setEntrenamientoEditando(null)
    cargarEntrenamientos()
  }

  function duplicarEjercicio(e) {
    if (mostrarForm && !window.confirm('¿Abrir una copia? Se descartará el formulario actual.')) return
    abrirEditar(e); setEntrenamientoEditando(null); setFecha(obtenerFechaHoy()); setPizarraCambiada(Boolean(e.pizarra))
  }

  async function handleEliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este entrenamiento?')
    if (!confirmar) return
    await supabase.from('biblioteca').delete().eq('id', id)
    cargarEntrenamientos()
  }

  return (
    <div className="av-premium av-entrenamientos" style={{ color: COLORES.texto }}>
      <div className="av-contenido">
        <EncabezadoFotografico eyebrowResaltado="Biblioteca de ejercicios" titulo="Entrena" resaltado="mientos" imagen="/images/fotos-comunicaciones/banner_entrenamientos.jpg" descripcionImagen="Cancha y tribunas negras y amarillas de Comunicaciones" posicion="entrenamientos-premium">
          <div className="av-acciones-cabecera">
          {onPlanificar && <button type="button" onClick={onPlanificar} className="av-accion">▦ Planificación semanal</button>}
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="av-accion av-primario" aria-expanded={mostrarForm} aria-controls="entrenamientos-editor"
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo entrenamiento'}
          </button>
          </div>
        </EncabezadoFotografico>

        {mostrarForm && (
          <section id="entrenamientos-editor" className="av-editor" aria-labelledby="entrenamientos-editor-titulo">
            <header className="av-titulo-panel"><p>DISEÑO DEL TRABAJO</p><h2 id="entrenamientos-editor-titulo">{entrenamientoEditando ? 'Editar entrenamiento' : 'Nuevo entrenamiento'}</h2><span>Datos del ejercicio, recursos y pizarra táctica.</span></header>
            <div className="av-form-campos">
            {entrenamientoEditando && (
              <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                Editando entrenamiento del {fechaLarga(entrenamientoEditando.fecha)}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="av-campo"><span>Fecha</span><input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <label className="av-campo"><span>Contenido</span><input
                type="text"
                list="contenidos-lista"
                placeholder="Contenido (ej: Tenencia, Ofensivos, Tácticos...)"
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <datalist id="contenidos-lista">
                {contenidos.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <label className="av-campo"><span>Descripción del ejercicio</span><textarea
              placeholder="Descripción del ejercicio"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm resize-none"
              style={inputStyle}
            /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="av-campo"><span>Cantidad de jugadores</span><input
                type="number"
                min="1"
                placeholder="Cantidad de jugadores"
                value={cantidadJugadores}
                onChange={(e) => setCantidadJugadores(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <label className="av-campo"><span>Link de video (opcional)</span><input
                type="text"
                placeholder="Link de video (opcional)"
                value={linkVideo}
                onChange={(e) => setLinkVideo(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: COLORES.textoMuted }}>
                Imagen del ejercicio (Tactical Pad, etc.)
              </label>
              <div className="flex items-center gap-3">
                {imagenUrl && (
                  <img
                    src={imagenUrl}
                    alt="Vista previa"
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                    style={{ border: `1px solid ${COLORES.borde}` }}
                  />
                )}
                <label
                  className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 cursor-pointer"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
                >
                  {subiendoImagen ? 'Subiendo...' : imagenUrl ? 'Cambiar imagen' : '📤 Subir imagen'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSubirImagen(e.target.files?.[0])}
                    disabled={subiendoImagen}
                    className="av-archivo"
                  />
                </label>
                {imagenUrl && (
                  <button
                    type="button"
                    onClick={() => setImagenUrl('')}
                    className="text-xs"
                    style={{ color: COLORES.peligro }}
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
              data-primario=""
            >
              {guardando ? 'Guardando...' : entrenamientoEditando ? 'Guardar cambios' : 'Guardar entrenamiento'}
            </button>
            </div>
            <PizarraEjercicio key={entrenamientoEditando?.id || 'nuevo'} valor={pizarra} miniatura={miniatura} nombre={contenido || 'Ejercicio'} onChange={(doc, vista) => { setPizarra(doc); setMiniatura(vista); setPizarraCambiada(true) }} />
            {pizarra && <button type="button" onClick={() => { if (window.confirm('¿Quitar la pizarra de este ejercicio? Las copias de planificación no cambian.')) { setPizarra(null); setMiniatura(''); setPizarraCambiada(true) } }}>Quitar pizarra</button>}
            {errorGuardar && <EstadoContenido estado="error" titulo="No se pudo guardar el ejercicio" mensaje={errorGuardar} />}
          </section>
        )}

        <BarraFiltros etiqueta="Filtros de ejercicios">
          <label className="av-campo"><span>Contenido</span><select
            value={contenidoFiltro}
            onChange={(e) => setContenidoFiltro(e.target.value)}
            className="p-2.5 rounded-xl ui-control outline-none text-sm sm:w-56"
            style={inputStyle}
          >
            <option value="">Todos los contenidos</option>
            {contenidos.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select></label>
          <label className="av-campo"><span>Cantidad de jugadores</span><select
            value={cantidadFiltro}
            onChange={(e) => setCantidadFiltro(e.target.value)}
            className="p-2.5 rounded-xl ui-control outline-none text-sm sm:w-48"
            style={inputStyle}
          >
            <option value="">Cantidad de jugadores</option>
            {cantidades.map((c) => (
              <option key={c} value={c}>{c} jugadores</option>
            ))}
          </select></label>
          <label className="av-campo"><span>Buscar en la descripción</span><input
            type="text"
            placeholder="Buscar en la descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="p-2.5 rounded-xl ui-control outline-none text-sm flex-1"
            style={inputStyle}
          /></label>
        </BarraFiltros>
        <div className="av-resumen"><TarjetaIndicador etiqueta="Ejercicios visibles" valor={filtrados.length} sinDato={cargando || Boolean(errorCarga)} cobertura="Según los filtros actuales" /><div className="av-titulo-panel"><p>BIBLIOTECA DE EJERCICIOS</p><h2>Recursos para cada sesión</h2><span>Imágenes, enlaces y pizarras editables en un mismo lugar.</span></div></div>
        {cargando && <EstadoContenido estado="cargando" titulo="Cargando biblioteca" />}
        {!cargando && errorCarga && <EstadoContenido estado={errorCarga.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la biblioteca" mensaje="El error no indica que no existan ejercicios. Tus filtros se conservan." onReintentar={cargarEntrenamientos} />}

        <div className="av-ejercicios">
          {!cargando && !errorCarga && filtrados.map((e) => (
            <div
              key={e.id}
              className="av-ejercicio"
              style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
            >
              <div
                className="w-full aspect-[2/1] flex items-center justify-center"
                style={{ backgroundColor: COLORES.fondoPagina }}
              >
                {e.imagen_url ? (
                  <img src={e.imagen_url} alt={e.contenido || 'Entrenamiento'} className="w-full h-full object-cover" />
                ) : e.pizarra_miniatura?.startsWith('data:image/png;base64,') ? (
                  <img src={e.pizarra_miniatura} alt={`Pizarra de ${e.contenido || 'entrenamiento'}`} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-3xl">🏟️</span>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                {e.pizarra && <PizarraEjercicio valor={e.pizarra} nombre={e.contenido || 'Ejercicio'} soloLectura />}
                <button type="button" onClick={() => duplicarEjercicio(e)} className="text-xs underline text-left" style={{ color: COLORES.textoSecundario }}>Duplicar ejercicio</button>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  {e.contenido && (
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.exito }}
                    >
                      {e.contenido}
                    </span>
                  )}
                  <span className="text-[10px] font-mono" style={{ color: COLORES.textoMuted }}>{fechaCorta(e.fecha)}</span>
                </div>
                <h3 className="av-descripcion-ejercicio" style={{ color: COLORES.texto }}>{e.descripcion}</h3>
                {e.cantidad_jugadores && (
                  <p className="text-[10px] mb-2" style={{ color: COLORES.textoSecundario }}>
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
                      style={{ color: COLORES.textoSecundario }}
                    >
                      ▶ Ver video
                    </a>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Editar ejercicio ${e.contenido || e.descripcion}`} onClick={() => abrirEditar(e)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                    >
                      Editar
                    </button>
                    <button
                      aria-label={`Eliminar ejercicio ${e.contenido || e.descripcion}`} onClick={() => handleEliminar(e.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!cargando && !errorCarga && filtrados.length === 0 && <EstadoContenido estado="vacio" titulo="Sin ejercicios para estos filtros" mensaje="No hay entrenamientos cargados con ese filtro. Podés cambiar el contenido, la cantidad o la búsqueda." />}
      </div>
    </div>
  )
}

export default EntrenamientosSection



