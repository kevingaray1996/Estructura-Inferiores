import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMedidas } from './apoyo'
import { cuadroVideo } from '../../../utils/analisis/dibujos/coordenadas'
import { escenaEn, transformZoom } from '../../../utils/analisis/dibujos/escena'
import { crearEstadoPausas, pasoPausas } from '../../../utils/analisis/dibujos/pausas'
import { crearRelojSuave } from '../../../utils/analisis/dibujos/reloj'
import CapaDibujos from './CapaDibujos'
import './dibujo.css'

function leer(player) {
  try {
    return {
      t: Number(player.getCurrentTime?.()),
      reproduciendo: player.getPlayerState?.() === 1,
      velocidad: Number(player.getPlaybackRate?.()) || 1,
    }
  } catch {
    return null
  }
}

// Dibujos de un clip encima de un video de YouTube que ya existe, sincronizados, con pausas, subtítulos y zoom.
// obtenerPlayer(): el reproductor (YT.Player). onZoom(estilo): agranda el contenedor del video (useZoomContenedor).
// rango: { inicio, fin } del clip: fuera de él no se dibuja ni se pausa. onSalir(): el video salió del clip.
export default function CapaReproduccion({ obtenerPlayer, dibujo, rango = null, onZoom = null, onSalir = null }) {
  const raizRef = useRef(null)
  const { ancho, alto } = useMedidas(raizRef)
  const [vista, setVista] = useState({ tiempo: null, pausa: null })
  const salirRef = useRef(onSalir)
  useLayoutEffect(() => { salirRef.current = onSalir })

  useEffect(() => {
    if (!dibujo) return undefined
    const ventana = raizRef.current?.ownerDocument?.defaultView || window
    const reloj = crearRelojSuave()
    let estado = crearEstadoPausas()
    let entro = false
    let cuadro = 0
    const paso = () => {
      cuadro = ventana.requestAnimationFrame(paso)
      const player = obtenerPlayer?.()
      const l = player && leer(player)
      if (!l || !Number.isFinite(l.t)) return
      const ahora = ventana.performance.now()
      const t = reloj.muestra(l.t, { reproduciendo: l.reproduciendo, velocidad: l.velocidad, ahora })
      const dentro = !rango || (t >= rango.inicio - 0.05 && t <= rango.fin + 0.25)
      if (dentro) entro = true
      else if (entro && rango && (t > rango.fin + 0.6 || t < rango.inicio - 2)) { entro = false; salirRef.current?.() }
      const r = pasoPausas(estado, { t, reproduciendo: l.reproduciendo, ahora }, dentro ? dibujo.pausas : [])
      estado = r.estado
      try {
        if (r.orden?.tipo === 'pausar') { player.pauseVideo(); player.seekTo(r.orden.t, true) }
        else if (r.orden?.tipo === 'reanudar') player.playVideo()
      } catch { /* El reproductor puede estar cambiando de video. */ }
      const tiempo = dentro ? r.tiempo : null
      setVista((v) => {
        const pausa = r.pausa ? Math.ceil(r.pausa.restante) : null
        if (v.tiempo === tiempo && v.pausa === pausa) return v
        if (tiempo !== null && v.tiempo !== null && Math.abs(v.tiempo - tiempo) < 1 / 90 && v.pausa === pausa) return v
        return { tiempo, pausa }
      })
    }
    cuadro = ventana.requestAnimationFrame(paso)
    return () => ventana.cancelAnimationFrame(cuadro)
  }, [dibujo, rango, obtenerPlayer])

  const escena = dibujo && vista.tiempo !== null ? escenaEn(dibujo, vista.tiempo) : null
  const zoom = transformZoom(escena?.zoom || null)

  // El zoom de cámara agranda el contenedor del video (no se lee la imagen de YouTube). Durante una pausa de dibujo
  // el contenedor también recorta la interfaz de YouTube que aparece con el video pausado.
  const pausaDibujo = vista.pausa !== null
  useLayoutEffect(() => {
    onZoom?.({ transform: zoom.transform, transformOrigin: zoom.transformOrigin, pausaDibujo })
    return () => onZoom?.(null)
  }, [onZoom, zoom.transform, zoom.transformOrigin, pausaDibujo])

  const cuadro = cuadroVideo(ancho, alto)
  return (
    <div ref={raizRef} className="dib-capa" aria-hidden={escena ? undefined : 'true'}>
      {escena && <div className="dib-capa-zoom" style={zoom}>
        <CapaDibujos escena={escena} ancho={ancho} alto={alto} cuadro={cuadro} />
      </div>}
      {escena?.subtitulo && <p className="dib-subtitulo" style={{ bottom: `${cuadro.arriba + 12}px` }}>{escena.subtitulo}</p>}
      {vista.pausa !== null && <p className="dib-pausa" role="status">⏸ {vista.pausa}</p>}
    </div>
  )
}

// Pantalla completa del contenedor que tiene el video Y los dibujos (no del reproductor de YouTube solo).
export function BotonPantallaCompleta({ objetivoRef, className = 'dib-pantalla' }) {
  function alternar() {
    const el = objetivoRef.current
    const doc = el?.ownerDocument || document
    try {
      if (doc.fullscreenElement) doc.exitFullscreen?.()
      else el?.requestFullscreen?.()
    } catch { /* El navegador no lo permite. */ }
  }
  return <button type="button" className={className} aria-label="Pantalla completa con los dibujos" title="Pantalla completa (con los dibujos)" onClick={alternar}>⛶</button>
}
