// Etapa 4 de Análisis: lógica pura de los dibujos (formato, coordenadas, interpolación, pausas, reloj, deshacer).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aPixeles, aRelativo, cuadroVideo, simplificarTrazo } from '../src/utils/analisis/dibujos/coordenadas.js'
import { LIMITES, VERSION_DIBUJO, dibujoVacio, excedeTamano, normalizarDibujo } from '../src/utils/analisis/dibujos/formato.js'
import { agregarClave, posicionEn, quitarClave, recorrido } from '../src/utils/analisis/dibujos/interpolacion.js'

const leer = (r) => readFileSync(new URL('../' + r, import.meta.url), 'utf8')
import { crearEstadoPausas, pasoPausas } from '../src/utils/analisis/dibujos/pausas.js'
import { crearRelojSuave } from '../src/utils/analisis/dibujos/reloj.js'
import { aplicar, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, reemplazar, rehacer } from '../src/utils/analisis/dibujos/historial.js'
import { escenaEn, rebote, transformZoom, zoomEn } from '../src/utils/analisis/dibujos/escena.js'
import {
  agregarObjeto, agregarPausa, agregarSubtitulo, borrarObjeto, crearObjeto, duplicarObjeto, marcarPosicion, moverObjeto,
} from '../src/utils/analisis/dibujos/operaciones.js'

