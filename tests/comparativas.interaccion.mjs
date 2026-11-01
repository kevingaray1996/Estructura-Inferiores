import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Comparativas reales con fuentes simuladas: selección, filtros, radar y acceso diferido', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const jugadoras = Array.from({ length: 11 }, (_, i) => ({ id: `j${i}`, nombre: `Ana${i}`, apellido: 'Real', posicion: 'Arquero', categoria_id: 'c', foto_url: '/foto.jpg' }))
  const llamadas = []
  let auth, denegar = false, fallaConexion = false, sinPartidos = false
  poner('__comparativasDB', {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), onAuthStateChange: fn => { auth = fn; return { data: { subscription: { unsubscribe() {} } } } } },
    from(tabla) { llamadas.push(tabla); const q = { select() { return q }, eq() { return q }, in() { return q }, order() { return q }, range() { return q },
      then(ok, mal) {
        const data = tabla === 'partidos' ? [{ id: 'p', categoria_id: 'c', fecha: '2026-10-31', rival: 'Rival' }] : tabla === 'analisis_partidos' ? [{ id: 'a', categoria_id: 'c', partido_calendario_id: 'p' }] :
          tabla === 'analisis_eventos' ? jugadoras.map((j, i) => ({ id: `e${i}`, jugador_id: j.id, partido_id: 'a', tipo: 'Pase correcto', resultado: 'Exitoso' })) :
          jugadoras.map((j, i) => ({ id: j.id, jugador_id: j.id, partido_id: 'p', minutos_jugados: i === 0 ? null : 90, titular: true }))
        const error = denegar ? { code: '42501' } : fallaConexion ? { message: 'Failed to fetch' } : null
        return Promise.resolve({ data: error ? null : sinPartidos ? [] : data, error }).then(ok, mal)
      } }; return q },
  })
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'comparativas-mock', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0comparativas-db' }, load(id) { if (id === '\0comparativas-db') return 'export const supabase=globalThis.__comparativasDB' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const click = async b => { assert.ok(b); await act(async () => { b.click(); await new Promise(r => setTimeout(r, 0)) }) }
  const cambiar = async (el, valor) => act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set.call(el, valor)
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
  try {
    const { default: Comparativas } = await server.ssrLoadModule('/src/components/plantel/ComparativasPlantel.jsx')
    await act(async () => { root.render(h(Comparativas, { activo: false, categoriaId: 'c', jugadoras })); await new Promise(r => setTimeout(r, 5)) })
    assert.equal(llamadas.length, 0)
    await act(async () => { root.render(h(Comparativas, { activo: true, categoriaId: 'c', jugadoras })); await new Promise(r => setTimeout(r, 10)) })
    assert.equal(llamadas.length, 4)
    const opciones = () => [...document.querySelectorAll('.comparativas-selector button')]
    await click(opciones()[0]); await click(opciones()[1])
    assert.ok(document.querySelector('svg[role=img]'))
    assert.equal(document.querySelectorAll('tbody tr').length, 12)
    assert.match(document.body.textContent, /100%/)
    const filaPrecision = [...document.querySelectorAll('tbody tr')].find(tr => tr.querySelector('th').textContent === 'Precisión de pases')
    assert.match(filaPrecision.textContent, /1 \/ 1 pases registrados/)
    assert.doesNotMatch(filaPrecision.textContent, /evaluad/)
    const filaEfectividad = [...document.querySelectorAll('tbody tr')].find(tr => tr.querySelector('th').textContent === 'Efectividad evaluada')
    assert.match(filaEfectividad.textContent, /acciones evaluadas/)
    const radar = document.querySelector('svg[role=img]')
    const indicadores = document.getElementById(radar.getAttribute('aria-describedby'))
    assert.equal(indicadores.querySelectorAll('li').length, 6)
    for (const eje of indicadores.querySelectorAll('li strong')) {
      assert.ok([...document.querySelectorAll('tbody th')].some(th => th.textContent === eje.textContent), 'Los ejes tienen su indicador real en la tabla')
    }
    assert.match(indicadores.textContent, /pases registrados/)
    const buscar = document.querySelector('input[type=search]')
    await cambiar(buscar, 'SinCoincidenciasXYZ')
    assert.match(document.body.textContent, /No se encontraron jugadoras con esa búsqueda/)
    assert.equal(opciones().length, 0)
    assert.equal(document.querySelectorAll('.comparativas-elegidas button').length, 2)
    assert.equal(document.querySelectorAll('tbody th').length, 12)
    assert.equal(document.querySelectorAll('.comparativas-radar > g[opacity]').length, 2)
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Limpiar búsqueda'))
    assert.ok(document.activeElement === buscar, 'Limpiar conserva el foco en el campo para continuar con teclado')
    assert.equal(buscar.value, '')
    assert.equal(opciones().filter(b => b.getAttribute('aria-pressed') === 'true').length, 2)
    assert.equal(document.querySelector('input[type=checkbox]').disabled, false)
    await click(document.querySelector('input[type=checkbox]'))
    assert.match(document.body.textContent, /Percentil no disponible/)
    assert.equal(document.querySelector('.comparativas-radar > g[opacity]').querySelectorAll('circle').length, 0)
    assert.match(filaPrecision.textContent, /100%/, 'La estadística real no desaparece al faltar elegibilidad del percentil')
    await click(document.querySelector('input[type=checkbox]'))
    for (let i = 2; i < 7; i++) await click(opciones()[i])
    assert.equal(opciones().filter(b => b.getAttribute('aria-pressed') === 'true').length, 6)
    assert.match(document.body.textContent, /Alcanzaste seis/)
    await cambiar(document.querySelector('input[type=date]'), '2026-11-01')
    assert.match(document.body.textContent, /Sin partidos accesibles/)
    assert.equal(llamadas.length, 4, 'Los filtros no repiten lecturas')
    await cambiar(document.querySelector('select'), 'libre')
    assert.equal(opciones().filter(b => b.getAttribute('aria-pressed') === 'true').length, 0)
    denegar = true
    await act(async () => { auth('SIGNED_IN', { user: { id: 'otro' } }); await new Promise(r => setTimeout(r, 10)) })
    assert.match(document.body.textContent, /no tiene acceso/)
    assert.equal(document.querySelectorAll('[role=alert]').length > 0, true)
    assert.doesNotMatch(document.body.textContent, /Sin partidos accesibles en este rango/)
    denegar = false; fallaConexion = true
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Reintentar lectura'))
    assert.match(document.body.textContent, /No se pudo consultar esta fuente/)
    assert.doesNotMatch(document.body.textContent, /Sin partidos accesibles en este rango|no tiene acceso/)
    fallaConexion = false; sinPartidos = true
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Reintentar lectura'))
    assert.match(document.body.textContent, /Sin partidos accesibles en este rango/)
    assert.equal(document.querySelectorAll('[role=alert]').length, 0)
    await act(async () => { auth('SIGNED_OUT', null) })
    assert.match(document.body.textContent, /sesión autenticada/)
    assert.equal(document.querySelectorAll('svg').length, 0)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
