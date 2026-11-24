import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// Colores de los dibujos (tokens --dib-* de apariencia.css).
export const COLOR = { amarillo: 'var(--dib-amarillo)', blanco: 'var(--dib-blanco)', rojo: 'var(--dib-rojo)', azul: 'var(--dib-azul)' }

// Tamaño de un elemento (se actualiza al cambiar la ventana o al entrar en pantalla completa).
export function useMedidas(ref) {
  const [medidas, setMedidas] = useState({ ancho: 0, alto: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => {
      const r = el.getBoundingClientRect()
      setMedidas((m) => (Math.abs(m.ancho - r.width) < 0.5 && Math.abs(m.alto - r.height) < 0.5 ? m : { ancho: r.width, alto: r.height }))
    }
    medir()
    const Observador = el.ownerDocument?.defaultView?.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null)
    if (!Observador) return undefined
    const obs = new Observador(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return medidas
}

// Contenedor del video que se agranda con el zoom de cámara: [ref para el contenedor, función que le aplica el zoom].
export function useZoomContenedor() {
  const ref = useRef(null)
  const aplicar = useCallback((estilo) => {
    const el = ref.current
    if (!el) return
    el.style.transform = !estilo || estilo.transform === 'none' ? '' : estilo.transform
    el.style.transformOrigin = estilo?.transformOrigin || ''
  }, [])
  return [ref, aplicar]
}
