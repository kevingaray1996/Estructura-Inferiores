// Dibujos nivel profesional (docs/analisis-dibujos-pro.md): hueco del anillo, flechas que crecen, tiempo de animación con
// pausas, opciones de pase, zonas que se mueven, zona entre líneas, línea defensiva con y sin calibración, cámara lenta,
// pausa explicativa y compatibilidad con los dibujos de las versiones 1 y 2. Lógica pura.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicar, puntosConocidos } from '../src/utils/analisis/dibujos/calibracion.js'
import { HUECO, VERSION_DIBUJO, normalizarDibujo } from '../src/utils/analisis/dibujos/formato.js'
import {
  anchoHueco, cortarCuadratica, cortarPolilinea, cortarRecta, edadEn, geometriaAnillo, inicioAnimacion, progresoFlecha, tiempoAnimacion,
} from '../src/utils/analisis/dibujos/animacion.js'
import { escenaEn } from '../src/utils/analisis/dibujos/escena.js'
import { COBERTURA, estadosEnMetros, lineaDefensivaEn } from '../src/utils/analisis/dibujos/lineaDefensiva.js'
import { agregarLento, crearControlLento, lentoEn } from '../src/utils/analisis/dibujos/lentos.js'
import { animarZona, fijarFocoZonaEn, fijarFormaEn, focoZonaEn, formaEn, poligonoEntreLineas } from '../src/utils/analisis/dibujos/zonas.js'
import { agarresDe, borrarObjeto, crearObjeto, moverAgarre, moverEn, pausaExplicativa } from '../src/utils/analisis/dibujos/operaciones.js'
import { HERRAMIENTAS, ordenTeclaEditor } from '../src/utils/analisis/dibujos/editor.js'
import { ACCIONES_RAPIDAS, ayudaHerramienta, instruccion } from '../src/utils/analisis/dibujos/guias.js'

const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// Cámara inventada (la misma de pizarra2dAnalisis.test.mjs): cancha en metros → video de 0 a 1.
const CAMARA = [0.008, 0.002, 0.1, 0.0005, 0.006, 0.25, 0.00002, 0.004, 1]
const CANCHA = { largo: 100, ancho: 64 }
const CONOCIDOS = Object.fromEntries(puntosConocidos(CANCHA).map((p) => [p.ref, p]))
const enVideo = (m) => { const q = aplicar(CAMARA, m); return { x: q.x, y: q.y } }
const CALIBRACION = { id: 'c1', t: 10, puntos: ['mitad_a', 'centro', 'circulo_b', 'area_i_fa', 'area_i_fb', 'penal_i'].map((ref) => ({ ref, ...enVideo(CONOCIDOS[ref]) })) }
// Jugadora seguida quieta en un punto de la cancha (metros).
const seguida = (id, m, extra = {}) => ({
  id, tipo: 'anillo', desde: 10, hasta: 20, color: 'amarillo', grosor: 2, efectos: {},
  pista: { fuente: 'manual', claves: [{ t: 10, ...enVideo(m) }] }, ...extra,
})

// ---------- 1. Anillo detrás de las piernas ----------
test('anillo: el hueco corta el arco de atrás centrado arriba (donde están las piernas) y el de adelante queda entero', () => {
  const cx = 100, cy = 50, rx = 40, ry = 14
  const g = geometriaAnillo(cx, cy, rx, ry, undefined)
  // Automático: el hueco mide 0,28 del ancho del anillo, centrado en el punto más alto de la elipse.
  assert.equal(anchoHueco(undefined), HUECO.auto)
  assert.ok(g.hueco, 'Tiene hueco')
  cerca(g.hueco.desde.x, cx - HUECO.auto * rx, 0.01)
  cerca(g.hueco.hasta.x, cx + HUECO.auto * rx, 0.01)
  assert.ok(g.hueco.desde.y < cy && g.hueco.hasta.y < cy, 'El hueco está en la mitad de arriba (atrás)')
  cerca(g.hueco.desde.y, g.hueco.hasta.y, 0.01)
  // El trazo es un solo arco grande que va de un borde del hueco al otro pasando por adelante (abajo).
  assert.match(g.trazo, /^M[\d.,-]+ A40,14 0 1,1 [\d.,-]+$/)
  // El relleno deja la muesca hasta el centro (no tapa las piernas).
  assert.match(g.relleno, new RegExp(`L${cx - HUECO.auto * rx},${cy} L${cx + HUECO.auto * rx},${cy} Z$`))
  // Ancho elegido (dentro de los límites) y sin hueco.
  assert.equal(anchoHueco(0.5), 0.5)
  assert.equal(anchoHueco(2), HUECO.maximo)
  assert.equal(anchoHueco(0.01), HUECO.minimo)
  const ancho = geometriaAnillo(cx, cy, rx, ry, 0.5)
  cerca(ancho.hueco.hasta.x - ancho.hueco.desde.x, 2 * 0.5 * rx, 0.02)
  const sin = geometriaAnillo(cx, cy, rx, ry, false)
  assert.equal(sin.hueco, null)
  assert.equal(sin.trazo, sin.relleno)
  assert.match(sin.trazo, / Z$/, 'Sin hueco: elipse completa')
})

