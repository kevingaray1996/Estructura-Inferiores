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
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), React = await import('react'), { createRoot } = await import('react-dom/client')
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
    // Sin nada seleccionado no hay panel de propiedades.
    assert.equal(document.querySelector('.pizarra-propiedades'), null)
    await click('Agregar a la cancha')
    await click('Jugadora')
    assert.equal(document.querySelector('.pizarra-agregar-menu'), null, 'el menú se pliega al elegir')
    await evento(document.querySelector('svg.pizarra-cancha'), 'pointerdown', { clientX: 10.5, clientY: 13.6 })
    assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,1)
    await click('Listo')
    const elemento = document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]')
    await evento(elemento,'pointerdown',{clientX:10.5,clientY:13.6})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointermove',{clientX:21,clientY:20.4})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointerup',{clientX:21,clientY:20.4})
    assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'), /translate\(21 /)
    const panel = document.querySelector('.pizarra-propiedades')
    assert.match(panel.textContent, /Propia/); assert.ok([...panel.querySelectorAll('label')].some(l => l.textContent.startsWith('Número')))
    await input(panel.querySelector('input[type=color]'),'#2563eb')
    assert.equal(document.querySelector('[data-elemento] circle').getAttribute('fill'),'#2563eb')
    await click('↻ Girar')
    assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'), /rotate\(15\)/)
    await click('Duplicar selección'); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,2)
    await key('z',true); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,1)
    await click('Rehacer'); assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length,2)
    await key('a',true); assert.match(document.querySelector('.pizarra-propiedades').textContent,/2 seleccionado/)
    await click('Agregar paso')
    await evento(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]'),'pointerdown',{clientX:21,clientY:20.4})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointermove',{clientX:70,clientY:40})
    await evento(document.querySelector('svg.pizarra-cancha'),'pointerup',{clientX:70,clientY:40})
    await click('Ir al primer paso'); await click('Reproducir')
    for (const t of [100,200,300,400]) { const pendientes=[...callbacks.values()]; callbacks.clear(); await act(() => pendientes.forEach(fn => fn(t))) }
    const transform = document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform')
    const x = Number(transform.match(/translate\(([^ ]+)/)[1]); assert.ok(x>21 && x<70,transform)
    await click('Pausar'); assert.equal(callbacks.size,0)
    await click('Ir al primer paso'); assert.match(document.querySelector('svg.pizarra-cancha').querySelector('[data-elemento]').getAttribute('transform'),/translate\(21 /)
    // Chips con número grande y subtítulo (sin miniaturas).
    assert.deepEqual([...document.querySelectorAll('.pizarra-chip b')].map(b => b.textContent), ['1', '2'])
    assert.equal(document.querySelectorAll('.pizarra-chip svg').length, 0)
    // Menú: los grupos están todos a la vista, con las formaciones.
    await click('Agregar a la cancha')
    assert.equal(document.querySelectorAll('.pizarra-agregar-menu .pizarra-objeto').length, 23)
    assert.equal(document.querySelectorAll('.pizarra-agregar-formaciones button').length, 6)
    await click('Cono')
    await evento(document.querySelector('svg.pizarra-cancha'), 'pointerdown', { clientX: 52.5, clientY: 34 })
    assert.equal(document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]').length, 3)
    assert.match(document.querySelector('.pizarra-propiedades').textContent, /Cono/)
    await click('Listo')
    assert.equal(document.querySelector('.pizarra-colocando-aviso'), null)
    await click('↻ Girar')
    // Se dibuja por capas (materiales debajo de las jugadoras): se busca la ficha seleccionada, no la última.
    const seleccionada = () => [...document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]')].find(g => g.querySelector('[data-seleccion]'))
    assert.match(seleccionada().getAttribute('transform'), /rotate\(15\)/)
    await click('Cerrar propiedades')
    assert.equal(document.querySelector('.pizarra-propiedades'), null)
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
    const cono = [...main.querySelectorAll('[data-elemento]')].find(g => g.getAttribute('transform').startsWith('translate(52.5 34)'))
    await evento(cono, 'pointerdown', { pointerType: 'touch', pointerId: 6, clientX: 52.5, clientY: 34 })
    await evento(main, 'pointermove', { pointerType: 'touch', pointerId: 6, clientX: 63, clientY: 40.8 })
    await evento(main, 'pointerup', { pointerType: 'touch', pointerId: 6, clientX: 63, clientY: 40.8 })
    assert.match(cono.getAttribute('transform'), /translate\(63 /)
    assert.equal(document.querySelectorAll('select[aria-label="Superficie"] option').length, 6)
    await click('Media cancha')
    assert.match(main.getAttribute('viewBox'), /58.5 74/)
    // El visor público conserva zoom táctil, pero no ofrece materiales ni propiedades.
    const { nuevaPizarra } = await import('../src/utils/pizarra.js')
    await act(() => root.render(React.createElement(Editor, { key: 'solo-lectura', inicial: nuevaPizarra(), soloLectura: true })))
    assert.equal(document.querySelector('.pizarra-agregar'), null)
    assert.equal(document.querySelector('.pizarra-paso-panel'), null)
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

test('Etapa 1: colocación encadenada, flechas con el dedo, extremos, temblor, aviso de borrado y arrastre desde la barra', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previos = new Map()
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }) }
  for (const nombre of ['window', 'document', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent', 'KeyboardEvent']) global(nombre, dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT', true)
  global('DOMPoint', class { constructor(x, y) { this.x = x; this.y = y } matrixTransform() { return this } })
  global('requestAnimationFrame', () => 1); global('cancelAnimationFrame', () => {})
  dom.window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
  dom.window.SVGElement.prototype.setPointerCapture = () => {}
  dom.window.SVGElement.prototype.hasPointerCapture = () => false
  dom.window.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 111, bottom: 74, width: 111, height: 74 })
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), React = await import('react'), { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const { act } = React
  const barra = nombre => document.querySelector(`.pizarra-agregar-menu button[aria-label="${nombre}"]`)
  const boton = texto => [...document.querySelectorAll('button')].find(b => b.textContent === texto || b.getAttribute('aria-label') === texto)
  const abrirMenu = async () => { if (!document.querySelector('.pizarra-agregar-menu')) await act(() => boton('Agregar a la cancha').click()) }
  const herramienta = async nombre => { await abrirMenu(); await act(() => barra(nombre).click()) }
  const sinHerramienta = () => document.querySelector('.pizarra-colocando-aviso') === null
  const listo = async () => act(() => document.querySelector('.pizarra-colocando-aviso button').click())
  const evento = async (nodo, tipo, props = {}) => { await act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, ...props }); Object.defineProperty(e, 'pointerId', { value: props.pointerId || 1 }); Object.defineProperty(e, 'pointerType', { value: props.pointerType || 'touch' }); nodo.dispatchEvent(e) }) }
  const cancha = () => document.querySelector('svg.pizarra-cancha')
  const elementos = () => [...cancha().querySelectorAll('[data-elemento]')]
  const posicion = nodo => nodo.getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(n => Math.round(Number(n)))
  const toque = async (x, y) => { await evento(cancha(), 'pointerdown', { clientX: x, clientY: y }); await evento(cancha(), 'pointerup', { clientX: x, clientY: y }) }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    await act(() => root.render(React.createElement(Editor, { onGuardar() {} })))
    assert.ok(sinHerramienta())
    // La herramienta queda activa: tres toques, tres jugadoras numeradas.
    await herramienta('Jugadora')
    for (const x of [10, 20, 30]) await toque(x, 10)
    assert.deepEqual(elementos().map(e => e.querySelector('text').textContent), ['1', '2', '3'])
    await herramienta('Rival')
    await toque(60, 40)
    assert.equal(elementos().at(-1).querySelector('text').textContent, '1')
    assert.match(document.querySelector('.pizarra-propiedades').textContent, /Rival/)
    // Elegir de nuevo la herramienta activa la suelta.
    await herramienta('Rival')
    assert.ok(sinHerramienta())
    // Pase: arrastrar de la salida al destino.
    await herramienta('Pase')
    await evento(cancha(), 'pointerdown', { clientX: 10, clientY: 50 })
    await evento(cancha(), 'pointermove', { clientX: 40, clientY: 60 })
    await evento(cancha(), 'pointerup', { clientX: 40, clientY: 60 })
    const pase = elementos().find(e => e.querySelector('[data-extremo]'))
    assert.deepEqual(posicion(pase), [10, 50])
    assert.equal(elementos().length, 5)
    const golpe = () => pase.querySelector('path[stroke="transparent"]').getAttribute('d').match(/L([^ ]+) ([^ ]+)/).slice(1).map(Number)
    assert.deepEqual(golpe().map(Math.round), [30, 10])
    // La punta se mueve con su manija.
    await listo()
    const punta = pase.querySelector('[data-extremo="punta"]')
    assert.ok(punta)
    await evento(punta, 'pointerdown', { clientX: 40, clientY: 60 })
    await evento(cancha(), 'pointermove', { clientX: 70, clientY: 20 })
    await evento(cancha(), 'pointerup', { clientX: 70, clientY: 20 })
    assert.deepEqual(golpe().map(Math.round), [60, -30])
    assert.deepEqual(posicion(pase), [10, 50])
    // Un toque con temblor (menos de 4 px) no mueve ni agrega historial.
    const jugadora = elementos()[0], antes = jugadora.getAttribute('transform')
    await act(() => boton('Deshacer').click())
    assert.deepEqual(golpe().map(Math.round), [30, 10])
    await act(() => boton('Rehacer').click())
    await evento(jugadora, 'pointerdown', { clientX: 10, clientY: 10 })
    await evento(cancha(), 'pointermove', { clientX: 11, clientY: 11 })
    await evento(cancha(), 'pointerup', { clientX: 11, clientY: 11 })
    assert.equal(jugadora.getAttribute('transform'), antes)
    assert.equal(boton('Rehacer').disabled, true)
    // Borrar no pregunta: avisa y permite deshacer.
    await act(() => boton('Eliminar selección').click())
    assert.equal(elementos().length, 4)
    assert.match(document.querySelector('.pizarra-aviso').textContent, /eliminado/)
    await act(() => document.querySelector('.pizarra-aviso button').click())
    assert.equal(elementos().length, 5)
    assert.equal(document.querySelector('.pizarra-aviso'), null)
    // Arrastrar un cono desde el menú hasta la cancha con el dedo: el menú se pliega y el arrastre sigue.
    await abrirMenu()
    await evento(barra('Cono'), 'pointerdown', { pointerId: 9, clientX: 50, clientY: 300 })
    await evento(document.body, 'pointermove', { pointerId: 9, clientX: 52, clientY: 200 })
    assert.ok(document.querySelector('.pizarra-fantasma'))
    assert.equal(document.querySelector('.pizarra-agregar-menu'), null, 'el menú se pliega al arrastrar')
    await evento(document.body, 'pointermove', { pointerId: 9, clientX: 52.5, clientY: 34 })
    await evento(document.body, 'pointerup', { pointerId: 9, clientX: 52.5, clientY: 34 })
    assert.equal(document.querySelector('.pizarra-fantasma'), null)
    assert.equal(elementos().length, 6)
    assert.match(elementos().find(g => g.querySelector('[data-seleccion]')).getAttribute('transform'), /^translate\(52.5 34\)/)
    assert.ok(sinHerramienta())
    // Con el dedo el menú se activa al levantarlo, sin depender del click.
    await abrirMenu()
    await evento(barra('Pelota'), 'pointerdown', { pointerId: 11, clientX: 5, clientY: 300 })
    await evento(barra('Pelota'), 'pointerup', { pointerId: 11, clientX: 5, clientY: 300 })
    assert.match(document.querySelector('.pizarra-colocando-aviso').textContent, /Pelota/)
    await listo()
    // Media cancha desde la barra superior.
    await act(() => boton('Media cancha').click())
    assert.match(cancha().getAttribute('viewBox'), /58.5 74/)
    // El menú se abre y se cierra con su botón.
    await abrirMenu()
    assert.ok(document.querySelector('.pizarra-agregar-menu'))
    await act(() => boton('Cerrar menú').click())
    assert.equal(document.querySelector('.pizarra-agregar-menu'), null)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, p] of previos) { if (p) Object.defineProperty(globalThis, n, p); else delete globalThis[n] }
  }
})
