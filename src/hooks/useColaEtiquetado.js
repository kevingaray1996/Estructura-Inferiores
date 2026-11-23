import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { crearColaEtiquetado } from '../utils/analisis/colaEtiquetado'

function almacenLocal() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

// Cola de guardado del etiquetado (src/utils/analisis/colaEtiquetado.js) conectada a React.
// enviar / borrar / alConfirmar / alFallarBorrado pueden cambiar entre renders: se leen siempre los últimos.
// activa = false (modo consulta): no lee ni toca el respaldo del navegador y no envía nada. Así, si alguien sin
// permiso de edición abre Análisis en una compu con acciones pendientes de coordinación, esas acciones no se pierden.
export default function useColaEtiquetado({ enviar, borrar, actualizar, alConfirmar, alFallarBorrado, alActualizar, activa = true }) {
  // La cola se crea una sola vez; las funciones que usa se leen de «ultimas», que se actualiza en cada render.
  const [{ cola, ultimas }] = useState(() => {
    const caja = { enviar, borrar, actualizar, alConfirmar, alFallarBorrado, alActualizar }
    return {
      ultimas: caja,
      cola: crearColaEtiquetado({
        almacen: activa ? almacenLocal() : null,
        enviar: (r) => caja.enviar(r),
        borrar: (id) => caja.borrar(id),
        actualizar: (id, cambios) => caja.actualizar(id, cambios),
        alConfirmar: (fila) => caja.alConfirmar?.(fila),
        alFallarBorrado: (fila, error) => caja.alFallarBorrado?.(fila, error),
        alActualizar: (id, cambios) => caja.alActualizar?.(id, cambios),
      }),
    }
  })
  useLayoutEffect(() => { Object.assign(ultimas, { enviar, borrar, actualizar, alConfirmar, alFallarBorrado, alActualizar }) })
  const items = useSyncExternalStore(cola.subscribe, cola.getSnapshot, cola.getSnapshot)

  useEffect(() => {
    if (!activa) return undefined
    cola.iniciar()
    // Al volver la conexión, se reintenta enseguida en vez de esperar el próximo intento.
    const alVolver = () => cola.reintentarAhora()
    window.addEventListener('online', alVolver)
    return () => { window.removeEventListener('online', alVolver); cola.detener() }
  }, [cola, activa])

  return { cola, items }
}
