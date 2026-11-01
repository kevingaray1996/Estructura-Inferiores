import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { construirEvolucion, compararPeriodos, diferenciaPeriodos, segmentosObservados } from '../src/utils/rendimiento/evolucion.js'
import { seleccionarJugadora } from '../src/utils/rendimiento/metricas.js'

const datos = {
  partidos: [{ id: 'p3', fecha: '2026-10-03', categoria_id: 'c' }, { id: 'p1', fecha: '2026-10-01', categoria_id: 'c' }, { id: 'p4', fecha: '2026-10-04', categoria_id: 'c' }, { id: 'p2', fecha: '2026-10-02', categoria_id: 'c' }, { id: 'u', fecha: null }],
  analisis: [{ id: 'a1', partido_calendario_id: 'p1', categoria_id: 'c' }, { id: 'a1bis', partido_calendario_id: 'p1', categoria_id: 'c' }, { id: 'a3', partido_calendario_id: 'p3', categoria_id: 'c' }, { id: 'a4', partido_calendario_id: 'p4', categoria_id: 'c' }, { id: 'huérfano' }],
  eventos: [...Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, partido_id: i % 2 ? 'a1' : 'a1bis', jugador_id: 'j', tipo: i === 0 ? 'Pase correcto' : 'Pase incorrecto', resultado: i === 0 ? 'Exitoso' : i === 1 ? 'Neutro' : i === 2 ? null : 'Fallido' })),
    { id: 'e10', partido_id: 'a3', jugador_id: 'j', tipo: 'Pase correcto', resultado: null }, { id: 'e11', partido_id: 'a4', jugador_id: 'j', tipo: 'Pase correcto', resultado: 'Gol' }],
  estadisticas: ['p1', 'p2', 'p3', 'p4', 'u'].map((id, i) => ({ partido_id: id, jugador_id: 'j', minutos_jugados: i === 0 ? 45 : i === 3 ? 0 : 90, titular: true })),
}
test('Evolución: cronología civil, fechas desconocidas, filtros, datos ausentes y tramos sin interpolación ficticia', () => {
  const r = construirEvolucion(datos, ['j'], 'precision', 'porcentaje')
  assert.deepEqual(r.partidos.map(p => p.id), ['p1', 'p2', 'p3', 'p4'])
  assert.equal(r.sinFecha.length, 1)
  assert.deepEqual(r.series[0].puntos.map(p => p.valor), [10, null, 100, 100])
  assert.deepEqual(segmentosObservados(r.series[0].puntos), [[2, 3]])
  assert.equal(r.motor.sinVinculo.length, 1)
  assert.deepEqual(construirEvolucion(datos, ['j'], 'minutos', 'absoluta', { desde: '2026-10-02', hasta: '2026-10-03' }).partidos.map(p => p.id), ['p2', 'p3'])
  assert.deepEqual(construirEvolucion(datos, ['j'], 'minutos', 'absoluta', { partidoIds: ['p1'] }).series[0].puntos.map(p => p.valor), [45])
  assert.deepEqual(segmentosObservados([{ valor: 0 }, { valor: null }, { valor: 0 }]), [])
})
test('Evolución: tasas por 90, participación única y efectividad excluye neutros y pendientes', () => {
  const tasas = construirEvolucion(datos, ['j'], 'pasesCorrectos', 'por90')
  assert.deepEqual(tasas.series[0].puntos.map(p => p.valor), [2, null, 1, null])
  const efectividad = construirEvolucion(datos, ['j'], 'efectividad', 'porcentaje')
  assert.deepEqual(efectividad.series[0].puntos.map(p => p.valor), [12.5, null, null, 100])
  assert.equal(efectividad.series[0].puntos[0].denominador, 8)
  const fallido = construirEvolucion({ ...datos, partidos: null, fuentes: { partidos: { estado: 'denegado' } } }, ['j'], 'minutos', 'absoluta')
  assert.equal(fallido.partidos.length, 0)
  assert.equal(fallido.series.length, 0)
  assert.throws(() => construirEvolucion(datos, ['j'], 'precision', 'por90'))
})
test('Períodos: denominadores agregados, diferencias, variaciones y alcance común', () => {
  const a = { partidoIds: ['p1', 'p3'] }, b = { desde: '2026-10-04', hasta: '2026-10-04' }
  const r = compararPeriodos(datos, ['j'], 'precision', 'porcentaje', {}, a, b).filas[0]
  assert.equal(r.a.numerador, 2); assert.equal(r.a.denominador, 11)
  assert.equal(r.a.valor, 200 / 11)
  assert.notEqual(r.a.valor, 55, 'Nunca promedia 10% y 100%')
  assert.equal(r.a.minutos, 135)
  assert.equal(r.a.partidosIncluidos, 2)
  assert.equal(r.b.valor, 100)
  assert.ok(Math.abs(r.variacion - 450) < 1e-10)
  assert.equal(r.diferencia, 100 - 200 / 11)
  const tasas = compararPeriodos(datos, ['j'], 'pasesCorrectos', 'por90', {}, a, b).filas[0]
  assert.equal(tasas.a.valor, 2 * 90 / 135)
  assert.equal(tasas.b.valor, null)
  assert.equal(tasas.diferencia, null)
  const recortado = compararPeriodos(datos, ['j'], 'precision', 'porcentaje', { partidoIds: ['p1'] }, a, b).filas[0]
  assert.equal(recortado.a.valor, 10); assert.equal(recortado.b.valor, null)
  assert.deepEqual(compararPeriodos(datos, ['j'], 'minutos', 'absoluta', {}, a, a).solapados, ['p3', 'p1'])
  assert.deepEqual(diferenciaPeriodos(0, 1), { diferencia: 1, variacion: null })
  assert.deepEqual(diferenciaPeriodos(null, 1), { diferencia: null, variacion: null })
  const error = compararPeriodos({ ...datos, partidos: null }, ['j'], 'minutos', 'absoluta', {}, a, b).filas[0]
  assert.equal(error.a.valor, null); assert.equal(error.a.partidosIncluidos, null)
})
test('Evolución: selección común máximo seis, estilos responsive, teclado y movimiento reducido', () => {
  let ids = []
  for (let i = 0; i < 8; i++) ids = seleccionarJugadora(ids, String(i))
  assert.equal(ids.length, 6)
  const css = readFileSync(new URL('../src/components/plantel/evolucion.css', import.meta.url), 'utf8')
  assert.match(css, /@media screen/); assert.match(css, /max-width:600px/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /:focus-visible/)
  assert.match(css, /var\(--ui-texto\)/)
  assert.doesNotMatch(css, /!important|@media print/)
})
