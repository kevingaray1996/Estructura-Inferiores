import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cargarYouTubeAPI } from '../../../utils/analisis/youtubeApi'
import { aRelativo, cuadroVideo, distancia, simplificarTrazo } from '../../../utils/analisis/dibujos/coordenadas'
import { escenaEn, transformZoom } from '../../../utils/analisis/dibujos/escena'
import { HERRAMIENTAS, moverTiempo, objetoEnPunto, ordenTeclaEditor, tiempoPreciso } from '../../../utils/analisis/dibujos/editor'
import {
  COLORES_DIBUJO, FLECHAS_QUE_CRECEN, HUECO, PAUSA_MAXIMA, PAUSA_MINIMA, UMBRAL, VELOCIDADES_LENTAS, ZOOM_MAXIMO, ZOOM_MINIMO, dibujoVacio, esSeguimiento,
  excedeTamano, normalizarDibujo, nuevoId,
} from '../../../utils/analisis/dibujos/formato'
import { aplicar, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, reemplazar, rehacer } from '../../../utils/analisis/dibujos/historial'
import { quitarClave, claveEn } from '../../../utils/analisis/dibujos/interpolacion'
import {
  NOMBRE_TIPO, actualizarEnLista, actualizarObjeto, agarresDe, agregarObjeto, agregarOpcion, agregarPausa, agregarSubtitulo, borrarDeLista, borrarObjeto,
  crearObjeto, duplicarObjeto, fichaASeguimiento, marcarPosicion, moverAgarre, moverEn, pausaExplicativa,
} from '../../../utils/analisis/dibujos/operaciones'
import { agregarLento, crearControlLento, textoVelocidad } from '../../../utils/analisis/dibujos/lentos'
import { aplicarEstilo, conEstilo, estiloDeObjeto } from '../../../utils/analisis/dibujos/estilo'
import { animarZona, focoZonaEn, ryCirculo } from '../../../utils/analisis/dibujos/zonas'
import { NOMBRE_ESTADO, arcoProbable } from '../../../utils/analisis/dibujos/lineaDefensiva'
import { crearEstadoPausas, pasoPausas } from '../../../utils/analisis/dibujos/pausas'
import { crearRelojSuave } from '../../../utils/analisis/dibujos/reloj'
import {
  ACCIONES_RAPIDAS, CLAVE_FICHAS_2D, CLAVE_GUIA_CALIBRACION, CLAVE_GUIA_EDITOR, CLAVE_GUIA_SEGUIMIENTO, CLAVE_SALTO, GUIA_CALIBRACION, GUIA_EDITOR,
  GUIA_SEGUIMIENTO, SALTOS, TEXTO_SEGUIMIENTO, ayudaHerramienta, claveAnterior, deshacerToque, guardarPreferencia, instruccion, leerPreferencia,
  saltoGuardado, siguienteCuadro,
} from '../../../utils/analisis/dibujos/guias'
import { MAXIMO_CALIBRACIONES, aCancha, estaCalibrado, marcarPunto, medidasCancha, nuevaCalibracion, quitarPunto } from '../../../utils/analisis/dibujos/calibracion'
import { aJugadaPizarra, fijarAjuste, jugadoras2d, quitarAjustes } from '../../../utils/analisis/dibujos/pizarra2d'
import CapaDibujos from './CapaDibujos'
import CalibrarCancha, { CapaCalibracion } from './CalibrarCancha'
import GuardarJugada from './GuardarJugada'
import GuiaEditor from './GuiaEditor'
import Pizarra2D from './Pizarra2D'
import PizarraExportar from '../../PizarraExportar'
import { COLOR, useMedidas } from './apoyo'
import './dibujo.css'

const GUIAS = {
  editor: { pasos: GUIA_EDITOR, clave: CLAVE_GUIA_EDITOR, nombre: 'Guía del editor' },
  seguimiento: { pasos: GUIA_SEGUIMIENTO, clave: CLAVE_GUIA_SEGUIMIENTO, nombre: 'Guía: seguir a una jugadora' },
  calibracion: { pasos: GUIA_CALIBRACION, clave: CLAVE_GUIA_CALIBRACION, nombre: 'Guía: calibrar la cancha' },
}

const DOS_PUNTOS = ['pase_bajo', 'pase_alto', 'linea', 'zona', 'foco_zona']
const NOMBRE_COLOR = { amarillo: 'Amarillo', blanco: 'Blanco', rojo: 'Rojo', azul: 'Azul' }
const NOMBRE_GROSOR = { 1: 'Fino', 2: 'Medio', 3: 'Grueso' }
// Herramientas que abren la guía de seguimiento la primera vez (las que siguen a una jugadora y las que las usan).
const ABREN_GUIA_SEGUIMIENTO = ['anillo', 'foco', 'nombre', 'reflector', 'enlace', 'zona_lineas', 'linea_defensiva']
// Herramientas que se arman tocando jugadoras ya seguidas (en grupo).
const EN_GRUPO = ['zona_lineas', 'linea_defensiva']
const NOMBRE_MODO = { entera: 'Entera', rapida: 'Rápida', normal: 'Normal', lenta: 'Lenta', real: 'Como el pase real' }
const ASPECTO = 16 / 9
const ETIQUETA_ACCION = {
  pausa: 'Agregar pausa en este cuadro (tecla P)', paso: 'Agregar paso con subtítulo desde este cuadro (tecla S)',
  lento: 'Cámara lenta desde este cuadro (tecla J)', explicar: 'Pausa explicativa en este cuadro (tecla X)',
}
const nombreJugadora = (j) => (j ? [j.dorsal ? `#${j.dorsal}` : '', j.nombre || (j.rival ? 'Rival' : '')].filter(Boolean).join(' ') : '')
const MANTENER_MS = 450
const AVISO_FICHA = 'La ficha queda quieta. Para que siga a la jugadora, tocala y elegí «Seguir a esta jugadora».'

function leer(player) {
  try {
    return { t: Number(player.getCurrentTime?.()), reproduciendo: player.getPlayerState?.() === 1, velocidad: Number(player.getPlaybackRate?.()) || 1 }
  } catch { return null }
}

