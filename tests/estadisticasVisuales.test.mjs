// Etapa 3 de Análisis: posesión (automática + a mano, % sobre tiempo de juego, bloques, modo posesión), mapa que
// siempre ataca hacia el mismo lado (inversión en el 2T), minutos con cambios y expulsiones, y pantalla del partido.
// Lógica pura, sin base ni pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE, crearCatalogo } from '../src/utils/analisis/catalogoAcciones.js'
import {
  ajustarTramo, dominioPorBloques, estadoEn, insertarTramo, ladoDeMomento, lineaPosesion, resumenPosesion, terminarPosesion, textoPosesion, tocarPosesion,
} from '../src/utils/analisis/posesion.js'
import { direccionDe, filtrarAcciones, orientar, prepararAcciones } from '../src/utils/analisis/mapaAcciones.js'
import { expulsionesDe, filaMinutos, minutosDetallados } from '../src/utils/analisis/eventosPartido.js'
import { comparacion, destacadas, lineaResumen, resultadoPartido, tiposComparables } from '../src/utils/analisis/resumenPartido.js'
import { clipsDeAnalisis } from '../src/utils/analisis/tableroClips.js'
import { CLUB, equiposParaElegir } from '../src/utils/analisis/equipos.js'
import { TECLAS_POSESION_POR_DEFECTO, leerTeclasPosesion, validarTeclaPosesion } from '../src/utils/analisis/posesion.js'
import { ladoSinConfirmar, partidosSinConfirmar } from '../src/utils/analisis/mapaAcciones.js'
import { ATAJOS_POR_DEFECTO, TECLAS_MARCADOR } from '../src/utils/analisis/atajos.js'
import { ATAJOS_COLECTIVA_POR_DEFECTO } from '../src/utils/analisis/colectiva.js'

const col = (codigo, grupo, espejo = null) => ({
  codigo, etiqueta: codigo, etiqueta_boton: codigo, color: 'acento', ubicacion: 'opcional', resultados: [],
  grupo, orden: 100, botonera: 'colectiva', duracion_defecto: 10, espejo,
})
const catalogo = crearCatalogo([
  ...CATALOGO_BASE,
  col('Salida', 'con_pelota'),
  col('Ataque posicional', 'con_pelota', 'Defensa organizada'),
  col('Defensa organizada', 'sin_pelota', 'Ataque posicional'),
  col('Transición ofensiva', 'con_pelota', 'Transición defensiva'),
  col('Transición defensiva', 'sin_pelota', 'Transición ofensiva'),
  col('Córner a favor', 'pelota_parada', 'Córner en contra'),
  col('Córner en contra', 'pelota_parada', 'Córner a favor'),
  col('Error defensivo', 'charla'),
  col('Pressing raro', 'sin_pelota'),
])
const mom = (id, tipo, segundo, segundo_fin) => ({ id, partido_id: 'A1', tipo, segundo, segundo_fin, jugador_id: null })
// Partido de 2 tiempos de 1000 s cada uno (con 300 s de entretiempo en el medio del video).
const marcas = { inicio_1t: 0, fin_1t: 1000, inicio_2t: 1300, fin_partido: 2300 }

// ---------- Posesión ----------

test('posesión: lado de cada momento; Charla no cuenta; un botón nuevo usa su grupo', () => {
  assert.equal(ladoDeMomento('Ataque posicional', catalogo), 'analizado')
  assert.equal(ladoDeMomento('Córner a favor', catalogo), 'analizado')
  assert.equal(ladoDeMomento('Córner en contra', catalogo), 'otro')
  assert.equal(ladoDeMomento('Transición defensiva', catalogo), 'otro')
  assert.equal(ladoDeMomento('Error defensivo', catalogo), null)
  assert.equal(ladoDeMomento('Pressing raro', catalogo), 'otro')
  assert.equal(ladoDeMomento('Pérdida', catalogo), null)
})

