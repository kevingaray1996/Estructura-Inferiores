import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cargarYouTubeAPI } from '../../utils/analisis/youtubeApi'
import { formatearTiempo } from '../../utils/analisis/formato'
import { VELOCIDADES, alTerminarClip, indiceValido, llegoAlFin, ordenDeTecla, planDeClip, rotuloClip } from '../../utils/analisis/reproductorPlaylist'
import CapaReproduccion from './dibujo/CapaReproduccion'
import { useZoomContenedor } from './dibujo/apoyo'
import './playlists.css'

const CLAVE_PAUSA = 'analisis_playlist_pausa_final_v1'
const leerPausa = () => { try { return window.localStorage.getItem(CLAVE_PAUSA) === 'si' } catch { return false } }

// Reproductor de playlist: pantalla encima de todo. Reproduce los clips seguidos aunque sean de partidos distintos
// (cambia de video de YouTube solo). clips: ya preparados (videoId, inicio, fin, etiqueta, partido, minuto, nota).
// onGuardar(nombre): opcional («Guardar como playlist», solo coordinación). Devuelve { error } si falla.
// dibujos (etapa 4): { tiene, cargar } de useDibujos. Cada clip se ve con sus dibujos salvo que diga conDibujos: false.
export default function ReproductorPlaylist({ titulo, clips, indiceInicial = 0, onCerrar, onGuardar = null, dibujos = null }) {
  const contenedorRef = useRef(null)
  const zonaVideoRef = useRef(null)
  const playerRef = useRef(null)
  const videoCargadoRef = useRef('')
  const finManejadoRef = useRef(false)
  const cerrarRef = useRef(null)
  const [listo, setListo] = useState(false)
  const [errorVideo, setErrorVideo] = useState('')
  const [indice, setIndice] = useState(() => indiceValido(clips.length, indiceInicial))
  const [reproduciendo, setReproduciendo] = useState(false)
  const [repetir, setRepetir] = useState(false)
  const [pausaAlFinal, setPausaAlFinal] = useState(leerPausa)
  const [velocidad, setVelocidad] = useState(1)
  const [terminado, setTerminado] = useState(false)
  const [guardando, setGuardando] = useState(null) // null | { nombre, estado }
  const clip = clips[indice] || null
  const [zoomRef, aplicarZoom] = useZoomContenedor()
  const [dibujoClip, setDibujoClip] = useState(null) // { clave, dibujo }
  const conDibujo = (c) => Boolean(c && c.conDibujos !== false && dibujos?.tiene?.(c.eventoId, c.espejo))
  const quiereDibujo = conDibujo(clip)
  const obtenerPlayer = useCallback(() => playerRef.current, [])
  const rangoClip = useMemo(() => (clip ? { inicio: clip.inicio, fin: clip.fin } : null), [clip])
  // Lo que leen el reloj y las teclas (sin volver a crear el intervalo en cada cambio).
  const estadoRef = useRef({})
  useLayoutEffect(() => { estadoRef.current = { indice, total: clips.length, repetir, pausaAlFinal, clip, velocidad } })

  // Al abrir: foco en Cerrar; al cerrar: vuelve a donde estaba.
  useEffect(() => {
    const previo = document.activeElement
    cerrarRef.current?.focus()
    return () => { try { previo?.focus?.() } catch { /* El elemento puede no existir más. */ } }
  }, [])

  // Reproductor de YouTube, uno solo para toda la playlist.
  useEffect(() => {
    let vigente = true
    const destino = document.createElement('div')
    zonaVideoRef.current?.appendChild(destino)
    cargarYouTubeAPI().then((YT) => {
      if (!vigente) return
      playerRef.current = new YT.Player(destino, {
        width: '100%', height: '100%',
        // fs: 0 — la pantalla completa es la del reproductor entero, para que se sigan viendo los dibujos.
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, fs: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (vigente) setListo(true) },
          onStateChange: (e) => {
            if (!vigente) return
            setReproduciendo(e.data === YT.PlayerState.PLAYING)
            if (e.data === YT.PlayerState.PLAYING) {
              try { playerRef.current?.setPlaybackRate?.(estadoRef.current.velocidad) } catch { /* Sin velocidad. */ }
            }
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
  }, [])

  // Muestra el clip actual: carga otro video si cambió el partido; si es el mismo, solo salta.
  const mostrar = useCallback((c) => {
    const player = playerRef.current
    if (!player || !c) return
    finManejadoRef.current = false
    setTerminado(false)
    const plan = planDeClip(c, videoCargadoRef.current)
    if (plan.accion === 'sin_video') { setErrorVideo('Este clip es de un partido sin video de YouTube.'); try { player.pauseVideo?.() } catch { /* nada */ } return }
    setErrorVideo('')
    try {
      if (plan.accion === 'cargar') {
        player.loadVideoById({ videoId: plan.videoId, startSeconds: plan.inicio })
        videoCargadoRef.current = plan.videoId
      } else {
        player.seekTo(plan.inicio, true)
        player.playVideo()
      }
    } catch {
      setErrorVideo('No se pudo mover el video. Probá de nuevo.')
    }
  }, [])

  // Sincroniza el reproductor de YouTube (sistema externo) con el clip elegido.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (listo) mostrar(clip) }, [listo, clip, mostrar])

  // Dibujos del clip actual (se piden recién al llegar a ese clip).
  useEffect(() => {
    if (!quiereDibujo) return undefined
    let vigente = true
    const clave = clip.clave
    dibujos.cargar(clip.eventoId, clip.espejo).then((r) => { if (vigente) setDibujoClip({ clave, dibujo: r?.dibujo || null }) })
    return () => { vigente = false }
  }, [quiereDibujo, clip, dibujos])
  const dibujoActual = quiereDibujo && dibujoClip?.clave === clip?.clave ? dibujoClip.dibujo : null

  // Vigila el fin del clip.
  useEffect(() => {
    if (!listo) return undefined
    const reloj = window.setInterval(() => {
      const { clip: c, indice: i, total, repetir: rep, pausaAlFinal: pausa } = estadoRef.current
      const player = playerRef.current
      if (!c || !player || finManejadoRef.current) return
      let t
      try { t = player.getCurrentTime?.() } catch { return }
      if (!llegoAlFin(t, c)) return
      const r = alTerminarClip({ indice: i, total, repetir: rep, pausaAlFinal: pausa })
      if (r.tipo === 'repetir') { try { player.seekTo(c.inicio, true) } catch { /* nada */ } return }
      finManejadoRef.current = true
      if (r.tipo === 'siguiente') setIndice(r.indice)
      else { try { player.pauseVideo() } catch { /* nada */ } if (r.tipo === 'terminar') setTerminado(true) }
    }, 200)
    return () => window.clearInterval(reloj)
  }, [listo])

  const irA = useCallback((i) => {
    const destino = indiceValido(clips.length, i)
    if (destino === estadoRef.current.indice) mostrar(clips[destino])
    else setIndice(destino)
  }, [clips, mostrar])

  const pausar = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    try {
      if (reproduciendo) player.pauseVideo()
      else if (finManejadoRef.current || terminado) mostrar(clip)
      else player.playVideo()
    } catch { /* nada */ }
  }, [reproduciendo, terminado, clip, mostrar])

  const cambiarVelocidad = useCallback((v) => {
    setVelocidad(v)
    try { playerRef.current?.setPlaybackRate?.(v) } catch { /* nada */ }
  }, [])

  const cambiarPausa = useCallback(() => {
    setPausaAlFinal((p) => {
      try { window.localStorage.setItem(CLAVE_PAUSA, p ? 'no' : 'si') } catch { /* Sin preferencia guardada. */ }
      return !p
    })
  }, [])

  const pantallaCompleta = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()
      else contenedorRef.current?.requestFullscreen?.()
    } catch { /* El navegador no lo permite. */ }
  }, [])

  // Atajos de teclado.
  useEffect(() => {
    function tecla(e) {
      const orden = ordenDeTecla(e)
      if (!orden) return
      e.preventDefault()
      const { indice: i } = estadoRef.current
      if (orden === 'siguiente') irA(i + 1)
      else if (orden === 'anterior') irA(i - 1)
      else if (orden === 'pausa') pausar()
      else if (orden === 'repetir') setRepetir((r) => !r)
      else if (orden === 'pausaAlFinal') cambiarPausa()
      else if (orden === 'pantallaCompleta') pantallaCompleta()
      else if (orden === 'cerrar') { if (!document.fullscreenElement) onCerrar() }
      else if (orden.startsWith('velocidad:')) cambiarVelocidad(Number(orden.split(':')[1]))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [irA, pausar, cambiarPausa, pantallaCompleta, cambiarVelocidad, onCerrar])

  async function guardar(e) {
    e.preventDefault()
    if (!guardando?.nombre?.trim()) return
    setGuardando((g) => ({ ...g, estado: 'guardando' }))
    const r = await onGuardar(guardando.nombre.trim())
    setGuardando((g) => ({ ...g, estado: r?.error || 'Playlist guardada.' }))
  }

  return (
    <div ref={contenedorRef} className="rp" role="dialog" aria-modal="true" aria-label={`Reproductor: ${titulo}`}>
      <div className="rp-barra">
        <h2>{titulo}</h2>
        {onGuardar && !guardando && (
          <button type="button" className="et-boton" onClick={() => setGuardando({ nombre: titulo, estado: '' })}>Guardar como playlist</button>
        )}
        <button ref={cerrarRef} type="button" className="et-boton" onClick={onCerrar}>✕ Cerrar</button>
        {guardando && (
          <form className="rp-guardar" onSubmit={guardar} style={{ flexBasis: '100%' }}>
            <input aria-label="Nombre de la playlist" value={guardando.nombre} maxLength={80}
              onChange={(e) => setGuardando({ nombre: e.target.value, estado: '' })} />
            <button type="submit" className="pls-principal" disabled={guardando.estado === 'guardando' || !guardando.nombre.trim()}>
              {guardando.estado === 'guardando' ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="et-boton" onClick={() => setGuardando(null)}>Cancelar</button>
            {guardando.estado && guardando.estado !== 'guardando' && <span role="status">{guardando.estado}</span>}
          </form>
        )}
      </div>

      <div className="rp-cuerpo">
        <div className="rp-escena">
          {clip ? (
            <>
              <p className="rp-rotulo" aria-live="polite">
                {rotuloClip({ indice, total: clips.length, etiqueta: clip.etiqueta, partido: clip.partido, minuto: clip.minuto })}
              </p>
              <p className="rp-sub">
                {clip.equipoNombre ? `${clip.equipoNombre} · ` : ''}{formatearTiempo(clip.inicio)} a {formatearTiempo(clip.fin)}
                {clip.origen ? ' · visto desde el otro equipo' : ''}
              </p>
              {clip.nota && <p className="rp-nota">{clip.nota}</p>}
            </>
          ) : <p className="rp-rotulo">La playlist no tiene clips.</p>}

          <div className="rp-video">
            {/* En pausa se recorta la interfaz de YouTube (título, compartir, «Más videos»): los controles son los de abajo. */}
            <div ref={zoomRef} className={listo && !reproduciendo ? 'dib-zoom dib-sin-interfaz' : 'dib-zoom'}><div ref={zonaVideoRef} /></div>
            {dibujoActual && <CapaReproduccion obtenerPlayer={obtenerPlayer} dibujo={dibujoActual} rango={rangoClip} onZoom={aplicarZoom} />}
            {!listo && !errorVideo && <p className="rp-video-aviso">Cargando el video…</p>}
            {errorVideo && <p className="rp-video-aviso" role="alert">{errorVideo}</p>}
          </div>

          <div className="rp-controles" role="group" aria-label="Controles">
            <button type="button" className="et-boton" aria-label="Clip anterior" disabled={indice <= 0} onClick={() => irA(indice - 1)}>⏮</button>
            <button type="button" className="et-boton" aria-label={reproduciendo ? 'Pausa' : 'Reproducir'} disabled={!clip} onClick={pausar}>
              {reproduciendo ? '⏸' : '▶'}
            </button>
            <button type="button" className="et-boton" aria-label="Clip siguiente" disabled={indice >= clips.length - 1} onClick={() => irA(indice + 1)}>⏭</button>
            <button type="button" className="et-boton" aria-pressed={repetir} onClick={() => setRepetir((r) => !r)}>↻ Repetir clip</button>
            <button type="button" className="et-boton" aria-pressed={pausaAlFinal} onClick={cambiarPausa}>Pausa al final</button>
            <div className="az-segmento" role="group" aria-label="Velocidad">
              {VELOCIDADES.map((v) => (
                <button key={v} type="button" aria-pressed={velocidad === v} onClick={() => cambiarVelocidad(v)}>{String(v).replace('.', ',')}x</button>
              ))}
            </div>
            <button type="button" className="et-boton" aria-label="Pantalla completa" onClick={pantallaCompleta}>⛶</button>
          </div>
          {terminado && <p className="rp-sub" role="status">Terminó la playlist. Tocá ▶ para ver el último clip otra vez.</p>}
          <p className="rp-atajos">Teclas: ← → clip anterior / siguiente · espacio pausa · R repetir · P pausa al final · 1 2 3 velocidad · F pantalla completa · Esc cerrar</p>
        </div>

        <ol className="rp-lista" aria-label="Clips de la playlist">
          {clips.map((c, i) => (
            <li key={c.clave + i}>
              <button type="button" aria-current={i === indice ? 'true' : undefined} onClick={() => irA(i)}>
                <strong>{i + 1}. {c.etiqueta}{c.equipoNombre ? ` · ${c.equipoNombre}` : ''}{conDibujo(c) && <span className="dib-icono" title="Con dibujos"> ✎</span>}</strong>
                <span>{c.partido} · {c.minuto}{c.nota ? ` · ${c.nota}` : ''}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
