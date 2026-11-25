import { useEffect, useRef, useState } from 'react'
import { crearRelojSuave } from '../../../utils/analisis/dibujos/reloj'
import { CLAVE_FICHAS_2D, guardarPreferencia, leerPreferencia } from '../../../utils/analisis/dibujos/guias'
import Pizarra2D from './Pizarra2D'
import './dibujo.css'

// Pizarra 2D de un clip sincronizada con un reproductor de YouTube que ya existe (reproductor de playlists).
// Solo para ver: sirve para el cuerpo técnico y en el celular. obtenerPlayer(): el YT.Player. rango: { inicio, fin }.
export default function Vista2DReproduccion({ obtenerPlayer, dibujo, rango, rival = null }) {
  const [tiempo, setTiempo] = useState(rango.inicio)
  const [fichas, setFichas] = useState(() => (leerPreferencia(CLAVE_FICHAS_2D) === 'foto' ? 'foto' : 'dorsal'))
  const raizRef = useRef(null)

  useEffect(() => {
    const ventana = raizRef.current?.ownerDocument?.defaultView || window
    const reloj = crearRelojSuave()
    let cuadro = 0
    const paso = () => {
      cuadro = ventana.requestAnimationFrame(paso)
      const player = obtenerPlayer?.()
      let l
      try { l = player && { t: Number(player.getCurrentTime?.()), reproduciendo: player.getPlayerState?.() === 1, velocidad: Number(player.getPlaybackRate?.()) || 1 } } catch { l = null }
      if (!l || !Number.isFinite(l.t)) return
      const t = Math.min(rango.fin, Math.max(rango.inicio, reloj.muestra(l.t, { ...l, ahora: ventana.performance.now() })))
      setTiempo((v) => (Math.abs(v - t) < 1 / 60 ? v : t))
    }
    cuadro = ventana.requestAnimationFrame(paso)
    return () => ventana.cancelAnimationFrame(cuadro)
  }, [obtenerPlayer, rango])

  const cambiar = (valor) => { setFichas(valor); guardarPreferencia(CLAVE_FICHAS_2D, valor) }
  return (
    <section ref={raizRef} className="rp-2d" aria-label="Pizarra 2D de la jugada">
      <div className="dib-barra2d">
        <strong>Pizarra 2D</strong>
        <div className="az-segmento" role="group" aria-label="Qué muestran nuestras fichas">
          <button type="button" aria-pressed={fichas === 'dorsal'} onClick={() => cambiar('dorsal')}>Dorsal</button>
          <button type="button" aria-pressed={fichas === 'foto'} onClick={() => cambiar('foto')}>Foto</button>
        </div>
      </div>
      <Pizarra2D dibujo={dibujo} tiempo={tiempo} rival={rival} fichas={fichas} />
    </section>
  )
}