test('posesión automática + a mano: lo manual manda, lo automático llena, el resto queda sin datos', () => {
  const momentos = [
    mom('m1', 'Ataque posicional', 100, 300),
    mom('m2', 'Transición defensiva', 250, 400), // se superpone: manda el que empezó después (desde 250)
    mom('m3', 'Error defensivo', 120, 130), // Charla: no cuenta
  ]
  const manuales = [{ id: 't1', inicio: 350, fin: 500, estado: 'detenida' }, { id: 't2', inicio: 500, fin: 600, estado: 'analizado' }]
  const linea = lineaPosesion({ momentos, manuales, catalogo, marcas })
  const delPrimer = linea.filter((s) => s.periodo === 1).map((s) => [s.inicio, s.fin, s.estado, s.origen])
  assert.deepEqual(delPrimer, [
    [0, 100, 'sin_datos', null],
    [100, 250, 'analizado', 'auto'],
    [250, 350, 'otro', 'auto'],
    [350, 500, 'detenida', 'manual'],
    [500, 600, 'analizado', 'manual'],
    [600, 1000, 'sin_datos', null],
  ])
  // El 2T entero sin datos; el entretiempo no aparece.
  assert.deepEqual(linea.filter((s) => s.periodo === 2).map((s) => [s.inicio, s.fin, s.estado]), [[1300, 2300, 'sin_datos']])
  assert.equal(estadoEn(linea, 260), 'otro')
  assert.equal(estadoEn(linea, 1100), 'sin_datos')
})

test('posesión: % solo sobre tiempo de juego (sin pelota detenida) y cobertura sobre todo el partido', () => {
  const linea = lineaPosesion({
    momentos: [mom('m1', 'Ataque posicional', 0, 600), mom('m2', 'Defensa organizada', 1300, 1700)],
    manuales: [{ id: 't1', inicio: 600, fin: 800, estado: 'detenida' }],
    catalogo, marcas,
  })
  const r = resumenPosesion(linea)
  // Juego: 600 del analizado + 400 del otro. Detenida 200. Sin datos: 200 (1T) + 600 (2T) = 800 de 2000.
  assert.deepEqual([r.analizado, r.otro, r.detenida, r.sin_datos, r.total], [600, 400, 200, 800, 2000])
  assert.equal(r.porcentaje, 60)
  assert.equal(r.porcentajeOtro, 40)
  assert.equal(r.cobertura, 60)
  assert.equal(r.parcial, false)
  assert.equal(textoPosesion(r), 'Posesión 60% · calculada sobre el 60% del partido')
  assert.equal(resumenPosesion(lineaPosesion({ momentos: [mom('m', 'Salida', 0, 100)], catalogo, marcas })).parcial, true)
  assert.equal(resumenPosesion([]).porcentaje, null)
})

test('posesión: sin marcas usa solo lo que tiene datos; dominio por bloques de 5 minutos por tiempo', () => {
  const sinMarcas = lineaPosesion({ momentos: [mom('m1', 'Salida', 50, 80), mom('m2', 'Transición defensiva', 100, 130)], catalogo })
  assert.deepEqual(sinMarcas.map((s) => [s.inicio, s.fin, s.estado]), [[50, 80, 'analizado'], [80, 100, 'sin_datos'], [100, 130, 'otro']])
  const linea = lineaPosesion({ momentos: [mom('m1', 'Ataque posicional', 0, 450), mom('m2', 'Defensa organizada', 1300, 1400)], catalogo, marcas })
  const bloques = dominioPorBloques(linea, marcas)
  assert.deepEqual(bloques.map((p) => p.periodo), [1, 2])
  assert.equal(bloques[0].bloques.length, 4) // 1000 s = 300 + 300 + 300 + 100
  assert.deepEqual([bloques[0].bloques[0].analizado, bloques[0].bloques[1].analizado, bloques[0].bloques[1].sin_datos], [300, 150, 150])
  assert.deepEqual([bloques[1].bloques[0].minuto, bloques[1].bloques[0].otro], [0, 100])
  assert.equal(bloques[0].bloques[2].minuto, 10)
})

test('tramos a mano: el nuevo recorta, parte o borra los que pisa; ajustar uno automático lo deja a mano', () => {
  const manuales = [{ id: 'a', inicio: 0, fin: 100, estado: 'analizado' }, { id: 'b', inicio: 100, fin: 400, estado: 'otro' }, { id: 'c', inicio: 450, fin: 470, estado: 'detenida' }]
  const ops = insertarTramo(manuales, { inicio: 50, fin: 460, estado: 'detenida' })
  assert.deepEqual(ops.borrar, ['b'])
  assert.deepEqual(ops.actualizar, [{ id: 'a', inicio: 0, fin: 50 }, { id: 'c', inicio: 460, fin: 470 }])
  assert.deepEqual(ops.crear, [{ inicio: 50, fin: 460, estado: 'detenida' }])
  const parte = insertarTramo(manuales, { inicio: 200, fin: 300, estado: 'analizado' })
  assert.deepEqual(parte.actualizar, [{ id: 'b', inicio: 100, fin: 200 }])
  assert.deepEqual(parte.crear, [{ inicio: 300, fin: 400, estado: 'otro' }, { inicio: 200, fin: 300, estado: 'analizado' }])
  // Mover un tramo a mano: se actualiza él mismo y se recortan los vecinos.
  const mover = ajustarTramo(manuales, { id: 'a', origen: 'manual', estado: 'analizado' }, { segundo: 0, segundo_fin: 150 })
  assert.deepEqual(mover.actualizar, [{ id: 'b', inicio: 150, fin: 400 }, { id: 'a', inicio: 0, fin: 150, estado: 'analizado' }])
  // Ajustar uno automático: queda a mano con esos límites.
  assert.deepEqual(ajustarTramo([], { origen: 'auto', estado: 'otro' }, { segundo: 10, segundo_fin: 20 }).crear, [{ inicio: 10, fin: 20, estado: 'otro' }])
  assert.deepEqual(ajustarTramo([], { origen: null, estado: 'sin_datos' }, { segundo: 10, segundo_fin: 20 }).crear, [])
})

