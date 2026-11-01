import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createServer } from 'vite'

// Nunca comparte node_modules/.vite con desarrollo ni con otra prueba.
export async function crearServidorVitePrueba(opciones) {
  const raiz = resolve(tmpdir())
  const temporal = await mkdtemp(join(raiz, 'comunicaciones-vite-test-'))
  async function limpiar() {
    const destino = resolve(temporal)
    if (dirname(destino) !== raiz || !basename(destino).startsWith('comunicaciones-vite-test-')) {
      throw new Error('Directorio de caché fuera del espacio temporal de pruebas.')
    }
    // Windows puede retener archivos brevemente al terminar el optimizador.
    await rm(destino, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  try {
    const servidor = await createServer({ ...opciones, cacheDir: join(temporal, 'cache') })
    const cerrar = servidor.close.bind(servidor)
    let cierre
    servidor.close = () => cierre ??= cerrar().then(limpiar)
    return servidor
  } catch (error) {
    await limpiar()
    throw error
  }
}
