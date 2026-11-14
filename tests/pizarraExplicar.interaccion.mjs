// Etapa I en el editor: pase alto, subtítulo, foco, ocultar en un paso, pausa, recorrido guardado y visor.
// DOM temporal, sin navegador real, credenciales ni conexiones de aplicación.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const enPantalla = (x, y) => ({ clientX: x * 1.05, clientY: y * .68 })
const pose = (x, y) => ({ x, y, rotacion: 0 })
const ficha = (id, tipo, numero = '') => ({ id, tipo, color: tipo === 'pelota' ? '#FFFFFF' : '#F2C230', tinta: '#111111', tamano: 3, grosor: .4, dx: 15, dy: 0, curva: 0, texto: '', numero })
// Guardada en v1 (como las que ya existen): pase de la 1 a la 2.
const INICIAL = { version: 1, superficie: 'completa', orientacion: 'horizontal', ataque: 'derecha', bucle: false, velocidad: 1,
  elementos: [ficha('a', 'jugadora', '1'), ficha('b', 'jugadora', '2'), ficha('pelota', 'pelota')],
  pasos: [{ id: 'p0', nombre: 'Inicio', duracion: 2, poses: { a: pose(20, 50), b: pose(60, 30), pelota: pose(23.5, 50) } },
    { id: 'p1', nombre: 'Pase', duracion: 2, poses: { a: pose(20, 50), b: pose(60, 30), pelota: pose(56.5, 30) } }] }

test('Etapa I: pase alto, subtítulo, foco, ocultar en un paso, pausa y movimiento guardado; el visor los muestra', async () => {
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
  const campo = etiqueta => [...document.querySelectorAll('label')].find(l => l.textContent.startsWith(etiqueta)).querySelector('input, textarea, select')
  async function escribir(etiqueta, valor) {
    const nodo = campo(etiqueta), proto = Object.getPrototypeOf(nodo)
    await act(() => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(nodo, String(valor)); nodo.dispatchEvent(new dom.window.Event(nodo.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
  }
  async function tocar(id) {
    const g = cancha().querySelector(`[data-elemento="${id}"]`), m = g.getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\)/)
    await evento(g, 'pointerdown', enPantalla(Number(m[1]) / 1.05, Number(m[2]) / .68))
    await evento(cancha(), 'pointerup', enPantalla(Number(m[1]) / 1.05, Number(m[2]) / .68))
  }
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    let guardada = null
    await act(() => root.render(React.createElement(Editor, { inicial: INICIAL, onGuardar: doc => { guardada = doc } })))
    await click('Paso 2: Pase')
    assert.ok(cancha().querySelector('[data-automatica="pase"]'), 'pase bajo por defecto')

    // Pase alto: la flecha automática cambia a arco con sombra.
    await click('Alto')
    assert.equal(cancha().querySelector('[data-automatica="pase"]'), null)
    assert.ok(cancha().querySelector('[data-automatica="pase-alto"] [data-pase-alto]'))

    // Subtítulo del paso sobre la cancha.
    await escribir('Subtítulo del paso', 'Cambio de frente a la 2')
    assert.equal(document.querySelector('.pizarra-subtitulo').textContent, 'Cambio de frente a la 2')

    // Foco en la jugadora 2 desde la barra del objeto: anillo y el resto más apagado (a medias mientras se edita).
    await tocar('b')
    await click('◎ Foco')
    assert.ok(cancha().querySelector('[data-elemento="b"] [data-foco]'))
    assert.ok(Number(cancha().querySelector('[data-elemento="a"]').getAttribute('opacity')) < 1)
    assert.equal(campo('Foco en').value, 'b')

    // Ocultar a la jugadora 1 en este paso: se ve tenue para poder tocarla.
    await tocar('a')
    await click('◐ Ocultar')
    assert.equal(cancha().querySelector('[data-elemento="a"]').getAttribute('data-oculto'), 'true')
    assert.ok(boton('◐ Mostrar'))

    // Pausa y movimiento recto: van al documento.
    await escribir('Pausa al llegar', 1.5)
    const recto = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === 'Recto').querySelector('input')
    await act(() => recto.click())

    // Reproducción a mitad del pase: la pelota vuela, la cámara se acerca a la 2 y se ve el subtítulo del paso al que va.
    const regla = document.querySelector('input[aria-label="Línea de tiempo"]')
    await act(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(regla, '1'); regla.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    assert.ok(cancha().querySelector('[data-camara]'), 'cámara acercándose')
    assert.match(cancha().querySelector('[data-elemento="pelota"]').innerHTML, /scale\(/, 'pelota en el aire')
    assert.equal(document.querySelector('.pizarra-subtitulo').textContent, 'Cambio de frente a la 2')
    // Al final queda detenida en el último paso durante su pausa.
    assert.equal(regla.max, '3.5')

    // El documento queda en v2 con todo lo cargado (se lee con "Respaldo editable": Aplicar necesita un canvas real).
    await click('Paso 2: Pase')
    let archivo = null
    const crearUrl = URL.createObjectURL, revocarUrl = URL.revokeObjectURL
    URL.createObjectURL = blob => { archivo = blob; return 'blob:prueba' }; URL.revokeObjectURL = () => {}
    try { await click('Respaldo editable') } finally { URL.createObjectURL = crearUrl; URL.revokeObjectURL = revocarUrl }
    const { validarPizarra } = await import('../src/utils/pizarra.js')
    const esperado = validarPizarra({ ...INICIAL, version: 2, recorrido: 'recto', placa: { titulo: '', analista: '' },
      pasos: [{ ...INICIAL.pasos[0], texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [] },
        { ...INICIAL.pasos[1], texto: 'Cambio de frente a la 2', pausa: 1.5, pase: 'alto', foco: 'b', ocultos: ['a'] }] })
    assert.deepEqual(JSON.parse(await archivo.text()), esperado)
    assert.equal(guardada, null)

    // Visor (Wellness): sin herramientas, con subtítulo del primer paso y cámara acercada si el paso tiene foco.
    const visor = { ...esperado, pasos: esperado.pasos.map((p, i) => i === 0 ? { ...p, texto: 'Salida', foco: 'a' } : p) }
    await act(() => root.render(React.createElement(Editor, { key: 'visor', inicial: visor, soloLectura: true })))
    assert.equal(document.querySelector('.pizarra-herramientas'), null)
    assert.equal(document.querySelector('.pizarra-subtitulo').textContent, 'Salida')
    assert.ok(cancha().querySelector('[data-camara]'))
    assert.ok(cancha().querySelector('[data-elemento="a"] [data-foco]'))
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, p] of previos) { if (p) Object.defineProperty(globalThis, n, p); else delete globalThis[n] }
  }
})