// Ventana de dibujo de un clip (pantalla completa). Solo coordinación y en la compu (lo decide quien la abre).
// clip: { eventoId, espejo, partidoId, videoId, inicio, fin, titulo }. jugadoras: [{ id, nombre, dorsal, foto }].
// onGuardar(dibujo) → Promise<{ error? }>. onCerrar().
// Etapa 5: rival (equipo de Equipos, para la camiseta en la 2D), canchaPartido ({ largo, ancho } de otro clip del partido),
// biblioteca ({ cargarCarpetas, guardar }) para «Guardar en Biblioteca de jugadas».
// Dibujos nivel profesional (docs/analisis-dibujos-pro.md): miEstilo ({ tipo: estilo }) y onGuardarEstilo(estilo) →
// Promise<{ soloNavegador? }> para «Mi estilo»; plantilla ({ tipo: 'opciones_pase', pasadora: { jugadora }, receptora })
// para ofrecer «Opciones de pase» al abrir un «Pase incorrecto».
export default function EditorDibujo({
  clip, dibujoInicial = null, aviso: avisoInicial = '', jugadoras = [], rival = null, canchaPartido = null, biblioteca = null, onGuardar, onCerrar,
  miEstilo = null, onGuardarEstilo = null, plantilla = null,
}) {
  const rango = useMemo(() => ({ inicio: Number(clip.inicio), fin: Number(clip.fin) }), [clip.inicio, clip.fin])
  const [hist, setHist] = useState(() => crearHistorial({ ...(dibujoInicial || dibujoVacio(rango)), clip: rango }))
  const dibujo = hist.presente
  const [herramienta, setHerramienta] = useState('seleccionar')
  const [elegido, setElegido] = useState(null) // { tipo: 'objeto' | 'pausa' | 'subtitulo', id }
  const [estilo, setEstilo] = useState({ color: 'amarillo', grosor: 2 })
  const [borrador, setBorrador] = useState(null)
  const [enlacePendiente, setEnlacePendiente] = useState(null)
  const [tiempo, setTiempo] = useState(rango.inicio)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState(false)
  const [pausaRestante, setPausaRestante] = useState(null)
  const [listo, setListo] = useState(false)
  const [errorVideo, setErrorVideo] = useState('')
  const [mensaje, setMensaje] = useState(avisoInicial ? { tipo: 'aviso', texto: avisoInicial } : null)
  const [guardando, setGuardando] = useState(false)
  // Guías: la del editor la primera vez que se abre; la de seguimiento, la primera vez que se elige una herramienta
  // que sigue a una jugadora. Se recuerda en este navegador.
  const [guia, setGuia] = useState(() => (leerPreferencia(CLAVE_GUIA_EDITOR) ? null : 'editor'))
  const guiaRef = useRef(guia)
  useLayoutEffect(() => { guiaRef.current = guia })
  // Modo seguimiento: { tipo, id (objeto que se está siguiendo), marcas (tiempos de cada toque, para deshacer) }.
  const [seguir, setSeguir] = useState(null)
  const [salto, setSalto] = useState(() => saltoGuardado(leerPreferencia(CLAVE_SALTO)))
  const [pista, setPista] = useState(null) // ayuda flotante de una herramienta: { id, left, top }
  const [escribiendo, setEscribiendo] = useState(null) // texto que se escribe sobre el video: { p, valor }
  // Etapa 5: «Video real» o «Pizarra 2D»; calibración en curso ({ id, ref: punto elegido }); agregar ficha; ventanas.
  const [modo, setModo] = useState('video')
  const [calibrando, setCalibrando] = useState(null)
  const [agregandoFicha, setAgregandoFicha] = useState(false)
  const [fichas2d, setFichas2d] = useState(() => (leerPreferencia(CLAVE_FICHAS_2D) === 'foto' ? 'foto' : 'dorsal'))
  const [ventana, setVentana] = useState(null) // 'biblioteca' | { tipo: 'exportar', doc, fotos }
  // Dibujos nivel profesional: herramientas de varios toques (opciones de pase; zona entre líneas y línea defensiva, en
  // grupo), pausa explicativa esperando el toque, lo que lleva la pausa en la Vista previa y la plantilla del pase.
  const [flujo, setFlujo] = useState(null)
  const [explicando, setExplicando] = useState(false)
  const [animPausa, setAnimPausa] = useState(null)
  const [ofrecerPlantilla, setOfrecerPlantilla] = useState(plantilla?.tipo === 'opciones_pase')
  const lentoRef = useRef(null)
  const escribiendoRef = useRef(null)
  useLayoutEffect(() => { escribiendoRef.current = escribiendo })
  const pistaTimerRef = useRef(null)
  const raizRef = useRef(null)
  const zonaRef = useRef(null)
  const videoRef = useRef(null)
  const lienzoRef = useRef(null)
  const playerRef = useRef(null)
  const forzadoRef = useRef(null)
  const arrastreRef = useRef(null)
  const vistaRef = useRef({ activa: false, reinicio: 0 })
  const textoRef = useRef(null)
  const { ancho, alto } = useMedidas(videoRef)
  const cuadro = cuadroVideo(ancho, alto)

  const objElegido = elegido?.tipo === 'objeto' ? dibujo.objetos.find((o) => o.id === elegido.id) || null : null
  // Jugadora que se está siguiendo (si se deshizo su primer toque, ya no está y el próximo toque la crea de nuevo).
  const objSeguido = seguir?.id ? dibujo.objetos.find((o) => o.id === seguir.id && o.tipo === seguir.tipo) || null : null
  const escena = useMemo(() => escenaEn(dibujo, tiempo, { elegidoId: vistaPrevia ? null : objElegido?.id, animar: vistaPrevia, pausa: vistaPrevia ? animPausa : null }),
    [dibujo, tiempo, vistaPrevia, objElegido?.id, animPausa])

  const cambiar = useCallback((fn) => setHist((h) => aplicar(h, fn(h.presente))), [])
  const dibujoRef = useRef(dibujo)
  useLayoutEffect(() => { dibujoRef.current = dibujo })

  // ---------- Reproductor (solo el tramo del clip) ----------
  useEffect(() => {
    let vigente = true
    let primerCuadro = false
    const destino = document.createElement('div')
    zonaRef.current?.appendChild(destino)
    cargarYouTubeAPI().then((YT) => {
      if (!vigente) return
      playerRef.current = new YT.Player(destino, {
        width: '100%', height: '100%', videoId: clip.videoId,
        playerVars: {
          start: Math.floor(rango.inicio), end: Math.ceil(rango.fin) + 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1,
          rel: 0, modestbranding: 1, iv_load_policy: 3, origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (!vigente) return
            // YouTube no muestra la imagen hasta reproducir: arranca en silencio y se pausa en el primer cuadro.
            try { e.target.mute(); e.target.seekTo(rango.inicio, true); e.target.playVideo() } catch { /* nada */ }
            forzadoRef.current = { t: rango.inicio, ms: performance.now() }
            setListo(true)
          },
          onStateChange: (e) => {
            if (!vigente || primerCuadro || e.data !== YT.PlayerState.PLAYING) return
            primerCuadro = true
            try { e.target.pauseVideo(); e.target.seekTo(rango.inicio, true); e.target.unMute() } catch { /* nada */ }
            forzadoRef.current = { t: rango.inicio, ms: performance.now() }
          },
          onError: () => { if (vigente) setErrorVideo('YouTube no pudo reproducir este video (puede ser privado o no permitir verse fuera de YouTube).') },
        },
      })
    }).catch(() => { if (vigente) setErrorVideo('No se pudo cargar YouTube. Revisá la conexión.') })
    return () => {
      vigente = false
      try { playerRef.current?.destroy?.() } catch { /* Ya cerrado. */ }
      playerRef.current = null
      destino.remove()
    }
  }, [clip.videoId, rango])

  // Reloj: tiempo del video a 60 cuadros por segundo; en vista previa hace las pausas; nunca pasa del fin del clip.
  useEffect(() => {
    if (!listo) return undefined
    const reloj = crearRelojSuave()
    const lento = crearControlLento()
    lentoRef.current = { lento, player: () => playerRef.current }
    let pausas = crearEstadoPausas()
    let reinicio = vistaRef.current.reinicio
    let cuadroId = 0
    const paso = () => {
      cuadroId = requestAnimationFrame(paso)
      const player = playerRef.current
      const l = player && leer(player)
      if (!l || !Number.isFinite(l.t)) return
      const ahora = performance.now()
      setReproduciendo(l.reproduciendo)
      const forzado = forzadoRef.current
      if (forzado) {
        if (l.reproduciendo || Math.abs(l.t - forzado.t) < 0.08 || ahora - forzado.ms > 1500) forzadoRef.current = null
        else { setTiempo(forzado.t); return }
      }
      let t = reloj.muestra(l.t, { reproduciendo: l.reproduciendo, velocidad: l.velocidad, ahora })
      // Cámara lenta (v3): solo en la Vista previa; al salir del tramo vuelve la velocidad que había.
      const velocidad = lento.paso({ t, reproduciendo: l.reproduciendo, velocidad: l.velocidad, ahora }, vistaRef.current.activa ? dibujoRef.current.lentos : [])
      if (velocidad !== null) { try { player.setPlaybackRate?.(velocidad) } catch { /* nada */ } }
      if (vistaRef.current.activa) {
        if (reinicio !== vistaRef.current.reinicio) { pausas = crearEstadoPausas(); reinicio = vistaRef.current.reinicio }
        const r = pasoPausas(pausas, { t, reproduciendo: l.reproduciendo, ahora }, dibujoRef.current.pausas)
        pausas = r.estado
        try {
          if (r.orden?.tipo === 'pausar') { player.pauseVideo(); player.seekTo(r.orden.t, true) }
          else if (r.orden?.tipo === 'reanudar') player.playVideo()
        } catch { /* nada */ }
        t = r.tiempo
        setPausaRestante(r.pausa ? Math.ceil(r.pausa.restante) : null)
        // Las animaciones siguen durante la pausa (unas 30 veces por segundo).
        const anim = r.pausa ? { t: r.pausa.t, transcurrido: Math.round(r.pausa.transcurrido * 30) / 30 } : null
        setAnimPausa((v) => (v?.transcurrido === anim?.transcurrido && v?.t === anim?.t ? v : anim))
      }
      if (t >= rango.fin && l.reproduciendo) {
        try { player.pauseVideo(); player.seekTo(rango.fin, true) } catch { /* nada */ }
        t = rango.fin
        if (vistaRef.current.activa) { vistaRef.current.activa = false; setVistaPrevia(false); setPausaRestante(null) }
      }
      t = Math.min(rango.fin, Math.max(rango.inicio, t))
      setTiempo((v) => (Math.abs(v - t) < 1 / 120 ? v : t))
    }
    cuadroId = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadroId)
  }, [listo, rango])
  const irA = useCallback((t) => {
    const destino = Math.min(rango.fin, Math.max(rango.inicio, Math.round(t * 1000) / 1000))
    const player = playerRef.current
    try { player?.pauseVideo?.(); player?.seekTo?.(destino, true) } catch { /* nada */ }
    forzadoRef.current = { t: destino, ms: performance.now() }
    setTiempo(destino)
  }, [rango])

  const reproducir = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    try {
      if (reproduciendo) player.pauseVideo()
      else {
        if (tiempo >= rango.fin - 0.05) player.seekTo(rango.inicio, true)
        player.playVideo()
      }
    } catch { /* nada */ }
  }, [reproduciendo, tiempo, rango])

  const alternarVistaPrevia = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (vistaRef.current.activa) {
      vistaRef.current.activa = false
      setVistaPrevia(false); setPausaRestante(null); setAnimPausa(null)
      try { player.pauseVideo() } catch { /* nada */ }
      // Si estaba en un tramo lento, vuelve la velocidad que había.
      const v = lentoRef.current?.lento.salir()
      if (v !== null && v !== undefined) { try { player.setPlaybackRate?.(v) } catch { /* nada */ } }
      return
    }
    setBorrador(null); setEnlacePendiente(null)
    vistaRef.current = { activa: true, reinicio: vistaRef.current.reinicio + 1 }
    setVistaPrevia(true)
    try { player.seekTo(rango.inicio, true); player.playVideo() } catch { /* nada */ }
  }, [rango])

  // ---------- Acciones ----------
  // Cada dibujo nuevo arranca con «Mi estilo» de su herramienta (si hay), o con el último color y grosor usados.
  const crear = useCallback((tipo, extra = {}) => {
    const d = dibujoRef.current
    const propio = miEstilo?.[tipo]
    const base = crearObjeto(tipo, { t: tiempo, clip: rango, color: propio?.color || estilo.color, grosor: propio?.grosor || estilo.grosor, usados: d.objetos.map((o) => o.id), ...extra })
    const obj = { ...aplicarEstilo(base, miEstilo), ...(extra.campos || {}) }
    const nuevo = agregarObjeto(d, obj)
    dibujoRef.current = nuevo
    setHist((h) => aplicar(h, nuevo))
    setElegido({ tipo: 'objeto', id: obj.id })
    return obj.id
  }, [tiempo, rango, estilo, miEstilo])

  // Reemplaza un objeto entero (cuando hay que sacar campos, por ejemplo las claves de una zona).
  const reemplazarObjeto = useCallback((id, fn) => cambiar((d) => ({ ...d, objetos: d.objetos.map((o) => (o.id === id ? fn(o) : o)) })), [cambiar])

  const borrarElegido = useCallback(() => {
    if (!elegido) return
    if (elegido.tipo === 'objeto') cambiar((d) => borrarObjeto(d, elegido.id))
    else if (elegido.tipo === 'lento') cambiar((d) => (d.lentos ? borrarDeLista(d, 'lentos', elegido.id) : d))
    else cambiar((d) => borrarDeLista(d, elegido.tipo === 'pausa' ? 'pausas' : 'subtitulos', elegido.id))
    setElegido(null)
  }, [elegido, cambiar])

  // Cámara lenta desde este cuadro (tecla J): 2 s a 0,5x; se ajusta en la línea de tiempo y en Propiedades.
  const nuevoLento = useCallback(() => {
    const r = agregarLento(dibujoRef.current, tiempo, { clip: rango })
    if (r.id) { dibujoRef.current = r.dibujo; setHist((h) => aplicar(h, r.dibujo)); setElegido({ tipo: 'lento', id: r.id }) }
    else setMensaje({ tipo: 'aviso', texto: 'Acá ya hay un tramo en cámara lenta (o queda muy poco clip). Mové el cursor a otro momento.' })
  }, [tiempo, rango])

  // Pausa explicativa (tecla X): espera un toque sobre la jugadora o el punto.
  const iniciarExplicacion = useCallback(() => {
    setHerramienta('seleccionar'); setSeguir(null); setFlujo(null); setBorrador(null); setEnlacePendiente(null)
    setExplicando(true)
    setMensaje(null)
  }, [])

  const duplicar = useCallback(() => {
    if (elegido?.tipo !== 'objeto') return
    const r = duplicarObjeto(dibujoRef.current, elegido.id)
    if (!r.id) return
    dibujoRef.current = r.dibujo
    setHist((h) => aplicar(h, r.dibujo))
    setElegido({ tipo: 'objeto', id: r.id })
  }, [elegido])

  const nuevaPausa = useCallback(() => {
    const r = agregarPausa(dibujoRef.current, tiempo)
    if (r.id) { dibujoRef.current = r.dibujo; setHist((h) => aplicar(h, r.dibujo)); setElegido({ tipo: 'pausa', id: r.id }) }
    else setMensaje({ tipo: 'aviso', texto: 'Ya hay una pausa en este cuadro.' })
  }, [tiempo])

  const nuevoPaso = useCallback(() => {
    const d = dibujoRef.current
    const siguiente = d.subtitulos.find((s) => s.desde > tiempo + 0.1)
    const hasta = Math.min(rango.fin, siguiente ? siguiente.desde : tiempo + 3)
    const dentro = d.subtitulos.some((s) => tiempo >= s.desde && tiempo < s.hasta)
    const r = hasta - tiempo >= 0.5 && !dentro ? agregarSubtitulo(d, tiempo, hasta, `Paso ${d.subtitulos.length + 1}`) : null
    if (r) {
      dibujoRef.current = r.dibujo
      setHist((h) => aplicar(h, r.dibujo))
      setElegido({ tipo: 'subtitulo', id: r.id }); requestAnimationFrame(() => textoRef.current?.select())
    }
    else setMensaje({ tipo: 'aviso', texto: 'Para un paso nuevo, mové el cursor a un momento sin subtítulo (al menos medio segundo antes del fin).' })
  }, [tiempo, rango])

  // Texto escrito sobre el video: Enter o hacer clic afuera lo deja (si no está vacío); Esc lo cancela.
  const confirmarTexto = useCallback(() => {
    const actual = escribiendoRef.current
    if (!actual) return
    escribiendoRef.current = null
    setEscribiendo(null)
    const texto = actual.valor.trim()
    if (texto) crear('texto', { puntos: [actual.p], texto })
  }, [crear])

  const cerrarPoligono = useCallback(() => {
    if (borrador?.tipo !== 'poligono') return
    if (borrador.puntos.length >= 3) crear('poligono', { puntos: borrador.puntos })
    setBorrador(null)
  }, [borrador, crear])

  const guardar = useCallback(async () => {
    const { dibujo: limpio } = normalizarDibujo(dibujo)
    if (excedeTamano(limpio)) { setMensaje({ tipo: 'error', texto: 'Son demasiados dibujos para un clip (máximo 200 KB). Borrá algunos puntos clave u objetos.' }); return }
    setGuardando(true)
    const r = await onGuardar(limpio)
    setGuardando(false)
    if (r?.error) setMensaje({ tipo: 'error', texto: r.error })
    else onCerrar()
  }, [dibujo, onGuardar, onCerrar])

  const cancelar = useCallback(() => {
    if (puedeDeshacer(hist) && !window.confirm('¿Salir sin guardar los cambios de los dibujos?')) return
    onCerrar()
  }, [hist, onCerrar])

  // Elegir una herramienta. Las que siguen a una jugadora entran en «Modo seguimiento» (si ya hay una elegida del
  // mismo tipo, se sigue marcando esa). La primera vez se abre la guía de seguimiento.
  const elegirHerramienta = useCallback((id, inicioFlujo = null) => {
    setHerramienta(id); setBorrador(null); setEnlacePendiente(null); setPista(null); setExplicando(false)
    setSeguir(esSeguimiento(id) ? { tipo: id, id: objElegido?.tipo === id ? objElegido.id : null, marcas: [] } : null)
    // Herramientas de varios toques: opciones de pase (pasadora, receptora, opciones) y en grupo (zona entre líneas,
    // línea defensiva).
    if (id === 'opciones_pase') setFlujo(inicioFlujo || { tipo: 'opciones', paso: 'pasadora' })
    else if (EN_GRUPO.includes(id)) setFlujo({ tipo: 'grupo', herramienta: id, paso: 'A', A: [], B: [] })
    else setFlujo(null)
    if (ABREN_GUIA_SEGUIMIENTO.includes(id) && !leerPreferencia(CLAVE_GUIA_SEGUIMIENTO)) setGuia('seguimiento')
  }, [objElegido])

  // Enter (o «Listo») en una herramienta de varios toques. Devuelve true si había algo que terminar.
  const avanzarFlujo = useCallback(() => {
    const f = flujo
    if (f?.tipo === 'grupo') {
      if (f.herramienta === 'zona_lineas' && f.paso === 'A') {
        if (!f.A.length) { setMensaje({ tipo: 'aviso', texto: 'Tocá al menos una jugadora de la primera línea.' }); return true }
        setFlujo({ ...f, paso: 'B' }); setMensaje(null); return true
      }
      const d = dibujoRef.current
      if (f.herramienta === 'zona_lineas') {
        if (!f.B.length || f.A.length + f.B.length < 3) { setMensaje({ tipo: 'aviso', texto: 'Hacen falta al menos tres jugadoras entre las dos líneas (y una en cada una).' }); return true }
        elegirHerramienta('seleccionar')
        crear('zona_lineas', { campos: { lineaA: f.A, lineaB: f.B } })
        return true
      }
      if (f.A.length < 2) { setMensaje({ tipo: 'aviso', texto: 'Para la línea hacen falta al menos dos jugadoras.' }); return true }
      // El arco que defienden se elige solo (el más cercano al promedio) y se cambia en Propiedades.
      const pos = f.A.map((id) => escena.elementos.find((e) => e.obj.id === id)?.posicion).filter(Boolean)
      const metros = pos.map((p) => aCancha(d, tiempo, p))
      const arco = arcoProbable({ metros: metros.every(Boolean) ? metros : null, video: pos, largo: medidasCancha(d.cancha).largo })
      elegirHerramienta('seleccionar')
      crear('linea_defensiva', { campos: { jugadoras: f.A, arco } })
      return true
    }
    if (f?.tipo === 'opciones' && f.paso === 'opciones') {
      const id = f.id
      elegirHerramienta('seleccionar')
      setElegido({ tipo: 'objeto', id })
      return true
    }
    return false
  }, [flujo, escena, tiempo, crear, elegirHerramienta])

  // «Empezar con Opciones de pase» (plantilla del pase incorrecto): con los nombres que ya tiene la acción.
  const empezarPlantilla = useCallback(() => {
    setOfrecerPlantilla(false)
    elegirHerramienta('opciones_pase', { tipo: 'opciones', paso: 'pasadora', plantilla })
  }, [elegirHerramienta, plantilla])

  // Deshacer: en modo seguimiento también vuelve el video al momento del toque que se borró.
  const deshacerAccion = useCallback(() => {
    if (!puedeDeshacer(hist)) return
    setHist(deshacer)
    // Solo si lo último que se hizo fue un toque (no, por ejemplo, un cambio de color).
    const ultima = seguir?.marcas[seguir.marcas.length - 1]
    if (ultima && ultima.n === hist.pasado.length) {
      const r = deshacerToque(seguir.marcas)
      setSeguir({ ...seguir, marcas: r.marcas })
      irA(r.volverA.t)
    }
  }, [hist, seguir, irA])

  // «Listo» (o Enter) en modo seguimiento: termina y muestra el resultado en Vista previa.
  const terminarSeguimiento = useCallback(() => {
    const marcados = objSeguido?.pista?.claves.length || 0
    // Si se empezó desde una ficha de la 2D, se vuelve a la 2D para ver cómo se mueve.
    if (seguir?.volver2d) { setModo('2d'); setMensaje(null) }
    setSeguir(null)
    setHerramienta('seleccionar')
    if (objSeguido) setElegido({ tipo: 'objeto', id: objSeguido.id })
    if (marcados > 0 && !vistaRef.current.activa) alternarVistaPrevia()
  }, [objSeguido, alternarVistaPrevia, seguir])

  const cambiarSalto = useCallback((valor) => {
    setSalto(valor)
    guardarPreferencia(CLAVE_SALTO, valor)
  }, [])

  const cerrarGuia = useCallback(() => {
    guardarPreferencia((GUIAS[guia] || GUIAS.editor).clave, 'si')
    setGuia(null)
    requestAnimationFrame(() => raizRef.current?.focus())
  }, [guia])

  // ---------- Etapa 5: calibración y pizarra 2D ----------
  const calActual = calibrando ? (dibujo.calibraciones || []).find((c) => c.id === calibrando.id) || null : null
  const cambiarCal = useCallback((id, fn) => cambiar((d) => ({ ...d, calibraciones: (d.calibraciones || []).map((c) => (c.id === id ? fn(c) : c)) })), [cambiar])

  // Calibración nueva en el cuadro t (copia los puntos de la más cercana). La primera vez se abre la guía.
  const calibrarEn = useCallback((t) => {
    const d = dibujoRef.current
    if ((d.calibraciones || []).length >= MAXIMO_CALIBRACIONES) { setMensaje({ tipo: 'aviso', texto: `Un clip admite hasta ${MAXIMO_CALIBRACIONES} calibraciones.` }); return }
    const cal = nuevaCalibracion(d, t, nuevoId('c', (d.calibraciones || []).map((c) => c.id)))
    const nuevo = { ...d, cancha: d.cancha || medidasCancha(canchaPartido), calibraciones: [...(d.calibraciones || []), cal].sort((a, b) => a.t - b.t) }
    dibujoRef.current = nuevo
    setHist((h) => aplicar(h, nuevo))
    setCalibrando({ id: cal.id, ref: null })
    setAgregandoFicha(false)
    irA(t)
    if (!leerPreferencia(CLAVE_GUIA_CALIBRACION)) setGuia('calibracion')
  }, [canchaPartido, irA])

  const cambiarModo = useCallback((nuevo) => {
    if (nuevo === modo) return
    if (vistaRef.current.activa) alternarVistaPrevia()
    setSeguir(null); setHerramienta('seleccionar'); setBorrador(null); setEnlacePendiente(null); setAgregandoFicha(false)
    setModo(nuevo)
    if (nuevo === 'video') { setCalibrando(null); return }
    // La primera vez que se pasa a la 2D en un clip sin calibrar, se pide calibrar.
    if (!(dibujoRef.current.calibraciones || []).length) calibrarEn(tiempo)
  }, [modo, alternarVistaPrevia, calibrarEn, tiempo])

  const terminarCalibracion = useCallback(() => {
    const cal = calActual
    if (cal && cal.puntos.length === 0) cambiar((d) => ({ ...d, calibraciones: (d.calibraciones || []).filter((c) => c.id !== cal.id) }))
    setCalibrando(null)
    if (!estaCalibrado(dibujoRef.current)) setMensaje({ tipo: 'aviso', texto: 'La cancha todavía no está calibrada: la 2D aparece cuando hay al menos 4 puntos bien marcados.' })
  }, [calActual, cambiar])

  const borrarCalibracion = useCallback(() => {
    if (!calActual) return
    cambiar((d) => ({ ...d, calibraciones: (d.calibraciones || []).filter((c) => c.id !== calActual.id) }))
    setCalibrando(null)
  }, [calActual, cambiar])

  // «Seguir a esta jugadora» (ficha quieta): pasa a Video real, al cuadro de la ficha, en Modo seguimiento con el primer
  // punto ya puesto. Al terminar («Listo») vuelve a la 2D, donde la ficha ya se mueve.
  const seguirFicha = useCallback((id) => {
    const f = dibujoRef.current.objetos.find((o) => o.id === id && o.tipo === 'ficha')
    if (!f) return
    const nuevo = fichaASeguimiento(dibujoRef.current, id)
    dibujoRef.current = nuevo
    setHist((h) => aplicar(h, nuevo))
    if (vistaRef.current.activa) alternarVistaPrevia()
    setModo('video'); setCalibrando(null); setAgregandoFicha(false); setBorrador(null); setEnlacePendiente(null)
    setHerramienta('anillo')
    setSeguir({ tipo: 'anillo', id, marcas: [], volver2d: true })
    setElegido({ tipo: 'objeto', id })
    // El primer punto ya está: el video adelanta para marcar el siguiente.
    irA(siguienteCuadro(f.t, salto, rango) ?? f.t)
    setMensaje({ tipo: 'aviso', texto: 'Modo seguimiento: el primer punto ya está puesto. Seguí tocando a la jugadora; con «Listo» volvés a la 2D y su ficha se mueve.' })
    if (!leerPreferencia(CLAVE_GUIA_SEGUIMIENTO)) setGuia('seguimiento')
  }, [alternarVistaPrevia, irA, salto, rango])

  const cambiarFichas2d = useCallback((valor) => { setFichas2d(valor); guardarPreferencia(CLAVE_FICHAS_2D, valor) }, [])

  // Exportar la 2D (PNG o video) con la ventana de la Pizarra.
  const abrirExportar = useCallback(() => {
    try {
      const doc = aJugadaPizarra(normalizarDibujo(dibujoRef.current).dibujo, { titulo: clip.titulo, rival })
      const fotos = fichas2d === 'foto'
        ? Object.fromEntries(jugadoras2d(dibujoRef.current).filter((o) => /^https:\/\//.test(o.jugadora?.foto || '')).map((o) => [o.id, o.jugadora.foto]))
        : null
      setVentana({ tipo: 'exportar', doc, fotos: fotos && Object.keys(fotos).length ? fotos : null, raiz: raizRef.current })
    } catch (e) { setMensaje({ tipo: 'error', texto: e.message }) }
  }, [clip.titulo, rival, fichas2d])

  // Ayuda flotante de una herramienta: a la derecha del botón.
  const mostrarPista = useCallback((id, el) => {
    clearTimeout(pistaTimerRef.current)
    const r = el.getBoundingClientRect()
    setPista({ id, left: r.right + 8, top: r.top })
  }, [])
  const ocultarPista = useCallback((demora = 0) => {
    clearTimeout(pistaTimerRef.current)
    if (demora) pistaTimerRef.current = setTimeout(() => setPista(null), demora)
    else setPista(null)
  }, [])
  useEffect(() => () => clearTimeout(pistaTimerRef.current), [])
  // En pantallas táctiles: mantener apretado muestra la ayuda.
  const eventosPista = (id) => ({
    onMouseEnter: (e) => mostrarPista(id, e.currentTarget),
    onMouseLeave: () => ocultarPista(),
    onFocus: (e) => mostrarPista(id, e.currentTarget),
    onBlur: () => ocultarPista(),
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return
      const el = e.currentTarget
      clearTimeout(pistaTimerRef.current)
      pistaTimerRef.current = setTimeout(() => mostrarPista(id, el), MANTENER_MS)
    },
    onPointerUp: (e) => { if (e.pointerType === 'touch') ocultarPista(1500) },
    onPointerCancel: () => ocultarPista(),
    'aria-describedby': pista?.id === id ? 'dib-pista' : undefined,
  })

  // ---------- Teclado ----------
  useEffect(() => {
    function tecla(e) {
      if (guiaRef.current) return // Mientras se ve una guía, las teclas son de la guía.
      const orden = ordenTeclaEditor(e)
      if (!orden) return
      if (vistaRef.current.activa && !['reproducir', 'escape'].includes(orden)) return
      e.preventDefault()
      if (orden === 'deshacer') return deshacerAccion()
      if (seguir && (orden === 'cerrarPoligono' || orden === 'escape') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return orden === 'cerrarPoligono' ? terminarSeguimiento() : elegirHerramienta('seleccionar')
      }
      if (orden === 'cerrarPoligono' && avanzarFlujo()) return
      if (orden === 'escape' && (flujo || explicando)) { setExplicando(false); elegirHerramienta('seleccionar'); return }
      if (orden === 'lento') return nuevoLento()
      if (orden === 'explicar') return iniciarExplicacion()
      if (orden === 'rehacer') { setHist(rehacer); return }
      if (orden === 'duplicar') return duplicar()
      if (orden === 'borrar') return borrarElegido()
      if (orden === 'reproducir') return vistaRef.current.activa ? alternarVistaPrevia() : reproducir()
      if (orden === 'inicio') return irA(rango.inicio)
      if (orden === 'fin') return irA(rango.fin)
      if (orden === 'pausa') return nuevaPausa()
      if (orden === 'paso') return nuevoPaso()
      if (orden === 'cerrarPoligono') return cerrarPoligono()
      if (orden === 'escape') {
        if (vistaRef.current.activa) return alternarVistaPrevia()
        if (calibrando?.ref) { setCalibrando((c) => (c ? { ...c, ref: null } : c)); return }
        if (agregandoFicha) { setAgregandoFicha(false); return }
        if (document.activeElement && document.activeElement !== document.body && raizRef.current?.contains(document.activeElement) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { document.activeElement.blur(); return }
        if (borrador || enlacePendiente) { setBorrador(null); setEnlacePendiente(null); return }
        if (herramienta !== 'seleccionar') { elegirHerramienta('seleccionar'); return }
        setElegido(null); return
      }
      const [tipo, valor] = orden.split(':')
      if (tipo === 'avanzar') return irA(moverTiempo(tiempo, Number(valor), rango))
      if (tipo === 'retroceder') return irA(moverTiempo(tiempo, -Number(valor), rango))
      if (tipo === 'herramienta') elegirHerramienta(valor)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [duplicar, borrarElegido, alternarVistaPrevia, reproducir, irA, rango, nuevaPausa, nuevoPaso, cerrarPoligono, borrador, enlacePendiente, herramienta, tiempo,
    deshacerAccion, seguir, terminarSeguimiento, elegirHerramienta, calibrando, agregandoFicha, avanzarFlujo, flujo, explicando, nuevoLento, iniciarExplicacion])

  // Foco en la ventana al abrir; el resto de la app queda detrás.
  useEffect(() => {
    const previo = document.activeElement
    raizRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; try { previo?.focus?.() } catch { /* nada */ } }
  }, [])

  // ---------- Dibujar con el mouse ----------
  function puntoDe(e) {
    const r = lienzoRef.current.getBoundingClientRect()
    const c = cuadroVideo(r.width, r.height)
    return aRelativo(e.clientX, e.clientY, { izquierda: r.left + c.izquierda, arriba: r.top + c.arriba, ancho: c.ancho, alto: c.alto })
  }

  function abajo(e) {
    if (vistaPrevia || !listo || e.button > 0) return
    const p = puntoDe(e)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nada */ }
    if (reproduciendo) { try { playerRef.current?.pauseVideo() } catch { /* nada */ } }
    setMensaje(null)
    if (calibrando && calActual) {
      // Calibración: el clic marca el punto elegido en la cancha chica, en el cuadro de esta calibración.
      if (Math.abs(tiempo - calActual.t) > 0.05) { irA(calActual.t); setMensaje({ tipo: 'aviso', texto: 'Volví al cuadro de esta calibración. Marcá el punto otra vez.' }); return }
      if (!calibrando.ref) { setMensaje({ tipo: 'aviso', texto: 'Primero elegí en la cancha chica qué punto vas a marcar.' }); return }
      cambiarCal(calActual.id, (c) => marcarPunto(c, calibrando.ref, p))
      setCalibrando((c) => (c ? { ...c, ref: null } : c))
      return
    }
    if (agregandoFicha) {
      // Jugadora en este cuadro: su ficha queda quieta en la 2D.
      if (!aCancha(dibujo, tiempo, p)) { setMensaje({ tipo: 'aviso', texto: 'Para agregar fichas, primero calibrá la cancha.' }); return }
      crear('ficha', { puntos: [p] })
      setAgregandoFicha(false)
      setMensaje({ tipo: 'aviso', texto: AVISO_FICHA })
      return
    }
    // Seguidas visibles en este cuadro (para tocar a una jugadora en las herramientas que las usan).
    const seguidaEn = (q) => objetoEnPunto(escena.elementos.filter((x) => esSeguimiento(x.obj.tipo) && !x.fuera), q)
    if (explicando) {
      // Pausa explicativa: pausa, foco (sobre la seguida que se tocó o en ese punto) y subtítulo listo para escribir.
      const el = seguidaEn(p)
      const r = pausaExplicativa(dibujoRef.current, tiempo, { punto: p, seguida: el?.obj || null, clip: rango })
      dibujoRef.current = r.dibujo
      setHist((h) => aplicar(h, r.dibujo))
      setExplicando(false)
      setElegido({ tipo: 'subtitulo', id: r.subtitulo })
      requestAnimationFrame(() => textoRef.current?.select())
      setMensaje({ tipo: 'aviso', texto: `Listo: pausa de 3 s, foco${el ? ' sobre la jugadora' : ' en ese punto'} y subtítulo. Escribí la explicación en Propiedades.` })
      return
    }
    if (herramienta === 'seleccionar') {
      // Primero los agarres del dibujo elegido: estirar una esquina o mover una punta.
      if (objElegido && !esSeguimiento(objElegido.tipo)) {
        const i = agarresDe(objElegido, tiempo).findIndex((q) => Math.hypot(q.x - p.x, (q.y - p.y) / ASPECTO) < 0.012)
        if (i >= 0) { arrastreRef.current = { modo: 'agarre', id: objElegido.id, indice: i, ultimo: p, empezado: false }; return }
      }
      const el = objetoEnPunto(escena.elementos, p)
      if (!el) { setElegido(null); return }
      setElegido({ tipo: 'objeto', id: el.obj.id })
      arrastreRef.current = { modo: esSeguimiento(el.obj.tipo) ? 'clave' : 'mover', id: el.obj.id, ultimo: p, empezado: false }
      return
    }
    if (herramienta === 'opciones_pase') {
      const f = flujo?.tipo === 'opciones' ? flujo : { tipo: 'opciones', paso: 'pasadora' }
      const el = seguidaEn(p)
      // Si se toca a una jugadora seguida, la sigue; si no, queda en el punto tocado.
      const participante = (jugadora) => {
        const r = { punto: el?.posicion || p, seguir: el?.obj.id || null }
        const j = jugadora || el?.obj.jugadora
        if (j) r.jugadora = j
        return r
      }
      if (f.paso === 'pasadora') { setFlujo({ ...f, paso: 'receptora', pasadora: participante(f.plantilla?.pasadora?.jugadora) }); return }
      if (f.paso === 'receptora') {
        const id = crear('opciones_pase', { campos: { pasadora: f.pasadora, receptora: participante(f.plantilla?.receptora?.jugadora) } })
        setFlujo({ ...f, paso: 'opciones', id, n: 0 })
        return
      }
      const obj = dibujoRef.current.objetos.find((o) => o.id === f.id)
      if (!obj) { setFlujo({ tipo: 'opciones', paso: 'pasadora' }); return }
      if (obj.opciones.length >= 5) { setMensaje({ tipo: 'aviso', texto: 'Hasta 5 opciones. Tocá «Listo» (o Enter) para terminar.' }); return }
      const nuevo = agregarOpcion(dibujoRef.current, f.id, participante(null))
      dibujoRef.current = nuevo
      setHist((h) => aplicar(h, nuevo))
      setFlujo({ ...f, n: obj.opciones.length + 1 })
      return
    }
    if (EN_GRUPO.includes(herramienta)) {
      // Zona entre líneas y línea defensiva: se tocan jugadoras ya seguidas (tocarla otra vez la saca).
      const el = seguidaEn(p)
      if (!el) { setMensaje({ tipo: 'aviso', texto: 'Tocá una jugadora que ya esté seguida (con anillo, foco, reflector o nombre). Si todavía no la seguiste, hacelo primero con una de esas herramientas.' }); return }
      const f = flujo?.tipo === 'grupo' && flujo.herramienta === herramienta ? flujo : { tipo: 'grupo', herramienta, paso: 'A', A: [], B: [] }
      const id = el.obj.id
      const otra = f.paso === 'A' ? f.B : f.A
      if (otra.includes(id)) { setMensaje({ tipo: 'aviso', texto: 'Esa jugadora ya está en la otra línea.' }); return }
      const lista = f[f.paso]
      setFlujo({ ...f, [f.paso]: lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id].slice(0, 11) })
      return
    }
    if (DOS_PUNTOS.includes(herramienta)) {
      // Segundo clic (modo «clic y clic»): termina el dibujo.
      if (borrador?.esperando && borrador.tipo === herramienta) {
        if (distancia(borrador.puntos[0], p) > 0.012) crear(herramienta, { puntos: [borrador.puntos[0], p] })
        setBorrador(null)
        return
      }
      setBorrador({ tipo: herramienta, puntos: [p, p] }); arrastreRef.current = { modo: 'trazar' }; return
    }
    if (herramienta === 'movimiento') { setBorrador({ tipo: 'movimiento', puntos: [p] }); arrastreRef.current = { modo: 'trazo' }; return }
    if (herramienta === 'poligono') {
      if (borrador?.tipo === 'poligono') {
        if (borrador.puntos.length >= 3 && distancia(p, borrador.puntos[0]) < 0.02) { cerrarPoligono(); return }
        if (borrador.puntos.length >= 30) { cerrarPoligono(); return }
        setBorrador({ ...borrador, puntos: [...borrador.puntos, p] })
      } else setBorrador({ tipo: 'poligono', puntos: [p] })
      return
    }
    if (herramienta === 'texto') {
      // Se escribe ahí mismo, sobre el video (si había otro a medio escribir, queda guardado).
      e.preventDefault() // que el foco quede en el campo nuevo y no en el video
      confirmarTexto()
      setEscribiendo({ p, valor: '' })
      return
    }
    if (esSeguimiento(herramienta)) {
      // Modo seguimiento: cada toque guarda la posición en este cuadro (un paso de deshacer). Al soltar, el video
      // adelanta solo el salto elegido. Mientras se mantiene apretado, se puede corregir el lugar arrastrando.
      let id
      if (objSeguido) {
        setHist((h) => aplicar(h, marcarPosicion(h.presente, objSeguido.id, tiempo, p)))
        id = objSeguido.id
      } else {
        id = crear(herramienta, { puntos: [p] })
      }
      setElegido({ tipo: 'objeto', id })
      // n: largo del historial después de este toque (para saber si Ctrl+Z lo deshace a él).
      const marca = { t: tiempo, n: Math.min(hist.limite, hist.pasado.length + 1) }
      setSeguir((s) => ({ tipo: herramienta, id, marcas: [...(s?.id === id ? s.marcas : []), marca], volver2d: s?.id === id && Boolean(s.volver2d) }))
      arrastreRef.current = { modo: 'clave', id, ultimo: p, empezado: true, seguimiento: true }
      return
    }
    if (herramienta === 'enlace') {
      const el = objetoEnPunto(escena.elementos.filter((x) => esSeguimiento(x.obj.tipo) && !x.fuera), p)
      if (!el) { setMensaje({ tipo: 'aviso', texto: 'Tocá una jugadora que ya esté seguida con anillo, foco o nombre.' }); return }
      if (!enlacePendiente) { setEnlacePendiente(el.obj.id); setMensaje({ tipo: 'aviso', texto: 'Ahora tocá la otra jugadora.' }); return }
      if (enlacePendiente === el.obj.id) return
      crear('enlace', { campos: { a: enlacePendiente, b: el.obj.id } })
      setEnlacePendiente(null)
      return
    }
    if (herramienta === 'zoom') {
      crear('zoom', { puntos: [p], campos: objElegido && esSeguimiento(objElegido.tipo) ? { seguir: objElegido.id } : {} })
    }
  }

  function mover(e) {
    const a = arrastreRef.current
    if (!a) {
      // Entre el primer y el segundo clic, la línea sigue al mouse.
      if (borrador?.esperando) { const p = puntoDe(e); setBorrador((b) => (b?.esperando ? { ...b, puntos: [b.puntos[0], p] } : b)) }
      return
    }
    const p = puntoDe(e)
    if (a.modo === 'trazar') { setBorrador((b) => (b ? { ...b, puntos: [b.puntos[0], p] } : b)); return }
    if (a.modo === 'trazo') { setBorrador((b) => (b ? { ...b, puntos: [...b.puntos, p] } : b)); return }
    if (a.modo === 'mover') {
      const dx = p.x - a.ultimo.x, dy = p.y - a.ultimo.y
      if (!a.empezado && Math.hypot(dx, dy) < 0.004) return
      // Las zonas y focos que se mueven con puntos clave guardan la forma en este cuadro.
      setHist((h) => (a.empezado ? reemplazar : aplicar)(h, moverEn(h.presente, a.id, tiempo, dx, dy)))
      arrastreRef.current = { ...a, ultimo: p, empezado: true }
      return
    }
    if (a.modo === 'agarre') {
      if (!a.empezado && distancia(p, a.ultimo) < 0.003) return
      setHist((h) => (a.empezado ? reemplazar : aplicar)(h, moverAgarre(h.presente, a.id, tiempo, a.indice, p)))
      arrastreRef.current = { ...a, empezado: true }
      return
    }
    if (a.modo === 'clave') {
      if (!a.empezado && distancia(p, a.ultimo) < 0.004) return
      setHist((h) => (a.empezado ? reemplazar : aplicar)(h, marcarPosicion(h.presente, a.id, tiempo, p)))
      arrastreRef.current = { ...a, ultimo: p, empezado: true }
    }
  }

  function arriba() {
    const a = arrastreRef.current
    arrastreRef.current = null
    if (a?.seguimiento) {
      const destino = siguienteCuadro(tiempo, salto, rango)
      if (destino !== null) irA(destino)
      else setMensaje({ tipo: 'aviso', texto: 'Llegaste al final del clip. Tocá «Listo» (o Enter) para ver cómo quedó.' })
      return
    }
    if (!a || !borrador) return
    if (a.modo === 'trazar') {
      const [p, q] = borrador.puntos
      // Si no arrastró, queda esperando el segundo clic (el foco en una zona, con un clic, queda redondo).
      if (distancia(p, q) > 0.012) { crear(borrador.tipo, { puntos: [p, q] }); setBorrador(null) }
      else if (borrador.tipo === 'foco_zona') { crear('foco_zona', { puntos: [p] }); setBorrador(null) }
      else setBorrador({ ...borrador, esperando: true })
    } else if (a.modo === 'trazo') {
      const puntos = simplificarTrazo(borrador.puntos)
      if (puntos.length >= 2 && distancia(puntos[0], puntos[puntos.length - 1]) > 0.01) crear('movimiento', { puntos })
      setBorrador(null)
    }
  }

  // Borrador visible (todavía no es parte del dibujo).
  const elBorrador = borrador?.tipo === 'foco_zona' && borrador.puntos.length >= 2 && distancia(borrador.puntos[0], borrador.puntos[1]) > 0.012
    ? (() => {
      const [a, b] = borrador.puntos
      return { obj: { id: null, tipo: 'foco_zona', forma: 'elipse', color: 'blanco', grosor: estilo.grosor }, forma: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }, encendido: 1 }
    })()
    : borrador && borrador.tipo !== 'foco_zona' && (borrador.puntos.length >= 2 || borrador.tipo === 'poligono')
      ? { obj: { ...borrador, id: null, color: estilo.color, grosor: estilo.grosor, puntos: borrador.puntos }, escala: 1 } : null
  const zoomVista = vistaPrevia ? transformZoom(escena.zoom) : transformZoom(null)
  const zoomElegido = objElegido?.tipo === 'zoom' ? objElegido : null

  const editarObjeto = (cambios) => {
    if (!objElegido) return
    cambiar((d) => actualizarObjeto(d, objElegido.id, cambios))
    if (cambios.color || cambios.grosor) setEstilo((s) => ({ ...s, ...(cambios.color ? { color: cambios.color } : {}), ...(cambios.grosor ? { grosor: cambios.grosor } : {}) }))
  }

  const ayudaPista = pista ? ayudaHerramienta(pista.id) : null
  const puntosMarcados = objSeguido?.pista?.claves.length || 0
  const anterior = seguir && objSeguido ? claveAnterior(objSeguido.pista.claves, tiempo) : null
  const textoInstruccion = modo === '2d' && !vistaPrevia
    ? (calibrando ? 'Calibración: elegí un punto en la cancha chica y hacé clic en el video donde está.'
      : agregandoFicha ? `Tocá en el video a la jugadora (a la altura de los pies). ${AVISO_FICHA}`
        : 'Pizarra 2D: arrastrá una ficha para corregir su lugar solo en la 2D (el video no cambia). Tocá una ficha para elegir quién es.')
    : instruccion({
      herramienta, borrador, enlacePendiente, vistaPrevia, explicando,
      fueraDeTiempo: objElegido && !['zoom', 'ficha'].includes(objElegido.tipo) && (tiempo < objElegido.desde || tiempo > objElegido.hasta) ? objElegido : null,
      opciones: flujo?.tipo === 'opciones'
        ? { paso: flujo.paso, n: flujo.n || 0, pasadora: nombreJugadora(flujo.plantilla?.pasadora?.jugadora), receptora: nombreJugadora(flujo.plantilla?.receptora?.jugadora) }
        : null,
      grupo: flujo?.tipo === 'grupo' ? { paso: flujo.paso, n: flujo[flujo.paso].length } : null,
    })
  const calibrado = estaCalibrado(dibujo)
  // Herramientas de varios toques: botón «Listo» (o «Siguiente línea») al lado de la instrucción.
  const botonFlujo = flujo?.tipo === 'grupo'
    ? (flujo.herramienta === 'zona_lineas' && flujo.paso === 'A' ? 'Siguiente línea (Enter)' : 'Listo (Enter)')
    : flujo?.tipo === 'opciones' && flujo.paso === 'opciones' ? 'Listo (Enter)' : null
  // Jugadoras ya elegidas en el grupo (se marcan en el video).
  const marcadasGrupo = flujo?.tipo === 'grupo'
    ? [...flujo.A.map((id) => ({ id, linea: 'A' })), ...flujo.B.map((id) => ({ id, linea: 'B' }))]
      .map((m) => ({ ...m, p: escena.elementos.find((e) => e.obj.id === m.id)?.posicion })).filter((m) => m.p)
    : []
  if (flujo?.tipo === 'opciones' && flujo.pasadora && flujo.paso === 'receptora') marcadasGrupo.push({ id: 'pasadora', linea: 'A', p: flujo.pasadora.punto })

  return (
    <div ref={raizRef} className="dib-editor" role="dialog" aria-modal="true" aria-label={`Dibujar: ${clip.titulo}`} tabIndex={-1}>
      <header className="dib-cab">
        <h2>{clip.titulo}</h2>
        <div className="dib-segmento" role="group" aria-label="Modo de dibujo">
          <button type="button" aria-pressed={modo === 'video'} onClick={() => cambiarModo('video')}>Video real</button>
          <button type="button" aria-pressed={modo === '2d'} onClick={() => cambiarModo('2d')} disabled={!listo}>Pizarra 2D</button>
        </div>
        <button type="button" className="dib-boton" onClick={deshacerAccion} disabled={!puedeDeshacer(hist) || vistaPrevia} title="Deshacer (Ctrl+Z)">↶ Deshacer</button>
        <button type="button" className="dib-boton" onClick={() => setHist(rehacer)} disabled={!puedeRehacer(hist) || vistaPrevia} title="Rehacer (Ctrl+Y)">↷ Rehacer</button>
        <button type="button" className="dib-boton" data-guia="vista-previa" aria-pressed={vistaPrevia} onClick={alternarVistaPrevia} disabled={!listo}>{vistaPrevia ? '■ Detener vista previa' : '▶ Vista previa'}</button>
        <button type="button" className="dib-boton" onClick={() => setGuia('editor')} aria-label="Ver la guía del editor" title="Ver la guía del editor">?</button>
        <button type="button" className="dib-boton" onClick={cancelar}>Cancelar</button>
        <button type="button" className="dib-boton dib-principal" data-guia="pegar" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Pegar en la línea de tiempo'}</button>
      </header>

      <nav className="dib-herramientas" aria-label="Herramientas" data-guia="herramientas">
        {HERRAMIENTAS.map((h, i) => (
          <div key={h.id} style={{ display: 'contents' }}>
            {i > 0 && HERRAMIENTAS[i - 1].grupo !== h.grupo && <span className="dib-separador" aria-hidden="true" />}
            <button type="button" className="dib-herramienta" aria-pressed={herramienta === h.id} disabled={vistaPrevia || modo === '2d'} data-herramienta={h.id}
              aria-label={`${h.texto} (tecla ${h.tecla})`} aria-keyshortcuts={h.tecla} {...eventosPista(h.id)}
              onClick={() => elegirHerramienta(h.id)}>
              <span aria-hidden="true">{h.icono}</span><kbd aria-hidden="true">{h.tecla}</kbd>
            </button>
          </div>
        ))}
        <span className="dib-separador" aria-hidden="true" />
        <div className="dib-acciones" data-guia="acciones">
          {ACCIONES_RAPIDAS.map((h) => (
            <button key={h.id} type="button" className="dib-herramienta" disabled={vistaPrevia || modo === '2d'} data-herramienta={h.id}
              aria-label={ETIQUETA_ACCION[h.id]} aria-pressed={h.id === 'explicar' ? explicando : undefined}
              aria-keyshortcuts={h.tecla} {...eventosPista(h.id)}
              onClick={{ pausa: nuevaPausa, paso: nuevoPaso, lento: nuevoLento, explicar: iniciarExplicacion }[h.id]}>
              <span aria-hidden="true">{h.icono}</span><kbd aria-hidden="true">{h.tecla}</kbd>
            </button>
          ))}
        </div>
      </nav>

      <main className="dib-centro">
        {seguir && !vistaPrevia ? (
          <div className="dib-seguimiento" data-guia="seguimiento" role="status">
            <p className="dib-seguimiento-texto"><strong>Modo seguimiento.</strong> {TEXTO_SEGUIMIENTO}</p>
            <p className="dib-contador" data-guia="contador">Puntos marcados: {puntosMarcados}</p>
            <div className="dib-salto" data-guia="salto">
              <span>Adelanta</span>
              <div className="dib-segmento" role="group" aria-label="Cuánto adelanta el video después de cada toque">
                {SALTOS.map((v) => (
                  <button key={v} type="button" aria-pressed={salto === v} onClick={() => cambiarSalto(v)}>{String(v).replace('.', ',')} s</button>
                ))}
              </div>
            </div>
            <button type="button" className="dib-boton dib-principal" data-guia="listo" onClick={terminarSeguimiento}>Listo (Enter)</button>
          </div>
        ) : (
          <div className="dib-instruccion-fila">
            <p className="dib-instruccion" aria-live="polite">{textoInstruccion}</p>
            {botonFlujo && !vistaPrevia && <button type="button" className="dib-boton dib-principal" onClick={avanzarFlujo}>{botonFlujo}</button>}
            {(flujo || explicando) && !vistaPrevia && <button type="button" className="dib-boton" onClick={() => elegirHerramienta('seleccionar')}>Cancelar (Esc)</button>}
            {ofrecerPlantilla && !vistaPrevia && (
              <div className="dib-plantilla" role="status">
                <p><strong>Es un pase incorrecto.</strong> ¿Empezás con «Opciones de pase»? Vas a tocar a {nombreJugadora(plantilla?.pasadora?.jugadora) || 'la que tenía la pelota'},
                  a {nombreJugadora(plantilla?.receptora?.jugadora) || 'la que recibió'} y después a las compañeras que estaban mejor.</p>
                <button type="button" className="dib-boton dib-principal" onClick={empezarPlantilla}>Empezar con Opciones de pase</button>
                <button type="button" className="dib-boton" onClick={() => setOfrecerPlantilla(false)}>Ahora no</button>
              </div>
            )}
          </div>
        )}
        <div className="dib-escenario">
          <div className={modo === '2d' ? 'dib-dos' : 'dib-dos dib-uno'}>
          <div className="dib-celda" style={{ containerType: 'size' }}>
          <div ref={videoRef} className="dib-video" data-guia="video" style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))' }}>
            <div className="dib-zoom" style={zoomVista}>
              <div ref={zonaRef} className="dib-zoom dib-sin-interfaz" />
              <CapaDibujos escena={escena} ancho={ancho} alto={alto} cuadro={cuadro} elegidoId={vistaPrevia ? null : objElegido?.id} borrador={elBorrador} tiempo={tiempo} />
              {/* Jugadoras ya elegidas en una herramienta de grupo (o la pasadora): marcadas para no perderlas. */}
              {marcadasGrupo.length > 0 && !vistaPrevia && ancho > 0 && (
                <svg className="dib-rastro-guia" width={ancho} height={alto} aria-hidden="true">
                  <g transform={`translate(${cuadro.izquierda} ${cuadro.arriba})`}>
                    {marcadasGrupo.map((m) => (
                      <circle key={`${m.linea}-${m.id}`} data-marcada={m.linea} cx={m.p.x * cuadro.ancho} cy={m.p.y * cuadro.alto} r={14}
                        style={{ fill: 'none', stroke: m.linea === 'A' ? 'var(--dib-amarillo)' : 'var(--dib-blanco)', strokeWidth: 3, strokeDasharray: '5 4' }} />
                    ))}
                  </g>
                </svg>
              )}
              {zoomElegido && !vistaPrevia && (
                <span aria-hidden="true" style={{
                  position: 'absolute', left: cuadro.izquierda + zoomElegido.objetivo.x * cuadro.ancho - 14, top: cuadro.arriba + zoomElegido.objetivo.y * cuadro.alto - 14,
                  width: 28, height: 28, borderRadius: 999, border: '2px dashed var(--dib-blanco)', pointerEvents: 'none',
                }} />
              )}
              {/* Modo seguimiento: el recorrido marcado y el punto anterior, tenues, para seguir a la jugadora. */}
              {seguir && objSeguido && !vistaPrevia && ancho > 0 && (
                <svg className="dib-rastro-guia" width={ancho} height={alto} aria-hidden="true">
                  <g transform={`translate(${cuadro.izquierda} ${cuadro.arriba})`} opacity="0.55">
                    <polyline points={objSeguido.pista.claves.map((c) => `${c.x * cuadro.ancho},${c.y * cuadro.alto}`).join(' ')}
                      style={{ fill: 'none', stroke: 'var(--dib-blanco)', strokeWidth: 2, strokeDasharray: '4 5' }} />
                    {anterior && <circle data-punto-anterior="si" cx={anterior.x * cuadro.ancho} cy={anterior.y * cuadro.alto} r={9}
                      style={{ fill: 'none', stroke: 'var(--dib-amarillo)', strokeWidth: 2 }} />}
                  </g>
                </svg>
              )}
            </div>
            {escena.subtitulo && <p className="dib-subtitulo" style={{ bottom: `${cuadro.arriba + 12}px` }}>{escena.subtitulo}</p>}
            {pausaRestante !== null && <p className="dib-pausa" role="status">⏸ {pausaRestante}</p>}
            {vistaPrevia && escena.lento && pausaRestante === null && <p className="dib-lento" role="status">Cámara lenta {textoVelocidad(escena.lento)}</p>}
            <div ref={lienzoRef} className="dib-lienzo" data-herramienta={herramienta} data-vista-previa={vistaPrevia ? 'si' : undefined}
              onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={() => { arrastreRef.current = null; setBorrador(null) }}
              onDoubleClick={() => { if (herramienta === 'poligono') cerrarPoligono() }} />
            {escribiendo && (
              <input type="text" className="dib-texto-en-video" autoFocus maxLength={140} placeholder="Escribí y apretá Enter"
                aria-label="Texto sobre el video (Enter para terminar, Esc para cancelar)" value={escribiendo.valor}
                style={{ left: cuadro.izquierda + escribiendo.p.x * cuadro.ancho, top: cuadro.arriba + escribiendo.p.y * cuadro.alto, color: COLOR[estilo.color] }}
                onChange={(e) => { const valor = e.target.value; setEscribiendo((s) => (s ? { ...s, valor } : s)) }}
                onBlur={confirmarTexto}
                onKeyDown={(e) => {
                  // Estas teclas son del campo, no de los atajos del editor.
                  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmarTexto(); raizRef.current?.focus() }
                  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escribiendoRef.current = null; setEscribiendo(null); raizRef.current?.focus() }
                  else e.stopPropagation()
                }} />
            )}
            {!listo && !errorVideo && <p className="rp-video-aviso" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Cargando el clip…</p>}
            {errorVideo && <p className="dib-error" role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '1rem', textAlign: 'center' }}>{errorVideo}</p>}
            {calActual && <CapaCalibracion dibujo={dibujo} cal={calActual} elegido={calibrando.ref} ancho={ancho} alto={alto} cuadro={cuadro} />}
          </div>
          </div>
          {modo === '2d' && (
            <div className="dib-celda dib-celda-2d" aria-label="Pizarra 2D">
              {calActual ? (
                <CalibrarCancha dibujo={dibujo} cal={calActual} elegido={calibrando.ref} tiempo={tiempo}
                  onElegir={(ref) => setCalibrando((c) => (c ? { ...c, ref: c.ref === ref ? null : ref } : c))}
                  onMedidas={(cancha) => cambiar((d) => ({ ...d, cancha: medidasCancha(cancha) }))}
                  onQuitar={(ref) => cambiarCal(calActual.id, (c) => quitarPunto(c, ref))}
                  onRecalibrar={() => calibrarEn(tiempo)}
                  onIr={(c) => { setCalibrando({ id: c.id, ref: null }); irA(c.t) }}
                  onBorrar={borrarCalibracion} onListo={terminarCalibracion} onGuia={() => setGuia('calibracion')} />
              ) : <>
                <div className="dib-barra2d">
                  <button type="button" className="dib-boton" onClick={() => {
                    const cercana = (dibujo.calibraciones || []).reduce((m, c) => (!m || Math.abs(c.t - tiempo) < Math.abs(m.t - tiempo) ? c : m), null)
                    if (cercana) { setCalibrando({ id: cercana.id, ref: null }); irA(cercana.t) } else calibrarEn(tiempo)
                  }}>{calibrado ? 'Revisar calibración' : 'Calibrar cancha'}</button>
                  {calibrado && <button type="button" className="dib-boton" onClick={() => calibrarEn(tiempo)}>Recalibrar en este cuadro</button>}
                  <button type="button" className="dib-boton" aria-pressed={agregandoFicha} disabled={!calibrado || vistaPrevia}
                    onClick={() => setAgregandoFicha((v) => !v)}>+ Agregar jugadora en este cuadro</button>
                  <div className="dib-segmento" role="group" aria-label="Qué muestran nuestras fichas">
                    <button type="button" aria-pressed={fichas2d === 'dorsal'} onClick={() => cambiarFichas2d('dorsal')}>Dorsal</button>
                    <button type="button" aria-pressed={fichas2d === 'foto'} onClick={() => cambiarFichas2d('foto')}>Foto</button>
                  </div>
                </div>
                <Pizarra2D dibujo={dibujo} tiempo={tiempo} rival={rival} fichas={fichas2d} editable={!vistaPrevia}
                  elegidoId={objElegido?.id || null}
                  onElegir={(id) => { const objId = id.replace(/-m$/, ''); if (dibujo.objetos.some((o) => o.id === objId)) setElegido({ tipo: 'objeto', id: objId }) }}
                  onMover={(id, metros) => cambiar((d) => fijarAjuste(d, id, tiempo, metros))} />
                <div className="dib-barra2d">
                  <button type="button" className="dib-boton" onClick={() => setVentana('biblioteca')} disabled={!calibrado || !biblioteca}>Guardar en Biblioteca de jugadas</button>
                  <button type="button" className="dib-boton" onClick={abrirExportar} disabled={!calibrado}>Exportar PNG o video</button>
                </div>
                <p className="dib-ayuda">Las fichas siguen a las jugadoras que marcaste con Anillo, Foco o Nombre. Para elegir quién es cada una, tocala y mirá Propiedades.</p>
              </>}
            </div>
          )}
          </div>
        </div>
        <div className="dib-controles">
          <button type="button" className="dib-boton" onClick={() => irA(rango.inicio)} aria-label="Ir al inicio del clip (Inicio)">⏮</button>
          <button type="button" className="dib-boton" onClick={() => irA(moverTiempo(tiempo, -0.1, rango))} aria-label="Cuadro anterior (flecha izquierda)">◀ 0,1 s</button>
          <button type="button" className="dib-boton" onClick={vistaPrevia ? alternarVistaPrevia : reproducir} disabled={!listo} aria-label={reproduciendo ? 'Pausa (espacio)' : 'Reproducir (espacio)'}>{reproduciendo ? '⏸' : '▶'}</button>
          <button type="button" className="dib-boton" onClick={() => irA(moverTiempo(tiempo, 0.1, rango))} aria-label="Cuadro siguiente (flecha derecha)">0,1 s ▶</button>
          <span className="dib-reloj" aria-live="off">{tiempoPreciso(tiempo)} <small>/ {tiempoPreciso(rango.fin)}</small></span>
          {mensaje && <p className={mensaje.tipo === 'error' ? 'dib-error' : 'dib-aviso'} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>{mensaje.texto}</p>}
        </div>
        <p className="dib-ayuda">Teclas: ← → cuadro a cuadro (Mayús: 1 s) · Espacio reproducir · Ctrl+Z / Ctrl+Y · Ctrl+D duplicar · Supr borrar · «?» guía.</p>
      </main>

      <aside className="dib-propiedades" aria-label="Propiedades y pasos">
        <div data-guia="propiedades">
          <Propiedades
            elegido={elegido} obj={objElegido} dibujo={dibujo} tiempo={tiempo} rango={rango} jugadoras={jugadoras} textoRef={textoRef}
            onObjeto={editarObjeto}
            onLista={(lista, id, cambios) => cambiar((d) => actualizarEnLista(d, lista, id, cambios))}
            onQuitarClave={() => objElegido?.pista && cambiar((d) => actualizarObjeto(d, objElegido.id, { pista: { ...objElegido.pista, claves: quitarClave(objElegido.pista.claves, tiempo) } }))}
            onQuitarAjustes={() => objElegido && cambiar((d) => quitarAjustes(d, objElegido.id))}
            onSeguirFicha={seguirFicha}
            onDuplicar={duplicar} onBorrar={borrarElegido} onIr={irA}
            calibrado={calibrado} elemento={objElegido ? escena.elementos.find((e) => e.obj.id === objElegido.id) || null : null}
            onReemplazar={(fn) => objElegido && reemplazarObjeto(objElegido.id, fn)}
            onAgregarOpcion={() => objElegido && elegirHerramienta('opciones_pase', { tipo: 'opciones', paso: 'opciones', id: objElegido.id, n: objElegido.opciones.length })}
            onSubtitulo={(desde, hasta, texto) => {
              const r = agregarSubtitulo(dibujoRef.current, desde, hasta, texto)
              dibujoRef.current = r.dibujo; setHist((h) => aplicar(h, r.dibujo)); setElegido({ tipo: 'subtitulo', id: r.id })
              requestAnimationFrame(() => textoRef.current?.select())
            }}
            miEstilo={miEstilo}
            onGuardarEstilo={onGuardarEstilo ? async (entrada) => {
              if (!objElegido) return
              const r = await onGuardarEstilo(conEstilo(miEstilo, objElegido.tipo, entrada))
              const nombre = NOMBRE_TIPO[objElegido.tipo]
              setMensaje({ tipo: 'aviso', texto: entrada
                ? (r?.soloNavegador ? `«${nombre}»: estilo guardado solo en este navegador (no se pudo guardar en tu usuario; revisá la conexión).` : `«${nombre}»: estilo guardado en tu usuario. Los próximos salen así.`)
                : `«${nombre}» vuelve al estilo de siempre.` })
            } : null}
          />
        </div>
        <section className="dib-campo" aria-label="Pasos" data-guia="pasos">
          <h3>Pasos y subtítulos</h3>
          {dibujo.subtitulos.length === 0 && <p className="dib-ayuda">Sin pasos. Un paso es un tramo del clip con su texto abajo.</p>}
          <ol className="dib-pasos">
            {dibujo.subtitulos.map((s, i) => (
              <li key={s.id} className="dib-paso" data-elegido={elegido?.tipo === 'subtitulo' && elegido.id === s.id ? 'si' : undefined}>
                <button type="button" className="dib-boton" onClick={() => { setElegido({ tipo: 'subtitulo', id: s.id }); irA(s.desde) }}>
                  Paso {i + 1} · {tiempoPreciso(s.desde)} → {tiempoPreciso(s.hasta)}
                </button>
                <input type="text" aria-label={`Subtítulo del paso ${i + 1}`} maxLength={140} defaultValue={s.texto} key={`${s.id}-${s.texto}`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.texto) cambiar((d) => actualizarEnLista(d, 'subtitulos', s.id, { texto: v })) }} />
              </li>
            ))}
          </ol>
          <button type="button" className="dib-boton" onClick={nuevoPaso} disabled={vistaPrevia}>+ Paso desde acá (S)</button>
        </section>
      </aside>

      <LineaClip dibujo={dibujo} rango={rango} tiempo={tiempo} elegido={elegido} deshabilitada={vistaPrevia}
        onElegir={(sel, t) => { setElegido(sel); if (Number.isFinite(t)) irA(t) }} onIr={irA}
        onCambiar={(fn, empezado) => setHist((h) => (empezado ? reemplazar : aplicar)(h, fn(h.presente)))} />

      {ayudaPista && (
        <p id="dib-pista" role="tooltip" className="dib-pista-flotante" style={{ left: pista.left, top: pista.top }}>
          <strong>{ayudaPista.nombre} (tecla {ayudaPista.tecla})</strong>{ayudaPista.descripcion}
        </p>
      )}
      {guia && (
        <GuiaEditor key={guia} raizRef={raizRef} onTerminar={cerrarGuia} nombre={(GUIAS[guia] || GUIAS.editor).nombre} pasos={(GUIAS[guia] || GUIAS.editor).pasos} />
      )}
      {ventana === 'biblioteca' && biblioteca && (
        <GuardarJugada titulo={clip.titulo} dibujo={dibujo} rival={rival} videoId={clip.videoId} inicio={rango.inicio} biblioteca={biblioteca}
          onCerrar={() => { setVentana(null); requestAnimationFrame(() => raizRef.current?.focus()) }} />
      )}
      {ventana?.tipo === 'exportar' && (
        <PizarraExportar doc={ventana.doc} titulo={clip.titulo} indice={0} fotos={ventana.fotos} preferencias={{ estela: 'estela', flechas: false }}
          raiz={ventana.raiz} onPlaca={() => {}} onCerrar={() => { setVentana(null); requestAnimationFrame(() => raizRef.current?.focus()) }} />
      )}
    </div>
  )
}

