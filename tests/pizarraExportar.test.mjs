// Etapa K: exportar la jugada (video MP4 16:9 / 9:16 y PNG). Lógica pura y reglas de carga.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { duracionTotal, SUPERFICIES, validarPizarra } from '../src/utils/pizarra.js'
import { SET_INICIAL } from '../src/utils/bibliotecaInicial.js'
import { ACERCAMIENTO_MAXIMO, camaraCuadro, cuadroJugada, disposicion, DURACION_MAXIMA, FORMATOS_VIDEO, FPS, instanteVideo, lineaVideo, nombreArchivo,
  PLACA_SEGUNDOS, placaDe, proporcionCancha, QUIETO_FINAL, QUIETO_INICIO, vistaDelFormato, zonaJugada } from '../src/utils/pizarraVideo.js'

const doc = validarPizarra(SET_INICIAL[0].pizarra)
const leer = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('Línea de tiempo: placas, jugada con quietud al inicio y al final, velocidad y fundidos', () => {
  const jugada = duracionTotal(doc) / doc.velocidad
  const con = lineaVideo(doc), sin = lineaVideo(doc, { placas: false })
  assert.deepEqual(con.tramos.map(t => t.tipo), ['inicio', 'jugada', 'cierre'])
  assert.ok(Math.abs(con.total - (PLACA_SEGUNDOS * 2 + QUIETO_INICIO + jugada + QUIETO_FINAL)) < 1e-9)
  assert.equal(con.cuadros, Math.round(con.total * FPS))
  assert.deepEqual(sin.tramos.map(t => t.tipo), ['jugada'])
  assert.equal(instanteVideo(con, 0).tipo, 'inicio'); assert.equal(instanteVideo(con, 0).opacidad, 1, 'el video arranca con la placa a pleno')
  assert.ok(instanteVideo(con, PLACA_SEGUNDOS - .05).opacidad < .2, 'la placa se funde al salir')
  const enJugada = instanteVideo(con, PLACA_SEGUNDOS + QUIETO_INICIO + 1)
  assert.equal(enJugada.tipo, 'jugada'); assert.ok(Math.abs(enJugada.tiempo - doc.velocidad) < 1e-9)
  assert.equal(instanteVideo(con, PLACA_SEGUNDOS + .1).tiempo, 0, 'quieta al principio')
  assert.equal(instanteVideo(con, con.total - .01).tipo, 'cierre'); assert.equal(instanteVideo(con, con.total - .01).opacidad, 1)
  assert.equal(instanteVideo(sin, 0).opacidad, 1); assert.equal(instanteVideo(sin, sin.total - .01).opacidad, 1, 'sin placas no hay fundidos')
  const rapida = lineaVideo({ ...doc, velocidad: 2 }, { placas: false })
  assert.ok(Math.abs(rapida.total - (QUIETO_INICIO + duracionTotal(doc) / 2 + QUIETO_FINAL)) < 1e-9)
  // Un solo paso: el video es solo la foto quieta; una jugada larguísima se corta.
  assert.equal(lineaVideo({ ...doc, pasos: doc.pasos.slice(0, 1) }, { placas: false }).total, QUIETO_INICIO + QUIETO_FINAL)
  const larga = { ...doc, pasos: Array.from({ length: 60 }, (_, i) => ({ ...doc.pasos[0], id: `p${i}`, duracion: 5 })) }
  assert.equal(lineaVideo(larga).total, DURACION_MAXIMA); assert.equal(lineaVideo(larga).recortado, true)
})

test('Zona de la jugada: encuadra lo que se usa, sin salir de la cancha ni acercar de más', () => {
  const [w, h] = SUPERFICIES[doc.superficie]
  const z = zonaJugada(doc)
  assert.ok(z.escala > 1 && z.escala <= ACERCAMIENTO_MAXIMO, `escala ${z.escala}`)
  assert.ok(z.x < w / 2, 'la salida se juega en el campo propio (izquierda)')
  assert.ok(z.x - w / (2 * z.escala) >= -1e-9 && z.x + w / (2 * z.escala) <= w + 1e-9)
  assert.ok(z.y - h / (2 * z.escala) >= -1e-9 && z.y + h / (2 * z.escala) <= h + 1e-9)
  // Todo lo que se mueve queda adentro del encuadre.
  for (const paso of doc.pasos) for (const e of doc.elementos) {
    const p = paso.poses[e.id], x = p.x * w / 100, y = p.y * h / 100
    assert.ok(Math.abs(x - z.x) <= w / (2 * z.escala) + 1e-9 && Math.abs(y - z.y) <= h / (2 * z.escala) + 1e-9, `${e.id} afuera`)
  }
  assert.deepEqual(zonaJugada({ ...doc, elementos: [] }), { x: w / 2, y: h / 2, escala: 1 })
  // Una jugada que ocupa toda la cancha no acerca.
  const extremos = { ...doc, elementos: doc.elementos.slice(0, 2), pasos: [{ ...doc.pasos[0], poses: { [doc.elementos[0].id]: { x: 1, y: 1, rotacion: 0 }, [doc.elementos[1].id]: { x: 99, y: 99, rotacion: 0 } } }] }
  assert.equal(zonaJugada(extremos).escala, 1)
  // Con foco, la cámara se acerca a la jugadora y nunca menos que la zona.
  const conFoco = camaraCuadro(doc, { foco: { id: doc.elementos[0].id, peso: 1 } }, doc.pasos[0].poses, z)
  assert.ok(conFoco.escala >= z.escala)
  assert.deepEqual(camaraCuadro(doc, { foco: null }, doc.pasos[0].poses, z), z)
})

