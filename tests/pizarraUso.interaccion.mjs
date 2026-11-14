// Ronda de uso en el editor: pasos a la vista (eliminar con deshacer, duplicar, arrastrar y Alt+flechas),
// panel del paso siempre visible y formación desde el menú "＋ Agregar".
// DOM temporal, sin navegador real, credenciales ni conexiones de aplicación.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const pose = (x, y) => ({ x, y, rotacion: 0 })
const INICIAL = { version: 2, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1, recorrido: 'suave', placa: { titulo: '', analista: '' },
  elementos: [{ id: 'a', tipo: 'jugadora', color: '#F2C230', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero: '6', vinculo: null }],
  pasos: ['Uno', 'Dos', 'Tres'].map((texto, i) => ({ id: `p${i}`, nombre: `Paso ${i + 1}`, duracion: 2, texto, pausa: 0, pase: 'bajo', foco: null, ocultos: [], poses: { a: pose(20 + i * 10, 50) } })) }

test('Pasos a la vista: eliminar con deshacer, duplicar, reordenar arrastrando y con Alt+flechas; formación desde el menú', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previos = new Map()
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }) }
  for (const nombre of ['window', 'document', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent', 'KeyboardEvent']) global(nombre, dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT', true)
  global('DOMPoint', class { constructor(x, y) { this.x = x; this.y = y } matrixTransform() { return this } })
  global('requestAnimationFrame', () => 1); global('cancelAnimationFrame', () => {})
  let confirmado = 0
  dom.window.confirm = () => { confirmado++; return true }
  dom.window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
  dom.window.SVGElement.prototype.setPointerCapture = () => {}
  dom.window.SVGElement.prototype.hasPointerCapture = () => false
  dom.window.HTMLElement.prototype.setPointerCapture = () => {}
  // Chips apilados: cada uno ocupa 60 px de alto (la lista vertical de la compu).
  const rectOriginal = dom.window.HTMLElement.prototype.getBoundingClientRect
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (!this.classList.contains('pizarra-chip-caja')) return rectOriginal.call(this)
    const i = [...this.parentNode.children].indexOf(this)
    return { left: 0, right: 300, width: 300, top: i * 60, bottom: i * 60 + 52, height: 52, x: 0, y: i * 60 }
  }
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), React = await import('react'), { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const { act } = React
  const boton = texto => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === texto || b.getAttribute('aria-label') === texto)
  const click = async texto => { const b = boton(texto); assert.ok(b, texto); await act(() => b.click()) }
  const textos = () => [...document.querySelectorAll('.pizarra-chip-texto')].map(n => n.textContent)
  const elegido = () => document.querySelector('.pizarra-chip[aria-pressed="true"] b').textContent
  const evento = async (nodo, tipo, props) => { await act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, ...props }); Object.defineProperty(e, 'pointerId', { value: 3 }); Object.defineProperty(e, 'pointerType', { value: 'mouse' }); nodo.dispatchEvent(e) }) }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    await act(() => root.render(React.createElement(Editor, { inicial: INICIAL, onGuardar() {} })))

    // Chips con número grande y subtítulo; el panel del paso está a la vista sin abrir nada.
    assert.deepEqual(textos(), ['Uno', 'Dos', 'Tres'])
    assert.ok(document.querySelector('.pizarra-paso-panel textarea'))
    assert.equal(document.querySelector('.pizarra-paso-panel textarea').value, 'Uno')

    // Eliminar desde la ✕ del chip, con aviso y deshacer.
    await click('Eliminar paso 2')
    assert.deepEqual(textos(), ['Uno', 'Tres'])
    assert.match(document.querySelector('.pizarra-aviso').textContent, /Paso eliminado/)
    await act(() => document.querySelector('.pizarra-aviso button').click())
    assert.deepEqual(textos(), ['Uno', 'Dos', 'Tres'])

    // Duplicar el paso elegido: la copia queda a continuación y elegida.
    await click('Paso 2: Paso 2')
    await click('Duplicar paso')
    assert.deepEqual(textos(), ['Uno', 'Dos', 'Dos', 'Tres'])
    assert.equal(elegido(), '3')
    await act(() => root.render(React.createElement(Editor, { key: 'otra', inicial: INICIAL, onGuardar() {} })))

    // Arrastrar el chip 1 hasta el lugar del 3 con el mouse: se reordena y el paso movido queda elegido.
    const cajas = () => [...document.querySelectorAll('.pizarra-chip-caja')]
    await evento(cajas()[0], 'pointerdown', { clientX: 100, clientY: 26 })
    await evento(cajas()[0], 'pointermove', { clientX: 100, clientY: 60 })
    assert.ok(document.querySelector('.pizarra-chip-destino'), 'marca dónde va a caer')
    await evento(cajas()[0], 'pointermove', { clientX: 100, clientY: 146 })
    await evento(cajas()[0], 'pointerup', { clientX: 100, clientY: 146 })
    assert.deepEqual(textos(), ['Dos', 'Tres', 'Uno'])
    assert.equal(elegido(), '3')

    // Alt+flecha mueve el paso con el teclado.
    await act(() => document.querySelector('.pizarra-chip[aria-pressed="true"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp', altKey: true })))
    assert.deepEqual(textos(), ['Dos', 'Uno', 'Tres'])

    // Formación propia desde el menú: ya hay una jugadora (la 6), pregunta y la reubica sin duplicarla.
    await click('Agregar a la cancha')
    await click('Formación 4-4-2 propia')
    assert.equal(confirmado, 1)
    const fichas = document.querySelector('svg.pizarra-cancha').querySelectorAll('[data-elemento]')
    assert.equal(fichas.length, 11)
    assert.equal(document.querySelector('.pizarra-agregar-menu'), null, 'el menú se pliega')
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, p] of previos) { if (p) Object.defineProperty(globalThis, n, p); else delete globalThis[n] }
  }
})

