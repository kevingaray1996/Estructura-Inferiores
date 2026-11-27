// Nuevo análisis → Scouting: buscador de equipos. Si lo escrito no coincide, «+ Agregar «…»» dentro de los resultados;
// con el buscador vacío, el botón suelto pide escribir; si coincide con otra escritura, ofrece el que ya existe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { equipoParecido, nombreCompacto, resultadosBuscador } from '../src/utils/analisis/equipos.js'
import { montarComponente } from './helpers/montarComponente.mjs'

const EQUIPOS = [
  { id: 'e1', nombre: 'Estrella del Sur', activo: true },
  { id: 'e2', nombre: 'Atlético Norte', activo: true },
  { id: 'e3', nombre: 'Otro Club', activo: true },
]

test('lógica: nombre compacto, equipo parecido y qué ofrecer', () => {
  assert.equal(nombreCompacto('  Atlético   NORTE '), 'atleticonorte')
  assert.equal(equipoParecido(EQUIPOS, 'ESTRELLADELSUR')?.id, 'e1')
  assert.equal(equipoParecido(EQUIPOS, 'atletico-norte')?.id, 'e2')
  assert.equal(equipoParecido(EQUIPOS, 'Estrella'), null)
  // No coincide con ninguno: se ofrece agregar lo escrito (sin espacios de más).
  assert.deepEqual(resultadosBuscador(EQUIPOS, '  Defensores   de Belgrano '), { opciones: [], existente: null, agregar: 'Defensores de Belgrano' })
  // Coincide en parte: se ven los que coinciden y también se ofrece agregar.
  const parcial = resultadosBuscador(EQUIPOS, 'Estrella del Norte')
  assert.equal(parcial.agregar, 'Estrella del Norte')
  // Otra escritura de uno que existe: se ofrece ese y no se agrega otro igual.
  const otra = resultadosBuscador(EQUIPOS, 'estrelladelsur')
  assert.deepEqual([otra.opciones.map((e) => e.id), otra.existente?.id, otra.agregar], [['e1'], 'e1', ''])
  // Vacío: todos, sin agregar.
  assert.deepEqual([resultadosBuscador(EQUIPOS, '').opciones.length, resultadosBuscador(EQUIPOS, '').agregar], [3, ''])
  // El otro equipo del partido no se ofrece.
  assert.deepEqual(resultadosBuscador(EQUIPOS, 'Otro club', { excluir: 'e3' }).opciones, [])
})

test('pantalla: «+ Agregar «…»» dentro de los resultados y el existente con otra escritura', async () => {
  const m = await montarComponente()
  try {
    const Selector = (await m.cargar('/src/components/analisis/SelectorEquipo.jsx')).default
    const agregados = []
    const elegidos = []
    await m.render(m.h(Selector, {
      etiqueta: 'Equipo local', equipos: EQUIPOS, valor: null, onElegir: (e) => elegidos.push(e),
      onAgregar: async (nombre) => { agregados.push(nombre); return { equipo: { id: 'nuevo', nombre } } },
    }))
    await m.clic(document.querySelector('.se-elegido'))
    const buscar = document.querySelector('.se-buscar')
    // Vacío: el botón suelto pide escribir.
    const pie = m.boton('Escribí el nombre para agregarlo')
    assert.ok(pie?.disabled)
    assert.equal(document.querySelector('[data-agregar]'), null)

    await m.escribir(buscar, 'Defensores de Belgrano')
    const lista = document.querySelector('.se-lista')
    assert.match(lista.textContent, /\+ Agregar «Defensores de Belgrano»/)
    assert.doesNotMatch(lista.textContent, /Ningún equipo coincide/)
    assert.equal(m.boton('Escribí el nombre para agregarlo'), undefined)

    // Otra escritura de uno que ya existe: aparece ese, sin «Agregar».
    await m.escribir(buscar, 'ESTRELLADELSUR')
    assert.match(lista.textContent, /Estrella del Sur \(ya está en el listado\)/)
    assert.equal(document.querySelector('[data-agregar]'), null)
    await m.clic([...lista.querySelectorAll('button')].find((b) => b.textContent.startsWith('Estrella del Sur')))
    assert.equal(elegidos[0].id, 'e1')

    // Agregar uno nuevo desde los resultados.
    await m.clic(document.querySelector('.se-elegido'))
    await m.escribir(document.querySelector('.se-buscar'), 'Club Nuevo')
    await m.clic(document.querySelector('[data-agregar]'))
    assert.deepEqual(agregados, ['Club Nuevo'])
    assert.equal(elegidos[1].id, 'nuevo')
  } finally {
    await m.cerrar()
  }
})
