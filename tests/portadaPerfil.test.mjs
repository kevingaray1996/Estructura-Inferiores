import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { armarPortadaPerfil, calcularEdad, dibujarPortadaPerfil } from '../src/utils/pdf/portadaPerfil.js'

const hoy = new Date(2026, 10, 12)
const jugador = { nombre: 'Martina', apellido: 'García', posicion: 'Delantera', fecha_nacimiento: '2007-03-20', categorias: { nombre: 'Primera' } }
const completo = {
  jugador,
  dorsal: 10,
  totales: { partidos: 14, minutos: 1120, goles: 6, asistencias: 3 },
  resumenAsistencia: { presente: 40, tarde: 4, ausente: 4, lesionado: 3, enfermo: 1 },
  totalAsistenciaMarcada: 52,
  cmjHistorial: [{ fecha: '2026-09-01', valor_cm: 39 }, { fecha: '2026-11-03', valor_cm: 41.5 }, { fecha: '2026-10-01', valor_cm: 40.2 }],
}
const tarjetas = (p) => p.tarjetas.map(t => [t.etiqueta, t.valor, t.detalle])

test('Edad: años cumplidos a la fecha del informe', () => {
  assert.equal(calcularEdad('2007-03-20', hoy), 19)
  assert.equal(calcularEdad('2007-11-13', hoy), 18)
  assert.equal(calcularEdad(null, hoy), null)
})

test('Portada completa: identidad, chips y seis tarjetas', () => {
  const p = armarPortadaPerfil(completo, hoy)
  assert.deepEqual([p.apellido, p.nombre, p.iniciales, p.dorsal, p.fecha], ['GARCÍA', 'Martina', 'MG', '10', '12/11/2026'])
  assert.deepEqual(p.chips, ['Delantera', '19 años', 'Primera'])
  assert.deepEqual(tarjetas(p), [
    ['Partidos', '14', ''],
    ['Minutos', '1.120', ''],
    ['Goles', '6', ''],
    ['Asistencias', '3', ''],
    // (40 + 4) / (52 − 3 − 1) = 44 / 48 = 91,7 % → 92 %
    ['Asistencia a entrenamientos', '92%', 'sobre 48 sesiones'],
    ['Último CMJ (cm)', '41,5', '03/11/2026'],
  ])
})

test('Sin partidos no hay tarjetas de partido; con partidos, un 0 es un dato real', () => {
  const sinPartidos = armarPortadaPerfil({ ...completo, totales: { partidos: 0, minutos: 0, goles: 0, asistencias: 0 } }, hoy)
  assert.deepEqual(sinPartidos.tarjetas.map(t => t.clave), ['asistencia', 'cmj'])
  const sinGoles = armarPortadaPerfil({ ...completo, totales: { partidos: 2, minutos: 90, goles: 0, asistencias: 0 } }, hoy)
  assert.deepEqual(tarjetas(sinGoles).slice(0, 4), [['Partidos', '2', ''], ['Minutos', '90', ''], ['Goles', '0', ''], ['Asistencias', '0', '']])
})

test('Asistencia: lesionada y enferma no cuentan; sin sesiones computables no hay tarjeta', () => {
  const una = armarPortadaPerfil({ ...completo, resumenAsistencia: { presente: 1, tarde: 0, ausente: 0, lesionado: 2, enfermo: 0 }, totalAsistenciaMarcada: 3 }, hoy)
  assert.deepEqual(una.tarjetas.find(t => t.clave === 'asistencia'), { clave: 'asistencia', etiqueta: 'Asistencia a entrenamientos', valor: '100%', detalle: 'sobre 1 sesión' })
  const justificadas = armarPortadaPerfil({ ...completo, resumenAsistencia: { presente: 0, tarde: 0, ausente: 0, lesionado: 2, enfermo: 1 }, totalAsistenciaMarcada: 3 }, hoy)
  assert.equal(justificadas.tarjetas.some(t => t.clave === 'asistencia'), false)
  const sinMarcas = armarPortadaPerfil({ ...completo, resumenAsistencia: { presente: 0, tarde: 0, ausente: 0, lesionado: 0, enfermo: 0 }, totalAsistenciaMarcada: 0 }, hoy)
  assert.equal(sinMarcas.tarjetas.some(t => t.clave === 'asistencia'), false)
})

test('CMJ: la medición más reciente; sin mediciones válidas no hay tarjeta', () => {
  assert.equal(armarPortadaPerfil({ ...completo, cmjHistorial: [] }, hoy).tarjetas.some(t => t.clave === 'cmj'), false)
  assert.equal(armarPortadaPerfil({ ...completo, cmjHistorial: [{ fecha: '2026-11-03', valor_cm: null }] }, hoy).tarjetas.some(t => t.clave === 'cmj'), false)
  const entero = armarPortadaPerfil({ ...completo, cmjHistorial: [{ fecha: '2026-11-03', valor_cm: 40 }] }, hoy)
  assert.equal(entero.tarjetas.find(t => t.clave === 'cmj').valor, '40')
})

test('Datos faltantes: sin dorsal, sin chips vacíos y sin tarjetas', () => {
  const p = armarPortadaPerfil({ jugador: { nombre: 'Ana', apellido: 'Pérez' }, dorsal: null, totales: { partidos: 0 }, resumenAsistencia: {}, totalAsistenciaMarcada: 0, cmjHistorial: [] }, hoy)
  assert.deepEqual([p.apellido, p.iniciales, p.dorsal, p.chips, p.tarjetas], ['PÉREZ', 'AP', null, [], []])
})

test('Dibujo: una página con el encabezado, la jugadora y las tarjetas', () => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  dibujarPortadaPerfil(doc, armarPortadaPerfil(completo, hoy), { foto: null, escudo: null })
  assert.equal(doc.getNumberOfPages(), 1)
  const pdf = doc.output()
  for (const texto of ['CLUB COMUNICACIONES', 'INFORME DE JUGADORA', 'RENDIMIENTO', 'Martina', '1.120', '92%', 'sobre 48 sesiones', 'MG']) assert.ok(pdf.includes(texto), texto)
  // Sin tarjetas tampoco aparece el título de la sección.
  const vacio = new jsPDF({ unit: 'pt', format: 'a4' })
  dibujarPortadaPerfil(vacio, armarPortadaPerfil({ jugador, dorsal: null, totales: { partidos: 0 }, resumenAsistencia: {}, totalAsistenciaMarcada: 0, cmjHistorial: [] }, hoy), {})
  assert.ok(!vacio.output().includes('RENDIMIENTO'))
})
