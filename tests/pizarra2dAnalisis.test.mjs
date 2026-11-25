// Etapa 5 de Análisis: calibración de la cancha, formato v2 de los dibujos y pizarra 2D. Lógica pura.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CANCHA_POR_DEFECTO, aCancha, aplicar, calibracionEn, estaCalibrado, homografia, lineasEnVideo, marcarPunto, medidasCancha,
  nuevaCalibracion, puntosConocidos, quitarPunto, resolverCalibracion, textoMetros,
} from '../src/utils/analisis/dibujos/calibracion.js'
import { VERSION_DIBUJO, estaVacio, normalizarDibujo, usaVersion2 } from '../src/utils/analisis/dibujos/formato.js'
import { escenaEn } from '../src/utils/analisis/dibujos/escena.js'
import {
  aJugadaPizarra, aPizarra, ajusteEn, datosFicha, desdePizarra, enlaceClip, equipoDe, fijarAjuste, formularioJugada, jugadoras2d,
  posicionCancha, tiemposDePasos, vista2dEn,
} from '../src/utils/analisis/dibujos/pizarra2d.js'
import { PALETA, validarPizarra } from '../src/utils/pizarra.js'
import { datosParaGuardar } from '../src/utils/biblioteca.js'

const leer = (r) => readFileSync(new URL('../' + r, import.meta.url), 'utf8')
const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// Cámara inventada (cancha en metros → video de 0 a 1): una perspectiva desde la tribuna.
const CAMARA = [0.008, 0.002, 0.1, 0.0005, 0.006, 0.25, 0.00002, 0.004, 1]
const CANCHA = { largo: 100, ancho: 64 }
const CONOCIDOS = Object.fromEntries(puntosConocidos(CANCHA).map((p) => [p.ref, p]))
const enVideo = (m) => { const q = aplicar(CAMARA, m); return { x: q.x, y: q.y } }
const calibracionDe = (refs, t = 10, ruido = 0) => ({
  id: 'c1', t,
  puntos: refs.map((ref, i) => { const q = enVideo(CONOCIDOS[ref]); return { ref, x: q.x + (i % 2 ? ruido : -ruido), y: q.y + (i % 3 ? ruido : 0) } }),
})
const REFS_BUENAS = ['mitad_a', 'centro', 'circulo_b', 'area_i_fa', 'area_i_fb', 'penal_i']

test('puntos conocidos: medidas reglamentarias, cancha configurable y límites', () => {
  assert.deepEqual(medidasCancha(null), CANCHA_POR_DEFECTO)
  assert.deepEqual(medidasCancha({ largo: 90, ancho: 55 }), { largo: 90, ancho: 55 })
  assert.deepEqual(medidasCancha({ largo: 500, ancho: 2 }), { largo: 120, ancho: 30 })
  const p = Object.fromEntries(puntosConocidos({ largo: 90, ancho: 60 }).map((x) => [x.ref, x]))
  assert.deepEqual([p.centro.x, p.centro.y], [45, 30])
  assert.deepEqual([p.penal_i.x, p.penal_d.x], [11, 79])
  assert.deepEqual([p.area_d_fa.x, p.area_d_fa.y], [73.5, 30 - 20.16])
  assert.deepEqual([p.chica_i_fb.x, p.chica_i_fb.y], [5.5, 30 + 9.16])
  assert.equal(p.circulo_a.y, 30 - 9.15)
  assert.equal(puntosConocidos(CANCHA).length, 29)
  for (const x of puntosConocidos(CANCHA)) assert.ok(x.nombre && x.grupo, x.ref)
})

test('transformación: con 4 puntos conocidos vuelve exacto cualquier punto de la cancha', () => {
  const refs = ['area_i_fa', 'area_i_fb', 'mitad_a', 'mitad_b']
  const H = homografia(refs.map((r) => enVideo(CONOCIDOS[r])), refs.map((r) => CONOCIDOS[r]))
  for (const m of [{ x: 30, y: 20 }, { x: 5, y: 60 }, { x: 70, y: 10 }]) {
    const q = aplicar(H, enVideo(m))
    cerca(q.x, m.x, 1e-6); cerca(q.y, m.y, 1e-6)
  }
})