const cerca = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`)

test('coordenadas relativas: clic → 0..1 → píxeles en otra pantalla da el mismo lugar', () => {
  const chica = { izquierda: 100, arriba: 50, ancho: 640, alto: 360 }
  const p = aRelativo(100 + 160, 50 + 270, chica)
  assert.deepEqual(p, { x: 0.25, y: 0.75 })
  assert.deepEqual(aPixeles(p, { ancho: 1920, alto: 1080 }), { x: 480, y: 810 })
  // Fuera del cuadro se recorta al borde.
  assert.deepEqual(aRelativo(0, 9999, chica), { x: 0, y: 1 })
  assert.deepEqual(aRelativo(10, 10, { ancho: 0, alto: 0 }), { x: 0, y: 0 })
})

test('cuadro del video: con franjas negras si el contenedor no es 16:9', () => {
  assert.deepEqual(cuadroVideo(1600, 900), { izquierda: 0, arriba: 0, ancho: 1600, alto: 900 })
  const ancho = cuadroVideo(1920, 900) // más ancho: franjas a los costados
  cerca(ancho.ancho, 1600); cerca(ancho.izquierda, 160); assert.equal(ancho.arriba, 0)
  const alto = cuadroVideo(1600, 1000) // monitor 16:10: franjas arriba y abajo
  cerca(alto.alto, 900); cerca(alto.arriba, 50); assert.equal(alto.izquierda, 0)
})

test('trazo libre: se simplifica sin perder el primero ni el último', () => {
  const pts = Array.from({ length: 500 }, (_, i) => ({ x: i / 500, y: 0.5 }))
  const s = simplificarTrazo(pts, 0.012, 60)
  assert.ok(s.length <= 60 && s.length >= 2)
  assert.deepEqual(s[0], pts[0]); assert.deepEqual(s[s.length - 1], pts[499])
})

test('interpolación: pasa por cada punto clave, queda quieta antes y después, y es suave entre medio', () => {
  const claves = [{ t: 10, x: 0.1, y: 0.5 }, { t: 11, x: 0.3, y: 0.5 }, { t: 12, x: 0.5, y: 0.6 }, { t: 14, x: 0.5, y: 0.9 }]
  for (const c of claves) { const p = posicionEn(claves, c.t); cerca(p.x, c.x); cerca(p.y, c.y) }
  assert.deepEqual(posicionEn(claves, 5), { x: 0.1, y: 0.5 })
  assert.deepEqual(posicionEn(claves, 99), { x: 0.5, y: 0.9 })
  // A mitad de camino entre dos puntos en línea recta, queda en el medio.
  const medio = posicionEn([{ t: 0, x: 0, y: 0 }, { t: 2, x: 1, y: 1 }], 1)
  cerca(medio.x, 0.5); cerca(medio.y, 0.5)
  // Continuidad: dos instantes muy cercanos dan posiciones muy cercanas.
  const a = posicionEn(claves, 11.999), b = posicionEn(claves, 12.001)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.002)
  assert.equal(posicionEn([], 3), null)
  const r = recorrido(claves, 10, 11, 0.25)
  assert.equal(r.length, 5); cerca(r[4].x, 0.3)
})

test('puntos clave: un clic en el mismo cuadro reemplaza; se ordenan; quitar nunca deja la pista vacía', () => {
  let c = agregarClave([], { t: 12, x: 0.5, y: 0.5 })
  c = agregarClave(c, { t: 10, x: 0.1, y: 0.1 })
  c = agregarClave(c, { t: 12.02, x: 0.6, y: 0.6 })
  assert.deepEqual(c.map((k) => k.t), [10, 12.02])
  assert.equal(c[1].x, 0.6)
  c = agregarClave(c, { t: 11, x: 2, y: -1 })
  assert.deepEqual(c[1], { t: 11, x: 1, y: 0 })
  c = quitarClave(c, 11.01)
  assert.deepEqual(c.map((k) => k.t), [10, 12.02])
  assert.equal(quitarClave([{ t: 1, x: 0, y: 0 }], 1).length, 1)
})

const lectura = (t, ahora, reproduciendo = true) => ({ t, ahora, reproduciendo })

test('pausas: congela al cruzar, reanuda a los N segundos y no se repite en la misma pasada', () => {
  const pausas = [{ id: 'p1', t: 20, duracion: 3 }]
  let e = crearEstadoPausas()
  let r = pasoPausas(e, lectura(19.8, 0), pausas); e = r.estado
  assert.equal(r.orden, null)
  r = pasoPausas(e, lectura(20.05, 250), pausas); e = r.estado
  assert.deepEqual(r.orden, { tipo: 'pausar', t: 20 })
  assert.equal(r.tiempo, 20)
  r = pasoPausas(e, lectura(20.05, 1500, false), pausas); e = r.estado
  assert.equal(r.orden, null); assert.equal(r.tiempo, 20); cerca(r.pausa.restante, 1.75)
  r = pasoPausas(e, lectura(20, 3300, false), pausas); e = r.estado
  assert.deepEqual(r.orden, { tipo: 'reanudar' })
  r = pasoPausas(e, lectura(20.1, 3400), pausas); e = r.estado
  r = pasoPausas(e, lectura(20.3, 3600), pausas)
  assert.equal(r.orden, null, 'Ya se hizo en esta pasada')
})

test('pausas: un salto no la dispara; volver atrás la rearma; reproducir durante la pausa la termina', () => {
  const pausas = [{ id: 'p1', t: 20, duracion: 3 }]
  let e = crearEstadoPausas()
  e = pasoPausas(e, lectura(5, 0), pausas).estado
  let r = pasoPausas(e, lectura(25, 100), pausas) // salto de 20 s
  assert.equal(r.orden, null); e = r.estado
  // Pausado no se dispara.
  e = pasoPausas(e, lectura(19.9, 200, false), pausas).estado
  r = pasoPausas(e, lectura(20.1, 300, false), pausas)
  assert.equal(r.orden, null); e = r.estado
  // Vuelve antes (repetir clip) y pasa reproduciendo.
  e = pasoPausas(e, lectura(18, 400), pausas).estado
  e = pasoPausas(e, lectura(19.4, 500), pausas).estado
  r = pasoPausas(e, lectura(20.02, 600), pausas); e = r.estado
  assert.equal(r.orden.tipo, 'pausar')
  e = pasoPausas(e, lectura(20, 700, false), pausas).estado
  r = pasoPausas(e, lectura(20.2, 1500, true), pausas)
  assert.equal(r.orden, null); assert.equal(r.pausa, null); assert.equal(r.estado.retenida, null)
  // Repetir el clip otra vez: la rearma.
  e = pasoPausas(r.estado, lectura(15, 1600), pausas).estado
  e = pasoPausas(e, lectura(19.95, 1700), pausas).estado
  assert.equal(pasoPausas(e, lectura(20.05, 1800), pausas).orden.tipo, 'pausar')
})

test('pausas: dos pausas seguidas se hacen las dos, en orden', () => {
  const pausas = [{ id: 'a', t: 10, duracion: 1 }, { id: 'b', t: 10.3, duracion: 1 }]
  let e = pasoPausas(crearEstadoPausas(), lectura(9.9, 0), pausas).estado
  let r = pasoPausas(e, lectura(10.5, 100), pausas)
  assert.deepEqual(r.orden, { tipo: 'pausar', t: 10 })
  r = pasoPausas(r.estado, lectura(10, 1200, false), pausas)
  assert.deepEqual(r.orden, { tipo: 'reanudar' })
  r = pasoPausas(r.estado, lectura(10.35, 1300), pausas)
  assert.deepEqual(r.orden, { tipo: 'pausar', t: 10.3 })
})

test('reloj suave: estima entre lecturas, se reacomoda en un salto y no retrocede por redondeo', () => {
  const r = crearRelojSuave()
  assert.equal(r.muestra(10, { reproduciendo: true, ahora: 0 }), 10)
  cerca(r.muestra(10, { reproduciendo: true, ahora: 100 }), 10.1)
  cerca(r.muestra(10.25, { reproduciendo: true, ahora: 250 }), 10.25)
  cerca(r.muestra(10.2, { reproduciendo: true, ahora: 260 }), 10.26, 0.02)
  // Salto hacia adelante.
  assert.equal(r.muestra(40, { reproduciendo: true, ahora: 300 }), 40)
  // Al doble de velocidad.
  const r2 = crearRelojSuave()
  r2.muestra(0, { reproduciendo: true, velocidad: 2, ahora: 0 })
  cerca(r2.muestra(0, { reproduciendo: true, velocidad: 2, ahora: 100 }), 0.2)
  // En pausa, lo que dice YouTube.
  assert.equal(r2.muestra(7, { reproduciendo: false, ahora: 200 }), 7)
})

test('deshacer y rehacer: pasos, rama nueva, arrastre como un solo paso y límite', () => {
  let h = crearHistorial('a')
  assert.equal(puedeDeshacer(h), false)
  h = aplicar(h, 'b'); h = aplicar(h, 'c')
  h = deshacer(h); assert.equal(h.presente, 'b'); assert.equal(puedeRehacer(h), true)
  h = rehacer(h); assert.equal(h.presente, 'c')
  h = deshacer(deshacer(h)); assert.equal(h.presente, 'a')
  h = deshacer(h); assert.equal(h.presente, 'a', 'No hay más para deshacer')
  h = aplicar(h, 'x'); assert.equal(puedeRehacer(h), false, 'Un cambio nuevo borra lo que había para rehacer')
  // Arrastre: un aplicar al empezar y reemplazar mientras se mueve = un solo paso.
  h = aplicar(h, 'm1'); h = reemplazar(h, 'm2'); h = reemplazar(h, 'm3')
  h = deshacer(h); assert.equal(h.presente, 'x')
  let largo = crearHistorial(0, 5)
  for (let i = 1; i <= 10; i++) largo = aplicar(largo, i)
  assert.equal(largo.pasado.length, 5)
  assert.equal(aplicar(largo, 10), largo, 'Sin cambio no suma paso')
})

test('formato: recorta, ordena, completa ids y deja afuera lo inválido', () => {
  const { ok, dibujo } = normalizarDibujo({
    version: 1,
    clip: { inicio: 10, fin: 20 },
    objetos: [
      { id: 'o1', tipo: 'pase_bajo', desde: 11, hasta: 13, color: 'violeta', grosor: 9, puntos: [{ x: -1, y: 0.5 }, { x: 0.5, y: 2 }] },
      { id: 'o1', tipo: 'linea', desde: 12, hasta: 11, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      { tipo: 'pase_alto', puntos: [{ x: 0.1, y: 0.1 }] },
      { id: 'j', tipo: 'anillo', desde: 10, hasta: 20, pista: { fuente: 'ia', claves: [{ t: 15, x: 0.5, y: 0.5 }, { t: 12, x: 0.2, y: 0.4 }] } },
      { id: 'sin', tipo: 'foco', pista: { claves: [] } },
      { id: 'e', tipo: 'enlace', a: 'j', b: 'nadie' },
      { id: 'z', tipo: 'zoom', desde: 10, hasta: 12, escala: 50, seguir: 'nadie' },
      { tipo: 'cohete' },
      { id: 't', tipo: 'texto', puntos: [{ x: 0.5, y: 0.5 }], texto: '   ' },
    ],
    pausas: [{ t: 18, duracion: 100 }, { t: 12 }, { t: 'x' }],
    subtitulos: [{ desde: 15, hasta: 12, texto: 'mal' }, { desde: 10, hasta: 15, texto: '  Salida  ' }],
  })
  assert.equal(ok, true)
  assert.deepEqual(dibujo.objetos.map((o) => o.id), ['o1', 'o2', 'j', 'z'])
  const [pase, linea, anillo, zoom] = dibujo.objetos
  assert.deepEqual(pase.puntos, [{ x: 0, y: 0.5 }, { x: 0.5, y: 1 }])
  assert.equal(pase.color, 'amarillo'); assert.equal(pase.grosor, 2)
  assert.ok(linea.hasta > linea.desde)
  assert.deepEqual(anillo.pista.claves.map((c) => c.t), [12, 15])
  assert.equal(anillo.pista.fuente, 'ia', 'Los puntos clave pueden venir de otra fuente')
  assert.equal(zoom.escala, 4); assert.equal(zoom.seguir, null)
  assert.deepEqual(dibujo.pausas.map((p) => [p.t, p.duracion]), [[12, 3], [18, 20]])
  assert.deepEqual(dibujo.subtitulos.map((s) => s.texto), ['Salida'])
  // Sin nada de la etapa 5, sigue siendo versión 1 (la más nueva que entiende la app es VERSION_DIBUJO).
  assert.equal(dibujo.version, 1)
  assert.ok(VERSION_DIBUJO >= 1)
})

test('formato: versión nueva no se dibuja; basura da un dibujo vacío; tamaño máximo', () => {
  const nueva = normalizarDibujo({ version: VERSION_DIBUJO + 1, objetos: [] })
  assert.equal(nueva.ok, false); assert.match(nueva.aviso, /versión más nueva/)
  assert.deepEqual(normalizarDibujo(null).dibujo, dibujoVacio())
  assert.deepEqual(normalizarDibujo([1, 2]).dibujo, dibujoVacio())
  const muchos = normalizarDibujo({ version: 1, objetos: Array.from({ length: 500 }, () => ({ tipo: 'linea', puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })) })
  assert.equal(muchos.dibujo.objetos.length, LIMITES.objetos)
  const grande = { ...dibujoVacio(), objetos: [{ texto: 'x'.repeat(LIMITES.bytes) }] }
  assert.equal(excedeTamano(grande), true)
  assert.equal(excedeTamano(dibujoVacio()), false)
})

test('escena: visibilidad, entrada con rebote, enlace entre dos y subtítulo por tramo', () => {
  const { dibujo } = normalizarDibujo({
    version: 1,
    objetos: [
      { id: 'a', tipo: 'anillo', desde: 10, hasta: 20, efectos: { entrada: true, rastro: true }, pista: { claves: [{ t: 10, x: 0.1, y: 0.1 }, { t: 12, x: 0.3, y: 0.1 }] } },
      { id: 'b', tipo: 'nombre', desde: 10, hasta: 20, pista: { claves: [{ t: 10, x: 0.9, y: 0.9 }] }, jugadora: { rival: true, dorsal: '9' } },
      { id: 'e', tipo: 'enlace', desde: 11, hasta: 13, a: 'a', b: 'b' },
      { id: 'f', tipo: 'foco', desde: 10, hasta: 20, pista: { claves: [{ t: 10, x: 0.5, y: 0.5 }] } },
      { id: 'l', tipo: 'linea', desde: 15, hasta: 16, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ],
    subtitulos: [{ desde: 10, hasta: 12, texto: 'Paso 1' }, { desde: 12, hasta: 14, texto: 'Paso 2' }],
  })
  const e = escenaEn(dibujo, 11)
  assert.equal(e.elementos[0].obj.tipo, 'foco', 'El foco se pinta primero')
  assert.deepEqual(e.elementos.map((x) => x.obj.id).sort(), ['a', 'b', 'e', 'f'])
  const enlace = e.elementos.find((x) => x.obj.id === 'e')
  cerca(enlace.a.x, 0.2, 0.02); cerca(enlace.b.x, 0.9)
  assert.ok(e.elementos.find((x) => x.obj.id === 'a').rastro.length > 2)
  assert.equal(e.subtitulo, 'Paso 1')
  assert.equal(escenaEn(dibujo, 12).subtitulo, 'Paso 2')
  assert.equal(escenaEn(dibujo, 14).subtitulo, '')
  // Entrada: chico al aparecer, se pasa un poco y termina en su tamaño.
  assert.equal(escenaEn(dibujo, 10).elementos.find((x) => x.obj.id === 'a').escala, 0)
  assert.ok(Math.max(...[0.5, 0.6, 0.7, 0.8].map(rebote)) > 1)
  assert.equal(rebote(1), 1)
  // La línea elegida se ve (tenue) aunque no sea su momento; si no está elegida, no.
  assert.equal(escenaEn(dibujo, 11).elementos.some((x) => x.obj.id === 'l'), false)
  assert.equal(escenaEn(dibujo, 11, { elegidoId: 'l' }).elementos.find((x) => x.obj.id === 'l').fuera, true)
  // Vista previa y reproducción (playlists, video de Análisis) no pasan elegido: fuera de su tramo no se ve.
  assert.match(leer('src/components/analisis/dibujo/EditorDibujo.jsx'), /elegidoId: vistaPrevia \? null :/)
  assert.doesNotMatch(leer('src/components/analisis/dibujo/CapaReproduccion.jsx'), /elegidoId/)
  // En el editor se ve punteado.
  assert.match(leer('src/components/analisis/dibujo/CapaDibujos.jsx'), /className=\{el\.fuera \? 'dib-fuera'/)
  assert.match(leer('src/components/analisis/dibujo/dibujo.css'), /\.dib-fuera \* \{ stroke-dasharray/)
})

test('interfaz de YouTube recortada con el video pausado por nosotros', () => {
  const css = leer('src/components/analisis/dibujo/dibujo.css')
  // Mismo ancho, más alto: el video queda en su lugar y título/compartir/logo/«Más videos» quedan afuera.
  assert.match(css, /\.dib-zoom\.dib-sin-interfaz > iframe[\s\S]*\.dib-zoom\[data-pausa-dibujo='si'\] > div \{ top: -60%; bottom: auto; height: 220%; \}/)
  assert.match(leer('src/components/analisis/dibujo/EditorDibujo.jsx'), /className="dib-zoom dib-sin-interfaz"/)
  assert.match(leer('src/components/analisis/ReproductorPlaylist.jsx'), /listo && !reproduciendo \? 'dib-zoom dib-sin-interfaz'/)
  assert.match(leer('src/components/analisis/dibujo/CapaReproduccion.jsx'), /pausaDibujo = vista\.pausa !== null/)
  assert.match(leer('src/components/analisis/dibujo/apoyo.js'), /el\.dataset\.pausaDibujo = 'si'/)
})

test('zoom de cámara: entra suave, sigue a la jugadora y vuelve al plano general', () => {
  const { dibujo } = normalizarDibujo({
    version: 1,
    objetos: [
      { id: 'j', tipo: 'anillo', desde: 0, hasta: 30, pista: { claves: [{ t: 10, x: 0.2, y: 0.3 }, { t: 14, x: 0.6, y: 0.3 }] } },
      { id: 'z', tipo: 'zoom', desde: 10, hasta: 14, escala: 2, seguir: 'j' },
    ],
  })
  assert.equal(zoomEn(dibujo, 9.9), null)
  assert.equal(zoomEn(dibujo, 10), null, 'Arranca en el plano general')
  cerca(zoomEn(dibujo, 12).escala, 2)
  cerca(zoomEn(dibujo, 12).origen.x, 0.4, 0.05)
  assert.ok(zoomEn(dibujo, 10.3).escala < 2)
  assert.equal(zoomEn(dibujo, 14), null, 'Termina en el plano general')
  assert.deepEqual(transformZoom(null), { transform: 'none', transformOrigin: '50% 50%' })
  assert.match(transformZoom({ escala: 2, origen: { x: 0.25, y: 0.5 } }).transformOrigin, /^25\.00% 50\.00%$/)
})

test('operaciones del editor: crear, marcar posiciones, mover, duplicar, borrar con enlaces y pausas', () => {
  const clip = { inicio: 100, fin: 112 }
  let d = dibujoVacio(clip)
  const pase = crearObjeto('pase_bajo', { t: 101, clip, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }], usados: [] })
  assert.deepEqual([pase.desde, pase.hasta], [101, 104])
  d = agregarObjeto(d, pase)
  const anillo = crearObjeto('anillo', { t: 102, clip, puntos: [{ x: 0.5, y: 0.5 }], usados: d.objetos.map((o) => o.id) })
  assert.equal(anillo.hasta, 112, 'El seguimiento dura hasta el fin del clip')
  d = agregarObjeto(d, anillo)
  d = marcarPosicion(d, anillo.id, 104, { x: 0.7, y: 0.5 })
  d = marcarPosicion(d, anillo.id, 101.5, { x: 0.4, y: 0.5 })
  const a = d.objetos.find((o) => o.id === anillo.id)
  assert.deepEqual(a.pista.claves.map((c) => c.t), [101.5, 102, 104])
  assert.equal(a.desde, 101.5, 'Un clic antes estira cuándo aparece')
  d = moverObjeto(d, pase.id, 0.1, 0)
  assert.deepEqual(d.objetos[0].puntos.map((p) => p.x), [0.2, 0.5])
  const dup = duplicarObjeto(d, anillo.id)
  d = dup.dibujo
  assert.equal(d.objetos.length, 3); assert.notEqual(dup.id, anillo.id)
  d = agregarObjeto(d, { ...crearObjeto('enlace', { t: 102, clip, usados: d.objetos.map((o) => o.id) }), a: anillo.id, b: dup.id })
  const z = crearObjeto('zoom', { t: 102, clip, usados: d.objetos.map((o) => o.id) })
  d = agregarObjeto(d, { ...z, seguir: anillo.id })
  d = borrarObjeto(d, anillo.id)
  assert.equal(d.objetos.some((o) => o.tipo === 'enlace'), false, 'El enlace sin una de sus puntas se va')
  assert.equal(d.objetos.find((o) => o.tipo === 'zoom').seguir, null)
  const p = agregarPausa(d, 105)
  assert.equal(agregarPausa(p.dibujo, 105.01).id, null, 'No dos pausas en el mismo cuadro')
  const s = agregarSubtitulo(p.dibujo, 100, 103, 'Salida')
  assert.equal(s.dibujo.subtitulos[0].texto, 'Salida')
  // El original no se tocó (sirve para deshacer).
  assert.equal(dibujoVacio(clip).objetos.length, 0)
  assert.equal(normalizarDibujo(s.dibujo).dibujo.objetos.length, s.dibujo.objetos.length, 'Lo que arma el editor pasa la validación')
})

test('editor: el clic elige el objeto de más arriba, atajos de teclado, cuadro a cuadro y solo en la compu', async () => {
  const { objetoEnPunto, ordenTeclaEditor, tiempoPreciso, moverTiempo, esCompu } = await import('../src/utils/analisis/dibujos/editor.js')
  const { dibujo } = normalizarDibujo({
    version: 1,
    objetos: [
      { id: 'z', tipo: 'zona', desde: 0, hasta: 10, puntos: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] },
      { id: 'l', tipo: 'linea', desde: 0, hasta: 10, puntos: [{ x: 0.1, y: 0.3 }, { x: 0.5, y: 0.3 }] },
      { id: 'a', tipo: 'anillo', desde: 0, hasta: 10, pista: { claves: [{ t: 0, x: 0.8, y: 0.8 }] } },
    ],
  })
  const { elementos } = escenaEn(dibujo, 5)
  assert.equal(objetoEnPunto(elementos, { x: 0.3, y: 0.305 }).obj.id, 'l', 'La línea está encima de la zona')
  assert.equal(objetoEnPunto(elementos, { x: 0.3, y: 0.2 }).obj.id, 'z')
  assert.equal(objetoEnPunto(elementos, { x: 0.81, y: 0.8 }).obj.id, 'a')
  assert.equal(objetoEnPunto(elementos, { x: 0.95, y: 0.1 }), null)
  const tecla = (key, extra = {}) => ordenTeclaEditor({ key, target: { tagName: 'DIV' }, ...extra })
  assert.equal(tecla('z', { ctrlKey: true }), 'deshacer')
  assert.equal(tecla('y', { ctrlKey: true }), 'rehacer')
  assert.equal(tecla('Z', { ctrlKey: true, shiftKey: true }), 'rehacer')
  assert.equal(tecla('d', { ctrlKey: true }), 'duplicar')
  assert.equal(tecla('Delete'), 'borrar')
  assert.equal(tecla('ArrowRight'), 'avanzar:0.1')
  assert.equal(tecla('ArrowLeft', { shiftKey: true }), 'retroceder:1')
  assert.equal(tecla('b'), 'herramienta:pase_bajo')
  assert.equal(tecla('O'), 'herramienta:anillo')
  assert.equal(tecla('p'), 'pausa')
  assert.equal(ordenTeclaEditor({ key: 'b', target: { tagName: 'INPUT' } }), null, 'Mientras se escribe no hay atajos')
  assert.equal(ordenTeclaEditor({ key: 'Escape', target: { tagName: 'INPUT' } }), 'escape')
  assert.equal(tiempoPreciso(1415.26), '23:35,3')
  assert.equal(moverTiempo(10.05, -0.1, { inicio: 10, fin: 20 }), 10)
  assert.equal(moverTiempo(12, 0.1, { inicio: 10, fin: 20 }), 12.1)
  const ventana = (fino, ancho) => ({ innerWidth: ancho, matchMedia: () => ({ matches: fino }) })
  assert.equal(esCompu(ventana(true, 1440)), true)
  assert.equal(esCompu(ventana(false, 1440)), false, 'Pantalla táctil: no se edita')
  assert.equal(esCompu(ventana(true, 800)), false, 'Pantalla chica: no se edita')
  assert.equal(esCompu(null), false)
})

test('pantallas: el editor se carga solo al abrirlo y dibujar es solo de coordinación en la compu', () => {
  const seccion = leer('src/components/AnalisisSection.jsx')
  assert.match(seccion, /lazy\(\(\) => import\('\.\/analisis\/dibujo\/EditorDibujo'\)\)/)
  assert.doesNotMatch(seccion, /^import EditorDibujo/m, 'Nada de import directo del editor')
  assert.match(seccion, /const puedeDibujar = esAdmin && !bloqueoEscritura && !modoConsulta && enCompu && dibujosApi\.listo/)
  assert.match(seccion, /onDibujar=\{puedeDibujar \?/)
  // Pantalla completa del contenedor con los dibujos; sin el botón de YouTube.
  assert.match(seccion, /BotonPantallaCompleta objetivoRef=\{marcoVideoRef\}/)
  assert.match(seccion, /&fs=0/)
  assert.match(leer('src/components/analisis/ReproductorPlaylist.jsx'), /fs: 0/)
  // Etapa 5: el selector «Video real | Pizarra 2D» ya funciona.
  assert.match(leer('src/components/analisis/dibujo/EditorDibujo.jsx'), /onClick=\{\(\) => cambiarModo\('2d'\)\}/)
  assert.doesNotMatch(leer('src/components/analisis/dibujo/EditorDibujo.jsx'), /Próximamente/)
  // Colores solo por tokens.
  for (const r of ['src/components/analisis/dibujo/CapaDibujos.jsx', 'src/components/analisis/dibujo/EditorDibujo.jsx', 'src/components/analisis/dibujo/dibujo.css']) {
    assert.doesNotMatch(leer(r), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, r)
  }
})
