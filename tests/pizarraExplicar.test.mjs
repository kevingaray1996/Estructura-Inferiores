// Etapa I (explicar): formato v2 en la app, pausas, pase alto, zonas sombreadas, ocultos por paso, foco y subtítulos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarElemento, alternarFoco, alternarOcultos, copiarPaso, duracionTotal, moverVertice, nuevaPizarra, quitarElementos, SUPERFICIES, validarPizarra } from '../src/utils/pizarra.js'
import { alturas, animar, cronograma, enMovimiento, estelas, flechasAutomaticas, tiemposDePasos } from '../src/utils/pizarraAnimacion.js'
import { ACERCAMIENTO_FOCO, focoYCamara, opacidades, subtitulo } from '../src/utils/pizarraExplicar.js'
import { CAPAS, escena } from '../src/utils/pizarraEscena.js'

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// Jugada de prueba: `fichas` = [[tipo, x, y]], `posiciones[paso][ficha]` = [x, y], `pasos` = cambios por paso.
function jugada(fichas, posiciones, pasos = []) {
  let d = nuevaPizarra()
  for (const [tipo, x, y] of fichas) d = agregarElemento(d, tipo, x, y)
  const ids = d.elementos.map(e => e.id)
  d = { ...d, pasos: posiciones.map((lista, i) => ({ id: `p${i}`, nombre: `Paso ${i + 1}`, duracion: 2, texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [],
    ...pasos[i], poses: Object.fromEntries(ids.map((id, k) => [id, { x: lista[k][0], y: lista[k][1], rotacion: 0 }])) })) }
  return { d: validarPizarra(d), ids }
}

test('Formato: una pizarra v1 se abre como v2 con valores por defecto y una nueva ya es v2', () => {
  const v1 = { version: 1, superficie: 'media', orientacion: 'vertical', ataque: 'izquierda', bucle: true, velocidad: 1.5,
    elementos: [{ id: 'j', tipo: 'jugadora', color: '#F2C230', tinta: '#111111', tamano: 3, grosor: .4, dx: 0, dy: 0, curva: 0, texto: '', numero: '9' }],
    pasos: [{ id: 'p', nombre: 'Inicio', duracion: 2, poses: { j: { x: 10, y: 10, rotacion: 0 } } }] }
  const v2 = validarPizarra(v1)
  assert.equal(v2.version, 2); assert.equal(v2.recorrido, 'suave'); assert.deepEqual(v2.placa, { titulo: '', analista: '' })
  assert.equal(v2.elementos[0].vinculo, null)
  assert.deepEqual(v2.pasos[0], { ...v1.pasos[0], texto: '', pausa: 0, pase: 'bajo', foco: null, ocultos: [] })
  assert.deepEqual(validarPizarra(v2), v2, 'guardar y volver a abrir no cambia nada')
  assert.equal(nuevaPizarra().version, 2)
  // Una zona sombreada no existe en v1.
  assert.throws(() => validarPizarra({ ...v1, elementos: [{ ...v1.elementos[0], tipo: 'sombra' }] }))
})

test('Formato: lo que la base rechaza también lo rechaza la app', () => {
  const { d, ids: [j, z] } = jugada([['jugadora', 10, 10], ['sombra', 50, 50]], [[[10, 10], [50, 50]]])
  const malos = [
    { ...d, recorrido: 'zigzag' },
    { ...d, placa: { titulo: 'x'.repeat(81), analista: '' } },
    { ...d, pasos: [{ ...d.pasos[0], pausa: 31 }] },
    { ...d, pasos: [{ ...d.pasos[0], pase: 'medio' }] },
    { ...d, pasos: [{ ...d.pasos[0], texto: 'x'.repeat(201) }] },
    { ...d, pasos: [{ ...d.pasos[0], foco: z }] },
    { ...d, pasos: [{ ...d.pasos[0], foco: 'nadie' }] },
    { ...d, pasos: [{ ...d.pasos[0], ocultos: [z, z] }] },
    { ...d, pasos: [{ ...d.pasos[0], ocultos: ['nadie'] }] },
    { ...d, elementos: d.elementos.map(e => e.id === j ? { ...e, vinculo: { tipo: 'jugadora', id: 'no-uuid' } } : e) },
    { ...d, elementos: d.elementos.map(e => e.id === j ? { ...e, vinculo: { tipo: 'tecnico', id: crypto.randomUUID() } } : e) },
    { ...d, elementos: d.elementos.map(e => e.id === z ? { ...e, vinculo: { tipo: 'jugadora', id: crypto.randomUUID() } } : e) },
    { ...d, elementos: d.elementos.map(e => e.id === z ? { ...e, puntos: e.puntos.slice(0, 2) } : e) },
    { ...d, elementos: d.elementos.map(e => e.id === z ? { ...e, puntos: [{ x: 101, y: 0 }, ...e.puntos.slice(1)] } : e) },
  ]
  for (const malo of malos) assert.throws(() => validarPizarra(malo), undefined, JSON.stringify(malo).slice(0, 120))
  const vinculada = validarPizarra({ ...d, elementos: d.elementos.map(e => e.id === j ? { ...e, vinculo: { tipo: 'rival', id: 'A0000000-0000-4000-8000-000000000001' } } : e) })
  assert.deepEqual(vinculada.elementos[0].vinculo, { tipo: 'rival', id: 'a0000000-0000-4000-8000-000000000001' })
})

