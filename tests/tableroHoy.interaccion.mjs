import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Hoy: tarjetas, tocar una jugadora abre su perfil y "Copiar lista" arma el texto para WhatsApp', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  function poner(k, v) { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'navigator']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  let copiado = null
  Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async t => { copiado = t } } })

  const jugadores = [
    { id: 'a', nombre: 'Ana', apellido: 'Alvarez', categoria_id: 'primera', posicion: null, estado: 'disponible' },
    { id: 'b', nombre: 'Bea', apellido: 'Benitez', categoria_id: 'primera', posicion: null, estado: 'lesionado', estado_detalle: 'Esguince' },
  ]
  const escrituras = []
  poner('__hoyDb', { from(tabla) {
    const q = { select() { return q }, ilike() { return q }, limit() { return q }, maybeSingle() { q.unica = true; return q }, order() { return q }, range() { return q },
      not() { return q }, eq() { return q }, in() { return q }, gte() { return q }, lte() { return q }, or() { return q },
      insert() { escrituras.push(tabla); return q }, update() { escrituras.push(tabla); return q }, upsert() { escrituras.push(tabla); return q }, delete() { escrituras.push(tabla); return q },
      then(ok, mal) {
        const datos = tabla === 'categorias' ? (q.unica ? { id: 'primera', nombre: 'Primera División' } : [{ id: 'primera', nombre: 'Primera División', es_reserva: false }])
          : tabla === 'jugadores' ? jugadores
            : tabla === 'bienestar' ? [{ jugador_id: 'a', sueno: 5, dolor_muscular: 4, fatiga: 4, estres: 4, animo_entrenar: 4 }]
              : tabla === 'partidos' ? [{ id: 'p', fecha: '2099-01-10', hora: '16:00:00', rival: 'Rival FC', lugar: 'Cancha 2', local_visitante: 'visitante' }] : []
        return Promise.resolve({ data: datos, error: null }).then(ok, mal)
      } }
    return q
  } })

  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'hoy-db', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0hoy-db' },
    load(id) { if (id === '\0hoy-db') return 'export const supabase=globalThis.__hoyDb' },
  }] })
  const root = createRoot(document.getElementById('root'))
  try {
    const { default: Hoy } = await server.ssrLoadModule('/src/components/hoy/HoySection.jsx')
    const abiertas = [], secciones = []
    await act(async () => {
      root.render(h(Hoy, { perfil: { id: 'u', rol: 'coordinacion' }, onAbrirJugadora: id => abiertas.push(id), onCambiarSeccion: s => secciones.push(s) }))
      for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0))
    })
    const texto = document.body.textContent
    for (const titulo of ['Wellness de hoy', 'Rojo y amarillo', 'No disponibles', 'Próximo partido', 'Cumpleaños']) assert.match(texto, new RegExp(titulo))
    assert.match(texto, /1 de 2 completaron/)
    assert.match(texto, /Faltan completar · 1/)
    assert.match(texto, /Lesionadas · 1/)
    assert.match(texto, /Esguince/)
    assert.match(texto, /vs Rival FC/)
    assert.match(texto, /Visitante · Cancha 2/)
    assert.match(texto, /Primera División/)

    // Tocar una jugadora abre su perfil.
    const benitez = [...document.querySelectorAll('button.hoy-fila')].find(b => b.getAttribute('aria-label') === 'Abrir perfil de Benitez, Bea')
    await act(async () => { benitez.click() })
    assert.deepEqual(abiertas, ['b'])
    await act(async () => { document.querySelector('button.hoy-partido').click() })
    assert.deepEqual(secciones, ['partidos'])

    const copiar = [...document.querySelectorAll('button')].find(b => b.textContent === 'Copiar lista')
    await act(async () => { copiar.click(); await new Promise(r => setTimeout(r, 0)) })
    assert.match(copiado, /^\*Wellness de hoy\*/)
    assert.match(copiado, /• Benitez, Bea/)
    assert.doesNotMatch(copiado, /Alvarez/)
    assert.match(document.body.textContent, /Lista copiada/)
    assert.deepEqual(escrituras, [])
  } finally {
    await act(async () => root.unmount())
    await server.close()
    for (const [k, d] of anteriores) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]
    delete globalThis.__hoyDb
  }
})
