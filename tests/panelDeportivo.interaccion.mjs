import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Premium: pestañas controladas, teclado, paneles estables, reintento y proveedor de apariencia existente', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const previos = new Map()
  const poner = (n, valor) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: valor, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'KeyboardEvent', 'MouseEvent']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  let oscuroSistema = false
  const oyentes = new Set()
  window.matchMedia = () => ({ get matches() { return oscuroSistema }, addEventListener(_, fn) { oyentes.add(fn) }, removeEventListener(_, fn) { oyentes.delete(fn) } })
  const { act, createElement: h, useContext, useEffect, useState } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  let montajes = 0, reintentos = 0
  const seleccionados = []
  const click = async el => { assert.ok(el); await act(() => el.click()) }
  const tecla = async (el, key) => act(() => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
  try {
    const modulo = async n => (await server.ssrLoadModule(`/src/components/ui/${n}.jsx`)).default
    const Pestanas = await modulo('PestanasAccesibles'), Estado = await modulo('EstadoContenido')
    const { default: Proveedor } = await server.ssrLoadModule('/src/appearance/ProveedorApariencia.jsx')
    const { ContextoApariencia } = await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    function Formulario() {
      useEffect(() => { montajes++ }, [])
      return h('input', { 'aria-label': 'Anotación', defaultValue: 'Sin guardar' })
    }
    function Ejemplo() {
      const [seleccionada, seleccionar] = useState('a')
      const { establecerPreferencia } = useContext(ContextoApariencia)
      return h('div', null,
        ...['claro', 'oscuro', 'sistema'].map(p => h('button', { key: p, onClick: () => establecerPreferencia(p), 'data-tema': p }, p)),
        h(Pestanas, { etiqueta: 'Perfil de prueba', seleccionada, onSeleccionar(id) { seleccionados.push(id); seleccionar(id) }, pestanas: [
          { id: 'a', etiqueta: 'Resumen', contenido: h(Formulario) },
          { id: 'deshabilitada', etiqueta: 'Reservada', deshabilitada: true, contenido: 'No habilitado' },
          { id: 'b', etiqueta: 'Videos', contenido: h('video', { 'aria-label': 'Video de prueba' }) },
          { id: 'c', etiqueta: 'Evaluaciones', contenido: 'Historial' },
        ] }),
        h(Pestanas, { pestanas: [{ id: 'a', etiqueta: 'Otra instancia', contenido: 'Otro panel' }], seleccionada: 'a' }),
        h(Estado, { estado: 'error', onReintentar() { reintentos++ } }))
    }
    await act(async () => { root.render(h(Proveedor, null, h(Ejemplo))); await Promise.resolve() })
    const tabs = () => [...document.querySelector('[aria-label="Perfil de prueba"]').querySelectorAll('[role="tab"]')]
    const input = document.querySelector('input'), video = document.querySelector('video')
    input.value = 'Edición conservada'; video.currentTime = 37
    assert.equal(montajes, 1)
    assert.equal(new Set([...document.querySelectorAll('[id]')].map(n => n.id)).size, document.querySelectorAll('[id]').length)
    for (const tab of tabs()) {
      const panel = document.getElementById(tab.getAttribute('aria-controls'))
      assert.ok(panel); assert.equal(panel.getAttribute('aria-labelledby'), tab.id)
    }
    await act(() => tabs()[0].focus())
    await tecla(tabs()[0], 'ArrowRight')
    assert.ok(document.activeElement === tabs()[2], 'Salta la deshabilitada')
    assert.equal(tabs()[0].getAttribute('aria-selected'), 'true', 'Mover foco no activa ni cambia datos')
    assert.equal(seleccionados.length, 0)
    await tecla(tabs()[2], 'End'); assert.ok(document.activeElement === tabs()[3])
    await tecla(tabs()[3], 'ArrowRight'); assert.ok(document.activeElement === tabs()[0])
    await tecla(tabs()[0], 'ArrowLeft'); assert.ok(document.activeElement === tabs()[3])
    await tecla(tabs()[3], 'Home'); assert.ok(document.activeElement === tabs()[0])
    // JSDOM no sintetiza el clic nativo de Enter/Espacio en botones; se comprueba
    // el contrato button + activación y no se presenta esto como prueba de navegador.
    assert.equal(tabs()[2].tagName, 'BUTTON')
    await click(tabs()[2]); assert.deepEqual(seleccionados, ['b'])
    assert.ok(document.getElementById(tabs()[0].getAttribute('aria-controls')).hidden)
    assert.equal(document.getElementById(tabs()[2].getAttribute('aria-controls')).hidden, false)
    for (const tema of ['claro', 'oscuro', 'sistema']) {
      await click(document.querySelector(`[data-tema="${tema}"]`))
      assert.equal(document.documentElement.dataset.apariencia, tema === 'sistema' ? 'claro' : tema)
      assert.ok(document.querySelector('input') === input); assert.equal(input.value, 'Edición conservada')
      assert.ok(document.querySelector('video') === video); assert.equal(video.currentTime, 37)
    }
    await act(() => { oscuroSistema = true; for (const fn of oyentes) fn() })
    assert.equal(document.documentElement.dataset.apariencia, 'oscuro')
    await click(tabs()[0]); assert.equal(input.value, 'Edición conservada'); assert.equal(montajes, 1)
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Reintentar'))
    assert.equal(reintentos, 1)
    assert.equal(document.querySelector('[role="alert"]').textContent.includes('No se pudo cargar'), true)
    await act(() => root.render(h(Pestanas, { seleccionada: 'retirada', pestanas: [{ id: 'unica', etiqueta: 'Única', contenido: 'Datos' }] })))
    assert.equal(document.querySelector('[role="tab"]').getAttribute('aria-selected'), 'true')
    await act(() => root.render(h(Pestanas, { pestanas: [{ id: 'a', etiqueta: 'Sin acceso', deshabilitada: true }] })))
    assert.equal(document.querySelector('[role="tab"]').tabIndex, -1)
    assert.ok(document.querySelector('[role="tabpanel"]').hidden)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, descriptor] of previos) { if (descriptor) Object.defineProperty(globalThis, n, descriptor); else delete globalThis[n] }
  }
})
