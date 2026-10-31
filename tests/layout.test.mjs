import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Layout: transiciones acotadas, movimiento reducido y estilos semánticos sin afectar impresión', () => {
  const css = readFileSync(new URL('../src/components/layout.css', import.meta.url), 'utf8')
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /transition: none/)
  assert.doesNotMatch(css, /!important|transition:\s*all|@media\s+print/)
  for (const token of ['--ui-fondo-sidebar', '--ui-nav-activo-texto', '--ui-nav-activo-fondo', '--ui-acento', '--ui-foco']) assert.ok(css.includes(token))
  assert.match(css, /min-height:\s*44px/)
  assert.doesNotMatch(css, /\.club-contenido\s*\{[^}]*transition/)
})
