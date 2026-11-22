// Marcador de transmisión de Análisis: reloj del partido, resultado, sigla del rival y minuto escrito a mano.
import test from 'node:test'
import assert from 'node:assert/strict'
import { leerMinutoPartido, leerTiempoPartido, relojPartido, resultadoHasta, siglaEquipo, textoTiempos, tiemposDe } from '../src/utils/analisis/marcador.js'
import { minutoReal } from '../src/utils/analisis/eventosPartido.js'
import { jugadorasInforme } from '../src/utils/analisis/informePartido.js'

// 1T empieza en el segundo 100 del video y termina a los 47'; el 2T empieza en el 3400.
const M = { inicio_1t: 100, fin_1t: 100 + 47 * 60, inicio_2t: 3400, fin_partido: 3400 + 46 * 60 }

test('reloj: previa, 1T, descuento, entretiempo, 2T y final', () => {
  assert.equal(relojPartido(50, M).etiqueta, 'Previa')
  const r = relojPartido(100 + 22 * 60 + 41, M)
  assert.deepEqual([r.estado, r.etiqueta, r.reloj], ['juego', '1T', '22:41'])
  assert.equal(relojPartido(100, M).reloj, '00:00')
  assert.equal(relojPartido(100 + 45 * 60 - 1, M).reloj, '44:59')
  const d = relojPartido(100 + 46 * 60 + 10, M)
  assert.deepEqual([d.reloj, d.descuento], ["45+2'", 2])
  assert.equal(relojPartido(100 + 45 * 60, M).reloj, "45+1'")
  const e = relojPartido(3000, M)
  assert.deepEqual([e.estado, e.falta], ['entretiempo', null])
  assert.equal(relojPartido(3400 + 22 * 60 + 41, M).reloj, '22:41')
  assert.equal(relojPartido(3400 + 22 * 60 + 41, M).etiqueta, '2T')
  assert.equal(relojPartido(3400 + 45 * 60 + 30, M).reloj, "45+1'")
  assert.equal(relojPartido(M.fin_partido + 5, M).estado, 'final')
})

test('reloj: si faltan marcas, pide el inicio (o el inicio del 2T en el entretiempo)', () => {
  const sin = relojPartido(500, { inicio_1t: null, fin_1t: null, inicio_2t: null, fin_partido: null })
  assert.deepEqual([sin.estado, sin.falta, sin.etiqueta], ['sin_inicio', 'inicio_1t', 'Marcá el inicio'])
  assert.equal(relojPartido(500, null).falta, 'inicio_1t')
  const entre = relojPartido(3000, { inicio_1t: 100, fin_1t: 2900, inicio_2t: null, fin_partido: null })
  assert.deepEqual([entre.estado, entre.falta], ['entretiempo', 'inicio_2t'])
  // Sin el fin del 1T, el descuento sigue corriendo.
  assert.equal(relojPartido(100 + 60 * 60, { inicio_1t: 100 }).reloj, "45+16'")
})

test('resultado: cuenta solo los goles hasta ese segundo del video', () => {
  const eventos = [
    { tipo: 'gol', equipo: 'propio', segundo: 900 }, { tipo: 'gol', equipo: 'rival', segundo: 1500 },
    { tipo: 'gol', equipo: 'rival', segundo: 4000 }, { tipo: 'tarjeta', equipo: 'rival', segundo: 800 },
    { tipo: 'inicio_1t', segundo: 100 },
  ]
  assert.deepEqual(resultadoHasta(eventos, 899), { propios: 0, rivales: 0 })
  assert.deepEqual(resultadoHasta(eventos, 900), { propios: 1, rivales: 0 })
  assert.deepEqual(resultadoHasta(eventos, 5000), { propios: 1, rivales: 2 })
  assert.deepEqual(resultadoHasta(null, 5000), { propios: 0, rivales: 0 })
})

test('sigla del rival: tres letras, sin «Club», «Atlético» ni acentos', () => {
  assert.equal(siglaEquipo('Estrella del Sur'), 'EST')
  assert.equal(siglaEquipo('Club Atlético Platense'), 'PLA')
  assert.equal(siglaEquipo('Ávila'), 'AVI')
  assert.equal(siglaEquipo('C.A. Huracán'), 'HUR')
  assert.equal(siglaEquipo(''), '')
  assert.equal(siglaEquipo(null), '')
})

