import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cargarYouTubeAPI } from '../../../utils/analisis/youtubeApi'
import { aRelativo, cuadroVideo, distancia, simplificarTrazo } from '../../../utils/analisis/dibujos/coordenadas'
import { escenaEn, transformZoom } from '../../../utils/analisis/dibujos/escena'
import { HERRAMIENTAS, moverTiempo, objetoEnPunto, ordenTeclaEditor, tiempoPreciso } from '../../../utils/analisis/dibujos/editor'
import { COLORES_DIBUJO, PAUSA_MAXIMA, PAUSA_MINIMA, ZOOM_MAXIMO, ZOOM_MINIMO, dibujoVacio, esSeguimiento, excedeTamano, normalizarDibujo } from '../../../utils/analisis/dibujos/formato'
import { aplicar, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, reemplazar, rehacer } from '../../../utils/analisis/dibujos/historial'
import { quitarClave, claveEn } from '../../../utils/analisis/dibujos/interpolacion'
import {
  NOMBRE_TIPO, actualizarEnLista, actualizarObjeto, agregarObjeto, agregarPausa, agregarSubtitulo, borrarDeLista, borrarObjeto,
  crearObjeto, duplicarObjeto, marcarPosicion, moverObjeto,
} from '../../../utils/analisis/dibujos/operaciones'
import { crearEstadoPausas, pasoPausas } from '../../../utils/analisis/dibujos/pausas'
import { crearRelojSuave } from '../../../utils/analisis/dibujos/reloj'
import {
  ACCIONES_RAPIDAS, CLAVE_GUIA_EDITOR, CLAVE_GUIA_SEGUIMIENTO, CLAVE_SALTO, GUIA_EDITOR, GUIA_SEGUIMIENTO, SALTOS, TEXTO_SEGUIMIENTO,
  ayudaHerramienta, claveAnterior, deshacerToque, guardarPreferencia, instruccion, leerPreferencia, saltoGuardado, siguienteCuadro,
} from '../../../utils/analisis/dibujos/guias'
import CapaDibujos from './CapaDibujos'
import GuiaEditor from './GuiaEditor'
import { COLOR, useMedidas } from './apoyo'
import './dibujo.css'

const DOS_PUNTOS = ['pase_bajo', 'pase_alto', 'linea', 'zona']
const NOMBRE_COLOR = { amarillo: 'Amarillo', blanco: 'Blanco', rojo: 'Rojo', azul: 'Azul' }
const NOMBRE_GROSOR = { 1: 'Fino', 2: 'Medio', 3: 'Grueso' }
// Herramientas que abren la guía de seguimiento la primera vez (las que siguen a una jugadora y la que las une).
const ABREN_GUIA_SEGUIMIENTO = ['anillo', 'foco', 'nombre', 'enlace']
const MANTENER_MS = 450

function leer(player) {
  try {
    return { t: Number(player.getCurrentTime?.()), reproduciendo: player.getPlayerState?.() === 1, velocidad: Number(player.getPlaybackRate?.()) || 1 }
  } catch { return null }
}

