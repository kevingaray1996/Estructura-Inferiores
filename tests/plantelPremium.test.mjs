import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { agruparPlantel, puestoPlantel } from '../src/components/plantel/posicionesPlantel.js'

test('Galería 2.0 agrupa una sola vez por posición principal y conserva casos desconocidos', () => {
  const jugadoras = [
    { id: 'a', posicion: 'Arquero' }, { id: 'b', posicion: 'Defensor central', posicion_secundaria: 'Delantero centro' },
    { id: 'c', posicion: ' Extremo izquierdo ' }, { id: 'd', posicion: 'Delantero centro' },
    { id: 'e', posicion: null }, { id: 'f', posicion: 'Puesto no definido' },
  ]
  const grupos = agruparPlantel(jugadoras)
  assert.deepEqual(grupos.map(g => [g.id, g.jugadoras.length]), [['arqueras', 1], ['defensoras', 1], ['mediocampistas', 1], ['delanteras', 1], ['sin_equivalencia', 2]])
  assert.equal(new Set(grupos.flatMap(g => g.jugadoras.map(j => j.id))).size, jugadoras.length)
  assert.equal(puestoPlantel('LATERAL DERECHO').abreviatura, 'LD')
  assert.equal(puestoPlantel('Puesto no definido').abreviatura, '—')
})

test('Tarjetas 2.0 iluminan fotos con hover y foco, sin oscurecer nombres ni depender del hover táctil', () => {
  const css = readFileSync(new URL('../src/components/plantel/plantel.css', import.meta.url), 'utf8')
  assert.match(css, /brightness\(\.76\)/)
  assert.match(css, /filter 280ms/)
  assert.match(css, /hover: hover/)
  assert.match(css, /:focus-visible img/)
  assert.match(css, /:active img/)
  assert.match(css, /brightness\(1\)/)
  assert.match(css, /object-fit: contain/)
  const tarjeta = readFileSync(new URL('../src/components/plantel/TarjetaJugadora.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(tarjeta, /<dl|minutos|goles|titularidades|disabled=|aria-disabled/)
})

test('Plantel Premium conserva consultas, filtros, cálculos y asignación de las dos formaciones', () => {
  const anterior = execFileSync('git', ['show', 'HEAD:src/components/ListaJugadores.jsx'], { encoding: 'utf8' }).replaceAll('\r', '')
  const actual = readFileSync(new URL('../src/components/ListaJugadores.jsx', import.meta.url), 'utf8').replaceAll('\r', '')
  assert.equal(actual.slice(actual.indexOf('function coincideEstado'), actual.indexOf('function obtenerDato')),
    anterior.slice(anterior.indexOf('function coincideEstado'), anterior.indexOf('function obtenerDato')))
  const cargaYCalculos = s => s.slice(s.indexOf('function ListaJugadores'), s.indexOf('  return (\n    <div', s.indexOf('function ListaJugadores')))
    .replace("  const [vistaPlantel, setVistaPlantel] = useState('jugadoras')\n", '')
  assert.equal(cargaYCalculos(actual), cargaYCalculos(anterior))
  assert.match(actual, /<RendimientoPlantel[^>]*jugadoras=\{jugadores\}/, 'Rendimiento recibe todo el plantel, no solo el filtro')
  const rendimiento = readFileSync(new URL('../src/components/plantel/RendimientoPlantel.jsx', import.meta.url), 'utf8')
  assert.match(rendimiento, /<FormacionesPlantel \{\.\.\.formaciones\}/, 'Formaciones recibe las mismas jugadoras sin aplicar el filtro de la galería')
  const formaciones = readFileSync(new URL('../src/components/plantel/FormacionesPlantel.jsx', import.meta.url), 'utf8')
  assert.match(formaciones, /No representa una convocatoria oficial/)
  assert.match(formaciones, /Formación automática por minutos/)
})

test('Plantel Premium usa tokens, grillas adaptables y foco sin modificar impresión', () => {
  const css = readFileSync(new URL('../src/components/plantel/plantel.css', import.meta.url), 'utf8')
  const paleta = readFileSync(new URL('../src/appearance/plantel.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
  for (const [, variable] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(paleta.includes(variable), variable)
  assert.match(css, /repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(css, /repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css, /max-width: 639px/)
  assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
  assert.doesNotMatch(css, /!important|@media print|:root/)
  const tarjeta = readFileSync(new URL('../src/components/plantel/TarjetaJugadora.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(tarjeta, /supabase|fetch\(|localStorage/)
})