test('calibración: con más puntos ajusta por mínimos cuadrados y avisa errores; control con las líneas', () => {
  const r = resolverCalibracion(calibracionDe(REFS_BUENAS), CANCHA)
  assert.equal(r.ok, true)
  assert.ok(r.errores.every((e) => e.error < 0.05))
  // Con un poco de ruido sigue cerca (menos de medio metro en el medio de la cancha).
  const conRuido = { cancha: CANCHA, calibraciones: [calibracionDe(REFS_BUENAS, 10, 0.002)] }
  const m = aCancha(conRuido, 10, enVideo({ x: 40, y: 30 }))
  assert.ok(Math.hypot(m.x - 40, m.y - 30) < 0.5, JSON.stringify(m))
  // Un punto mal marcado se nota en su error.
  const mal = calibracionDe(REFS_BUENAS)
  mal.puntos[2] = { ...mal.puntos[2], x: mal.puntos[2].x + 0.08 }
  assert.ok(resolverCalibracion(mal, CANCHA).errores.find((e) => e.ref === 'circulo_b').error > 1.5)
  // Las líneas proyectadas pasan por los puntos marcados (la del medio pasa por el centro).
  const lineas = lineasEnVideo(r.inversa, CANCHA)
  assert.ok(lineas.length >= 9)
  const centro = enVideo(CONOCIDOS.centro)
  assert.ok(lineas.some((l) => l.some((p) => Math.hypot(p.x - centro.x, p.y - centro.y) < 0.01)))
})

test('calibración: rechaza pocos puntos, puntos en línea y puntos amontonados', () => {
  assert.match(resolverCalibracion(calibracionDe(['centro', 'mitad_a', 'penal_i']), CANCHA).motivo, /al menos 4/)
  assert.match(resolverCalibracion(calibracionDe(['banderin_ai', 'mitad_a', 'banderin_ad', 'centro']), CANCHA).motivo, /misma línea/)
  const juntos = { id: 'c', t: 0, puntos: REFS_BUENAS.map((ref, i) => ({ ref, x: 0.5 + i * 0.00001, y: 0.5 })) }
  assert.equal(resolverCalibracion(juntos, CANCHA).ok, false)
  assert.equal(resolverCalibracion({ puntos: [{ ref: 'inventado', x: 0, y: 0 }] }, CANCHA).ok, false)
})

test('calibración: cada momento usa la más cercana; recalibrar copia puntos; marcar y quitar', () => {
  const lejos = { ...calibracionDe(REFS_BUENAS, 20), id: 'c2', puntos: calibracionDe(REFS_BUENAS).puntos.map((p) => ({ ...p, x: p.x + 0.1 })) }
  const dibujo = { cancha: CANCHA, calibraciones: [calibracionDe(REFS_BUENAS, 10), lejos] }
  assert.equal(calibracionEn(dibujo, 12).cal.id, 'c1')
  assert.equal(calibracionEn(dibujo, 17).cal.id, 'c2')
  assert.equal(estaCalibrado(dibujo), true)
  assert.equal(estaCalibrado({ calibraciones: [] }), false)
  assert.equal(aCancha({ calibraciones: [] }, 0, { x: 0.5, y: 0.5 }), null)
  const nueva = nuevaCalibracion(dibujo, 18.5, 'c3')
  assert.equal(nueva.t, 18.5); assert.equal(nueva.puntos.length, REFS_BUENAS.length); assert.equal(nueva.puntos[0].x, lejos.puntos[0].x)
  const marcada = marcarPunto(nueva, 'centro', { x: 2, y: -1 })
  assert.deepEqual(marcada.puntos.find((p) => p.ref === 'centro'), { ref: 'centro', x: 1, y: 0 })
  assert.equal(marcada.puntos.filter((p) => p.ref === 'centro').length, 1)
  assert.equal(marcarPunto(nueva, 'nada', { x: 0, y: 0 }), nueva)
  assert.equal(quitarPunto(marcada, 'centro').puntos.some((p) => p.ref === 'centro'), false)
  assert.equal(textoMetros(7.25), '7,3 m'); assert.equal(textoMetros(12.6), '13 m')
})