test('anillo: el hueco se guarda en la versión 3 solo si se cambió; los anillos viejos lo calculan solos', () => {
  const viejo = normalizarDibujo({ version: 1, objetos: [seguida('a', { x: 30, y: 30 })] }).dibujo
  assert.equal(viejo.version, 1)
  assert.equal('hueco' in viejo.objetos[0], false)
  const apagado = normalizarDibujo({ version: 3, objetos: [seguida('a', { x: 30, y: 30 }, { hueco: false })] }).dibujo
  assert.deepEqual([apagado.version, apagado.objetos[0].hueco], [3, false])
  assert.equal(normalizarDibujo({ objetos: [seguida('a', { x: 30, y: 30 }, { hueco: 9 })] }).dibujo.objetos[0].hueco, HUECO.maximo)
  assert.equal(normalizarDibujo({ objetos: [seguida('a', { x: 30, y: 30 }, { hueco: 'mucho' })] }).dibujo.objetos[0].hueco, undefined)
})

// ---------- Tiempo de animación ----------
test('tiempo de animación: suma las pausas que ya pasaron y lo que lleva la pausa en curso', () => {
  const pausas = [{ id: 'p1', t: 12, duracion: 3 }]
  assert.equal(tiempoAnimacion(pausas, 11), 11)
  assert.equal(tiempoAnimacion(pausas, 12), 12, 'Justo al llegar a la pausa, todavía no empezó')
  assert.equal(tiempoAnimacion(pausas, 12, { t: 12, transcurrido: 1.2 }), 13.2)
  assert.equal(tiempoAnimacion(pausas, 12, { t: 12, transcurrido: 9 }), 15, 'No pasa de la duración de la pausa')
  assert.equal(tiempoAnimacion(pausas, 13), 16)
  // Un dibujo que aparece justo en la pausa se anima durante la pausa; uno de después, cuando sigue el video.
  assert.equal(inicioAnimacion(pausas, 12), 12)
  cerca(edadEn(pausas, 12, 12, { t: 12, transcurrido: 0.4 }), 0.4)
  cerca(edadEn(pausas, 14, 14.5), 0.5)
})

// ---------- 4. Flechas que crecen ----------
test('flechas: crecen del origen al destino a la velocidad elegida o como el pase real', () => {
  const pase = { tipo: 'pase_bajo', desde: 10, crecer: { modo: 'normal' } }
  assert.equal(progresoFlecha(pase, 10, 0), 0)
  assert.ok(progresoFlecha(pase, 10.4, 0.4) > 0.5 && progresoFlecha(pase, 10.4, 0.4) < 1)
  assert.equal(progresoFlecha(pase, 11, 0.8), 1)
  assert.equal(progresoFlecha({ crecer: { modo: 'rapida' } }, 0, 0.4), 1)
  assert.ok(progresoFlecha({ crecer: { modo: 'lenta' } }, 0, 0.8) < 1)
  assert.equal(progresoFlecha({ tipo: 'pase_bajo' }, 10, 0), 1, 'Sin `crecer` (flecha vieja) aparece entera')
  const real = { crecer: { modo: 'real', salida: 11, llegada: 12 } }
  assert.equal(progresoFlecha(real, 10.5, 99), 0, 'Antes de la salida no se ve')
  assert.ok(progresoFlecha(real, 11.5, 0) > 0.5 && progresoFlecha(real, 11.5, 0) < 1)
  assert.equal(progresoFlecha(real, 12, 0), 1)

  // Recta, curva (De Casteljau: la parte que se ve es la misma curva) y trazo a mano.
  assert.deepEqual(cortarRecta({ x: 0, y: 0 }, { x: 10, y: 4 }, 0.5), [{ x: 0, y: 0 }, { x: 5, y: 2 }])
  const c = cortarCuadratica({ x: 0, y: 0 }, { x: 5, y: -10 }, { x: 10, y: 0 }, 0.5)
  assert.deepEqual(c, { a: { x: 0, y: 0 }, c: { x: 2.5, y: -5 }, b: { x: 5, y: -5 } })
  assert.deepEqual(cortarCuadratica({ x: 0, y: 0 }, { x: 5, y: -10 }, { x: 10, y: 0 }, 1).b, { x: 10, y: 0 })
  const trazo = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
  assert.deepEqual(cortarPolilinea(trazo, 0.25), [{ x: 0, y: 0 }, { x: 5, y: 0 }])
  assert.deepEqual(cortarPolilinea(trazo, 0.75), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }])
  assert.equal(cortarPolilinea(trazo, 1), trazo)

  // En la escena: con Vista previa crece; en el editor se ve entera.
  const d = normalizarDibujo({ objetos: [{ id: 'p', tipo: 'pase_alto', desde: 10, hasta: 13, puntos: [{ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }], crecer: { modo: 'normal', pelota: true } }] }).dibujo
  assert.equal(d.version, 3)
  assert.deepEqual(d.objetos[0].crecer, { modo: 'normal', pelota: true })
  assert.equal(escenaEn(d, 10).elementos[0].progreso, 0)
  assert.equal(escenaEn(d, 10.2, { animar: false }).elementos[0].progreso, 1)
  assert.equal(escenaEn(d, 12).elementos[0].progreso, 1)
  // Durante una pausa justo donde aparece, sigue creciendo aunque el video esté quieto.
  const conPausa = { ...d, pausas: [{ id: 'p1', t: 10, duracion: 3 }] }
  assert.equal(escenaEn(conPausa, 10).elementos[0].progreso, 0)
  assert.equal(escenaEn(conPausa, 10, { pausa: { t: 10, transcurrido: 1 } }).elementos[0].progreso, 1)
  // Modo real con marcas de salida y llegada; una llegada antes de la salida se corrige.
  const r = normalizarDibujo({ objetos: [{ id: 'p', tipo: 'movimiento', desde: 10, hasta: 13, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }], crecer: { modo: 'real', salida: 11, llegada: 10 } }] }).dibujo
  assert.deepEqual(r.objetos[0].crecer, { modo: 'real', pelota: false, salida: 11, llegada: 11.8 })
  // Las flechas nuevas crecen («normal»); las viejas no traen `crecer`.
  assert.deepEqual(crearObjeto('pase_bajo', { t: 10, clip: { inicio: 10, fin: 20 }, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).crecer, { modo: 'normal', pelota: false })
  assert.equal(crearObjeto('linea', { t: 10, clip: { inicio: 10, fin: 20 }, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).crecer, undefined)
})

