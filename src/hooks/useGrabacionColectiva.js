import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { abrirGrabacion, cerrarGrabacion, debeCerrarseSola } from '../utils/analisis/colectiva'

// Momento colectivo abierto («Grabando…»). Se respalda en el navegador para no perderlo si se recarga la página.
const CLAVE = 'analisis_grabacion_colectiva_v1'

function leer() {
  try {
    const g = JSON.parse(window.localStorage.getItem(CLAVE) || 'null')
    return g && typeof g.tipo === 'string' && Number.isFinite(g.inicio) && Number.isFinite(g.duracion) && g.partidoId ? g : null
  } catch { return null }
}
function persistir(g) {
  try { if (g) window.localStorage.setItem(CLAVE, JSON.stringify(g)); else window.localStorage.removeItem(CLAVE) } catch { /* Sin respaldo. */ }
}

// tocar(tipo): abre el momento en el segundo actual; si ya está abierto ese mismo, lo cierra; si hay otro abierto, lo
// cierra en este segundo y abre el nuevo. cerrar(): cierra el abierto (Enter). Si nadie lo cierra, se cierra solo al
// llegar a la duración por defecto. guardar({ tipo, segundo, segundo_fin, partidoId }) recibe cada momento cerrado.
// puedeAbrir(): false si todavía no se puede marcar (video sin conectar, sin permiso…).
export default function useGrabacionColectiva({ reloj, catalogo, partidoId, activa, guardar, puedeAbrir = () => true }) {
  const [grabacion, setGrabacion] = useState(() => (activa ? leer() : null))
  const actual = useRef(grabacion)
  const ultimas = useRef({ guardar, catalogo, puedeAbrir })
  useLayoutEffect(() => { ultimas.current = { guardar, catalogo, puedeAbrir } })

  const fijar = useCallback((g) => { actual.current = g; setGrabacion(g); persistir(g) }, [])

  const cerrar = useCallback((segundo) => {
    const g = actual.current
    if (!g) return null
    fijar(null)
    const momento = cerrarGrabacion(g, segundo ?? reloj.leer())
    ultimas.current.guardar({ ...momento, partidoId: g.partidoId })
    return momento
  }, [reloj, fijar])

  const tocar = useCallback((tipo) => {
    if (!activa) return
    const abierta = actual.current
    const ahora = reloj.leer()
    if (abierta) {
      cerrar(ahora)
      if (abierta.tipo === tipo) return
    }
    if (!ultimas.current.puedeAbrir()) return
    fijar({ ...abrirGrabacion(tipo, ahora, ultimas.current.catalogo), partidoId })
  }, [activa, reloj, cerrar, fijar, partidoId])

  // Cierre solo, con la duración por defecto, mientras avanza el video.
  useEffect(() => reloj.suscribir(() => {
    const g = actual.current
    if (g && debeCerrarseSola(g, reloj.leer())) cerrar(g.inicio + g.duracion)
  }), [reloj, cerrar])

  // Si se cambia de partido con un momento abierto, se cierra con la duración por defecto (en su partido).
  useEffect(() => {
    const g = actual.current
    if (g && partidoId && g.partidoId !== partidoId) cerrar(g.inicio + g.duracion)
  }, [partidoId, cerrar])

  return { grabacion, tocar, cerrar }
}