// Dibujo de la versión 1 (como lo guardó la etapa 4).
const V1 = {
  version: 1, clip: { inicio: 10, fin: 16 },
  objetos: [
    { id: 'a', tipo: 'anillo', desde: 10, hasta: 16, color: 'amarillo', grosor: 2, pista: { fuente: 'manual', claves: [{ t: 10, x: 0.3, y: 0.6 }, { t: 14, x: 0.5, y: 0.6 }] }, efectos: {} },
    { id: 'n', tipo: 'nombre', desde: 10, hasta: 16, color: 'blanco', grosor: 2, jugadora: { rival: true, dorsal: '7', nombre: 'Pérez' }, pista: { claves: [{ t: 10, x: 0.6, y: 0.5 }] }, efectos: {} },
    { id: 'e', tipo: 'enlace', desde: 11, hasta: 15, a: 'a', b: 'n' },
    { id: 'p', tipo: 'pase_bajo', desde: 12, hasta: 14, puntos: [{ x: 0.3, y: 0.6 }, { x: 0.6, y: 0.5 }] },
    { id: 'z', tipo: 'zona', desde: 10, hasta: 13, color: 'rojo', puntos: [{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.6 }] },
  ],
  pausas: [{ id: 'q', t: 12, duracion: 3 }], subtitulos: [{ id: 's', desde: 13, hasta: 15, texto: 'Pase al medio' }],
}

test('formato: lo guardado en la versión 1 se lee igual y sigue siendo versión 1', () => {
  const r = normalizarDibujo(V1)
  assert.equal(r.ok, true)
  assert.equal(r.dibujo.version, 1)
  assert.equal(usaVersion2(r.dibujo), false)
  assert.equal(r.dibujo.cancha, undefined); assert.equal(r.dibujo.calibraciones, undefined)
  assert.deepEqual(r.dibujo.objetos.map((o) => o.id), ['a', 'n', 'e', 'p', 'z'])
  assert.equal(r.dibujo.objetos[0].jugadora, undefined)
  // Volver a normalizar da lo mismo (no se agregan campos nuevos).
  assert.deepEqual(normalizarDibujo(r.dibujo).dibujo, r.dibujo)
  assert.equal(VERSION_DIBUJO, 2)
  assert.equal(normalizarDibujo({ version: 3 }).ok, false)
})

test('formato v2: cancha, calibraciones, fichas, jugadora en anillo, ajustes y «no mostrar en la 2D»', () => {
  const datos = {
    ...V1, version: 2, cancha: { largo: 95, ancho: 60 },
    calibraciones: [
      { id: 'c1', t: 12, puntos: [{ ref: 'centro', x: 0.5, y: 0.5 }, { ref: 'centro', x: 0.1, y: 0.1 }, { ref: 'malo', x: 0, y: 0 }, { ref: 'penal_i', x: 1.4, y: 0.2 }] },
      { id: 'c1', t: 11, puntos: [{ ref: 'mitad_a', x: 0.5, y: 0.1 }] },
      { t: 9, puntos: [] },
    ],
    objetos: [
      { ...V1.objetos[0], jugadora: { id: 'j1', nombre: 'Gómez', dorsal: '10', foto: 'http://no-segura' }, ajustes2d: [{ t: 12, dx: 1.234, dy: 99 }, { t: 11, dx: 0, dy: 0 }, { t: 12, dx: 2, dy: 0 }], en2d: false },
      { id: 'f', tipo: 'ficha', desde: 10, hasta: 16, t: 11.5, punto: { x: 0.7, y: 0.4 }, jugadora: { rival: true, dorsal: '4' } },
      { id: 'f2', tipo: 'ficha', desde: 10, hasta: 16 },
    ],
  }
  const { dibujo } = normalizarDibujo(datos)
  assert.equal(dibujo.version, 2)
  assert.deepEqual(dibujo.cancha, { largo: 95, ancho: 60 })
  assert.deepEqual(dibujo.calibraciones.map((c) => [c.id, c.t]), [['c1', 11], ['c2', 12]])
  assert.deepEqual(dibujo.calibraciones[1].puntos, [{ ref: 'centro', x: 0.5, y: 0.5 }, { ref: 'penal_i', x: 1, y: 0.2 }])
  const anillo = dibujo.objetos.find((o) => o.id === 'a')
  assert.deepEqual(anillo.jugadora, { id: 'j1', nombre: 'Gómez', dorsal: '10', foto: '' })
  assert.deepEqual(anillo.ajustes2d, [{ t: 11, dx: 0, dy: 0 }, { t: 12, dx: 2, dy: 0 }])
  assert.equal(anillo.en2d, false)
  const ficha = dibujo.objetos.find((o) => o.id === 'f')
  assert.deepEqual([ficha.t, ficha.punto, ficha.jugadora.rival], [11.5, { x: 0.7, y: 0.4 }, true])
  assert.equal(dibujo.objetos.some((o) => o.id === 'f2'), false, 'una ficha sin punto no sirve')
  // Solo con calibración no está vacío (no se borra al guardar).
  assert.equal(estaVacio({ objetos: [], pausas: [], subtitulos: [], calibraciones: dibujo.calibraciones }), false)
  // Las fichas no se dibujan sobre el video.
  assert.equal(escenaEn(dibujo, 12).elementos.some((e) => e.obj.id === 'f'), false)
})

