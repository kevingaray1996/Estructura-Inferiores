import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Actualizar Rendimiento: reúne llamadas, invalida sesiones/categorías y descarta respuestas tardías', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  let listener, ultimaFuente
  const lecturas = []
  poner('__actualizarCliente', { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } } },
  } })
  poner('__actualizarLectura', (_cliente, categoria) => new Promise(resolve => lecturas.push({ categoria, resolve })))
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'actualizar-mock', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0actualizar-db'; if (id.endsWith('/rendimiento/lecturas.js')) return '\0actualizar-lectura' },
    load(id) { if (id === '\0actualizar-db') return 'export const supabase=globalThis.__actualizarCliente'; if (id === '\0actualizar-lectura') return 'export const leerDatosRendimiento=globalThis.__actualizarLectura' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const resolver = async (i, etiqueta) => act(async () => { lecturas[i].resolve({ etiqueta }); await Promise.resolve() })
  try {
    const { default: usarDatos } = await server.ssrLoadModule('/src/components/plantel/useDatosRendimiento.js')
    function Prueba({ categoria = 'c', activo = true }) {
      ultimaFuente = usarDatos(activo, categoria)
      return h('div', null, h('button', { disabled: ultimaFuente.cargando, onClick: ultimaFuente.actualizar }, 'Actualizar datos'), ultimaFuente.cargando ? 'Cargando' : ultimaFuente.datos?.etiqueta || 'Sin datos')
    }
    const render = async (categoria = 'c', activo = true) => act(async () => { root.render(h(Prueba, { categoria, activo })); await Promise.resolve() })
    await render(); assert.equal(lecturas.length, 1)
    assert.equal(document.querySelector('button').disabled, true)
    await resolver(0, 'Inicial'); assert.match(document.body.textContent, /Inicial/)
    let primera, segunda
    await act(async () => { primera = ultimaFuente.actualizar(); segunda = ultimaFuente.actualizar(); await Promise.resolve() })
    assert.ok(primera === segunda)
    assert.equal(lecturas.length, 2, 'Solo inicia una actualización para la misma identidad')
    await act(async () => { listener('SIGNED_IN', { user: { id: 'u2' } }); await Promise.resolve() })
    assert.equal(lecturas.length, 3)
    await resolver(2, 'Nueva sesión'); await resolver(1, 'Respuesta antigua')
    assert.match(document.body.textContent, /Nueva sesión/); assert.doesNotMatch(document.body.textContent, /Respuesta antigua/)
    await act(async () => { void ultimaFuente.actualizar(); await Promise.resolve() })
    await render('otra')
    assert.equal(lecturas.length, 5)
    await resolver(4, 'Categoría nueva'); await resolver(3, 'Categoría anterior')
    assert.match(document.body.textContent, /Categoría nueva/); assert.doesNotMatch(document.body.textContent, /Categoría anterior/)
    await render('otra', false); await render('otra', true)
    assert.equal(lecturas.length, 5, 'Alternar pestañas conserva la lectura')
    await act(async () => { void ultimaFuente.actualizar(); await Promise.resolve() })
    await act(async () => { listener('USER_UPDATED', { user: { id: 'u2' } }); await Promise.resolve() })
    assert.equal(lecturas.length, 7, 'Revalida incluso si una lectura estaba pendiente')
    await resolver(6, 'Perfil revalidado'); await resolver(5, 'Antes de revalidar')
    assert.match(document.body.textContent, /Perfil revalidado/)
    await act(async () => { listener('SIGNED_OUT', null); await Promise.resolve() })
    assert.equal(ultimaFuente.datos, null)
    assert.equal(lecturas.length, 7)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
