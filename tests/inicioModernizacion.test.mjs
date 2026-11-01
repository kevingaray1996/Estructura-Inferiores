import test from 'node:test'
import assert from 'node:assert/strict'
import { esComunicaciones, resumenComunicaciones } from '../src/utils/datafem.js'
import { cargarSesionesAgenda } from '../src/utils/calendario.js'
import { fechaArgentina, sumarDias } from '../src/utils/planificacion.js'

test('DataFem: identificación exacta, normalización, cero puntos y ambigüedad sin inventar posiciones', () => {
  assert.ok(esComunicaciones('  COMUNICACIÓNES  '))
  for (const nombre of ['Club Comunicaciones', 'Comunicaciones B', '', null]) assert.equal(esComunicaciones(nombre), false)
  const fila = { equipo: 'Comunicaciones', posicion: 8, puntos: 0 }
  assert.deepEqual(resumenComunicaciones({ zona_a: [fila], general: [fila] }), { zona: 'Zona A', posicion: 8, puntos: 0 })
  assert.equal(resumenComunicaciones({ zona_a: [fila], zona_b: [fila] }), null)
  assert.equal(resumenComunicaciones({ zona_a: [fila, fila] }), null)
  for (const posicion of [null, '', 0, 1.5, undefined]) assert.equal(resumenComunicaciones({ zona_b: [{ ...fila, posicion }] }), null)
  assert.equal(resumenComunicaciones({ zona_b: [{ ...fila, puntos: null }] }), null)
  assert.equal(resumenComunicaciones({ general: [fila] }), null)
})

test('Agenda: lectura mínima, permisos, duplicados legítimos, errores y fechas argentinas', async () => {
  const hoy = fechaArgentina(new Date('2027-01-01T02:59:59Z')), manana = sumarDias(hoy, 1)
  assert.equal(hoy, '2026-12-31'); assert.equal(manana, '2027-01-01')
  assert.equal(fechaArgentina(new Date('2027-01-01T03:00:00Z')), manana)
  const consultas = []
  const datos = ['a', 'b'].map(id => ({ id, categoria_id: 'cat', fecha: hoy, hora: '18:00', tipo: 'entrenamiento', estado: 'borrador' }))
  const cliente = { from(tabla) {
    const consulta = { tabla, filtros: [] }; consultas.push(consulta)
    const q = { select(campos) { consulta.campos = campos; return q },
      eq(k, v) { consulta.filtros.push([k, v]); return q }, gte() { return q }, lte() { return q },
      then(ok, mal) { return Promise.resolve({ data: [...datos, { ...datos[0], id: 'c', tipo: 'descanso' }] }).then(ok, mal) } }
    return q
  } }
  for (const perfil of [{ rol: 'medico' }, { rol: 'tecnico' }, { rol: 'preparador_fisico' }]) {
    assert.deepEqual(await cargarSesionesAgenda(cliente, perfil, hoy, manana, true), [])
  }
  assert.equal(consultas.length, 0)
  for (const rol of ['coordinacion', 'tecnico', 'preparador_fisico']) {
    assert.equal((await cargarSesionesAgenda(cliente, { rol, categoria_id: 'cat' }, hoy, manana, true)).length, 2)
    const q = consultas.at(-1)
    assert.equal(q.tabla, 'planificacion_sesiones')
    assert.doesNotMatch(q.campos, /\*|bloques|notas|observaciones|pizarra|responsable/)
    assert.ok(q.filtros.some(([k, v]) => k === 'tipo' && v === 'entrenamiento'))
    assert.equal(q.filtros.some(([k]) => k === 'categoria_id'), rol !== 'coordinacion')
  }
  const falla = { from() { return { select() { return this }, gte() { return this }, lte() { return this }, eq() { return this },
    then(ok) { return Promise.resolve({ error: { code: '42501' } }).then(ok) } } } }
  await assert.rejects(() => cargarSesionesAgenda(falla, { rol: 'coordinacion' }, hoy, manana, true), /no tiene acceso/)
})
