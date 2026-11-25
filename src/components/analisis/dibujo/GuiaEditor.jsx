import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { moverGuia } from '../../../utils/analisis/dibujos/guias'

const MARGEN = 8
const ANCHO_TARJETA = 340

// Dónde va la tarjeta: debajo del recuadro si entra; si no, arriba; si no, al costado. Siempre dentro de la pantalla.
function lugarTarjeta(rect, vw, vh, altoTarjeta) {
  if (!rect) return { left: (vw - ANCHO_TARJETA) / 2, top: Math.max(MARGEN, (vh - altoTarjeta) / 2) }
  const recortar = (x, max) => Math.max(MARGEN, Math.min(x, max - MARGEN))
  const left = recortar(rect.left + rect.width / 2 - ANCHO_TARJETA / 2, vw - ANCHO_TARJETA)
  if (rect.bottom + MARGEN * 2 + altoTarjeta <= vh) return { left, top: rect.bottom + MARGEN * 2 }
  if (rect.top - MARGEN * 2 - altoTarjeta >= 0) return { left, top: rect.top - MARGEN * 2 - altoTarjeta }
  const lado = rect.right + MARGEN * 2 + ANCHO_TARJETA <= vw ? rect.right + MARGEN * 2 : rect.left - MARGEN * 2 - ANCHO_TARJETA
  return { left: recortar(lado, vw - ANCHO_TARJETA), top: recortar(rect.top, vh - altoTarjeta) }
}

// Guía paso a paso: marca con un recuadro la parte de la pantalla de cada paso ([data-guia=objetivo] dentro de raiz)
// y explica qué es. onTerminar(): se terminó o se saltó (quien la abre recuerda que ya se vio).
export default function GuiaEditor({ pasos, raizRef, onTerminar, nombre = 'Guía' }) {
  const [indice, setIndice] = useState(0)
  const [rect, setRect] = useState(null)
  const [altoTarjeta, setAltoTarjeta] = useState(200)
  const tarjetaRef = useRef(null)
  const siguienteRef = useRef(null)
  const propiaRef = useRef(null)
  const paso = pasos[indice]

  // Recuadro del paso actual (se recalcula si cambia el tamaño de la ventana). Al abrirse junto con el editor, la
  // referencia del editor todavía no está: se busca desde la propia guía, que está adentro.
  useLayoutEffect(() => {
    const medir = () => {
      const raiz = raizRef.current || propiaRef.current?.parentElement
      const el = raiz?.querySelector(`[data-guia="${paso.objetivo}"]`)
      const r = el?.getBoundingClientRect()
      setRect(r && r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null)
      const t = tarjetaRef.current?.getBoundingClientRect()
      if (t?.height) setAltoTarjeta(t.height)
    }
    medir()
    const cuadro = requestAnimationFrame(medir) // por si el editor todavía estaba acomodándose
    window.addEventListener('resize', medir)
    return () => { cancelAnimationFrame(cuadro); window.removeEventListener('resize', medir) }
  }, [paso, raizRef])

  useEffect(() => { siguienteRef.current?.focus() }, [indice])

  const ir = (accion) => {
    const nuevo = moverGuia(indice, accion, pasos.length)
    if (nuevo === null) onTerminar()
    else setIndice(nuevo)
  }
  const irRef = useRef(ir)
  useLayoutEffect(() => { irRef.current = ir })

  // Teclas de la guía (el editor no las recibe mientras está abierta).
  useEffect(() => {
    function tecla(e) {
      const orden = { Escape: 'saltar', ArrowRight: 'siguiente', Enter: 'siguiente', ArrowLeft: 'anterior' }[e.key]
      if (!orden) return
      if (e.key === 'Enter' && e.target?.tagName === 'BUTTON') return // Enter sobre un botón lo aprieta.
      e.preventDefault()
      irRef.current(orden)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const lugar = lugarTarjeta(rect, vw, vh, altoTarjeta)
  const ultimo = indice === pasos.length - 1

  return (
    <div ref={propiaRef} className="dib-guia" role="dialog" aria-modal="true" aria-label={nombre} aria-describedby="dib-guia-texto">
      {rect
        ? <div className="dib-guia-recuadro" aria-hidden="true"
            style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="dib-guia-velo" aria-hidden="true" />}
      <section ref={tarjetaRef} className="dib-guia-tarjeta" style={{ left: lugar.left, top: lugar.top, width: ANCHO_TARJETA }}>
        <p className="dib-guia-contador">{nombre} · paso {indice + 1} de {pasos.length}</p>
        <h3>{paso.titulo}</h3>
        <p id="dib-guia-texto">{paso.texto}</p>
        <div className="dib-fila">
          <button type="button" className="dib-boton" onClick={() => ir('anterior')} disabled={indice === 0}>Anterior</button>
          <button ref={siguienteRef} type="button" className="dib-boton dib-principal" onClick={() => ir('siguiente')}>{ultimo ? 'Listo' : 'Siguiente'}</button>
          <button type="button" className="dib-boton" onClick={() => ir('saltar')}>Saltar</button>
        </div>
      </section>
    </div>
  )
}
