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
  assert.throws(() => validarPizarra({ ...d, version: 3 }))
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
  // Un paso armado a mano sin los campos v2 se completa con los valores por defecto; recargar no cambia nada.
  const recargada = validarPizarra(JSON.parse(JSON.stringify(d)))
  assert.deepEqual(recargada.pasos[1], { ...d.pasos[1], texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [] })
  assert.deepEqual(validarPizarra(recargada), recargada)
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
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/PizarraTactica.jsx')
    const doc = agregarElemento(nuevaPizarra(), 'jugadora')
    const render = (C, props) => renderToStaticMarkup(createElement(C, props))
    const html = render(Editor, { inicial: doc, onGuardar() {} })
    assert.match(html, /<svg/); assert.match(html, /Agregar paso/); assert.match(html, /Descargar PNG/); assert.match(html, /Agregar a la cancha/)
    const lector = render(Editor, { inicial: doc, soloLectura: true })
    assert.doesNotMatch(lector, /Agregar a la cancha|Propiedades|Borrar todo|Aplicar pizarra|Notas internas|Recuperar JSON|Subtítulo del paso/)
    const { default: Entrada } = await server.ssrLoadModule('/src/components/PizarraEjercicio.jsx')
    assert.equal(render(Entrada, { soloLectura: true, valor: null }), '')
    assert.equal(render(Entrada, { soloLectura: true, valor: { version: 99 } }), '')
    assert.match(render(Entrada, { soloLectura: true, valor: doc }), /Ver ejercicio/)
    const css = readFileSync(new URL('../src/components/pizarra.css', import.meta.url), 'utf8')
    assert.match(css, /touch-action: none/); assert.match(css, /max-width: 750px/)
  } finally { await server.close() }
})

test('Etapa 1: flechas dibujadas, extremos con rotación, equipos y formato v1 intacto', async () => {
  const { colocarFlecha, moverExtremo, PALETA, plantillaHerramienta, SUPERFICIES } = await import('../src/utils/pizarra.js')
  let d = colocarFlecha(nuevaPizarra(), 'pase', { x: 10, y: 20 }, { x: 40, y: 60 })
  const f = d.elementos[0]
  assert.deepEqual([d.pasos[0].poses[f.id].x, d.pasos[0].poses[f.id].y, f.dx, f.dy, f.curva], [10, 20, 30, 40, 0])
  // El formato v1 limita el vector a ±80.
  assert.equal(colocarFlecha(nuevaPizarra(), 'movimiento', { x: 0, y: 0 }, { x: 100, y: -100 }).elementos[0].dx, 80)
  // Mover la punta con la flecha rotada 90°: la salida queda fija y la punta llega al destino.
  d = { ...d, pasos: d.pasos.map(p => ({ ...p, poses: { [f.id]: { ...p.poses[f.id], rotacion: 90 } } })) }
  d = moverExtremo(d, 0, f.id, 'punta', { x: 50, y: 50 })
  const [w, h] = SUPERFICIES[d.superficie], e = d.elementos[0], pose = d.pasos[0].poses[f.id]
  const lx = e.dx * w / 100, ly = e.dy * h / 100
  assert.ok(Math.abs((pose.x * w / 100 - ly) * 100 / w - 50) < .05 && Math.abs((pose.y * h / 100 + lx) * 100 / h - 50) < .05)
  // Mover la salida conserva la punta.
  d = moverExtremo(d, 0, f.id, 'origen', { x: 30, y: 30 })
  const e2 = d.elementos[0], p2 = d.pasos[0].poses[f.id]
  assert.deepEqual([p2.x, p2.y], [30, 30])
  assert.ok(Math.abs((p2.x * w / 100 - e2.dy * h / 100) * 100 / w - 50) < .05)
  assert.equal(moverExtremo(agregarElemento(nuevaPizarra(), 'cono'), 0, 'x', 'punta', { x: 1, y: 1 }).elementos.length, 1)
  // Propias y rivales numeran por separado; rival es una jugadora v1 con otro color.
  const rival = plantillaHerramienta('rival')
  let eq = agregarElemento(agregarElemento(nuevaPizarra(), 'jugadora'), 'jugadora')
  eq = agregarElemento(eq, rival.tipo, 50, 50, rival.extra)
  assert.deepEqual(eq.elementos.map(x => [x.numero, x.color]), [['1', PALETA.local], ['2', PALETA.local], ['1', PALETA.rival]])
  assert.deepEqual(validarPizarra(JSON.parse(JSON.stringify(eq))), eq)
  assert.equal(plantillaHerramienta('inexistente'), null)
})

