import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { FORMACIONES, asignarOnce } from '../src/utils/rendimiento/formaciones.js'
import { resumirAcciones, resumirParticipacion, construirRendimiento, calcularPor90, filtrarPartidos,
  seleccionarJugadora, percentilInterno, normalizarEscala } from '../src/utils/rendimiento/metricas.js'
import { leerDatosRendimiento } from '../src/utils/rendimiento/lecturas.js'

test('Formaciones: equivalencia exacta contra el algoritmo publicado, posiciones secundarias, empates y vacantes', () => {
  const anterior = execFileSync('git', ['show', 'd687f4b:src/components/ListaJugadores.jsx'], { encoding: 'utf8' })
  const segmento = (a, b) => anterior.slice(anterior.indexOf(a), anterior.indexOf(b))
  const original = new Function(segmento('const FORMACIONES', 'function iniciales') +
    segmento('function obtenerMinutos', 'function obtenerDato') + segmento('function asignarOnce', 'function FotoJugadora') + ';return {asignarOnce,FORMACIONES}')()
  assert.deepEqual(FORMACIONES, original.FORMACIONES)
  const posiciones = ['', 'Arquero', 'Defensor central', 'Lateral izquierdo', 'Lateral derecho', 'Mediocampista central', 'Extremo derecho', 'Extremo izquierdo', 'Delantero centro', 'Volante ofensivo']
  for (let n = 0; n < 25; n++) {
    const jugadoras = Array.from({ length: n }, (_, i) => ({ id: 'j' + i, nombre: 'Ana', apellido: ['Zulu', 'Ana', 'Bea'][i % 3], posicion: posiciones[i % posiciones.length], posicion_secundaria: posiciones[(i + 3) % posiciones.length] }))
    const stats = Object.fromEntries(jugadoras.map((j, i) => [j.id, { minutos: i % 4 * 90 }]))
    for (const formacion of Object.keys(FORMACIONES)) assert.deepEqual(asignarOnce(jugadoras, stats, formacion), original.asignarOnce(jugadoras, stats, formacion))
  }
})

test('Acciones: precisión por tipos separada de resultados, neutros/pendientes y ausencias', () => {
  const r = resumirAcciones([
    { tipo: 'Pase correcto', resultado: null }, { tipo: 'Pase incorrecto', resultado: null },
    { tipo: 'Recuperación', resultado: 'Exitoso' }, { tipo: 'Despeje', resultado: 'Neutro' },
    { tipo: 'Remate', resultado: 'Fuera' }, { tipo: 'Remate', resultado: 'Desconocido' },
  ])
  assert.equal(r.pases.precision, 50); assert.equal(r.efectividad.porcentaje, 50)
  assert.equal(r.resultados.pendientes, 2); assert.equal(r.resultados.neutros, 1); assert.equal(r.resultados.desconocidos, 1)
  assert.equal(resumirAcciones(null), null)
  assert.equal(resumirAcciones([]).total, 0)
  assert.equal(resumirAcciones([]).efectividad.porcentaje, null)
})

const partidos = [{ id: 'p1', categoria_id: 'cat', fecha: '2026-12-31' }, { id: 'p2', categoria_id: 'cat', fecha: '2027-01-01' }, { id: 'p3', fecha: '2027-01-02' }]
const analisis = [{ id: 'a1', partido_calendario_id: 'p1' }, { id: 'a2', partido_calendario_id: 'p1' }, { id: 'a3', partido_calendario_id: 'p2' }, { id: 'huerfano', rival: 'Rival', fecha: '2026-12-31' }]
const eventos = [{ id: 'e1', jugador_id: 'j1', partido_id: 'a1', tipo: 'Pase correcto', periodo: 1 },
  { id: 'e2', jugador_id: 'j1', partido_id: 'a2', tipo: 'Recuperación', resultado: 'Exitoso', periodo: 2 }]
const estadisticas = [{ jugador_id: 'j1', partido_id: 'p1', minutos_jugados: 90, titular: true, goles: 2 },
  { jugador_id: 'j1', partido_id: 'p2', minutos_jugados: 45, titular: false, goles: 0 }]

test('Motor: agrupación por IDs, varios análisis no duplican minutos, cero registrado y cobertura desconocida', () => {
  const r = construirRendimiento({ partidos, analisis, eventos: [...eventos, eventos[0]], estadisticas }, { partidoIds: ['p1', 'p2'], jugadoraIds: ['j1'] })
  const j = r.jugadoras[0]
  assert.equal(j.participacion.minutos, 135); assert.equal(j.participacion.titularidades, 1)
  assert.equal(j.acciones.total, 2); assert.equal(j.por90.valor, 2 * 90 / 135)
  assert.equal(r.partidos[1].estadoAnalisis, 'sin_acciones'); assert.equal(j.partidos[1].acciones.total, 0)
  assert.equal(r.partidos[0].multiplesAnalisis, true)
  assert.equal(j.por90.cobertura, 'desconocida'); assert.equal(r.sinVinculo.length, 1)
  assert.deepEqual(r.duplicados, ['e1'])
  const incompleto = construirRendimiento({ partidos, analisis, eventos, estadisticas }, { jugadoraIds: ['j1'] })
  assert.equal(incompleto.partidos[2].estadoAnalisis, 'sin_analisis')
  assert.equal(incompleto.jugadoras[0].acciones, null); assert.equal(incompleto.jugadoras[0].por90.valor, null)
})

