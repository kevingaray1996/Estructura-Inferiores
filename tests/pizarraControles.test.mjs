import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarElemento, colocarFlecha, nuevaPizarra, PALETA, SUPERFICIES, validarPizarra } from '../src/utils/pizarra.js'
import { alcanceIman, duenasEnPaso, flechasAutomaticas, imanPelotas, jugadoraCercana, pegarPelota, pelotasDe } from '../src/utils/pizarraAnimacion.js'

// Jugada a partir de posiciones por paso: elementos [tipo, extra] y pasos [[x, y] por elemento].
function jugada(elementos, pasos) {
  let d = nuevaPizarra()
  for (const [tipo, extra = {}] of elementos) d = agregarElemento(d, tipo, 50, 50, extra)
  const ids = d.elementos.map(e => e.id)
  d = { ...d, pasos: pasos.map((pos, i) => ({ id: `p${i}`, nombre: `Paso ${i + 1}`, duracion: 2, poses: Object.fromEntries(ids.map((id, k) => [id, { x: pos[k][0], y: pos[k][1], rotacion: 0 }])) })) }
  return { d: validarPizarra(d), ids }
}
const [W, H] = SUPERFICIES.completa
const distancia = (a, b) => Math.hypot((a.x - b.x) * W / 100, (a.y - b.y) * H / 100)

test('Imán: soltada cerca de una jugadora (propia o rival) se acomoda a sus pies; lejos queda suelta', () => {
  const { d, ids: [propia, rival, pelota] } = jugada([['jugadora'], ['jugadora', { color: PALETA.rival, tinta: PALETA.tintaClara }], ['pelota']],
    [[[30, 50], [70, 50], [35, 50]]])
  const pegada = imanPelotas(d, 0, [pelota])
  assert.deepEqual(duenasEnPaso(pegada, 0), { [pelota]: propia })
  // Queda del lado desde donde llegó, a los pies (más cerca que el alcance de posesión).
  const pb = pegada.pasos[0].poses[pelota], pj = pegada.pasos[0].poses[propia]
  assert.ok(pb.x > pj.x && Math.abs(distancia(pb, pj) - 3.75) < .05, `a ${distancia(pb, pj)} m`)
  // Cerca de la rival también se pega.
  const conRival = imanPelotas({ ...d, pasos: [{ ...d.pasos[0], poses: { ...d.pasos[0].poses, [pelota]: { x: 66, y: 50, rotacion: 0 } } }] }, 0, [pelota])
  assert.equal(duenasEnPaso(conRival, 0)[pelota], rival)
  // Lejos de todas: no cambia nada.
  const lejos = { ...d, pasos: [{ ...d.pasos[0], poses: { ...d.pasos[0].poses, [pelota]: { x: 50, y: 10, rotacion: 0 } } }] }
  assert.equal(imanPelotas(lejos, 0, [pelota]), lejos)
  assert.equal(jugadoraCercana(lejos, 0, pelota, lejos.pasos[0].poses[pelota]), null)
})

test('Imán: el alcance es mayor que el de posesión, para que soltar "cerca" alcance', () => {
  const { d } = jugada([['jugadora'], ['pelota']], [[[30, 50], [35, 50]]])
  assert.ok(alcanceIman(d.elementos[0], d.elementos[1]) > d.elementos[0].tamano + 1)
})

test('Pegar pelota: trae la pelota más cercana a los pies; la que ya tiene una jugadora la acompaña al moverla', () => {
  const { d, ids: [a, b, p1, p2] } = jugada([['jugadora'], ['jugadora'], ['pelota'], ['pelota']], [[[20, 50], [80, 50], [40, 40], [90, 90]]])
  const pegada = pegarPelota(d, 0, a)
  assert.equal(duenasEnPaso(pegada, 0)[p1], a)
  assert.deepEqual(pegada.pasos[0].poses[p2], d.pasos[0].poses[p2])
  assert.deepEqual(pelotasDe(pegada, 0, [a]), [p1])
  assert.deepEqual(pelotasDe(pegada, 0, [b]), [])
  // Sin pelotas no hace nada.
  const { d: sin, ids: [j] } = jugada([['jugadora']], [[[20, 50]]])
  assert.equal(pegarPelota(sin, 0, j), sin)
})

test('Flechas automáticas: pase, conducción y desplazamiento sin pelota, ignorando movimientos chicos', () => {
  // Paso 1→2: A conduce. Paso 2→3: A pasa a B, B se mueve sin pelota y C apenas se corre.
  const { d, ids: [A, B, C, P] } = jugada([['jugadora'], ['jugadora'], ['jugadora'], ['pelota']], [
    [[20, 50], [60, 30], [50, 80], [22.5, 50]],
    [[35, 50], [60, 30], [50, 80], [37.5, 50]],
    [[38, 52], [70, 35], [50.5, 80.5], [72.5, 35]],
  ])
  const t1 = flechasAutomaticas(d, 1)
  assert.deepEqual(t1.map(f => [f.tipo, f.id]), [['conduccion', `auto-conduccion-${A}`]])
  const t2 = flechasAutomaticas(d, 2)
  const tipos = Object.fromEntries(t2.map(f => [f.id, f.tipo]))
  assert.equal(tipos[`auto-pase-${P}`], 'pase')
  assert.equal(tipos[`auto-movimiento-${B}`], 'movimiento')
  assert.equal(tipos[`auto-movimiento-${A}`], undefined, 'A se movió menos de 2 m')
  assert.equal(tipos[`auto-movimiento-${C}`], undefined, 'C se movió menos de 2 m')
  assert.deepEqual(flechasAutomaticas(d, 0), [])
  // La flecha arranca en el borde de la ficha y termina antes de la de llegada.
  const pase = t2.find(f => f.tipo === 'pase')
  assert.ok(pase.x > 37.5 && pase.x + pase.dx < 72.5)
})

test('Flechas automáticas: no se duplican con una flecha dibujada a mano para el mismo movimiento', () => {
  const { d, ids: [A, B, P] } = jugada([['jugadora'], ['jugadora'], ['pelota']], [
    [[20, 50], [60, 30], [22.5, 50]],
    [[20, 50], [70, 30], [72.5, 30]],
  ])
  assert.equal(flechasAutomaticas(d, 1).filter(f => f.tipo === 'pase').length, 1)
  // Una flecha de pase dibujada desde la pasadora hasta la receptora reemplaza a la automática.
  const conDibujo = validarPizarra(colocarFlecha(d, 'pase', { x: 23, y: 50 }, { x: 68, y: 31 }))
  assert.equal(flechasAutomaticas(conDibujo, 1).filter(f => f.tipo === 'pase').length, 0)
  // La de B (sin pelota) sigue, porque no está dibujada.
  assert.equal(flechasAutomaticas(conDibujo, 1).filter(f => f.id === `auto-movimiento-${B}`).length, 1)
  assert.ok(A && P)
})
