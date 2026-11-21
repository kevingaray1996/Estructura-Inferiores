import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cambiosDe, enCancha, estabaEnCancha, faltanMarcas, leerTiempo, marcasDe, minutoReal, minutosSugeridos,
  periodoPorMarcas, problemasOrden,
} from '../src/utils/analisis/eventosPartido.js'
import { tramosSinAcciones } from '../src/utils/analisis/tramos.js'

const M = { inicio_1t: 100, fin_1t: 2800, inicio_2t: 3400, fin_partido: 6100 }

test('marcas: lee, avisa las que faltan y las que están fuera de orden', () => {
  const marcas = marcasDe([{ tipo: 'inicio_1t', segundo: 100 }, { tipo: 'cambio', segundo: 50 }, { tipo: 'fin_1t', segundo: 90 }])
  assert.deepEqual(marcas, { inicio_1t: 100, fin_1t: 90, inicio_2t: null, fin_partido: null })
  assert.deepEqual(faltanMarcas(marcas), ['Inicio del 2T', 'Fin del partido'])
  assert.deepEqual(problemasOrden(marcas), ['«Fin del 1T» tiene que ser después de «Inicio del partido».'])
  assert.deepEqual(problemasOrden(M), [])
})

test('minuto real y tiempo del partido según las marcas', () => {
  assert.equal(minutoReal(100, M).texto, "1T 1'")
  assert.equal(minutoReal(100 + 11 * 60 + 59, M).texto, "1T 12'")
  assert.equal(minutoReal(3400 + 11 * 60, M).texto, "2T 12'")
  assert.equal(minutoReal(50, M).texto, 'Antes del inicio')
  assert.equal(minutoReal(3000, M).texto, 'Entretiempo')
  assert.equal(minutoReal(6200, M).texto, 'Después del final')
  assert.equal(minutoReal(500, { inicio_1t: null }), null)
  // Solo con el inicio: alcanza para el 1T.
  assert.equal(minutoReal(700, { inicio_1t: 100, fin_1t: null, inicio_2t: null, fin_partido: null }).texto, "1T 11'")
  assert.equal(periodoPorMarcas(3399, M), 1)
  assert.equal(periodoPorMarcas(3400, M), 2)
  assert.equal(periodoPorMarcas(3400, { inicio_2t: null }), null)
})

test('en cancha: titulares con los cambios hechos hasta ese momento', () => {
  const cambios = cambiosDe([
    { tipo: 'cambio', segundo: 4000, jugadora_sale: 'a', jugadora_entra: 'x' },
    { tipo: 'gol', segundo: 1000 },
    { tipo: 'cambio', segundo: 2000, jugadora_sale: 'b', jugadora_entra: 'y' },
  ])
  assert.deepEqual(cambios.map((c) => c.segundo), [2000, 4000])
  assert.deepEqual([...enCancha(2500, ['a', 'b'], cambios)].sort(), ['a', 'y'])
  assert.equal(estabaEnCancha('x', 3999, ['a', 'b'], cambios), false)
  assert.equal(estabaEnCancha('x', 4000, ['a', 'b'], cambios), true)
  assert.equal(estabaEnCancha('x', 4000, [], cambios), null, 'Sin titulares no se puede saber')
})

test('minutos sugeridos: solo dentro de los dos tiempos, con los cambios', () => {
  // 1T de 45' justos y 2T de 45' justos. «b» sale a los 30' del 2T; entra «y».
  const marcas = { inicio_1t: 0, fin_1t: 2700, inicio_2t: 3600, fin_partido: 6300 }
  const cambios = [{ tipo: 'cambio', segundo: 3600 + 1800, jugadora_sale: 'b', jugadora_entra: 'y' }]
  assert.deepEqual(minutosSugeridos(['a', 'b', 'y', 'z'], ['a', 'b'], cambios, marcas), { a: 90, b: 75, y: 15, z: 0 })
  assert.equal(minutosSugeridos(['a'], ['a'], [], { ...marcas, fin_partido: null }), null, 'Faltan marcas')
  assert.equal(minutosSugeridos(['a'], [], [], marcas), null, 'Sin titulares')
})

test('tiempo escrito a mano', () => {
  assert.equal(leerTiempo('12:34'), 754)
  assert.equal(leerTiempo('1:02:03'), 3723)
  assert.equal(leerTiempo('90'), 90)
  assert.equal(leerTiempo('12:75'), null)
  assert.equal(leerTiempo('abc'), null)
})

test('tramos sin acciones: con las marcas, cuentan desde el inicio y hasta el fin de cada tiempo', () => {
  const eventos = [600, 700].map((segundo) => ({ segundo, periodo: 1 }))
  assert.deepEqual(tramosSinAcciones(eventos, 180), [])
  const marcas = { inicio_1t: 100, fin_1t: 2800, inicio_2t: 3400, fin_partido: 6100 }
  assert.deepEqual(tramosSinAcciones(eventos, 180, marcas), [
    { periodo: 1, desde: 100, hasta: 600, duracion: 500 },
    { periodo: 1, desde: 700, hasta: 2800, duracion: 2100 },
    { periodo: 2, desde: 3400, hasta: 6100, duracion: 2700 },
  ])
})