const calibrado = (extra = {}) => normalizarDibujo({ ...V1, cancha: CANCHA, calibraciones: [calibracionDe(REFS_BUENAS, 12)], ...extra }).dibujo

test('pizarra 2D: metros ↔ Pizarra respetando las áreas, y vuelta', () => {
  const chica = { largo: 90, ancho: 56 }
  // El punto penal y el frente del área quedan donde están en la Pizarra (105 × 68).
  cerca(aPizarra({ x: 11, y: 28 }, chica).x, 11 * 100 / 105)
  cerca(aPizarra({ x: 79, y: 28 }, chica).x, (105 - 11) * 100 / 105)
  cerca(aPizarra({ x: 45, y: 28 }, chica).x, 50)
  cerca(aPizarra({ x: 45, y: 28 }, chica).y, 50)
  cerca(aPizarra({ x: 45, y: 28 - 20.16 }, chica).y, (34 - 20.16) * 100 / 68)
  cerca(aPizarra({ x: 0, y: 0 }, chica).y, 0)
  cerca(aPizarra({ x: 90, y: 56 }, chica).x, 100)
  for (const m of [{ x: 3, y: 2 }, { x: 47, y: 40 }, { x: 88, y: 55 }]) {
    const vuelta = desdePizarra(aPizarra(m, chica), chica)
    cerca(vuelta.x, m.x, 1e-9); cerca(vuelta.y, m.y, 1e-9)
  }
})

