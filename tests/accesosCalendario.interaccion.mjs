import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Accesos Calendario: Inicio, orden por rol, menú compacto y móvil, sin duplicados ni escrituras', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const previos = new Map()
  const poner = (n, v) => {
    previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n))
    Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true })
  }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { createServer } = await import('vite')
  poner('__accesosCalendarioDB', {
    storage: { from() { return { getPublicUrl() { return { data: { publicUrl: 'https://example.invalid/logo.png' } } } } } },
    from() {
      let singular = false
      const q = { select() { return q }, order() { return q }, limit() { return q }, eq() { return q },
        in() { return q }, gte() { return q }, lte() { return q }, lt() { return q }, not() { return q }, ilike() { return q },
        maybeSingle() { singular = true; return q }, single() { singular = true; return q },
        then(ok, mal) { return Promise.resolve({ data: singular ? null : [], error: null, count: 0 }).then(ok, mal) } }
      return q
    },
  })
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{
    name: 'accesos-calendario-simulados', enforce: 'pre',
    resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0accesos-calendario-db' },
    load(id) { if (id === '\0accesos-calendario-db') return 'export const supabase = globalThis.__accesosCalendarioDB' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const destinos = []
  let key = 0
  const click = async el => { assert.ok(el); await act(() => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  try {
    const { ContextoApariencia } = await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    const { default: Layout } = await server.ssrLoadModule('/src/components/Layout.jsx')
    const { default: Inicio } = await server.ssrLoadModule('/src/components/InicioSection.jsx')
    const render = async (C, props) => act(async () => {
      root.render(h(ContextoApariencia.Provider, { value: { preferencia: 'oscuro', establecerPreferencia() {} } }, h(C, { key: ++key, ...props })))
      await Promise.resolve()
    })
    for (const rol of ['coordinacion', 'tecnico', 'preparador_fisico', 'medico']) {
      window.localStorage.setItem('comunicaciones-menu-compacto', 'false')
      await render(Layout, { perfil: { rol }, seccionActiva: 'inicio', onCambiarSeccion: s => destinos.push(s) })
      const botones = [...document.querySelectorAll('nav button')].map(b => b.getAttribute('aria-label'))
      assert.equal(document.querySelectorAll('button[aria-label="Calendario"]').length, rol === 'medico' ? 0 : 1)
      for (const oculta of ['Representantes', 'Pensión', 'Selección', 'Contratos', 'Psicología', 'Nutrición']) assert.ok(!botones.includes(oculta))
      if (rol === 'medico') continue
      assert.equal(botones[botones.indexOf('Partidos') + 1], 'Calendario')
      assert.equal(botones[botones.indexOf('Calendario') + 1], 'Entrenamientos')
      await click(document.querySelector('[aria-label="Plegar menú lateral"]'))
      assert.ok(document.querySelector('aside').className.includes('md:w-[68px]'))
      await click(document.querySelector('[aria-label="Calendario"]'))
      assert.equal(destinos.at(-1), 'calendario')
      await click(document.querySelector('[aria-label="Expandir menú lateral"]'))
      assert.ok(document.querySelector('aside').className.includes('md:w-56'))
      await click(document.querySelector('[aria-label="Abrir menú"]'))
      assert.ok(!document.querySelector('aside').className.includes('-translate-x-full'))
      await click(document.querySelector('[aria-label="Calendario"]'))
      assert.ok(document.querySelector('aside').className.includes('-translate-x-full'))

      await render(Inicio, { perfil: { rol }, onCambiarSeccion: s => destinos.push(s) })
      const enlace = texto => [...document.querySelectorAll('span')].find(el => el.textContent === texto)
      await click(enlace('Consultar calendario'))
      assert.equal(destinos.at(-1), 'calendario')
      await click(enlace('Consultar partidos'))
      assert.equal(destinos.at(-1), 'partidos')
    }
  } finally {
    await act(() => root.unmount())
    await server.close()
    dom.window.close()
    for (const [n, descriptor] of previos) {
      if (descriptor) Object.defineProperty(globalThis, n, descriptor)
      else delete globalThis[n]
    }
  }
})
