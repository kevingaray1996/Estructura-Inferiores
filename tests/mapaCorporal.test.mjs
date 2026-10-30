import test from 'node:test'
import assert from 'node:assert/strict'
import { CENTRALES, COLORES_CORPORALES, ZONAS_CORPORALES, colorZona, estadoFicha, fichasZona, puedeVerMedicos, ubicacionFicha, validarIncidencia } from '../src/utils/mapaCorporal.js'

const registro = { zona_corporal: 'rodilla', lateralidad: 'derecha', tipo_incidencia: 'molestia', estado_seguimiento: 'seguimiento', fecha: '2026-10-30' }
test('Mapa: catálogo simple y lateralidad anatómica validada', () => {
  assert.equal(ZONAS_CORPORALES.length, 19)
  assert.equal(new Set(ZONAS_CORPORALES.map(z => z.id)).size, 19)
  assert.equal(validarIncidencia(registro), null)
  assert.equal(validarIncidencia({ ...registro, lateralidad: 'ambos' }), null)
  for (const zona_corporal of CENTRALES) {
    assert.equal(validarIncidencia({ ...registro, zona_corporal, lateralidad: 'central' }), null)
    assert.ok(validarIncidencia({ ...registro, zona_corporal }))
  }
  assert.ok(validarIncidencia({ ...registro, zona_corporal: 'inventada' }))
})
test('Mapa: una molestia y un antecedente no son una lesión activa', () => {
  assert.equal(estadoFicha(registro), 'seguimiento')
  assert.equal(estadoFicha({ ...registro, tipo_incidencia: 'lesion_informada' }), 'lesion')
  assert.equal(estadoFicha({ ...registro, tipo_incidencia: 'lesion_informada', recuperado: true }), 'antecedente')
  assert.equal(estadoFicha({ descripcion: 'Sin clasificación' }), 'seguimiento')
})
test('Mapa: prioridad y ambos lados sin mezclar incidencias de otra zona', () => {
  const bilateral = { ...registro, lateralidad: 'ambos', tipo_incidencia: 'lesion_informada' }
  const historial = [registro, bilateral, { ...registro, recuperado: true }, { ...registro, zona_corporal: 'mano' }]
  assert.equal(fichasZona(historial, 'rodilla', 'derecha').length, 3)
  assert.equal(fichasZona(historial, 'rodilla', 'izquierda').length, 1)
  assert.equal(colorZona(historial, 'rodilla', 'derecha'), COLORES_CORPORALES.lesion)
  assert.equal(colorZona([registro], 'rodilla', 'derecha'), COLORES_CORPORALES.seguimiento)
  assert.equal(colorZona([{ ...registro, recuperado: true }], 'rodilla', 'derecha'), COLORES_CORPORALES.antecedente)
  assert.equal(colorZona([], 'pie', 'derecha'), COLORES_CORPORALES.sin_registros)
})
test('Mapa: resolución coherente sin fecha inventada', () => {
  assert.ok(validarIncidencia({ ...registro, estado_seguimiento: 'resuelta' }))
  assert.ok(validarIncidencia({ ...registro, estado_seguimiento: 'resuelta', fecha_resolucion: '2026-10-29' }))
  assert.equal(validarIncidencia({ ...registro, estado_seguimiento: 'resuelta', fecha_resolucion: '2026-10-30' }), null)
  assert.ok(validarIncidencia({ ...registro, fecha_resolucion: '2026-10-30' }))
  assert.ok(validarIncidencia({ ...registro, fecha: '2026-02-30' }))
  assert.ok(validarIncidencia({ ...registro, fecha: '2026-99-99' }))
})
test('Mapa: compatibilidad conservadora sin inferir diagnósticos ni lateralidad', () => {
  assert.equal(ubicacionFicha({ descripcion: 'Dolor de rodilla, posible sobrecarga' }), null)
  assert.equal(ubicacionFicha({ descripcion: 'Rodillas' }), null)
  assert.equal(ubicacionFicha({ descripcion: 'Rodillas derecha e izquierda' }), null)
  assert.deepEqual(ubicacionFicha({ descripcion: 'Rodillas derecha' }), { zona: 'rodilla', lado: 'derecha', inferida: true })
  assert.deepEqual(ubicacionFicha({ descripcion: 'Zona lumbar' }), { zona: 'lumbar', lado: 'central', inferida: true })
  assert.equal(ubicacionFicha({ ...registro, descripcion: 'Texto libre' }).inferida, false)
})
test('Mapa: solamente los tres roles existentes autorizados', () => {
  for (const rol of ['coordinacion','medico','preparador_fisico']) assert.equal(puedeVerMedicos({ rol }), true)
  for (const rol of ['tecnico','jugadora','anon',undefined]) assert.equal(puedeVerMedicos({ rol }), false)
  assert.equal(puedeVerMedicos(null), false)
})