// Ventana de dibujo de un clip (pantalla completa). Solo coordinación y en la compu (lo decide quien la abre).
// clip: { eventoId, espejo, partidoId, videoId, inicio, fin, titulo }. jugadoras: [{ id, nombre, dorsal, foto }].
// onGuardar(dibujo) → Promise<{ error? }>. onCerrar().
export default function EditorDibujo({ clip, dibujoInicial = null, aviso: avisoInicial = '', jugadoras = [], onGuardar, onCerrar }) {
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
  const escena = useMemo(() => escenaEn(dibujo, tiempo, { elegidoId: vistaPrevia ? null : objElegido?.id, animar: vistaPrevia }), [dibujo, tiempo, vistaPrevia, objElegido?.id])

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
      setVistaPrevia(false); setPausaRestante(null)
      try { player.pauseVideo() } catch { /* nada */ }
      return
    }
    setBorrador(null); setEnlacePendiente(null)
    vistaRef.current = { activa: true, reinicio: vistaRef.current.reinicio + 1 }
    setVistaPrevia(true)
    try { player.seekTo(rango.inicio, true); player.playVideo() } catch { /* nada */ }
  }, [rango])

  // ---------- Acciones ----------
  const crear = useCallback((tipo, extra = {}) => {
    const d = dibujoRef.current
    const obj = { ...crearObjeto(tipo, { t: tiempo, clip: rango, color: estilo.color, grosor: estilo.grosor, usados: d.objetos.map((o) => o.id), ...extra }), ...(extra.campos || {}) }
    const nuevo = agregarObjeto(d, obj)
    dibujoRef.current = nuevo
    setHist((h) => aplicar(h, nuevo))
    setElegido({ tipo: 'objeto', id: obj.id })
    return obj.id
  }, [tiempo, rango, estilo])

  const borrarElegido = useCallback(() => {
    if (!elegido) return
    if (elegido.tipo === 'objeto') cambiar((d) => borrarObjeto(d, elegido.id))
    else cambiar((d) => borrarDeLista(d, elegido.tipo === 'pausa' ? 'pausas' : 'subtitulos', elegido.id))
    setElegido(null)
  }, [elegido, cambiar])

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
  const elegirHerramienta = useCallback((id) => {
    setHerramienta(id); setBorrador(null); setEnlacePendiente(null); setPista(null)
    setSeguir(esSeguimiento(id) ? { tipo: id, id: objElegido?.tipo === id ? objElegido.id : null, marcas: [] } : null)
    if (ABREN_GUIA_SEGUIMIENTO.includes(id) && !leerPreferencia(CLAVE_GUIA_SEGUIMIENTO)) setGuia('seguimiento')
  }, [objElegido])

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
    setSeguir(null)
    setHerramienta('seleccionar')
    if (objSeguido) setElegido({ tipo: 'objeto', id: objSeguido.id })
    if (marcados > 0 && !vistaRef.current.activa) alternarVistaPrevia()
  }, [objSeguido, alternarVistaPrevia])

  const cambiarSalto = useCallback((valor) => {
    setSalto(valor)
    guardarPreferencia(CLAVE_SALTO, valor)
  }, [])

  const cerrarGuia = useCallback(() => {
    guardarPreferencia(guia === 'seguimiento' ? CLAVE_GUIA_SEGUIMIENTO : CLAVE_GUIA_EDITOR, 'si')
    setGuia(null)
    requestAnimationFrame(() => raizRef.current?.focus())
  }, [guia])

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
    deshacerAccion, seguir, terminarSeguimiento, elegirHerramienta])

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
    if (herramienta === 'seleccionar') {
      const el = objetoEnPunto(escena.elementos, p)
      if (!el) { setElegido(null); return }
      setElegido({ tipo: 'objeto', id: el.obj.id })
      arrastreRef.current = { modo: esSeguimiento(el.obj.tipo) ? 'clave' : 'mover', id: el.obj.id, ultimo: p, empezado: false }
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
      setSeguir((s) => ({ tipo: herramienta, id, marcas: [...(s?.id === id ? s.marcas : []), marca] }))
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
      setHist((h) => (a.empezado ? reemplazar : aplicar)(h, moverObjeto(h.presente, a.id, dx, dy)))
      arrastreRef.current = { ...a, ultimo: p, empezado: true }
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
      // Si no arrastró, queda esperando el segundo clic.
      if (distancia(p, q) > 0.012) { crear(borrador.tipo, { puntos: [p, q] }); setBorrador(null) }
      else setBorrador({ ...borrador, esperando: true })
    } else if (a.modo === 'trazo') {
      const puntos = simplificarTrazo(borrador.puntos)
      if (puntos.length >= 2 && distancia(puntos[0], puntos[puntos.length - 1]) > 0.01) crear('movimiento', { puntos })
      setBorrador(null)
    }
  }

  // Borrador visible (todavía no es parte del dibujo).
  const elBorrador = borrador && (borrador.puntos.length >= 2 || borrador.tipo === 'poligono')
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
  const textoInstruccion = instruccion({
    herramienta, borrador, enlacePendiente, vistaPrevia,
    fueraDeTiempo: objElegido && objElegido.tipo !== 'zoom' && (tiempo < objElegido.desde || tiempo > objElegido.hasta) ? objElegido : null,
  })

  return (
    <div ref={raizRef} className="dib-editor" role="dialog" aria-modal="true" aria-label={`Dibujar: ${clip.titulo}`} tabIndex={-1}>
      <header className="dib-cab">
        <h2>{clip.titulo}</h2>
        <div className="dib-segmento" role="group" aria-label="Modo de dibujo">
          <button type="button" aria-pressed="true">Video real</button>
          <button type="button" disabled title="Próximamente">Pizarra 2D · Próximamente</button>
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
            {(i === 1 || i === 8) && <span className="dib-separador" aria-hidden="true" />}
            <button type="button" className="dib-herramienta" aria-pressed={herramienta === h.id} disabled={vistaPrevia} data-herramienta={h.id}
              aria-label={`${h.texto} (tecla ${h.tecla})`} aria-keyshortcuts={h.tecla} {...eventosPista(h.id)}
              onClick={() => elegirHerramienta(h.id)}>
              <span aria-hidden="true">{h.icono}</span><kbd aria-hidden="true">{h.tecla}</kbd>
            </button>
          </div>
        ))}
        <span className="dib-separador" aria-hidden="true" />
        {ACCIONES_RAPIDAS.map((h) => (
          <button key={h.id} type="button" className="dib-herramienta" disabled={vistaPrevia} data-herramienta={h.id}
            aria-label={h.id === 'pausa' ? 'Agregar pausa en este cuadro (tecla P)' : 'Agregar paso con subtítulo desde este cuadro (tecla S)'}
            aria-keyshortcuts={h.tecla} {...eventosPista(h.id)} onClick={h.id === 'pausa' ? nuevaPausa : nuevoPaso}>
            <span aria-hidden="true">{h.icono}</span><kbd aria-hidden="true">{h.tecla}</kbd>
          </button>
        ))}
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
          <p className="dib-instruccion" aria-live="polite">{textoInstruccion}</p>
        )}
        <div className="dib-escenario" style={{ containerType: 'size' }}>
          <div ref={videoRef} className="dib-video" data-guia="video" style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))' }}>
            <div className="dib-zoom" style={zoomVista}>
              <div ref={zonaRef} className="dib-zoom dib-sin-interfaz" />
              <CapaDibujos escena={escena} ancho={ancho} alto={alto} cuadro={cuadro} elegidoId={vistaPrevia ? null : objElegido?.id} borrador={elBorrador} />
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
            onDuplicar={duplicar} onBorrar={borrarElegido} onIr={irA}
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
        <GuiaEditor key={guia} raizRef={raizRef} onTerminar={cerrarGuia}
          nombre={guia === 'seguimiento' ? 'Guía: seguir a una jugadora' : 'Guía del editor'}
          pasos={guia === 'seguimiento' ? GUIA_SEGUIMIENTO : GUIA_EDITOR} />
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

