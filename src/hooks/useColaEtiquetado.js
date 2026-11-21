import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { crearColaEtiquetado } from '../utils/analisis/colaEtiquetado'

function almacenLocal() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

// Cola de guardado del etiquetado (src/utils/analisis/colaEtiquetado.js) conectada a React.
// enviar / borrar / alConfirmar / alFallarBorrado pueden cambiar entre renders: se leen siempre los últimos.
export default function useColaEtiquetado({ enviar, borrar, alConfirmar, alFallarBorrado }) {
  // La cola se crea una sola vez; las funciones que usa se leen de «ultimas», que se actualiza en cada render.
  const [{ cola, ultimas }] = useState(() => {
    const caja = { enviar, borrar, alConfirmar, alFallarBorrado }
    return {
      ultimas: caja,
      cola: crearColaEtiquetado({
        almacen: almacenLocal(),
        enviar: (r) => caja.enviar(r),
        borrar: (id) => caja.borrar(id),
        alConfirmar: (fila) => caja.alConfirmar?.(fila),
        alFallarBorrado: (fila, error) => caja.alFallarBorrado?.(fila, error),
      }),
    }
  })
  useLayoutEffect(() => { Object.assign(ultimas, { enviar, borrar, alConfirmar, alFallarBorrado }) })
  const items = useSyncExternalStore(cola.subscribe, cola.getSnapshot, cola.getSnapshot)

  useEffect(() => {
    cola.iniciar()
    // Al volver la conexión, se reintenta enseguida en vez de esperar el próximo intento.
    const alVolver = () => cola.reintentarAhora()
    window.addEventListener('online', alVolver)
    return () => { window.removeEventListener('online', alVolver); cola.detener() }
  }, [cola])

  return { cola, items }
}
