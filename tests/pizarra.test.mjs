import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agregarElemento, duplicarElementos, duracionTotal, HERRAMIENTAS, historial, historialInicial, interpolar, nuevaPizarra, quitarElementos, validarPizarra } from '../src/utils/pizarra.js'
import { nuevoEjercicio, prepararSesion, nuevaSesion, nuevoBloque } from '../src/utils/planificacion.js'

test('Pizarra versionada: todos los materiales, validacion y exclusión de claves extra', () => {
  let d = nuevaPizarra()
  for (const tipo of Object.keys(HERRAMIENTAS)) d = agregarElemento(d, tipo)
  const limpio = validarPizarra({ ...d, notas_internas: 'PRIVADO' })
  assert.equal(limpio.elementos.length, Object.keys(HERRAMIENTAS).length)
  assert.doesNotMatch(JSON.stringify(limpio), /PRIVADO/)
  assert.throws(() => validarPizarra({ ...d, version: 2 }))
  assert.throws(() => validarPizarra({ ...d, pasos: [] }))
  assert.throws(() => validarPizarra({ ...d, elementos: [{ ...d.elementos[0], color: 'url(javascript:x)' }] }))
  assert.throws(() => validarPizarra({ ...d, pasos: [{ ...d.pasos[0], poses: {} }] }))
})

test('Secuencia mantiene identidades, pelota y materiales; interpola suavemente y rota por camino corto', () => {
  let d = agregarElemento(agregarElemento(agregarElemento(nuevaPizarra(), 'jugadora', 10, 20), 'pelota', 12, 20), 'cono', 40, 40)
  const [j, b, c] = d.elementos
  const primero = d.pasos[0], poses = structuredClone(primero.poses)
  poses[j.id] = { x: 80, y: 60, rotacion: 170 }; poses[b.id] = { x: 82, y: 60, rotacion: 0 }
  d = { ...d, pasos: [primero, { id: crypto.randomUUID(), nombre: 'Final', duracion: 4, poses }] }
  assert.equal(duracionTotal(d), 4)
  assert.equal(interpolar(d, 0).poses[j.id].x, 10)
  assert.equal(interpolar(d, 2).poses[j.id].x, 45)
  assert.equal(interpolar(d, 4).poses[j.id].x, 80)
  assert.deepEqual(interpolar(d, 2).poses[c.id], primero.poses[c.id])
  assert.equal(interpolar(d, 2).poses[b.id].x, 47)
  assert.equal(d.elementos[0].numero, '1')
  const recargada = validarPizarra(JSON.parse(JSON.stringify(d)))
  assert.deepEqual(recargada, d)
  assert.ok(interpolar(d, .1).poses[j.id].x < 10 + 70 * .1 / 4)
})

test('Duplicado independiente, eliminación en todos los pasos y deshacer/rehacer', () => {
  const inicial = agregarElemento(nuevaPizarra(), 'jugadora')
  let h = historialInicial(inicial)
  const d = duplicarElementos(inicial, [inicial.elementos[0].id])
  assert.notEqual(d.elementos[0].id, d.elementos[1].id)
  h = historial(h, 'editar', d)
  h = historial(h, 'deshacer'); assert.equal(h.actual.elementos.length, 1)
  h = historial(h, 'rehacer'); assert.equal(h.actual.elementos.length, 2)
  const sin = quitarElementos(d, [d.elementos[0].id])
  assert.equal(Object.keys(sin.pasos[0].poses).length, 1)
  assert.equal(inicial.elementos.length, 1)
})

test('Planificación usa snapshot independiente, sin publicación de pizarra por defecto', () => {
  const pizarra = agregarElemento(nuevaPizarra(), 'pelota')
  const e = nuevoEjercicio({ id: '10000000-0000-4000-8000-000000000001', pizarra })
  e.pizarra.elementos[0].color = '#FF0000'
  assert.equal(pizarra.elementos[0].color, '#FFFFFF')
  assert.ok(!e.campos_publicos.includes('pizarra'))
  const s = { ...nuevaSesion('2026-10-30', '10000000-0000-4000-8000-000000000002'), bloques: [{ ...nuevoBloque(), ejercicios: [e] }] }
  assert.deepEqual(prepararSesion(s).bloques[0].ejercicios[0].pizarra, e.pizarra)
})

test('Render SVG/editor y visor: controles reales, sin edición pública ni tarjeta sin contenido', async () => {
  const { createServer } = await import('vite'), { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    const doc = agregarElemento(nuevaPizarra(), 'jugadora')
    const render = (C, props) => renderToStaticMarkup(createElement(C, props))
    const html = render(Editor, { inicial: doc, onGuardar() {} })
    assert.match(html, /<svg/); assert.match(html, /Duplicar paso/); assert.match(html, /Descargar PNG/); assert.match(html, /Herramientas de pizarra/)
    const lector = render(Editor, { inicial: doc, soloLectura: true })
    assert.doesNotMatch(lector, /Herramientas de pizarra|Propiedades|Borrar todo|Aplicar pizarra|Notas internas|Recuperar JSON/)
    const { default: Entrada } = await server.ssrLoadModule('/src/components/PizarraEjercicio.jsx')
    assert.equal(render(Entrada, { soloLectura: true, valor: null }), '')
    assert.equal(render(Entrada, { soloLectura: true, valor: { version: 99 } }), '')
    assert.match(render(Entrada, { soloLectura: true, valor: doc }), /Ver ejercicio/)
    const css = readFileSync(new URL('../src/components/pizarra.css', import.meta.url), 'utf8')
    assert.match(css, /touch-action: none/); assert.match(css, /max-width: 750px/)
  } finally { await server.close() }
})
