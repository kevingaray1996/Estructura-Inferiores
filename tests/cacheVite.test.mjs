import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { crearServidorVitePrueba } from './helpers/servidorVite.mjs'

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

test('Ninguna prueba crea servidores con la caché compartida de desarrollo', () => {
  for (const archivo of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.mjs'))) {
    const texto = readFileSync(new URL(archivo, import.meta.url), 'utf8')
    assert.equal(/import\(['"]vite['"]\)/.test(texto), false, archivo)
  }
})
