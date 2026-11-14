// Ronda de uso del editor: pasos (eliminar, duplicar, mover), anotaciones fijas y formaciones prearmadas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarElemento, aplicarFormacion, duplicarPaso, eliminarPaso, esRival, fijarAnotaciones, FORMACIONES, lugaresFormacion, moverPaso, nuevaPizarra, PALETA, validarPizarra } from '../src/utils/pizarra.js'

function conPasos(n) {
  let d = agregarElemento(nuevaPizarra(), 'jugadora', 10, 10)
  d = { ...d, pasos: Array.from({ length: n }, (_, i) => ({ ...d.pasos[0], id: `p${i}`, nombre: `Paso ${i + 1}`, texto: `T${i + 1}` })) }
  return validarPizarra(d)
}

test('Pasos: eliminar deja al menos uno, duplicar copia todo con id nuevo y mover reordena', () => {
  const d = conPasos(3)
  assert.deepEqual(eliminarPaso(d, 1).pasos.map(p => p.id), ['p0', 'p2'])
  assert.equal(eliminarPaso(conPasos(1), 0).pasos.length, 1)
  const dup = duplicarPaso({ ...d, pasos: d.pasos.map((p, i) => i === 1 ? { ...p, pausa: 2, pase: 'alto' } : p) }, 1)
  assert.equal(dup.pasos.length, 4)
  assert.equal(dup.pasos[2].texto, 'T2'); assert.equal(dup.pasos[2].pausa, 2); assert.equal(dup.pasos[2].pase, 'alto')
  assert.equal(dup.pasos[2].nombre, 'Paso 2 (copia)'); assert.notEqual(dup.pasos[2].id, 'p1')
  assert.deepEqual(moverPaso(d, 0, 2).pasos.map(p => p.id), ['p1', 'p2', 'p0'])
  assert.deepEqual(moverPaso(d, 2, 0).pasos.map(p => p.id), ['p2', 'p0', 'p1'])
  assert.equal(moverPaso(d, 1, 1), d); assert.equal(moverPaso(d, 0, 9), d)
  assert.doesNotThrow(() => validarPizarra(dup))
})

test('Textos y zonas sombreadas quedan en el mismo lugar en todos los pasos; las jugadoras no', () => {
  let d = conPasos(3)
  d = agregarElemento(agregarElemento(d, 'texto', 40, 8), 'sombra', 50, 50)
  const [j, t, z] = d.elementos.map(e => e.id)
  // Una selección que incluía el texto lo movió solo en el paso 3 (lo que pasaba antes).
  const movido = { ...d, pasos: d.pasos.map((p, i) => i === 2 ? { ...p, poses: { ...p.poses, [t]: { x: 40, y: 0, rotacion: 0 }, [z]: { x: 60, y: 60, rotacion: 0 }, [j]: { x: 30, y: 30, rotacion: 0 } } } : p) }
  const fijo = fijarAnotaciones(movido, 2)
  for (const p of fijo.pasos) { assert.deepEqual(p.poses[t], { x: 40, y: 0, rotacion: 0 }); assert.deepEqual(p.poses[z], { x: 60, y: 60, rotacion: 0 }) }
  assert.deepEqual(fijo.pasos.map(p => p.poses[j].x), [10, 10, 30], 'la jugadora conserva su posición por paso')
})

test('Formaciones: 11 por equipo, sin duplicar, del lado que corresponde y numeradas', () => {
  for (const [sistema, lineas] of Object.entries(FORMACIONES)) {
    const numeros = lineas.flat()
    assert.equal(numeros.length, 11, sistema)
    assert.deepEqual([...numeros].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], sistema)
  }
  const d = nuevaPizarra()
  // Cancha completa atacando a la derecha: las propias en la mitad izquierda, las rivales en la derecha.
  const propias = lugaresFormacion(d, '4-3-3', 'propio'), rivales = lugaresFormacion(d, '4-3-3', 'rival')
  assert.ok(propias.every(l => l.x < 50) && rivales.every(l => l.x > 50))
  assert.ok(propias.find(l => l.numero === '1').x < 6 && rivales.find(l => l.numero === '1').x > 94)
  // Atacando a la derecha, el lateral derecho (4) va abajo y el izquierdo (3) arriba.
  assert.ok(propias.find(l => l.numero === '4').y > 50 && propias.find(l => l.numero === '3').y < 50)
  // Con el ataque a la izquierda todo se espeja.
  const izq = lugaresFormacion({ ...d, ataque: 'izquierda' }, '4-3-3', 'propio')
  assert.ok(izq.every(l => l.x > 50)); assert.ok(izq.find(l => l.numero === '4').y < 50)
  // Media cancha (se ve el arco de la izquierda): quien lo defiende se para atrás con arquera; quien ataca, adelantado y sin arquera.
  const media = { ...d, superficie: 'media' }
  const defiende = lugaresFormacion(media, '4-4-2', 'propio'), ataca = lugaresFormacion(media, '4-4-2', 'rival')
  assert.equal(defiende.length, 11); assert.equal(ataca.length, 10)
  assert.ok([...defiende, ...ataca].every(l => l.x >= 2 && l.x <= 98 && l.y >= 4 && l.y <= 96))

  // Aplicar: crea 11; aplicar otra vez (u otro sistema) reubica las mismas fichas sin duplicar.
  let doc = aplicarFormacion(d, 0, '4-4-2', 'propio')
  assert.equal(doc.elementos.length, 11)
  assert.deepEqual(doc.elementos.map(e => e.numero).sort((a, b) => a - b), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
  doc = aplicarFormacion(doc, 0, '3-5-2', 'propio')
  assert.equal(doc.elementos.length, 11)
  doc = aplicarFormacion(doc, 0, '4-2-3-1', 'rival')
  assert.equal(doc.elementos.length, 22)
  assert.equal(doc.elementos.filter(esRival).length, 11)
  assert.ok(doc.elementos.filter(esRival).every(e => e.tinta === PALETA.tintaClara))
  // Con jugadoras ya puestas, se usan primero las que tienen el mismo número.
  let parcial = agregarElemento(nuevaPizarra(), 'jugadora', 90, 90, { numero: '9' })
  const nueve = parcial.elementos[0].id
  parcial = aplicarFormacion(parcial, 0, '4-4-2', 'propio')
  const lugarNueve = lugaresFormacion(nuevaPizarra(), '4-4-2', 'propio').find(l => l.numero === '9')
  assert.equal(parcial.elementos.length, 11)
  assert.deepEqual([parcial.pasos[0].poses[nueve].x, parcial.pasos[0].poses[nueve].y], [lugarNueve.x, lugarNueve.y])
  assert.doesNotThrow(() => validarPizarra(doc))
})
