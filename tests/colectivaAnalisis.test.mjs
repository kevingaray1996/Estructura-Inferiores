// Etapa 1 de Análisis: botonera colectiva (espejo, eventos dentro de un clip, grabación, equipos, scouting) y línea
// de tiempo (filas, puntos, zoom y arrastre de inicio y fin). Lógica pura, sin base ni pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE, crearCatalogo } from '../src/utils/analisis/catalogoAcciones.js'
import { tiposBotonera } from '../src/utils/analisis/botonera.js'
import {
  abrirGrabacion, cerrarGrabacion, crucesDeClips, debeCerrarseSola, equiposDelAnalisis, espejoDe, esMomento,
  eventosEnClip, filtrarAnalisis, momentosDesde, resumenEventosClip, segundosGrabando, separarAcciones, validarScouting,
} from '../src/utils/analisis/colectiva.js'
import {
  ajustarArrastre, duracionEje, estadoPunto, filasLinea, porcentajeDe, segundoDeArrastre, segundoDePorcentaje, ventanaVisible,
} from '../src/utils/analisis/lineaTiempo.js'

// Catálogo como queda después de la migración 20261124120000 (individuales + colectivos con sus espejos).
const col = (codigo, grupo, duracion, espejo = null, orden = 100) => ({
  codigo, etiqueta: codigo, etiqueta_boton: codigo.slice(0, 16), color: 'acento', ubicacion: 'opcional', resultados: [],
  grupo, orden, botonera: 'colectiva', duracion_defecto: duracion, espejo,
})
const catalogo = crearCatalogo([
  ...CATALOGO_BASE,
  col('Salida', 'con_pelota', 10, null, 101),
  col('Ataque posicional', 'con_pelota', 20, 'Defensa organizada', 102),
  col('Transición ofensiva', 'con_pelota', 8, 'Transición defensiva', 103),
  col('Presión alta', 'sin_pelota', 10, 'Salida', 104),
  col('Defensa organizada', 'sin_pelota', 20, 'Ataque posicional', 105),
  col('Transición defensiva', 'sin_pelota', 8, 'Transición ofensiva', 106),
  col('Salida rival', 'sin_pelota', 10, 'Salida', 107),
  col('Córner a favor', 'pelota_parada', 10, 'Córner en contra', 108),
  col('Córner en contra', 'pelota_parada', 10, 'Córner a favor', 109),
  col('Error defensivo', 'charla', 6, null, 112),
  col('Acción destacada', 'charla', 8, null, 113),
])

test('cada botón está en una sola botonera; la individual no cambia', () => {
  const individual = tiposBotonera(catalogo).map((t) => t.nombre)
  const colectiva = tiposBotonera(catalogo, 'colectiva').map((t) => t.nombre)
  assert.deepEqual(individual, tiposBotonera(crearCatalogo(CATALOGO_BASE)).map((t) => t.nombre))
  assert.equal(colectiva.length, 11)
  assert.ok(colectiva.every((c) => !individual.includes(c)))
  assert.equal(tiposBotonera(catalogo, 'colectiva').find((t) => t.nombre === 'Salida').duracion, 10)
  // Sin la columna «botonera» (antes de correr el SQL) todo es individual.
  assert.equal(crearCatalogo(CATALOGO_BASE).tipos.every((t) => t.botonera === 'individual' && t.duracion_defecto === null), true)
})

