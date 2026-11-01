import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

test('Partidos y Calendario Premium conservan consultas, cálculos y manejadores originales', () => {
  for (const archivo of ['ListaPartidos', 'CalendarioSection', 'PartidosSection']) {
    const ruta = `src/components/${archivo}.jsx`
    const antes = execFileSync('git', ['show', `HEAD:${ruta}`], { encoding: 'utf8' }).replaceAll('\r', '')
    const ahora = readFileSync(ruta, 'utf8').replaceAll('\r', '')
    const inicio = s => s.indexOf(`function ${archivo}(`)
    const logica = s => s.slice(inicio(s), s.indexOf('\n  return (', inicio(s)))
    assert.equal(logica(ahora), logica(antes), `${archivo}: se conserva la lógica previa al render`)
  }
})

test('Premium: ancho, legibilidad, detalle fotográfico, responsive, temas y movimiento reducido', () => {
  const css = readFileSync('src/components/partidosCalendarioPremium.css', 'utf8')
  const calendario = readFileSync('src/components/CalendarioSection.jsx', 'utf8')
  assert.match(css, /max-width:1440px/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 320px/)
  assert.match(css, /\.calendario-desplazable[^}]*overflow-x:auto/)
  assert.match(css, /\.calendario-evento[^}]*font-size:12px/)
  assert.match(css, /@media\(max-width:600px\)/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /var\(--ui-superficie\)/)
  assert.doesNotMatch(css, /!important|@media print/)
  assert.doesNotMatch(calendario, /text-\[9px\]/)
  assert.match(calendario, /<aside className="calendario-detalle"/)
  assert.match(calendario, /pelotas-entrenamiento-comunicaciones.jpeg/)
  assert.match(calendario, /aria-label="Grilla mensual desplazable" tabIndex=\{0\}/)
})
