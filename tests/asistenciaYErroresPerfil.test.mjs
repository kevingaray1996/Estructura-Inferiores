import test from 'node:test'
import assert from 'node:assert/strict'

// Mismo cálculo de asistencia que el PDF de perfil, y mensajes claros al guardar un perfil del staff.
const { asistenciaSobreSesiones } = await import('../src/utils/asistencia.js')
const { mensajeErrorPerfil } = await import('../src/utils/cuentasJugadoras.js')

test('Asistencia: (presentes + tardes) / (total − lesionada − enferma), "sobre N sesiones"', () => {
  // 4 presentes, 1 tarde, 2 ausentes, 2 justificadas (lesionada + enferma) = 9 registros → 5 / 7 = 71 %.
  assert.deepEqual(asistenciaSobreSesiones({ presentes: 4, tardes: 1, justificadas: 2, total: 9 }),
    { porcentaje: 71, sesiones: 7, detalle: 'sobre 7 sesiones' })
  assert.deepEqual(asistenciaSobreSesiones({ presentes: 1, tardes: 0, justificadas: 0, total: 1 }),
    { porcentaje: 100, sesiones: 1, detalle: 'sobre 1 sesión' })
  // Sin sesiones computables (nada o solo justificadas): no hay porcentaje.
  assert.equal(asistenciaSobreSesiones({ presentes: 0, tardes: 0, justificadas: 0, total: 0 }), null)
  assert.equal(asistenciaSobreSesiones({ presentes: 0, tardes: 0, justificadas: 3, total: 3 }), null)
})

test('Usuarios: errores al guardar un perfil con mensajes claros, sin códigos', () => {
  assert.equal(mensajeErrorPerfil({ code: '23505', message: 'email_en_uso' }),
    'Ese mail ya pertenece a una jugadora. Usá otro mail para este usuario.')
  assert.equal(mensajeErrorPerfil({ code: '23505', message: 'duplicate key value violates unique constraint "perfiles_pkey"' }),
    'Ese mail ya pertenece a otro usuario del staff. Buscalo en la lista y editalo.')
  assert.equal(mensajeErrorPerfil({ code: '42501', message: 'permission denied' }),
    'No tenés permiso para guardar este perfil. Revisá tu sesión.')
  assert.equal(mensajeErrorPerfil({ code: 'XX000', message: 'algo raro' }), 'Error al guardar: algo raro')
})
