import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Partidos Premium: indicadores reales, marcadores local/visitante, acciones y exportaciones conservadas', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const partidos = [
    { id: 'victoria', fecha: '2026-10-30', rival: 'Rival uno', local_visitante: 'visitante', goles_local: 1, goles_visitante: 3, escudo_url: '/escudo.png', link: 'https://example.invalid/video' },
    { id: 'empate', fecha: '2026-10-29', rival: 'Rival dos', goles_local: 1, goles_visitante: 1 },
    { id: 'derrota', fecha: '2026-10-28', rival: 'Rival tres', goles_local: 0, goles_visitante: 1 },
    { id: 'pendiente', fecha: '2026-10-27', rival: 'Rival cuatro', goles_local: null, goles_visitante: null },
  ]
  const eventos = [], consultas = []
  let confirmaciones = 0
  dom.window.confirm = () => { confirmaciones++; return false }
  poner('__partidosPremiumDB', { from(tabla) {
    const q = { select() { return q }, eq(campo, valor) { consultas.push([tabla, campo, valor]); return q }, order: async () => ({ data: partidos, error: null }) }
    return q
  } })
  poner('__partidosPremiumExportar', (tipo, ...args) => eventos.push([tipo, ...args]))
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'partidos-premium-mock', enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('/supabaseClient')) return '\0premium-db'
      if (id.endsWith('/generarCitacion')) return '\0premium-citacion'
      if (id.endsWith('/generarImagenCitacion')) return '\0premium-imagen'
      if (id.endsWith('/exportarEstadisticas')) return '\0premium-exportar'
    }, load(id) {
      if (id === '\0premium-db') return 'export const supabase=globalThis.__partidosPremiumDB'
      if (id === '\0premium-citacion') return "export const generarCitacionPDF=(...args)=>globalThis.__partidosPremiumExportar('pdf-citacion',...args)"
      if (id === '\0premium-imagen') return "export const generarImagenCitacion=(...args)=>globalThis.__partidosPremiumExportar('imagen-citacion',...args)"
      if (id === '\0premium-exportar') return "export const exportarEstadisticasPDF=(...args)=>globalThis.__partidosPremiumExportar('pdf-estadisticas',...args);export const exportarEstadisticasCSV=(...args)=>globalThis.__partidosPremiumExportar('csv-estadisticas',...args)"
    },
  }] })
  const root = createRoot(document.getElementById('root'))
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await Promise.resolve() }) }
  try {
    const { default: Lista } = await server.ssrLoadModule('/src/components/ListaPartidos.jsx')
    const callback = nombre => id => eventos.push([nombre, id])
    await act(async () => { root.render(h(Lista, { categoriaId: 'c', categoriaNombre: 'Primera', onElegirPartido: callback('abrir'), onNuevoPartido: callback('nuevo'), onGestionarEquipos: callback('equipos'), onVerEstadisticas: callback('estadisticas'), onEditarPartido: callback('editar'), onVerComparativa: callback('comparativa') })); await Promise.resolve() })
    assert.deepEqual([...document.querySelectorAll('.partidos-indicadores strong')].map(n => n.textContent), ['1', '1', '1'])
    assert.match(document.querySelector('.partidos-contexto').textContent, /1 pendientes/)
    const tarjeta = document.querySelector('[data-partido-id="victoria"]')
    assert.deepEqual([...tarjeta.querySelectorAll('.partido-equipo strong')].map(n => n.textContent), ['Rival uno', 'Comunicaciones'])
    assert.equal(tarjeta.querySelector('.partido-goles').textContent, '1:3')
    assert.match(tarjeta.textContent, /Victoria \(3-1\)/)
    assert.equal(document.querySelector('[data-partido-id="pendiente"] .partido-goles').textContent, '—:—')
    await click(tarjeta.querySelector('.partido-marcador'))
    assert.equal(eventos.filter(e => e[0] === 'abrir').length, 1)
    for (const texto of ['PDF citación', 'Imagen citación', 'Estadísticas', 'Editar', 'Eliminar']) await click([...tarjeta.querySelectorAll('button')].find(b => b.textContent === texto))
    assert.equal(eventos.filter(e => e[0] === 'abrir').length, 1, 'Las acciones no abren la tarjeta por propagación')
    for (const tipo of ['pdf-citacion', 'imagen-citacion', 'estadisticas', 'editar']) assert.ok(eventos.some(e => e[0] === tipo && e[1] === 'victoria'))
    assert.equal(confirmaciones, 1)
    assert.equal(tarjeta.querySelector('a').getAttribute('href'), partidos[0].link)
    for (const texto of ['📄 PDF', '⬇️ CSV', '📊 Ver comparativa', '+ Nuevo partido', '🛡️ Equipos']) await click([...document.querySelectorAll('button')].find(b => b.textContent.trim() === texto))
    assert.ok(eventos.some(e => e[0] === 'pdf-estadisticas' && e[1] === 'c'))
    assert.ok(eventos.some(e => e[0] === 'csv-estadisticas' && e[1] === 'c'))
    for (const tipo of ['comparativa', 'nuevo', 'equipos']) assert.ok(eventos.some(e => e[0] === tipo))
    assert.deepEqual(consultas, [['partidos', 'categoria_id', 'c']])
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
