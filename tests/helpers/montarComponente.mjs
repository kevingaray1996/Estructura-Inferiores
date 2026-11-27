// Monta un componente suelto con jsdom y un servidor Vite de prueba (como pizarra2dEditor.interaccion.mjs).
// Devuelve { w, act, h, cargar(ruta), render(elemento), esperar(ms), boton(texto), clic(el), escribir(input, valor), cerrar() }.
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

export async function montarComponente({ ancho = 1600, alto = 900, antes = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid', pretendToBeVisual: true })
  const w = dom.window
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']) poner(n, w[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: ancho, height: alto, right: ancho, bottom: alto })
  w.confirm = () => true
  antes?.(w)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const esperar = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)))
  const boton = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === texto || b.getAttribute('aria-label') === texto)
  const clic = async (el) => { await act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)) }); await esperar() }
  // Escribir en un input controlado de React (usa el setter nativo para que React vea el cambio).
  const escribir = async (input, valor) => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set
    await act(() => { setter.call(input, valor); input.dispatchEvent(new w.Event('input', { bubbles: true })) })
    await esperar()
  }
  return {
    w, act, h, esperar, boton, clic, escribir,
    cargar: async (ruta) => (await vite.ssrLoadModule(ruta)),
    render: async (elemento) => { await act(async () => { root.render(elemento) }); await esperar() },
    cerrar: async () => {
      await act(async () => { root.unmount() })
      await vite.close()
      for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
      dom.window.close()
    },
  }
}