function CampoTiempo({ etiqueta, valor, onCambiar, tiempo, rango }) {
  return (
    <div className="dib-campo">
      <span>{etiqueta}</span>
      <div className="dib-fila">
        <button type="button" className="dib-boton" aria-label={`${etiqueta}: 0,1 s antes`} onClick={() => onCambiar(moverTiempo(valor, -0.1, rango))}>−</button>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{tiempoPreciso(valor)}</strong>
        <button type="button" className="dib-boton" aria-label={`${etiqueta}: 0,1 s después`} onClick={() => onCambiar(moverTiempo(valor, 0.1, rango))}>+</button>
        <button type="button" className="dib-boton" onClick={() => onCambiar(tiempo)}>Ahora</button>
      </div>
    </div>
  )
}

function Propiedades({
  elegido, obj, dibujo, tiempo, rango, jugadoras, textoRef, onObjeto, onLista, onQuitarClave, onQuitarAjustes, onSeguirFicha, onDuplicar, onBorrar, onIr,
  calibrado = false, elemento = null, onReemplazar, onAgregarOpcion, onSubtitulo, miEstilo = null, onGuardarEstilo = null,
}) {
  if (elegido?.tipo === 'lento') {
    const l = (dibujo.lentos || []).find((x) => x.id === elegido.id)
    if (!l) return <h3>Elegí un dibujo</h3>
    return (
      <section className="dib-campo" aria-label="Cámara lenta">
        <h3>Cámara lenta</h3>
        <div className="dib-campo">
          <span>Velocidad</span>
          <div className="dib-segmento" role="group" aria-label="Velocidad de la cámara lenta">
            {VELOCIDADES_LENTAS.map((v) => <button key={v} type="button" aria-pressed={l.velocidad === v} onClick={() => onLista('lentos', l.id, { velocidad: v })}>{textoVelocidad(v)}</button>)}
          </div>
        </div>
        <CampoTiempo etiqueta="Empieza" valor={l.desde} tiempo={tiempo} rango={rango} onCambiar={(t) => onLista('lentos', l.id, { desde: Math.min(t, l.hasta - 0.2) })} />
        <CampoTiempo etiqueta="Termina" valor={l.hasta} tiempo={tiempo} rango={rango} onCambiar={(t) => onLista('lentos', l.id, { hasta: Math.max(t, l.desde + 0.2) })} />
        <p className="dib-ayuda">Este tramo se ve más lento en la Vista previa, en el video de Análisis y en las playlists.</p>
        <button type="button" className="dib-boton" onClick={onBorrar}>Borrar tramo</button>
      </section>
    )
  }
  if (elegido?.tipo === 'pausa') {
    const p = dibujo.pausas.find((x) => x.id === elegido.id)
    if (!p) return <h3>Elegí un dibujo</h3>
    return (
      <section className="dib-campo" aria-label="Pausa">
        <h3>Pausa</h3>
        <CampoTiempo etiqueta="Instante" valor={p.t} tiempo={tiempo} rango={rango} onCambiar={(t) => onLista('pausas', p.id, { t })} />
        <label className="dib-campo"><span>Duración (segundos)</span>
          <input type="number" min={PAUSA_MINIMA} max={PAUSA_MAXIMA} step={0.5} defaultValue={p.duracion} key={`${p.id}-${p.duracion}`}
            onBlur={(e) => { const v = Math.min(PAUSA_MAXIMA, Math.max(PAUSA_MINIMA, Number(e.target.value) || 3)); if (v !== p.duracion) onLista('pausas', p.id, { duracion: v }) }} />
        </label>
        <p className="dib-ayuda">El video se congela en este cuadro, muestra los dibujos de ese momento y sigue solo.</p>
        <div className="dib-fila">
          <button type="button" className="dib-boton" onClick={() => onIr(p.t)}>Ir a la pausa</button>
          <button type="button" className="dib-boton" onClick={onBorrar}>Borrar</button>
        </div>
      </section>
    )
  }
  if (elegido?.tipo === 'subtitulo') {
    const s = dibujo.subtitulos.find((x) => x.id === elegido.id)
    if (!s) return <h3>Elegí un dibujo</h3>
    return (
      <section className="dib-campo" aria-label="Paso">
        <h3>Paso con subtítulo</h3>
        <label className="dib-campo"><span>Texto</span>
          <input ref={textoRef} type="text" maxLength={140} defaultValue={s.texto} key={`${s.id}-${s.texto}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.texto) onLista('subtitulos', s.id, { texto: v }) }} />
        </label>
        <CampoTiempo etiqueta="Empieza" valor={s.desde} tiempo={tiempo} rango={rango} onCambiar={(t) => onLista('subtitulos', s.id, { desde: Math.min(t, s.hasta - 0.1) })} />
        <CampoTiempo etiqueta="Termina" valor={s.hasta} tiempo={tiempo} rango={rango} onCambiar={(t) => onLista('subtitulos', s.id, { hasta: Math.max(t, s.desde + 0.1) })} />
        <button type="button" className="dib-boton" onClick={onBorrar}>Borrar paso</button>
      </section>
    )
  }
  if (!obj) {
    return (
      <section className="dib-campo">
        <h3>Propiedades</h3>
        <p className="dib-ayuda">Elegí un dibujo (en el video o en la línea de abajo) para cambiar su color, grosor y cuándo aparece.</p>
      </section>
    )
  }
  const seguidos = dibujo.objetos.filter((o) => esSeguimiento(o.tipo))
  const nombreSeguido = (o) => `${NOMBRE_TIPO[o.tipo]}${o.jugadora?.dorsal ? ` #${o.jugadora.dorsal}` : ''} (${o.id})`
  const clave = obj.pista ? claveEn(obj.pista.claves, tiempo) : null
  return (
    <section className="dib-campo" aria-label="Propiedades del dibujo">
      <h3>{obj.tipo === 'linea_defensiva' && obj.rol === 'volantes' ? 'Línea de volantes' : NOMBRE_TIPO[obj.tipo]}</h3>
      {!['zoom', 'reflector', 'opciones_pase'].includes(obj.tipo) && (
        <div className="dib-campo">
          <span>Color</span>
          <div className="dib-colores" role="group" aria-label="Color">
            {COLORES_DIBUJO.map((c) => (
              <button key={c} type="button" className="dib-color" aria-pressed={obj.color === c} aria-label={NOMBRE_COLOR[c]} title={NOMBRE_COLOR[c]}
                style={{ background: COLOR[c] }} onClick={() => onObjeto({ color: c })} />
            ))}
          </div>
        </div>
      )}
      {!['zoom', 'foco', 'reflector'].includes(obj.tipo) && (
        <div className="dib-campo">
          <span>Grosor</span>
          <div className="dib-segmento" role="group" aria-label="Grosor">
            {[1, 2, 3].map((g) => <button key={g} type="button" aria-pressed={obj.grosor === g} onClick={() => onObjeto({ grosor: g })}>{NOMBRE_GROSOR[g]}</button>)}
          </div>
        </div>
      )}
      {obj.tipo === 'texto' && (
        <label className="dib-campo"><span>Texto</span>
          <input ref={textoRef} type="text" maxLength={140} defaultValue={obj.texto} key={`${obj.id}-${obj.texto}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== obj.texto) onObjeto({ texto: v }) }} />
        </label>
      )}
      {obj.tipo === 'nombre' && <ElegirJugadora jugadora={obj.jugadora} jugadoras={jugadoras} onCambiar={(jugadora) => onObjeto({ jugadora })} />}
      <PropiedadesPro obj={obj} dibujo={dibujo} tiempo={tiempo} rango={rango} calibrado={calibrado} elemento={elemento}
        onObjeto={onObjeto} onReemplazar={onReemplazar} onAgregarOpcion={onAgregarOpcion} onSubtitulo={onSubtitulo} />
      {(obj.tipo === 'anillo' || obj.tipo === 'foco' || obj.tipo === 'reflector' || obj.tipo === 'ficha') && <>
        <ElegirJugadora titulo="¿Quién es? (para la pizarra 2D)" jugadora={obj.jugadora} jugadoras={jugadoras} onCambiar={(jugadora) => onObjeto({ jugadora })} />
        {obj.tipo !== 'ficha' && (
          <label className="dib-check">
            <input type="checkbox" checked={obj.en2d !== false} onChange={(e) => onObjeto({ en2d: e.target.checked ? undefined : false })} />
            Mostrar en la pizarra 2D
          </label>
        )}
      </>}
      {obj.tipo === 'ficha' && <>
        <p className="dib-ayuda">Jugadora marcada en el cuadro {tiempoPreciso(obj.t)}: en la 2D queda quieta en ese lugar.</p>
        <button type="button" className="dib-boton dib-principal" onClick={() => onSeguirFicha(obj.id)}>Seguir a esta jugadora</button>
        <button type="button" className="dib-boton" onClick={() => onIr(obj.t)}>Ir a ese cuadro</button>
      </>}
      {obj.ajustes2d?.length > 0 && (
        <button type="button" className="dib-boton" onClick={onQuitarAjustes}>Quitar las correcciones de la 2D ({obj.ajustes2d.length})</button>
      )}
      {obj.tipo === 'enlace' && ['a', 'b'].map((lado) => (
        <label key={lado} className="dib-campo"><span>{lado === 'a' ? 'Jugadora 1' : 'Jugadora 2'}</span>
          <select value={obj[lado]} onChange={(e) => onObjeto({ [lado]: e.target.value })}>
            {seguidos.map((o) => <option key={o.id} value={o.id}>{nombreSeguido(o)}</option>)}
          </select>
        </label>
      ))}
      {obj.tipo === 'zoom' && <>
        <label className="dib-campo"><span>Cuánto acerca: {obj.escala.toFixed(1).replace('.', ',')}x</span>
          <input type="range" min={ZOOM_MINIMO} max={ZOOM_MAXIMO} step={0.1} value={obj.escala} onChange={(e) => onObjeto({ escala: Number(e.target.value) })} />
        </label>
        <label className="dib-campo"><span>Hacia dónde</span>
          <select value={obj.seguir || ''} onChange={(e) => onObjeto({ seguir: e.target.value || null })}>
            <option value="">Punto fijo (el que tocaste)</option>
            {seguidos.map((o) => <option key={o.id} value={o.id}>Seguir a {nombreSeguido(o)}</option>)}
          </select>
        </label>
      </>}
      {obj.pista && <>
        <fieldset className="dib-campo" style={{ border: 0, margin: 0, padding: 0 }}>
          <span>Efectos</span>
          {[['entrada', 'Entrada con rebote'], ['pulso', 'Pulso suave'], ['sombra', 'Sombra'], ['rastro', 'Rastro (estela del recorrido)']].map(([k, texto]) => (
            <label key={k} className="dib-check">
              <input type="checkbox" checked={Boolean(obj.efectos?.[k])} onChange={(e) => onObjeto({ efectos: { ...obj.efectos, [k]: e.target.checked } })} />
              {texto}
            </label>
          ))}
        </fieldset>
        <p className="dib-ayuda">{obj.pista.claves.length} puntos clave{obj.pista.fuente !== 'manual' ? ` (de ${obj.pista.fuente})` : ''}. Con esta herramienta elegida, cada toque sobre la jugadora agrega uno en el cuadro actual.</p>
        {clave && obj.pista.claves.length > 1 && <button type="button" className="dib-boton" onClick={onQuitarClave}>Quitar el punto clave de este cuadro</button>}
      </>}
      <CampoTiempo etiqueta="Aparece" valor={obj.desde} tiempo={tiempo} rango={rango} onCambiar={(t) => onObjeto({ desde: Math.min(t, obj.hasta - 0.1) })} />
      <CampoTiempo etiqueta="Desaparece" valor={obj.hasta} tiempo={tiempo} rango={rango} onCambiar={(t) => onObjeto({ hasta: Math.max(t, obj.desde + 0.1) })} />
      {onGuardarEstilo && !['ficha', 'zoom'].includes(obj.tipo) && (
        <div className="dib-fila" data-guia="estilo">
          <button type="button" className="dib-boton" title="Los próximos dibujos de esta herramienta salen con este color, grosor y efectos"
            onClick={() => onGuardarEstilo(estiloDeObjeto(obj))}>Guardar como mi estilo</button>
          {miEstilo?.[obj.tipo] && <button type="button" className="dib-boton" onClick={() => onGuardarEstilo(null)}>Volver al estilo de siempre</button>}
        </div>
      )}
      <div className="dib-fila">
        {!['enlace', 'zona_lineas', 'linea_defensiva'].includes(obj.tipo) && <button type="button" className="dib-boton" onClick={onDuplicar}>Duplicar (Ctrl+D)</button>}
        <button type="button" className="dib-boton" onClick={onBorrar}>Borrar (Supr)</button>
      </div>
    </section>
  )
}