test('Celular: un toque solo selecciona; doble toque abre las opciones; ✕ y tocar fuera las cierran; arrastrar no las abre', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previos = new Map()
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }) }
  for (const nombre of ['window', 'document', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent', 'KeyboardEvent']) global(nombre, dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT', true)
  global('DOMPoint', class { constructor(x, y) { this.x = x; this.y = y } matrixTransform() { return this } })
  let cuadros = []
  global('requestAnimationFrame', fn => { cuadros.push(fn); return cuadros.length }); global('cancelAnimationFrame', () => {})
  // Pantalla de celular (390 px): solo responde a las consultas de ancho máximo 750 px.
  dom.window.matchMedia = q => ({ matches: q.includes('max-width: 750px'), addEventListener() {}, removeEventListener() {} })
  dom.window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
  dom.window.SVGElement.prototype.setPointerCapture = () => {}
  dom.window.SVGElement.prototype.hasPointerCapture = () => false
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), React = await import('react'), { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const { act } = React
  const cancha = () => document.querySelector('svg.pizarra-cancha')
  const ficha = () => cancha().querySelector('[data-elemento="a"]')
  const hoja = () => document.querySelector('.pizarra-propiedades')
  const evento = async (nodo, tipo, props) => { await act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, ...props }); Object.defineProperty(e, 'pointerId', { value: 7 }); Object.defineProperty(e, 'pointerType', { value: 'touch' }); nodo.dispatchEvent(e) }) }
  const enPantalla = (x, y) => ({ clientX: x * 1.05, clientY: y * .68 })
  const toque = async () => { await evento(ficha(), 'pointerdown', enPantalla(20, 50)); await evento(cancha(), 'pointerup', enPantalla(20, 50)) }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    await act(() => root.render(React.createElement(Editor, { inicial: INICIAL, onGuardar() {} })))
    await toque()
    assert.ok(ficha().querySelector('[data-seleccion]'), 'un toque selecciona')
    assert.equal(hoja(), null, 'un toque no abre las opciones')
    assert.ok(document.querySelector('.pizarra-opciones'), 'botón ⋯ a mano')
    await toque()
    assert.ok(hoja(), 'doble toque abre las opciones')
    await act(() => document.querySelector('button[aria-label="Cerrar propiedades"]').click())
    assert.equal(hoja(), null); assert.ok(ficha().querySelector('[data-seleccion]'), 'cerrar no suelta la selección')
    await act(() => document.querySelector('.pizarra-opciones').click())
    assert.ok(hoja(), '⋯ abre las opciones')
    await evento(document.querySelector('.pizarra-linea'), 'pointerdown', { clientX: 1, clientY: 1 })
    assert.equal(hoja(), null, 'tocar fuera las cierra')
    // Toque y enseguida arrastre sobre la misma ficha: se mueve y no abre las opciones.
    await toque()
    await evento(ficha(), 'pointerdown', enPantalla(20, 50))
    await evento(cancha(), 'pointermove', enPantalla(40, 60))
    const pendientes = cuadros; cuadros = []; await act(() => pendientes.forEach(fn => fn(0)))
    await evento(cancha(), 'pointerup', enPantalla(40, 60))
    assert.match(ficha().getAttribute('transform'), /translate\(42 /)
    assert.equal(hoja(), null, 'arrastrar no abre las opciones')
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, p] of previos) { if (p) Object.defineProperty(globalThis, n, p); else delete globalThis[n] }
  }
})
