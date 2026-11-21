// Carga por partes: recarga automática UNA vez cuando falta un archivo de una versión vieja (después de un deploy),
// sin bucles, sin recargar sin conexión, y sin tocar los demás errores. También revisa que la app principal deje en
// la carga inicial solo Inicio y Hoy, y que los PDF y el Excel se bajen recién al usarlos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esErrorDeVersion, recargarUnaVez, importarConRecarga } from '../src/utils/cargaDiferida.js'

const leer = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

function entorno({ enLinea = true } = {}) {
  const datos = new Map()
  const e = {
    recargas: 0,
    navigator: { onLine: enLinea },
    sessionStorage: { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) },
    location: { reload: () => { e.recargas++ } },
  }
  return e
}

test('reconoce los errores de archivos de otra versión en Chrome, Safari y Firefox', () => {
  for (const m of [
    'Failed to fetch dynamically imported module: https://x/assets/PlantelSection-abc.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://x/assets/a.js',
    'Unable to preload CSS for /assets/a.css',
  ]) assert.ok(esErrorDeVersion(new TypeError(m)), m)
  assert.equal(esErrorDeVersion(new Error('Cannot read properties of undefined')), false)
  assert.equal(esErrorDeVersion(null), false)
})

test('recarga una sola vez: un segundo fallo enseguida no vuelve a recargar', () => {
  const e = entorno()
  assert.equal(recargarUnaVez(e), true)
  assert.equal(recargarUnaVez(e), false)
  assert.equal(e.recargas, 1)
})

test('sin conexión no recarga (la página no cargaría)', () => {
  const e = entorno({ enLinea: false })
  assert.equal(recargarUnaVez(e), false)
  assert.equal(e.recargas, 0)
})

test('importarConRecarga: recarga ante un archivo viejo, propaga los demás errores y deja pasar lo que carga bien', async () => {
  const e = entorno()
  const pendiente = importarConRecarga(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: x')), e)
  const resultado = await Promise.race([pendiente.then(() => 'resolvió', () => 'falló'), new Promise((r) => setTimeout(() => r('pendiente'), 20))])
  assert.equal(resultado, 'pendiente', 'mientras recarga, la promesa queda pendiente')
  assert.equal(e.recargas, 1)

  // Segundo fallo inmediato: no recarga, el error llega a la pantalla (aviso con «Recargar»).
  await assert.rejects(importarConRecarga(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: x')), e), /dynamically imported/)
  assert.equal(e.recargas, 1)

  // Otros errores no recargan.
  const otro = entorno()
  await assert.rejects(importarConRecarga(() => Promise.reject(new Error('boom')), otro), /boom/)
  assert.equal(otro.recargas, 0)

  assert.deepEqual(await importarConRecarga(() => Promise.resolve({ ok: 1 }), entorno()), { ok: 1 })
})

test('App: Inicio y Hoy en la carga inicial; el resto de las secciones y las herramientas pesadas, diferidas', () => {
  const app = leer('src/App.jsx')
  assert.match(app, /^import InicioSection from '\.\/components\/InicioSection'/m)
  assert.match(app, /^import HoySection from '\.\/components\/hoy\/HoySection'/m)
  const estaticos = [...app.matchAll(/^import (\w+) from '\.\/components\/[^']+'/gm)].map((m) => m[1])
  assert.deepEqual(estaticos.sort(), ['ContenedorSeccion', 'HoySection', 'InicioSection', 'Layout', 'Login', 'PantallaCarga'])
  for (const s of ['PlantelSection', 'AnalisisSection', 'MedicosSection', 'FisicoSection', 'UsuariosSection', 'BienestarPublico']) {
    assert.match(app, new RegExp(`const ${s} = seccionDiferida\\(\\(\\) => import\\(`), s)
  }
  assert.match(app, /<ContenedorSeccion clave=\{seccion\} nombre=\{NOMBRES_SECCION\[seccion\]\}>/)
  assert.match(leer('src/main.jsx'), /vite:preloadError/)

  // Ninguna pantalla importa directo los generadores de PDF ni el Excel: pasan por herramientasDiferidas.
  for (const p of ['AsistenciaSection', 'BienestarComparativo', 'CMJComparativo', 'ListaJugadores', 'ListaPartidos', 'PdfPerfilModal', 'PerfilJugador', 'RPEComparativo', 'SemaforoRiesgo', 'UsuariosSection']) {
    const codigo = leer(`src/components/${p}.jsx`)
    assert.doesNotMatch(codigo, /from '\.\.\/utils\/(generar\w+|exportarBackup)'/, p)
  }
  assert.doesNotMatch(leer('src/utils/exportarEstadisticas.js'), /^import .* from 'jspdf'/m)
})