test('pizarra 2D: jugadoras con su equipo, sin repetir, con ajustes y en sincronía con el video', () => {
  assert.equal(equipoDe({ jugadora: { rival: true } }), 'rival')
  assert.equal(equipoDe({ jugadora: { id: 'x' }, color: 'rojo' }), 'nuestra')
  assert.equal(equipoDe({ color: 'azul' }), 'rival')
  assert.equal(equipoDe({ color: 'amarillo' }), 'nuestra')
  const dibujo = calibrado({
    objetos: [...V1.objetos,
      { id: 'a2', tipo: 'foco', desde: 10, hasta: 16, jugadora: { id: 'j9', nombre: 'Ruiz', dorsal: '5', foto: '' }, pista: { claves: [{ t: 10, x: 0.4, y: 0.5 }] } },
      { id: 'n2', tipo: 'nombre', desde: 10, hasta: 16, jugadora: { id: 'j9', nombre: 'Ruiz', dorsal: '5', foto: '' }, pista: { claves: [{ t: 10, x: 0.4, y: 0.5 }] } },
      { id: 'f', tipo: 'ficha', desde: 10, hasta: 16, t: 12, punto: { x: 0.7, y: 0.4 }, jugadora: { rival: true, dorsal: '4' } },
    ],
  })
  // La misma jugadora seguida con foco y con nombre: queda una ficha (la del nombre).
  assert.deepEqual(jugadoras2d(dibujo).map((o) => o.id), ['a', 'n', 'n2', 'f'])
  // La posición sale del punto de los pies pasado por la calibración.
  const a = dibujo.objetos[0]
  const esperado = aCancha(dibujo, 14, { x: 0.5, y: 0.6 })
  assert.deepEqual(posicionCancha(dibujo, a, 14), esperado)
  // Arrastrar en la 2D guarda un ajuste y no toca los puntos del video.
  const movido = fijarAjuste(dibujo, 'a', 14, { x: esperado.x + 3, y: esperado.y - 1 })
  const am = movido.objetos[0]
  assert.deepEqual(am.pista, a.pista)
  cerca(posicionCancha(movido, am, 14).x, esperado.x + 3, 0.01)
  assert.deepEqual(ajusteEn(am.ajustes2d, 0), { dx: am.ajustes2d[0].dx, dy: am.ajustes2d[0].dy })
  assert.deepEqual(ajusteEn([{ t: 0, dx: 0, dy: 0 }, { t: 2, dx: 2, dy: 4 }], 1), { dx: 1, dy: 2 })
  // Vista en un instante: fichas, flechas, zona, línea con metros y subtítulo.
  const v = vista2dEn(movido, 13.5, { rival: { id: '11111111-2222-3333-4444-555555555555', color_camiseta: '#112233', color_numero: '#FFFFFF' }, fichas: 'foto' })
  const porId = Object.fromEntries(v.doc.elementos.map((e) => [e.id, e]))
  assert.equal(porId.a.color, PALETA.local)
  assert.equal(porId.n.color, '#112233')
  assert.deepEqual(porId.n.vinculo, { tipo: 'rival', id: '11111111-2222-3333-4444-555555555555' })
  assert.equal(porId.n.numero, '7')
  assert.equal(porId.p.tipo, 'pase')
  assert.equal(porId.z.tipo, 'sombra'); assert.equal(porId.z.puntos.length, 4)
  assert.equal(v.opacidades.z, 0, 'la zona ya desapareció a los 13,5 s')
  assert.equal(v.opacidades.p, 1)
  assert.equal(porId.e.tipo, 'punteada')
  assert.match(porId['e-m'].texto, /^\d+(,\d)? m$/)
  assert.equal(v.subtitulo, 'Pase al medio')
  assert.equal(v.foco?.id, 'n2', 'el foco va a la ficha que quedó de esa jugadora')
  for (const id of Object.keys(v.poses)) assert.ok(v.poses[id].x >= 0 && v.poses[id].x <= 100 && v.poses[id].y >= 0 && v.poses[id].y <= 100)
  // Sin calibrar no hay nada para mostrar.
  assert.equal(vista2dEn(normalizarDibujo(V1).dibujo, 12).doc.elementos.length, 0)
})

test('línea entre dos jugadoras: metros sobre el video solo con el clip calibrado', () => {
  const sin = escenaEn(normalizarDibujo(V1).dibujo, 12).elementos.find((e) => e.obj.id === 'e')
  assert.equal(sin.metros, undefined)
  const con = escenaEn(calibrado(), 12).elementos.find((e) => e.obj.id === 'e')
  assert.ok(con.metros > 0 && con.metros < 120)
  assert.match(leer('src/components/analisis/dibujo/CapaDibujos.jsx'), /textoMetros\(el\.metros\)/)
})