// ---------- 2 y 3. Reflector y foco en una zona ----------
test('reflector: sigue a la jugadora y se enciende en medio segundo; foco en una zona quieto o con puntos clave', () => {
  const ref = crearObjeto('reflector', { t: 10, clip: { inicio: 10, fin: 20 }, puntos: [{ x: 0.4, y: 0.6 }] })
  assert.deepEqual(ref.luz, { color: 'blanco', intensidad: 0.6, ancho: 1 })
  const d = normalizarDibujo({ objetos: [{ ...ref, luz: { color: 'amarillo', intensidad: 5, ancho: 0.1 } }] }).dibujo
  assert.deepEqual(d.objetos[0].luz, { color: 'amarillo', intensidad: 1, ancho: 0.5 })
  assert.equal(escenaEn(d, 10).elementos[0].encendido, 0)
  assert.ok(escenaEn(d, 10.25).elementos[0].encendido > 0.5)
  assert.equal(escenaEn(d, 10.6).elementos[0].encendido, 1)
  assert.deepEqual(escenaEn(d, 11).elementos[0].posicion, { x: 0.4, y: 0.6 })

  // Foco en una zona: un clic = círculo; arrastrar = elipse. Con «se mueve», guarda una clave por cuadro.
  const circulo = crearObjeto('foco_zona', { t: 10, clip: { inicio: 10, fin: 20 }, puntos: [{ x: 0.5, y: 0.5 }] })
  assert.equal(circulo.forma, 'circulo')
  const elipse = crearObjeto('foco_zona', { t: 10, clip: { inicio: 10, fin: 20 }, puntos: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.6 }] })
  assert.deepEqual([elipse.forma, elipse.claves[0].x, elipse.claves[0].y, elipse.claves[0].rx, elipse.claves[0].ry], ['elipse', 0.3, 0.4, 0.1, 0.2])
  const quieto = fijarFocoZonaEn(elipse, 12, { x: 0.5 })
  assert.equal(quieto.claves.length, 1, 'Sin «se mueve», se corre entero')
  cerca(quieto.claves[0].x, 0.5)
  const animado = fijarFocoZonaEn({ ...elipse, animado: true }, 12, { x: 0.7, rx: 0.2 })
  assert.equal(animado.claves.length, 2)
  cerca(focoZonaEn(animado, 11).x, 0.5)
  cerca(focoZonaEn(animado, 11).rx, 0.15)
  assert.equal(focoZonaEn(animado, 15).x, 0.7)
})

// ---------- 5. Opciones de pase ----------
test('opciones de pase: primero el pase que se hizo y después cada opción, también durante una pausa', () => {
  const opciones = {
    id: 'op', tipo: 'opciones_pase', desde: 10, hasta: 14, color: 'rojo', grosor: 2, secuencia: true,
    pasadora: { punto: { x: 0.2, y: 0.5 }, seguir: 'a' }, receptora: { punto: { x: 0.5, y: 0.3 }, seguir: null, jugadora: { rival: true, dorsal: '4', nombre: '' } },
    opciones: [{ punto: { x: 0.6, y: 0.6 } }, { punto: { x: 0.7, y: 0.5 }, jugadora: { id: 'j10', nombre: 'Diez', dorsal: '10', foto: '' } }],
  }
  const a = { id: 'a', tipo: 'anillo', desde: 10, hasta: 14, pista: { claves: [{ t: 10, x: 0.25, y: 0.55 }] }, efectos: {} }
  const d = normalizarDibujo({ objetos: [a, opciones], pausas: [{ id: 'p1', t: 10, duracion: 4 }] }).dibujo
  assert.equal(d.version, 3)
  const ver = (pausa) => escenaEn(d, 10, { pausa }).elementos.find((e) => e.obj.id === 'op')
  // La pasadora sigue al anillo; la receptora es el punto marcado.
  assert.deepEqual(ver(null).pasadora, { x: 0.25, y: 0.55 })
  assert.deepEqual(ver(null).receptora, { x: 0.5, y: 0.3 })
  const momentos = [0, 0.6, 1.4, 2.1, 3].map((s) => ver({ t: 10, transcurrido: s }))
  assert.deepEqual(momentos.map((m) => m.progresoPase === 1), [false, true, true, true, true])
  assert.deepEqual(momentos.map((m) => m.opciones[0].progreso === 1), [false, false, true, true, true])
  assert.deepEqual(momentos.map((m) => m.opciones[1].progreso === 1), [false, false, false, true, true])
  assert.deepEqual(ver(null).opciones.map((o) => o.numero), [1, 2])
  // Sin secuencia, todas a la vez.
  const juntas = normalizarDibujo({ objetos: [a, { ...opciones, secuencia: false }] }).dibujo
  const e = escenaEn(juntas, 10.6).elementos.find((x) => x.obj.id === 'op')
  assert.deepEqual([e.progresoPase, e.opciones[0].progreso, e.opciones[1].progreso], [1, 1, 1])
  // Si se borra la jugadora seguida, la pasadora queda quieta donde estaba al aparecer.
  const sinA = borrarObjeto(d, 'a').objetos.find((o) => o.id === 'op')
  assert.deepEqual(sinA.pasadora, { punto: { x: 0.25, y: 0.55 }, seguir: null })
})