test('modo posesión: la tecla de cambio da vuelta el equipo, detenida para la pelota y se sigue con el otro', () => {
  let g = null
  const guardados = []
  const tocar = (orden, s, actual = 'sin_datos') => { const r = tocarPosesion(g, orden, s, actual); g = r.grabacion; if (r.guardar) guardados.push(r.guardar) }
  tocar('cambio', 10, 'analizado') // lo que se veía era del analizado: cambia al otro
  assert.equal(g.estado, 'otro')
  tocar('cambio', 25)
  tocar('detenida', 40)
  tocar('detenida', 45) // ya estaba detenida: no hace nada
  tocar('cambio', 60) // sigue el que no tenía la pelota antes de la detención (antes la tenía el analizado)
  assert.equal(g.estado, 'otro')
  tocar('cambio', 61) // otro toque la da vuelta
  assert.deepEqual(guardados, [
    { inicio: 10, fin: 25, estado: 'otro' }, { inicio: 25, fin: 40, estado: 'analizado' }, { inicio: 40, fin: 60, estado: 'detenida' }, { inicio: 60, fin: 61, estado: 'otro' },
  ])
  assert.deepEqual(terminarPosesion(g, 90), { inicio: 61, fin: 90, estado: 'analizado' })
  assert.equal(terminarPosesion(g, 50), null, 'Si el video volvió atrás no se guarda nada')
})

// ---------- Mapa: siempre atacando hacia la derecha ----------

test('mapa: el 2T se da vuelta solo según el lado del 1T; sin marcas usa el tiempo cargado en la acción', () => {
  const partido = { id: 'A1', direccion_primer_tiempo: 'izquierda' }
  const ev = (segundo, x, y, periodo = 1) => ({ id: `e${segundo}`, partido_id: 'A1', tipo: 'Pérdida', segundo, periodo, coordenada_x: x, coordenada_y: y })
  // 1T atacando a la izquierda: se gira. 2T (después del inicio del 2T) ataca a la derecha: queda igual.
  assert.equal(direccionDe(ev(100, 20, 30), partido, marcas), 'izquierda')
  assert.equal(direccionDe(ev(1400, 20, 30), partido, marcas), 'derecha')
  const [a, b] = prepararAcciones([ev(100, 20, 30), ev(1400, 20, 30)], { partidos: new Map([['A1', partido]]), marcas: new Map([['A1', marcas]]) })
  assert.deepEqual(a.punto, { x: 80, y: 70 })
  assert.deepEqual(b.punto, { x: 20, y: 30 })
  assert.equal(a.tercio, 'Ataque')
  assert.equal(b.tercio, 'Defensa')
  // Sin marcas: manda el periodo de la acción.
  assert.equal(direccionDe(ev(5000, 20, 30, 2), partido, null), 'derecha')
  assert.deepEqual(orientar(10, 10, 'izquierda'), { x: 90, y: 90 })
  // Filtro por tipo de acción.
  assert.equal(filtrarAcciones([a, b], { tipo: 'Remate' }).length, 0)
  assert.equal(filtrarAcciones([a, b], { tipo: 'Pérdida', tiempo: '2' }).length, 1)
})

// ---------- Minutos ----------

const cambio = (segundo, sale, entra) => ({ tipo: 'cambio', segundo, jugadora_sale: sale, jugadora_entra: entra })
const tarjeta = (segundo, jugador_id, color) => ({ tipo: 'tarjeta', segundo, equipo: 'propio', jugador_id, tarjeta: color })
// 1T: 0 a 2820 (47 min, con 2 de agregado). 2T: 3500 a 6380 (48 min).
const marcasReales = { inicio_1t: 0, fin_1t: 2820, inicio_2t: 3500, fin_partido: 6380 }

