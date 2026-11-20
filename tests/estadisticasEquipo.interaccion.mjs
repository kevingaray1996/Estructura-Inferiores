// Estadísticas del equipo en pantalla: si la base falla se ve un aviso claro con «Reintentar» (nunca números en cero)
// y al reintentar con éxito aparecen los totales. Base simulada; no toca Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Estadísticas del equipo: aviso con Reintentar si falla y totales al reintentar', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  let falla = true
  const tandas = []
  poner('__estadisticasDB', {
    from(tabla) {
      const q = { select() { return q }, not() { return q }, eq() { return q }, order() { return q },
        range(desde) {
          tandas.push([tabla, desde])
          if (falla) return Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } })
          const data = tabla === 'partidos'
            ? [{ id: 'p1', goles_local: 2, goles_visitante: 1, local_visitante: 'local', formacion: '4-4-2' }]
            : [{ id: 's1', jugador_id: 'a', goles: 2, asistencias: 0, jugadores: { nombre: 'Ana', apellido: 'Simulada' } }]
          return Promise.resolve({ data, error: null })
        } }
      return q
    },
  })
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'estadisticas-db', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0estadisticas-db' }, load(id) { if (id === '\0estadisticas-db') return 'export const supabase=globalThis.__estadisticasDB' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  try {
    const { default: EstadisticasEquipo } = await server.ssrLoadModule('/src/components/EstadisticasEquipo.jsx')
    await act(async () => { root.render(h(EstadisticasEquipo, { categoriaId: 'cat', categoriaNombre: 'Primera' })) })
    await esperar()
    const aviso = document.querySelector('[role=alert]')
    assert.ok(aviso, 'Hay un aviso de error')
    assert.match(aviso.textContent, /No se pudieron cargar las estadísticas/)
    assert.match(aviso.textContent, /Revisá la conexión y probá de nuevo/)
    assert.doesNotMatch(document.body.textContent, /Failed to fetch|Goles a favor/)
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar')
    assert.ok(boton, 'Hay un botón Reintentar')

    falla = false
    await act(async () => { boton.click() })
    await esperar()
    assert.equal(document.querySelector('[role=alert]'), null)
    assert.match(document.body.textContent, /Goles a favor/)
    assert.match(document.body.textContent, /Simulada, Ana/)
    assert.ok(tandas.some(([t]) => t === 'estadisticas_jugador'))
  } finally {
    await act(async () => root.unmount())
    await server.close(); dom.window.close()
    for (const [k, d] of anteriores) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k] }
  }
})
