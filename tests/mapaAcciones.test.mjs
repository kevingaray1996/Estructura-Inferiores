import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alUltimoTercio, avisosDireccion, calidad, direccionPase, calor, claseRemate, direccionDe, enCapa, esProgresivo, filtrarAcciones, minutoDe,
  orientar, porTercio, prepararAcciones, resumenCapa,
} from '../src/utils/analisis/mapaAcciones.js'

const marcas = { inicio_1t: 100, fin_1t: 2800, inicio_2t: 3400, fin_partido: 6100 }
const partido = { id: 'p', rival: 'Rival', direccion_primer_tiempo: 'izquierda' }

test('capas: pérdidas suman los pases errados solo con el interruptor', () => {
  assert.ok(enCapa({ tipo: 'Pase incorrecto' }, 'perdidas'))
  assert.ok(!enCapa({ tipo: 'Pase incorrecto' }, 'perdidas', { pasesErrados: false }))
  assert.ok(enCapa({ tipo: 'Intercepción' }, 'recuperaciones'))
  assert.ok(enCapa({ tipo: 'Duelo aéreo' }, 'duelos'))
  assert.ok(!enCapa({ tipo: 'Centro' }, 'duelos'))
  assert.ok(enCapa({ tipo: 'Centro' }, 'todas'))
  assert.ok(enCapa({ tipo: 'Gol' }, 'remates'))
})

test('resultado: atajada de un remate nuestro no es «bien»; neutro aparte', () => {
  assert.equal(claseRemate({ tipo: 'Remate', resultado: 'Atajada' }), 'arco')
  assert.equal(calidad({ tipo: 'Remate', resultado: 'Atajada' }), 'neutro')
  assert.equal(claseRemate({ tipo: 'Remate', resultado: 'Bloqueado' }), 'afuera')
  assert.equal(claseRemate({ tipo: 'Gol' }), 'gol')
  assert.equal(calidad({ tipo: 'Atajada' }), 'bien')
  assert.equal(calidad({ tipo: 'Pérdida' }), 'mal')
  assert.equal(calidad({ tipo: 'Recuperación' }), 'bien')
  assert.equal(calidad({ tipo: 'Duelo ofensivo', resultado: 'Exitoso' }), 'bien')
  assert.equal(calidad({ tipo: 'Duelo ofensivo', resultado: 'Neutro' }), 'neutro')
  assert.equal(calidad({ tipo: 'Duelo ofensivo' }), 'neutro')
})

test('dirección: con marcas y dirección del 1T manda la pestaña Partido; el 2T se espeja', () => {
  // Cargada con dirección «derecha» pero en el 1T atacábamos a la izquierda: manda el partido.
  const e = { segundo: 500, periodo: 1, sistema_coordenadas: 'visual_v1', direccion_captura: 'derecha', periodo_captura: 1 }
  assert.equal(direccionDe(e, partido, marcas), 'izquierda')
  assert.equal(direccionDe({ ...e, segundo: 4000 }, partido, marcas), 'derecha')
  // Sin marcas: la de captura.
  assert.equal(direccionDe(e, partido, null), 'derecha')
  // Vieja sin captura ni marcas: la del partido según el tiempo cargado.
  assert.equal(direccionDe({ segundo: 10, periodo: 2 }, partido, null), 'derecha')
  assert.equal(direccionDe({ segundo: 10, periodo: 1 }, null, null), null)
  assert.deepEqual(orientar(20, 30, 'izquierda'), { x: 80, y: 70 })
  assert.deepEqual(orientar('20', '30', 'derecha'), { x: 20, y: 30 })
  assert.equal(orientar(null, 30, 'derecha'), null)
})

test('acciones preparadas: punto acomodado, zona, tiempo y minuto real', () => {
  const eventos = [
    { id: 'a', partido_id: 'p', tipo: 'Pase correcto', segundo: 160, periodo: 1, coordenada_x: 90, coordenada_y: 10 },
    { id: 'b', partido_id: 'p', tipo: 'Pérdida', segundo: 3500, periodo: 1, coordenada_x: 90, coordenada_y: 10 },
    { id: 'c', partido_id: 'q', tipo: 'Pérdida', segundo: 20, periodo: 1, coordenada_x: 50, coordenada_y: 50 },
    { id: 'd', partido_id: 'q', tipo: 'Pérdida', segundo: 20, periodo: 1, zona: 'Medio centro' },
  ]
  const contexto = {
    partidos: new Map([['p', partido], ['q', { id: 'q', rival: 'Otro' }]]),
    marcas: new Map([['p', marcas]]),
    detallesPases: { a: { destino_x: 70, destino_y: 20 } },
  }
  const [a, b, c, d] = prepararAcciones(eventos, contexto)
  assert.deepEqual(a.punto, { x: 10, y: 90 })
  assert.deepEqual(a.destino, { x: 30, y: 80 })
  assert.equal(a.zona, 'Defensa derecha')
  assert.equal(a.minuto, "1T 2'")
  assert.equal(b.periodo, 2) // por las marcas, aunque se cargó como 1T
  assert.deepEqual(b.punto, { x: 90, y: 10 })
  assert.equal(b.minuto, "2T 2'")
  assert.equal(c.punto, null)
  assert.ok(c.sinDireccion)
  assert.equal(c.minuto, '1T · video 0:20')
  assert.equal(d.tercio, 'Medio')
  assert.ok(!d.sinDireccion)
  const avisos = avisosDireccion([a, b, c, d], contexto)
  assert.equal(avisos.length, 2)
  assert.match(avisos[0], /Otro/)
  assert.match(avisos[1], /1 acción no se puede acomodar/)
  assert.equal(filtrarAcciones([a, b, c, d], { tiempo: '2' }).length, 1)
  assert.equal(filtrarAcciones([a, b, c, d], { capa: 'pases', resultado: 'mal' }).length, 0)
  assert.equal(minutoDe({ segundo: 3000 }, marcas, 1), 'Entretiempo')
})

