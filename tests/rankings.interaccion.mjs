import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Rankings integrado: carga compartida, filtros, podio real, modalidades, errores y navegación accesible sin servicios', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const jugadoras = ['a', 'b', 'c'].map((id, i) => ({ id, nombre: 'Nombre ' + id, apellido: 'Apellido', posicion: i === 2 ? 'Defensor central' : 'Arquero', categoria_id: 'cat', foto_url: '/foto-' + id + '.jpg' }))
  let listener, fallo = null, vacio = false
  const consultas = []
  poner('__rankingDB', { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u' } } } }),
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } } },
  }, from(tabla) {
    consultas.push(tabla)
    const q = { select() { return q }, eq() { return q }, in() { return q }, order() { return q }, range() { return q },
      then(ok, mal) {
        const data = tabla === 'partidos' ? [{ id: 'p', categoria_id: 'cat', fecha: '2026-10-31', rival: 'Rival simulado' }] :
          tabla === 'analisis_partidos' ? [{ id: 'x', categoria_id: 'cat', partido_calendario_id: 'p' }] :
          tabla === 'analisis_eventos' ? jugadoras.flatMap(j => [{ id: j.id + '1', partido_id: 'x', jugador_id: j.id, tipo: 'Pase correcto', resultado: null }, { id: j.id + '2', partido_id: 'x', jugador_id: j.id, tipo: 'Pase incorrecto', resultado: 'Fallido' }]) :
          jugadoras.map((j, i) => ({ id: j.id, partido_id: 'p', jugador_id: j.id, minutos_jugados: 90 - 30 * i, titular: true }))
        return Promise.resolve({ data: fallo ? null : vacio ? [] : data, error: fallo }).then(ok, mal)
      } }
    return q
  } })
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'ranking-mock', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0ranking-db' }, load(id) { if (id === '\0ranking-db') return 'export const supabase=globalThis.__rankingDB' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await new Promise(r => setTimeout(r, 5)) }) }
  const cambiar = async (el, valor) => act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set.call(el, valor)
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
  const tab = id => document.querySelector(`[role=tab][id$="${id}"]`)
  const panel = () => document.querySelector('[role=tabpanel]:not([hidden])')
  const control = etiqueta => [...panel().querySelectorAll('label')].find(l => l.firstChild.textContent === etiqueta)?.querySelector('select,input')
  const ids = () => [...panel().querySelectorAll('[data-ranking-id]')].map(el => el.dataset.rankingId)
  try {
    const { default: Centro } = await server.ssrLoadModule('/src/components/plantel/RendimientoPlantel.jsx')
    const render = async (lista, activo = true) => act(async () => { root.render(h(Centro, { activo, jugadoras: lista, estadisticas: {}, formacion: '4-4-2', FotoJugadora: () => h('span', null, 'Foto') })); await new Promise(r => setTimeout(r, 10)) })
    await render(jugadoras, false); assert.equal(consultas.length, 0)
    await render(jugadoras); assert.equal(consultas.length, 4)
    await click(panel().querySelector('.comparativas-selector button'))
    await click(tab('rankings'))
    assert.equal(tab('rankings').getAttribute('aria-selected'), 'true')
    assert.deepEqual(ids(), ['a', 'b', 'c'])
    assert.equal(panel().querySelectorAll('[data-podio-id]').length, 3)
    assert.equal(panel().querySelectorAll('.ranking-podio img').length, 3)
    assert.equal(consultas.length, 4, 'Cambiar de pestaña no repite las cuatro lecturas')
    for (const n of [1, 2, 3]) { await render(jugadoras.slice(0, n)); assert.equal(panel().querySelectorAll('[data-podio-id]').length, n) }
    await cambiar(control('Puesto o grupo'), 'puesto:Arquero'); assert.deepEqual(ids(), ['a', 'b'])
    await cambiar(control('Indicador'), 'recuperaciones')
    assert.match(panel().textContent, /0 acciones registradas/)
    await cambiar(control('Indicador'), 'precision')
    assert.equal(control('Modalidad').value, 'porcentaje')
    assert.match(panel().textContent, /50%/)
    assert.match(panel().textContent, /1 \/ 2 pases registrados/)
    assert.deepEqual([...panel().querySelectorAll('.ranking-lista .ranking-puesto')].map(el => el.textContent), ['#1', '#1'])
    await cambiar(control('Indicador'), 'pasesCorrectos'); await cambiar(control('Modalidad'), 'por90')
    assert.deepEqual(ids(), ['b', 'a'])
    await cambiar(control('Partido'), 'p')
    await cambiar(control('Desde'), '2026-11-01')
    assert.equal(ids().length, 0)
    assert.equal(panel().querySelectorAll('[data-podio-id]').length, 0)
    assert.match(panel().textContent, /Sin partidos accesibles/)
    await click(tab('comparativas'))
    assert.equal(control('Partido').value, 'p')
    assert.equal(control('Desde').value, '2026-11-01')
    await cambiar(control('Desde'), '')
    await click(tab('rankings')); assert.equal(control('Desde').value, '')
    assert.equal(consultas.length, 4, 'Los filtros compartidos son locales')
    await act(() => { tab('rankings').focus(); tab('rankings').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    assert.ok(document.activeElement === tab('evolucion'))
    await click(tab('evolucion')); assert.match(panel().textContent, /Evolución/)
    assert.equal(control('Partido').value, 'p', 'Evolución conserva el filtro deportivo compartido')
    await click(panel().querySelector('.evolucion-selector button'))
    assert.equal(panel().querySelectorAll('[data-punto]').length, 1)
    await cambiar(control('Desde'), '2026-11-01')
    assert.equal(panel().querySelectorAll('[data-punto]').length, 0)
    await click(tab('comparativas')); assert.equal(control('Desde').value, '2026-11-01')
    await cambiar(control('Desde'), '')
    await click(tab('formaciones')); assert.match(panel().textContent, /Formación automática por minutos/)
    await click(tab('rankings')); assert.deepEqual(ids(), ['b', 'a'])
    assert.equal(consultas.length, 4, 'Evolución y Formaciones no duplican las lecturas de las otras vistas')
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Actualizar datos'))
    assert.equal(consultas.length, 8)
    assert.deepEqual(ids(), ['b', 'a'])
    assert.equal(control('Partido').value, 'p')
    assert.equal(control('Modalidad').value, 'por90')
    await click(tab('comparativas'))
    assert.equal(panel().querySelectorAll('.comparativas-selector button[aria-pressed="true"]').length, 1)
    await click(tab('evolucion'))
    assert.equal(panel().querySelectorAll('.evolucion-selector button[aria-pressed="true"]').length, 1)
    await click(tab('rankings'))
    fallo = { code: '42501' }
    await act(async () => { listener('USER_UPDATED', { user: { id: 'u' } }); await new Promise(r => setTimeout(r, 10)) })
    assert.match(panel().querySelector('[role=alert]').textContent, /no tiene acceso/)
    assert.doesNotMatch(panel().textContent, /Sin partidos accesibles/)
    assert.equal(ids().length, 0)
    fallo = { message: 'Failed to fetch' }
    await click([...panel().querySelectorAll('button')].find(b => b.textContent === 'Reintentar lectura'))
    assert.match(panel().textContent, /No se pudo consultar esta fuente/)
    fallo = null; vacio = true
    await click([...panel().querySelectorAll('button')].find(b => b.textContent === 'Reintentar lectura'))
    assert.match(panel().textContent, /Sin partidos accesibles/)
    assert.equal(panel().querySelectorAll('[role=alert]').length, 0)
    await act(() => listener('SIGNED_OUT', null))
    assert.match(panel().textContent, /sesión autenticada/)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
