// El catálogo de tipos de Análisis pasó de constantes en AnalisisSection.jsx a
// catalogoAcciones.js (y a la tabla analisis_tipos_accion). Esta comprobación
// conserva lo que protegía la comparación literal del bloque viejo: mismos
// tipos, botones e íconos en el mismo orden, y mismas zonas y resultados.
import assert from 'node:assert/strict'
import { CATALOGO_BASE } from '../../src/utils/analisis/catalogoAcciones.js'

const trozo = (s, inicio, fin) => {
  const a = s.indexOf(inicio)
  assert.ok(a >= 0, `Falta ${inicio}`)
  return s.slice(a, s.indexOf(fin, a) + fin.length)
}

export function compararCatalogoAnalisis(actual, referencia) {
  const rapidos = [...referencia.matchAll(/\{ nombre: '([^']+)', corto: '([^']+)', icono: '([^']+)'/g)].map(m => m.slice(1))
  assert.equal(rapidos.length, 16, 'La referencia tiene los 16 tipos rápidos')
  assert.deepEqual(CATALOGO_BASE.map(t => [t.codigo, t.etiqueta_boton, t.icono]), rapidos)
  for (const [inicio, fin] of [
    ['const ZONAS = [', ']\n'],
    ['const RESULTADOS = [', ']\n'],
    ['const RESULTADOS_DESPEJE =', '\n'],
    ['const CRITERIO_DESPEJE =', '\n'],
    ['function validarResultadoAccion(', '\n}\n'],
  ]) assert.equal(trozo(actual, inicio, fin), trozo(referencia, inicio, fin), inicio)
}
