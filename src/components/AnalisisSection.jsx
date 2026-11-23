import { direccionDeLaAccion, direccionDelPeriodo, referenciaNueva, referenciaVerificada, zonaTactica, zonaEvento as zonaEfectivaEvento } from '../utils/orientacionAnalisis'
import { ANALISIS as A, textoAnalisis } from '../appearance/analisis'



import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { consultarAdministracionAnalisis, esCuentaAdministradoraAnalisis, faltaRpcAdministracionAnalisis } from '../utils/permisosAnalisis'
import useVentanaAnalisis from '../hooks/useVentanaAnalisis'
import ZonaVentanaAnalisis from './ZonaVentanaAnalisis'
import ControlesVideoAnalisis from './ControlesVideoAnalisis'
import { crearBloqueoEtiquetado, leerTiempoActivo, registroInciertoTrasError } from '../utils/ventanaAnalisis'
import { crearRelojVideo, useTiempoVideo } from '../utils/relojVideo'
import { leerPaginas } from '../utils/rendimiento/lecturas'
import { cargarYouTubeEnVentana, mensajeErrorYouTube } from '../utils/youtubeVentana'
import './ventanasAnalisis.css'
import EncabezadoSeccion from './ui/EncabezadoSeccion'
import DetalleDestinoPase from './DetalleDestinoPase'
import MapaAcciones from './analisis/MapaAcciones'
import useMarcasPartidos from '../hooks/useMarcasPartidos'
import ExploradorAnalisis from './analisis/ExploradorAnalisis'
import EstadisticasAnalisis from './analisis/EstadisticasAnalisis'
import { Boton, Campo, Panel } from './analisis/PiezasAnalisis'
import { AMARILLO, CLASE_CAMPO, ESTILO_CAMPO } from '../utils/analisis/estilos'
import { datosEncuentro, fechaLegible, formatearTiempo, nombreJugadora, videoCalendario, youtubeEmbed } from '../utils/analisis/formato'
import { resultadoImplicito, resultadoParaGuardar } from '../utils/analisis/completitud'
import { CATALOGO_POR_DEFECTO, cargarCatalogo, etiquetaBotonDe, etiquetaDe, opcionesResultado as opcionesResultadoCatalogo } from '../utils/analisis/catalogoAcciones'
import {
  cargarResumenDestinatarias, esPase, guardarDestinataria, mensajeErrorDestinataria,
  nombreDestinataria,
} from '../utils/destinatariasPases'
import { mensajeError, mensajeErrorOPropio } from '../utils/mensajesError'
import useColaEtiquetado from '../hooks/useColaEtiquetado'
import { esActualizacion } from '../utils/analisis/colaEtiquetado'
import useAtajosAnalisis from '../hooks/useAtajosAnalisis'
import { accionesSinTeclaPorMarcador, guardarAtajos, leerAtajos, mostrarTecla } from '../utils/analisis/atajos'
import { AvisoAccion, AyudaAtajos, IndicadorAtajos } from './analisis/AtajosEtiquetado'
import TramosSinAcciones from './analisis/TramosSinAcciones'
import EstadoGuardado from './analisis/EstadoGuardado'
import { atajosDeBotonera, tiposBotonera } from '../utils/analisis/botonera'
import './analisis/panelAnalisis.css'
import PlaylistAnalisis from './analisis/PlaylistAnalisis'
import usePlaylistAnalisis from '../hooks/usePlaylistAnalisis'
import { clipDe } from '../utils/analisis/playlist'
import PartidoEventos from './analisis/PartidoEventos'
import ImportarComet from './analisis/ImportarComet'
import InformeAnalisis from './analisis/InformeAnalisis'
import useEventosPartido from '../hooks/useEventosPartido'
import usePlanillaMinutos from '../hooks/usePlanillaMinutos'
import { MARCAS, enCancha as enCanchaEn, estabaEnCancha, faltanMarcas, minutoReal, minutosSugeridos, periodoPorMarcas, problemasOrden } from '../utils/analisis/eventosPartido'
import { tiemposDe } from '../utils/analisis/marcador'
import MarcadorVideo from './analisis/MarcadorVideo'
import { BotonesGol, CartelMarcador, FilaTarjetaCambio } from './analisis/MarcadorBotonera'
import BotoneraColectiva from './analisis/BotoneraColectiva'
import LineaTiempo from './analisis/LineaTiempo'
import ClipSeleccionado from './analisis/ClipSeleccionado'
import FormularioScouting from './analisis/FormularioScouting'
import useGrabacionColectiva from '../hooks/useGrabacionColectiva'
import {
  equiposDelAnalisis, esMomento, esScouting, filtrarAnalisis, guardarAtajosColectiva, leerAtajosColectiva,
  momentosDesde, separarAcciones,
} from '../utils/analisis/colectiva'

const CATEGORIA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const ZONAS = [
  'Defensa izquierda', 'Defensa centro', 'Defensa derecha',
  'Medio izquierda', 'Medio centro', 'Medio derecha',
  'Ataque izquierda', 'Ataque centro', 'Ataque derecha',
]

const RESULTADOS = [
  'Exitoso', 'Fallido', 'Neutro', 'Gol', 'Atajada', 'Fuera', 'Bloqueado',
]

const RESULTADOS_DESPEJE = ['Exitoso', 'Fallido', 'Neutro']
const CRITERIO_DESPEJE = 'Exitoso: elimina o reduce el peligro defensivo, aunque la pelota termine en posesión rival. Fallido: no resuelve la situación y genera o mantiene peligro inmediato. Neutro: no genera una ventaja ni un perjuicio defensivo claro.'

function validarResultadoAccion(tipo, resultado) {
  if (tipo === 'Despeje' && !RESULTADOS_DESPEJE.includes(resultado)) {
    throw new Error('Seleccioná Exitoso, Fallido o Neutro para completar el despeje.')
  }
}

const inputClass = CLASE_CAMPO

const inputStyle = ESTILO_CAMPO

const catalogoExplorador = { resultados: RESULTADOS, zonas: ZONAS }

// Pestañas del panel derecho de la vista de video.
const PESTANAS_PANEL = [['etiquetado', 'Etiquetado'], ['playlist', 'Playlist'], ['partido', 'Partido']]

// Al cambiar de tipo se conserva el resultado si sigue siendo válido para el
// tipo nuevo según el catálogo; si no, se preselecciona su primera opción.
function resultadoAlCambiarSegunCatalogo(catalogo, tipo, actual) {
  const opciones = opcionesResultadoCatalogo(catalogo, tipo)
  return opciones.includes(actual) ? actual : (opciones[0] ?? '')
}

// Preferencia de cada dispositivo. Sin almacenamiento disponible, arranca apagado.
const CLAVE_UN_TOQUE = 'analisis:marcar-sin-jugadora'

function leerUnToque() {
  try { return window.localStorage.getItem(CLAVE_UN_TOQUE) === '1' } catch { return false }
}

function guardarUnToque(activo) {
  try { window.localStorage.setItem(CLAVE_UN_TOQUE, activo ? '1' : '0') } catch { /* sin almacenamiento */ }
}

function TiempoVideo({ reloj }) {
  return formatearTiempo(useTiempoVideo(reloj))
}


function obtenerCoordenadas(posicion) {
  if (!posicion || typeof posicion !== 'string') return null

  const [xStr, yStr] = posicion.split(',')
  const x = Number(xStr)
  const y = Number(yStr)

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

function direccionOpuesta(direccion) {
  return direccion === 'derecha' ? 'izquierda' : 'derecha'
}


function coordenadasEvento(evento) {
  const tieneX = evento?.coordenada_x !== null && evento?.coordenada_x !== undefined && evento?.coordenada_x !== ''
  const tieneY = evento?.coordenada_y !== null && evento?.coordenada_y !== undefined && evento?.coordenada_y !== ''
  const x = Number(evento?.coordenada_x)
  const y = Number(evento?.coordenada_y)

  if (tieneX && tieneY && Number.isFinite(x) && Number.isFinite(y)) {
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)), exacta: true }
  }

  // Los eventos antiguos se muestran en el centro aproximado de su zona,
  // sin modificar ni sobrescribir sus datos históricos.
  const indice = ZONAS.indexOf(evento?.zona)
  if (indice < 0) return null
  const sector = Math.floor(indice / 3) // Defensa, Medio, Ataque
  const carril = indice % 3 // izquierda, centro, derecha
  const invertida = referenciaVerificada(evento) && evento.direccion_captura === 'izquierda'
  return { x: invertida ? 100 - [17, 50, 83][sector] : [17, 50, 83][sector], y: invertida ? 100 - [17, 50, 83][carril] : [17, 50, 83][carril], exacta: false }
}

function tieneCoordenadasExactas(evento) {
  return evento?.coordenada_x !== null && evento?.coordenada_x !== undefined && evento?.coordenada_x !== '' &&
    evento?.coordenada_y !== null && evento?.coordenada_y !== undefined && evento?.coordenada_y !== '' &&
    Number.isFinite(Number(evento.coordenada_x)) && Number.isFinite(Number(evento.coordenada_y))
}


function colorTipo(tipo) {
  if (['Gol', 'Remate', 'Centro'].includes(tipo)) return '#F2C230'
  if (['Pase correcto', 'Recuperación', 'Atajada', 'Falta recibida'].includes(tipo)) return '#4ADE80'
  if (['Pérdida', 'Pase incorrecto', 'Falta cometida'].includes(tipo)) return '#F87171'
  return '#60A5FA'
}

// zonaDe(evento): zona a mostrar (con el partido, las acciones viejas con punto y sin zona la calculan).
function CanchaInteractiva({ eventos = [], coordenadas, direccion = null, interactiva = false, onSelect, onEventClick, capaTrayectorias, etiquetaTipo = (codigo) => codigo, zonaDe = zonaEfectivaEvento }) {
  function manejarClick(e) {
    if (!interactiva || !onSelect) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    onSelect({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) })
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border" style={{ borderColor: '#78917D', backgroundColor: '#176344' }}>
      <svg
        viewBox="0 0 100 64"
        role={interactiva ? 'button' : 'img'}
        aria-label={interactiva ? 'Cancha interactiva. Seleccioná la ubicación de la acción.' : 'Cancha con ubicaciones de acciones registradas.'}
        onClick={interactiva ? manejarClick : undefined}
        className={interactiva ? 'block w-full cursor-crosshair' : 'block w-full'}
        style={{ touchAction: 'manipulation' }}
      >
        <rect x="1" y="1" width="98" height="62" rx="0.5" fill="#176344" stroke="#E5F0E7" strokeWidth="0.7" />
        <line x1="50" y1="1" x2="50" y2="63" stroke="#E5F0E7" strokeWidth="0.55" />
        <circle cx="50" cy="32" r="9.2" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <circle cx="50" cy="32" r="0.7" fill="#E5F0E7" />
        <line x1="33.333" y1="1" x2="33.333" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="66.666" y1="1" x2="66.666" y2="63" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="1" y1="21.333" x2="99" y2="21.333" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <line x1="1" y1="42.666" x2="99" y2="42.666" stroke="#D1FAE5" strokeWidth="0.3" strokeDasharray="1.2 1.2" opacity="0.8" />
        <rect x="1" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="1" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="83" y="17" width="16" height="30" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <rect x="93.5" y="24" width="5.5" height="16" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        <path d="M17 25 A7 7 0 0 1 17 39 M83 25 A7 7 0 0 0 83 39" fill="none" stroke="#E5F0E7" strokeWidth="0.55" />
        {capaTrayectorias}
        {eventos.map((evento) => {
          const punto = coordenadasEvento(evento)
          if (!punto) return null
          const cx = punto.x
          const cy = punto.y * 0.64
          return (
            <g
              key={evento.id}
              onClick={onEventClick ? (e) => { e.stopPropagation(); onEventClick(evento) } : undefined}
              style={{ cursor: onEventClick ? 'pointer' : 'default' }}
            >
              <title>{`${etiquetaTipo(evento.tipo)} · ${formatearTiempo(evento.segundo)} · ${evento.resultado || 'Pendiente'} · ${zonaDe(evento) || 'Sin zona'}${referenciaVerificada(evento) ? '' : ' (referencia no verificada)'}`}</title>
              <circle cx={cx} cy={cy} r={punto.exacta ? 1.65 : 1.35} fill={colorTipo(evento.tipo)} stroke="#10251B" strokeWidth="0.35" opacity={punto.exacta ? 1 : 0.65} />
              {punto.exacta && <circle cx={cx} cy={cy} r="2.35" fill="none" stroke={colorTipo(evento.tipo)} strokeWidth="0.3" />}
            </g>
          )
        })}
        {coordenadas && (
          <g pointerEvents="none">
            <circle cx={coordenadas.x} cy={coordenadas.y * 0.64} r="2.2" fill="#F2C230" stroke="#FFFFFF" strokeWidth="0.7" />
            <path d={`M ${coordenadas.x - 3} ${coordenadas.y * 0.64} L ${coordenadas.x + 3} ${coordenadas.y * 0.64} M ${coordenadas.x} ${coordenadas.y * 0.64 - 3} L ${coordenadas.x} ${coordenadas.y * 0.64 + 3}`} stroke="#FFFFFF" strokeWidth="0.55" />
          </g>
        )}
      </svg>
      {!direccion && <p className="px-2 text-[10px] text-white">Coordenadas originales. Las zonas históricas no están verificadas; las nuevas usan su orientación de captura.</p>}
      {direccion && <p className="px-2 text-[10px] text-white">Ataque {direccion}. Arriba: carril {direccion === 'derecha' ? 'izquierdo' : 'derecho'} del equipo; abajo: carril {direccion === 'derecha' ? 'derecho' : 'izquierdo'}.</p>}
      <div className="flex justify-between px-2 pb-2 text-[10px] font-black tracking-wide" style={{ color: '#E5F0E7' }}>
        <span>{direccion === 'derecha' ? 'DEFENSA' : direccion === 'izquierda' ? 'ATAQUE' : 'IZQUIERDA VISUAL'}</span><span>MEDIO</span><span>{direccion === 'derecha' ? 'ATAQUE' : direccion === 'izquierda' ? 'DEFENSA' : 'DERECHA VISUAL'}</span>
      </div>
    </div>
  )
}


let youtubeApiPromise = null

function cargarYouTubeAPI() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube solo puede iniciarse en el navegador.'))
  }

  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve, reject) => {
    const callbackAnterior = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      if (typeof callbackAnterior === 'function') callbackAnterior()

      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        youtubeApiPromise = null
        reject(new Error('YouTube no pudo inicializar el reproductor.'))
      }
    }

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    )

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true

      script.onerror = () => {
        youtubeApiPromise = null
        reject(new Error('No se pudo cargar la API de YouTube.'))
      }

      document.head.appendChild(script)
    }
  })

  return youtubeApiPromise
}

