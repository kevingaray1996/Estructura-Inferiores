import { useEffect, useRef } from 'react'

// Foco en las confirmaciones en línea: al abrirse, va al primer botón de la confirmación; al cancelar, vuelve al
// botón que la abrió (que se vuelve a montar al cerrarse).
// abierta: lo que se está confirmando (true, o el id de la fila); null, false o undefined si está cerrada.
// Uso: ref={primerBoton} en el primer botón, ref={disparador(clave)} en el botón que abre, y cancelar() al cancelar.
export default function useFocoConfirmacion(abierta) {
  const primerBoton = useRef(null)
  const disparadores = useRef(new Map())
  const ultima = useRef(null)
  const volver = useRef(false)
  const estaAbierta = abierta !== null && abierta !== false && abierta !== undefined

  useEffect(() => {
    if (estaAbierta) {
      ultima.current = abierta
      volver.current = false
      primerBoton.current?.focus()
      return
    }
    if (volver.current) {
      volver.current = false
      disparadores.current.get(ultima.current)?.focus()
    }
  }, [abierta, estaAbierta])

  const disparador = (clave = true) => (el) => {
    if (!el) return undefined
    disparadores.current.set(clave, el)
    return () => { if (disparadores.current.get(clave) === el) disparadores.current.delete(clave) }
  }
  const cancelar = () => { volver.current = true }

  return { primerBoton, disparador, cancelar }
}