test('jugada de Pizarra: pasos con subtítulos, pausas y ocultos; válida para la base', () => {
  const dibujo = calibrado()
  const tiempos = tiemposDePasos(dibujo, dibujo.clip)
  assert.deepEqual(tiempos, [10, 11, 12, 13, 14, 15, 16])
  const doc = aJugadaPizarra(dibujo, { titulo: 'Salida por abajo', rival: { id: 'no-uuid', color_camiseta: 'rojo' } })
  assert.deepEqual(validarPizarra(doc), doc, 'el validador de la Pizarra lo acepta tal cual')
  assert.equal(doc.version, 2); assert.equal(doc.superficie, 'completa'); assert.equal(doc.placa.titulo, 'Salida por abajo')
  assert.equal(doc.pasos.length, 7)
  assert.deepEqual(doc.pasos.slice(1).map((p) => p.duracion), [1, 1, 1, 1, 1, 1])
  const p12 = doc.pasos[2], p13 = doc.pasos[3]
  assert.equal(p12.pausa, 3)
  assert.equal(p13.texto, 'Pase al medio'); assert.equal(p13.nombre, 'Pase al medio')
  assert.ok(doc.pasos[0].ocultos.includes('p'), 'el pase todavía no se ve al principio')
  assert.ok(!p12.ocultos.includes('p'))
  assert.ok(!p13.ocultos.includes('z'), 'a los 13 s la zona todavía se ve')
  assert.ok(doc.pasos[4].ocultos.includes('z'))
  const rival = doc.elementos.find((e) => e.id === 'n')
  assert.deepEqual([rival.color, rival.vinculo], [PALETA.rival, null], 'sin camiseta válida, el azul de rival')
  // La jugadora seguida se mueve entre pasos; la flecha queda quieta.
  assert.notDeepEqual(doc.pasos[0].poses.a, doc.pasos[4].poses.a)
  assert.deepEqual(doc.pasos[0].poses.p, doc.pasos[4].poses.p)
  // Muchos segundos: nunca más de 60 pasos.
  const largo = { ...dibujo, clip: { inicio: 0, fin: 300 } }
  assert.ok(tiemposDePasos(largo, largo.clip).length <= 60)
  assert.throws(() => aJugadaPizarra(normalizarDibujo(V1).dibujo), /calibrada/)
})

test('guardar en la Biblioteca: jugada de Cancha, con carpeta y enlace al clip', () => {
  const doc = aJugadaPizarra(calibrado(), { titulo: 'Salida' })
  const form = formularioJugada({ nombre: ' Salida ', carpetaId: 'c-1', doc, videoId: 'abcdefghijk', inicio: 125.7, descripcion: 'Del partido' })
  const datos = datosParaGuardar(form)
  assert.equal(datos.ambito, 'cancha'); assert.equal(datos.tipo, 'jugada'); assert.equal(datos.carpeta_id, 'c-1')
  assert.equal(datos.contenido, 'Salida')
  assert.equal(datos.link_video, 'https://www.youtube.com/watch?v=abcdefghijk&t=125s')
  assert.equal(datos.cantidad_jugadores, 2)
  assert.deepEqual(datos.pizarra, doc)
  assert.equal(enlaceClip('corto', 3), null)
  assert.deepEqual(datosFicha({ jugadora: { id: '11111111-2222-3333-4444-555555555555', dorsal: '12345', foto: 'https://x/f.jpg' } }).vinculo, { tipo: 'jugadora', id: '11111111-2222-3333-4444-555555555555' })
  assert.equal(datosFicha({ jugadora: { dorsal: '12345' } }).numero, '1234')
})