test('Pausa: la línea de tiempo se detiene en el paso y el movimiento retoma donde quedó', () => {
  const { d, ids: [j] } = jugada([['jugadora', 10, 50]], [[[10, 50]], [[40, 50]], [[70, 50]]], [{ pausa: 1 }, { pausa: 2 }, { pausa: .5 }])
  const c = cronograma(d)
  assert.deepEqual(c.llegadas, [0, 3, 7]); assert.deepEqual(c.salidas, [1, 5, 7.5]); assert.equal(c.total, 7.5)
  assert.equal(duracionTotal(d), 7.5); assert.deepEqual(tiemposDePasos(d), [0, 3, 7])
  // Quieta en el primer paso durante su pausa, después arranca.
  assert.equal(animar(d, .5).poses[j].x, 10)
  assert.ok(animar(d, 1.5).poses[j].x > 10)
  // Durante la pausa del paso 2 queda exacta en el paso 2 y la reproducción marca ese paso.
  for (const t of [3, 4, 5]) { const c2 = animar(d, t); assert.equal(c2.indice, 1); assert.equal(c2.poses[j].x, 40) }
  assert.deepEqual(enMovimiento(d, 4), { m: 2, paso: 1, pausa: true })
  assert.ok(animar(d, 6).poses[j].x > 40 && animar(d, 6).poses[j].x < 70)
  assert.equal(animar(d, 99).poses[j].x, 70)
  // Las estelas no crecen durante una pausa.
  assert.deepEqual(estelas(d, 3.2, 'completo'), estelas(d, 4.8, 'completo'))
})

test('Pase alto: la pelota vuela en parábola; un pase bajo o una conducción no despegan', () => {
  const fichas = [['jugadora', 10, 50], ['jugadora', 60, 30], ['pelota', 13, 50]]
  const pos = [[[10, 50], [60, 30], [13, 50]], [[10, 50], [60, 30], [57, 30]]]
  const alto = jugada(fichas, pos, [{}, { pase: 'alto' }]), bajo = jugada(fichas, pos)
  const pelota = alto.ids[2]
  assert.deepEqual(alturas(bajo.d, 1), {})
  const z = t => alturas(alto.d, t)[pelota] || 0
  assert.equal(z(0), 0); assert.equal(z(2), 0)
  assert.ok(z(1) > z(.4) && z(1) > z(1.6) && z(1) > 3, `altura máxima ${z(1)}`)
  // La flecha automática del pase queda marcada como alta (se dibuja curva, de otro color y con sombra).
  assert.equal(flechasAutomaticas(alto.d, 1).find(f => f.tipo === 'pase').alto, true)
  assert.equal(flechasAutomaticas(bajo.d, 1).find(f => f.tipo === 'pase').alto, undefined)
  // Conducción: la jugadora lleva la pelota; aunque el paso diga "alto", no vuela.
  const conduce = jugada([['jugadora', 10, 50], ['pelota', 13, 50]], [[[10, 50], [13, 50]], [[50, 50], [53, 50]]], [{}, { pase: 'alto' }])
  assert.deepEqual(alturas(conduce.d, 1), {})
  // El modelo de escena recibe la altura (z) para el video y una vista 3D.
  const objeto = escena(alto.d, animar(alto.d, 1).poses, alturas(alto.d, 1)).objetos.find(o => o.id === pelota)
  assert.ok(objeto.z > 3)
})

test('Ocultos por paso: aparecen y desaparecen con un fundido; borrar un elemento limpia foco y ocultos', () => {
  const { d: base, ids: [j, z] } = jugada([['jugadora', 10, 50], ['sombra', 50, 50]], [[[10, 50], [50, 50]], [[20, 50], [50, 50]]])
  let d = alternarOcultos(base, 0, [z])
  assert.deepEqual(d.pasos[0].ocultos, [z])
  assert.deepEqual(opacidades(d, null, 0), { [z]: 0 })
  assert.deepEqual(opacidades(d, null, 1), {})
  assert.ok(opacidades(d, 1, 0)[z] > 0 && opacidades(d, 1, 0)[z] < 1, 'a mitad de la transición se está mostrando')
  assert.deepEqual(opacidades(d, 2, 0), {}, 'ya en el paso 2 no queda nada oculto')
  assert.deepEqual(alternarOcultos(d, 0, [z]).pasos[0].ocultos, [], 'segunda vez la vuelve a mostrar')
  d = alternarFoco(d, 1, j)
  assert.equal(d.pasos[1].foco, j)
  assert.equal(alternarFoco(d, 1, z), d, 'el foco es solo para jugadoras')
  const sin = quitarElementos(d, [j, z])
  assert.equal(sin.pasos[1].foco, null); assert.deepEqual(sin.pasos[0].ocultos, [])
  assert.doesNotThrow(() => validarPizarra(sin))
})