// modoConsulta: cuerpo técnico (y coordinación sin permiso de edición). Ve video, Playlist, mapa, estadísticas e
// informe; no ve la botonera ni nada que guarde. La base (RLS) igual rechaza cualquier escritura.
export default function AnalisisSection({ escrituraAutorizada = true, estadoAutorizacion, modoConsulta = false }) {
  const [usuario, setUsuario] = useState(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [accesoEditor, setAccesoEditor] = useState(false)
  const [estadoPermiso, setEstadoPermiso] = useState('verificando')
  const bloqueoEscritura = !esAdmin || !escrituraAutorizada
  const [puedeEditarDestinatarias, setPuedeEditarDestinatarias] = useState(false)
  const [paseDestinataria, setPaseDestinataria] = useState(null)
  const [paseDestinoId, setPaseDestinoId] = useState(null)
  const [resumenDestinatarias, setResumenDestinatarias] = useState({ detalles: {}, nombres: {}, cargando: true, error: '' })
  const [recargaDestinatarias, setRecargaDestinatarias] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const [partidos, setPartidos] = useState([])
  const [partidosCalendario, setPartidosCalendario] = useState([])
  // Todas las acciones leídas de la base. Las individuales («eventos», lo de siempre) y los momentos colectivos
  // (etapa 1) se separan más abajo, cuando ya está el catálogo.
  const [todasLasAcciones, setEventos] = useState([])
  const [jugadoras, setJugadoras] = useState([])
  const [citaciones, setCitaciones] = useState([])

  const [partidoId, setPartidoId] = useState('')
  const [partidoCalendarioId, setPartidoCalendarioId] = useState('')
  const [periodoActual, setPeriodoActual] = useState(1)

  const [alcanceEstadisticas, setAlcanceEstadisticas] = useState('partido')

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [notas, setNotas] = useState('')

  const [tipo, setTipo] = useState('Pase correcto')
  const [jugadorId, setJugadorId] = useState('')
  const [segundo, setSegundo] = useState('0')
  const [tiempoAutomatico, setTiempoAutomatico] = useState(true)
  const [zona, setZona] = useState('Medio centro')
  const [coordenadasAccion, setCoordenadasAccion] = useState(null)
  const [resultado, setResultado] = useState('Exitoso')
  const [observaciones, setObservaciones] = useState('')

  const [seccion, setSeccion] = useState('video')
  const [filtroExploradorPartido, setFiltroExploradorPartido] = useState('todos')
  const [filtroExploradorJugadora, setFiltroExploradorJugadora] = useState('todos')
  const [filtroExploradorTipo, setFiltroExploradorTipo] = useState('todos')
  const [filtroExploradorResultado, setFiltroExploradorResultado] = useState('todos')
  const [filtroExploradorZona, setFiltroExploradorZona] = useState('todos')
  const [filtroExploradorMinutoDesde, setFiltroExploradorMinutoDesde] = useState('')
  const [filtroExploradorMinutoHasta, setFiltroExploradorMinutoHasta] = useState('')
  const [segundoPendiente, setSegundoPendiente] = useState(null)

  const [alcanceMapa, setAlcanceMapa] = useState('partido')
  const [filtroMapaPartido, setFiltroMapaPartido] = useState('todos')
  const [filtroMapaJugadora, setFiltroMapaJugadora] = useState('todos')

  const [tipoRapido, setTipoRapido] = useState('')
  const [unToque, setUnToque] = useState(leerUnToque)
  const [catalogoAcciones, setCatalogoAcciones] = useState({ catalogo: CATALOGO_POR_DEFECTO, origen: 'base', aviso: '' })
  const catalogo = catalogoAcciones.catalogo
  // Lo de siempre (Playlist, mapa, estadísticas, informe) sigue viendo solo las individuales.
  const { individuales: eventos, momentos } = useMemo(() => separarAcciones(todasLasAcciones, catalogo), [todasLasAcciones, catalogo])
  const etiquetaTipo = (codigo) => etiquetaDe(catalogo, codigo)
  // Formularios: los tipos visibles, más el actual aunque esté oculto.
  const opcionesTipo = (actual) => {
    const visibles = catalogo.tipos.filter((t) => t.visible)
    return !actual || visibles.some((t) => t.codigo === actual)
      ? visibles
      : [...visibles, { codigo: actual, etiqueta: etiquetaDe(catalogo, actual) }]
  }
  const [ultimaAccion, setUltimaAccion] = useState(null)
  const [busquedaJugadora, setBusquedaJugadora] = useState('')
  const [mostrarEdicionEvento, setMostrarEdicionEvento] = useState(false)
  const [editandoEventoId, setEditandoEventoId] = useState(null)
  const [edicionEvento, setEdicionEvento] = useState({
    tipo: 'Pase correcto',
    jugador_id: '',
    segundo: '0',
    periodo: 1,
    zona: '',
    resultado: '',
    observaciones: '',
    coordenada_x: null,
    coordenada_y: null,
  })

  const iframeRef = useRef(null)
  const playerRef = useRef(null)

  const [videoListo, setVideoListo] = useState(false)
  const [videoListoPartidoId, setVideoListoPartidoId] = useState(null)
  const [videoReproduciendo, setVideoReproduciendo] = useState(false)
  const [relojVideo] = useState(crearRelojVideo)
  const [segundoIr, setSegundoIr] = useState('0')
  const [velocidadVideo, setVelocidadVideo] = useState(1)
  const [velocidadesVideo, setVelocidadesVideo] = useState([])
  const [comandoPendiente, setComandoPendiente] = useState(false)
  const [revisionReproductor, setRevisionReproductor] = useState(0)
  const [registroIncierto, setRegistroIncierto] = useState(false)
  const comandoRef = useRef(null)
  const restaurarVideoRef = useRef(null)
  const contextoAnalisisRef = useRef(null)
  const [bloqueoEtiquetado] = useState(crearBloqueoEtiquetado)

  const partidoActual = partidos.find((p) => p.id === partidoId)
  // Scouting (no juega Comunicaciones): por ahora solo botonera colectiva, sin marcador, COMET ni planilla.
  const scouting = esScouting(partidoActual)
  // Equipo analizado (desde donde marca la colectiva) y el otro.
  const equiposPartido = useMemo(() => equiposDelAnalisis(partidoActual), [partidoActual])
  const direccionAtaqueActual = direccionDelPeriodo(partidoActual, periodoActual)

  const partidoCalendarioActual =
    partidoActual?.partido_calendario ||
    partidosCalendario.find(
      (p) => p.id === partidoActual?.partido_calendario_id,
    )

  const videoUrlActual =
    partidoActual?.video_url || videoCalendario(partidoCalendarioActual)

  const videoActual = youtubeEmbed(videoUrlActual)
  useLayoutEffect(() => { contextoAnalisisRef.current = { partidoId, videoActual, seccion } }, [partidoId, videoActual, seccion])
  const ventanas = useVentanaAnalisis((anterior, siguiente) => {
    if (anterior !== 'reproductor' && siguiente !== 'reproductor') return
    try {
      const player = playerRef.current
      const tiempo = player?.getCurrentTime?.()
      if (videoListo && Number.isFinite(tiempo)) restaurarVideoRef.current = { partidoId, videoActual, tiempo, reproduciendo: player.getPlayerState?.() === 1, velocidad: player.getPlaybackRate?.() || 1 }
      player?.pauseVideo?.()
    } catch { /* El iframe puede haberse cerrado. Se conserva la ultima lectura confirmada. */ }
    comandoRef.current = null
    setComandoPendiente(false); setVideoListo(false); setVideoListoPartidoId(null)
  })
  const destinoReproductor = ventanas.modo === 'reproductor' ? ventanas.revision : 0

  const tiempoActivo = useCallback(() => leerTiempoActivo({
    player: playerRef.current, iframe: iframeRef.current, listo: videoListo,
    partidoId, partidoListo: videoListoPartidoId,
    conectado: ventanas.gestor.conectado(), pendiente: Boolean(comandoRef.current),
  }), [videoListo, partidoId, videoListoPartidoId, ventanas.gestor])

  // Segundo para etiquetar o para encadenar saltos: no espera a que YouTube confirme un comando. Si hay un salto
  // en curso, vale el segundo al que se saltó (el reproductor todavía puede informar el anterior).
  const tiempoCaptura = useCallback(() => {
    const tiempo = leerTiempoActivo({
      player: playerRef.current, iframe: iframeRef.current, listo: videoListo,
      partidoId, partidoListo: videoListoPartidoId,
      conectado: ventanas.gestor.conectado(), pendiente: false,
    })
    const comando = comandoRef.current
    return comando?.tipo === 'salto' && comando.partidoId === partidoId ? comando.valor : tiempo
  }, [videoListo, partidoId, videoListoPartidoId, ventanas.gestor])

  // Cola de guardado del etiquetado: cada toque aparece al instante y se guarda de fondo (useColaEtiquetado).
  const { cola, items: colaItems } = useColaEtiquetado({
    enviar: (registro) => supabase.from('analisis_eventos').insert(registro).select().single(),
    borrar: (id) => supabase.from('analisis_eventos').delete().eq('id', id),
    // Fin de un momento colectivo al cerrarlo (se guardó al abrirse con un fin provisorio).
    actualizar: (id, cambios) => supabase.from('analisis_eventos').update(cambios).eq('id', id).select('id').single(),
    alConfirmar: (fila) => setEventos((actuales) => actuales.some((e) => e.id === fila.id)
      ? actuales
      : [...actuales, fila].sort((a, b) => Number(a.segundo) - Number(b.segundo))),
    alActualizar: (id, cambios) => setEventos((actuales) => actuales.map((e) => (e.id === id ? { ...e, ...cambios } : e))),
    alFallarBorrado: (fila, e) => setError(`${mensajeError(e, 'deshacer la acción')} La acción ${etiquetaDe(catalogo, fila.tipo)} · ${formatearTiempo(fila.segundo)} sigue guardada.`),
    activa: !modoConsulta,
  })

  // Atajos de teclado (se guardan en esta computadora), aviso corto y botón iluminado.
  const [atajos, setAtajos] = useState(leerAtajos)
  const cambiarAtajos = useCallback((nuevo) => { setAtajos(nuevo); guardarAtajos(nuevo) }, [])
  // Acciones que tenían G, Y o X (ahora del marcador) y quedaron sin tecla: se avisa una vez.
  const [sinTeclaPorMarcador, setSinTeclaPorMarcador] = useState(accionesSinTeclaPorMarcador)
  // Cartel de Gol / Tarjeta / Cambio: { tipo, segundo, referencia, reanudar }. El video queda en pausa mientras está abierto.
  const [cartelMarcador, setCartelMarcador] = useState(null)
  const [guardandoMarcador, setGuardandoMarcador] = useState(false)
  // La botonera sale del catálogo configurable (analisis_tipos_accion): tipos visibles, en su orden.
  const botonera = useMemo(() => tiposBotonera(catalogo), [catalogo])
  // Solo las acciones de la botonera tienen tecla.
  const atajosBotonera = useMemo(() => atajosDeBotonera(atajos, botonera), [atajos, botonera])
  // Botonera colectiva (etapa 1): momentos que duran, sin jugadora. Teclas propias, guardadas en esta compu.
  const botoneraColectiva = useMemo(() => tiposBotonera(catalogo, 'colectiva'), [catalogo])
  const [atajosColectiva, setAtajosColectiva] = useState(leerAtajosColectiva)
  const cambiarAtajosColectiva = useCallback((nuevo) => { setAtajosColectiva(nuevo); guardarAtajosColectiva(nuevo) }, [])
  const atajosBotoneraColectiva = useMemo(() => atajosDeBotonera(atajosColectiva, botoneraColectiva), [atajosColectiva, botoneraColectiva])
  const [modoBotonera, setModoBotonera] = useState(() => {
    // Por defecto la individual (la de siempre); la compu recuerda la última elegida.
    try { return window.localStorage.getItem('analisis_modo_botonera_v1') === 'colectiva' ? 'colectiva' : 'individual' } catch { return 'individual' }
  })
  const elegirModoBotonera = useCallback((modo) => {
    setModoBotonera(modo)
    try { window.localStorage.setItem('analisis_modo_botonera_v1', modo) } catch { /* Sin preferencia guardada. */ }
  }, [])
  const botoneraEnUso = scouting ? 'colectiva' : modoBotonera
  // Línea de tiempo: desde qué equipo se ven los momentos (espejo) y cuál está elegido.
  const [vistaMomentos, setVistaMomentos] = useState('analizado')
  const [momentoElegidoId, setMomentoElegidoId] = useState(null)
  // Biblioteca: filtro de análisis (propios / scouting) y búsqueda por rival.
  const [filtroBiblioteca, setFiltroBiblioteca] = useState({ tipo: 'todos', rival: '' })
  const partidosFiltrados = useMemo(() => filtrarAnalisis(partidos, filtroBiblioteca), [partidos, filtroBiblioteca])
  // Nuevo análisis: partido propio (del calendario) o de scouting.
  const [tipoNuevoAnalisis, setTipoNuevoAnalisis] = useState('propio')
  // Partido propio: desde qué equipo marca la botonera colectiva (Comunicaciones o el rival).
  const [equipoAnalizadoPropio, setEquipoAnalizadoPropio] = useState('propio')
  // Pestaña del panel derecho (Etiquetado / Playlist / Partido).
  const [pestanaPanel, setPestanaPanel] = useState(modoConsulta ? 'playlist' : 'etiquetado')
  const pestanasPanel = modoConsulta ? PESTANAS_PANEL.filter(([id]) => id !== 'etiquetado') : PESTANAS_PANEL
  // Flechas, Inicio y Fin mueven entre pestañas. Se frena el evento para que ← / → no muevan el video.
  const moverPestana = useCallback((evento) => {
    const ids = [...evento.currentTarget.querySelectorAll('[role="tab"]')].map((b) => b.id.replace('az-pestana-', ''))
    const actual = ids.indexOf(evento.target?.id?.replace('az-pestana-', ''))
    if (actual < 0) return
    const destino = { ArrowRight: actual + 1, ArrowLeft: actual - 1, Home: 0, End: ids.length - 1 }[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    evento.stopPropagation()
    const id = ids[(destino + ids.length) % ids.length]
    setPestanaPanel(id)
    evento.currentTarget.querySelector(`#az-pestana-${id}`)?.focus()
  }, [])
  const [ayudaAtajos, setAyudaAtajos] = useState(false)
  const [eligiendoTecla, setEligiendoTecla] = useState(false)
  const [avisoAccion, setAvisoAccion] = useState(null)
  const [iluminado, setIluminado] = useState(null)
  useEffect(() => {
    if (!avisoAccion) return undefined
    const t = setTimeout(() => setAvisoAccion(null), 1600)
    return () => clearTimeout(t)
  }, [avisoAccion])
  useEffect(() => {
    if (!iluminado) return undefined
    const t = setTimeout(() => setIluminado(null), 450)
    return () => clearTimeout(t)
  }, [iluminado])

  const confirmarComando = useCallback((player) => {
    const comando = comandoRef.current
    if (!comando) return
    if (comando.partidoId !== contextoAnalisisRef.current?.partidoId) {
      comandoRef.current = null; setComandoPendiente(false); return
    }
    const estado = player.getPlayerState?.(), tiempo = player.getCurrentTime?.()
    const confirmado = comando.tipo === 'salto' ? Number.isFinite(tiempo) && Math.abs(tiempo - comando.valor) <= 1.5 && [0, 1, 2, 5].includes(estado)
      : comando.tipo === 'velocidad' ? player.getPlaybackRate?.() === comando.valor
      : estado === (comando.tipo === 'pausa' ? 2 : 1)
    if (confirmado) { comandoRef.current = null; setComandoPendiente(false) }
    else if (Date.now() - comando.inicio > 10000) {
      comandoRef.current = null; setComandoPendiente(false); setVideoListo(false)
      setError('YouTube no confirmó el comando. Reconectá el video antes de etiquetar; no se guardaron acciones.')
      return false
    }
  }, [])

  const solicitarVideo = useCallback((accion, valor) => {
    let emitido = null
    try {
      // tiempoCaptura: permite encadenar saltos (← ← →) sin esperar la confirmación del anterior.
      const tiempo = tiempoCaptura(), player = playerRef.current
      const tipoComando = accion === 'alternar' ? player.getPlayerState?.() === 1 ? 'pausa' : 'reproducir' : accion
      if (tipoComando === 'salto' && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) throw Error('Ingresá un segundo válido.')
      if (tipoComando === 'velocidad' && !player.getAvailablePlaybackRates?.().includes(valor)) throw Error('Esta velocidad no está disponible en el video.')
      const objetivo = tipoComando === 'salto' ? Math.floor(Number(valor)) : valor
      comandoRef.current = { tipo: tipoComando, valor: objetivo, partidoId, inicio: Date.now() }
      emitido = comandoRef.current
      setComandoPendiente(true); setError('')
      if (tipoComando === 'salto') { player.seekTo(objetivo, true); player.playVideo(); setSegundoIr(String(objetivo)) }
      else if (tipoComando === 'velocidad') player.setPlaybackRate(valor)
      else if (tipoComando === 'pausa') player.pauseVideo()
      else player.playVideo()
      // Confirmación por eventos o lectura posterior de la API, no por un reloj inventado.
      relojVideo.fijar(tiempo)
      return true
    } catch (e) {
      if (emitido && comandoRef.current === emitido) { comandoRef.current = null; setComandoPendiente(false) }
      setError(mensajeErrorOPropio(e, 'controlar el video')); return false
    }
  }, [partidoId, tiempoCaptura, relojVideo])

  useEffect(() => {
    if ((seccion !== 'video' || !usuario) && ventanas.gestor.getSnapshot().modo) ventanas.gestor.acoplar()
  }, [seccion, usuario, ventanas.gestor])

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const authUser = authData?.user
      setPuedeEditarDestinatarias(false)

      if (!authUser?.email) {
        setUsuario(null)
        setAccesoEditor(false)
        setEsAdmin(false)
        setPartidos([])
        setPartidosCalendario([])
        setEventos([])
        setJugadoras([])
        setCitaciones([])
        setPartidoId('')
        setError('Iniciá sesión para consultar Análisis.')
        return
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('email, nombre, rol, categoria_id')
        .eq('email', authUser.email)
        .maybeSingle()

      if (perfilError) throw perfilError

      setUsuario(perfil || null)

      let admin = false
      if (modoConsulta) {
        // Solo ver: la base decide qué análisis y acciones devuelve (puede_consultar_analisis).
        if (!['coordinacion', 'tecnico'].includes(perfil?.rol)) {
          setAccesoEditor(false)
          throw new Error('No tenés autorización para ver Análisis.')
        }
        setEstadoPermiso('consulta')
        setAccesoEditor(true)
      } else if (!esCuentaAdministradoraAnalisis(authUser.id) || perfil?.rol !== 'coordinacion') {
        setAccesoEditor(false)
        throw new Error('No tenés autorización para abrir el módulo Análisis.')
      } else {
        try {
          admin = await consultarAdministracionAnalisis(supabase)
          setEstadoPermiso(admin ? 'permitido' : 'denegado')
          setAccesoEditor(Boolean(admin))
          if (!admin) throw Object.assign(new Error('No tenés autorización para administrar Análisis.'), { denegacionExplicita: true })
        } catch (errorPermiso) {
          if (errorPermiso.denegacionExplicita) throw errorPermiso
          // Permite consultar la interfaz a las cuentas verificadas, nunca guardar sin RPC.
          setEstadoPermiso(faltaRpcAdministracionAnalisis(errorPermiso) ? 'pendiente_migracion' : 'error')
          setAccesoEditor(true)
        }
      }

      setEsAdmin(Boolean(admin))
      setPuedeEditarDestinatarias(Boolean(admin))


      const { data: calendario, error: calendarioError } = await supabase
        .from('partidos')
        .select(`
          id, categoria_id, rival, fecha, hora, lugar, local_visitante,
          numero_fecha, video_partido_completo, video_resumen,
          video_analisis_propio, video_analisis_rival, video_pelota_parada,
          video_gps, video_charla_dt, video_arenga, video_resumen_vigilancias,
          link, formacion, escudo_url, goles_local, goles_visitante, penales_favor, penales_contra
        `)
        .eq('categoria_id', CATEGORIA_ID)
        .order('fecha', { ascending: false })

      if (calendarioError) throw calendarioError

      const calendarioLista = calendario || []
      setPartidosCalendario(calendarioLista)

      const { data: lista, error: partidosError } = await supabase
        .from('analisis_partidos')
        .select('*')
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (partidosError) throw partidosError

      const listaPartidos = (lista || []).map((analisis) => {
        let calendarioPartido = calendarioLista.find(
          (p) => p.id === analisis.partido_calendario_id,
        ) || null

        // Un scouting nunca se vincula con el calendario (no juega Comunicaciones).
        if (!calendarioPartido && analisis.tipo_partido !== 'scouting' && analisis.fecha && analisis.rival) {
          const coincidencias = calendarioLista.filter(
            (p) =>
              p.fecha === analisis.fecha &&
              p.rival?.trim().toLowerCase() ===
                analisis.rival.trim().toLowerCase(),
          )

          if (coincidencias.length === 1) {
            calendarioPartido = coincidencias[0]
          }
        }

        return {
          ...analisis,
          partido_calendario: calendarioPartido,
        }
      })

      setPartidos(listaPartidos)

      const ids = listaPartidos.map((p) => p.id)

      if (!ids.length) {
        setEventos([])
      } else {
        // Paginado: Supabase corta cada consulta en 1000 filas y una temporada las supera.
        const listaEventos = await leerPaginas(() => supabase
          .from('analisis_eventos')
          .select('*')
          .in('partido_id', ids)
          .order('segundo', { ascending: true }))

        setEventos(listaEventos)
      }

      const categoriaIds = [
        ...new Set(
          listaPartidos.map((p) => p.categoria_id).filter(Boolean),
        ),
      ]

      let listaJugadoras = []

      if (categoriaIds.length) {
        const { data: jugadoresData, error: jugadoresError } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, categoria_id, estado')
          .in('categoria_id', categoriaIds)
          .order('apellido', { ascending: true })

        if (jugadoresError) {
          console.warn('No se pudieron cargar las jugadoras:', jugadoresError)
        } else {
          listaJugadoras = jugadoresData || []
        }
      }

      setJugadoras(listaJugadoras)

      setPartidoId((actual) =>
        listaPartidos.some((p) => p.id === actual)
          ? actual
          : listaPartidos[0]?.id || '',
      )
    } catch (e) {
      console.error('Error en Análisis:', e)
      setEsAdmin(false)
      setPuedeEditarDestinatarias(false)
      setError(mensajeErrorOPropio(e, 'cargar los datos'))
    } finally {
      setCargando(false)
    }
  }, [modoConsulta])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Convocadas del encuentro seleccionado: se obtienen desde la pestaña Convocados.
  useEffect(() => {
    let cancelado = false

    async function cargarCitaciones() {
      setCitaciones([])
      setJugadorId('')

      const calendarioId =
        partidoActual?.partido_calendario_id ||
        partidoActual?.partido_calendario?.id

      if (!calendarioId) return

      const { data, error: citacionesError } = await supabase
        .from('citaciones')
        .select('*')
        .eq('partido_id', calendarioId)

      if (cancelado) return

      if (citacionesError) {
        console.error('Error al cargar convocadas:', citacionesError)
        setError(
          'No se pudieron cargar las convocadas. Revisá los permisos de la tabla citaciones.',
        )
        return
      }

      const filas = (data || []).map((c) => {
        const jugadora = jugadoras.find((j) => j.id === c.jugador_id)
        const coordenadas = obtenerCoordenadas(c.posicion_cancha)

        return {
          ...c,
          jugadora: jugadora || null,
          coordenadas,
          titular: Boolean(c.titular || coordenadas),
        }
      }).filter((c) => c.jugadora)

      filas.sort((a, b) => {
        const dorsalA = Number(a.dorsal)
        const dorsalB = Number(b.dorsal)

        if (Number.isFinite(dorsalA) && Number.isFinite(dorsalB)) {
          return dorsalA - dorsalB
        }

        return nombreJugadora(a.jugadora).localeCompare(
          nombreJugadora(b.jugadora),
          'es',
        )
      })

      setCitaciones(filas)
    }

    cargarCitaciones()

    return () => {
      cancelado = true
    }
  }, [
    partidoActual?.partido_calendario_id,
    partidoActual?.partido_calendario?.id,
    jugadoras,
  ])

  useEffect(() => {
    const iframe = iframeRef.current

    if (!videoActual || seccion !== 'video' || !iframe) {
      return undefined
    }

    let cancelado = false

    setVideoListo(false)
    setVideoListoPartidoId(null)
    setVideoReproduciendo(false)
    relojVideo.fijar(0)
    comandoRef.current = null
    setComandoPendiente(false)

    const duena = iframe.ownerDocument.defaultView
    const carga = duena === window ? cargarYouTubeAPI() : cargarYouTubeEnVentana(duena)
    carga
      .then((YT) => {
        if (cancelado || !iframe.isConnected) return

        playerRef.current = new YT.Player(iframe, {
          events: {
            onReady: (evento) => {
              if (cancelado) return
              setVideoListo(true)
              setVideoListoPartidoId(partidoId)
              relojVideo.fijar(
                Math.floor(evento.target.getCurrentTime() || 0),
              )
              setVelocidadVideo(evento.target.getPlaybackRate?.() || 1)
              setVelocidadesVideo(evento.target.getAvailablePlaybackRates?.() || [])
              const restaurar = restaurarVideoRef.current
              if (restaurar?.partidoId === partidoId && restaurar.videoActual === videoActual) {
                // Al inicio, pausado, el iframe ya está en cero; no esperar un
                // salto que YouTube puede no emitir hasta la primera reproducción.
                if (restaurar.tiempo > 0 || restaurar.reproduciendo) {
                  comandoRef.current = { tipo: 'salto', valor: restaurar.tiempo, partidoId, inicio: Date.now() }
                  setComandoPendiente(true)
                  evento.target.seekTo(restaurar.tiempo, true)
                }
                if (evento.target.getAvailablePlaybackRates?.().includes(restaurar.velocidad)) evento.target.setPlaybackRate(restaurar.velocidad)
                if (restaurar.reproduciendo) evento.target.playVideo()
                else evento.target.pauseVideo()
              }
            },
            onStateChange: (evento) => {
              if (!cancelado) {
                setVideoReproduciendo(
                  evento.data === YT.PlayerState.PLAYING,
                )
                confirmarComando(evento.target)
              }
            },
            onPlaybackRateChange: (evento) => {
              if (!cancelado) { setVelocidadVideo(evento.data); confirmarComando(evento.target) }
            },
            onAutoplayBlocked: () => {
              if (!cancelado) setError('El navegador bloqueó la reproducción automática. Pulsá reproducir dentro del video y reconectá si no responde.')
            },
            onError: (evento) => {
              if (!cancelado) {
                setVideoListo(false)
                setError(mensajeErrorYouTube(evento.data))
              }
            },
          },
        })
      })
      .catch((e) => {
        if (!cancelado) {
          setError(
            e.message || 'No se pudo conectar el reproductor de YouTube.',
          )
        }
      })

    return () => {
      cancelado = true

      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch (e) {
          console.warn('No se pudo cerrar el reproductor:', e)
        }

        playerRef.current = null
      }

      setVideoListo(false)
      setVideoListoPartidoId(null)
      setVideoReproduciendo(false)
    }
  }, [videoActual, partidoId, seccion, cargando, destinoReproductor, revisionReproductor, confirmarComando, relojVideo])

  useEffect(() => {
    if (!videoListo || !playerRef.current) return undefined

    const intervalo = window.setInterval(() => {
      try {
        const tiempoActual = playerRef.current?.getCurrentTime?.()

        if (Number.isFinite(tiempoActual)) {
          relojVideo.fijar(tiempoActual)
          const confirmacion = confirmarComando(playerRef.current)
          if (!comandoRef.current && confirmacion !== false) restaurarVideoRef.current = { partidoId, videoActual, tiempo: tiempoActual,
            reproduciendo: playerRef.current.getPlayerState?.() === 1, velocidad: playerRef.current.getPlaybackRate?.() || 1 }
        }
      } catch {
        // El reproductor puede estar cambiando de estado.
      }
    }, 500)

    return () => window.clearInterval(intervalo)
  }, [videoListo, partidoId, videoActual, confirmarComando, relojVideo])

  useEffect(() => {
    if (
      !segundoPendiente ||
      !videoListo ||
      videoListoPartidoId !== segundoPendiente.partidoId ||
      !playerRef.current || comandoPendiente ||
      seccion !== 'video' ||
      partidoId !== segundoPendiente.partidoId
    ) return

    try {
      // Evita consumir el salto mientras todavía está montado el reproductor anterior.
      if (solicitarVideo('salto', segundoPendiente.segundo)) setSegundoPendiente(null)
    } catch (e) {
      console.error('No se pudo abrir la acción desde el mapa/explorador:', e)
      setError('No se pudo saltar a ese momento del video. Probá tocar la acción nuevamente cuando el video termine de cargar.')
    }
  }, [segundoPendiente, videoListo, videoListoPartidoId, seccion, partidoId, comandoPendiente, solicitarVideo])

  // Acciones de la cola que todavía no están confirmadas: se muestran al instante, marcadas con su estado.
  const pendientesCola = useMemo(() => {
    const confirmadas = new Set(todasLasAcciones.map((e) => e.id))
    // Las actualizaciones (fin de un momento) no son acciones nuevas: no se listan.
    return colaItems.filter((i) => !i.cancelada && !confirmadas.has(i.id) && !esActualizacion(i.registro))
      .map((i) => ({ ...i.registro, _cola: i.estado, _error: i.error }))
  }, [colaItems, todasLasAcciones])

  const eventosPartido = useMemo(
    () => {
      const delPartido = eventos.filter((e) => e.partido_id === partidoId)
      const pendientes = pendientesCola.filter((e) => e.partido_id === partidoId && !esMomento(e, catalogo))
      return pendientes.length
        ? [...delPartido, ...pendientes].sort((a, b) => Number(a.segundo) - Number(b.segundo))
        : delPartido
    },
    [eventos, partidoId, pendientesCola, catalogo],
  )
  // Momentos colectivos del partido (confirmados y los que se están guardando).
  const momentosPartido = useMemo(() => [
    ...momentos.filter((m) => m.partido_id === partidoId),
    ...pendientesCola.filter((e) => e.partido_id === partidoId && esMomento(e, catalogo)),
  ].sort((a, b) => Number(a.segundo) - Number(b.segundo)), [momentos, pendientesCola, partidoId, catalogo])
  const colaConError = pendientesCola.filter((e) => e._cola === 'error')
  const colaRechazadas = pendientesCola.filter((e) => e._cola === 'rechazada')

  // Zona de cada acción con su partido: las viejas con punto y sin zona la calculan con la dirección del 1T del partido.
  const partidosPorId = useMemo(() => new Map(partidos.map((p) => [p.id, p])), [partidos])
  // Estadísticas, explorador, mapa acumulado e informe cuentan solo partidos propios (no los de scouting).
  const partidosPropios = useMemo(() => partidos.filter((p) => !esScouting(p)), [partidos])

  // Filtro del mapa: alcance, partido y jugadora (capa, resultado y tiempo los maneja el mapa).
  const eventosMapa = useMemo(() => {
    const base = alcanceMapa === 'acumulado' ? eventos : eventosPartido
    return base.filter((evento) =>
      (alcanceMapa !== 'acumulado' || filtroMapaPartido === 'todos' || evento.partido_id === filtroMapaPartido) &&
      (filtroMapaJugadora === 'todos' || evento.jugador_id === filtroMapaJugadora)
    )
  }, [alcanceMapa, eventos, eventosPartido, filtroMapaPartido, filtroMapaJugadora])

  const paseDestinoActual = eventosMapa.find((evento) => evento.id === paseDestinoId && esPase(evento))

  // El etiquetado rápido no espera a la base ni a YouTube: se bloquea solo sin permiso o sin video conectado.
  const capturaBloqueada = bloqueoEscritura || !videoListo || !ventanas.conectado

  const opcionesEdicion = opcionesResultadoCatalogo(catalogo, edicionEvento.tipo)
  const resultadoAnteriorEdicion = !resultadoImplicito(edicionEvento.tipo, catalogo) && edicionEvento.resultado &&
    !opcionesEdicion.includes(edicionEvento.resultado) ? edicionEvento.resultado : ''

  // Se oculta si la acción ya no está (borrada o recargada) o si cambió el partido.
  const accionDeshacible = ultimaAccion?.partidoId === partidoId
    ? eventosPartido.find((evento) => evento.id === ultimaAccion.id) || momentosPartido.find((m) => m.id === ultimaAccion.id) || null
    : null

  // Playlist: salta al clip de la acción (3 s antes) y lo reproduce.
  const irAClip = useCallback((evento) => (videoListo ? solicitarVideo('salto', clipDe(evento).inicio) : false), [videoListo, solicitarVideo])

  // Línea de tiempo: momentos vistos desde el equipo analizado o desde el otro (espejo, calculado acá).
  const momentosVista = useMemo(() => momentosDesde(momentosPartido, catalogo, vistaMomentos), [momentosPartido, catalogo, vistaMomentos])
  const momentoElegido = momentosVista.find((m) => m.id === momentoElegidoId) || null
  // Tocar una barra: la elige y reproduce el video desde su inicio.
  const reproducirMomento = useCallback((momento) => {
    setMomentoElegidoId(momento.id)
    if (videoListo) solicitarVideo('salto', Number(momento.inicio ?? momento.segundo))
  }, [videoListo, solicitarVideo])
  // Largo del video (para la escala de la línea); 0 si el reproductor todavía no lo sabe.
  const obtenerDuracionVideo = useCallback(() => {
    try { return Number(playerRef.current?.getDuration?.()) || 0 } catch { return 0 }
  }, [])
  const playlist = usePlaylistAnalisis({
    partidoId,
    partido: partidoActual || null,
    eventos: eventosPartido,
    detalles: resumenDestinatarias.detalles,
    catalogo,
    citaciones,
    visible: seccion === 'video' && pestanaPanel === 'playlist',
    puedeEditar: accesoEditor && !bloqueoEscritura,
    reloj: relojVideo,
    irAClip,
    guardarCampos: guardarCamposPlaylist,
    guardarReceptora: guardarReceptoraPlaylist,
    avisar: (texto) => setAvisoAccion((anterior) => ({ texto, n: (anterior?.n || 0) + 1 })),
    alFallar: (e) => {
      const texto = e?.code === '40001' ? mensajeErrorDestinataria(e) : mensajeErrorOPropio(e, 'guardar el detalle de la acción')
      setError(texto)
      return texto
    },
  })

  // Receptoras de los pases del partido, para la Playlist. Se vuelve a leer solo si cambian los pases.
  const pasesDelPartido = useMemo(() => eventosPartido.filter((e) => esPase(e) && !e._cola).map((e) => e.id).join(','), [eventosPartido])
  useEffect(() => {
    if ((seccion !== 'video' && seccion !== 'informe') || !pasesDelPartido) return undefined
    let cancelado = false
    async function cargar() {
      setResumenDestinatarias((a) => ({ ...a, cargando: true, error: '' }))
      try {
        // cargarResumenDestinatarias solo usa el id y el tipo de cada pase.
        const resumen = await cargarResumenDestinatarias(supabase, pasesDelPartido.split(',').map((id) => ({ id, tipo: 'Pase correcto' })))
        if (!cancelado) setResumenDestinatarias((a) => ({ detalles: { ...a.detalles, ...resumen.detalles }, nombres: { ...a.nombres, ...resumen.nombres }, cargando: false, error: '' }))
      } catch {
        if (!cancelado) setResumenDestinatarias((a) => ({ ...a, cargando: false, error: 'No se pudieron leer las receptoras de los pases.' }))
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [seccion, pasesDelPartido, recargaDestinatarias])

  const filtrosExplorador = useMemo(() => ({
    partido: filtroExploradorPartido,
    jugadora: filtroExploradorJugadora,
    tipo: filtroExploradorTipo,
    resultado: filtroExploradorResultado,
    zona: filtroExploradorZona,
    minutoDesde: filtroExploradorMinutoDesde,
    minutoHasta: filtroExploradorMinutoHasta,
  }), [
    filtroExploradorPartido,
    filtroExploradorJugadora,
    filtroExploradorTipo,
    filtroExploradorResultado,
    filtroExploradorZona,
    filtroExploradorMinutoDesde,
    filtroExploradorMinutoHasta,
  ])
  const cambiarFiltroExplorador = {
    partido: setFiltroExploradorPartido,
    jugadora: setFiltroExploradorJugadora,
    tipo: setFiltroExploradorTipo,
    resultado: setFiltroExploradorResultado,
    zona: setFiltroExploradorZona,
    minutoDesde: setFiltroExploradorMinutoDesde,
    minutoHasta: setFiltroExploradorMinutoHasta,
  }

  // Una lectura al entrar. Si falla, cargarCatalogo devuelve el catálogo base con un aviso.
  useEffect(() => {
    let cancelado = false
    cargarCatalogo(supabase).then((resultado) => { if (!cancelado) setCatalogoAcciones(resultado) })
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      // Renovar el token conserva el editor. App revalida sin desmontarlo.
      if (evento === 'SIGNED_OUT' || !sesion?.user?.id) {
        setEsAdmin(false); setAccesoEditor(false); setPuedeEditarDestinatarias(false)
        setPaseDestinataria(null); setPaseDestinoId(null)
        setUsuario(null); setEventos([]); setPartidos([])
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (seccion !== 'explorador' && seccion !== 'mapa') return
    let cancelado = false
    async function cargar() {
      setResumenDestinatarias({ detalles: {}, nombres: {}, cargando: true, error: '' })
      try {
        const resumen = await cargarResumenDestinatarias(supabase, eventos)
        if (!cancelado) setResumenDestinatarias({ ...resumen, cargando: false, error: '' })
      } catch {
        if (!cancelado) setResumenDestinatarias({ detalles: {}, nombres: {}, cargando: false,
          error: 'No se pudieron cargar los detalles de pases. Las acciones siguen disponibles.' })
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [seccion, eventos, recargaDestinatarias])


  const partidosDisponibles = useMemo(
    () => [...partidosCalendario].sort((a, b) =>
      (b.fecha || '').localeCompare(a.fecha || ''),
    ),
    [partidosCalendario],
  )

  const titulares = useMemo(
    () => citaciones.filter((c) => c.titular || c.coordenadas),
    [citaciones],
  )

  const suplentes = useMemo(
    () => citaciones.filter((c) => !c.titular && !c.coordenadas),
    [citaciones],
  )

  // Eventos del partido (marcas de tiempo, cambios, goles y tarjetas) atados al video.
  const eventosDelPartido = useEventosPartido(partidoActual?.id || null)
  const marcasPartido = eventosDelPartido.marcas
  // Marcas para el mapa: las del partido abierto (al día) y, con «Todos los partidos», las de cada análisis.
  const marcasTodos = useMarcasPartidos(seccion === 'mapa' && alcanceMapa === 'acumulado')
  const marcasPanel = useMemo(() => new Map(partidoId ? [[partidoId, marcasPartido]] : []), [partidoId, marcasPartido])
  const marcasMapa = useMemo(() => {
    if (alcanceMapa !== 'acumulado') return marcasPanel
    const todas = new Map(marcasTodos)
    if (partidoId) todas.set(partidoId, marcasPartido)
    return todas
  }, [alcanceMapa, marcasPanel, marcasTodos, partidoId, marcasPartido])
  const jugadorasPorId = useMemo(() => new Map(jugadoras.map((j) => [j.id, j])), [jugadoras])
  const nombreJugadoraPorId = useCallback((id) => (id && jugadorasPorId.has(id) ? nombreJugadora(jugadorasPorId.get(id)) : ''), [jugadorasPorId])
  // Receptora de un pase para la ficha del mapa (de la tabla de detalles de pases).
  const receptoraDe = useCallback((evento) => {
    const detalle = resumenDestinatarias.detalles?.[evento.id]
    if (!detalle) return ''
    if (detalle.destinataria_id) {
      return resumenDestinatarias.nombres?.[detalle.destinataria_id] || nombreJugadoraPorId(detalle.destinataria_id) || 'receptora identificada'
    }
    if (detalle.destinataria_estado === 'desconocida') return 'receptora desconocida'
    if (detalle.destinataria_estado === 'no_observable') return 'no se ve la receptora'
    return ''
  }, [resumenDestinatarias.detalles, resumenDestinatarias.nombres, nombreJugadoraPorId])
  // Título del mapa: «Fecha 12 · vs Rival» cuando se mira un solo partido.
  const encabezadoMapa = useMemo(() => {
    const id = alcanceMapa === 'acumulado' ? (filtroMapaPartido === 'todos' ? null : filtroMapaPartido) : partidoId
    const partido = id ? partidosPorId.get(id) : null
    if (!partido) return null
    const calendario = partido.partido_calendario || partidosCalendario.find((p) => p.id === partido.partido_calendario_id)
    const numero = calendario?.numero_fecha
    return { antes: numero ? `Fecha ${numero}` : (calendario?.fecha || partido.fecha ? fechaLegible(calendario?.fecha || partido.fecha) : ''), rival: partido.rival || 'Rival sin nombre' }
  }, [alcanceMapa, filtroMapaPartido, partidoId, partidosPorId, partidosCalendario])
  const estadoPasesMapa = useMemo(() => ({
    cargando: resumenDestinatarias.cargando, error: resumenDestinatarias.error,
    reintentar: () => setRecargaDestinatarias((n) => n + 1),
  }), [resumenDestinatarias.cargando, resumenDestinatarias.error])
  const titularesIds = useMemo(() => titulares.map((c) => c.jugador_id), [titulares])
  // ¿Estaba en cancha esa jugadora en ese segundo del video? null si no se puede saber.
  const fueraDeCancha = useCallback(
    (jugadorId, segundoVideo) => estabaEnCancha(jugadorId, segundoVideo, titularesIds, eventosDelPartido.cambios) === false,
    [titularesIds, eventosDelPartido.cambios],
  )
  const planillaMinutos = usePlanillaMinutos(partidoActual?.partido_calendario_id || null, seccion === 'video' && pestanaPanel === 'partido')
  const minutosPartido = useMemo(() => {
    const sugeridos = minutosSugeridos(citaciones.map((c) => c.jugador_id), titularesIds, eventosDelPartido.cambios, marcasPartido)
    const motivo = !titularesIds.length ? 'No hay titulares en la formación: cargalas en Convocados para calcular los minutos.'
      : faltanMarcas(marcasPartido).length ? `Para sugerir los minutos faltan marcas: ${faltanMarcas(marcasPartido).join(', ')}.`
        : problemasOrden(marcasPartido).length ? 'Corregí el orden de las marcas de tiempo para sugerir los minutos.' : ''
    return { sugeridos, motivo }
  }, [citaciones, titularesIds, eventosDelPartido.cambios, marcasPartido])

  // Con el inicio del 2T marcado, el 1T / 2T sigue solo al video.
  const periodoAutomatico = marcasPartido.inicio_2t != null
  useEffect(() => {
    if (!periodoAutomatico) return undefined
    return relojVideo.suscribir(() => {
      const periodo = periodoPorMarcas(relojVideo.leer(), marcasPartido)
      if (periodo) setPeriodoActual((actual) => (actual === periodo ? actual : periodo))
    })
  }, [periodoAutomatico, marcasPartido, relojVideo])

  // detalle: el tiempo del video, que se muestra chiquito al lado.
  function avisarRapido(texto, detalle = '') {
    setAvisoAccion((anterior) => ({ texto, detalle, n: (anterior?.n || 0) + 1 }))
  }

  // ---------- Marcador: Gol, Gol rival, Tarjeta y Cambio (botonera y teclas G, Shift + G, Y, X) ----------

  // Toma el segundo actual del video. Gol rival se guarda al instante; los demás abren un cartel con el video en pausa.
  function abrirMarcador(boton) {
    if (!esAdmin || !escrituraAutorizada || !partidoActual || cartelMarcador || guardandoMarcador) return
    if (capturaBloqueada || !playerRef.current) { setError('Esperá a que el video esté conectado para cargar goles, tarjetas o cambios.'); return }
    if (eventosDelPartido.error || eventosDelPartido.cargando) {
      setError(eventosDelPartido.error || 'Todavía se están leyendo los eventos del partido. Probá de nuevo en un momento.'); return
    }
    let segundoVideo
    try { segundoVideo = tiempoCaptura() } catch (e) { setError(mensajeErrorOPropio(e, 'tomar el tiempo del video')); return }
    if (boton === 'gol_rival') { guardarGolRival(segundoVideo); return }
    const periodoGol = periodoPorMarcas(segundoVideo, marcasPartido) ?? periodoActual
    let referencia = null
    if (boton === 'gol') {
      try { referencia = referenciaNueva(partidoActual, periodoGol) } catch (e) { setError(mensajeErrorOPropio(e, 'cargar el gol')); return }
    }
    let reanudar = false
    try { reanudar = playerRef.current.getPlayerState?.() === 1 } catch { /* Sin lectura: no se reanuda solo. */ }
    if (reanudar) solicitarVideo('pausa')
    setTipoRapido('')
    setPestanaPanel('etiquetado')
    setError('')
    setCartelMarcador({ tipo: boton, segundo: segundoVideo, referencia, reanudar, periodo: periodoGol })
  }

  function cerrarMarcador(reanudar) {
    setCartelMarcador(null)
    if (reanudar) solicitarVideo('reproducir')
  }

  async function guardarGolRival(segundoVideo) {
    setGuardandoMarcador(true)
    try {
      await eventosDelPartido.guardar({ tipo: 'gol', segundo: segundoVideo, equipo: 'rival' })
      const t = tiemposDe(segundoVideo, marcasPartido)
      avisarRapido(`⚽ Gol rival · ${t.partido || t.video}`, t.partido ? t.video : '')
      setError('')
    } catch (e) {
      setError(mensajeErrorOPropio(e, 'guardar el gol rival'))
    } finally {
      setGuardandoMarcador(false)
    }
  }

  // Gol nuestro: el gol del marcador y la acción «Gol» de la jugadora (con el punto, si se marcó), juntos.
  async function guardarMarcador(datos) {
    const c = cartelMarcador
    if (!c || guardandoMarcador) return
    setGuardandoMarcador(true)
    const t = tiemposDe(c.segundo, marcasPartido)
    const cuando = t.partido || t.video
    const detalle = t.partido ? t.video : ''
    try {
      if (c.tipo === 'cambio') {
        await eventosDelPartido.guardar({ tipo: 'cambio', segundo: c.segundo, jugadora_sale: datos.sale, jugadora_entra: datos.entra })
        avisarRapido(`Cambio · ${cuando}`, detalle)
      } else if (c.tipo === 'tarjeta') {
        await eventosDelPartido.guardar({
          tipo: 'tarjeta', segundo: c.segundo, equipo: datos.equipo, tarjeta: datos.tarjeta,
          jugador_id: datos.equipo === 'propio' && datos.jugadorId ? datos.jugadorId : null,
        })
        avisarRapido(`Tarjeta ${datos.tarjeta} · ${cuando}`, detalle)
      } else {
        await eventosDelPartido.guardar({ tipo: 'gol', segundo: c.segundo, equipo: 'propio', jugador_id: datos.jugadorId || null })
        cola.agregar({
          id: crypto.randomUUID(),
          partido_id: partidoId,
          jugador_id: datos.jugadorId || null,
          segundo: c.segundo,
          periodo: c.periodo,
          ...c.referencia,
          tipo: 'Gol',
          zona: datos.punto?.zona ?? null,
          resultado: resultadoImplicito('Gol', catalogo),
          observaciones: null,
          coordenada_x: datos.punto?.x ?? null,
          coordenada_y: datos.punto?.y ?? null,
        })
        avisarRapido(`⚽ Gol · ${cuando}`, detalle)
      }
      setError('')
      cerrarMarcador(c.reanudar)
    } catch (e) {
      setError(mensajeErrorOPropio(e, c.tipo === 'cambio' ? 'guardar el cambio' : c.tipo === 'tarjeta' ? 'guardar la tarjeta' : 'guardar el gol'))
    } finally {
      setGuardandoMarcador(false)
    }
  }

  // Acción «Gol» de una jugadora, sin ubicación (la usa la importación de COMET): queda pendiente en la Playlist para
  // marcar desde dónde fue. Lanza un error si falta la dirección de ataque del partido.
  function crearAccionGol({ segundo: segundoGol, jugador_id: jugadoraGol }) {
    if (!partidoActual) throw new Error('No hay un partido abierto.')
    const periodoGol = periodoPorMarcas(segundoGol, marcasPartido) ?? 1
    cola.agregar({
      id: crypto.randomUUID(),
      partido_id: partidoActual.id,
      jugador_id: jugadoraGol || null,
      segundo: segundoGol,
      periodo: periodoGol,
      ...referenciaNueva(partidoActual, periodoGol),
      tipo: 'Gol',
      zona: null,
      resultado: resultadoImplicito('Gol', catalogo),
      observaciones: null,
      coordenada_x: null,
      coordenada_y: null,
    })
  }

  // «Marcar el inicio acá» desde el marcador del video.
  async function marcarDesdeMarcador(tipoMarca) {
    const s = tomarSegundoVideo()
    if (s == null) return
    try {
      await eventosDelPartido.guardar({ tipo: tipoMarca, segundo: s })
      const nombre = MARCAS.find((m) => m.tipo === tipoMarca)?.nombre || 'Marca'
      avisarRapido(`${nombre} marcado`, formatearTiempo(s))
      setError('')
    } catch (e) {
      setError(mensajeErrorOPropio(e, 'guardar la marca'))
    }
  }

  // Quiénes estaban en cancha en el segundo del cartel (null si no hay titulares cargadas).
  const enCanchaCartel = useMemo(
    () => (cartelMarcador && titularesIds.length ? enCanchaEn(cartelMarcador.segundo, titularesIds, eventosDelPartido.cambios) : null),
    [cartelMarcador, titularesIds, eventosDelPartido.cambios],
  )

  async function guardarMinutosPlanilla(lista) {
    try {
      const guardadas = await planillaMinutos.guardar(lista)
      setError('')
      setMensaje(`Minutos guardados en la planilla del partido (${guardadas} jugadora${guardadas === 1 ? '' : 's'}).`)
      avisarRapido('Minutos guardados en la planilla')
    } catch (e) {
      setError(mensajeErrorOPropio(e, 'guardar los minutos en la planilla'))
    }
  }

  // Segundo actual del video para las marcas (o null si el video no está listo).
  function tomarSegundoVideo() {
    try { return tiempoCaptura() } catch (e) { setError(mensajeErrorOPropio(e, 'tomar el tiempo del video')); return null }
  }

  const jugadorasVisibles = useMemo(() => {
    const busqueda = busquedaJugadora.trim().toLowerCase()

    if (!busqueda) return citaciones

    return citaciones.filter((c) => {
      const nombre = nombreJugadora(c.jugadora).toLowerCase()
      const dorsal = String(c.dorsal ?? '').toLowerCase()

      return nombre.includes(busqueda) || dorsal.includes(busqueda)
    })
  }, [citaciones, busquedaJugadora])

  async function cambiarDireccionAtaque(direccionElegida, periodoElegido = periodoActual) {
    if (!esAdmin || !escrituraAutorizada || !partidoActual || guardando) return
    const direccion = direccionElegida === 'izquierda' ? 'izquierda' : 'derecha'
    const nuevaDireccionPrimerTiempo = periodoElegido === 1 ? direccion : direccionOpuesta(direccion)
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const { data, error: updateError } = await supabase
        .from('analisis_partidos')
        .update({ direccion_primer_tiempo: nuevaDireccionPrimerTiempo })
        .eq('id', partidoActual.id)
        .select()
        .single()
      if (updateError) throw updateError
      setPartidos((actuales) => actuales.map((p) => p.id === data.id ? { ...p, ...data } : p))
      setMensaje(`Dirección del ataque actualizada. ${periodoElegido === 1 ? 'El segundo tiempo queda en el sentido contrario.' : 'El primer tiempo queda en el sentido contrario.'}`)
    } catch (e) {
      console.error('No se pudo guardar la dirección del ataque:', e)
      setError(mensajeErrorOPropio(e, 'guardar la dirección del ataque'))
    } finally {
      setGuardando(false)
    }
  }

  function abrirEventoEnVideo(evento) {
    const partido = partidos.find((p) => p.id === evento.partido_id)
    const partidoCalendario = partido?.partido_calendario || partidosCalendario.find((p) => p.id === partido?.partido_calendario_id)
    const urlVideo = partido?.video_url || videoCalendario(partidoCalendario)

    // Invalidar el estado del reproductor anterior antes de cambiar de partido/sección.
    // El salto queda pendiente hasta que YouTube confirme que el reproductor del partido correcto está listo.
    setVideoListo(false)
    setVideoListoPartidoId(null)
    setPartidoId(evento.partido_id)
    setPeriodoActual(Number(evento.periodo) === 2 ? 2 : 1)
    setSeccion('video')
    setError('')

    if (!youtubeEmbed(urlVideo)) {
      setSegundoPendiente(null)
      setError('Este partido no tiene un video válido asociado. Podés revisar la etiqueta, pero no saltar al video hasta agregarlo.')
      return
    }

    setSegundoPendiente({
      partidoId: evento.partido_id,
      segundo: Math.max(0, Number(evento.segundo) || 0),
    })
  }

  function irAlSegundo(valor) { solicitarVideo('salto', Number(valor)) }
  function tomarTiempoActual() {
    try { const tiempo = tiempoActivo(); setSegundo(String(tiempo)); setSegundoIr(String(tiempo)); setError('') }
    catch (e) { setError(mensajeErrorOPropio(e, 'mover el video')) }
  }
  function alternarReproduccion() { solicitarVideo('alternar') }
  function desplazarVideo(delta) {
    try { solicitarVideo('salto', Math.max(0, tiempoCaptura() + delta)) } catch (e) { setError(mensajeErrorOPropio(e, 'mover el video')) }
  }
  function reconectarVideo() {
    try { playerRef.current?.pauseVideo?.() } catch { /* Ventana cerrada. */ }
    comandoRef.current = null; setComandoPendiente(false); setVideoListo(false); setVideoListoPartidoId(null)
    setRevisionReproductor(n => n + 1)
  }

  // Registra la acción al instante: toma el segundo del video en el toque, la muestra enseguida y la deja en la cola
  // de guardado (se guarda de fondo, en orden, y se reintenta si falla). Nunca espera a la base ni bloquea botones.
  function registrarAccionRapida(tipoSeleccionado, idJugadora) {
    if (!esAdmin || !escrituraAutorizada || !partidoActual) return null

    if (!ventanas.gestor.conectado() || contextoAnalisisRef.current?.partidoId !== partidoId || contextoAnalisisRef.current?.seccion !== 'video' || !videoListo || !playerRef.current) {
      setError('Esperá a que el video esté conectado antes de etiquetar.')
      return null
    }

    let tiempo
    try {
      tiempo = tiempoCaptura()
    } catch (e) {
      setError(mensajeErrorOPropio(e, 'registrar la acción'))
      return null
    }

    // Con las marcas, el tiempo del partido sale del segundo del video; si no, del 1T / 2T elegido.
    const periodoCaptura = periodoPorMarcas(tiempo, marcasPartido) ?? periodoActual
    const referenciaCaptura = referenciaNueva(partidoActual, periodoCaptura)
    const registro = {
      id: crypto.randomUUID(),
      partido_id: partidoId,
      jugador_id: idJugadora,
      segundo: tiempo,
      periodo: periodoCaptura,
      ...referenciaCaptura,
      tipo: tipoSeleccionado,
      zona: null,
      resultado: resultadoImplicito(tipoSeleccionado, catalogo),
      observaciones: null,
    }
    cola.agregar(registro)
    setUltimaAccion({ id: registro.id, partidoId })
    const minuto = minutoReal(tiempo, marcasPartido)
    avisarRapido(idJugadora && fueraDeCancha(idJugadora, tiempo)
      ? `Ojo: ${nombreJugadora(jugadoras.find((j) => j.id === idJugadora))} no estaba en cancha en ese momento`
      : `${etiquetaBotonDe(catalogo, tipoSeleccionado)} · ${minuto?.estado === 'juego' ? minuto.texto : formatearTiempo(tiempo)}`,
    minuto?.estado === 'juego' ? formatearTiempo(tiempo) : '')
    setError('')

    // Conservamos la acción elegida para etiquetar varias jugadoras seguidas.
    setMensaje(idJugadora
      ? `${etiquetaTipo(tipoSeleccionado)} registrada para ${nombreJugadora(
        jugadoras.find((j) => j.id === idJugadora),
      )}.${resultadoImplicito(tipoSeleccionado, catalogo) ? '' : ' Resultado pendiente.'}`
      : `${etiquetaTipo(tipoSeleccionado)} registrada sin jugadora (${formatearTiempo(tiempo)}). Completala en la revisión.`,
    )
    return registro
  }

  // Momento colectivo cerrado (etapa 1): se guarda con inicio y fin, sin jugadora, por la misma cola que las demás
  // acciones (al instante, de fondo y con reintento).
  function registrarMomento({ tipo, segundo, segundo_fin, partidoId: idPartido }) {
    if (!esAdmin || !escrituraAutorizada || !idPartido) return null
    const periodo = (idPartido === partidoId ? periodoPorMarcas(segundo, marcasPartido) : null) ?? periodoActual
    const registro = {
      id: crypto.randomUUID(),
      partido_id: idPartido,
      jugador_id: null,
      segundo,
      segundo_fin,
      periodo,
      tipo,
      zona: null,
      resultado: null,
      observaciones: null,
    }
    cola.agregar(registro)
    setUltimaAccion({ id: registro.id, partidoId: idPartido })
    avisarRapido(`${etiquetaBotonDe(catalogo, tipo)} · grabando`, formatearTiempo(segundo))
    setError('')
    return registro
  }

  // Cierre de un momento: corrige el fin provisorio (se ve al instante; se guarda por la cola, con reintento).
  function actualizarFinMomento(id, segundo_fin) {
    if (!esAdmin || !escrituraAutorizada) return
    setEventos((lista) => lista.map((e) => (e.id === id ? { ...e, segundo_fin } : e)))
    cola.actualizar(id, { segundo_fin })
    const momento = todasLasAcciones.find((e) => e.id === id) || colaItems.find((i) => i.id === id)?.registro
    if (momento) avisarRapido(`${etiquetaBotonDe(catalogo, momento.tipo)} · ${segundo_fin - momento.segundo} s`, `${formatearTiempo(momento.segundo)} a ${formatearTiempo(segundo_fin)}`)
  }

  // Mueve el inicio y el fin de un momento (línea de tiempo). Se ve al instante; si la base no lo acepta, vuelve atrás.
  async function ajustarMomento(momento, { segundo, segundo_fin }) {
    if (!esAdmin || !escrituraAutorizada || momento._cola) return
    const antes = { segundo: momento.segundo, segundo_fin: momento.segundo_fin, periodo: momento.periodo }
    const periodo = periodoPorMarcas(segundo, marcasPartido) ?? momento.periodo
    setEventos((lista) => lista.map((e) => (e.id === momento.id ? { ...e, segundo, segundo_fin, periodo } : e)))
    const { error: errorAjuste } = await supabase.from('analisis_eventos').update({ segundo, segundo_fin, periodo }).eq('id', momento.id).select('id').single()
    if (errorAjuste) {
      setEventos((lista) => lista.map((e) => (e.id === momento.id ? { ...e, ...antes } : e)))
      setError(mensajeErrorOPropio(errorAjuste, 'ajustar el momento'))
    }
  }

  // Botón de la botonera colectiva (clic o tecla): abre el momento; la misma tecla o Enter lo cierra.
  function tocarColectiva(nombre) {
    setIluminado((anterior) => ({ tipo: nombre, n: (anterior?.n || 0) + 1 }))
    grabacionColectiva.tocar(nombre)
  }

  // Botón de la botonera (clic o tecla): en «un toque» registra; si no, elige la acción y espera a la jugadora.
  function tocarAccion(nombre) {
    setIluminado((anterior) => ({ tipo: nombre, n: (anterior?.n || 0) + 1 }))
    if (unToque) {
      if (!capturaBloqueada) registrarAccionRapida(nombre, null)
      else setError('Esperá a que el video esté conectado antes de etiquetar.')
      return
    }
    setTipoRapido((actual) => (actual === nombre ? '' : nombre))
    setTipo(nombre)
    setResultado((actual) => resultadoAlCambiarSegunCatalogo(catalogo, nombre, actual))
    setError('')
    setMensaje('')
  }

  function abrirEdicionEvento(evento) {
    if (!esAdmin || !escrituraAutorizada) return

    setEditandoEventoId(evento.id)
    setEdicionEvento({
      tipo: evento.tipo || catalogo.tipos[0]?.codigo || '',
      jugador_id: evento.jugador_id || '',
      segundo: String(evento.segundo ?? 0),
      periodo: Number(evento.periodo) === 2 ? 2 : 1,
      sistema_coordenadas: evento.sistema_coordenadas,
      direccion_captura: evento.direccion_captura,
      periodo_captura: evento.periodo_captura,
      zona: evento.zona || '',
      resultado: evento.resultado || '',
      observaciones: evento.observaciones || '',
      coordenada_x: evento.coordenada_x ?? null,
      coordenada_y: evento.coordenada_y ?? null,
    })

    setMostrarEdicionEvento(true)
    setError('')
    setMensaje('')
  }

  async function guardarEdicionEvento(e) {
    e.preventDefault()

    if (!esAdmin || !escrituraAutorizada || !editandoEventoId || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      validarResultadoAccion(edicionEvento.tipo, edicionEvento.resultado)
      const tiempo = Number(edicionEvento.segundo)

      if (!Number.isInteger(tiempo) || tiempo < 0) {
        throw new Error('El tiempo debe ser un número entero de segundos.')
      }

      const { data, error: updateError } = await supabase
        .from('analisis_eventos')
        .update({
          tipo: edicionEvento.tipo,
          jugador_id: edicionEvento.jugador_id || null,
          segundo: tiempo,
          periodo: Number(edicionEvento.periodo) === 2 ? 2 : 1,
          zona: zonaEfectivaEvento(edicionEvento, partidoActual),
          resultado: resultadoParaGuardar(edicionEvento.tipo, edicionEvento.resultado, catalogo),
          observaciones: edicionEvento.observaciones.trim() || null,
          coordenada_x: edicionEvento.coordenada_x,
          coordenada_y: edicionEvento.coordenada_y,
        })
        .eq('id', editandoEventoId)
        .select()
        .single()

      if (updateError) throw updateError

      setEventos((actuales) =>
        actuales.map((ev) => ev.id === data.id ? data : ev).sort(
          (a, b) => Number(a.segundo) - Number(b.segundo),
        ),
      )

      setMostrarEdicionEvento(false)
      setEditandoEventoId(null)
      setMensaje('Acción actualizada correctamente.')
    } catch (e) {
      console.error('Error al editar acción:', e)
      setError(mensajeErrorOPropio(e, 'actualizar la acción'))
    } finally {
      setGuardando(false)
    }
  }

  // Playlist: guarda uno o más campos de la acción (jugadora, zona, resultado) y devuelve la fila guardada.
  async function guardarCamposPlaylist(evento, cambios) {
    if (!esAdmin || !escrituraAutorizada) throw { code: '42501', message: 'No tenés autorización para editar acciones.' }
    const datos = { ...cambios }
    if (Object.hasOwn(datos, 'resultado')) {
      validarResultadoAccion(evento.tipo, datos.resultado)
      datos.resultado = resultadoParaGuardar(evento.tipo, datos.resultado, catalogo)
    }
    const { data, error: updateError } = await supabase.from('analisis_eventos').update(datos).eq('id', evento.id).select().single()
    if (updateError) throw updateError
    setEventos((actuales) => actuales.map((ev) => ev.id === data.id ? data : ev))
    setError('')
    if (cambios.jugador_id && fueraDeCancha(cambios.jugador_id, data.segundo)) {
      avisarRapido(`Ojo: ${nombreJugadora(jugadoras.find((j) => j.id === cambios.jugador_id))} no estaba en cancha en ese momento`)
    }
    return data
  }

  // Playlist: guarda la receptora de un pase (con la revisión leída, para no pisar cambios de otra persona).
  async function guardarReceptoraPlaylist(evento, estado, destinatariaId) {
    const anterior = resumenDestinatarias.detalles[evento.id]
    const fila = await guardarDestinataria(supabase, evento, anterior, estado, destinatariaId)
    const detalle = { ...anterior, ...fila }
    setResumenDestinatarias((a) => ({ ...a, detalles: { ...a.detalles, [fila.evento_id]: { ...a.detalles[fila.evento_id], ...fila } } }))
    setError('')
    return detalle
  }

  async function eliminarEvento(evento) {
    if (!esAdmin || !escrituraAutorizada) return

    if (!window.confirm(`¿Eliminar la acción «${etiquetaTipo(evento.tipo)}» del minuto ${formatearTiempo(evento.segundo)}? No se puede deshacer.`)) return
    grabacionColectiva.olvidar(evento.id)

    const { error: deleteError } = await supabase
      .from('analisis_eventos')
      .delete()
      .eq('id', evento.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setEventos((actuales) => actuales.filter((e) => e.id !== evento.id))
    setMensaje('Acción eliminada.')
  }

  // Sin confirmación: solo la última acción marcada en este dispositivo y sesión.
  async function deshacerUltimaAccion() {
    if (!esAdmin || !escrituraAutorizada || !accionDeshacible) return
    const evento = accionDeshacible
    // Si era un momento colectivo todavía abierto, deja de grabarse.
    grabacionColectiva.olvidar(evento.id)

    // Todavía en la cola (guardándose o sin guardar): la cola la quita o la borra apenas se confirme.
    if (evento._cola && cola.cancelar(evento.id)) {
      setUltimaAccion(null)
      setError('')
      setMensaje(`Se deshizo ${etiquetaTipo(evento.tipo)} · ${formatearTiempo(evento.segundo)}.`)
      return
    }
    if (guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const { error: deleteError } = await supabase
        .from('analisis_eventos')
        .delete()
        .eq('id', evento.id)

      if (deleteError) throw deleteError

      setEventos((actuales) => actuales.filter((e) => e.id !== evento.id))
      setUltimaAccion(null)
      setMensaje(`Se deshizo ${etiquetaTipo(evento.tipo)} · ${formatearTiempo(evento.segundo)}.`)
    } catch (e) {
      console.error('Error al deshacer acción:', e)
      setError(mensajeErrorOPropio(e, 'deshacer la acción'))
    } finally {
      setGuardando(false)
    }
  }

  function cambiarUnToque() {
    setUnToque(!unToque)
    guardarUnToque(!unToque)
    setTipoRapido('')
    setError('')
    setMensaje('')
  }

  function limpiarFormulario() {
    setVideoUrl('')
    setNotas('')
    setPartidoCalendarioId('')
    setEditandoId(null)
    setEquipoAnalizadoPropio('propio')
  }

  function abrirNuevoAnalisis() {
    limpiarFormulario()
    setTipoNuevoAnalisis('propio')
    setMostrarFormulario(true)
    setError('')
    setMensaje('')
  }

  function seleccionarPartidoCalendario(id) {
    setPartidoCalendarioId(id)

    const seleccionado = partidosCalendario.find((p) => p.id === id)

    if (!seleccionado) {
      setVideoUrl('')
      setNotas('')
      return
    }

    const analisisExistente = partidos.find(
      (p) => p.partido_calendario_id === id,
    )

    setVideoUrl(
      analisisExistente?.video_url || videoCalendario(seleccionado),
    )
    setNotas(analisisExistente?.notas || '')
  }

  function editarPartido(partido) {
    if (!esAdmin || !escrituraAutorizada) return

    setEditandoId(partido.id)
    setTipoNuevoAnalisis(esScouting(partido) ? 'scouting' : 'propio')
    setEquipoAnalizadoPropio(partido.equipo_analizado === 'rival' ? 'rival' : 'propio')
    setPartidoCalendarioId(
      partido.partido_calendario_id ||
      partido.partido_calendario?.id ||
      '',
    )
    setVideoUrl(partido.video_url || '')
    setNotas(partido.notas || '')
    setMostrarFormulario(true)
    setError('')
    setMensaje('')
  }

  async function guardarPartido(e) {
    e.preventDefault()

    if (!esAdmin || !escrituraAutorizada || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const encuentro = partidosCalendario.find(
        (p) => p.id === partidoCalendarioId,
      )

      if (!encuentro) {
        throw new Error('Seleccioná un partido del calendario.')
      }

      if (videoUrl.trim() && !youtubeEmbed(videoUrl.trim())) {
        throw new Error('Ingresá un enlace válido de YouTube.')
      }

      const duplicado = partidos.find(
        (p) =>
          p.partido_calendario_id === encuentro.id &&
          p.id !== editandoId,
      )

      if (duplicado) {
        throw new Error(
          'Este partido ya tiene un análisis. Seleccionalo en la biblioteca para editarlo.',
        )
      }

      const registro = {
        categoria_id: encuentro.categoria_id || CATEGORIA_ID,
        rival: encuentro.rival,
        fecha: encuentro.fecha || null,
        partido_calendario_id: encuentro.id,
        video_url: videoUrl.trim() || null,
        notas: notas.trim() || null,
        creado_por: usuario?.email || null,
        // Solo se manda si cambia o si la base ya tiene la columna (antes de correr el SQL de la etapa 1, no existe).
        ...(equipoAnalizadoPropio === 'rival' || partidos.some((p) => 'equipo_analizado' in p)
          ? { equipo_analizado: equipoAnalizadoPropio }
          : {}),
      }

      let respuesta

      if (editandoId) {
        respuesta = await supabase
          .from('analisis_partidos')
          .update(registro)
          .eq('id', editandoId)
          .select()
          .single()
      } else {
        respuesta = await supabase
          .from('analisis_partidos')
          .insert(registro)
          .select()
          .single()
      }

      if (respuesta.error) throw respuesta.error

      const idGuardado = respuesta.data.id
      const estabaEditando = Boolean(editandoId)

      limpiarFormulario()
      setMostrarFormulario(false)

      await cargarDatos()

      setPartidoId(idGuardado)
      setSeccion('video')
      setMensaje(
        estabaEditando
          ? 'Análisis actualizado.'
          : 'Análisis creado y vinculado al calendario.',
      )
    } catch (e) {
      console.error('Error al guardar análisis:', e)
      setError(mensajeErrorOPropio(e, 'guardar el análisis'))
    } finally {
      setGuardando(false)
    }
  }

  // Partido de scouting (el rival contra otro club): sin calendario, convocatoria ni minutos.
  async function guardarScouting(registro) {
    if (!esAdmin || !escrituraAutorizada || guardando) return
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const fila = { ...registro, creado_por: usuario?.email || null }
      const respuesta = editandoId
        ? await supabase.from('analisis_partidos').update(fila).eq('id', editandoId).select().single()
        : await supabase.from('analisis_partidos').insert(fila).select().single()
      if (respuesta.error) throw respuesta.error
      const estabaEditando = Boolean(editandoId)
      limpiarFormulario()
      setMostrarFormulario(false)
      await cargarDatos()
      setPartidoId(respuesta.data.id)
      setSeccion('video')
      setMensaje(estabaEditando ? 'Partido de scouting actualizado.' : 'Partido de scouting creado. Marcá los momentos con la botonera colectiva.')
    } catch (e) {
      console.error('Error al guardar el scouting:', e)
      setError(mensajeErrorOPropio(e, 'guardar el partido de scouting'))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarPartido(partido) {
    if (!esAdmin || !escrituraAutorizada) return

    const confirmar = window.confirm(
      `¿Querés eliminar el análisis de ${partido.rival}? También se eliminarán sus eventos.`,
    )

    if (!confirmar) return

    setError('')
    setMensaje('')

    const { error: deleteError } = await supabase
      .from('analisis_partidos')
      .delete()
      .eq('id', partido.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMensaje('Análisis eliminado. El partido del calendario se conserva.')
    await cargarDatos()
  }

  async function guardarEvento(e) {
    e.preventDefault()

    if (!esAdmin || !escrituraAutorizada || !partidoActual || guardando || registroIncierto) return
    if (!ventanas.gestor.conectado() || contextoAnalisisRef.current?.partidoId !== partidoId || contextoAnalisisRef.current?.seccion !== 'video') {
      setError('La sesión de video no está conectada al partido actual. No se registró la acción.'); return
    }
    if (!bloqueoEtiquetado.entrar()) return
    let enviado = false

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      validarResultadoAccion(tipo, resultado)
      const tiempo = tiempoAutomatico
        ? tiempoActivo()
        : Number(segundo)

      if (!Number.isInteger(tiempo) || tiempo < 0) {
        throw new Error('El tiempo debe ser un número entero de segundos.')
      }

      if (jugadorId && !jugadoras.some((j) => j.id === jugadorId)) {
        throw new Error('La jugadora seleccionada no está disponible.')
      }

      const idRegistro = crypto.randomUUID()
      const referenciaCaptura = referenciaNueva(partidoActual, periodoActual)
      enviado = true
      const { data, error: insertError } = await supabase
        .from('analisis_eventos')
        .insert({
          id: idRegistro,
          partido_id: partidoId,
          jugador_id: jugadorId || null,
          segundo: tiempo,
          periodo: periodoActual,
          ...referenciaCaptura,
          tipo,
          zona: coordenadasAccion ? zonaTactica(coordenadasAccion.x, coordenadasAccion.y, direccionAtaqueActual) : zona || null,
          resultado: resultadoParaGuardar(tipo, resultado, catalogo),
          observaciones: observaciones.trim() || null,
          coordenada_x: coordenadasAccion?.x ?? null,
          coordenada_y: coordenadasAccion?.y ?? null,
        })
        .select()
        .single()

      if (insertError) throw insertError
      if (data?.id !== idRegistro) throw Error('No se pudo confirmar el registro de la acción.')

      setEventos((actuales) =>
        [...actuales, data].sort(
          (a, b) => Number(a.segundo) - Number(b.segundo),
        ),
      )

      setUltimaAccion({ id: data.id, partidoId })
      setSegundo(String(tiempo))
      setMensaje('Acción registrada correctamente.')
      setObservaciones('')
      setCoordenadasAccion(null)
    } catch (e) {
      if (enviado && registroInciertoTrasError(e)) setRegistroIncierto(true)
      console.error('Error al registrar acción:', e)
      setError(enviado && registroInciertoTrasError(e) ? 'No se pudo confirmar el guardado. Revisá las acciones y recargá Análisis antes de intentar nuevamente; no se reintentó el envío.' : mensajeErrorOPropio(e, 'registrar la acción'))
    } finally {
      bloqueoEtiquetado.salir()
      setGuardando(false)
    }
  }

  const controlesVideo = <ControlesVideoAnalisis listo={videoListo && ventanas.conectado} reproduciendo={videoReproduciendo}
    reloj={relojVideo} segundo={segundoIr} cambiarSegundo={setSegundoIr} reproducir={alternarReproduccion}
    tomarTiempo={tomarTiempoActual} saltar={irAlSegundo} desplazar={desplazarVideo}
    velocidad={velocidadVideo} velocidades={velocidadesVideo} cambiarVelocidad={v => solicitarVideo('velocidad', v)} pendiente={comandoPendiente} />
  const encabezadoVentana = <>
    <div className="flex flex-wrap items-center justify-between gap-3"><strong>Club Comunicaciones · {ventanas.modo === 'reproductor' ? 'Reproductor' : 'Botonera'}</strong>
      <Boton secundario onClick={() => ventanas.gestor.acoplar()}>Acoplar ventana</Boton></div>
    <p>{partidoActual?.rival} · {partidoActual ? datosEncuentro(partidoActual) : ''} · {periodoActual === 1 ? 'Primer' : 'Segundo'} tiempo</p>
    <p className="text-xs">Sesión única: mantené abierta la ventana principal. Las acciones se guardan desde ella.</p>
    {error && <p role="alert" style={{ color: textoAnalisis('#F87171') }}>{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    {ventanas.modo === 'botonera' && controlesVideo}
  </>
  const barraVentanas = <>
    <div className="flex flex-wrap gap-2">
      <Boton secundario disabled={guardando || !videoActual} onClick={() => ventanas.gestor.separar('reproductor')}>Separar reproductor</Boton>
      <Boton secundario disabled={guardando} onClick={() => ventanas.gestor.separar('botonera')}>Separar botonera</Boton>
      {ventanas.reintento && <Boton disabled={guardando} onClick={() => ventanas.gestor.separar(ventanas.reintento)}>Reintentar separación</Boton>}
      {ventanas.modo && <Boton secundario onClick={() => ventanas.gestor.acoplar()}>Volver a integrar</Boton>}
      {videoActual && <Boton secundario disabled={guardando} onClick={reconectarVideo}>Reconectar video</Boton>}
    </div>
    <p role="status" className="mt-2 text-xs" style={{ color: A.secundario }}>{ventanas.aviso || (ventanas.modo ? ventanas.conectado ? 'Ventana conectada a esta sesión de Análisis.' : 'Sin conexión: no registres acciones hasta recuperar la sesión.' : 'Una sola sesión. Podés separar el reproductor o la botonera y mover la ventana al segundo monitor.')}</p>
    {registroIncierto && <p role="alert" className="mt-2 text-sm">El último guardado no pudo confirmarse. Revisá el explorador y recargá Análisis antes de registrar otra acción.</p>}
    {ventanas.modo === 'reproductor' && controlesVideo}
  </>

  // Atajos de teclado: solo en la vista de video, para quien puede etiquetar. Incluye la ventana separada.
  const ventanaAuxiliar = ventanas.modo && ventanas.nodo ? ventanas.nodo.ownerDocument?.defaultView || null : null
  // Momento colectivo abierto: se cierra con la misma tecla, con Enter o solo (duración por defecto).
  const grabacionColectiva = useGrabacionColectiva({
    reloj: relojVideo,
    catalogo,
    partidoId,
    activa: !modoConsulta,
    // Se guarda apenas se abre (fin provisorio) y se corrige el fin al cerrarlo.
    registrar: (momento) => {
      if (capturaBloqueada) { setError('Esperá a que el video esté conectado antes de etiquetar.'); return null }
      return registrarMomento(momento)?.id || null
    },
    actualizarFin: actualizarFinMomento,
  })
  const estadoAtajos = useAtajosAnalisis({
    activo: !cargando && accesoEditor && !bloqueoEscritura && seccion === 'video' && Boolean(partidoActual),
    mapa: botoneraEnUso === 'colectiva' ? atajosBotoneraColectiva : atajosBotonera,
    principal: typeof window === 'undefined' ? null : window,
    auxiliar: ventanaAuxiliar,
    // Con el cartel de gol / tarjeta / cambio abierto, las teclas no marcan otras acciones.
    pausar: eligiendoTecla || Boolean(cartelMarcador),
    acciones: {
      marcar: botoneraEnUso === 'colectiva' ? tocarColectiva : tocarAccion,
      // En scouting no hay marcador (no juega Comunicaciones).
      marcador: scouting ? undefined : abrirMarcador,
      alternar: alternarReproduccion,
      saltar: desplazarVideo,
      deshacer: deshacerUltimaAccion,
      ayuda: () => setAyudaAtajos((abierta) => !abierta),
      interceptar: (evento) => {
        if (botoneraEnUso === 'colectiva' && grabacionColectiva.abiertas.length && evento.key === 'Enter') {
          grabacionColectiva.cerrar()
          return true
        }
        return playlist.interceptar?.(evento) || false
      },
    },
  })

  if (!cargando && !accesoEditor) return <div className="p-6" role="alert">{error || 'No se pudo confirmar el acceso a Análisis.'}<button type="button" onClick={cargarDatos}>Reintentar verificación</button></div>
  if (cargando) {
    return (
      <div className="p-6 text-sm" style={{ color: A.secundario }}>
        Cargando módulo de Análisis...
      </div>
    )
  }

  return (
    <div
      className="min-h-screen space-y-5 p-4 md:p-6"
      style={{ color: A.texto }}
    >
      <AvisoAccion aviso={avisoAccion} />
      {modoConsulta && <p role="status" className="text-sm" style={{ color: A.secundario }}>Modo consulta: podés ver el video, la Playlist, el mapa, las estadísticas y el informe. Etiquetar y editar acciones es solo de coordinación.</p>}
      {bloqueoEscritura && !modoConsulta && <p role="status">{(estadoAutorizacion || estadoPermiso) === 'pendiente_migracion'
        ? 'Análisis en modo consulta: falta activar la función de autorización de la migración pendiente. Crear, guardar, editar y eliminar están bloqueados hasta que el servidor confirme los permisos.'
        : 'Escrituras pausadas: no se pudo confirmar la autorización del servidor o se está revalidando. Se conserva el trabajo abierto y podés consultar el video.'}</p>}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <EncabezadoSeccion eyebrow="Performance" eyebrowResaltado={!bloqueoEscritura ? 'Gestión habilitada' : 'Solo lectura'}
            titulo="Análi" resaltado="sis" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Boton secundario onClick={cargarDatos}>
            ↻ Actualizar
          </Boton>

          {accesoEditor && !modoConsulta && (
            <Boton
              onClick={() => {
                if (mostrarFormulario) {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                } else {
                  abrirNuevoAnalisis()
                }
              }}
            >
              {mostrarFormulario ? 'Cancelar' : '+ Nuevo análisis'}
            </Boton>
          )}
        </div>
      </header>

      {catalogoAcciones.aviso && (
        <p role="status" className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: A.borde, color: A.secundario }}>
          {catalogoAcciones.aviso}
        </p>
      )}

      {error && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            backgroundColor: A.errorFondo,
            borderColor: A.errorBorde,
            color: A.errorTexto,
          }}
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            backgroundColor: A.exitoFondo,
            borderColor: A.exitoBorde,
            color: A.exitoTexto,
          }}
        >
          {mensaje}
        </div>
      )}

      {mostrarFormulario && accesoEditor && !modoConsulta && (
        <Panel>
          <h2 className="mb-2 text-lg font-bold">
            {editandoId ? 'Editar análisis' : tipoNuevoAnalisis === 'scouting' ? 'Nuevo partido de scouting' : 'Vincular análisis a un partido'}
          </h2>

          {!editandoId && (
            <div className="az-segmento col-selector" role="group" aria-label="Tipo de análisis">
              <button type="button" aria-pressed={tipoNuevoAnalisis === 'propio'} onClick={() => setTipoNuevoAnalisis('propio')}>Partido propio</button>
              <button type="button" aria-pressed={tipoNuevoAnalisis === 'scouting'} onClick={() => setTipoNuevoAnalisis('scouting')}>Scouting (rival contra otro club)</button>
            </div>
          )}

          {tipoNuevoAnalisis === 'scouting' ? (
            <FormularioScouting
              key={editandoId || 'nuevo'}
              inicial={editandoId ? partidos.find((p) => p.id === editandoId) : null}
              categoriaPorDefecto={partidoActual?.categoria_id || CATEGORIA_ID}
              guardando={guardando || bloqueoEscritura}
              onGuardar={guardarScouting}
              onCancelar={() => { limpiarFormulario(); setMostrarFormulario(false) }}
              inputClass={inputClass}
              inputStyle={inputStyle}
            />
          ) : <>
          <p className="mb-4 text-sm" style={{ color: A.secundario }}>
            Seleccioná un encuentro existente del calendario. No se creará otro
            partido en el calendario.
          </p>

          <form onSubmit={guardarPartido} className="space-y-4">
            <Campo label="Partido del calendario">
              <select
                className={inputClass}
                style={inputStyle}
                value={partidoCalendarioId}
                onChange={(e) => seleccionarPartidoCalendario(e.target.value)}
                required
                disabled={Boolean(editandoId)}
              >
                <option value="">Seleccioná un partido...</option>

                {partidosDisponibles.map((p) => {
                  const yaExiste = partidos.find(
                    (a) =>
                      a.partido_calendario_id === p.id &&
                      a.id !== editandoId,
                  )

                  return (
                    <option key={p.id} value={p.id}>
                      {p.rival} — {fechaLegible(p.fecha)}
                      {p.local_visitante ? ` · ${p.local_visitante}` : ''}
                      {p.numero_fecha ? ` · ${p.numero_fecha}` : ''}
                      {yaExiste ? ' (ya tiene análisis)' : ''}
                    </option>
                  )
                })}
              </select>
            </Campo>

            <Campo label="Enlace de YouTube específico del análisis">
              <input
                className={inputClass}
                style={inputStyle}
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <span className="text-xs" style={{ color: A.secundario }}>
                Si lo dejás vacío, se utilizará el video disponible en el
                calendario.
              </span>
            </Campo>

            <fieldset>
              <legend className="mb-1 text-sm font-bold">Equipo analizado (la botonera colectiva marca desde este equipo)</legend>
              <div className="az-segmento" role="group">
                <button type="button" aria-pressed={equipoAnalizadoPropio === 'propio'} onClick={() => setEquipoAnalizadoPropio('propio')}>Comunicaciones</button>
                <button type="button" aria-pressed={equipoAnalizadoPropio === 'rival'} onClick={() => setEquipoAnalizadoPropio('rival')}>
                  {partidosCalendario.find((p) => p.id === partidoCalendarioId)?.rival || 'Rival'}
                </button>
              </div>
            </fieldset>

            <Campo label="Notas generales">
              <textarea
                className={inputClass}
                style={inputStyle}
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones generales del partido..."
              />
            </Campo>

            <div className="flex flex-wrap gap-2">
              <Boton submit disabled={bloqueoEscritura || guardando || !partidoCalendarioId}>
                {guardando ? 'Guardando...' : 'Guardar análisis'}
              </Boton>

              <Boton
                secundario
                onClick={() => {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                }}
              >
                Cancelar
              </Boton>
            </div>
          </form>
          </>}
        </Panel>
      )}

      <Panel
        className="overflow-hidden"
        style={{
          background:
            A.cabecera,
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black"
            style={{ backgroundColor: 'var(--ui-acento)', color: 'var(--ui-texto-sobre-acento)' }}
          >
            ▶
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Biblioteca de análisis</h2>
            <p className="mt-1 text-sm" style={{ color: A.secundario }}>
              {partidos.length} análisis · {partidosCalendario.length} partidos
              en el calendario
            </p>
          </div>

          {partidoActual && (

            <div className="text-right">
              <p className="text-xs" style={{ color: A.secundario }}>
                PARTIDO ACTIVO
              </p>
              <p className="font-bold">{partidoActual.rival}</p>
          </div>
          )}
        </div>

        {partidos.length > 0 && (
          <div className="bib-filtros">
            <div className="az-segmento" role="group" aria-label="Tipo de análisis">
              {[['todos', 'Todos'], ['propio', 'Propios'], ['scouting', 'Scouting']].map(([id, texto]) => (
                <button key={id} type="button" aria-pressed={filtroBiblioteca.tipo === id}
                  onClick={() => setFiltroBiblioteca((f) => ({ ...f, tipo: id }))}>{texto}</button>
              ))}
            </div>
            <input
              className={inputClass}
              style={inputStyle}
              type="search"
              aria-label="Buscar por rival"
              placeholder="Buscar por rival…"
              value={filtroBiblioteca.rival}
              onChange={(e) => setFiltroBiblioteca((f) => ({ ...f, rival: e.target.value }))}
            />
          </div>
        )}

        {partidos.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: A.secundario }}>
            Todavía no hay análisis guardados. Usá «Nuevo análisis» para elegir
            un partido del calendario.
          </p>
        ) : partidosFiltrados.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: A.secundario }}>Ningún análisis coincide con el filtro.</p>
        ) : (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {partidosFiltrados.map((partido) => {
              const encuentro =
                partido.partido_calendario ||
                partidosCalendario.find(
                  (p) => p.id === partido.partido_calendario_id,
                )

              const activo = partido.id === partidoId

              return (
                <button
                  key={partido.id}
                  type="button"
                  onClick={() => {
                    setPartidoId(partido.id)
                    setPeriodoActual(1)
                    setSeccion('video')
                    setTipoRapido('')
                    setError('')
                    setMensaje('')
                  }}
                  className="min-w-[190px] rounded-lg border p-3 text-left transition hover:border-yellow-400"
                  style={{
                    backgroundColor: activo ? A.activo : A.fondo,
                    borderColor: activo ? AMARILLO : A.borde,
                  }}
                >
                  <p className="font-bold">
                    {esScouting(partido)
                      ? `${partido.equipo_local} vs ${partido.equipo_visitante}`
                      : encuentro?.rival || partido.rival}
                    {esScouting(partido) && <span className="bib-chip">Scouting</span>}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: A.secundario }}>
                    {datosEncuentro({
                      ...partido,
                      partido_calendario: encuentro,
                    })}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: textoAnalisis(AMARILLO) }}>
                    {esScouting(partido)
                      ? `${momentos.filter((m) => m.partido_id === partido.id).length} momentos`
                      : `${eventos.filter((e) => e.partido_id === partido.id).length} acciones`}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {accesoEditor && !modoConsulta && partidoActual && (
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3" style={{ borderColor: A.borde }}>
            <button
              type="button"
              className="text-xs font-bold"
              style={{ color: textoAnalisis(AMARILLO) }}
              disabled={bloqueoEscritura} onClick={() => editarPartido(partidoActual)}
            >
              Editar datos del análisis
            </button>
            <button
              type="button"
              className="text-xs font-bold text-red-300"
              disabled={bloqueoEscritura} onClick={() => eliminarPartido(partidoActual)}
            >
              Eliminar análisis
            </button>
          </div>
        )}
      </Panel>

      {partidoActual && (
        <>
          <nav className="flex flex-wrap gap-2">
            {[
              ['video', '▶ Video y etiquetas'],
              ['explorador', '⌕ Explorador de acciones'],
              ['estadisticas', '▥ Estadísticas'],
              ['mapa', '▦ Mapa'],
              // El informe de partido es de Comunicaciones: en scouting no aplica.
              ...(scouting ? [] : [['informe', '▤ Informe']]),
            ].map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSeccion(id)}
                className="rounded-lg border px-4 py-2.5 text-sm font-bold"
                style={{
                  backgroundColor: seccion === id ? 'var(--ui-acento)' : A.panel,
                  color: seccion === id ? 'var(--ui-texto-sobre-acento)' : A.texto,
                  borderColor: seccion === id ? AMARILLO : A.borde,
                }}
              >
                {texto}
              </button>
            ))}
          </nav>

          {seccion === 'video' && (
            <div className="az-split" data-modo={ventanas.modo || 'integrado'}>
              <div className="analisis-ventanas az-split-barra">{barraVentanas}</div>

              {/* Video + panel en su propio bloque: el video queda fijo solo mientras se recorre el panel. */}
              <div className="az-split-arriba">
              <div className="az-split-video">
                <ZonaVentanaAnalisis tipo="reproductor" ventana={ventanas} encabezado={encabezadoVentana}>
                <div className="az-video-marco">
                  {videoActual ? (
                    <div className="mv-contenedor aspect-video overflow-hidden rounded-lg bg-black">
                      <MarcadorVideo reloj={relojVideo} marcas={marcasPartido} eventos={eventosDelPartido.eventos}
                        rival={partidoCalendarioActual?.rival || partidoActual.rival}
                        puedeMarcar={!scouting && accesoEditor && !bloqueoEscritura && videoListo && !eventosDelPartido.cargando && !eventosDelPartido.error}
                        onMarcar={marcarDesdeMarcador} />
                      <iframe
                        key={`${partidoActual.id}-${videoActual}-${destinoReproductor}-${revisionReproductor}`}
                        ref={iframeRef}
                        title={`Video del partido contra ${partidoActual.rival}`}
                        src={videoActual}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div
                      className="flex aspect-video flex-col items-center justify-center rounded-lg border p-5 text-center"
                      style={{ backgroundColor: A.fondo, borderColor: A.borde }}
                    >
                      <span className="text-4xl">▶</span>
                      <p className="mt-3 font-bold">No hay video disponible</p>
                      <p className="mt-1 text-sm" style={{ color: A.secundario }}>
                        {modoConsulta ? 'Coordinación todavía no cargó el enlace de YouTube.' : 'Agregá un enlace de YouTube desde los datos del análisis.'}
                      </p>
                      {accesoEditor && !modoConsulta && (
                        <div className="mt-4">
                          <Boton disabled={bloqueoEscritura} onClick={() => editarPartido(partidoActual)}>
                            Agregar video
                          </Boton>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="az-video-pie">
                  <p className="az-video-estado" data-listo={videoListo ? 'si' : 'no'}>{videoListo ? 'Video conectado' : 'Conectando video…'}</p>
                  {videoActual && <>
                    {controlesVideo}
                    {videoUrlActual && <a href={videoUrlActual} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-bold" style={{ color: textoAnalisis(AMARILLO) }}>Abrir video en YouTube</a>}
                    <LineaTiempo
                      reloj={relojVideo}
                      catalogo={catalogo}
                      momentos={momentosVista}
                      individuales={eventosPartido}
                      marcas={marcasPartido}
                      obtenerDuracionVideo={obtenerDuracionVideo}
                      editable={accesoEditor && !bloqueoEscritura && !modoConsulta}
                      vista={vistaMomentos}
                      onVista={(vista) => { setVistaMomentos(vista); setMomentoElegidoId(null) }}
                      equipos={equiposPartido}
                      seleccionadoId={momentoElegidoId}
                      etiquetaDe={etiquetaTipo}
                      onIr={irAlSegundo}
                      onReproducir={reproducirMomento}
                      onAjustar={ajustarMomento}
                    />
                  </>}
                </div>
                </ZonaVentanaAnalisis>
              </div>

              <section className="az-panel" aria-label="Herramientas del análisis">
                <div role="tablist" aria-label="Herramientas del análisis" className="az-pestanas" onKeyDown={moverPestana}>
                  {pestanasPanel.map(([id, texto]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      id={`az-pestana-${id}`}
                      aria-controls={`az-panel-${id}`}
                      aria-selected={pestanaPanel === id}
                      tabIndex={pestanaPanel === id ? 0 : -1}
                      className="az-pestana"
                      onClick={() => setPestanaPanel(id)}
                    >
                      {texto}
                      {id === 'playlist' && <span className="az-pestana-cuenta">{eventosPartido.length}</span>}
                    </button>
                  ))}
                </div>
                {!modoConsulta && <EstadoGuardado items={colaItems} />}
                <div className="px-4">
                  <ClipSeleccionado
                    momento={momentoElegido}
                    individuales={eventosPartido}
                    etiquetaDe={etiquetaTipo}
                    dorsalDe={(id) => citaciones.find((c) => c.jugador_id === id)?.dorsal ?? null}
                    minutoDe={(s) => { const m = minutoReal(s, marcasPartido); return m?.estado === 'juego' ? m.texto : '' }}
                    equipo={momentoElegido?.equipo === 'otro' ? equiposPartido.otro : equiposPartido.analizado}
                    puedeBorrar={accesoEditor && !bloqueoEscritura && !modoConsulta}
                    onReproducir={reproducirMomento}
                    onBorrar={async (m) => { await eliminarEvento(m); setMomentoElegidoId(null) }}
                    onCerrar={() => setMomentoElegidoId(null)}
                  />
                </div>

                <div role="tabpanel" id="az-panel-etiquetado" aria-labelledby="az-pestana-etiquetado" hidden={pestanaPanel !== 'etiquetado'} className="az-panel-cuerpo">
                  {ventanas.modo === 'botonera' && <p className="az-nota">La botonera está abierta en la otra ventana.</p>}
                  <ZonaVentanaAnalisis tipo="botonera" ventana={ventanas} encabezado={encabezadoVentana}>
                  <div>
                  <div className="mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="az-titulo">Etiquetado rápido</h2>
                      <div className="az-segmento" role="group" aria-label="Tiempo que estás etiquetando"
                        title={periodoAutomatico ? 'Automático: sale de las marcas del partido' : undefined}>
                        {[[1, '1T'], [2, '2T']].map(([valor, texto]) => (
                          <button key={valor} type="button" aria-pressed={periodoActual === valor} disabled={periodoAutomatico} onClick={() => setPeriodoActual(valor)}
                            title={valor === 1 ? 'Primer tiempo' : 'Segundo tiempo'}>
                            {texto}
                          </button>
                        ))}
                      </div>
                    </div>
                    {periodoAutomatico && <p className="az-nota-corta">El 1T / 2T se toma solo de las marcas del partido.</p>}
                    <p className="mt-2 text-sm" style={{ color: A.secundario }}>
                      {botoneraEnUso === 'colectiva'
                        ? `Momentos que duran, desde ${equiposPartido.analizado}. La tecla abre el momento y la misma tecla o Enter lo cierra.`
                        : unToque
                          ? 'Tocá una acción y se guarda al instante, sin jugadora. La completás después, en la revisión.'
                          : '1. Elegí una acción. 2. Elegí la jugadora. 3. Completá el resultado cuando revises el evento.'}
                    </p>
                  </div>

                  {!accesoEditor || modoConsulta ? (
                    <p className="text-sm" style={{ color: A.secundario }}>
                      Solo coordinación puede registrar acciones.
                    </p>
                  ) : (
                    <>
                      <div className="az-segmento col-selector" role="group" aria-label="Botonera">
                        <button type="button" aria-pressed={botoneraEnUso === 'colectiva'} onClick={() => elegirModoBotonera('colectiva')}>Colectiva</button>
                        <button type="button" aria-pressed={botoneraEnUso === 'individual'} disabled={scouting}
                          title={scouting ? 'En scouting, por ahora, solo la botonera colectiva' : undefined}
                          onClick={() => { grabacionColectiva.cerrarTodas(); elegirModoBotonera('individual') }}>Individual</button>
                      </div>
                      {botoneraEnUso === 'individual' && <button
                        type="button"
                        role="switch"
                        aria-checked={unToque}
                        onClick={cambiarUnToque}
                        className="mb-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-bold"
                        style={{
                          backgroundColor: unToque ? A.seleccion : A.fondo,
                          borderColor: unToque ? AMARILLO : A.borde,
                          color: A.texto,
                        }}
                      >
                        <span>Marcar sin jugadora (un toque)</span>
                        <span
                          className="rounded-md px-2 py-1 text-xs font-black"
                          style={unToque
                            ? { backgroundColor: 'var(--ui-acento)', color: 'var(--ui-texto-sobre-acento)' }
                            : { backgroundColor: A.control, color: A.secundario }}
                        >
                          {unToque ? 'Activado' : 'Apagado'}
                        </span>
                      </button>}

                      <IndicadorAtajos estado={estadoAtajos} onAyuda={() => setAyudaAtajos((abierta) => !abierta)} />

                      {botoneraEnUso === 'colectiva' ? (
                        <BotoneraColectiva
                          tipos={botoneraColectiva}
                          atajos={atajosBotoneraColectiva}
                          abiertas={grabacionColectiva.abiertas.filter((g) => g.partidoId === partidoId)}
                          reloj={relojVideo}
                          etiquetaDe={etiquetaTipo}
                          deshabilitado={capturaBloqueada && !grabacionColectiva.abiertas.length}
                          iluminado={iluminado}
                          onTocar={tocarColectiva}
                        />
                      ) : <>
                      <div className="az-botonera">
                        {botonera.map((accion) => {
                          const activa = tipoRapido === accion.nombre
                          const tecla = atajosBotonera[accion.nombre]

                          return (
                            <button
                              key={accion.nombre}
                              type="button"
                              data-tipo-rapido={accion.nombre}
                              title={tecla ? `${etiquetaTipo(accion.nombre)} (tecla ${mostrarTecla(tecla)})` : etiquetaTipo(accion.nombre)}
                              aria-keyshortcuts={tecla || undefined}
                              disabled={unToque && capturaBloqueada}
                              onClick={() => tocarAccion(accion.nombre)}
                              className={`az-boton-accion${iluminado?.tipo === accion.nombre ? ' et-iluminado' : ''}`}
                              data-activa={activa ? 'si' : undefined}
                              style={{ '--az-color-accion': accion.color }}
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="az-boton-icono" style={{ color: accion.colorTexto }}>
                                  {accion.icono}
                                </span>
                                {tecla && <kbd className="et-tecla" aria-hidden="true">{mostrarTecla(tecla)}</kbd>}
                              </span>
                              <span className="az-boton-texto">
                                {accion.corto}
                              </span>
                            </button>
                          )
                        })}
                        <BotonesGol onBoton={abrirMarcador} deshabilitado={capturaBloqueada || guardandoMarcador} activo={cartelMarcador?.tipo} />
                      </div>
                      <FilaTarjetaCambio onBoton={abrirMarcador} deshabilitado={capturaBloqueada || guardandoMarcador} activo={cartelMarcador?.tipo} />

                      {cartelMarcador && (
                        <CartelMarcador key={`${cartelMarcador.tipo}-${cartelMarcador.segundo}`} cartel={cartelMarcador} marcas={marcasPartido}
                          citaciones={citaciones} enCancha={enCanchaCartel} partido={partidoActual} periodo={cartelMarcador.periodo}
                          guardando={guardandoMarcador} onGuardar={guardarMarcador} onCancelar={() => cerrarMarcador(cartelMarcador.reanudar)} />
                      )}

                      {sinTeclaPorMarcador.length > 0 && (
                        <p className="et-alerta-cola" role="status">
                          <span>G, Y y X ahora son del marcador (gol, tarjeta y cambio): {sinTeclaPorMarcador.map((a) => `«${etiquetaTipo(a)}»`).join(', ')} {sinTeclaPorMarcador.length === 1 ? 'quedó' : 'quedaron'} sin tecla. Ponele otra con «?».</span>
                          <button type="button" className="et-boton" onClick={() => { guardarAtajos(atajos); setSinTeclaPorMarcador([]) }}>Entendido</button>
                        </p>
                      )}
                      </>}

                      {(colaConError.length > 0 || colaRechazadas.length > 0) && (
                        <div className="et-alerta-cola" role="alert">
                          {colaConError.length > 0 && (
                            <span>
                              {colaConError.length === 1 ? '1 acción sin guardar' : `${colaConError.length} acciones sin guardar`} por la conexión. Se reintenta sola; no cierres Análisis.
                            </span>
                          )}
                          {colaConError.length > 0 && (
                            <button type="button" className="et-boton" onClick={() => cola.reintentarAhora()}>Reintentar ahora</button>
                          )}
                          {colaRechazadas.length > 0 && (
                            <span>
                              {colaRechazadas.length === 1 ? '1 acción no se pudo guardar' : `${colaRechazadas.length} acciones no se pudieron guardar`}: {mensajeError(colaRechazadas[0]._error, 'guardar la acción')} Revisalas en la lista de acciones.
                            </span>
                          )}
                        </div>
                      )}

                      {ayudaAtajos && (
                        <AyudaAtajos
                          tipos={(botoneraEnUso === 'colectiva' ? botoneraColectiva : botonera).map((a) => ({ codigo: a.nombre, etiqueta: a.corto }))}
                          mapa={botoneraEnUso === 'colectiva' ? atajosBotoneraColectiva : atajosBotonera}
                          onCambiar={botoneraEnUso === 'colectiva' ? cambiarAtajosColectiva : cambiarAtajos}
                          onCerrar={() => setAyudaAtajos(false)}
                          onEligiendo={setEligiendoTecla}
                        />
                      )}

                      {accionDeshacible && (
                        <button
                          type="button"
                          disabled={bloqueoEscritura || guardando}
                          onClick={deshacerUltimaAccion}
                          className="mt-3 min-h-11 w-full rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40"
                          style={{ backgroundColor: A.fondo, borderColor: A.borde, color: A.texto }}
                        >
                          ↶ Deshacer {etiquetaTipo(accionDeshacible.tipo)} · {formatearTiempo(accionDeshacible.segundo)}
                        </button>
                      )}

                      {tipoRapido && !unToque && (
                        <div
                          className="mt-4 rounded-lg border p-3"
                          style={{
                            backgroundColor: A.fondo,
                            borderColor: AMARILLO,
                          }}
                        >
                          <p className="text-sm font-bold">
                            Acción seleccionada: {etiquetaTipo(tipoRapido)}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: A.secundario }}>
                            Tiempo: <TiempoVideo reloj={relojVideo} /> · Elegí una
                            convocada para guardar el evento.
                          </p>

                          <Campo label="Buscar jugadora por nombre o dorsal">
                            <input
                              className={`${inputClass} mt-3`}
                              style={inputStyle}
                              value={busquedaJugadora}
                              onChange={(e) => setBusquedaJugadora(e.target.value)}
                              placeholder="Nombre, apellido o dorsal..."
                            />
                          </Campo>

                          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                            <button
                              type="button"
                              disabled={capturaBloqueada}
                              onClick={() => registrarAccionRapida(tipoRapido, null)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-dashed p-2 text-left text-sm font-bold disabled:opacity-40"
                              style={{ backgroundColor: A.fondo, borderColor: A.borde }}
                            >
                              Guardar sin jugadora
                              <span className="text-xs font-normal" style={{ color: A.secundario }}>se completa después</span>
                            </button>
                            {jugadorasVisibles.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={capturaBloqueada}
                                onClick={() =>
                                  registrarAccionRapida(tipoRapido, c.jugador_id)
                                }
                                className="flex w-full items-center gap-3 rounded-lg border p-2 text-left hover:border-yellow-400 disabled:opacity-40"
                                style={{
                                  backgroundColor: A.control,
                                  borderColor: A.borde,
                                }}
                              >
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black"
                                  style={{
                                    backgroundColor: 'var(--ui-acento)',
                                    color: 'var(--ui-texto-sobre-acento)',
                                  }}
                                >
                                  {c.dorsal ?? '—'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold">
                                    {nombreJugadora(c.jugadora)}
                                  </span>
                                  <span className="text-xs" style={{ color: A.secundario }}>
                                    {c.titular ? 'Titular' : 'Suplente'}
                                  </span>
                                </span>
                                <span style={{ color: textoAnalisis(AMARILLO) }}>＋</span>
                              </button>
                            ))}

                            {jugadorasVisibles.length === 0 && (
                              <p className="py-3 text-sm" style={{ color: A.secundario }}>
                                No hay convocadas que coincidan con la búsqueda.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="my-5 border-t" style={{ borderColor: A.borde }} />

                      <details>
                        <summary className="cursor-pointer text-sm font-bold">
                          Registro manual / acción detallada
                        </summary>

                        <form onSubmit={guardarEvento} className="mt-4 space-y-4">
                          <Campo label="Acción">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={tipo}
                              onChange={(e) => {
                                setTipo(e.target.value)
                                setResultado((actual) => resultadoAlCambiarSegunCatalogo(catalogo, e.target.value, actual))
                              }}
                            >
                              {opcionesTipo(tipo).map((t) => (
                                <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                              ))}
                            </select>
                          </Campo>

                          <Campo label="Jugadora">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={jugadorId}
                              onChange={(e) => setJugadorId(e.target.value)}
                            >
                              <option value="">Sin jugadora asignada</option>
                              {citaciones.map((c) => (
                                <option key={c.id} value={c.jugador_id}>
                                  {c.dorsal ?? '—'} · {nombreJugadora(c.jugadora)}
                                </option>
                              ))}
                            </select>
                          </Campo>

                          <label className="flex items-center gap-2 text-sm" style={{ color: A.texto }}>
                            <input type="checkbox" checked={tiempoAutomatico}
                              onChange={(e) => setTiempoAutomatico(e.target.checked)} />
                            Capturar automáticamente el tiempo del video al guardar
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo label={tiempoAutomatico ? 'Tiempo de referencia (automático al guardar)' : 'Tiempo en segundos (manual)'}>
                              <input
                                className={inputClass}
                                style={inputStyle}
                                type="number"
                                min="0"
                                step="1"
                                value={segundo}
                                onChange={(e) => setSegundo(e.target.value)}
                                disabled={tiempoAutomatico && videoListo}
                                required
                              />
                              <p className="mt-1 text-xs" style={{ color: A.secundario }}>
                                {formatearTiempo(segundo)}
                              </p>
                            </Campo>

                            {opcionesResultadoCatalogo(catalogo, tipo).length > 0 && (
                              <Campo label="Resultado">
                                <select
                                  className={inputClass}
                                  style={inputStyle}
                                  value={resultadoImplicito(tipo, catalogo) ?? resultado}
                                  required={tipo === 'Despeje'}
                                  onChange={(e) => setResultado(e.target.value)}
                                >
                                  {opcionesResultadoCatalogo(catalogo, tipo).map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                                {tipo === 'Despeje' && <p className="mt-2 text-xs" style={{ color: A.secundario }}>{CRITERIO_DESPEJE}</p>}
                              </Campo>
                            )}
                          </div>

                          {!tiempoAutomatico && (
                            <Boton secundario disabled={!videoListo} onClick={tomarTiempoActual}>
                              Tomar tiempo del video
                            </Boton>
                          )}
                          {tiempoAutomatico && (
                            <p className="text-xs" style={{ color: A.secundario }}>
                              Tiempo actual del video: <TiempoVideo reloj={relojVideo} />. Se capturará al guardar.
                              Si necesitás corregirlo, desactivá la captura automática.
                            </p>
                          )}

                          <Campo label="Zona de cancha">
                            <select
                              className={inputClass}
                              style={inputStyle}
                              value={coordenadasAccion ? zonaTactica(coordenadasAccion.x, coordenadasAccion.y, direccionAtaqueActual) || zona : zona}
                              disabled={Boolean(coordenadasAccion)}
                              onChange={(e) => setZona(e.target.value)}
                            >
                              {ZONAS.map((z) => (
                                <option key={z} value={z}>{z}</option>
                              ))}
                            </select>
                          </Campo>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-sm font-medium" style={{ color: A.texto }}>Ubicación exacta en cancha (opcional)</label>
                              <span className="text-xs" style={{ color: A.secundario }}>
                                {coordenadasAccion ? `X ${coordenadasAccion.x}% · Y ${coordenadasAccion.y}%` : 'Tocá la cancha para ubicar la acción'}
                              </span>
                            </div>
                            <CanchaInteractiva
                              etiquetaTipo={etiquetaTipo}
                              interactiva
                              direccion={direccionAtaqueActual}
                              coordenadas={coordenadasAccion}
                              onSelect={(punto) => {
                                setCoordenadasAccion(punto)
                                setZona(zonaTactica(punto.x, punto.y, direccionAtaqueActual) || zona)
                              }}
                            />
                            <div className="flex justify-between gap-2">
                              <p className="text-xs" style={{ color: A.secundario }}>La ubicación se guarda junto con la acción.</p>
                              {coordenadasAccion && <button type="button" className="text-xs font-bold" style={{ color: textoAnalisis(AMARILLO) }} onClick={() => setCoordenadasAccion(null)}>Quitar ubicación</button>}
                            </div>
                          </div>

                          <Campo label="Observaciones">
                            <textarea
                              className={inputClass}
                              style={inputStyle}
                              rows={2}
                              value={observaciones}
                              onChange={(e) => setObservaciones(e.target.value)}
                              placeholder="Detalle opcional..."
                            />
                          </Campo>

                          <Boton submit disabled={bloqueoEscritura || guardando || registroIncierto || !ventanas.conectado || (tiempoAutomatico && comandoPendiente)}>
                            {guardando ? 'Guardando...' : 'Registrar acción'}
                          </Boton>
                        </form>
                      </details>
                    </>
                  )}
                  </div>
                  </ZonaVentanaAnalisis>
                </div>

                <div role="tabpanel" id="az-panel-playlist" aria-labelledby="az-pestana-playlist" hidden={pestanaPanel !== 'playlist'} className="az-panel-cuerpo">
                  <PlaylistAnalisis
                    pl={playlist}
                    partido={partidoActual}
                    total={eventosPartido.length}
                    marcas={marcasPartido}
                    fueraDeCancha={fueraDeCancha}
                    faltanMarcas={eventosDelPartido.cargando || eventosDelPartido.error ? [] : faltanMarcas(marcasPartido)}
                    onIrAPartido={() => setPestanaPanel('partido')}
                    catalogo={catalogo}
                    citaciones={citaciones}
                    jugadoras={jugadoras}
                    detalles={resumenDestinatarias.detalles}
                    cargandoDetalles={resumenDestinatarias.cargando}
                    errorDetalles={resumenDestinatarias.error}
                    onReintentarDetalles={() => setRecargaDestinatarias((n) => n + 1)}
                    puedeEditar={accesoEditor && !bloqueoEscritura}
                    videoListo={videoListo}
                    onEditarTodo={(ev) => {
                      abrirEdicionEvento(ev)
                      setTimeout(() => document.getElementById('az-edicion-evento')?.scrollIntoView({ block: 'start' }), 0)
                    }}
                    onEliminar={eliminarEvento}
                    onDescartar={(id) => cola.descartar(id)}
                    antesDeLaLista={<>
                {mostrarEdicionEvento && (
                  <form
                    id="az-edicion-evento"
                    onSubmit={guardarEdicionEvento}
                    className="mb-5 space-y-4 rounded-lg border p-4"
                    style={{ backgroundColor: A.fondo, borderColor: AMARILLO }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold">Editar acción</h3>
                      <button
                        type="button"
                        onClick={() => setMostrarEdicionEvento(false)}
                        className="text-sm"
                        style={{ color: A.secundario }}
                      >
                        Cerrar ×
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Campo label="Acción">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.tipo}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            tipo: e.target.value,
                            resultado: resultadoAlCambiarSegunCatalogo(catalogo, e.target.value, a.resultado),
                          }))}
                        >
                          {opcionesTipo(edicionEvento.tipo).map((t) => (
                            <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Jugadora">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.jugador_id}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            jugador_id: e.target.value,
                          }))}
                        >
                          <option value="">Sin jugadora</option>
                          {jugadoras.map((j) => (
                            <option key={j.id} value={j.id}>
                              {nombreJugadora(j)}
                            </option>
                          ))}
                        </select>
                      </Campo>

                      <Campo label="Tiempo (segundos)">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={edicionEvento.segundo}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            segundo: e.target.value,
                          }))}
                        />
                      </Campo>

                      <Campo label="Tiempo del partido">
                        <select className={inputClass} style={inputStyle} value={edicionEvento.periodo} onChange={(e) => setEdicionEvento((a) => ({ ...a, periodo: Number(e.target.value) }))}>
                          <option value={1}>Primer tiempo</option>
                          <option value={2}>Segundo tiempo</option>
                        </select>
                      </Campo>

                      <Campo label="Zona">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={zonaEfectivaEvento(edicionEvento, partidoActual) || ''}
                          disabled={referenciaVerificada(edicionEvento) && tieneCoordenadasExactas(edicionEvento)}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            zona: e.target.value,
                          }))}
                        >
                          <option value="">Pendiente de completar</option>
                          {ZONAS.map((z) => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </select>
                      </Campo>

                      {opcionesEdicion.length > 0 && (
                        <Campo label="Resultado">
                          <select
                            className={inputClass}
                            style={inputStyle}
                            value={resultadoImplicito(edicionEvento.tipo, catalogo) ?? edicionEvento.resultado}
                            required={edicionEvento.tipo === 'Despeje'}
                            onChange={(e) => setEdicionEvento((a) => ({
                              ...a,
                              resultado: e.target.value,
                            }))}
                          >
                            {!resultadoImplicito(edicionEvento.tipo, catalogo) && <option value="" disabled={edicionEvento.tipo === 'Despeje'}>Pendiente de completar</option>}
                            {/* Un valor cargado antes que ya no está entre las opciones se muestra, para no cambiarlo sin aviso. */}
                            {resultadoAnteriorEdicion && <option value={resultadoAnteriorEdicion}>{resultadoAnteriorEdicion} (valor anterior)</option>}
                            {opcionesEdicion.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          {edicionEvento.tipo === 'Despeje' && <p className="mt-2 text-xs" style={{ color: A.secundario }}>{CRITERIO_DESPEJE}</p>}
                        </Campo>
                      )}

                      <Campo label="Observaciones">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          value={edicionEvento.observaciones}
                          onChange={(e) => setEdicionEvento((a) => ({
                            ...a,
                            observaciones: e.target.value,
                          }))}
                          placeholder="Detalle..."
                        />
                      </Campo>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-medium" style={{ color: A.texto }}>Ubicación exacta en cancha</label>
                        <span className="text-xs" style={{ color: A.secundario }}>
                          {edicionEvento.coordenada_x != null && edicionEvento.coordenada_y != null
                            ? `X ${edicionEvento.coordenada_x}% · Y ${edicionEvento.coordenada_y}%`
                            : 'Sin ubicación exacta'}
                        </span>
                      </div>
                      <CanchaInteractiva
                        etiquetaTipo={etiquetaTipo}
                        interactiva
                        direccion={referenciaVerificada(edicionEvento) ? edicionEvento.direccion_captura : null}
                        coordenadas={edicionEvento.coordenada_x != null && edicionEvento.coordenada_y != null
                          ? { x: Number(edicionEvento.coordenada_x), y: Number(edicionEvento.coordenada_y) }
                          : null}
                        onSelect={(punto) => setEdicionEvento((a) => ({
                          ...a,
                          coordenada_x: punto.x,
                          coordenada_y: punto.y,
                          // Acciones viejas: con la dirección del partido en ese tiempo.
                          zona: zonaTactica(punto.x, punto.y, direccionDeLaAccion(a, partidoActual)) || a.zona,
                        }))}
                      />
                      {(edicionEvento.coordenada_x != null || edicionEvento.coordenada_y != null) && (
                        <button type="button" className="text-xs font-bold" style={{ color: textoAnalisis(AMARILLO) }} onClick={() => setEdicionEvento((a) => ({ ...a, coordenada_x: null, coordenada_y: null }))}>Quitar ubicación exacta</button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Boton submit disabled={bloqueoEscritura || guardando}>
                        {guardando ? 'Guardando...' : 'Guardar cambios'}
                      </Boton>
                      <Boton
                        secundario
                        onClick={() => setMostrarEdicionEvento(false)}
                      >
                        Cancelar
                      </Boton>
                    </div>
                  </form>
                )}

                {!scouting && <TramosSinAcciones eventos={eventosPartido} marcas={marcasPartido} puedeIr={videoListo} onIr={(segundoTramo) => { setSegundoIr(String(segundoTramo)); irAlSegundo(segundoTramo) }} />}
                    </>}
                  />
                </div>

                <div role="tabpanel" id="az-panel-partido" aria-labelledby="az-pestana-partido" hidden={pestanaPanel !== 'partido'} className="az-panel-cuerpo">
                  <h2 className="az-titulo">Datos del partido</h2>
                  <div className="mb-4 mt-3">
                    {!modoConsulta && !scouting && <ImportarComet
                      key={partidoActual.id}
                      analisis={partidoActual}
                      calendario={partidoCalendarioActual || null}
                      ev={eventosDelPartido}
                      citaciones={citaciones}
                      jugadoras={jugadoras}
                      puedeEditar={accesoEditor && !bloqueoEscritura && !eventosDelPartido.cargando && !eventosDelPartido.error}
                      videoListo={videoListo}
                      irA={(s) => { setSegundoIr(String(s)); irAlSegundo(s) }}
                      avisar={avisarRapido}
                      onAccionGol={crearAccionGol}
                      onAnalisis={(fila) => setPartidos((lista) => lista.map((p) => (p.id === fila.id ? { ...p, ...fila } : p)))}
                      onCalendario={(fila) => {
                        setPartidosCalendario((lista) => lista.map((p) => (p.id === fila.id ? { ...p, ...fila } : p)))
                        setPartidos((lista) => lista.map((p) => (p.partido_calendario?.id === fila.id ? { ...p, partido_calendario: { ...p.partido_calendario, ...fila } } : p)))
                      }}
                    />}
                    <PartidoEventos
                      ev={eventosDelPartido}
                      puedeEditar={accesoEditor && !bloqueoEscritura}
                      videoListo={videoListo}
                      tomarSegundo={tomarSegundoVideo}
                      irA={(s) => { setSegundoIr(String(s)); irAlSegundo(s) }}
                      citaciones={citaciones}
                      titulares={titularesIds}
                      direccion1T={partidoActual.direccion_primer_tiempo}
                      onDireccion1T={(direccion) => cambiarDireccionAtaque(direccion, 1)}
                      avisar={avisarRapido}
                      alFallar={(e) => setError(mensajeErrorOPropio(e, 'guardar el evento del partido'))}
                      minutos={{
                        ...minutosPartido,
                        vinculado: Boolean(partidoActual.partido_calendario_id),
                        planilla: planillaMinutos,
                        onGuardar: guardarMinutosPlanilla,
                      }}
                    />
                  </div>
                  {partidoActual.notas && (
                    <div
                      className="mb-4 rounded-lg border p-3"
                      style={{ backgroundColor: A.fondo, borderColor: A.borde }}
                    >
                      <h3 className="mb-1 text-sm font-bold">Notas generales</h3>
                      <p className="whitespace-pre-wrap text-sm">
                        {partidoActual.notas}
                      </p>
                    </div>
                  )}
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-bold">Formación y banco</h3>
                    <div className="text-right">
                      <p className="text-xl font-black">{citaciones.length}</p>
                      <p className="text-xs" style={{ color: A.secundario }}>
                        convocadas
                      </p>
                    </div>
                  </div>

                  {citaciones.length === 0 ? (
                    <div
                      className="rounded-lg border p-4 text-sm"
                      style={{
                        backgroundColor: A.fondo,
                        borderColor: A.borde,
                        color: A.secundario,
                      }}
                    >
                      No se encontraron convocadas para este encuentro. Revisá
                      la pestaña Convocados del partido seleccionado.
                    </div>
                  ) : (
                    <>
                      <div
                        className="relative overflow-hidden rounded-lg border p-3"
                        style={{
                          backgroundColor: '#173C32',
                          borderColor: '#3C7562',
                        }}
                      >
                        <div
                          className="pointer-events-none absolute inset-2 rounded border opacity-40"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-2 bottom-2 border-l opacity-30"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-30"
                          style={{ borderColor: '#B8D9C7' }}
                        />
                        <div className="relative grid min-h-[280px] grid-cols-3 gap-2 sm:min-h-[320px]">
                          {titulares.length > 0 && titulares.some((c) => c.coordenadas) ? (
                            citaciones
                              .filter((c) => c.titular || c.coordenadas)
                              .map((c) => {
                                const pos = c.coordenadas
                                return (
                                  <div
                                    key={c.id}
                                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                                    style={{
                                      left: `${pos?.x ?? 50}%`,
                                      top: `${pos?.y ?? 50}%`,
                                      maxWidth: '30%',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={bloqueoEscritura}
                                      onClick={() => setJugadorId(c.jugador_id)}
                                      title={nombreJugadora(c.jugadora)}
                                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black shadow-lg"
                                      style={{
                                        backgroundColor: jugadorId === c.jugador_id ? '#FFFFFF' : AMARILLO,
                                        borderColor: jugadorId === c.jugador_id ? '#171717' : '#FFF0B2',
                                        color: '#171717',
                                      }}
                                    >
                                      {c.dorsal ?? '—'}
                                    </button>
                                    <span
                                      className="mt-1 max-w-full truncate rounded px-1 text-center text-[10px] font-bold"
                                      style={{
                                        backgroundColor: '#0F1419DD',
                                        color: '#FFFFFF',
                                      }}
                                    >
                                      {c.jugadora?.apellido || c.jugadora?.nombre}
                                    </span>
                                  </div>
                                )
                              })
                          ) : (
                            <div className="col-span-3 flex flex-wrap content-center justify-center gap-3">
                              {titulares.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={bloqueoEscritura}
                                  onClick={() => setJugadorId(c.jugador_id)}
                                  className="flex w-24 flex-col items-center rounded-lg p-2"
                                  style={{
                                    backgroundColor: jugadorId === c.jugador_id ? '#40513B' : '#205344',
                                    border: `1px solid ${jugadorId === c.jugador_id ? AMARILLO : '#568675'}`,
                                  }}
                                >
                                  <span
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black"
                                    style={{ backgroundColor: 'var(--ui-acento)', color: 'var(--ui-texto-sobre-acento)' }}
                                  >
                                    {c.dorsal ?? '—'}
                                  </span>
                                  <span className="mt-2 max-w-full truncate text-xs font-semibold">
                                    {c.jugadora?.apellido || c.jugadora?.nombre}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold">Suplentes</h3>
                          <span className="text-xs" style={{ color: A.secundario }}>
                            {suplentes.length} jugadoras
                          </span>
                        </div>

                        {suplentes.length ? (
                          <div className="flex flex-wrap gap-2">
                            {suplentes.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={bloqueoEscritura}
                                onClick={() => setJugadorId(c.jugador_id)}
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left"
                                style={{
                                  backgroundColor: jugadorId === c.jugador_id ? A.seleccion : A.fondo,
                                  borderColor: jugadorId === c.jugador_id ? AMARILLO : A.borde,
                                }}
                              >
                                <span
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black"
                                  style={{ backgroundColor: A.activo, color: A.texto }}
                                >
                                  {c.dorsal ?? '—'}
                                </span>
                                <span className="text-xs font-semibold">
                                  {nombreJugadora(c.jugadora)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm" style={{ color: A.secundario }}>
                            No hay suplentes cargadas o todas tienen posición guardada en cancha.
                          </p>
                        )}
                      </div>

                      <p className="mt-3 text-xs" style={{ color: A.secundario }}>
                        Seleccioná una jugadora para asignarla al próximo evento.
                        Las posiciones se muestran cuando están guardadas en Convocados.
                      </p>
                    </>
                  )}
                </div>
              </section>
              </div>

              <div className="az-split-abajo">
                <Panel>
                  <MapaAcciones compacto titulo="Mapa del partido" eventos={eventosPartido} partidos={partidosPorId} marcas={marcasPanel}
                    detallesPases={resumenDestinatarias.detalles} nombreJugadora={nombreJugadoraPorId} etiquetaTipo={etiquetaTipo} receptoraDe={receptoraDe}
                    estadoPases={estadoPasesMapa}
                    onVideo={(evento) => { setSegundoIr(String(evento.segundo)); irAlSegundo(evento.segundo) }} />
                </Panel>
                <Panel>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Actividad etiquetada</h2>
                    <span
                      className="rounded-lg px-3 py-2 text-xl font-black"
                      style={{ backgroundColor: A.fondo, color: textoAnalisis(AMARILLO) }}
                    >
                      {eventosPartido.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Pendientes', eventosPartido.filter((e) => !e.resultado).length],
                      ['Exitosas', eventosPartido.filter((e) =>
                        ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado),
                      ).length],
                      ['Fallidas', eventosPartido.filter((e) =>
                        ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado),
                      ).length],
                    ].map(([label, valor]) => (
                      <div
                        key={label}
                        className="rounded-lg border p-3"
                        style={{ backgroundColor: A.fondo, borderColor: A.borde }}
                      >
                        <p className="text-xs" style={{ color: A.secundario }}>{label}</p>
                        <p className="mt-1 text-2xl font-black">{valor}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {seccion === 'explorador' && (
            <ExploradorAnalisis eventos={eventos} partidos={partidosPropios} jugadoras={jugadoras}
              catalogo={catalogoExplorador} catalogoAcciones={catalogo} filtros={filtrosExplorador} cambiarFiltro={cambiarFiltroExplorador}
              resumenDestinatarias={resumenDestinatarias} onReintentarDestinatarias={() => setRecargaDestinatarias((n) => n + 1)}
              puedeEditarDestinatarias={puedeEditarDestinatarias} escrituraAutorizada={escrituraAutorizada}
              paseDestinataria={paseDestinataria} onEditarDestinataria={setPaseDestinataria} onCerrarDestinataria={() => setPaseDestinataria(null)}
              onVideo={abrirEventoEnVideo}
              onDestinatariaGuardada={(detalle, jugadora) => {
                setResumenDestinatarias((actual) => ({ ...actual,
                  detalles: { ...actual.detalles, [detalle.evento_id]: detalle },
                  nombres: jugadora ? { ...actual.nombres, [jugadora.id]: nombreDestinataria(jugadora) } : actual.nombres,
                }))
                // Un guardado puede funcionar aunque la lectura del resumen haya fallado.
                // Reconsultar evita dejar la fila como "No disponible" tras guardar.
                if (resumenDestinatarias.error) setRecargaDestinatarias((n) => n + 1)
              }}
            />
          )}

          {seccion === 'estadisticas' && (
            <EstadisticasAnalisis alcance={alcanceEstadisticas} cambiarAlcance={setAlcanceEstadisticas} catalogoAcciones={catalogo}
              partidoActual={partidoActual} partidos={partidosPropios} eventos={eventos} eventosPartido={eventosPartido} jugadoras={jugadoras} />
          )}

          {seccion === 'mapa' && (
            <Panel>
              <MapaAcciones titulo="Mapa de acciones" encabezado={encabezadoMapa} eventos={eventosMapa} partidos={partidosPorId} marcas={marcasMapa}
                detallesPases={resumenDestinatarias.detalles} nombreJugadora={nombreJugadoraPorId} etiquetaTipo={etiquetaTipo} receptoraDe={receptoraDe}
                estadoPases={estadoPasesMapa} onVideo={abrirEventoEnVideo} onDestinoPase={(evento) => setPaseDestinoId(evento.id)}
                masFiltros={<>
                  <div className="ma-segmento" role="group" aria-label="Partidos">
                    {[['partido', `Este partido${partidoActual?.rival ? ` (${partidoActual.rival})` : ''}`], ['acumulado', 'Todos los partidos']].map(([valor, etiqueta]) => (
                      <button key={valor} type="button" aria-pressed={alcanceMapa === valor} onClick={() => setAlcanceMapa(valor)}>{etiqueta}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {alcanceMapa === 'acumulado' && (
                      <Campo label="Partido / rival">
                        <select className={inputClass} style={inputStyle} value={filtroMapaPartido} onChange={(e) => setFiltroMapaPartido(e.target.value)}>
                          <option value="todos">Todos los partidos</option>
                          {partidosPropios.map((partido) => (
                            <option key={partido.id} value={partido.id}>{partido.rival || 'Rival sin nombre'} · {partido.fecha || 'Sin fecha'}</option>
                          ))}
                        </select>
                      </Campo>
                    )}
                    <Campo label="Jugadora">
                      <select className={inputClass} style={inputStyle} value={filtroMapaJugadora} onChange={(e) => setFiltroMapaJugadora(e.target.value)}>
                        <option value="todos">Todas las jugadoras</option>
                        {jugadoras.map((jugadora) => <option key={jugadora.id} value={jugadora.id}>{nombreJugadora(jugadora)}</option>)}
                      </select>
                    </Campo>
                  </div>
                </>} />
              {paseDestinoActual && <div className="mt-4"><DetalleDestinoPase
                key={paseDestinoActual.id}
                evento={paseDestinoActual}
                etiquetaTipo={etiquetaTipo(paseDestinoActual.tipo)}
                partido={partidos.find((p) => p.id === paseDestinoActual.partido_id)}
                autora={nombreJugadora(jugadoras.find((j) => j.id === paseDestinoActual.jugador_id))}
                puedeEditar={puedeEditarDestinatarias && escrituraAutorizada}
                renderCancha={(props) => <CanchaInteractiva {...props} etiquetaTipo={etiquetaTipo} />}
                onClose={() => setPaseDestinoId(null)}
                onVideo={abrirEventoEnVideo}
                onSaved={(detalle) => {
                  setResumenDestinatarias((actual) => ({ ...actual,
                    detalles: { ...actual.detalles, [detalle.evento_id]: detalle },
                  }))
                  if (resumenDestinatarias.error) setRecargaDestinatarias((n) => n + 1)
                }}
              /></div>}
            </Panel>
          )}

          {seccion === 'informe' && !scouting && (
            <Panel>
              <InformeAnalisis
                key={partidoActual.id}
                analisis={partidoActual}
                calendario={partidoActual.partido_calendario || partidosCalendario.find((p) => p.id === partidoActual.partido_calendario_id) || null}
                calendarioLista={partidosCalendario}
                partidos={partidosPropios}
                eventosTemporada={eventos}
                eventosPartido={eventosPartido}
                eventosDelPartido={eventosDelPartido.eventos}
                marcas={marcasPartido}
                citaciones={citaciones}
                minutos={minutosPartido.sugeridos}
                jugadorasPorId={jugadorasPorId}
                catalogo={catalogo}
                etiquetaTipo={etiquetaTipo}
                detallesPases={resumenDestinatarias.detalles}
                puedeEditar={!bloqueoEscritura}
                onGuardado={(id, informe) => setPartidos((lista) => lista.map((p) => (p.id === id ? { ...p, informe } : p)))}
              />
            </Panel>
          )}
        </>
      )}

      <footer
        className="border-t pt-4 text-xs"
        style={{ borderColor: A.borde, color: A.secundario }}
      >
        {!bloqueoEscritura
          ? 'Administración autorizada · Gestión de análisis'
          : 'Modo consulta · Los cambios están restringidos'}
      </footer>

    </div>
  )
}