// ---------- 6. Zonas dinámicas ----------
test('zonas: se mueven y cambian de forma con puntos clave, con texto, efectos y metros', () => {
  const zona = { id: 'z', tipo: 'zona', desde: 10, hasta: 14, color: 'amarillo', grosor: 2, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] }
  // Prender «se mueve»: la forma actual queda como primera clave; en otro cuadro se guarda otra.
  let z = animarZona(zona, true, 10)
  assert.deepEqual(z.claves, [{ t: 10, puntos: zona.puntos }])
  z = fijarFormaEn(z, 12, [{ x: 0.3, y: 0.1 }, { x: 0.7, y: 0.5 }])
  assert.equal(z.claves.length, 2)
  assert.deepEqual(formaEn(z, 11), [{ x: 0.2, y: 0.1 }, { x: 0.5, y: 0.4 }])
  assert.deepEqual(formaEn(z, 9), zona.puntos)
  assert.deepEqual(formaEn(z, 13), [{ x: 0.3, y: 0.1 }, { x: 0.7, y: 0.5 }])
  // Arrastrar en un cuadro (moverEn) y estirar una esquina (moverAgarre) guardan la forma de ese cuadro.
  let d = { version: 3, objetos: [z], pausas: [], subtitulos: [] }
  d = moverEn(d, 'z', 11, 0.1, 0)
  assert.deepEqual(d.objetos[0].claves.map((c) => c.t), [10, 11, 12])
  cerca(formaEn(d.objetos[0], 11)[0].x, 0.3)
  d = moverAgarre(d, 'z', 12, 1, { x: 0.9, y: 0.9 })
  assert.deepEqual(formaEn(d.objetos[0], 12)[1], { x: 0.9, y: 0.9 })
  assert.deepEqual(agarresDe(d.objetos[0], 12).length, 2)
  // Apagar «se mueve»: queda la forma del cuadro actual.
  assert.deepEqual(animarZona(d.objetos[0], false, 12).puntos[1], { x: 0.9, y: 0.9 })
  assert.equal('claves' in animarZona(d.objetos[0], false, 12), false)

  // Texto, efectos y metros (con la cancha calibrada).
  const conTodo = normalizarDibujo({
    cancha: CANCHA, calibraciones: [CALIBRACION],
    objetos: [{ ...zona, tipo: 'poligono', puntos: [{ x: 20, y: 20 }, { x: 35, y: 20 }, { x: 35, y: 40 }, { x: 20, y: 40 }].map(enVideo), texto: 'Distancia entre líneas', efectos: { despliegue: true, rayado: true }, medidas: true }],
  }).dibujo
  const el = escenaEn(conTodo, 10.25).elementos[0]
  assert.equal(conTodo.version, 3)
  assert.equal(el.obj.texto, 'Distancia entre líneas')
  assert.ok(el.despliegue > 0 && el.despliegue < 1, 'Se despliega al aparecer')
  cerca(el.medidas.profundidad, 15, 0.05)
  cerca(el.medidas.ancho, 20, 0.05)
  assert.ok(el.centro, 'El texto va en el centro de la zona')
  // En la zona rectangular del video se miden sus cuatro esquinas (en la cancha no es un rectángulo, por la perspectiva).
  const rect = normalizarDibujo({ cancha: CANCHA, calibraciones: [CALIBRACION], objetos: [{ ...zona, puntos: [enVideo({ x: 20, y: 20 }), enVideo({ x: 35, y: 40 })], medidas: true }] }).dibujo
  assert.ok(escenaEn(rect, 11).elementos[0].medidas.profundidad > 10)
  // Sin calibrar no hay metros.
  assert.equal(escenaEn(normalizarDibujo({ objetos: [{ ...zona, medidas: true }] }).dibujo, 11).elementos[0].medidas, undefined)
})

test('zona entre líneas: se arma sola con las jugadoras de dos líneas y se estira con ellas', () => {
  assert.deepEqual(poligonoEntreLineas([{ x: 0.6, y: 0.3 }, { x: 0.2, y: 0.3 }], [{ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }]),
    [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.7, y: 0.6 }, { x: 0.3, y: 0.6 }])
  const v1 = seguida('v1', { x: 50, y: 20 }), v2 = seguida('v2', { x: 50, y: 44 })
  const d1 = seguida('d1', { x: 35, y: 18 }), d2 = seguida('d2', { x: 35, y: 46 })
  // La volante 2 se va hacia adelante: la zona se estira.
  v2.pista.claves.push({ t: 14, ...enVideo({ x: 60, y: 44 }) })
  const zl = { id: 'zl', tipo: 'zona_lineas', desde: 10, hasta: 20, color: 'amarillo', grosor: 2, lineaA: ['v1', 'v2'], lineaB: ['d1', 'd2'], medidas: true, texto: 'Entre líneas' }
  const d = normalizarDibujo({ cancha: CANCHA, calibraciones: [CALIBRACION], objetos: [v1, v2, d1, d2, zl] }).dibujo
  const en = (t) => escenaEn(d, t).elementos.find((e) => e.obj.id === 'zl')
  assert.equal(en(10).puntos.length, 4)
  cerca(en(10).medidas.profundidad, 15, 0.05)
  assert.ok(en(14).medidas.profundidad > en(10).medidas.profundidad + 4, 'Se estira con la volante que se adelanta')
  // Si una jugadora se borra, sale de la línea; si una línea queda vacía, la zona se va.
  let sin = borrarObjeto(d, 'v1')
  assert.deepEqual(sin.objetos.find((o) => o.id === 'zl').lineaA, ['v2'])
  sin = borrarObjeto(sin, 'v2')
  assert.equal(sin.objetos.some((o) => o.id === 'zl'), false)
})

