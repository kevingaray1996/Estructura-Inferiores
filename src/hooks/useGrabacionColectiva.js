import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cerrarGrabacion, cerrarUltima, cerrarVencidas, tocarColectiva } from '../utils/analisis/colectiva'

// Momentos colectivos abiertos («Grabando…»): como mucho una fase y uno de Charla a la vez (Charla se superpone).
// Se respaldan en el navegador para no perderlos si se recarga la página.
const CLAVE = 'analisis_grabacion_colectiva_v1'

const valida = (g) => g && typeof g.tipo === 'string' && Number.isFinite(g.inicio) && Number.isFinite(g.duracion) && g.partidoId
function leer() {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) || 'null')
    // Formato viejo: un solo momento abierto.
    const lista = Array.isArray(guardado) ? guardado : guardado ? [guardado] : []
    return lista.filter(valida)
  } catch { return [] }
}
function persistir(lista) {
  try { if (lista.length) window.localStorage.setItem(CLAVE, JSON.stringify(lista)); else window.localStorage.removeItem(CLAVE) } catch { /* Sin respaldo. */ }
}

// tocar(tipo): abre el momento en el segundo actual; si ya está abierto, lo cierra. Una fase nueva cierra la fase
// abierta en este segundo; un botón de Charla no cierra la fase (y una fase no cierra la Charla).
// cerrar(): Enter, cierra el último abierto. cerrarTodas(): al cambiar a la botonera individual.
// Si nadie lo cierra, cada uno se cierra solo al llegar a su duración por defecto.
// guardar({ tipo, segundo, segundo_fin, partidoId }) recibe cada momento cerrado.
// puedeAbrir(): false si todavía no se puede marcar (video sin conectar, sin permiso…).
export default function useGrabacionColectiva({ reloj, catalogo, partidoId, activa, guardar, puedeAbrir = () => true }) {
  const [abiertas, setAbiertas] = useState(() => (activa ? leer() : []))
  const actual = useRef(abiertas)
  const ultimas = useRef({ guardar, catalogo, puedeAbrir })
  useLayoutEffect(() => { ultimas.current = { guardar, catalogo, puedeAbrir } })

  const aplicar = useCallback(({ abiertas: nuevas, cerradas }) => {
    actual.current = nuevas
    setAbiertas(nuevas)
    persistir(nuevas)
    for (const momento of cerradas) ultimas.current.guardar(momento)
  }, [])

  const tocar = useCallback((tipo) => {
    if (!activa) return
    const resultado = tocarColectiva(actual.current, tipo, reloj.leer(), ultimas.current.catalogo)
    let nuevas = resultado.abiertas.map((g) => (g.partidoId ? g : { ...g, partidoId }))
    // El que se acaba de abrir es el último de la lista: si todavía no se puede marcar, no se abre.
    if (resultado.abierto && !ultimas.current.puedeAbrir()) nuevas = nuevas.slice(0, -1)
    aplicar({ abiertas: nuevas, cerradas: resultado.cerradas })
  }, [activa, reloj, partidoId, aplicar])

  const cerrar = useCallback(() => aplicar(cerrarUltima(actual.current, reloj.leer())), [reloj, aplicar])
  const cerrarTodas = useCallback(() => {
    const segundo = reloj.leer()
    aplicar({ abiertas: [], cerradas: actual.current.map((g) => cerrarGrabacion(g, segundo)) })
  }, [reloj, aplicar])

  // Cierre solo, con la duración por defecto, mientras avanza el video.
  useEffect(() => reloj.suscribir(() => {
    const resultado = cerrarVencidas(actual.current, reloj.leer())
    if (resultado.cerradas.length) aplicar(resultado)
  }), [reloj, aplicar])

  // Si se cambia de partido con momentos abiertos, se cierran con su duración por defecto (en su partido).
  useEffect(() => {
    if (!partidoId) return
    const ajenas = actual.current.filter((g) => g.partidoId !== partidoId)
    if (ajenas.length) {
      aplicar({
        abiertas: actual.current.filter((g) => g.partidoId === partidoId),
        cerradas: ajenas.map((g) => cerrarGrabacion(g, g.inicio + g.duracion)),
      })
    }
  }, [partidoId, aplicar])

  return { abiertas, tocar, cerrar, cerrarTodas }
}
