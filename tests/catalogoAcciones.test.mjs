import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOGO_BASE, CATALOGO_POR_DEFECTO, cargarCatalogo, colorDe, crearCatalogo, etiquetaBotonDe, etiquetaDe, opcionesResultado, reglasDe,
} from '../src/utils/analisis/catalogoAcciones.js'

const controlArquera = {
  codigo: 'control_de_arquera', etiqueta: 'Control de arquera', etiqueta_boton: 'Control', icono: '✋', color: 'info',
  ubicacion: 'opcional', resultados: [], resultado_implicito: null, es_pase: false, grupo: 'arquera', orden: 17, visible: true, atajo: 'k',
}
const cliente = respuesta => ({ from(tabla) {
  assert.equal(tabla, 'analisis_tipos_accion')
  const q = { select: () => q, order: () => Promise.resolve(respuesta) }
  return q
} })

test('Catálogo base: los 16 tipos actuales con las reglas acordadas', () => {
  assert.equal(CATALOGO_BASE.length, 16)
  assert.deepEqual(CATALOGO_POR_DEFECTO.tipos.map(t => t.codigo).slice(0, 3), ['Pase correcto', 'Pase incorrecto', 'Pérdida'])
  assert.deepEqual(CATALOGO_BASE.filter(t => t.ubicacion === 'opcional').map(t => t.codigo).sort(), ['Atajada', 'Gol', 'Salida de arquera'])
  assert.deepEqual(CATALOGO_BASE.filter(t => t.es_pase).map(t => t.codigo), ['Pase correcto', 'Pase incorrecto'])
  assert.deepEqual(reglasDe(CATALOGO_POR_DEFECTO, 'Remate').resultados, ['Gol', 'Atajada', 'Fuera', 'Bloqueado'])
  assert.deepEqual(reglasDe(CATALOGO_POR_DEFECTO, 'Despeje').resultados, ['Exitoso', 'Fallido', 'Neutro'])
  assert.deepEqual(reglasDe(CATALOGO_POR_DEFECTO, 'Pérdida').resultados, [])
  assert.equal(reglasDe(CATALOGO_POR_DEFECTO, 'Falta cometida').grupo, 'pelota_parada')
})

test('Opciones de resultado: fijo en pases, lista en el resto, nada si no lleva', () => {
  assert.deepEqual(opcionesResultado(CATALOGO_POR_DEFECTO, 'Pase correcto'), ['Exitoso'])
  assert.deepEqual(opcionesResultado(CATALOGO_POR_DEFECTO, 'Pase incorrecto'), ['Fallido'])
  assert.deepEqual(opcionesResultado(CATALOGO_POR_DEFECTO, 'Centro'), ['Exitoso', 'Fallido', 'Neutro'])
  assert.deepEqual(opcionesResultado(CATALOGO_POR_DEFECTO, 'Recuperación'), [])
})

test('Tabla: ordena por orden, normaliza valores inválidos y acepta tipos nuevos', () => {
  const catalogo = crearCatalogo([
    { ...controlArquera },
    { ...CATALOGO_BASE[0], orden: 20 },
    { ...CATALOGO_BASE[2], ubicacion: 'rara', resultados: ['Exitoso', 'Inventado'], color: '#ff0000', orden: 5 },
  ])
  assert.deepEqual(catalogo.tipos.map(t => t.codigo), ['Pérdida', 'control_de_arquera', 'Pase correcto'])
  const perdida = reglasDe(catalogo, 'Pérdida')
  assert.equal(perdida.ubicacion, 'obligatoria')
  assert.deepEqual(perdida.resultados, ['Exitoso'])
  assert.equal(perdida.color, 'acento')
  assert.equal(reglasDe(catalogo, 'control_de_arquera').etiqueta, 'Control de arquera')
})

test('Código desconocido: valores seguros y el código como nombre', () => {
  const r = reglasDe(CATALOGO_POR_DEFECTO, 'Algo viejo')
  assert.deepEqual([r.codigo, r.etiqueta, r.ubicacion, r.resultados, r.resultado_implicito, r.es_pase], ['Algo viejo', 'Algo viejo', 'obligatoria', [], null, false])
})