// ---------- 7. Línea defensiva ----------
test('línea defensiva en metros: en línea, adelantada (umbral ajustable) y atrás; mediana como referencia', () => {
  const j = (id, x, y) => ({ id, metros: { x, y } })
  // Defienden el arco de la izquierda: adelante es +x.
  const r = estadosEnMetros([j('a', 30, 10), j('b', 30.5, 25), j('c', 33, 40), j('d', 27, 55)], { arco: 'izquierda', umbral: 2 })
  assert.deepEqual(r.filas.map((f) => f.estado), ['en_linea', 'en_linea', 'adelantada', 'atras'])
  cerca(r.referencia, 30.25)
  // Con umbral más grande, la adelantada queda en línea.
  assert.equal(estadosEnMetros([j('a', 30, 10), j('b', 30.5, 25), j('c', 33, 40)], { umbral: 3 }).filas[2].estado, 'en_linea')
  // Defienden el arco de la derecha: adelante es −x.
  assert.deepEqual(estadosEnMetros([j('a', 70, 10), j('b', 70, 30), j('c', 66, 50)], { arco: 'derecha' }).filas.map((f) => f.estado), ['en_linea', 'en_linea', 'adelantada'])
  // Con dos jugadoras, la referencia es la más retrasada.
  assert.deepEqual(estadosEnMetros([j('a', 30, 10), j('b', 34, 30)]).filas.map((f) => f.estado), ['en_linea', 'adelantada'])
})

test('línea defensiva con la cancha calibrada: colores en el video y triángulo de cobertura verde o rojo', () => {
  const defensoras = [seguida('d1', { x: 30, y: 12 }), seguida('d2', { x: 30, y: 26 }), seguida('d3', { x: 34, y: 38 }), seguida('d4', { x: 30, y: 52 })]
  const linea = { id: 'ld', tipo: 'linea_defensiva', desde: 10, hasta: 20, color: 'amarillo', grosor: 2, jugadoras: ['d1', 'd2', 'd3', 'd4'], arco: 'izquierda', umbral: 2 }
  const d = normalizarDibujo({ cancha: CANCHA, calibraciones: [CALIBRACION], objetos: [...defensoras, linea] }).dibujo
  assert.equal(d.version, 3)
  const el = escenaEn(d, 11).elementos.find((e) => e.obj.id === 'ld')
  assert.equal(el.linea.calibrada, true)
  // En el orden de la línea (a lo ancho de la cancha).
  assert.deepEqual(el.linea.puntos.map((p) => [p.id, p.estado]), [['d1', 'en_linea'], ['d2', 'en_linea'], ['d3', 'adelantada'], ['d4', 'en_linea']])
  cerca(el.linea.puntos[2].d, 4, 0.05)
  // La adelantada (d3) dejó el espacio en (30, 38): d2 está a 12 m → no llega a cubrir (rojo).
  const [tri] = el.linea.triangulos
  assert.deepEqual([tri.id, tri.vecina, tri.cubierto], ['d3', 'd2', false])
  cerca(tri.metros, 12, 0.05)
  // Los vértices vuelven al video: la compañera, el espacio y 6 m detrás.
  const enV = (m) => enVideo(m)
  for (const [v, m] of [[tri.vertices[0], { x: 30, y: 26 }], [tri.vertices[1], { x: 30, y: 38 }], [tri.vertices[2], { x: 30 - COBERTURA.fondo, y: 38 }]]) {
    cerca(v.x, enV(m).x, 0.002); cerca(v.y, enV(m).y, 0.002)
  }
  // Si la compañera está cerca del espacio (a 8 m o menos), queda cubierto (verde).
  const cerca2 = normalizarDibujo({ cancha: CANCHA, calibraciones: [CALIBRACION], objetos: [seguida('d1', { x: 30, y: 12 }), seguida('d2', { x: 30, y: 32 }), seguida('d3', { x: 34, y: 38 }), seguida('d4', { x: 30, y: 52 }), linea] }).dibujo
  assert.equal(escenaEn(cerca2, 11).elementos.find((e) => e.obj.id === 'ld').linea.triangulos[0].cubierto, true)
})

