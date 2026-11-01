import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

test('Plantel Premium conserva consultas, filtros, cálculos y asignación de las dos formaciones', () => {
  const anterior = execFileSync('git', ['show', 'HEAD:src/components/ListaJugadores.jsx'], { encoding: 'utf8' }).replaceAll('\r', '')
  const actual = readFileSync(new URL('../src/components/ListaJugadores.jsx', import.meta.url), 'utf8').replaceAll('\r', '')
  const funciones = s => s.slice(s.indexOf('const estadoConfig'), s.indexOf('function FotoJugadora'))
  assert.equal(funciones(actual), funciones(anterior))
  const cargaYCalculos = s => s.slice(s.indexOf('function ListaJugadores'), s.indexOf('  return (\n    <div', s.indexOf('function ListaJugadores')))
  assert.equal(cargaYCalculos(actual), cargaYCalculos(anterior))
  assert.match(actual, /jugadoras=\{jugadores\}/, 'La cancha conserva todo el plantel, no solo el filtro')
  assert.match(actual, /No representa una convocatoria oficial/)
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