test('Etapa 1: el historial agrupa ediciones continuas y guarda hasta 100 pasos', async () => {
  const { LIMITE_HISTORIAL } = await import('../src/utils/pizarra.js')
  const base = agregarElemento(nuevaPizarra(), 'jugadora')
  let h = historialInicial(base)
  const tamano = t => ({ ...h.actual, elementos: h.actual.elementos.map(e => ({ ...e, tamano: t })) })
  for (const t of [4, 5, 6, 7]) h = historial(h, 'editar', tamano(t), 'propiedad:tamano')
  assert.equal(h.antes.length, 1); assert.equal(h.actual.elementos[0].tamano, 7)
  h = historial(h, 'deshacer'); assert.equal(h.actual.elementos[0].tamano, 3)
  h = historial(h, 'rehacer'); assert.equal(h.actual.elementos[0].tamano, 7)
  // Tras deshacer/rehacer la misma clave abre un paso nuevo.
  h = historial(h, 'editar', tamano(8), 'propiedad:tamano'); assert.equal(h.antes.length, 2)
  h = historial(h, 'editar', tamano(9)); h = historial(h, 'editar', tamano(10)); assert.equal(h.antes.length, 4)
  for (let i = 0; i < 150; i++) h = historial(h, 'editar', tamano(1 + (i % 10) / 10 + .01))
  assert.equal(h.antes.length, LIMITE_HISTORIAL)
})

test('Etapa 1: trazos según convención y colores de interfaz desde el tema', () => {
  const objeto = readFileSync(new URL('../src/components/PizarraObjeto.jsx', import.meta.url), 'utf8')
  assert.match(objeto, /movimiento: '2\.2 1\.3'/)
  assert.doesNotMatch(objeto, /pase: '/)
  const css = readFileSync(new URL('../src/components/pizarra.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i)
  const cancha = readFileSync(new URL('../src/components/PizarraCancha.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(cancha, /#[0-9a-f]{6}\b/i)
  const tema = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
  for (const t of ['--pizarra-cesped', '--pizarra-linea', '--pizarra-seleccion']) assert.match(tema, new RegExp(`${t}:`))
})

test('Etapa 1: vista vertical con fichas derechas, ataque hacia arriba y líneas debajo', async () => {
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server')
  const { colocarFlecha } = await import('../src/utils/pizarra.js')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Cancha } = await server.ssrLoadModule('/src/components/PizarraCancha.jsx')
    const doc = colocarFlecha(agregarElemento(nuevaPizarra(), 'jugadora', 30, 30), 'pase', { x: 30, y: 30 }, { x: 60, y: 30 })
    const html = (props) => renderToStaticMarkup(createElement(Cancha, { doc: { ...doc, orientacion: 'vertical' }, poses: doc.pasos[0].poses, ...props }))
    const auto = html({ giro: -90 })
    assert.match(auto, /translate\(0 105\) rotate\(-90\)/); assert.match(auto, /Ataque ↑/); assert.match(auto, /<g transform="rotate\(90\)">/)
    const guardada = html({})
    assert.match(guardada, /Ataque ↓/); assert.match(guardada, /<g transform="rotate\(-90\)">/)
    // La flecha (creada después) se dibuja antes que la jugadora.
    const orden = [...auto.matchAll(/data-elemento="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(orden, [doc.elementos[1].id, doc.elementos[0].id])
    assert.doesNotMatch(renderToStaticMarkup(createElement(Cancha, { doc, poses: doc.pasos[0].poses })), /rotate\(-?90\)/)
  } finally { await server.close() }
})