test('línea defensiva sin calibrar: la línea se dibuja igual y el estado se marca a mano', () => {
  const defensoras = [
    { id: 'd1', tipo: 'anillo', desde: 10, hasta: 20, efectos: {}, pista: { claves: [{ t: 10, x: 0.2, y: 0.6 }] } },
    { id: 'd2', tipo: 'anillo', desde: 10, hasta: 20, efectos: {}, pista: { claves: [{ t: 10, x: 0.5, y: 0.62 }] } },
    { id: 'd3', tipo: 'anillo', desde: 10, hasta: 20, efectos: {}, pista: { claves: [{ t: 10, x: 0.8, y: 0.5 }] } },
  ]
  const linea = { id: 'ld', tipo: 'linea_defensiva', desde: 10, hasta: 20, jugadoras: ['d3', 'd1', 'd2'], estados: { d3: 'adelantada', d1: 'en_linea', d2: 'cualquiera' }, cubiertas: { d3: true } }
  const d = normalizarDibujo({ objetos: [...defensoras, linea] }).dibujo
  // Solo se guarda lo que no es «en línea».
  assert.deepEqual(d.objetos[3].estados, { d3: 'adelantada' })
  const el = escenaEn(d, 11).elementos.find((e) => e.obj.id === 'ld')
  assert.equal(el.linea.calibrada, false)
  assert.deepEqual(el.linea.puntos.map((p) => [p.id, p.estado]), [['d1', 'en_linea'], ['d2', 'en_linea'], ['d3', 'adelantada']], 'De izquierda a derecha en el video')
  assert.equal(el.linea.triangulos.length, 1)
  assert.equal(el.linea.triangulos[0].cubierto, true)
  // Sin la marca de cubierta, el triángulo es rojo.
  const sinMarca = normalizarDibujo({ objetos: [...defensoras, { ...linea, cubiertas: {} }] }).dibujo
  assert.equal(escenaEn(sinMarca, 11).elementos.find((e) => e.obj.id === 'ld').linea.triangulos[0].cubierto, false)
  // Con una sola jugadora no hay línea: se borra.
  assert.equal(normalizarDibujo({ objetos: [defensoras[0], linea] }).dibujo.objetos.some((o) => o.tipo === 'linea_defensiva'), false)
  // Línea de volantes: mismo dibujo, otro nombre.
  assert.equal(normalizarDibujo({ objetos: [...defensoras, { ...linea, rol: 'volantes' }] }).dibujo.objetos[3].rol, 'volantes')
  // Sin calibrar pero el estado de jugadoras: la escena funciona sin aVideo.
  assert.deepEqual(lineaDefensivaEn([{ id: 'x', video: { x: 0, y: 0 }, metros: null }], {}).puntos.length, 1)
})

// ---------- 8. Cámara lenta ----------
test('cámara lenta: entra al tramo, pide 0,5x o 0,25x y al salir devuelve la velocidad que había', () => {
  const lentos = normalizarDibujo({ lentos: [{ id: 'l1', desde: 12, hasta: 13, velocidad: 0.25 }, { desde: 15, hasta: 15.1 }, { desde: 12.5, hasta: 14 }] }).dibujo.lentos
  assert.deepEqual(lentos, [{ id: 'l1', desde: 12, hasta: 13, velocidad: 0.25 }], 'Sin tramos muy cortos ni superpuestos')
  assert.equal(lentoEn(lentos, 12.5).id, 'l1')
  assert.equal(lentoEn(lentos, 13), null)
  const c = crearControlLento()
  assert.equal(c.paso({ t: 11.9, reproduciendo: true, velocidad: 1.5, ahora: 0 }, lentos), null)
  assert.equal(c.paso({ t: 12.1, reproduciendo: true, velocidad: 1.5, ahora: 10 }, lentos), 0.25)
  assert.equal(c.paso({ t: 12.15, reproduciendo: true, velocidad: 1.5, ahora: 20 }, lentos), null, 'No repite el pedido mientras YouTube lo aplica')
  assert.equal(c.paso({ t: 12.2, reproduciendo: true, velocidad: 0.25, ahora: 40 }, lentos), null)
  assert.equal(c.paso({ t: 12.4, reproduciendo: false, velocidad: 0.25, ahora: 50 }, lentos), null, 'En pausa no cambia nada')
  assert.equal(c.paso({ t: 13.05, reproduciendo: true, velocidad: 0.25, ahora: 900 }, lentos), 1.5, 'Al salir vuelve a la que había')
  assert.equal(c.paso({ t: 13.2, reproduciendo: true, velocidad: 1.5, ahora: 950 }, lentos), null)
  // Agregar un tramo desde el cuadro actual: 2 s o hasta el siguiente.
  const r = agregarLento({ clip: { inicio: 10, fin: 20 }, lentos }, 11)
  assert.deepEqual(r.dibujo.lentos.map((l) => [l.desde, l.hasta, l.velocidad]), [[11, 12, 0.5], [12, 13, 0.25]])
  assert.equal(agregarLento(r.dibujo, 12.5).id, null, 'Ya hay un tramo ahí')
  assert.equal(escenaEn({ objetos: [], lentos }, 12.5).lento, 0.25)
})

// ---------- 9. Pausa explicativa ----------
test('pausa explicativa: pausa, foco y subtítulo en el cuadro actual', () => {
  const clip = { inicio: 10, fin: 20 }
  const a = seguida('a', { x: 30, y: 30 }, { jugadora: { id: 'j1', nombre: 'Ana', dorsal: '7', foto: '' } })
  const base = { version: 1, clip, objetos: [a], pausas: [], subtitulos: [] }
  const r = pausaExplicativa(base, 12, { seguida: a })
  assert.deepEqual(r.dibujo.pausas.map((p) => [p.t, p.duracion]), [[12, 3]])
  const foco = r.dibujo.objetos.find((o) => o.id === r.foco)
  assert.equal(foco.tipo, 'foco')
  assert.deepEqual(foco.pista.claves, a.pista.claves, 'El foco sigue a la jugadora tocada')
  assert.equal(foco.en2d, false)
  assert.deepEqual([foco.desde, foco.hasta], [12, 13.5])
  assert.deepEqual(r.dibujo.subtitulos.map((s) => [s.desde, s.hasta, s.texto]), [[12, 13.5, 'Escribí la explicación']])
  // En un punto sin jugadora: foco en una zona redonda; con subtítulo ya puesto, usa ese.
  const conSub = { ...base, subtitulos: [{ id: 's1', desde: 11, hasta: 14, texto: 'Ya estaba' }] }
  const p = pausaExplicativa(conSub, 12, { punto: { x: 0.3, y: 0.4 } })
  assert.equal(p.dibujo.objetos.find((o) => o.id === p.foco).tipo, 'foco_zona')
  assert.equal(p.subtitulo, 's1')
  assert.equal(p.dibujo.subtitulos.length, 1)
})