test('minutos: titulares hasta que salen, suplentes desde que entran, con el agregado real y redondeado', () => {
  const r = minutosDetallados({
    convocadas: ['a', 'b', 'c', 'd', 'e'], titulares: ['a', 'b', 'c'], marcas: marcasReales,
    cambios: [cambio(3500 + 1800, 'b', 'd')], // a los 30' del 2T
    tarjetas: [tarjeta(1200, 'c', 'amarilla'), tarjeta(4100, 'c', 'amarilla')], // segunda amarilla a los 10' del 2T
  })
  assert.deepEqual(r.minutos, { a: 95, b: 77, c: 57, d: 18, e: 0 })
  assert.deepEqual(r.avisos, [])
  assert.deepEqual(expulsionesDe([tarjeta(10, 'x', 'roja'), tarjeta(20, null, 'roja')]), { expulsiones: [{ segundo: 10, jugadora: 'x' }], sinJugadora: 1 })
})

test('minutos: avisa qué falta en vez de inventar', () => {
  const sinMarca = minutosDetallados({ convocadas: ['a'], titulares: ['a'], marcas: { ...marcasReales, fin_partido: null } })
  assert.equal(sinMarca.minutos, null)
  assert.match(sinMarca.avisos[0].texto, /Faltan marcas de tiempo: Fin del partido/)
  assert.match(minutosDetallados({ convocadas: ['a'], titulares: [], marcas: marcasReales }).avisos[0].texto, /No hay titulares/)
  // Acciones de una suplente antes de su cambio: falta marcar un cambio. Y una roja sin jugadora.
  const r = minutosDetallados({
    convocadas: ['a', 'd'], titulares: ['a'], marcas: marcasReales, tarjetas: [tarjeta(100, null, 'roja')],
    acciones: [{ jugador_id: 'd', segundo: 600 }, { jugador_id: 'd', segundo: 700 }, { jugador_id: 'a', segundo: 3000 }],
  })
  assert.ok(r.minutos)
  assert.ok(r.avisos.some((a) => a.tipo === 'roja'))
  const fuera = r.avisos.find((a) => a.tipo === 'fuera')
  assert.equal(fuera.jugadoraId, 'd')
  assert.match(fuera.texto, /2 acciones mientras figura afuera/)
  // El entretiempo (3000) no cuenta como acción fuera de cancha.
  assert.equal(r.avisos.filter((a) => a.tipo === 'fuera').length, 1)
  assert.ok(minutosDetallados({ convocadas: ['a', 'b'], titulares: ['a'], marcas: marcasReales, cambios: [cambio(500, 'b', 'a')] }).avisos.some((a) => a.tipo === 'cambio'))
})

test('minutos: fila con sugeridos, cargados y diferencia; qué cambiaría al confirmar', () => {
  assert.deepEqual(filaMinutos('a', { a: 77 }, { a: 80 }), { jugadoraId: 'a', sugerido: 77, cargado: 80, diferencia: -3, cambia: true })
  assert.equal(filaMinutos('a', { a: 80 }, { a: '80' }).cambia, false)
  assert.equal(filaMinutos('e', { e: 0 }, {}).cambia, false, 'Sin fila y 0 minutos: no se agrega')
  assert.equal(filaMinutos('d', { d: 18 }, {}).cambia, true)
  assert.equal(filaMinutos('x', null, { x: 10 }).cambia, false)
})

// ---------- Pantalla del partido ----------

