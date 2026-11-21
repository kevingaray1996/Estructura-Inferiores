// Atajos de teclado y tramos sin acciones de Análisis: lógica pura, sin pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ATAJOS_POR_DEFECTO, CLAVE_ATAJOS, accionDeTecla, escribiendoEnCampo, guardarAtajos, leerAtajos, mostrarTecla, teclaDeEvento, validarAtajo } from '../src/utils/analisis/atajos.js'
import { tramosSinAcciones } from '../src/utils/analisis/tramos.js'

const almacen = () => { const d = new Map(); return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, v) } }

test('teclas por defecto: + y − para los pases, una tecla distinta por acción y ninguna reservada', () => {
  assert.equal(ATAJOS_POR_DEFECTO['Pase correcto'], '+')
  assert.equal(ATAJOS_POR_DEFECTO['Pase incorrecto'], '-')
  const teclas = Object.values(ATAJOS_POR_DEFECTO)
  assert.equal(new Set(teclas).size, teclas.length)
  for (const t of teclas) assert.ok(![' ', '?'].includes(t))
  assert.equal(accionDeTecla(ATAJOS_POR_DEFECTO, '+'), 'Pase correcto')
  assert.equal(mostrarTecla('-'), '−')
  assert.equal(mostrarTecla('p'), 'P')
})

test('teclaDeEvento: minúscula, e ignora combinaciones con Ctrl/Alt/Cmd', () => {
  assert.equal(teclaDeEvento({ key: 'P' }), 'p')
  assert.equal(teclaDeEvento({ key: '+' }), '+')
  assert.equal(teclaDeEvento({ key: 'z', ctrlKey: true }), null)
  assert.equal(teclaDeEvento({ key: 'c', metaKey: true }), null)
})

test('escribiendoEnCampo: textos, selectores y editables escriben; botones y casillas no', () => {
  assert.equal(escribiendoEnCampo({ tagName: 'INPUT', type: 'text' }), true)
  assert.equal(escribiendoEnCampo({ tagName: 'INPUT', type: 'number' }), true)
  assert.equal(escribiendoEnCampo({ tagName: 'TEXTAREA' }), true)
  assert.equal(escribiendoEnCampo({ tagName: 'SELECT' }), true)
  assert.equal(escribiendoEnCampo({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(escribiendoEnCampo({ tagName: 'INPUT', type: 'checkbox' }), false)
  assert.equal(escribiendoEnCampo({ tagName: 'BUTTON' }), false)
  assert.equal(escribiendoEnCampo(null), false)
})

test('validarAtajo: una sola tecla, no reservada y no usada por otra acción', () => {
  assert.deepEqual(validarAtajo('x', 'Pérdida', ATAJOS_POR_DEFECTO), { ok: true })
  assert.equal(validarAtajo('p', 'Pérdida', ATAJOS_POR_DEFECTO).ok, true, 'La misma tecla que ya tiene')
  const ocupada = validarAtajo('+', 'Pérdida', ATAJOS_POR_DEFECTO)
  assert.equal(ocupada.ok, false); assert.equal(ocupada.ocupadaPor, 'Pase correcto')
  assert.equal(validarAtajo(' ', 'Pérdida', ATAJOS_POR_DEFECTO).ok, false)
  assert.equal(validarAtajo('?', 'Pérdida', ATAJOS_POR_DEFECTO).ok, false)
  assert.equal(validarAtajo('ab', 'Pérdida', ATAJOS_POR_DEFECTO).ok, false)
})

test('leer y guardar en esta computadora; datos rotos vuelven a los de por defecto', () => {
  const a = almacen()
  assert.deepEqual(leerAtajos(a), ATAJOS_POR_DEFECTO)
  assert.equal(guardarAtajos({ ...ATAJOS_POR_DEFECTO, Pérdida: 'x' }, a), true)
  assert.equal(leerAtajos(a).Pérdida, 'x')
  a.setItem(CLAVE_ATAJOS, JSON.stringify({ Gol: 'g', Remate: 'g', Centro: ' ', Despeje: 'ee' }))
  assert.deepEqual(leerAtajos(a), { Gol: 'g' }, 'Descarta duplicadas, reservadas y de más de una letra')
  a.setItem(CLAVE_ATAJOS, '{roto')
  assert.deepEqual(leerAtajos(a), ATAJOS_POR_DEFECTO)
  assert.deepEqual(leerAtajos({ getItem() { throw Error('bloqueado') } }), ATAJOS_POR_DEFECTO)
})

test('tramos sin acciones: huecos largos dentro de cada tiempo, no entre tiempos', () => {
  const eventos = [
    { segundo: 10, periodo: 1 }, { segundo: 100, periodo: 1 }, { segundo: 400, periodo: 1 }, { segundo: 420, periodo: 1 },
    { segundo: 2800, periodo: 2 }, { segundo: 3500, periodo: 2 }, { segundo: 'x', periodo: 2 },
  ]
  assert.deepEqual(tramosSinAcciones(eventos, 180), [
    { periodo: 1, desde: 100, hasta: 400, duracion: 300 },
    { periodo: 2, desde: 2800, hasta: 3500, duracion: 700 },
  ])
  assert.deepEqual(tramosSinAcciones(eventos, 600), [{ periodo: 2, desde: 2800, hasta: 3500, duracion: 700 }])
  assert.deepEqual(tramosSinAcciones([], 180), [])
})