// ---------- Compatibilidad ----------
test('compatibilidad: los dibujos de las versiones 1 y 2 se leen igual y no cambian de versión', () => {
  const v1 = {
    version: 1, clip: { inicio: 10, fin: 14 }, pausas: [{ id: 'p1', t: 11, duracion: 3 }], subtitulos: [{ id: 's1', desde: 10, hasta: 12, texto: 'Salida' }],
    objetos: [
      { id: 'a', tipo: 'anillo', desde: 10, hasta: 14, color: 'amarillo', grosor: 2, efectos: { entrada: true, pulso: false, sombra: true, rastro: false }, pista: { fuente: 'manual', claves: [{ t: 10, x: 0.4, y: 0.5 }] } },
      { id: 'b', tipo: 'pase_bajo', desde: 10, hasta: 13, color: 'blanco', grosor: 2, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] },
      { id: 'z', tipo: 'zona', desde: 10, hasta: 13, color: 'azul', grosor: 1, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] },
    ],
  }
  const leido = normalizarDibujo(v1).dibujo
  assert.equal(leido.version, 1)
  assert.deepEqual(leido, v1, 'Se lee tal cual')
  assert.deepEqual(normalizarDibujo(leido).dibujo, leido)
  // La flecha vieja aparece entera; la zona vieja no se mueve.
  const e = escenaEn(leido, 10)
  assert.equal(e.elementos.find((x) => x.obj.id === 'b').progreso, undefined)
  assert.deepEqual(e.elementos.find((x) => x.obj.id === 'z').puntos, v1.objetos[2].puntos)
  assert.equal(e.lento, null)
  // Versión 2 (cancha calibrada y ficha) sigue siendo 2.
  const v2 = normalizarDibujo({ ...v1, version: 2, cancha: CANCHA, calibraciones: [CALIBRACION], objetos: [...v1.objetos, { id: 'f', tipo: 'ficha', desde: 10, hasta: 14, t: 11, punto: { x: 0.5, y: 0.5 }, jugadora: { rival: true, dorsal: '9', nombre: '' } }] }).dibujo
  assert.equal(v2.version, 2)
  // Usar algo nuevo sube a 3; la app entiende hasta la 3.
  assert.equal(normalizarDibujo({ ...v1, lentos: [{ desde: 11, hasta: 12, velocidad: 0.5 }] }).dibujo.version, 3)
  assert.equal(normalizarDibujo({ ...v1, objetos: [{ ...v1.objetos[2], texto: 'Espacio libre' }] }).dibujo.version, 3)
  assert.equal(VERSION_DIBUJO, 3)
  assert.equal(normalizarDibujo({ version: 4 }).ok, false)
  // Datos raros de la versión 3 no rompen nada.
  const raro = normalizarDibujo({ version: 3, objetos: [
    { id: 'x', tipo: 'opciones_pase', desde: 10, hasta: 12, pasadora: null, receptora: { punto: { x: 0, y: 0 } } },
    { id: 'y', tipo: 'foco_zona', desde: 10, hasta: 12, claves: [] },
    { id: 'w', tipo: 'zona_lineas', desde: 10, hasta: 12, lineaA: ['nadie'], lineaB: [] },
    { id: 'v', tipo: 'zona', desde: 10, hasta: 12, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }], claves: [{ t: 11, puntos: [{ x: 0, y: 0 }] }] },
  ], lentos: 'muchos' })
  assert.equal(raro.ok, true)
  assert.deepEqual(raro.dibujo.objetos.map((o) => o.id), ['v'])
  assert.equal(raro.dibujo.objetos[0].claves, undefined, 'Una clave con otra cantidad de puntos se descarta')
})

// ---------- Herramientas, teclas y ayudas ----------
test('herramientas nuevas: teclas sin choques, ayuda y qué hacer ahora', () => {
  const teclas = [...HERRAMIENTAS, ...ACCIONES_RAPIDAS].map((h) => h.tecla)
  assert.equal(new Set(teclas).size, teclas.length, 'Ninguna tecla repetida')
  const tecla = (key) => ordenTeclaEditor({ key, target: { tagName: 'DIV' } })
  assert.deepEqual(['h', 'z', 'i', 'w', 'd'].map(tecla), ['herramienta:reflector', 'herramienta:foco_zona', 'herramienta:opciones_pase', 'herramienta:zona_lineas', 'herramienta:linea_defensiva'])
  assert.deepEqual(['j', 'x'].map(tecla), ['lento', 'explicar'])
  assert.equal(ordenTeclaEditor({ key: 'd', ctrlKey: true, target: { tagName: 'DIV' } }), 'duplicar', 'Ctrl+D sigue siendo duplicar')
  for (const id of ['reflector', 'foco_zona', 'opciones_pase', 'zona_lineas', 'linea_defensiva', 'lento', 'explicar']) assert.ok(ayudaHerramienta(id), id)
  assert.equal(instruccion({ herramienta: 'opciones_pase' }), '1) Tocá a la jugadora que tenía la pelota.')
  assert.equal(instruccion({ herramienta: 'opciones_pase', opciones: { paso: 'pasadora', pasadora: '#7 Ana' } }), '1) Tocá a #7 Ana, la jugadora que tenía la pelota.')
  assert.equal(instruccion({ herramienta: 'opciones_pase', opciones: { paso: 'receptora' } }), '2) Ahora tocá a la que recibió el pase que salió mal.')
  assert.match(instruccion({ herramienta: 'opciones_pase', opciones: { paso: 'opciones', n: 2 } }), /van 2\)/)
  assert.match(instruccion({ herramienta: 'zona_lineas', grupo: { paso: 'B', n: 3 } }), /otra línea .* Van 3/)
  assert.match(instruccion({ herramienta: 'linea_defensiva', grupo: { n: 1 } }), /Van 1/)
  assert.match(instruccion({ herramienta: 'seleccionar', explicando: true }), /^Pausa explicativa/)
})

