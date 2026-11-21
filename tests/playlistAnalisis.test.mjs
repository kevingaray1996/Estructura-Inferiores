import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_POR_DEFECTO as C } from '../src/utils/analisis/catalogoAcciones.js'
import {
  clipDe, faltasDetalle, filtrarPlaylist, progresoDetalle, resolverDorsal, siguientePendiente, vecina,
} from '../src/utils/analisis/playlist.js'

const ev = (id, tipo, extra = {}) => ({ id, tipo, segundo: 100, jugador_id: 'j', zona: 'Medio centro', resultado: null, ...extra })

test('clip: 3 s antes y 5 s después, sin bajar de 0', () => {
  assert.deepEqual(clipDe({ segundo: 100 }), { inicio: 97, fin: 105 })
  assert.deepEqual(clipDe({ segundo: 1 }), { inicio: 0, fin: 6 })
})

test('pendiente de detallar: jugadora, receptora en pases, zona y resultado si el tipo los usa', () => {
  // Pase: resultado fijo, pide receptora.
  assert.deepEqual(faltasDetalle(ev('a', 'Pase correcto'), undefined, C), ['receptora'])
  assert.deepEqual(faltasDetalle(ev('a', 'Pase correcto'), { destinataria_estado: 'pendiente' }, C), ['receptora'])
  assert.deepEqual(faltasDetalle(ev('a', 'Pase correcto'), { destinataria_estado: 'no_observable' }, C), [])
  // Remate: pide resultado.
  assert.deepEqual(faltasDetalle(ev('b', 'Remate'), undefined, C), ['resultado'])
  // Sin jugadora y sin zona.
  assert.deepEqual(faltasDetalle(ev('c', 'Pérdida', { jugador_id: null, zona: null }), undefined, C), ['jugadora', 'zona'])
  // Atajada: zona opcional y sin resultado.
  assert.deepEqual(faltasDetalle(ev('d', 'Atajada', { zona: null }), undefined, C), [])
})

test('progreso, filtro de pendientes y por tipo', () => {
  const lista = [ev('1', 'Pérdida'), ev('2', 'Remate'), ev('3', 'Remate', { resultado: 'Gol' }), ev('4', 'Pérdida', { jugador_id: null })]
  assert.deepEqual(progresoDetalle(lista, {}, C), { detalladas: 2, total: 4 })
  assert.deepEqual(filtrarPlaylist(lista, { soloPendientes: true }, {}, C).map((e) => e.id), ['2', '4'])
  assert.deepEqual(filtrarPlaylist(lista, { tipo: 'Remate' }, {}, C).map((e) => e.id), ['2', '3'])
  assert.deepEqual(filtrarPlaylist(lista, { tipo: 'Remate', soloPendientes: true }, {}, C).map((e) => e.id), ['2'])
})

test('↑ / ↓ y siguiente pendiente', () => {
  const lista = [ev('1', 'Pérdida'), ev('2', 'Remate'), ev('3', 'Pérdida'), ev('4', 'Remate')]
  assert.equal(vecina(lista, null, 1), '1')
  assert.equal(vecina(lista, null, -1), '4')
  assert.equal(vecina(lista, '2', 1), '3')
  assert.equal(vecina(lista, '1', -1), '1', 'En la primera, ↑ se queda')
  assert.equal(siguientePendiente(lista, '2', {}, C), '4')
  assert.equal(siguientePendiente(lista, '4', {}, C), '2', 'Si no hay después, vuelve a la primera pendiente')
  assert.equal(siguientePendiente([ev('1', 'Pérdida')], '1', {}, C), null)
})

test('dorsal: elige al instante si no hay dudas y espera si puede venir otro número', () => {
  const citaciones = [{ jugador_id: 'a', dorsal: 1 }, { jugador_id: 'b', dorsal: 10 }, { jugador_id: 'c', dorsal: 7 }, { jugador_id: 'd', dorsal: null }]
  assert.deepEqual(resolverDorsal(citaciones, '7'), { citacion: citaciones[2], esperar: false })
  assert.deepEqual(resolverDorsal(citaciones, '1'), { citacion: citaciones[0], esperar: true })
  assert.deepEqual(resolverDorsal(citaciones, '10'), { citacion: citaciones[1], esperar: false })
  assert.deepEqual(resolverDorsal(citaciones, '5'), { citacion: null, esperar: false })
  assert.deepEqual(resolverDorsal(citaciones, 'x'), { citacion: null, esperar: false })
})
