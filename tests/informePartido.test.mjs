import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararAcciones } from '../src/utils/analisis/mapaAcciones.js'
import { CATALOGO_POR_DEFECTO as catalogo } from '../src/utils/analisis/catalogoAcciones.js'
import {
  accionesPorTramo, avisosInforme, contraPromedio, filasExcel, formacionAcostada, golesInforme, hitosTiempo, informeParaGuardar,
  jugadorasInforme, lecturaCuando, lecturaDonde, minutoCorrido, normalizarInforme, numerosBasicos, numerosPartido,
  posicionAntesSugerida, promedioTemporada, proximoRival, resultadoInforme, textoMinuto, tramoDe, ultimosCinco,
} from '../src/utils/analisis/informePartido.js'

// Video: 1T arranca en 100 s y termina en 2900 s (46'40"); 2T arranca en 3400 s.
const marcas = { inicio_1t: 100, fin_1t: 2900, inicio_2t: 3400, fin_partido: 6300 }
const partido = { id: 'p', rival: 'Rival', direccion_primer_tiempo: 'izquierda' }
const preparar = (eventos) => prepararAcciones(eventos.map((e, i) => ({ id: `e${i}`, partido_id: 'p', ...e })), {
  partidos: new Map([['p', partido]]), marcas: new Map([['p', marcas]]),
})
const enMinuto = (periodo, minuto) => (periodo === 1 ? marcas.inicio_1t : marcas.inicio_2t) + (minuto - 1) * 60 + 30

test('minuto corrido: 1T, descuento y 2T', () => {
  assert.equal(textoMinuto(minutoCorrido(enMinuto(1, 23), marcas)), "23'")
  assert.equal(textoMinuto(minutoCorrido(enMinuto(1, 47), marcas)), "45+2'")
  assert.equal(textoMinuto(minutoCorrido(enMinuto(2, 22), marcas)), "67'")
  assert.equal(minutoCorrido(3000, marcas), null) // entretiempo
  assert.equal(minutoCorrido(500, {}), null)
})

test('tramos de 15: el descuento queda en el último tramo de cada tiempo', () => {
  assert.equal(tramoDe(minutoCorrido(enMinuto(1, 15), marcas)), 0)
  assert.equal(tramoDe(minutoCorrido(enMinuto(1, 16), marcas)), 1)
  assert.equal(tramoDe(minutoCorrido(enMinuto(1, 47), marcas)), 2)
  assert.equal(tramoDe(minutoCorrido(enMinuto(2, 1), marcas)), 3)
  assert.equal(tramoDe(minutoCorrido(enMinuto(2, 22), marcas)), 4)
})

test('acciones por tramo: bien y mal; las neutras no cuentan; sin marcas no hay barras', () => {
  const acciones = preparar([
    { tipo: 'Pase correcto', segundo: enMinuto(1, 3) },
    { tipo: 'Pérdida', segundo: enMinuto(1, 4) },
    { tipo: 'Duelo ofensivo', resultado: 'Neutro', segundo: enMinuto(1, 5) },
    { tipo: 'Pase incorrecto', segundo: enMinuto(2, 20) },
  ])
  const tramos = accionesPorTramo(acciones, marcas)
  assert.deepEqual(tramos.map((t) => [t.bien, t.mal]), [[1, 1], [0, 0], [0, 0], [0, 0], [0, 1], [0, 0]])
  assert.equal(accionesPorTramo(acciones, { inicio_1t: 100 }), null)
})

test('goles y cambios: minuto, autora y cambios del mismo minuto juntos', () => {
  const eventos = [
    { tipo: 'gol', equipo: 'rival', segundo: enMinuto(2, 22), observaciones: 'Pérez' },
    { tipo: 'gol', equipo: 'propio', jugador_id: 'j1', segundo: enMinuto(1, 23) },
    { tipo: 'cambio', segundo: enMinuto(2, 13) }, { tipo: 'cambio', segundo: enMinuto(2, 13) + 10 },
  ]
  const goles = golesInforme(eventos, marcas, (id) => (id === 'j1' ? 'Díaz' : ''))
  assert.deepEqual(goles.map((g) => [textoMinuto(g.minuto), g.texto, g.propio]), [["23'", 'Díaz', true], ["67'", 'Rival · Pérez', false]])
  const hitos = hitosTiempo(eventos, marcas)
  assert.deepEqual(hitos.map((h) => h.texto), ["GOL 23'", "2 CAMBIOS 58'", "GOL RIVAL 67'"])
})

