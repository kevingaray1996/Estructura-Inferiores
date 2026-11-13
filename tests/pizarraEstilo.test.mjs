import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agregarElemento, colocarFlecha, nuevaPizarra, PALETA } from '../src/utils/pizarra.js'
import { CAPAS, escena } from '../src/utils/pizarraEscena.js'

test('Escena: posiciones en metros, altura en el piso por defecto y orden por capas estable', () => {
  let d = agregarElemento(nuevaPizarra(), 'pelota', 50, 50)
  d = agregarElemento(d, 'jugadora', 10, 20)
  d = agregarElemento(d, 'cono', 30, 30)
  d = colocarFlecha(d, 'pase', { x: 10, y: 20 }, { x: 40, y: 20 })
  d = agregarElemento(d, 'jugadora', 60, 40, { color: PALETA.rival, tinta: PALETA.tintaClara })
  const [pelota, propia, cono, flecha, rival] = d.elementos.map(e => e.id)
  const e = escena(d, d.pasos[0].poses, { [pelota]: 1.5 })
  assert.equal(e.ancho, 105); assert.equal(e.largo, 68)
  assert.deepEqual(e.objetos.map(o => o.id), [flecha, cono, propia, rival, pelota])
  const j = e.objetos.find(o => o.id === propia)
  assert.ok(Math.abs(j.x - 10.5) < 1e-9 && Math.abs(j.y - 13.6) < 1e-9 && j.z === 0)
  assert.equal(e.objetos.find(o => o.id === pelota).z, 1.5)
  assert.deepEqual([j.equipo, e.objetos.find(o => o.id === rival).equipo, e.objetos.find(o => o.id === cono).equipo], ['propio', 'rival', null])
  assert.ok(CAPAS.linea < CAPAS.jugadora && CAPAS.jugadora < CAPAS.pelota)
})

test('Rediseño: césped, volumen y tipografía salen de tokens del tema, y el PNG los resuelve', async () => {
  const tema = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
  for (const t of ['--pizarra-cesped-franja', '--pizarra-cesped-borde', '--pizarra-brillo', '--pizarra-relieve', '--pizarra-ficha-sombra', '--pizarra-fuente']) assert.match(tema, new RegExp(`${t}:`), t)
  // Sin color-mix en los tokens nuevos: el SVG convertido en imagen tiene que poder usarlos tal cual.
  const nuevos = tema.split('\n').filter(l => /--pizarra-(cesped-franja|cesped-borde|brillo|relieve|ficha-sombra):/.test(l))
  assert.ok(nuevos.every(l => !/color-mix/.test(l)))
  const exportar = readFileSync(new URL('../src/utils/pizarraExportar.js', import.meta.url), 'utf8')
  assert.match(exportar, /stopColor = calculado\.stopColor/)
  assert.match(exportar, /fontFamily = calculado\.fontFamily/)
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs'), { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Cancha } = await server.ssrLoadModule('/src/components/PizarraCancha.jsx')
    const { IconoHerramienta } = await server.ssrLoadModule('/src/components/PizarraPaleta.jsx')
    const d = agregarElemento(agregarElemento(nuevaPizarra(), 'jugadora', 30, 30), 'pelota', 33, 30)
    const html = renderToStaticMarkup(createElement(Cancha, { doc: d, poses: d.pasos[0].poses }))
    assert.match(html, /data-franjas="true"/)
    assert.match(html, /<radialGradient id="[^"]+-brillo"/)
    // Jugadora y pelota con sombra y brillo; el brillo apunta al degradé de esta cancha.
    const id = html.match(/<radialGradient id="([^"]+-brillo)"/)[1]
    assert.equal(html.split(`fill="url(#${id})"`).length - 1, 2)
    assert.equal((html.match(/<ellipse[^>]*var\(--pizarra-ficha-sombra\)/g) || []).length, 2)
    assert.match(html, /font-family:var\(--pizarra-fuente\)/)
    // Dos canchas en la misma página no comparten ids de degradé.
    const otra = renderToStaticMarkup(createElement('div', null, createElement(Cancha, { doc: d, poses: d.pasos[0].poses }), createElement(Cancha, { doc: d, poses: d.pasos[0].poses })))
    const ids = [...otra.matchAll(/<radialGradient id="([^"]+)"/g)].map(m => m[1])
    assert.equal(new Set(ids).size, ids.length)
    // Los íconos de la paleta (fuera de una cancha) quedan planos.
    assert.doesNotMatch(renderToStaticMarkup(createElement(IconoHerramienta, { id: 'jugadora' })), /url\(#/)
  } finally { await server.close() }
})