test('pase progresivo (Wyscout): 30 m en campo propio, 15 m cruzando, 10 m en campo rival', () => {
  // Por el centro: 1 unidad de x = 1,05 m.
  assert.ok(esProgresivo({ x: 5, y: 50 }, { x: 34, y: 50 })) // 30,45 m, todo en campo propio
  assert.ok(!esProgresivo({ x: 5, y: 50 }, { x: 33, y: 50 })) // 29,4 m
  assert.ok(esProgresivo({ x: 40, y: 50 }, { x: 55, y: 50 })) // 15,75 m cruzando
  assert.ok(!esProgresivo({ x: 40, y: 50 }, { x: 53, y: 50 })) // 13,65 m
  assert.ok(esProgresivo({ x: 60, y: 50 }, { x: 70, y: 50 })) // 10,5 m en campo rival
  assert.ok(!esProgresivo({ x: 70, y: 50 }, { x: 60, y: 50 })) // para atrás
  assert.ok(!esProgresivo({ x: 60, y: 50 }, null))
})

test('dirección del pase y al último tercio', () => {
  assert.equal(direccionPase({ x: 50, y: 50 }, { x: 60, y: 52 }), 'adelante')
  assert.equal(direccionPase({ x: 50, y: 50 }, { x: 40, y: 50 }), 'atras')
  assert.equal(direccionPase({ x: 50, y: 20 }, { x: 52, y: 80 }), 'lateral')
  assert.equal(direccionPase(null, { x: 1, y: 1 }), null)
  assert.ok(alUltimoTercio({ x: 60, y: 50 }, { x: 70, y: 50 }))
  assert.ok(!alUltimoTercio({ x: 70, y: 50 }, { x: 80, y: 50 }))
})

test('calor, tercios y resumen', () => {
  const mapa = calor([{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 90, y: 90 }])
  assert.ok(mapa.celdas.length > 0)
  assert.equal(Math.max(...mapa.celdas.map((c) => c.v)), 1)
  const acciones = prepararAcciones([
    { id: 1, partido_id: 'p', tipo: 'Pase correcto', jugador_id: 'ana', segundo: 200, coordenada_x: 80, coordenada_y: 50 },
    { id: 2, partido_id: 'p', tipo: 'Pase incorrecto', jugador_id: 'ana', segundo: 300, coordenada_x: 80, coordenada_y: 50 },
    { id: 3, partido_id: 'p', tipo: 'Pase correcto', jugador_id: 'bea', segundo: 400, coordenada_x: 30, coordenada_y: 50 },
  ], { partidos: new Map([['p', partido]]), marcas: new Map([['p', marcas]]),
    detallesPases: { 1: { destino_x: 10, destino_y: 50 } } })
  const tercios = porTercio(acciones)
  assert.deepEqual(tercios.map((t) => t.total), [2, 0, 1])
  assert.equal(tercios[0].pctBien, 50)
  const r = resumenCapa(acciones, 'pases', (id) => id.toUpperCase())
  assert.equal(r.titulo, 'Pases')
  assert.equal(r.total, 3)
  assert.equal(r.grande, '67%')
  assert.equal(r.bajada, 'Correctos · 2 de 3')
  const fila = (nombre) => r.filas.find((f) => f.etiqueta === nombre).valor
  assert.equal(fila('Progresivos'), 1) // de x=20 a x=90 ya acomodado: cruza de campo
  assert.equal(fila('Al último tercio'), 1)
  assert.equal(fila('Hacia atrás'), 0)
  assert.equal(fila('Con destino cargado'), '1 de 3')
  assert.deepEqual(r.top[0], { id: 'ana', nombre: 'ANA', total: 2 })
  const remates = prepararAcciones([
    { id: 4, tipo: 'Remate', resultado: 'Atajada' }, { id: 5, tipo: 'Gol' }, { id: 6, tipo: 'Remate', resultado: 'Fuera' },
  ], {})
  const rr = resumenCapa(remates, 'remates')
  assert.equal(rr.grande, '3')
  assert.equal(rr.bajada, 'Remates · 2 al arco')
  assert.equal(rr.filas[0].valor, 1)
  assert.equal(resumenCapa([], 'duelos').bajada, 'Sin resultado cargado')
  assert.equal(filtrarAcciones(remates, { capa: 'remates', resultado: 'arco' }).length, 2)
})