function Propiedades({ elegido, obj, dibujo, tiempo, rango, jugadoras, textoRef, onObjeto, onLista, onQuitarClave, onDuplicar, onBorrar, onIr }) {
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
      <h3>{NOMBRE_TIPO[obj.tipo]}</h3>
      {obj.tipo !== 'zoom' && (
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
      {!['zoom', 'foco'].includes(obj.tipo) && (
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
      <div className="dib-fila">
        {obj.tipo !== 'enlace' && <button type="button" className="dib-boton" onClick={onDuplicar}>Duplicar (Ctrl+D)</button>}
        <button type="button" className="dib-boton" onClick={onBorrar}>Borrar (Supr)</button>
      </div>
    </section>
  )
}

function ElegirJugadora({ jugadora, jugadoras, onCambiar }) {
  const rival = Boolean(jugadora?.rival)
  const elegida = !rival ? jugadoras.find((j) => j.id === jugadora?.id) : null
  return (
    <div className="dib-campo">
      <span>Jugadora</span>
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
      {dibujo.objetos.map((o) => (
        <div key={o.id} className="dib-linea-fila">
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
      ))}
      {dibujo.objetos.length === 0 && <p className="dib-ayuda">Todavía no hay dibujos. Elegí una herramienta a la izquierda y dibujá sobre el video.</p>}
    </section>
  )
}
