import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { METRICAS, detalleMetrica, crearRadar, metricasRadar } from '../src/utils/rendimiento/comparativas.js'
import { construirRendimiento, seleccionarJugadora } from '../src/utils/rendimiento/metricas.js'

const entrada = {
  partidos: [{ id: 'p', categoria_id: 'c', fecha: '2026-10-31' }],
  analisis: [{ id: 'a', partido_calendario_id: 'p', categoria_id: 'c' }],
  eventos: [{ id: '1', partido_id: 'a', jugador_id: 'j', tipo: 'Pase correcto', resultado: null },
    { id: '2', partido_id: 'a', jugador_id: 'j', tipo: 'Pase incorrecto', resultado: 'Fallido' }],
  estadisticas: [{ partido_id: 'p', jugador_id: 'j', minutos_jugados: 45, titular: true }],
}
test('Comparativas: precisión, denominadores y tasas comparten partidos; ausencia no es cero', () => {
  const [j] = construirRendimiento(entrada).jugadoras
  assert.deepEqual(detalleMetrica(j, METRICAS.find(m => m.id === 'precision')), { valor: 50, numerador: 1, denominador: 2, tasa: null })
  assert.equal(detalleMetrica(j, METRICAS[0]).tasa, 2)
  assert.equal(detalleMetrica(j, METRICAS.at(-1)).valor, 0)
  assert.equal(detalleMetrica(null, METRICAS[0]).valor, null)
  assert.equal(detalleMetrica({ ...j, partidos: j.partidos.map(p => ({ ...p, participacion: { minutos: null } })) }, METRICAS[0]).tasa, null)
  const fuera = construirRendimiento(entrada, { desde: '2026-11-01', jugadoraIds: ['j'] }).jugadoras[0]
  assert.equal(detalleMetrica(fuera, METRICAS[0]).valor, null)
  const sinVinculo = construirRendimiento({ ...entrada, analisis: [{ id: 'a' }] })
  assert.equal(sinVinculo.sinVinculo.length, 1)
  assert.equal(sinVinculo.jugadoras[0].acciones, null)
})
test('Radar: dos jugadoras comparan sin percentiles, muestra completa de diez y valores faltantes', () => {
  const j = construirRendimiento(entrada).jugadoras[0]
  const seleccion = [j, { ...j, jugadorId: 'k' }]
  const metricas = metricasRadar('libre')
  const dos = crearRadar(seleccion, seleccion, metricas, true)
  assert.equal(dos.series.length, 2)
  assert.equal(dos.percentilesDisponibles, false)
  const referencia = Array.from({ length: 10 }, (_, i) => ({ ...j, jugadorId: String(i) }))
  assert.equal(crearRadar(seleccion, referencia, metricas, true).percentilesDisponibles, true)
  const sinMinutos = { ...j, participacion: { minutos: null } }
  const sinElegibilidad = crearRadar([sinMinutos], referencia, metricas, true)
  assert.equal(sinElegibilidad.percentilesDisponibles, true, 'La referencia mantiene diez jugadoras elegibles')
  assert.ok(sinElegibilidad.series[0].valores.every(v => v === null), 'Una evaluada sin participación no recibe percentil')
  assert.ok(crearRadar([sinMinutos], referencia, metricas, false).series[0].valores.some(v => v !== null), 'Conserva los datos reales')
  assert.ok(crearRadar([{ ...j, acciones: null }], referencia, metricas, true).series[0].valores.every(v => v === null))
  assert.equal(crearRadar(seleccion, referencia.map(j => ({ ...j, participacion: { minutos: null } })), metricas, true).percentilesDisponibles, false)
  assert.equal(crearRadar([{ jugadorId: 'ausente', acciones: null }], referencia, metricas).series[0].valores.every(v => v === null), true)
  assert.notDeepEqual(metricasRadar('puesto', 'Arquero'), metricasRadar('puesto', 'Defensor central'))
  let ids = []
  for (let i = 0; i < 8; i++) ids = seleccionarJugadora(ids, String(i))
  assert.equal(ids.length, 6)
  assert.equal(seleccionarJugadora(ids, '0').length, 6)
})

test('Radar móvil: contrato responsive de etiquetas numeradas, leyenda HTML legible y escalas conservadas', () => {
  const css = readFileSync(new URL('../src/components/plantel/comparativas.css', import.meta.url), 'utf8')
  const radar = readFileSync(new URL('../src/components/plantel/RadarComparativo.jsx', import.meta.url), 'utf8')
  const movil = css.slice(css.indexOf('@media(max-width:768px)'), css.indexOf('@media(prefers-reduced-motion'))
  assert.match(movil, /\.comparativas-eje-texto\s*\{\s*display:none/)
  assert.match(movil, /\.comparativas-eje-numero\s*\{\s*display:block/)
  assert.match(movil, /\.comparativas-indicadores\s*\{\s*font-size:16px/)
  assert.match(movil, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css, /\.comparativas-eje-numero\s*\{\s*display:none/)
  assert.match(css, /\.comparativas-indicadores[^}]*overflow-wrap:anywhere/)
  assert.match(radar, /aria-describedby=\{leyendaId\}/)
  assert.match(radar, /fontSize="28" aria-hidden="true"/)
  assert.match(radar, /<ol>\{radar.ejes.map/)
  assert.match(radar, /Escala 0–\{e.maximo\}/)
  assert.doesNotMatch(css, /!important/)
})
