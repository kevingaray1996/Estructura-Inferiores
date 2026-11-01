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
    servidor.close = () => cierre ??= (async () => {
      // Vite captura optimizationResult al entrar en close(). Si la exploración
      // aún no terminó, ese resultado todavía no existe y puede escapar al cierre.
      for (const entorno of Object.values(servidor.environments)) {
        await entorno.depsOptimizer?.scanProcessing
        await entorno.waitForRequestsIdle?.()
        const metadata = entorno.depsOptimizer?.metadata
        await Promise.all([...Object.values(metadata?.discovered || {}), ...Object.values(metadata?.optimized || {})]
          .map(dependencia => dependencia.processing))
      }
      await cerrar()
      await limpiar()
    })()
    return servidor
  } catch (error) {
    await limpiar()
    throw error
  }
}