// Propiedades de lo nuevo (docs/analisis-dibujos-pro.md): crecimiento de las flechas, hueco del anillo, luz del
// reflector, foco en una zona, zonas que se mueven (texto, efectos, metros), opciones de pase y línea defensiva.
function PropiedadesPro({ obj, dibujo, tiempo, rango, calibrado, elemento, onObjeto, onReemplazar, onAgregarOpcion, onSubtitulo }) {
  const porId = new Map(dibujo.objetos.map((o) => [o.id, o]))
  const nombreDe = (id) => { const o = porId.get(id); return o ? `${NOMBRE_TIPO[o.tipo]}${o.jugadora?.dorsal ? ` #${o.jugadora.dorsal}` : ''}` : id }
  const check = (texto, valor, onCambiar, extra = {}) => (
    <label className="dib-check"><input type="checkbox" checked={Boolean(valor)} onChange={(e) => onCambiar(e.target.checked)} {...extra} />{texto}</label>
  )
  const zona = ['zona', 'poligono', 'zona_lineas'].includes(obj.tipo)
  return <>
    {FLECHAS_QUE_CRECEN.includes(obj.tipo) && (
      <div className="dib-campo" data-propiedad="crecer">
        <span>Cómo aparece</span>
        <select aria-label="Cómo aparece la flecha" value={obj.crecer?.modo || 'entera'} onChange={(e) => {
          const modo = e.target.value
          if (modo === 'entera') return onObjeto({ crecer: undefined })
          const c = { modo, pelota: Boolean(obj.crecer?.pelota) }
          if (modo === 'real') { c.salida = obj.crecer?.salida ?? obj.desde; c.llegada = obj.crecer?.llegada ?? Math.min(rango.fin, obj.desde + 0.8) }
          onObjeto({ crecer: c })
        }}>
          {Object.entries(NOMBRE_MODO).map(([k, v]) => <option key={k} value={k}>{k === 'entera' ? 'Entera (sin crecer)' : `Crece: ${v.toLowerCase()}`}</option>)}
        </select>
        {obj.crecer?.modo === 'real' && <>
          <CampoTiempo etiqueta="Sale la pelota" valor={obj.crecer.salida} tiempo={tiempo} rango={rango} onCambiar={(t) => onObjeto({ crecer: { ...obj.crecer, salida: Math.min(t, obj.crecer.llegada - 0.1) } })} />
          <CampoTiempo etiqueta="Llega la pelota" valor={obj.crecer.llegada} tiempo={tiempo} rango={rango} onCambiar={(t) => onObjeto({ crecer: { ...obj.crecer, llegada: Math.max(t, obj.crecer.salida + 0.1) } })} />
          <p className="dib-ayuda">Mové el video al momento en que sale la pelota y tocá «Ahora»; lo mismo cuando llega.</p>
        </>}
        {obj.crecer && check('Pelotita que recorre la flecha', obj.crecer.pelota, (v) => onObjeto({ crecer: { ...obj.crecer, pelota: v } }))}
      </div>
    )}
    {(obj.tipo === 'anillo' || obj.tipo === 'opciones_pase') && (
      <div className="dib-campo" data-propiedad="hueco">
        {check(obj.tipo === 'anillo' ? 'Detrás de las piernas (hueco atrás)' : 'Anillos detrás de las piernas', obj.hueco !== false, (v) => onObjeto({ hueco: v ? undefined : false }))}
        {obj.hueco !== false && <>
          <label className="dib-campo"><span>Ancho del hueco: {typeof obj.hueco === 'number' ? `${Math.round(obj.hueco * 100)} %` : 'automático'}</span>
            <input type="range" min={HUECO.minimo} max={HUECO.maximo} step={0.02} value={typeof obj.hueco === 'number' ? obj.hueco : HUECO.auto}
              onChange={(e) => onObjeto({ hueco: Number(e.target.value) })} />
          </label>
          {typeof obj.hueco === 'number' && <button type="button" className="dib-boton" onClick={() => onObjeto({ hueco: undefined })}>Automático</button>}
        </>}
      </div>
    )}
    {obj.tipo === 'reflector' && (() => {
      const luz = obj.luz || { color: 'blanco', intensidad: 0.6, ancho: 1 }
      return (
        <div className="dib-campo" data-propiedad="luz">
          <span>Color de la luz</span>
          <div className="dib-colores" role="group" aria-label="Color de la luz">
            {COLORES_DIBUJO.map((c) => (
              <button key={c} type="button" className="dib-color" aria-pressed={luz.color === c} aria-label={NOMBRE_COLOR[c]} title={NOMBRE_COLOR[c]}
                style={{ background: COLOR[c] }} onClick={() => onObjeto({ color: c, luz: { ...luz, color: c } })} />
            ))}
          </div>
          <label className="dib-campo"><span>Intensidad: {Math.round(luz.intensidad * 100)} %</span>
            <input type="range" min={0.2} max={1} step={0.05} value={luz.intensidad} onChange={(e) => onObjeto({ luz: { ...luz, intensidad: Number(e.target.value) } })} />
          </label>
          <label className="dib-campo"><span>Ancho del haz: {luz.ancho.toFixed(1).replace('.', ',')}x</span>
            <input type="range" min={0.5} max={2} step={0.1} value={luz.ancho} onChange={(e) => onObjeto({ luz: { ...luz, ancho: Number(e.target.value) } })} />
          </label>
        </div>
      )
    })()}
    {obj.tipo === 'foco_zona' && (
      <div className="dib-campo" data-propiedad="foco-zona">
        <span>Forma</span>
        <div className="dib-segmento" role="group" aria-label="Forma del foco">
          {[['circulo', 'Círculo'], ['elipse', 'Elipse'], ['rectangulo', 'Rectángulo']].map(([f, texto]) => (
            <button key={f} type="button" aria-pressed={obj.forma === f}
              onClick={() => onObjeto((o) => ({ forma: f, claves: f === 'circulo' ? o.claves.map((c) => ({ ...c, ry: ryCirculo(c.rx) })) : o.claves }))}>{texto}</button>
          ))}
        </div>
        {check('Se mueve con puntos clave', obj.animado || obj.claves.length > 1, (v) => onReemplazar((o) => {
          if (v) return { ...o, animado: true }
          const c = focoZonaEn(o, tiempo)
          const { animado, ...resto } = o
          void animado
          return { ...resto, claves: [{ ...c, t: o.claves[0].t }] }
        }))}
        <p className="dib-ayuda">{obj.animado || obj.claves.length > 1
          ? `${obj.claves.length} posiciones guardadas. Andá a otro cuadro y arrastrá el foco (o su borde) para que se mueva hasta ahí.`
          : 'Queda quieto. Arrastralo para moverlo y tirá del punto de la esquina para agrandarlo.'}</p>
      </div>
    )}
    {zona && (
      <div className="dib-campo" data-propiedad="zona">
        {obj.tipo !== 'zona_lineas' && <>
          {check('Se mueve con puntos clave', obj.claves?.length, (v) => onReemplazar((o) => animarZona(o, v, tiempo)))}
          {obj.claves?.length > 0 && <p className="dib-ayuda">{obj.claves.length} {obj.claves.length === 1 ? 'forma guardada' : 'formas guardadas'}. Andá a otro cuadro y arrastrá la zona o sus esquinas: entre medio se acomoda sola.</p>}
        </>}
        {obj.tipo === 'zona_lineas' && (
          <p className="dib-ayuda">Primera línea: {obj.lineaA.map(nombreDe).join(', ')}. Otra línea: {obj.lineaB.map(nombreDe).join(', ')}. La zona se arma sola con ellas.</p>
        )}
        <label className="dib-campo"><span>Texto adentro (opcional)</span>
          <input type="text" maxLength={60} placeholder="Por ejemplo: Distancia entre líneas" defaultValue={obj.texto || ''} key={`${obj.id}-t-${obj.texto || ''}`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (obj.texto || '')) onObjeto({ texto: v || undefined }) }} />
        </label>
        <fieldset className="dib-campo" style={{ border: 0, margin: 0, padding: 0 }}>
          <span>Efectos</span>
          {[['despliegue', 'Aparece desplegándose'], ['rayado', 'Rayado'], ['pulso', 'Pulso suave']].map(([k, texto]) => (
            <div key={k}>{check(texto, obj.efectos?.[k], (v) => onObjeto({ efectos: { despliegue: false, rayado: false, pulso: false, ...obj.efectos, [k]: v } }))}</div>
          ))}
        </fieldset>
        {check('Mostrar ancho y profundidad en metros', obj.medidas, (v) => onObjeto({ medidas: v || undefined }), { disabled: !calibrado && !obj.medidas })}
        {!calibrado && <p className="dib-ayuda">Los metros aparecen cuando la cancha está calibrada (Pizarra 2D → Calibrar cancha).</p>}
      </div>
    )}
    {obj.tipo === 'opciones_pase' && (
      <div className="dib-campo" data-propiedad="opciones">
        <p className="dib-ayuda">Pase que se hizo: {nombreJugadora(obj.pasadora?.jugadora) || 'pasadora'} → {nombreJugadora(obj.receptora?.jugadora) || 'receptora'} (en rojo).</p>
        <ol className="dib-lista-opciones">
          {obj.opciones.map((op, i) => (
            <li key={i}>
              <span>Opción {i + 1}{op.jugadora ? `: ${nombreJugadora(op.jugadora)}` : op.seguir ? `: ${nombreDe(op.seguir)}` : ''}</span>
              <button type="button" className="dib-boton" onClick={() => onObjeto({ opciones: obj.opciones.filter((_, k) => k !== i) })}>Quitar</button>
            </li>
          ))}
        </ol>
        <button type="button" className="dib-boton" disabled={obj.opciones.length >= 5} onClick={onAgregarOpcion}>+ Agregar opción</button>
        {check('De a una: primero el pase y después cada opción', obj.secuencia, (v) => onObjeto({ secuencia: v }))}
        <p className="dib-ayuda">Poné una Pausa (P) en el cuadro donde aparece para que se vea con el video quieto.</p>
        <button type="button" className="dib-boton" onClick={() => onSubtitulo(obj.desde, obj.hasta, 'Tenía una opción mejor')}>+ Subtítulo para explicarlo</button>
      </div>
    )}
    {obj.tipo === 'linea_defensiva' && (
      <div className="dib-campo" data-propiedad="linea">
        <div className="dib-segmento" role="group" aria-label="Qué línea es">
          <button type="button" aria-pressed={obj.rol !== 'volantes'} onClick={() => onObjeto({ rol: 'defensa' })}>Defensa</button>
          <button type="button" aria-pressed={obj.rol === 'volantes'} onClick={() => onObjeto({ rol: 'volantes' })}>Volantes</button>
        </div>
        <span>Defienden el arco de la</span>
        <div className="dib-segmento" role="group" aria-label="Qué arco defienden">
          <button type="button" aria-pressed={obj.arco !== 'derecha'} onClick={() => onObjeto({ arco: 'izquierda' })}>Izquierda</button>
          <button type="button" aria-pressed={obj.arco === 'derecha'} onClick={() => onObjeto({ arco: 'derecha' })}>Derecha</button>
        </div>
        {calibrado ? <>
          <label className="dib-campo"><span>Adelantada a partir de: {String(obj.umbral ?? 2).replace('.', ',')} m</span>
            <input type="range" min={UMBRAL.minimo} max={UMBRAL.maximo} step={0.5} value={obj.umbral ?? 2} onChange={(e) => onObjeto({ umbral: Number(e.target.value) })} />
          </label>
          <ul className="dib-lista-opciones" aria-label="Cómo está cada una en este cuadro">
            {(elemento?.linea?.puntos || []).map((x) => (
              <li key={x.id} data-estado={x.estado}><span>{nombreDe(x.id)}</span><strong>{NOMBRE_ESTADO[x.estado]}{Number.isFinite(x.d) && x.estado !== 'en_linea' ? ` (${x.d > 0 ? '+' : ''}${x.d.toFixed(1).replace('.', ',')} m)` : ''}</strong></li>
            ))}
          </ul>
          <p className="dib-ayuda">Con la cancha calibrada la app calcula en metros quién está en línea, adelantada o atrás, y si alguien cubre el espacio que deja una adelantada.</p>
        </> : <>
          <p className="dib-ayuda">La cancha no está calibrada: marcá a mano cómo está cada una.</p>
          <ul className="dib-lista-opciones">
            {obj.jugadoras.map((id) => {
              const estado = obj.estados?.[id] || 'en_linea'
              return (
                <li key={id}>
                  <span>{nombreDe(id)}</span>
                  <select aria-label={`Estado de ${nombreDe(id)}`} value={estado} onChange={(e) => {
                    const estados = { ...obj.estados }
                    if (e.target.value === 'en_linea') delete estados[id]; else estados[id] = e.target.value
                    onObjeto({ estados })
                  }}>
                    {Object.entries(NOMBRE_ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {estado === 'adelantada' && check('Alguien cubre el espacio', obj.cubiertas?.[id], (v) => {
                    const cubiertas = { ...obj.cubiertas }
                    if (v) cubiertas[id] = true; else delete cubiertas[id]
                    onObjeto({ cubiertas })
                  })}
                </li>
              )
            })}
          </ul>
        </>}
      </div>
    )}
  </>
}

function ElegirJugadora({ jugadora, jugadoras, onCambiar, titulo = 'Jugadora' }) {
  const rival = Boolean(jugadora?.rival)
  const elegida = !rival ? jugadoras.find((j) => j.id === jugadora?.id) : null
  return (
    <div className="dib-campo">
      <span>{titulo}</span>
      <div className="dib-segmento" role="group" aria-label="De qué equipo">
        <button type="button" aria-pressed={!rival} disabled={!jugadoras.length} onClick={() => { const j = jugadoras[0]; if (j) onCambiar({ id: j.id, nombre: j.nombre, dorsal: j.dorsal, foto: j.foto }) }}>Nuestra</button>
        <button type="button" aria-pressed={rival} onClick={() => onCambiar({ rival: true, dorsal: jugadora?.rival ? jugadora.dorsal : '', nombre: '' })}>Rival</button>
      </div>
      {!rival ? (
        <div className="dib-fila">
          {elegida?.foto && <img className="dib-foto" src={elegida.foto} alt="" />}
          <select aria-label="Jugadora del plantel" value={jugadora?.id || ''} onChange={(e) => {
            const j = jugadoras.find((x) => x.id === e.target.value)
            if (j) onCambiar({ id: j.id, nombre: j.nombre, dorsal: j.dorsal, foto: j.foto })
          }}>
            {!elegida && <option value="">Sin elegir</option>}
            {jugadoras.map((j) => <option key={j.id} value={j.id}>{j.dorsal ? `${j.dorsal} · ` : ''}{j.nombre}</option>)}
          </select>
        </div>
      ) : (
        <div className="dib-fila">
          <label className="dib-campo" style={{ flex: '0 0 5rem' }}><span>Dorsal</span>
            <input type="text" inputMode="numeric" maxLength={3} defaultValue={jugadora?.dorsal || ''} key={`d-${jugadora?.dorsal}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (jugadora?.dorsal || '')) onCambiar({ ...jugadora, rival: true, dorsal: v }) }} />
          </label>
          <label className="dib-campo" style={{ flex: '1 1 8rem' }}><span>Nombre (opcional)</span>
            <input type="text" maxLength={40} defaultValue={jugadora?.nombre || ''} key={`n-${jugadora?.nombre}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (jugadora?.nombre || '')) onCambiar({ ...jugadora, rival: true, nombre: v }) }} />
          </label>
        </div>
      )}
    </div>
  )
}