test('Foco: resalta, acerca la cámara de a poco y nunca muestra afuera de la cancha', () => {
  const { d: base, ids: [j] } = jugada([['jugadora', 95, 50], ['jugadora', 50, 50]], [[[95, 50], [50, 50]], [[95, 50], [50, 50]]])
  const d = alternarFoco(base, 1, j)
  const [w, h] = SUPERFICIES[d.superficie]
  const sinFoco = focoYCamara(d, null, 0, d.pasos[0].poses)
  assert.equal(sinFoco.foco, null); assert.deepEqual(sinFoco.camara, { x: w / 2, y: h / 2, escala: 1 })
  const quieto = focoYCamara(d, null, 1, d.pasos[1].poses)
  assert.equal(quieto.foco.id, j); assert.equal(quieto.foco.peso, 1); assert.equal(quieto.camara.escala, ACERCAMIENTO_FOCO)
  // Pegada a la línea de fondo: la cámara se corre lo justo para no salir de la cancha.
  assert.ok(cerca(quieto.camara.x, w - w / (2 * ACERCAMIENTO_FOCO)))
  const medio = focoYCamara(d, 1, 0, animar(d, 1).poses)
  assert.ok(medio.foco.peso > 0 && medio.foco.peso < 1); assert.ok(medio.camara.escala > 1 && medio.camara.escala < ACERCAMIENTO_FOCO)
})

test('Subtítulos: el del paso quieto; en una transición, el del paso al que se va', () => {
  const { d } = jugada([['jugadora', 10, 50]], [[[10, 50]], [[30, 50]], [[50, 50]]], [{ texto: 'Arranque', pausa: 1 }, { texto: 'Desmarque' }, {}])
  assert.equal(subtitulo(d, null, 0), 'Arranque')
  assert.equal(subtitulo(d, .5, 0), 'Arranque')
  assert.equal(subtitulo(d, 2, 0), 'Desmarque')
  assert.equal(subtitulo(d, 4, 0), '')
})

test('Paso nuevo, zona sombreada y vértices', () => {
  let { d, ids: [j, z] } = jugada([['jugadora', 10, 50], ['sombra', 50, 50]], [[[10, 50], [50, 50]]], [{ texto: 'Uno', pausa: 2, pase: 'alto', ocultos: [] }])
  d = alternarFoco(alternarOcultos(d, 0, [z]), 0, j)
  const copia = copiarPaso(d, 0).pasos[1]
  assert.equal(copia.texto, ''); assert.equal(copia.pausa, 0); assert.equal(copia.pase, 'bajo')
  assert.equal(copia.foco, j); assert.deepEqual(copia.ocultos, [z]); assert.notEqual(copia.id, d.pasos[0].id)
  // La zona nueva mide 12 × 8 m y se dibuja debajo de todo.
  const zona = d.elementos.find(e => e.id === z), [w, h] = SUPERFICIES[d.superficie]
  assert.equal(zona.puntos.length, 4)
  assert.ok(cerca((zona.puntos[1].x - zona.puntos[0].x) * w / 100, 12, .05) && cerca((zona.puntos[2].y - zona.puntos[1].y) * h / 100, 8, .05))
  assert.equal(escena(d, d.pasos[0].poses).objetos[0].id, z); assert.ok(CAPAS.zona < CAPAS.linea)
  // Arrastrar un vértice a un punto de la cancha; con la zona girada 90° el punto queda en su lugar en pantalla.
  const movida = moverVertice(d, 0, z, 0, { x: 40, y: 40 })
  assert.deepEqual(movida.elementos.find(e => e.id === z).puntos[0], { x: -10, y: -10 })
  const girada = { ...d, pasos: d.pasos.map(p => ({ ...p, poses: { ...p.poses, [z]: { ...p.poses[z], rotacion: 90 } } })) }
  const p = moverVertice(girada, 0, z, 0, { x: 60, y: 50 }).elementos.find(e => e.id === z).puntos[0]
  // 10 % de 105 m = 10,5 m hacia x en pantalla → en la zona girada 90° eso es -y local: 10,5 m / 68 m ≈ -15,44 %.
  assert.ok(cerca(p.x, 0, .02) && cerca(p.y, -15.44, .02), JSON.stringify(p))
  assert.doesNotThrow(() => validarPizarra(movida))
})