test('espejo: se calcula al consultar, sin guardar nada doble', () => {
  const m = { id: 'm1', tipo: 'Transición defensiva', segundo: 100, segundo_fin: 108 }
  assert.deepEqual(espejoDe(m, catalogo), { ...m, id: 'm1:espejo', tipo: 'Transición ofensiva', origen: 'Transición defensiva', origenId: 'm1', equipo: 'otro' })
  assert.equal(espejoDe({ id: 'a', tipo: 'Defensa organizada', segundo: 1, segundo_fin: 2 }, catalogo).tipo, 'Ataque posicional')
  assert.equal(espejoDe({ id: 'b', tipo: 'Presión alta', segundo: 1, segundo_fin: 2 }, catalogo).tipo, 'Salida')
  assert.equal(espejoDe({ id: 'c', tipo: 'Córner en contra', segundo: 1, segundo_fin: 2 }, catalogo).tipo, 'Córner a favor')
  assert.equal(espejoDe({ id: 'd', tipo: 'Error defensivo', segundo: 1, segundo_fin: 2 }, catalogo), null)
  assert.equal(espejoDe({ id: 'e', tipo: 'Acción destacada', segundo: 1, segundo_fin: 2 }, catalogo), null)
  const momentos = [m, { id: 'd', tipo: 'Error defensivo', segundo: 5, segundo_fin: 9 }]
  assert.deepEqual(momentosDesde(momentos, catalogo).map((x) => [x.tipo, x.equipo]), [['Transición defensiva', 'analizado'], ['Error defensivo', 'analizado']])
  assert.deepEqual(momentosDesde(momentos, catalogo, 'otro').map((x) => x.tipo), ['Transición ofensiva'])
  // Espejo del espejo vuelve al original.
  assert.equal(espejoDe(espejoDe(m, catalogo), catalogo).tipo, 'Transición defensiva')
  assert.equal(momentos.length, 2, 'No se agregan acciones')
})

test('separar acciones: momentos por catálogo o por tener fin; el resto es individual', () => {
  const eventos = [{ id: 1, tipo: 'Remate', segundo: 5 }, { id: 2, tipo: 'Salida', segundo: 3, segundo_fin: 9 }, { id: 3, tipo: 'Desconocido', segundo: 1, segundo_fin: 4 }]
  const { individuales, momentos } = separarAcciones(eventos, catalogo)
  assert.deepEqual(individuales.map((e) => e.id), [1])
  assert.deepEqual(momentos.map((e) => e.id), [2, 3])
  assert.equal(esMomento({ tipo: 'Salida', segundo: 1, segundo_fin: null }, catalogo), true)
})

test('eventos dentro de un clip: bordes incluidos y en orden; cruces de todos los clips', () => {
  const m = { id: 'm', tipo: 'Transición ofensiva', segundo: 100, segundo_fin: 110 }
  const eventos = [
    { id: 'r', tipo: 'Remate', segundo: 108, jugador_id: 'j11' },
    { id: 'antes', tipo: 'Pase correcto', segundo: 99 },
    { id: 'p', tipo: 'Pase correcto', segundo: 100, jugador_id: 'j8' },
    { id: 'fin', tipo: 'Pérdida', segundo: 110 },
    { id: 'despues', tipo: 'Pérdida', segundo: 111 },
  ]
  assert.deepEqual(eventosEnClip(m, eventos).map((e) => e.id), ['p', 'r', 'fin'])
  assert.deepEqual(eventosEnClip(null, eventos), [])
  const cruces = crucesDeClips([m, { id: 'n', tipo: 'Salida', segundo: 0, segundo_fin: 50 }], eventos)
  assert.deepEqual(cruces.map((c) => [c.momento.id, c.eventos.length]), [['m', 3], ['n', 0]])
  const texto = resumenEventosClip(eventosEnClip(m, eventos).slice(0, 2), {
    etiqueta: (t) => ({ 'Pase correcto': 'Pase +' }[t] || t), dorsal: (id) => ({ j8: 8, j11: 11 }[id]),
  })
  assert.equal(texto, 'Pase + (N.º 8) · Remate (N.º 11)')
})