test('Colores: solo tokens del tema', () => {
  assert.equal(colorDe('exito'), 'var(--ui-exito)')
  assert.equal(colorDe('info'), 'var(--ui-info)')
  assert.equal(colorDe('#123456'), 'var(--ui-acento)')
})

test('Carga: con tabla, sin tabla, vacía, con error o con una excepción', async () => {
  const conTabla = await cargarCatalogo(cliente({ data: [controlArquera, ...CATALOGO_BASE], error: null }))
  assert.equal(conTabla.origen, 'tabla'); assert.equal(conTabla.aviso, '')
  assert.equal(conTabla.catalogo.tipos.length, 17)

  const sinTabla = await cargarCatalogo(cliente({ data: null, error: { code: '42P01', message: 'relation does not exist' } }))
  assert.equal(sinTabla.origen, 'base'); assert.match(sinTabla.aviso, /falta aplicar la migración/)
  assert.equal(sinTabla.catalogo, CATALOGO_POR_DEFECTO)
  const sinTablaApi = await cargarCatalogo(cliente({ data: null, error: { code: 'PGRST205' } }))
  assert.match(sinTablaApi.aviso, /falta aplicar la migración/)

  const vacia = await cargarCatalogo(cliente({ data: [], error: null }))
  assert.equal(vacia.origen, 'base'); assert.match(vacia.aviso, /valores por defecto/)

  const fallo = await cargarCatalogo(cliente({ data: null, error: { code: '500', message: 'caído' } }))
  assert.equal(fallo.origen, 'base'); assert.match(fallo.aviso, /No se pudo leer/)

  const excepcion = await cargarCatalogo({ from() { throw Error('sin red') } })
  assert.equal(excepcion.origen, 'base'); assert.match(excepcion.aviso, /No se pudo leer/)
})

test('El catálogo base coincide con las filas que inserta la migración', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync('supabase/migrations/20261111120000_tipos_accion_configurables.sql', 'utf8')
  const fila = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'(\w+)',\s*'(\w+)',\s*'\{([^}]*)\}',\s*(null|'\w+'),\s*(true|false),\s*'(\w+)',\s*(\d+)\)/g
  const filas = [...sql.matchAll(fila)].map(m => ({
    codigo: m[1], etiqueta: m[2], etiqueta_boton: m[3], icono: m[4], color: m[5], ubicacion: m[6],
    resultados: m[7] ? m[7].split(',') : [], resultado_implicito: m[8] === 'null' ? null : m[8].slice(1, -1),
    es_pase: m[9] === 'true', grupo: m[10], orden: Number(m[11]),
  }))
  assert.equal(filas.length, 16)
  const enCodigo = CATALOGO_BASE.map(({ visible, atajo, ...resto }) => (assert.equal(visible, true), assert.equal(atajo, null), resto))
  assert.deepEqual(filas, enCodigo)
  assert.match(sql, /atajo ~ '\^\[a-y\]\$'/)
})

test('Nombres: largo para listas, corto para botones, el código si no hay fila', () => {
  const catalogo = crearCatalogo([
    { ...CATALOGO_BASE[0], etiqueta: 'Pase bien', etiqueta_boton: 'P+' },
    { ...controlArquera, etiqueta_boton: '' },
  ])
  assert.equal(etiquetaDe(catalogo, 'Pase correcto'), 'Pase bien')
  assert.equal(etiquetaBotonDe(catalogo, 'Pase correcto'), 'P+')
  // Sin nombre corto, el botón usa el largo.
  assert.equal(etiquetaBotonDe(catalogo, 'control_de_arquera'), 'Control de arquera')
  assert.equal(etiquetaDe(catalogo, 'Algo viejo'), 'Algo viejo')
  assert.equal(etiquetaBotonDe(catalogo, 'Algo viejo'), 'Algo viejo')
  assert.equal(etiquetaDe(CATALOGO_POR_DEFECTO, 'Pase incorrecto'), 'Pase incorrecto')
  assert.equal(etiquetaBotonDe(CATALOGO_POR_DEFECTO, 'Pase incorrecto'), 'Pase −')
})
