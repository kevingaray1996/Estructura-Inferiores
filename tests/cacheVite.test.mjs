import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { crearServidorVitePrueba } from './helpers/servidorVite.mjs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test('Los servidores Vite de pruebas usan cachés distintas y limpian solo su espacio temporal', async () => {
  const opciones = { configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }
  const a = await crearServidorVitePrueba(opciones)
  let b
  const directorio = dirname(a.config.cacheDir)
  try {
    b = await crearServidorVitePrueba(opciones)
    assert.notEqual(a.config.cacheDir, b.config.cacheDir)
    assert.notEqual(resolve(a.config.cacheDir), resolve('node_modules/.vite'))
    assert.ok(existsSync(directorio))
  } finally { await a.close(); await b?.close() }
  assert.equal(existsSync(directorio), false)
})

test('Cerrar Vite espera el escaneo y las escrituras pendientes antes de limpiar su caché', async () => {
  const s = await crearServidorVitePrueba({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const directorio = dirname(s.config.cacheDir)
  const optimizador = s.environments.client.depsOptimizer
  assert.ok(optimizador, 'La prueba conserva el optimizador habilitado')
  await optimizador.scanProcessing
  let completar
  optimizador.scanProcessing = new Promise(resolve => { completar = resolve })
  const cierre = s.close()
  try {
    assert.ok(cierre === s.close(), 'Dos cierres comparten la misma operación')
    await Promise.resolve()
    assert.ok(existsSync(directorio), 'No elimina el directorio mientras sigue el escaneo')
    await writeFile(join(directorio, 'escritura-pendiente.txt'), 'resultado del escaneo')
  } finally { completar(); await cierre }
  assert.equal(existsSync(directorio), false)
})

test('Ninguna prueba crea servidores con la caché compartida de desarrollo', () => {
  for (const archivo of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.mjs'))) {
    const texto = readFileSync(new URL(archivo, import.meta.url), 'utf8')
    assert.equal(/import\(['"]vite['"]\)/.test(texto), false, archivo)
  }
})
