// Etapa J: convocadas con dorsal y lugar de la Formación, banco de suplentes, rival con su camiseta, vínculo y fotos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarElemento, esRival, nuevaPizarra, PALETA, validarPizarra } from '../src/utils/pizarra.js'
import { cargarConvocadas, colorearRival, coloresEquipo, equipoRival, fotosDeFichas, lugarBanco, lugarConvocada, vincularJugadora } from '../src/utils/pizarraPlantel.js'
import { escena } from '../src/utils/pizarraEscena.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const jugadores = Array.from({ length: 16 }, (_, i) => ({ id: id(i + 1), nombre: `Nombre${i + 1}`, apellido: `Apellido${i + 1}`, foto_url: i % 2 ? `https://fotos.prueba/${i + 1}.jpg` : null }))
const equipo = { id: id(900), nombre: 'Rival FC', escudo_url: 'https://fotos.prueba/escudo.png', color_camiseta: '#AA0000', color_numero: '#FFFF00' }

test('Lugar de la Formación: arquera atrás, lateral derecha abajo al atacar a la derecha; espejo al atacar a la izquierda', () => {
  const d = nuevaPizarra()
  // ConvocarPartido: y = 0 arco rival, 100 arco propio; x de izquierda a derecha mirando al arco rival.
  assert.deepEqual(lugarConvocada(d, '50,92'), { x: 4, y: 50 })
  const ld = lugarConvocada(d, '86,72')
  assert.ok(ld.x < 50 && ld.y > 50, JSON.stringify(ld))
  const izq = lugarConvocada({ ...d, ataque: 'izquierda' }, '86,72')
  assert.ok(izq.x > 50 && izq.y < 50)
  // Media cancha: defendiendo el arco que se ve, la arquera entra; atacándolo, queda fuera de la vista.
  assert.ok(lugarConvocada({ ...d, superficie: 'media' }, '50,92').x < 10)
  assert.equal(lugarConvocada({ ...d, superficie: 'media', ataque: 'izquierda' }, '50,92'), null)
  assert.equal(lugarConvocada(d, null), null); assert.equal(lugarConvocada(d, 'x,y'), null)
  assert.equal(lugarBanco(d, 0).y, 97); assert.ok(lugarBanco(d, 0).x < lugarBanco(d, 1).x)
})

test('Cargar convocadas: titulares en su lugar (o en el sistema), suplentes en el banco, dorsal, apellido y vínculo', () => {
  let d = agregarElemento(nuevaPizarra(), 'jugadora', 10, 10) // una propia vieja: se reemplaza
  d = agregarElemento(d, 'jugadora', 80, 50, { color: PALETA.rival, tinta: PALETA.tintaClara }) // una rival: queda
  const citaciones = [
    { jugador_id: id(1), dorsal: 1, titular: true, posicion_cancha: '50,92' },
    ...Array.from({ length: 10 }, (_, i) => ({ jugador_id: id(i + 2), dorsal: i + 2, titular: true, posicion_cancha: i < 4 ? `${14 + i * 24},72` : null })),
    { jugador_id: id(13), dorsal: 18, titular: false }, { jugador_id: id(12), dorsal: 12, titular: false },
    { jugador_id: id(99), dorsal: 99, titular: true, posicion_cancha: '50,50' }, // no está en el plantel visible: se ignora
  ]
  const r = cargarConvocadas(d, { citaciones, jugadores, formacion: '4-4-2', equipo })
  const propias = r.elementos.filter(e => e.tipo === 'jugadora' && !esRival(e)), rivales = r.elementos.filter(esRival)
  assert.equal(propias.length, 13); assert.equal(rivales.length, 1)
  const arquera = propias.find(e => e.numero === '1')
  assert.deepEqual(arquera.vinculo, { tipo: 'jugadora', id: id(1) }); assert.equal(arquera.texto, 'Apellido1')
  assert.deepEqual(r.pasos[0].poses[arquera.id], { x: 4, y: 50, rotacion: 0 })
  // Suplentes por dorsal en el banco, más chicas.
  const banco = propias.filter(e => r.pasos[0].poses[e.id].y === 97)
  assert.deepEqual(banco.map(e => e.numero), ['12', '18']); assert.ok(banco.every(e => e.tamano < 3))
  // Las titulares sin lugar guardado no se enciman.
  const titulares = propias.filter(e => !banco.includes(e)).map(e => r.pasos[0].poses[e.id])
  for (let i = 0; i < titulares.length; i++) for (let k = i + 1; k < titulares.length; k++) assert.ok(Math.hypot(titulares[i].x - titulares[k].x, titulares[i].y - titulares[k].y) > 4)
  // El rival toma la camiseta del equipo del partido.
  assert.equal(rivales[0].color, '#AA0000'); assert.equal(rivales[0].tinta, '#FFFF00'); assert.deepEqual(rivales[0].vinculo, { tipo: 'rival', id: equipo.id })
  assert.equal(equipoRival(r, [equipo]), equipo)
  assert.doesNotThrow(() => validarPizarra(r))
})

test('Rival: colores del equipo (o los de rival si no se cargaron); sigue siendo rival aunque cambie de color', () => {
  assert.deepEqual(coloresEquipo({ color_camiseta: null, color_numero: 'rojo' }), { color: PALETA.rival, tinta: PALETA.tintaClara })
  let d = agregarElemento(nuevaPizarra(), 'jugadora', 70, 50, { color: PALETA.rival, tinta: PALETA.tintaClara })
  d = agregarElemento(d, 'jugadora', 30, 50)
  const r = colorearRival(d, { ...equipo, color_camiseta: '#F2C230' }) // misma camiseta amarilla que la propia
  assert.equal(r.elementos.filter(esRival).length, 1, 'el vínculo la mantiene rival')
  assert.deepEqual(escena(r, r.pasos[0].poses).objetos.map(o => o.equipo).sort(), ['propio', 'rival'])
  assert.equal(colorearRival(nuevaPizarra(), equipo).elementos.length, 0)
})

test('Vincular y fotos: solo de jugadoras del plantel recibido (en Wellness, el de la categoría)', () => {
  let d = agregarElemento(agregarElemento(nuevaPizarra(), 'jugadora', 30, 30), 'jugadora', 40, 40)
  const [a, b] = d.elementos.map(e => e.id)
  d = vincularJugadora(vincularJugadora(d, a, jugadores[1]), b, jugadores[0])
  assert.equal(d.elementos[0].texto, 'Apellido2'); assert.deepEqual(d.elementos[0].vinculo, { tipo: 'jugadora', id: id(2) })
  // La 2 tiene foto; la 1 no.
  assert.deepEqual(fotosDeFichas(d, jugadores), { [a]: 'https://fotos.prueba/2.jpg' })
  // Wellness de otra categoría: la jugadora no está en su lista → sin foto, queda el número.
  assert.equal(fotosDeFichas(d, [jugadores[5]]), null)
  // Una URL que no es https no se usa.
  assert.equal(fotosDeFichas(d, [{ ...jugadores[1], foto_url: 'javascript:alert(1)' }]), null)
  assert.equal(vincularJugadora(d, a, null).elementos[0].vinculo, null)
  assert.doesNotThrow(() => validarPizarra(d))
})
