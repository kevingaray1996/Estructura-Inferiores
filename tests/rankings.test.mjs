import test from 'node:test'
import assert from 'node:assert/strict'
import { construirRendimiento } from '../src/utils/rendimiento/metricas.js'
import { construirRanking, modalidadesMetrica, METRICAS_RANKING } from '../src/utils/rendimiento/rankings.js'
import { detalleMetrica, METRICAS } from '../src/utils/rendimiento/comparativas.js'
import { readFileSync } from 'node:fs'

const jugadoras = [
  { id: 'a', nombre: 'Ana', apellido: 'Zulu', posicion: 'Arquero' },
  { id: 'b', nombre: 'Bea', apellido: 'Alfa', posicion: 'Arquero' },
  { id: 'c', nombre: 'Cata', apellido: 'Otra', posicion: 'Defensor central' },
  { id: 'd', nombre: 'Dani', apellido: 'Ausente', posicion: 'Delantero centro' },
]
const datos = {
  partidos: [{ id: 'p', categoria_id: 'cat', fecha: '2026-10-31' }, { id: 'q', categoria_id: 'cat', fecha: '2026-11-01' }],
  analisis: [{ id: 'x', partido_calendario_id: 'p', categoria_id: 'cat' }, { id: 'y', partido_calendario_id: 'p', categoria_id: 'cat' }, { id: 'z', partido_calendario_id: 'q', categoria_id: 'cat' }],
  estadisticas: ['p', 'q'].flatMap(partido_id => jugadoras.slice(0, 3).map(j => ({ jugador_id: j.id, partido_id, minutos_jugados: j.id === 'c' ? 45 : 90, titular: true }))),
  eventos: [
    { id: '1', partido_id: 'x', jugador_id: 'a', tipo: 'Pase correcto', resultado: null },
    { id: '2', partido_id: 'y', jugador_id: 'a', tipo: 'Pase incorrecto', resultado: 'Fallido' },
    { id: '3', partido_id: 'x', jugador_id: 'b', tipo: 'Pase correcto', resultado: 'Exitoso' },
    { id: '4', partido_id: 'z', jugador_id: 'c', tipo: 'Duelo defensivo', resultado: 'Neutro' },
  ],
}
const motor = (filtros = {}) => construirRendimiento(datos, { ...filtros, jugadoraIds: jugadoras.map(j => j.id) })

test('Rankings: empates comparten puesto, orden estable, participación única y filtros por puesto/grupo', () => {
  const r = construirRanking(motor(), jugadoras)
  assert.deepEqual(r.filas.map(f => [f.jugadora.id, f.valor, f.puesto]), [['b', 180, 1], ['a', 180, 1], ['c', 90, 3]])
  assert.equal(r.excluidas[0].jugadora.id, 'd')
  assert.equal(r.filas[0].partidos, 2)
  assert.equal(construirRanking(motor(), jugadoras, { posicion: 'Arquero' }).filas.length, 2)
  assert.equal(construirRanking(motor(), jugadoras, { grupo: 'defensoras' }).filas[0].jugadora.id, 'c')
  assert.equal(construirRanking(motor({ partidoIds: ['p'] }), jugadoras).filas[0].valor, 90)
  assert.equal(construirRanking(motor({ desde: '2026-11-01' }), jugadoras, { metricaId: 'duelosDefensivos' }).filas[0].jugadora.id, 'c')
})
test('Rankings: porcentajes y tasas idénticos a Comparativas, ceros confirmados y ausencias excluidas', () => {
  const m = motor({ partidoIds: ['p'] })
  const r = construirRanking(m, jugadoras, { metricaId: 'precision', modalidad: 'porcentaje' })
  assert.deepEqual(r.filas.map(f => [f.jugadora.id, f.valor, f.numerador, f.denominador]), [['b', 100, 1, 1], ['a', 50, 1, 2]])
  assert.equal(r.filas[0].muestraPequena, true)
  assert.equal(r.filas[1].valor, detalleMetrica(m.jugadoras.find(j => j.jugadorId === 'a'), METRICAS.find(x => x.id === 'precision')).valor)
  const tasas = construirRanking(m, jugadoras, { metricaId: 'pasesCorrectos', modalidad: 'por90' })
  assert.equal(tasas.filas.find(f => f.jugadora.id === 'a').valor, 1)
  assert.equal(tasas.filas.find(f => f.jugadora.id === 'c').valor, 0, 'Cero registrado es válido si las fuentes y minutos están confirmados')
  assert.ok(tasas.excluidas.some(f => f.jugadora.id === 'd'))
  const incompleto = construirRendimiento({ ...datos, analisis: [] }, { jugadoraIds: ['a'] })
  assert.equal(construirRanking(incompleto, [jugadoras[0]], { metricaId: 'pasesCorrectos', modalidad: 'por90' }).filas.length, 0)
  const ceroMinutos = construirRendimiento({ ...datos, estadisticas: datos.estadisticas.map(f => ({ ...f, minutos_jugados: 0 })) }, { jugadoraIds: ['a'] })
  assert.equal(construirRanking(ceroMinutos, [jugadoras[0]], { metricaId: 'pasesCorrectos', modalidad: 'por90' }).filas.length, 0)
  assert.equal(construirRanking(motor({ partidoIds: [] }), jugadoras).filas.length, 0)
  assert.throws(() => construirRanking(m, jugadoras, { metricaId: 'precision', modalidad: 'por90' }))
  assert.deepEqual(modalidadesMetrica(METRICAS_RANKING[0]), ['absoluta'])
})
test('Rankings: podio no rellena jugadoras inexistentes y cambios de métrica respetan registros', () => {
  for (let n = 0; n <= 3; n++) assert.equal(construirRanking(motor(), jugadoras.slice(0, n)).podio.length, n)
  assert.equal(construirRanking(motor(), jugadoras, { metricaId: 'partidos' }).filas[0].valor, 2)
  assert.equal(construirRanking(motor(), jugadoras, { metricaId: 'duelosOfensivos' }).filas.every(f => f.valor === 0), true)
})