test('calibración espejada (izquierda por derecha o arriba por abajo): se rechaza con un aviso claro', async () => {
  const { espejada, estadoCalibracion, ladoDe } = await import('../src/utils/analisis/dibujos/calibracion.js')
  // Bien: área de la derecha y círculo central; una jugadora en el círculo cae en el círculo.
  const bien = { id: 'c', t: 0, puntos: ['area_d_fa', 'area_d_fb', 'circulo_a', 'circulo_b'].map((r) => ({ ref: r, ...enVideo(CONOCIDOS[r]) })) }
  const rb = resolverCalibracion(bien, CANCHA)
  assert.equal(rb.ok, true)
  assert.equal(espejada(rb.H, bien.puntos[0]), false)
  const m = aCancha({ cancha: CANCHA, calibraciones: [bien] }, 0, enVideo({ x: 55, y: 36 }))
  cerca(m.x, 55, 1e-6); cerca(m.y, 36, 1e-6)
  // Mal: el área de la derecha marcada como si fuera la de la izquierda → antes daba una cancha espejada sin avisar.
  const izquierdaPorDerecha = { id: 'c', t: 0, puntos: [['area_i_fa', 'area_d_fa'], ['area_i_fb', 'area_d_fb'], ['circulo_a', 'circulo_a'], ['circulo_b', 'circulo_b']].map(([ref, real]) => ({ ref, ...enVideo(CONOCIDOS[real]) })) }
  const r1 = resolverCalibracion(izquierdaPorDerecha, CANCHA)
  assert.equal(r1.ok, false); assert.equal(r1.espejada, true); assert.match(r1.motivo, /espejada.*izquierda con derecha/)
  assert.equal(aCancha({ cancha: CANCHA, calibraciones: [izquierdaPorDerecha] }, 0, enVideo({ x: 55, y: 36 })), null)
  const arribaPorAbajo = { id: 'c', t: 0, puntos: [['area_d_fb', 'area_d_fa'], ['area_d_fa', 'area_d_fb'], ['circulo_b', 'circulo_a'], ['circulo_a', 'circulo_b']].map(([ref, real]) => ({ ref, ...enVideo(CONOCIDOS[real]) })) }
  assert.equal(resolverCalibracion(arribaPorAbajo, CANCHA).espejada, true)
  // De qué lado es cada punto.
  assert.equal(ladoDe('penal_i', CANCHA).lado, 'izquierda')
  assert.match(ladoDe('banderin_bd', CANCHA).texto, /mitad DERECHA.*ABAJO \(el lateral más cerca de la cámara\)/)
  assert.equal(ladoDe('centro', CANCHA).lado, 'centro')
  // Estado claro: con 4 puntos pide un quinto; con 5 bien, coinciden; con uno corrido, «Revisar».
  assert.equal(estadoCalibracion(rb, 4).tipo, 'cuatro')
  assert.match(estadoCalibracion(rb, 4).texto, /marcá un quinto/)
  assert.equal(estadoCalibracion(r1, 4).tipo, 'error')
  const cinco = calibracionDe(['mitad_a', 'centro', 'circulo_b', 'area_i_fa', 'area_i_fb'])
  assert.equal(estadoCalibracion(resolverCalibracion(cinco, CANCHA), 5).tipo, 'bien')
  cinco.puntos[2] = { ...cinco.puntos[2], x: cinco.puntos[2].x + 0.08 }
  const rc = resolverCalibracion(cinco, CANCHA)
  assert.equal(estadoCalibracion(rc, 5).tipo, 'revisar')
})

test('ficha quieta → «Seguir a esta jugadora»: pasa a anillo con su primer punto y la misma jugadora', async () => {
  const { fichaASeguimiento } = await import('../src/utils/analisis/dibujos/operaciones.js')
  const d = calibrado({ objetos: [{ id: 'f', tipo: 'ficha', desde: 10, hasta: 16, t: 12.5, punto: { x: 0.7, y: 0.4 }, jugadora: { rival: true, dorsal: '4', nombre: '' } }] })
  const nuevo = fichaASeguimiento(d, 'f')
  const a = nuevo.objetos.find((o) => o.id === 'f')
  assert.equal(a.tipo, 'anillo'); assert.equal(a.color, 'rojo'); assert.equal(a.desde, 12.5); assert.equal(a.hasta, 16)
  assert.deepEqual(a.pista.claves, [{ t: 12.5, x: 0.7, y: 0.4 }])
  assert.deepEqual(a.jugadora, { rival: true, dorsal: '4', nombre: '' })
  assert.deepEqual(normalizarDibujo(nuevo).dibujo.objetos.find((o) => o.id === 'f').pista.claves, a.pista.claves)
  // En la 2D sigue en el mismo lugar en ese cuadro.
  assert.deepEqual(posicionCancha(nuevo, a, 12.5), aCancha(d, 12.5, { x: 0.7, y: 0.4 }))
  assert.equal(fichaASeguimiento(d, 'nada'), d)
})
