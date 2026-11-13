// DOM temporal, sin navegador real, credenciales ni conexiones de aplicación.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

// Cancha completa (105 × 68 m). Con la matriz de pantalla neutra, el punto en % sale de clientX·100/105 y clientY·100/68.
const enPantalla = (x, y) => ({ clientX: x * 1.05, clientY: y * .68 })
const pose = (x, y) => ({ x, y, rotacion: 0 })
const INICIAL = { version: 1, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1,
  elementos: [
    { id: 'a', tipo: 'jugadora', color: '#F2C230', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero: '1' },
    { id: 'b', tipo: 'jugadora', color: '#F2C230', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero: '2' },
    { id: 'pelota', tipo: 'pelota', color: '#FFFFFF', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero: '' },
  ],
  pasos: [{ id: 'p0', nombre: 'Inicio', duracion: 2, poses: { a: pose(20, 50), b: pose(60, 30), pelota: pose(23.5, 50) } }] }

test('Etapa B: imán de la pelota, pase arrastrando, flechas automáticas, + Paso y reproducción', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
  const previos = new Map()
  function global(nombre, valor) { previos.set(nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }) }
  for (const nombre of ['window', 'document', 'HTMLElement', 'SVGElement', 'Event', 'MouseEvent', 'KeyboardEvent']) global(nombre, dom.window[nombre])
  global('IS_REACT_ACT_ENVIRONMENT', true)
  global('DOMPoint', class { constructor(x, y) { this.x = x; this.y = y } matrixTransform() { return this } })
  const callbacks = new Map(); let secuencia = 0
  global('requestAnimationFrame', fn => { callbacks.set(++secuencia, fn); return secuencia })
  global('cancelAnimationFrame', id => callbacks.delete(id))
  dom.window.confirm = () => true
  dom.window.SVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) })
  dom.window.SVGElement.prototype.setPointerCapture = () => {}
  dom.window.SVGElement.prototype.hasPointerCapture = () => false
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), React = await import('react'), { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const { act } = React
  const cancha = () => document.querySelector('svg.pizarra-cancha')
  const boton = texto => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === texto || b.getAttribute('aria-label') === texto)
  const click = async texto => { const b = boton(texto); assert.ok(b, texto); await act(() => b.click()) }
  const evento = async (nodo, tipo, props) => { await act(() => { const e = new dom.window.MouseEvent(tipo, { bubbles: true, button: 0, ...props }); Object.defineProperty(e, 'pointerId', { value: 1 }); Object.defineProperty(e, 'pointerType', { value: 'mouse' }); nodo.dispatchEvent(e) }) }
  const cuadros = async () => { const pendientes = [...callbacks.values()]; callbacks.clear(); await act(() => pendientes.forEach(fn => fn(performance.now()))) }
  const posicion = id => { const m = cancha().querySelector(`[data-elemento="${id}"]`).getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\)/); return { x: Number(m[1]) / 1.05, y: Number(m[2]) / .68 } }
  async function arrastrar(id, hasta, antesDeSoltar) {
    const desde = posicion(id)
    await evento(cancha().querySelector(`[data-elemento="${id}"]`), 'pointerdown', enPantalla(desde.x, desde.y))
    await evento(cancha(), 'pointermove', enPantalla(hasta.x, hasta.y))
    await cuadros()
    await antesDeSoltar?.()
    await evento(cancha(), 'pointerup', enPantalla(hasta.x, hasta.y))
  }
  const key = async tecla => act(() => document.querySelector('.pizarra').dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: tecla })))
  async function marcar(etiqueta, valor) {
    const campo = [...document.querySelectorAll('label')].find(l => l.textContent.includes(etiqueta)).querySelector('input')
    await act(() => { if (campo.checked !== valor) campo.click() })
  }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    await act(() => root.render(React.createElement(Editor, { inicial: INICIAL })))

    // La pelota a los pies de la jugadora 1 se marca como pegada.
    assert.equal(cancha().querySelectorAll('[data-pegada]').length, 1)

    // Al mover a la jugadora, la pelota la acompaña.
    await arrastrar('a', { x: 30, y: 50 })
    assert.ok(Math.abs(posicion('a').x - 30) < .01)
    assert.ok(Math.abs(posicion('pelota').x - 33.5) < .01, `pelota en ${posicion('pelota').x}`)

    // + Paso copia el paso actual y lo selecciona.
    await click('Agregar paso')
    assert.equal(document.querySelectorAll('.pizarra-chip[aria-label^="Paso "]').length, 2)
    assert.equal(boton('Paso 2: Paso 2').getAttribute('aria-pressed'), 'true')
    assert.ok(Math.abs(posicion('pelota').x - 33.5) < .01)

    // Pase: se arrastra la pelota cerca de la jugadora 2; mientras tanto se marca a quién se va a pegar.
    let imanDurante = 0
    await arrastrar('pelota', { x: 63, y: 34 }, () => { imanDurante = cancha().querySelectorAll('[data-iman]').length })
    assert.equal(imanDurante, 1, 'anillo de imán sobre la receptora')
    const b = posicion('b'), p = posicion('pelota')
    assert.ok(Math.hypot((p.x - b.x) * 1.05, (p.y - b.y) * .68) < 5, 'la pelota quedó a los pies de la jugadora 2')
    assert.equal(cancha().querySelectorAll('[data-iman]').length, 0)

    // Flechas automáticas del paso 1 al 2 (pase) y el paso anterior como fantasma.
    assert.ok(cancha().querySelector('[data-automatica="pase"]'), 'flecha de pase')
    assert.ok(cancha().querySelector('[data-fantasmas] g'), 'fantasma del paso anterior')
    await marcar('Flechas automáticas', false)
    assert.equal(cancha().querySelector('[data-automaticas]'), null)
    await marcar('Flechas automáticas', true)
    assert.ok(cancha().querySelector('[data-automatica="pase"]'))

    // Soltada lejos de todas, queda suelta.
    await arrastrar('pelota', { x: 85, y: 85 })
    assert.equal(cancha().querySelectorAll('[data-pegada]').length, 0)

    // Pegar pelota: con la jugadora 1 seleccionada, la pelota vuelve a sus pies.
    await evento(cancha().querySelector('[data-elemento="a"]'), 'pointerdown', enPantalla(30, 50))
    await evento(cancha(), 'pointerup', enPantalla(30, 50))
    await click('Pegar pelota')
    assert.ok(Math.hypot((posicion('pelota').x - 30) * 1.05, (posicion('pelota').y - 50) * .68) < 5)
    assert.equal(cancha().querySelectorAll('[data-pegada]').length, 1)

    // Sin movimiento entre pasos no hay flechas; un desmarque de la jugadora 2 genera una sin pelota.
    assert.equal(cancha().querySelector('[data-automatica]'), null)
    await arrastrar('b', { x: 75, y: 45 })
    assert.ok(cancha().querySelector('[data-automatica="movimiento"]'), 'flecha sin pelota')

    // Reproducción: espacio reproduce y pausa; la línea de tiempo muestra un instante y marca el paso en curso.
    await click('Ir al primer paso')
    await key(' ')
    assert.ok(boton('Pausar'))
    await key(' ')
    assert.ok(boton('Reproducir'))
    const regla = document.querySelector('input[aria-label="Línea de tiempo"]')
    await act(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(regla, '1'); regla.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    assert.ok(document.querySelector('.pizarra-chip[aria-current="step"]'), 'paso en curso marcado')
    assert.ok(cancha().querySelector('[data-automatica]'), 'flechas del tramo en curso al reproducir')
    // Elegir un paso vuelve a editar.
    await click('Paso 1: Inicio')
    assert.equal(document.querySelector('.pizarra-chip[aria-current="step"]'), null)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, p] of previos) { if (p) Object.defineProperty(globalThis, n, p); else delete globalThis[n] }
  }
})