test('Cuadro de la jugada: subtítulo del paso, poses del instante y foto quieta de un paso', () => {
  const total = duracionTotal(doc), ultimo = doc.pasos.length - 1
  assert.equal(cuadroJugada(doc, { tiempo: 0 }).subtitulo, doc.pasos[0].texto)
  assert.equal(cuadroJugada(doc, { tiempo: total + 5 }).paso, ultimo)
  assert.deepEqual(cuadroJugada(doc, { tiempo: total + 5 }).poses, doc.pasos[ultimo].poses)
  const quieto = cuadroJugada(doc, { indice: 2 })
  assert.equal(quieto.subtitulo, doc.pasos[2].texto); assert.deepEqual(quieto.poses, doc.pasos[2].poses); assert.equal(quieto.estelas, null)
  assert.equal(cuadroJugada(doc, { indice: 0 }).camara.escala, 1, 'sin zona, la cancha entera')
  assert.ok(cuadroJugada(doc, { indice: 0, zona: zonaJugada(doc) }).camara.escala > 1)
  assert.equal(cuadroJugada(doc, { tiempo: 1, flechas: false }).automaticas, null)
})

test('Formatos, disposición y nombres de archivo', () => {
  assert.deepEqual([FORMATOS_VIDEO.horizontal.ancho, FORMATOS_VIDEO.horizontal.alto, FORMATOS_VIDEO.vertical.ancho, FORMATOS_VIDEO.vertical.alto], [1920, 1080, 1080, 1920])
  const v = vistaDelFormato(doc, 'vertical'), hz = vistaDelFormato({ ...doc, orientacion: 'vertical' }, 'horizontal')
  assert.equal(v.vista.orientacion, 'vertical'); assert.equal(v.giro, -90, 'de pie, atacando hacia arriba')
  assert.equal(hz.vista.orientacion, 'horizontal')
  assert.ok(proporcionCancha(v.vista) < 1 && proporcionCancha(doc) > 1)
  const dv = disposicion(1080, 1920, proporcionCancha(v.vista)), dh = disposicion(1920, 1080, proporcionCancha(doc))
  for (const d of [dv, dh]) assert.ok(d.subtitulo.y > d.cancha.y + d.cancha.h, 'el subtítulo va en su franja, debajo de la cancha')
  const sinTextos = disposicion(1920, 1080, proporcionCancha(doc), false); assert.ok(sinTextos.cancha.h > dh.cancha.h, 'sin textos, la cancha usa ese lugar')
  for (const [d, W, H] of [[dv, 1080, 1920], [dh, 1920, 1080]]) assert.ok(d.cancha.x >= 0 && d.cancha.x + d.cancha.w <= W && d.cancha.y + d.cancha.h <= H)
  assert.equal(nombreArchivo('Salida con 3 — ¡Córner!', 'mp4', '16x9'), 'salida-con-3-corner-16x9.mp4')
  assert.equal(nombreArchivo('', 'png'), 'jugada.png')
  assert.deepEqual(placaDe({ placa: { titulo: '', analista: ' Ana ' } }, 'Salida con 3'), { titulo: 'Salida con 3', analista: 'Ana' })
  assert.deepEqual(placaDe({ placa: { titulo: 'Córner', analista: '' } }, 'Otro'), { titulo: 'Córner', analista: '' })
})

test('Carga y alcance: mediabunny y el dibujo solo al exportar, solo desde el editor y sin colores fijos', () => {
  const paquete = JSON.parse(leer('package.json'))
  assert.match(paquete.dependencies.mediabunny, /^\d+\.\d+\.\d+$/, 'versión exacta')
  const fuentes = []
  const recorrer = dir => { for (const n of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) n.isDirectory() ? recorrer(`${dir}/${n.name}`) : /\.(jsx?|mjs)$/.test(n.name) && fuentes.push(`${dir}/${n.name}`) }
  recorrer('src')
  for (const f of fuentes) {
    const s = leer(f)
    assert.doesNotMatch(s, /^import[^\n]*['"]mediabunny['"]/m, `${f} no importa mediabunny de forma estática`)
    assert.doesNotMatch(s, /^import[^\n]*pizarraRender['"]/m, `${f} no importa el dibujo de forma estática`)
  }
  assert.match(leer('src/utils/pizarraRender.js'), /await import\('mediabunny'\)/)
  assert.match(leer('src/components/PizarraExportar.jsx'), /await import\('\.\.\/utils\/pizarraRender'\)/)
  const editor = leer('src/components/PizarraTactica.jsx')
  assert.match(editor, /\{!soloLectura && exportar && <PizarraExportar /, 'solo en el editor')
  for (const f of ['src/components/EntrenamientoDeHoy.jsx', 'src/components/PizarraEjercicio.jsx', 'src/components/BienestarPublico.jsx']) assert.doesNotMatch(leer(f), /PizarraExportar|pizarraRender/)
  // Sin sonido: el video no tiene pista de audio.
  assert.doesNotMatch(leer('src/utils/pizarraRender.js'), /addAudioTrack|AudioSource/)
  for (const f of ['src/utils/pizarraRender.js', 'src/components/PizarraExportar.jsx']) assert.doesNotMatch(leer(f), /#[0-9a-f]{3,8}\b|rgba?\(/i, `${f}: colores solo del tema`)
})