// ---------- Pizarra 2D ----------
test('pizarra 2D: línea defensiva con estados y cobertura, zona entre líneas, opciones de pase y metros', async () => {
  const { aJugadaPizarra, elementosFijos, jugadoras2d, vista2dEn } = await import('../src/utils/analisis/dibujos/pizarra2d.js')
  const defensoras = [seguida('d1', { x: 30, y: 12 }), seguida('d2', { x: 30, y: 26 }), seguida('d3', { x: 34, y: 38 }), seguida('d4', { x: 30, y: 52 })]
  const volantes = [seguida('v1', { x: 45, y: 20 }), seguida('v2', { x: 45, y: 44 })]
  const ref = { ...seguida('r', { x: 40, y: 30 }), tipo: 'reflector', luz: { color: 'blanco', intensidad: 0.6, ancho: 1 } }
  const objetos = [
    ...defensoras, ...volantes, ref,
    { id: 'ld', tipo: 'linea_defensiva', desde: 10, hasta: 20, color: 'amarillo', grosor: 2, jugadoras: ['d1', 'd2', 'd3', 'd4'], arco: 'izquierda', umbral: 2 },
    { id: 'zl', tipo: 'zona_lineas', desde: 10, hasta: 20, color: 'blanco', grosor: 2, lineaA: ['v1', 'v2'], lineaB: ['d1', 'd4'], medidas: true, texto: 'Entre líneas' },
    { id: 'op', tipo: 'opciones_pase', desde: 10, hasta: 14, color: 'rojo', grosor: 2, pasadora: { punto: enVideo({ x: 40, y: 30 }), seguir: 'r' }, receptora: { punto: enVideo({ x: 60, y: 10 }) }, opciones: [{ punto: enVideo({ x: 50, y: 50 }) }] },
  ]
  const d = normalizarDibujo({ cancha: CANCHA, calibraciones: [CALIBRACION], objetos }).dibujo
  // El reflector también es una ficha (y lleva el foco de la 2D).
  assert.ok(jugadoras2d(d).some((o) => o.id === 'r'))
  const v = vista2dEn(d, 11)
  assert.equal(v.foco?.id, 'r')
  const ids = v.doc.elementos.map((e) => e.id)
  // Línea: tres tramos (cuatro defensoras), el estado de la adelantada y su triángulo de cobertura (rojo: no llega).
  assert.deepEqual(ids.filter((i) => /^ld-s/.test(i)), ['ld-s1', 'ld-s2', 'ld-s3'])
  const estado = v.doc.elementos.find((e) => e.id === 'ld-e-d3')
  assert.equal(estado.texto, '+4,0 m')
  assert.equal(v.doc.elementos.find((e) => e.id === 'ld-c-d3').color, '#EF4444')
  // Zona entre líneas con su texto y metros entre las dos líneas (45 − 30 = 15 m).
  assert.equal(v.doc.elementos.find((e) => e.id === 'zl').tipo, 'sombra')
  assert.equal(v.doc.elementos.find((e) => e.id === 'zl-t').texto, 'Entre líneas')
  assert.equal(v.doc.elementos.find((e) => e.id === 'zl-m').texto, 'Entre líneas 15 m')
  // Opciones de pase: pase rojo, opción verde punteada con su número.
  const fijos = elementosFijos(d)
  assert.deepEqual(fijos.filter((f) => f.elemento.id.startsWith('op')).map((f) => [f.elemento.id, f.elemento.tipo, f.elemento.color]),
    [['op', 'pase', '#EF4444'], ['op-o1', 'punteada', '#3ECF6E'], ['op-n1', 'texto', '#3ECF6E']])
  // La jugada exportada a la Pizarra sigue siendo válida.
  const doc = aJugadaPizarra(d, { titulo: 'Línea' })
  assert.ok(doc.elementos.some((e) => e.id === 'op-o1'))
})

test('pausas: al terminar, mientras el video sigue en ese cuadro, la animación queda como al final (no vuelve a empezar)', async () => {
  const { crearEstadoPausas, pasoPausas } = await import('../src/utils/analisis/dibujos/pausas.js')
  const pausas = [{ id: 'p1', t: 31, duracion: 3 }]
  let e = pasoPausas(crearEstadoPausas(), { t: 30.9, reproduciendo: true, ahora: 0 }, pausas).estado
  let r = pasoPausas(e, { t: 31.02, reproduciendo: true, ahora: 50 }, pausas)
  assert.equal(r.orden.tipo, 'pausar')
  r = pasoPausas(r.estado, { t: 31, reproduciendo: false, ahora: 3060 }, pausas)
  assert.equal(r.orden.tipo, 'reanudar')
  assert.deepEqual(r.posPausa, { t: 31, transcurrido: 3 })
  // YouTube todavía en 31: sigue «terminada»; la edad del dibujo que aparece en 31 no vuelve a cero.
  r = pasoPausas(r.estado, { t: 31, reproduciendo: true, ahora: 3100 }, pausas)
  assert.deepEqual(r.posPausa, { t: 31, transcurrido: 3 })
  cerca(edadEn(pausas, 31, 31, r.posPausa), 3)
  r = pasoPausas(r.estado, { t: 31.1, reproduciendo: true, ahora: 3200 }, pausas)
  assert.equal(r.posPausa, null)
  cerca(edadEn(pausas, 31, 31.1), 3.1)
})