test('números del partido y promedio de la temporada', () => {
  const eventos = [
    { tipo: 'Pase correcto' }, { tipo: 'Pase correcto' }, { tipo: 'Pase correcto' }, { tipo: 'Pase incorrecto' },
    { tipo: 'Pérdida' }, { tipo: 'Recuperación' }, { tipo: 'Intercepción' },
    { tipo: 'Remate', resultado: 'Atajada' }, { tipo: 'Remate', resultado: 'Fuera' }, { tipo: 'Gol' },
  ]
  const n = numerosBasicos(eventos)
  assert.deepEqual([n.pctPases, n.perdidas, n.recuperaciones, n.alArco, n.remates, n.goles], [75, 2, 2, 2, 3, 1])
  const partidos = [{ id: 'a', fecha: '2026-04-19' }, { id: 'b', fecha: '2026-04-12' }, { id: 'c', fecha: '2026-03-01' }, { id: 'v', fecha: '2025-10-01' }]
  const todos = [
    { partido_id: 'b', tipo: 'Pérdida' }, { partido_id: 'b', tipo: 'Pérdida' },
    { partido_id: 'c', tipo: 'Pérdida' }, { partido_id: 'c', tipo: 'Pérdida' }, { partido_id: 'c', tipo: 'Pérdida' }, { partido_id: 'c', tipo: 'Pérdida' },
    { partido_id: 'v', tipo: 'Pérdida' },
  ]
  const promedio = promedioTemporada(todos, partidos, partidos[0])
  assert.equal(promedio.partidos, 2)
  assert.equal(promedio.perdidas, 3)
  assert.deepEqual(contraPromedio(5, promedio.perdidas), { signo: 'mas', diferencia: 2 })
  assert.deepEqual(contraPromedio(3, 3), { signo: 'igual', diferencia: 0 })
  assert.equal(contraPromedio(3, null), null)
  assert.equal(promedioTemporada([], partidos, partidos[0]), null)
})

test('números con ubicación: siempre atacando a la derecha (1T a la izquierda se da vuelta)', () => {
  // En el 1T atacábamos a la izquierda: x=80 visual es nuestro campo (20 atacando a la derecha).
  const acciones = preparar([
    { tipo: 'Pérdida', coordenada_x: 80, coordenada_y: 50, segundo: enMinuto(1, 5) },
    { tipo: 'Recuperación', coordenada_x: 20, coordenada_y: 50, segundo: enMinuto(1, 6) },
    { tipo: 'Pérdida', coordenada_x: 80, coordenada_y: 50, segundo: enMinuto(2, 6) },
  ])
  const n = numerosPartido(acciones)
  assert.equal(n.perdidasPropio, 1)
  assert.equal(n.recuperacionesRival, 1)
})

test('resultado: el del calendario y, si falta, los goles cargados', () => {
  assert.deepEqual(resultadoInforme({ goles_local: 2, goles_visitante: 1, local_visitante: 'visitante' }, []), { propios: 1, rivales: 2, etiqueta: 'Derrota' })
  assert.deepEqual(resultadoInforme({}, [{ tipo: 'gol', equipo: 'propio' }]), { propios: 1, rivales: 0, etiqueta: 'Victoria' })
  assert.equal(resultadoInforme(null, []), null)
})

test('últimos 5 (con el partido) y próximo rival', () => {
  const r = (fecha, gl, gv, extra = {}) => ({ id: fecha, fecha, goles_local: gl, goles_visitante: gv, local_visitante: 'local', rival: `R${fecha}`, ...extra })
  const cal = [r('2026-01-01', 1, 0), r('2026-02-01', 0, 0), r('2026-03-01', 0, 1), r('2026-03-08', 2, 2), r('2026-03-15', 3, 0),
    r('2026-04-19', 1, 2), r('2026-04-26', null, null)]
  assert.deepEqual(ultimosCinco(cal, cal[5]), ['E', 'D', 'E', 'V', 'D'])
  assert.equal(proximoRival(cal, cal[5]), 'R2026-04-26')
  assert.equal(proximoRival(cal, cal[6]), null)
})

test('jugadoras: mínimo 20 minutos, titulares primero y destacados por columna', () => {
  const ev = (jugador_id, tipo, resultado) => ({ jugador_id, tipo, resultado })
  const acciones = preparar([
    ev('a', 'Pase correcto'), ev('a', 'Pase incorrecto'), ev('a', 'Duelo ofensivo', 'Exitoso'), ev('a', 'Duelo defensivo', 'Neutro'),
    ev('b', 'Pérdida'), ev('b', 'Pérdida'), ev('b', 'Recuperación'),
    ev('c', 'Pase correcto'),
  ])
  const citaciones = [{ jugador_id: 'c', dorsal: 19, titular: false }, { jugador_id: 'b', dorsal: 9, titular: true },
    { jugador_id: 'a', dorsal: 4, titular: true }, { jugador_id: 'd', dorsal: 2, titular: false }]
  const filas = jugadorasInforme(acciones, { citaciones, minutos: { a: 90, b: 58, c: 20, d: 12 }, nombreDe: (id) => id.toUpperCase() })
  assert.deepEqual(filas.map((f) => f.id), ['a', 'b', 'c'])
  const a = filas[0]
  assert.deepEqual([a.pctPases, a.pctDuelos, a.perdidas], [50, 100, 1]) // el duelo neutro no cuenta
  assert.equal(filas[1].pctPases, null)
  assert.ok(filas[1].perdidasDestacado)
  assert.ok(filas[1].recuperacionesDestacado)
  assert.equal(filas[2].recuperacionesDestacado, false)
})