test('grabación: abre en el segundo actual, cierra con la misma tecla o sola con la duración por defecto', () => {
  const g = abrirGrabacion('Transición ofensiva', 120.7, catalogo)
  assert.deepEqual(g, { tipo: 'Transición ofensiva', inicio: 120, duracion: 8 })
  assert.equal(segundosGrabando(g, 126), 6)
  assert.deepEqual(cerrarGrabacion(g, 126), { tipo: 'Transición ofensiva', segundo: 120, segundo_fin: 126 })
  // Video en pausa o vuelto atrás: toma la duración por defecto.
  assert.deepEqual(cerrarGrabacion(g, 120), { tipo: 'Transición ofensiva', segundo: 120, segundo_fin: 128 })
  assert.deepEqual(cerrarGrabacion(g, 90), { tipo: 'Transición ofensiva', segundo: 120, segundo_fin: 128 })
  assert.equal(debeCerrarseSola(g, 127), false)
  assert.equal(debeCerrarseSola(g, 128), true)
  assert.equal(debeCerrarseSola(null, 500), false)
})

test('equipos: propio (Comunicaciones o el rival) y scouting (local o visitante)', () => {
  assert.deepEqual(equiposDelAnalisis({ rival: 'Atlas' }), { analizado: 'Comunicaciones', otro: 'Atlas', scouting: false })
  assert.deepEqual(equiposDelAnalisis({ rival: 'Atlas', equipo_analizado: 'rival', partido_calendario: { rival: 'Atlas FC' } }),
    { analizado: 'Atlas FC', otro: 'Comunicaciones', scouting: false })
  assert.deepEqual(equiposDelAnalisis({ tipo_partido: 'scouting', equipo_local: 'Estrella del Sur', equipo_visitante: 'Otro', equipo_analizado: 'visitante' }),
    { analizado: 'Otro', otro: 'Estrella del Sur', scouting: true })
})

test('scouting: validación del formulario y filtro de la lista por tipo y rival', () => {
  assert.equal(validarScouting({ local: '', visitante: 'B', analizado: 'local', categoriaId: 'c' }).ok, false)
  assert.equal(validarScouting({ local: 'Estrella', visitante: 'estrella ', analizado: 'local', categoriaId: 'c' }).ok, false)
  assert.equal(validarScouting({ local: 'A', visitante: 'B', analizado: 'propio', categoriaId: 'c' }).ok, false)
  assert.equal(validarScouting({ local: 'A', visitante: 'B', analizado: 'local' }).ok, false)
  assert.equal(validarScouting({ local: 'A', visitante: 'B', analizado: 'local', categoriaId: 'c', videoUrl: 'x' }, () => false).ok, false)
  const ok = validarScouting({ local: ' Estrella del Sur ', visitante: 'Otro Club', analizado: 'local', categoriaId: 'c', fecha: '2026-11-20' })
  assert.deepEqual(ok.registro, { tipo_partido: 'scouting', equipo_local: 'Estrella del Sur', equipo_visitante: 'Otro Club', equipo_analizado: 'local',
    rival: 'Estrella del Sur', fecha: '2026-11-20', categoria_id: 'c', partido_calendario_id: null, video_url: null })
  const lista = [
    { id: 1, rival: 'Estrella del Sur' },
    { id: 2, tipo_partido: 'scouting', rival: 'Estrella del Sur', equipo_local: 'Estrella del Sur', equipo_visitante: 'Atlas' },
    { id: 3, tipo_partido: 'scouting', rival: 'Unión', equipo_local: 'Unión', equipo_visitante: 'Atlas' },
  ]
  assert.deepEqual(filtrarAnalisis(lista, { tipo: 'scouting' }).map((a) => a.id), [2, 3])
  assert.deepEqual(filtrarAnalisis(lista, { tipo: 'propio' }).map((a) => a.id), [1])
  assert.deepEqual(filtrarAnalisis(lista, { rival: 'estrella' }).map((a) => a.id), [1, 2])
  assert.deepEqual(filtrarAnalisis(lista, { tipo: 'scouting', rival: 'ATLAS' }).map((a) => a.id), [2, 3])
  assert.deepEqual(filtrarAnalisis(lista, { rival: 'union' }).map((a) => a.id), [3], 'Sin importar tildes')
})

