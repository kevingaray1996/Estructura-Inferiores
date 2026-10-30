// DOM temporal, sin navegador real, credenciales ni conexiones de aplicación.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Editor interactivo: colocar, arrastrar, propiedades, multiselección, historial y animación RAF', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previos = new Map()
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }) }
  for (const nombre of ['window', 'document', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent', 'KeyboardEvent']) global(nombre, dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT', true)
  global('DOMPoint', class { constructor(x,y) { this.x=x; this.y=y } matrixTransform() { return this } })
  let callbacks = new Map(), secuencia = 0
  global('requestAnimationFrame', fn => { callbacks.set(++secuencia,fn); return secuencia })
  global('cancelAnimationFrame', id => callbacks.delete(id))
  dom.window.confirm = () => true
  dom.window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
  dom.window.SVGElement.prototype.setPointerCapture = () => {}
  dom.window.SVGElement.prototype.hasPointerCapture = () => false
  const { createServer } = await import('vite'), React = await import('react'), { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const { act } = React
  const boton = texto => [...document.querySelectorAll('button')].find(b => b.textContent === texto || b.getAttribute('aria-label') === texto)
  const click = async texto => { const b = boton(texto); assert.ok(b, texto); await act(() => b.click()) }
  const evento = async (nodo, tipo, props) => { await act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, button: 0, ...props }); Object.defineProperty(e, 'pointerId', { value: props?.pointerId || 1 }); Object.defineProperty(e, 'pointerType', { value: props?.pointerType || 'mouse' }); nodo.dispatchEvent(e) }) }
  const key = async (tecla, ctrl = false) => act(() => document.querySelector('.pizarra').dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: tecla, ctrlKey: ctrl })))
  async function input(el, value) { await act(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value); el.dispatchEvent(new dom.window.Event('input',{bubbles:true})); el.dispatchEvent(new dom.window.Event('change',{bubbles:true})) }) }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    await act(() => root.render(React.createElement(Editor)))
    await click('Jugadoras')
    await click('Jugadora')
    await evento(document.querySelector('svg.pizarra-cancha'), 'pointerdown', { clientX: 10.5, clientY: 13.6 })
    assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,1)
    await click('↖ Seleccionar')
    const elemento = document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]')
    await evento(elemento,'pointerdown',{clientX:10.5,clientY:13.6})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointermove',{clientX:21,clientY:20.4})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointerup',{clientX:21,clientY:20.4})
    assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'), /translate\(21 /)
    const panel = document.querySelector('.pizarra-propiedades')
    await act(() => { document.querySelector('.pizarra-panel').open = true })
    await input(panel.querySelector('input[type=color]'),'#2563eb')
    assert.equal(document.querySelector('[data-elemento] circle').getAttribute('fill'),'#2563eb')
    const rango = [...panel.querySelectorAll('label')].find(l => l.textContent.includes('Rotación')).querySelector('input')
    await input(rango,'90')
    assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'), /rotate\(90\)/)
    await click('Duplicar selección'); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,2)
    await key('z',true); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,1)
    await click('↷ Rehacer'); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,2)
    await key('a',true); assert.match(document.querySelector('.pizarra-propiedades').textContent,/2 seleccionado/)
    await click('+ Agregar paso')
    await evento(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]'),'pointerdown',{clientX:21,clientY:20.4})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointermove',{clientX:70,clientY:40})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointerup',{clientX:70,clientY:40})
    await click('Reiniciar'); await click('▶ Reproducir')
    for (const t of [100,200,300,400]) { const pendientes=[...callbacks.values()]; callbacks.clear(); await act(() => pendientes.forEach(fn => fn(t))) }
    const transform = document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform')
    const x = Number(transform.match(/translate\(([^ ]+)/)[1]); assert.ok(x>21 && x<70,transform)
    await click('Pausar'); assert.equal(callbacks.size,0)
    await click('Reiniciar'); assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'),/translate\(21 /)
    // Las miniaturas son visuales; no crean un segundo editor ni interfieren con la cancha.
    assert.equal(document.querySelectorAll('.pizarra-paso svg').length, 2)
    await click('Materiales')
    assert.equal(document.querySelectorAll('.pizarra-objeto svg').length, 9)
    const transferencia = { datos: {}, setData(tipo, valor) { this.datos[tipo] = valor }, getData(tipo) { return this.datos[tipo] || '' }, types: ['application/x-comunicaciones-herramienta'] }
    const drag = async (nodo, tipo, datos = transferencia) => act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: 52.5, clientY: 34 }); Object.defineProperty(e, 'dataTransfer', { value: datos }); nodo.dispatchEvent(e) })
    await drag(boton('Cono'), 'dragstart')
    assert.equal(transferencia.getData('application/x-comunicaciones-herramienta'), 'cono')
    assert.ok(document.querySelector('.pizarra-soltar'))
    await drag(document.querySelector('svg.pizarra-cancha'), 'drop')
    assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length, 3)
    assert.match(document.querySelector('.pizarra-contexto').textContent, /Cono/)
    assert.equal(boton('↖ Seleccionar').getAttribute('aria-pressed'), 'true')
    await click('↻ Girar')
    assert.match(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]')[2].getAttribute('transform'), /rotate\(15\)/)
    await drag(document.querySelector('svg.pizarra-cancha'), 'drop', { getData: () => '<script>', types: [] })
    assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length, 3)
    const main = document.querySelector('svg.pizarra-cancha')
    const posiciones = [...main.querySelectorAll('[data-elemento]')].map(e => e.getAttribute('transform'))
    await evento(main, 'pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 10, clientY: 10 })
    await evento(main, 'pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 30, clientY: 10 })
    await evento(main, 'pointermove', { pointerType: 'touch', pointerId: 5, clientX: 50, clientY: 10 })
    assert.equal(document.querySelector('input[aria-label="Zoom de cancha"]').value, '2')
    assert.deepEqual([...main.querySelectorAll('[data-elemento]')].map(e => e.getAttribute('transform')), posiciones)
    await evento(main, 'pointerup', { pointerType: 'touch', pointerId: 5, clientX: 50, clientY: 10 })
    await evento(main, 'pointerup', { pointerType: 'touch', pointerId: 4, clientX: 10, clientY: 10 })
    await click('Ajustar vista')
    const cono = main.querySelectorAll('[data-elemento]')[2]
    await evento(cono, 'pointerdown', { pointerType: 'touch', pointerId: 6, clientX: 52.5, clientY: 34 })
    await evento(main, 'pointermove', { pointerType: 'touch', pointerId: 6, clientX: 63, clientY: 40.8 })
    await evento(main, 'pointerup', { pointerType: 'touch', pointerId: 6, clientX: 63, clientY: 40.8 })
    assert.match(cono.getAttribute('transform'), /translate\(63 /)
    await click('Canchas')
    assert.equal(document.querySelectorAll('.pizarra-superficie').length, 6)
    await click('Media cancha')
    assert.match(main.getAttribute('viewBox'), /58.5 74/)
    await click('Movimientos'); assert.equal(document.querySelectorAll('.pizarra-objeto svg').length, 7)
    await click('Dibujo'); assert.equal(document.querySelectorAll('.pizarra-objeto svg').length, 4)
    // El visor público conserva zoom táctil, pero no ofrece materiales ni propiedades.
    const { nuevaPizarra } = await import('../src/utils/pizarra.js')
    await act(() => root.render(React.createElement(Editor, { key: 'solo-lectura', inicial: nuevaPizarra(), soloLectura: true })))
    assert.equal(document.querySelector('.pizarra-biblioteca'), null)
    assert.equal(document.querySelector('.pizarra-contexto'), null)
    const visor = document.querySelector('svg.pizarra-cancha')
    await evento(visor, 'pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 10, clientY: 10 })
    await evento(visor, 'pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 30, clientY: 10 })
    await evento(visor, 'pointermove', { pointerType: 'touch', pointerId: 5, clientX: 50, clientY: 10 })
    assert.equal(document.querySelector('input[aria-label="Zoom de cancha"]').value, '2')
    assert.equal(visor.querySelectorAll('[data-elemento]').length, 0)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n,p] of previos) { if(p)Object.defineProperty(globalThis,n,p); else delete globalThis[n] }
  }
})