test('Motor: filtros de fecha, partido y tiempo no cruzan denominadores; datos ausentes no equivalen a cero', () => {
  assert.deepEqual(filtrarPartidos(partidos, { desde: '2027-01-01', hasta: '2027-01-01' }).map(p => p.id), ['p2'])
  assert.deepEqual(filtrarPartidos(partidos, { partidoIds: [] }), [])
  assert.throws(() => filtrarPartidos(partidos, { desde: '2026-02-30' }))
  const tiempo = construirRendimiento({ partidos, analisis, eventos, estadisticas }, { partidoIds: ['p1'], periodo: 2, jugadoraIds: ['j1'] })
  assert.equal(tiempo.jugadoras[0].acciones.total, 1); assert.equal(tiempo.jugadoras[0].por90.valor, null)
  assert.equal(resumirParticipacion([], ['p1']).minutos, null)
  assert.equal(resumirParticipacion([{ partido_id: 'p1', minutos_jugados: '', titular: false }], ['p1']).minutos, null)
  assert.equal(resumirParticipacion([estadisticas[0], estadisticas[0]], ['p1']).minutos, null)
  assert.equal(resumirParticipacion([{ partido_id: 'p1', minutos_jugados: 0, titular: false }], ['p1']).minutos, 0)
  assert.equal(calcularPor90([{ partidoId: 'p1', acciones: 0, minutos: 0, estadoAnalisis: 'sin_acciones' }]).valor, null)
  const fallo = construirRendimiento({ partidos, analisis, eventos: null, estadisticas, fuentes: { eventos: { estado: 'denegado' } } }, { jugadoraIds: ['j1'] })
  assert.equal(fallo.estado, 'incompleto'); assert.equal(fallo.jugadoras[0].acciones, null)
  assert.equal(fallo.fuentes.eventos.estado, 'denegado')
  const conflicto = construirRendimiento({ partidos, analisis, eventos: [...eventos, { ...eventos[0], tipo: 'Pase incorrecto' }], estadisticas }, { partidoIds: ['p1'], jugadoraIds: ['j1'] })
  assert.deepEqual(conflicto.eventosConflictivos, ['e1'])
  assert.equal(conflicto.jugadoras[0].acciones, null)
  assert.equal(conflicto.jugadoras[0].por90.valor, null)
})

test('Comparativas preparadas: seis selecciones, comparación con dos, percentiles con diez IDs y escalas', () => {
  let seleccion = []
  for (let i = 0; i < 8; i++) seleccion = seleccionarJugadora(seleccion, 'j' + i)
  assert.equal(seleccion.length, 6); assert.equal(seleccionarJugadora(seleccion, 'j0').length, 6)
  assert.equal(seleccionarJugadora(['j1'], 'j2').length, 2)
  const referencia = Array.from({ length: 10 }, (_, i) => ({ jugadorId: 'j' + i, valor: i }))
  assert.equal(percentilInterno(5, referencia.slice(0, 2)), null)
  assert.equal(percentilInterno(5, Array(10).fill(referencia[0])), null)
  assert.equal(percentilInterno(5, referencia), 55)
  assert.equal(normalizarEscala(3, 1, 5), 50)
  assert.equal(normalizarEscala(null, 1, 5), null)
})

test('Lector aislado: paginación, campos mínimos, RLS denegada y ausencia confirmada sin escrituras', async () => {
  const consultas = []
  let denegar = false
  const cliente = { from(tabla) {
    const filtros = []; let pagina = [0, 499]
    const q = { select(campos) { consultas.push({ tabla, campos, filtros }); return q }, eq(k, v) { filtros.push([k, v]); return q },
      in(k, v) { filtros.push([k, v]); return q }, order() { return q }, range(a, b) { pagina = [a, b]; return q },
      then(ok, mal) {
        const lista = tabla === 'partidos' ? Array.from({ length: 501 }, (_, i) => ({ id: 'p' + i, categoria_id: 'cat' })) : tabla === 'analisis_partidos' ? analisis : tabla === 'analisis_eventos' ? eventos : estadisticas
        const filtrados = lista.filter(r => filtros.every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
        return Promise.resolve({ data: filtrados.slice(pagina[0], pagina[1] + 1), error: denegar && tabla === 'partidos' ? { code: '42501' } : null }).then(ok, mal)
      } }; return q
  } }
  const r = await leerDatosRendimiento(cliente, 'cat')
  assert.equal(r.partidos.length, 501)
  assert.equal(consultas.filter(c => c.tabla === 'partidos').length, 2)
  assert.ok(consultas.every(c => !/\*|observaciones|notas|pizarra|email/.test(c.campos)))
  denegar = true
  const error = await leerDatosRendimiento(cliente, 'cat')
  assert.equal(error.partidos, null); assert.equal(error.fuentes.partidos.estado, 'denegado')
  assert.equal(error.estadisticas, null)
})