// Línea de tiempo del clip: pausas, pasos y una fila por objeto (cuándo se ve, con sus puntos clave como rombos).
function LineaClip({ dibujo, rango, tiempo, elegido, deshabilitada, onElegir, onIr, onCambiar }) {
  const arrastre = useRef(null)
  const largo = Math.max(0.1, rango.fin - rango.inicio)
  const pos = (t) => `${Math.min(100, Math.max(0, ((t - rango.inicio) / largo) * 100))}%`
  const tiempoDe = (e, pista) => {
    const caja = pista.getBoundingClientRect()
    return Math.round((rango.inicio + Math.min(1, Math.max(0, (e.clientX - caja.left) / Math.max(1, caja.width))) * largo) * 10) / 10
  }
  const es = (tipo, id) => elegido?.tipo === tipo && elegido.id === id
  const [abiertas, setAbiertas] = useState(false)
  const fichas = dibujo.objetos.filter((o) => o.tipo === 'ficha')
  // Plegada, igual se ve la fila de la ficha elegida (por ejemplo, tocándola en la 2D).
  const fichasAbiertas = abiertas
  const filasFichas = abiertas ? fichas : fichas.filter((o) => es('objeto', o.id))

  function empezar(e, fn) {
    if (deshabilitada) return
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nada */ }
    arrastre.current = { fn, pista: e.currentTarget.closest('.dib-pista'), empezado: false, x0: e.clientX }
  }
  function mover(e) {
    const a = arrastre.current
    if (!a || (!a.empezado && Math.abs(e.clientX - a.x0) < 3)) return
    const t = tiempoDe(e, a.pista)
    onCambiar((d) => a.fn(d, t), a.empezado)
    a.empezado = true
  }
  const soltar = () => { const a = arrastre.current; arrastre.current = null; return a?.empezado }

  const pista = (etiqueta, contenido) => (
    <div className="dib-pista" role="presentation" aria-label={etiqueta} onClick={(e) => { if (!deshabilitada && !e.defaultPrevented) onIr(tiempoDe(e, e.currentTarget)) }}
      onPointerMove={mover} onPointerUp={soltar}>
      {contenido}<span className="dib-cursor" style={{ left: pos(tiempo) }} />
    </div>
  )

  const filaObjeto = (o, dentro = false) => (
    <div key={o.id} className="dib-linea-fila" data-dentro={dentro ? 'si' : undefined}>
      <button type="button" className="dib-linea-etiqueta" aria-pressed={es('objeto', o.id)} onClick={() => onElegir({ tipo: 'objeto', id: o.id })}>
        <span aria-hidden="true" style={{ color: COLOR[o.color] }}>●</span> {NOMBRE_TIPO[o.tipo]}{o.jugadora?.dorsal ? ` #${o.jugadora.dorsal}` : ''}
      </button>
      {pista(NOMBRE_TIPO[o.tipo], <>
        <span className="dib-barra" data-elegido={es('objeto', o.id) ? 'si' : undefined}
          style={{ left: pos(o.desde), width: `calc(${pos(o.hasta)} - ${pos(o.desde)})` }}
          onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'objeto', id: o.id }) }}>
          <span className="dib-borde" data-lado="inicio" onPointerDown={(e) => empezar(e, (d, t) => actualizarObjeto(d, o.id, { desde: Math.min(t, o.hasta - 0.1) }))} />
          <span className="dib-borde" data-lado="fin" onPointerDown={(e) => empezar(e, (d, t) => actualizarObjeto(d, o.id, { hasta: Math.max(t, o.desde + 0.1) }))} />
        </span>
        {o.pista?.claves.map((c) => (
          <button key={c.t} type="button" className="dib-rombo" style={{ left: pos(c.t), minHeight: 0 }} aria-label={`Punto clave en ${tiempoPreciso(c.t)}`}
            onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'objeto', id: o.id }, c.t) }} />
        ))}
      </>)}
    </div>
  )

  return (
    <section className="dib-linea" aria-label="Línea de tiempo del clip" data-guia="linea">
      <div className="dib-linea-fila">
        <span className="dib-linea-etiqueta">Pausas</span>
        {pista('Pausas', <>
          {dibujo.pausas.map((p) => (
            <button key={p.id} type="button" className="dib-rombo" data-tipo="pausa" style={{ left: pos(p.t), minHeight: 0 }}
              aria-label={`Pausa de ${p.duracion} s en ${tiempoPreciso(p.t)}`} aria-pressed={es('pausa', p.id)}
              onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'pausa', id: p.id }, p.t) }}
              onPointerDown={(e) => empezar(e, (d, t) => actualizarEnLista(d, 'pausas', p.id, { t }))} />
          ))}
        </>)}
      </div>
      <div className="dib-linea-fila">
        <span className="dib-linea-etiqueta">Pasos</span>
        {pista('Pasos', <>
          {dibujo.subtitulos.map((s) => (
            <button key={s.id} type="button" className="dib-sub" data-elegido={es('subtitulo', s.id) ? 'si' : undefined}
              style={{ left: pos(s.desde), width: `calc(${pos(s.hasta)} - ${pos(s.desde)})`, minHeight: 0 }}
              onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'subtitulo', id: s.id }, s.desde) }}>
              {s.texto}
              <span className="dib-borde" data-lado="inicio" onPointerDown={(e) => empezar(e, (d, t) => actualizarEnLista(d, 'subtitulos', s.id, { desde: Math.min(t, s.hasta - 0.1) }))} />
              <span className="dib-borde" data-lado="fin" onPointerDown={(e) => empezar(e, (d, t) => actualizarEnLista(d, 'subtitulos', s.id, { hasta: Math.max(t, s.desde + 0.1) }))} />
            </button>
          ))}
        </>)}
      </div>
      {dibujo.lentos?.length > 0 && (
        <div className="dib-linea-fila" data-grupo="lentos">
          <span className="dib-linea-etiqueta">Cámara lenta</span>
          {pista('Cámara lenta', <>
            {dibujo.lentos.map((l) => (
              <button key={l.id} type="button" className="dib-sub dib-lento-barra" data-elegido={es('lento', l.id) ? 'si' : undefined}
                style={{ left: pos(l.desde), width: `calc(${pos(l.hasta)} - ${pos(l.desde)})`, minHeight: 0 }}
                aria-label={`Cámara lenta ${textoVelocidad(l.velocidad)} de ${tiempoPreciso(l.desde)} a ${tiempoPreciso(l.hasta)}`}
                onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'lento', id: l.id }, l.desde) }}>
                {textoVelocidad(l.velocidad)}
                <span className="dib-borde" data-lado="inicio" onPointerDown={(e) => empezar(e, (d, t) => actualizarEnLista(d, 'lentos', l.id, { desde: Math.min(t, l.hasta - 0.2) }))} />
                <span className="dib-borde" data-lado="fin" onPointerDown={(e) => empezar(e, (d, t) => actualizarEnLista(d, 'lentos', l.id, { hasta: Math.max(t, l.desde + 0.2) }))} />
              </button>
            ))}
          </>)}
        </div>
      )}
      {dibujo.objetos.filter((o) => o.tipo !== 'ficha').map((o) => filaObjeto(o))}
      {fichas.length > 0 && <>
        {/* Las fichas quietas («solo 2D») van juntas en una fila que se despliega. */}
        <div className="dib-linea-fila" data-grupo="fichas">
          <button type="button" className="dib-linea-etiqueta" aria-expanded={fichasAbiertas} onClick={() => setAbiertas((v) => !v)}>
            {fichasAbiertas ? '▾' : '▸'} Fichas quietas ({fichas.length})
          </button>
          {pista('Fichas quietas', fichas.map((o) => (
            <button key={o.id} type="button" className="dib-rombo" data-tipo="ficha" style={{ left: pos(o.t), minHeight: 0 }} aria-pressed={es('objeto', o.id)}
              aria-label={`Ficha${o.jugadora?.dorsal ? ` #${o.jugadora.dorsal}` : ''} agregada en ${tiempoPreciso(o.t)}`}
              onClick={(e) => { e.stopPropagation(); onElegir({ tipo: 'objeto', id: o.id }) }} />
          )))}
        </div>
        {filasFichas.map((o) => filaObjeto(o, true))}
      </>}
      {dibujo.objetos.length === 0 && <p className="dib-ayuda">Todavía no hay dibujos. Elegí una herramienta a la izquierda y dibujá sobre el video.</p>}
    </section>
  )
}
