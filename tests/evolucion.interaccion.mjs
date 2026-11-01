import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Evolución: gráfico sin puentes, selección, interacción accesible, períodos y estados sin servicios', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (k, v) => { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h, useState } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const jugadoras = Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, nombre: 'Nombre ' + i, apellido: 'Prueba', posicion: i === 0 ? 'Arquero' : 'Defensor central', foto_url: '/foto.jpg' }))
  const partidos = [3, 1, 2].map(i => ({ id: `p${i}`, fecha: `2026-10-0${i}`, rival: `Rival ${i}` }))
  const datos = { partidos, analisis: [1, 3].map(i => ({ id: `a${i}`, partido_calendario_id: `p${i}` })),
    eventos: [1, 3].flatMap(i => jugadoras.map(j => ({ id: `e${i}${j.id}`, partido_id: `a${i}`, jugador_id: j.id, tipo: 'Pase correcto', resultado: null }))),
    estadisticas: partidos.flatMap(p => jugadoras.map(j => ({ partido_id: p.id, jugador_id: j.id, minutos_jugados: 90, titular: true }))),
    fuentes: Object.fromEntries(['partidos', 'analisis', 'eventos', 'estadisticas'].map(n => [n, { estado: 'disponible' }])),
  }
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const click = async el => { assert.ok(el); await act(() => el.click()) }
  const cambiar = async (el, valor) => act(() => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set.call(el, valor)
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
  const control = texto => [...document.querySelectorAll('label')].find(l => [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() === texto)?.querySelector('input,select')
  try {
    const { default: Evolucion } = await server.ssrLoadModule('/src/components/plantel/EvolucionPlantel.jsx')
    function Ejemplo({ fuente }) {
      const [filtros, onFiltros] = useState({ desde: '', hasta: '', partido: '' })
      return h(Evolucion, { fuente, categoriaId: 'c', jugadoras, filtros, onFiltros })
    }
    let reintentos = 0
    const render = async fuente => act(() => root.render(h(Ejemplo, { fuente: { usuario: 'u', datos, reintentar: () => reintentos++, ...fuente } })))
    await render({})
    assert.match(document.body.textContent, /Seleccioná entre una y seis/)
    const opciones = () => [...document.querySelectorAll('.evolucion-selector button')]
    await click(opciones()[0])
    assert.equal(document.querySelectorAll('[data-punto]').length, 3, 'Minutos disponibles aunque falte análisis en un partido')
    await cambiar(control('Indicador'), 'precision')
    assert.equal(document.querySelectorAll('[data-punto]').length, 2)
    assert.equal(document.querySelectorAll('[data-tramo]').length, 0, 'No conecta los dos extremos a través del partido sin análisis')
    assert.deepEqual([...document.querySelectorAll('.evolucion-partidos li')].map(n => n.textContent), ['2026-10-01 · Rival 1', '2026-10-02 · Rival 2', '2026-10-03 · Rival 3'])
    const punto = document.querySelector('[data-punto]')
    await act(() => { punto.focus(); punto.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    assert.match(document.querySelector('.evolucion-detalle').textContent, /Rival 1.*100%/)
    assert.match(document.querySelector('.evolucion-tabla').textContent, /1 \/ 1 pases registrados/)
    for (let i = 1; i < 7; i++) await click(opciones()[i])
    assert.equal(opciones().filter(b => b.getAttribute('aria-pressed') === 'true').length, 6)
    assert.match(document.body.textContent, /Máximo de seis/)
    const maximo = document.querySelector('.evolucion-grafico svg').getAttribute('data-maximo')
    await click(document.querySelector('.evolucion-leyenda button'))
    assert.equal(document.querySelector('.evolucion-grafico svg').getAttribute('data-maximo'), maximo)
    assert.equal(document.querySelectorAll('[data-serie]').length, 6)
    assert.equal(document.querySelectorAll('[data-serie][opacity="0.16"]').length, 5)
    await click(document.querySelector('.evolucion-leyenda button'))
    await cambiar(control('Buscar jugadora'), 'Inexistente')
    assert.equal(document.querySelectorAll('.evolucion-leyenda>div').length, 6)
    assert.match(document.body.textContent, /No se encontraron jugadoras/)
    await cambiar(control('Buscar jugadora'), '')
    for (let i = 1; i < 6; i++) await click(opciones()[i])
    await cambiar(control('Desde A'), '2026-10-01'); await cambiar(control('Hasta A'), '2026-10-01')
    await cambiar(control('Desde B'), '2026-10-03'); await cambiar(control('Hasta B'), '2026-10-03')
    let tablas = document.querySelectorAll('.evolucion-tabla')
    assert.equal(tablas.length, 2)
    assert.match(tablas[1].textContent, /0 puntos porcentuales/)
    assert.match(tablas[1].textContent, /1 partidos incluidos/)
    await cambiar(control('Selección A'), 'partidos')
    const checks = document.querySelector('.evolucion-periodo').querySelectorAll('input[type=checkbox]')
    await click(checks[0]); await click(checks[2])
    assert.match(document.body.textContent, /comparten 1 partidos/)
    assert.match(document.querySelectorAll('.evolucion-tabla')[1].textContent, /2 \/ 2/)
    await cambiar(control('Indicador'), 'pasesCorrectos'); await cambiar(control('Modalidad'), 'por90')
    assert.equal(document.querySelectorAll('[data-punto]').length, 2)
    assert.match(document.querySelectorAll('.evolucion-tabla')[1].textContent, /1 \/90/)
    await cambiar(control('Desde'), '2026-11-01')
    assert.equal(document.querySelectorAll('[data-punto]').length, 0)
    assert.match(document.body.textContent, /Sin partidos accesibles/)
    await cambiar(control('Desde'), '')
    await render({ datos: null })
    assert.match(document.body.textContent, /Consultando fuentes/)
    const fallido = { ...datos, partidos: null, fuentes: { ...datos.fuentes, partidos: { estado: 'denegado', mensaje: 'Acceso denegado.' } } }
    await render({ datos: fallido })
    assert.match(document.querySelector('[role=alert]').textContent, /Acceso denegado/)
    assert.doesNotMatch(document.body.textContent, /Sin partidos accesibles/)
    assert.equal(document.querySelectorAll('[data-punto]').length, 0)
    await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Reintentar lectura')); assert.equal(reintentos, 1)
    await render({ datos: { ...fallido, fuentes: { partidos: { estado: 'error', mensaje: 'Error de lectura.' } } } })
    assert.match(document.querySelector('[role=alert]').textContent, /Error de lectura/)
    await render({ usuario: null })
    assert.match(document.body.textContent, /sesión autenticada/)
    const { default: Grafico } = await server.ssrLoadModule('/src/components/plantel/GraficoEvolucion.jsx')
    const series = [{ jugadorId: 'mayor', nombre: 'Mayor', color: '#AD8500', puntos: [{ partidoId: 'p1', valor: 100 }] }, { jugadorId: 'menor', nombre: 'Menor', color: '#3B82F6', puntos: [{ partidoId: 'p1', valor: 25 }] }]
    await act(() => root.render(h(Grafico, { partidos: [partidos[1]], series, unidad: '' })))
    const cy = document.querySelector('[data-serie="menor"] [data-punto]').getAttribute('cy')
    await act(() => root.render(h(Grafico, { partidos: [partidos[1]], series, unidad: '', destacada: 'menor' })))
    assert.equal(document.querySelector('svg').getAttribute('data-maximo'), '100')
    assert.equal(document.querySelector('[data-serie="menor"] [data-punto]').getAttribute('cy'), cy)
    assert.equal(document.querySelector('[data-serie="mayor"]').getAttribute('opacity'), '0.16')
    await act(() => root.render(h(Grafico, { partidos: [partidos[1]], series: [series[1]], unidad: '' })))
    assert.equal(document.querySelector('svg').getAttribute('data-maximo'), '25', 'Cambiar el conjunto de datos sí actualiza la escala')
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [k, descriptor] of anteriores) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