test('minuto escrito a mano: 67\', 2T 22\', 45+2\' y 90+3\' pasan al segundo del video', () => {
  assert.deepEqual(leerMinutoPartido("67'", M), { segundo: 3400 + 21 * 60 })
  assert.deepEqual(leerMinutoPartido('2T 22', M), { segundo: 3400 + 21 * 60 })
  assert.deepEqual(leerMinutoPartido('2t22’', M), { segundo: 3400 + 21 * 60 })
  assert.deepEqual(leerMinutoPartido("12'", M), { segundo: 100 + 11 * 60 })
  assert.deepEqual(leerMinutoPartido("45'", M), { segundo: 100 + 44 * 60 })
  assert.deepEqual(leerMinutoPartido("46'", M), { segundo: 3400 })
  assert.deepEqual(leerMinutoPartido("45+2'", M), { segundo: 100 + 46 * 60 })
  assert.deepEqual(leerMinutoPartido('45+2', M), { segundo: 100 + 46 * 60 })
  assert.deepEqual(leerMinutoPartido("1T 45+2'", M), { segundo: 100 + 46 * 60 })
  assert.deepEqual(leerMinutoPartido("90+3'", M), { segundo: 3400 + 47 * 60 })
  // Ida y vuelta con el minuto que se muestra.
  assert.equal(minutoReal(leerMinutoPartido("67'", M).segundo, M).texto, "2T 22'")
  assert.equal(minutoReal(leerMinutoPartido("45+2'", M).segundo, M).texto, "1T 45+2'")
  assert.equal(minutoReal(leerMinutoPartido("90+1'", M).segundo, M).texto, "2T 45+1'")
})

test('minuto escrito a mano: lo que no es minuto, errores y marcas que faltan', () => {
  assert.equal(leerMinutoPartido('12:34', M), null)
  assert.equal(leerMinutoPartido('67', M), null, 'Un número suelto sigue siendo segundos del video')
  assert.match(leerMinutoPartido("95'", M).error, /90\+5/)
  assert.match(leerMinutoPartido("30+2'", M).error, /descuento/)
  assert.match(leerMinutoPartido("0'", M).error, /primer minuto/)
  assert.match(leerMinutoPartido("67'", { inicio_1t: 100 }).error, /Inicio del 2T/)
  assert.deepEqual(leerTiempoPartido('12:34', M), { segundo: 754 })
  assert.deepEqual(leerTiempoPartido('67', M), { segundo: 67 })
  assert.deepEqual(leerTiempoPartido("67'", M), { segundo: 3400 + 21 * 60 })
  assert.match(leerTiempoPartido('hola', M).error, /minuto del partido/)
})

test('tiempos para mostrar: primero el minuto del partido y el del video al lado', () => {
  assert.deepEqual(tiemposDe(3400 + 21 * 60, M), { partido: "2T 22'", video: '77:40' })
  assert.deepEqual(tiemposDe(3000, M), { partido: null, video: '50:00' })
  assert.equal(textoTiempos(3400 + 21 * 60, M), "2T 22' (video 77:40)")
  assert.equal(textoTiempos(500, {}), '08:20')
})

test('informe: en pérdidas, rojo solo para quien supera el promedio del equipo; si empatan, ninguna', () => {
  const preparar = (lista) => lista.map((evento) => ({ evento }))
  const citaciones = ['a', 'b', 'c'].map((id, i) => ({ jugador_id: id, dorsal: i + 1, titular: true }))
  const p = (id) => ({ jugador_id: id, tipo: 'Pérdida' })
  const empate = jugadorasInforme(preparar([p('a'), p('b'), p('c')]), { citaciones, minutos: null })
  assert.deepEqual(empate.map((f) => f.perdidasDestacado), [false, false, false])
  const una = jugadorasInforme(preparar([p('a'), p('a'), p('a'), p('b'), p('c')]), { citaciones, minutos: null })
  assert.deepEqual(una.map((f) => [f.id, f.perdidasDestacado]), [['a', true], ['b', false], ['c', false]])
})