test('formación: de la cancha parada de Convocados a la cancha acostada atacando a la derecha', () => {
  const [arquera, nueve] = formacionAcostada([
    { jugador_id: 'a', dorsal: 1, coordenadas: { x: 50, y: 92 } },
    { jugador_id: 'b', dorsal: 9, coordenadas: { x: 30, y: 15 } },
    { jugador_id: 'c', dorsal: 5, coordenadas: null },
  ])
  assert.deepEqual(arquera, { id: 'a', dorsal: 1, x: 8, y: 50 })
  assert.deepEqual(nueve, { id: 'b', dorsal: 9, x: 85, y: 30 })
})

test('datos del informe: se limpian, y la posición «antes» sale del informe anterior', () => {
  const n = normalizarInforme({ arbitra: '  M. Sánchez ', posicion_antes: '8', posicion_despues: 0, claves: [{ titulo: 'Uno' }] })
  assert.equal(n.arbitra, 'M. Sánchez')
  assert.equal(n.posicion_antes, 8)
  assert.equal(n.posicion_despues, null)
  assert.equal(n.claves.length, 3)
  assert.equal(informeParaGuardar(n).claves.length, 1)
  assert.deepEqual(normalizarInforme(null).claves[2], { titulo: '', texto: '' })
  const partidos = [
    { id: 'x', fecha: '2026-04-19' },
    { id: 'y', fecha: '2026-04-12', informe: { posicion_despues: 8 } },
    { id: 'z', fecha: '2026-04-05', informe: { posicion_despues: 6 } },
    { id: 'w', fecha: '2026-04-26', informe: { posicion_despues: 3 } },
  ]
  assert.equal(posicionAntesSugerida(partidos, partidos[0]), 8)
  assert.equal(posicionAntesSugerida(partidos, partidos[2]), null)
})

test('lecturas automáticas', () => {
  const acciones = preparar([
    { tipo: 'Pérdida', coordenada_x: 70, coordenada_y: 70, segundo: enMinuto(1, 5) }, // 1T al revés: (30, 30)
    { tipo: 'Pérdida', coordenada_x: 30, coordenada_y: 10, segundo: enMinuto(2, 5) },
    { tipo: 'Pérdida', coordenada_x: 30, coordenada_y: 15, segundo: enMinuto(2, 6) },
    { tipo: 'Recuperación', coordenada_x: 20, coordenada_y: 50, segundo: enMinuto(1, 7) }, // (80, 50): campo rival
    { tipo: 'Recuperación', coordenada_x: 20, coordenada_y: 50, segundo: enMinuto(2, 7) }, // campo propio
  ])
  assert.equal(lecturaDonde(acciones), 'Lectura: en el 2T las pérdidas subieron de 1 a 2 y siguieron por el costado izquierdo; las recuperaciones pasaron a campo propio.')
  const tramos = [{ nombre: "0-15'", bien: 5, mal: 1 }, { nombre: "15-30'", bien: 5, mal: 1 }, { nombre: "30-45+'", bien: 5, mal: 1 },
    { nombre: "45-60'", bien: 5, mal: 1 }, { nombre: "60-75'", bien: 3, mal: 6 }, { nombre: "75-90+'", bien: 5, mal: 1 }]
  const hitos = [{ tipo: 'gol_rival', minuto: { valor: 67, extra: 0, periodo: 2 } }]
  assert.equal(lecturaCuando(tramos, hitos), "Entre el 60' y el 75' tuvimos más acciones malas que buenas (6 contra 3): coincide con un gol rival.")
  assert.equal(lecturaCuando(null, []), '')
})

test('avisos antes de generar y filas del Excel', () => {
  const avisos = avisosInforme({ eventos: [{ id: 'a', tipo: 'Pérdida', jugador_id: null }], catalogo, marcas: { inicio_1t: 1 }, partido: {} })
  assert.equal(avisos.length, 3)
  assert.match(avisos[0], /Faltan marcas/)
  assert.match(avisos[2], /1 acción está sin detallar/)
  assert.deepEqual(avisosInforme({ eventos: [], catalogo, marcas, partido }), [])
  const [fila] = filasExcel(preparar([{ tipo: 'Pérdida', coordenada_x: 80, coordenada_y: 50, segundo: enMinuto(1, 5) }]), { nombreDe: () => 'Vera' })
  assert.equal(fila.Minuto, "1T 5'")
  assert.equal(fila['X (ataque →)'], 20)
})