test('Rankings: elegibilidad separa cero registrado, participación desconocida y evidencia propia', () => {
  const base = { partidos: [{ id: 'p' }], analisis: [{ id: 'a', partido_calendario_id: 'p' }], eventos: [], estadisticas: [] }
  const ids = jugadoras.map(j => j.id)
  let m = construirRendimiento(base, { jugadoraIds: ids })
  let r = construirRanking(m, jugadoras, { metricaId: 'recuperaciones' })
  assert.equal(r.filas.length, 0)
  assert.ok(r.excluidas.every(f => /Sin participación/.test(f.motivo)))
  m = construirRendimiento({ ...base, estadisticas: [{ jugador_id: 'a', partido_id: 'p', minutos_jugados: 90, titular: true }], eventos: [{ id: 'e', partido_id: 'a', jugador_id: 'b', tipo: 'Pase correcto' }] }, { jugadoraIds: ids })
  r = construirRanking(m, jugadoras, { metricaId: 'recuperaciones' })
  assert.equal(r.filas.find(f => f.jugadora.id === 'a').valor, 0)
  assert.equal(r.filas.find(f => f.jugadora.id === 'a').participacionConfirmada, true)
  assert.equal(r.filas.find(f => f.jugadora.id === 'b').participacionConfirmada, false)
  assert.equal(r.filas.find(f => f.jugadora.id === 'b').minutos, null)
  assert.equal(r.excluidas.length, 2)
  const tasas = construirRanking(m, jugadoras, { metricaId: 'recuperaciones', modalidad: 'por90' })
  assert.deepEqual(tasas.filas.map(f => f.jugadora.id), ['a'])
  const denegado = construirRendimiento({ ...base, eventos: null, fuentes: { eventos: { estado: 'denegado' } } }, { jugadoraIds: ids })
  assert.equal(construirRanking(denegado, jugadoras, { metricaId: 'recuperaciones' }).filas.length, 0)
})
test('Rankings: estilos acotados, responsive, temas y movimiento reducido sin impresión', () => {
  const css = readFileSync(new URL('../src/components/plantel/rankings.css', import.meta.url), 'utf8')
  assert.match(css, /@media screen/)
  assert.match(css, /@media\(max-width:900px\)/)
  assert.match(css, /@media\(max-width:600px\)/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /var\(--ui-texto\)/)
  assert.doesNotMatch(css, /!important|@media print/)
})
