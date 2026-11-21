import { lazy } from 'react'

// Carga por partes: secciones y herramientas pesadas (PDF, Excel) se bajan recién cuando se usan.
//
// Después de un deploy, los archivos de la versión anterior dejan de existir. Si alguien tenía la app abierta y
// abre una sección que todavía no había bajado, ese pedido falla: en ese caso la app se recarga sola UNA vez para
// tomar la versión nueva. Si vuelve a fallar enseguida (o no hay conexión) no recarga de nuevo: el error sigue y la
// pantalla muestra un aviso con «Recargar».

const CLAVE = 'club-recarga-version'
const VENTANA_MS = 60_000

const ERROR_DE_VERSION = /dynamically imported module|importing a module script failed|error loading dynamically imported|unable to preload css|failed to load module script|is not a valid javascript mime type/i

export function esErrorDeVersion(error) {
  return ERROR_DE_VERSION.test(String(error?.message || error || ''))
}

// Devuelve true si mandó a recargar. `entorno` permite probarlo sin navegador.
export function recargarUnaVez(entorno = globalThis) {
  try {
    if (entorno.navigator?.onLine === false) return false
    const almacen = entorno.sessionStorage
    const ultima = Number(almacen?.getItem(CLAVE) || 0)
    const ahora = Date.now()
    if (ultima && ahora - ultima < VENTANA_MS) return false
    almacen?.setItem(CLAVE, String(ahora))
    entorno.location.reload()
    return true
  } catch {
    return false
  }
}

// Sección que se baja recién cuando se abre. `importador` es () => import('./X').
export function seccionDiferida(importador) {
  return lazy(() => importarConRecarga(importador))
}

// Envuelve un import() dinámico. Si falla por un archivo de una versión vieja, recarga una vez y deja la promesa
// pendiente (la página se va a recargar); si no, propaga el error.
export function importarConRecarga(importador, entorno = globalThis) {
  return importador().catch((error) => {
    if (esErrorDeVersion(error) && recargarUnaVez(entorno)) return new Promise(() => {})
    throw error
  })
}
