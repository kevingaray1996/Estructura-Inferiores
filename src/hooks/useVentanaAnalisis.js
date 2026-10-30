import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { crearVentanaAnalisis } from '../utils/ventanaAnalisis'

export default function useVentanaAnalisis(antesDeCambiar) {
  const [gestor] = useState(() => crearVentanaAnalisis(typeof window === 'undefined' ? null : window))
  useLayoutEffect(() => { gestor.establecerAntes(antesDeCambiar) }, [gestor, antesDeCambiar])
  const estado = useSyncExternalStore(gestor.subscribe, gestor.getSnapshot, gestor.getSnapshot)
  useEffect(() => {
    const cerrar = () => gestor.cerrar()
    window.addEventListener('pagehide', cerrar)
    return () => { window.removeEventListener('pagehide', cerrar); gestor.cerrar() }
  }, [gestor])
  return { ...estado, gestor }
}
