import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crearCatalogo, CATALOGO_BASE, CATALOGO_POR_DEFECTO } from '../src/utils/analisis/catalogoAcciones.js'
import { aparienciaTipo, atajosDeBotonera, tiposBotonera } from '../src/utils/analisis/botonera.js'

test('la botonera sale del catálogo: solo visibles y en el orden de la tabla', () => {
  const catalogo = crearCatalogo([
    { codigo: 'Remate', etiqueta_boton: 'Tiro', icono: '◎', color: 'acento', orden: 2, grupo: 'ofensiva' },
    { codigo: 'Pérdida', etiqueta_boton: 'Pérdida', icono: '×', color: 'peligro', orden: 1, grupo: 'ofensiva' },
    { codigo: 'Despeje', etiqueta_boton: 'Despeje', color: 'info', orden: 3, visible: false, grupo: 'defensiva' },
  ])
  const tipos = tiposBotonera(catalogo)
  assert.deepEqual(tipos.map((t) => t.nombre), ['Pérdida', 'Remate'])
  assert.equal(tipos[1].corto, 'Tiro')
  assert.equal(tipos[0].color, 'var(--ui-peligro)')
  assert.equal(tipos[0].colorTexto, 'var(--plantel-peligro)')
})

test('sin tabla, la botonera por defecto tiene los botones de siempre menos «Gol» (lo carga el botón del marcador)', () => {
  assert.equal(tiposBotonera(CATALOGO_POR_DEFECTO).length, CATALOGO_BASE.length - 1)
  assert.ok(!tiposBotonera(CATALOGO_POR_DEFECTO).some((t) => t.nombre === 'Gol'))
  assert.equal(tiposBotonera(CATALOGO_POR_DEFECTO)[0].corto, 'Pase +')
})

test('las teclas solo valen para los botones que están en la botonera', () => {
  const tipos = [{ nombre: 'Pérdida' }, { nombre: 'Remate' }]
  assert.deepEqual(atajosDeBotonera({ 'Pérdida': 'p', 'Despeje': 'e', 'Remate': 't' }, tipos), { 'Pérdida': 'p', 'Remate': 't' })
})

test('un tipo oculto o desconocido igual se puede pintar en la lista', () => {
  assert.equal(aparienciaTipo(CATALOGO_POR_DEFECTO, 'Despeje').icono, '⇧')
  assert.equal(aparienciaTipo(CATALOGO_POR_DEFECTO, 'Otro').icono, '•')
})

test('la pantalla ya no tiene la botonera fija en el código', () => {
  const s = readFileSync('src/components/AnalisisSection.jsx', 'utf8')
  assert.doesNotMatch(s, /TIPOS_RAPIDOS/)
  assert.match(s, /tiposBotonera\(catalogo\)/)
})