test('arrastre: bordes y barra entera; el fin nunca antes del inicio y nada fuera del video', () => {
  const b = { segundo: 100, segundo_fin: 110 }
  assert.deepEqual(ajustarArrastre(b, 'inicio', -5), { segundo: 95, segundo_fin: 110 })
  assert.deepEqual(ajustarArrastre(b, 'inicio', 30), { segundo: 109, segundo_fin: 110 }, 'El inicio no pasa al fin')
  assert.deepEqual(ajustarArrastre(b, 'inicio', -500), { segundo: 0, segundo_fin: 110 })
  assert.deepEqual(ajustarArrastre(b, 'fin', 4.6), { segundo: 100, segundo_fin: 115 })
  assert.deepEqual(ajustarArrastre(b, 'fin', -40), { segundo: 100, segundo_fin: 101 }, 'El fin no queda antes del inicio')
  assert.deepEqual(ajustarArrastre(b, 'fin', 999, { duracion: 120 }), { segundo: 100, segundo_fin: 120 })
  assert.deepEqual(ajustarArrastre(b, 'mover', 20), { segundo: 120, segundo_fin: 130 })
  assert.deepEqual(ajustarArrastre(b, 'mover', -500), { segundo: 0, segundo_fin: 10 }, 'Conserva el largo')
  assert.deepEqual(ajustarArrastre(b, 'mover', 50, { duracion: 125 }), { segundo: 115, segundo_fin: 125 })
  for (const modo of ['inicio', 'fin', 'mover']) for (const d of [-300, -7, 0, 3, 300]) {
    const r = ajustarArrastre(b, modo, d, { duracion: 200 })
    assert.ok(r.segundo_fin >= r.segundo + 1 && r.segundo >= 0 && r.segundo_fin <= 200, `${modo} ${d}`)
  }
  assert.equal(segundoDeArrastre({ segundo: 3, segundo_fin: 9 }, 'fin'), 9)
  assert.equal(segundoDeArrastre({ segundo: 3, segundo_fin: 9 }, 'inicio'), 3)
})

test('línea de tiempo: filas por tipo en orden del catálogo, puntos verde/rojo, zoom y posiciones', () => {
  const { filas, puntos } = filasLinea({
    catalogo,
    momentos: [
      { id: 'b', tipo: 'Presión alta', segundo: 50, segundo_fin: 60 },
      { id: 'a', tipo: 'Salida', segundo: 30, segundo_fin: 40 },
      { id: 'c', tipo: 'Salida', segundo: 5, segundo_fin: 12 },
    ],
    individuales: [{ id: 'x', tipo: 'Pase incorrecto', segundo: 20 }, { id: 'y', tipo: 'Pase correcto', segundo: 10 }, { id: 'z', tipo: 'Centro', segundo: 15 }],
  })
  assert.deepEqual(filas.map((f) => [f.codigo, f.barras.map((b) => b.id)]), [['Salida', ['c', 'a']], ['Presión alta', ['b']]])
  assert.deepEqual(puntos.map((p) => [p.id, p.estado]), [['y', 'correcta'], ['z', 'neutra'], ['x', 'incorrecta']])
  assert.equal(estadoPunto({ tipo: 'Remate', resultado: 'Gol' }, catalogo), 'correcta')
  assert.equal(estadoPunto({ tipo: 'Remate', resultado: 'Fuera' }, catalogo), 'incorrecta')
  assert.deepEqual(ventanaVisible(500, null, 5400), { desde: 0, hasta: 5400 })
  assert.deepEqual(ventanaVisible(500, 120, 5400), { desde: 440, hasta: 560 })
  assert.deepEqual(ventanaVisible(10, 120, 5400), { desde: 0, hasta: 120 })
  assert.deepEqual(ventanaVisible(5390, 120, 5400), { desde: 5280, hasta: 5400 })
  assert.equal(porcentajeDe(470, { desde: 440, hasta: 560 }), 25)
  assert.equal(segundoDePorcentaje(25, { desde: 440, hasta: 560 }), 470)
  assert.equal(duracionEje({ duracionVideo: 5400.4 }), 5401)
  assert.equal(duracionEje({ momentos: [{ segundo: 10, segundo_fin: 300 }], eventos: [{ segundo: 50 }] }), 360)
})
