import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeError, mensajeErrorOPropio, esErrorDeServicio } from '../src/utils/mensajesError.js'

const casos = [
  [{ message: 'TypeError: Failed to fetch' }, /Revisá la conexión/],
  [{ message: 'Load failed' }, /Revisá la conexión/],
  [{ code: 'PGRST301', message: 'JWT expired' }, /sesión venció/],
  [{ code: '42501', message: 'new row violates row-level security policy for table "videos"' }, /no tiene permiso.*coordinación/],
  [{ statusCode: '403', message: 'new row violates row-level security policy' }, /no tiene permiso/],
  [{ statusCode: '413', message: 'The object exceeded the maximum allowed size' }, /muy pesado.*5 MB/],
  [{ statusCode: '415', message: 'mime type application/pdf is not supported' }, /no es una imagen/],
  [{ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, /ya existe un registro igual/],
  [{ code: '23503', message: 'update or delete on table "partidos" violates foreign key constraint … is still referenced from table "x"' }, /tiene otros datos asociados/],
  [{ code: '23503', message: 'insert or update … Key is not present in table "categorias"' }, /ya no existe.*Recargá/],
  [{ code: '22001', message: 'value too long for type character varying(50)' }, /demasiado largo/],
  [{ code: '23502', message: 'null value in column "nombre" violates not-null constraint' }, /dato obligatorio/],
  [{ code: 'XX000', message: 'internal error' }, /Probá de nuevo; si sigue pasando, avisá a coordinación/],
  [null, /Probá de nuevo/],
]

test('mensajeError traduce cada tipo de error a castellano, sin texto técnico ni en inglés', () => {
  for (const [error, esperado] of casos) {
    const texto = mensajeError(error, 'guardar')
    assert.match(texto, esperado, JSON.stringify(error))
    assert.match(texto, /^(No se pudo guardar|Tu sesión)/)
    assert.doesNotMatch(texto, /violates|duplicate|constraint|JWT|fetch|policy|mime|null value/i)
  }
})

test('la acción completa la frase', () => {
  assert.equal(mensajeError({ code: 'XX' }, 'subir la foto'), 'No se pudo subir la foto. Probá de nuevo; si sigue pasando, avisá a coordinación.')
})

test('mensajeErrorOPropio conserva los mensajes propios de la app y traduce los de la base', () => {
  assert.equal(mensajeErrorOPropio(new Error('Elegí un video antes de etiquetar.'), 'guardar'), 'Elegí un video antes de etiquetar.')
  assert.match(mensajeErrorOPropio({ code: '42501', message: 'permission denied for table x' }, 'guardar'), /no tiene permiso/)
  assert.match(mensajeErrorOPropio(new TypeError('Failed to fetch'), 'guardar'), /Revisá la conexión/)
  assert.match(mensajeErrorOPropio({}, 'guardar'), /Probá de nuevo/)
  assert.equal(esErrorDeServicio(new Error('Archivo demasiado grande.')), false)
})