test('pantalla del partido: compara solo lo que existe para los dos equipos (con espejo), resultado y destacadas', () => {
  assert.deepEqual(tiposComparables(catalogo).sort(), ['Ataque posicional', 'Córner a favor', 'Córner en contra', 'Defensa organizada', 'Transición defensiva', 'Transición ofensiva'])
  const analisis = [{ id: 'A1', tipo_partido: 'propio', equipo_analizado: 'propio', rival: 'Camioneros', partido_calendario: { equipo_id: 'eq', rival: 'Camioneros', local_visitante: 'visitante', goles_local: 2, goles_visitante: 1 } }]
  const acciones = [
    mom('m1', 'Transición ofensiva', 10, 20), mom('m2', 'Transición defensiva', 30, 40), mom('m3', 'Transición defensiva', 50, 60), mom('m4', 'Error defensivo', 70, 75),
    { id: 'i1', partido_id: 'A1', tipo: 'Remate', segundo: 15, jugador_id: 'J1', resultado: 'Gol' },
    { id: 'i2', partido_id: 'A1', tipo: 'Recuperación', segundo: 35, jugador_id: 'J2', resultado: null },
  ]
  const clips = clipsDeAnalisis({ analisis, acciones, catalogo, equipos: [{ id: 'eq', nombre: 'Camioneros' }] })
  const filas = comparacion({ clips, catalogo, ladoNuestro: CLUB, ladoRival: 'eq', posesion: { porcentaje: 58, porcentajeOtro: 42, parcial: true },
    eventosPartido: [{ tipo: 'gol', equipo: 'propio' }, { tipo: 'tarjeta', equipo: 'rival' }] })
  const de = (id) => filas.find((f) => f.id === id)
  assert.deepEqual([de('posesion').nuestro, de('posesion').rival, de('posesion').parcial], [58, 42, true])
  assert.deepEqual([de('goles').nuestro, de('goles').rival], [1, 0])
  // Nuestras transiciones ofensivas: 1 marcada. Las del rival: los espejos de nuestras 2 transiciones defensivas.
  assert.deepEqual([de('col:Transición ofensiva').nuestro, de('col:Transición ofensiva').rival], [1, 2])
  assert.equal(de('col:Error defensivo'), undefined, 'Charla no se compara')
  assert.deepEqual(resultadoPartido(analisis[0]), { local: 2, visitante: 1, origen: 'calendario', nuestroEsLocal: false })
  assert.deepEqual(resultadoPartido({ id: 'S' }, [{ tipo: 'gol', equipo: 'propio' }]), { local: 1, visitante: 0, origen: 'video', nuestroEsLocal: true })
  const top = destacadas(clips.filter((c) => c.equipo === CLUB), { J1: 90 }, catalogo)
  assert.deepEqual(top.map((t) => [t.jugadoraId, t.minutos, t.goles.length]), [['J1', 90, 1], ['J2', null, 0]])
  const linea = lineaResumen([{ id: 'g', tipo: 'gol', segundo: 600 }, { id: 'x', tipo: 'inicio_1t', segundo: 0 }, { id: 'c', tipo: 'cambio', segundo: 100 }], marcas)
  assert.deepEqual(linea.map((e) => [e.tipo, e.minuto]), [['cambio', "1T 2'"], ['gol', "1T 11'"]])
})

test('teclas del Modo posesión: Q y W no son de ninguna botonera ni del marcador; Espacio, ? y números no se aceptan', () => {
  const usadas = new Set([...Object.values(ATAJOS_POR_DEFECTO), ...Object.values(ATAJOS_COLECTIVA_POR_DEFECTO), ...TECLAS_MARCADOR])
  assert.equal(usadas.has(TECLAS_POSESION_POR_DEFECTO.cambio), false)
  assert.equal(usadas.has(TECLAS_POSESION_POR_DEFECTO.detenida), false)
  assert.deepEqual(TECLAS_POSESION_POR_DEFECTO, { cambio: 'q', detenida: 'w' })
  assert.equal(validarTeclaPosesion(' ', 'w').ok, false)
  assert.equal(validarTeclaPosesion('?', 'w').ok, false)
  assert.equal(validarTeclaPosesion('7', 'w').ok, false)
  assert.equal(validarTeclaPosesion('W', 'w').ok, false)
  assert.equal(validarTeclaPosesion('z', 'w').ok, true)
  const almacen = { valor: JSON.stringify({ cambio: ' ', detenida: 'w' }), getItem() { return this.valor } }
  assert.deepEqual(leerTeclasPosesion(almacen), { cambio: 'q', detenida: 'w' }, 'Una tecla inválida guardada vuelve a las de siempre')
})

test('lado del 1T sin confirmar: avisa solo con la columna en false; cuenta los partidos del filtro', () => {
  assert.equal(ladoSinConfirmar({ direccion_confirmada: false }), true)
  assert.equal(ladoSinConfirmar({ direccion_confirmada: true }), false)
  assert.equal(ladoSinConfirmar({}), false, 'Sin la columna (antes de la migración) no se puede saber')
  const partidos = new Map([['a', { direccion_confirmada: false }], ['b', { direccion_confirmada: true }], ['c', { direccion_confirmada: false }]])
  assert.equal(partidosSinConfirmar([{ partido_id: 'a' }, { partido_id: 'a' }, { partido_id: 'b' }, { partido_id: 'c' }], partidos), 2)
  assert.equal(partidosSinConfirmar([{ partido_id: 'b' }], partidos), 0)
})

test('selector de scouting: no ofrece al club', () => {
  const lista = [{ id: '1', nombre: 'Club Comunicaciones' }, { id: '2', nombre: 'Camioneros' }]
  assert.deepEqual(equiposParaElegir(lista).map((e) => e.id), ['2'])
})
