import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Wellness de Inicio: fecha, actualización única, respuestas tardías, errores y privacidad al cambiar rol', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  function poner(k, v) { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const lecturas = [], pendientes = []
  let demorar = false, error = null, datos = [{ jugador_id: 'j', fatiga: 5 }]
  const jugadoras = [{ id: 'j', nombre: 'Nombre de prueba', apellido: 'Jugadora', foto_url: '/foto-prueba.jpg' }, { id: 'p', nombre: 'Pendiente' }]
  poner('__wellnessInicio', { from(tabla) {
    const filtros = []
    const q = { select() { return q }, ilike() { return q }, limit() { return q }, maybeSingle() { return q }, order() { return q },
      eq(k, v) { filtros.push([k, v]); return q }, in() { return q },
      then(ok, mal) {
        if (tabla === 'bienestar') {
          lecturas.push({ filtros })
          return (demorar ? new Promise(resolve => pendientes.push(resolve)) : Promise.resolve({ data: datos, error })).then(ok, mal)
        }
        return Promise.resolve({ data: tabla === 'categorias' ? { id: 'primera', es_reserva: false } : jugadoras }).then(ok, mal)
      } }
    return q
  } })
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'wellness-inicio-mock', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0wellness-inicio-db'; if (id.endsWith('/jugadoresCategoria')) return '\0wellness-inicio-jugadoras' },
    load(id) { if (id === '\0wellness-inicio-db') return 'export const supabase=globalThis.__wellnessInicio'; if (id === '\0wellness-inicio-jugadoras') return "export const obtenerJugadoresDeCategoria=(c)=>c.from('jugadores').select()" },
  }] })
  const root = createRoot(document.getElementById('root'))
  try {
    const { default: Wellness } = await server.ssrLoadModule('/src/components/inicio/WellnessInicio.jsx')
    const perfil = { id: 'u1', rol: 'coordinacion' }, destinos = []
    const render = async (p = perfil) => act(async () => { root.render(h(Wellness, { perfil: p, onCambiarSeccion: s => destinos.push(s) })); await Promise.resolve() })
    await render()
    assert.equal(lecturas.length, 1)
    assert.deepEqual([...document.querySelectorAll('.inicio-wellness-indicadores strong')].map(n => n.textContent), ['1', '1', '1', '2'])
    assert.match(document.body.textContent, /Alerta alta/)
    const foto = document.querySelector('.inicio-wellness-foto')
    await act(() => foto.dispatchEvent(new Event('error', { bubbles: true })))
    assert.equal(document.querySelector('.inicio-wellness-foto'), null)
    demorar = true
    const actualizar = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Actualizar Wellness'))
    await act(async () => { actualizar.click(); actualizar.click(); await Promise.resolve() })
    assert.equal(lecturas.length, 2)
    assert.equal(actualizar.disabled, true)
    const fecha = document.querySelector('input[type=date]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(fecha, '2026-10-15')
      fecha.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve()
    })
    assert.equal(lecturas.length, 3)
    assert.ok(lecturas.at(-1).filtros.some(([k, v]) => k === 'fecha' && v === '2026-10-15'))
    await act(async () => { pendientes[1]({ data: [], error: null }); await Promise.resolve() })
    assert.match(document.body.textContent, /Sin respuestas disponibles/)
    await act(async () => { pendientes[0]({ data: datos, error: null }); await Promise.resolve() })
    assert.doesNotMatch(document.body.textContent, /Alerta alta/)
    assert.equal(fecha.value, '2026-10-15')
    demorar = false; error = { code: '42501' }
    await act(async () => { actualizar.click(); await Promise.resolve() })
    assert.match(document.querySelector('[role=alert]').textContent, /no tiene acceso/)
    assert.doesNotMatch(document.body.textContent, /Sin respuestas disponibles|Sin alertas registradas/)
    error = null; datos = [{ jugador_id: 'j', fatiga: 1 }]
    await act(async () => { actualizar.click(); await Promise.resolve() })
    assert.match(document.body.textContent, /Sin alertas registradas/)
    const antes = lecturas.length
    await render({ id: 'u2', rol: 'medico' })
    assert.equal(lecturas.length, antes)
    assert.equal(document.querySelectorAll('.inicio-seguimiento-fila').length, 0)
    assert.doesNotMatch(document.body.textContent, /Nombre de prueba/)
    await act(() => document.querySelector('button').click())
    assert.equal(destinos.at(-1), 'bienestar')
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
