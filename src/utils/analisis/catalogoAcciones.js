// Catálogo de tipos de acción: reglas de cada tipo leídas de
// analisis_tipos_accion. Si la tabla no está, se usa el catálogo base, que
// repite los valores con los que la migración llena la tabla.

export const RESULTADOS_VALIDOS = ['Exitoso', 'Fallido', 'Neutro', 'Gol', 'Atajada', 'Fuera', 'Bloqueado']
export const GRUPOS = ['ofensiva', 'defensiva', 'arquera', 'pelota_parada', 'otras']

// Solo tokens del tema: nunca un color suelto.
const COLORES = {
  acento: 'var(--ui-acento)',
  exito: 'var(--ui-exito)',
  peligro: 'var(--ui-peligro)',
  alerta: 'var(--ui-alerta)',
  info: 'var(--ui-info)',
  neutro: 'var(--ui-neutro)',
}

const tipo = (codigo, etiqueta_boton, icono, color, ubicacion, resultados, resultado_implicito, grupo, orden) => ({
  codigo, etiqueta: codigo, etiqueta_boton, icono, color, ubicacion, resultados, resultado_implicito,
  es_pase: codigo === 'Pase correcto' || codigo === 'Pase incorrecto', grupo, orden, visible: true, atajo: null,
})
const CON_RESULTADO = ['Exitoso', 'Fallido', 'Neutro']

export const CATALOGO_BASE = Object.freeze([
  tipo('Pase correcto', 'Pase +', '↗', 'exito', 'obligatoria', [], 'Exitoso', 'ofensiva', 1),
  tipo('Pase incorrecto', 'Pase −', '↘', 'peligro', 'obligatoria', [], 'Fallido', 'ofensiva', 2),
  tipo('Pérdida', 'Pérdida', '×', 'peligro', 'obligatoria', [], null, 'ofensiva', 3),
  tipo('Recuperación', 'Recuperación', '↺', 'exito', 'obligatoria', [], null, 'defensiva', 4),
  tipo('Remate', 'Remate', '◎', 'acento', 'obligatoria', ['Gol', 'Atajada', 'Fuera', 'Bloqueado'], null, 'ofensiva', 5),
  tipo('Centro', 'Centro', '⌁', 'acento', 'obligatoria', CON_RESULTADO, null, 'ofensiva', 6),
  tipo('Duelo ofensivo', 'Duelo of.', '⚔', 'acento', 'obligatoria', CON_RESULTADO, null, 'ofensiva', 7),
  tipo('Duelo defensivo', 'Duelo def.', '◆', 'info', 'obligatoria', CON_RESULTADO, null, 'defensiva', 8),
  tipo('Duelo aéreo', 'Duelo aéreo', '↑', 'info', 'obligatoria', CON_RESULTADO, null, 'defensiva', 9),
  tipo('Atajada', 'Atajada', '⊙', 'exito', 'opcional', [], null, 'arquera', 10),
  tipo('Salida de arquera', 'Salida', '↗', 'info', 'opcional', [], null, 'arquera', 11),
  tipo('Gol', 'Gol', '⚽', 'acento', 'opcional', [], null, 'ofensiva', 12),
  tipo('Falta cometida', 'Falta com.', '!', 'peligro', 'obligatoria', [], null, 'pelota_parada', 13),
  tipo('Falta recibida', 'Falta rec.', '+', 'exito', 'obligatoria', [], null, 'pelota_parada', 14),
  tipo('Intercepción', 'Intercepción', '↯', 'info', 'obligatoria', [], null, 'defensiva', 15),
  tipo('Despeje', 'Despeje', '⇧', 'info', 'obligatoria', CON_RESULTADO, null, 'defensiva', 16),
])

function normalizar(fila) {
  const resultadoValido = (r) => RESULTADOS_VALIDOS.includes(r)
  const implicito = resultadoValido(fila.resultado_implicito) ? fila.resultado_implicito : null
  return {
    codigo: String(fila.codigo),
    etiqueta: fila.etiqueta?.trim() || String(fila.codigo),
    etiqueta_boton: fila.etiqueta_boton?.trim() || fila.etiqueta?.trim() || String(fila.codigo),
    icono: fila.icono || '',
    color: Object.hasOwn(COLORES, fila.color) ? fila.color : 'acento',
    ubicacion: fila.ubicacion === 'opcional' ? 'opcional' : 'obligatoria',
    resultados: implicito ? [] : (Array.isArray(fila.resultados) ? fila.resultados.filter(resultadoValido) : []),
    resultado_implicito: implicito,
    es_pase: fila.es_pase === true,
    grupo: GRUPOS.includes(fila.grupo) ? fila.grupo : 'otras',
    orden: Number.isFinite(Number(fila.orden)) ? Number(fila.orden) : 0,
    visible: fila.visible !== false,
    atajo: /^[a-y]$/.test(fila.atajo || '') ? fila.atajo : null,
  }
}

export function crearCatalogo(filas) {
  const tipos = filas.map(normalizar).sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
  return { tipos, porCodigo: Object.fromEntries(tipos.map((t) => [t.codigo, t])) }
}

export const CATALOGO_POR_DEFECTO = crearCatalogo(CATALOGO_BASE)

// Un código sin fila (no debería pasar con la clave foránea) recibe reglas seguras.
export function reglasDe(catalogo, codigo) {
  return catalogo.porCodigo[codigo] || normalizar({ codigo, ubicacion: 'obligatoria', resultados: [] })
}

// En pantalla se muestra el nombre; en la base y en los cálculos, siempre el código.
export function etiquetaDe(catalogo, codigo) {
  return reglasDe(catalogo, codigo).etiqueta
}

export function etiquetaBotonDe(catalogo, codigo) {
  return reglasDe(catalogo, codigo).etiqueta_boton
}

export function opcionesResultado(catalogo, codigo) {
  const reglas = reglasDe(catalogo, codigo)
  return reglas.resultado_implicito ? [reglas.resultado_implicito] : reglas.resultados
}

export function colorDe(token) {
  return COLORES[token] || COLORES.acento
}

const faltaTabla = (error) => ['42P01', 'PGRST205'].includes(error?.code)

// Nunca falla: si no puede leer la tabla, devuelve el catálogo base con un aviso.
export async function cargarCatalogo(cliente) {
  const base = (aviso) => ({ catalogo: CATALOGO_POR_DEFECTO, origen: 'base', aviso })
  try {
    const { data, error } = await cliente.from('analisis_tipos_accion').select('*').order('orden')
    if (error) {
      return base(faltaTabla(error)
        ? 'Botonera con valores por defecto: falta aplicar la migración de tipos de acción.'
        : 'No se pudo leer la configuración de la botonera. Se usan los valores por defecto.')
    }
    if (!Array.isArray(data) || data.length === 0) return base('La configuración de la botonera está vacía. Se usan los valores por defecto.')
    return { catalogo: crearCatalogo(data), origen: 'tabla', aviso: '' }
  } catch {
    return base('No se pudo leer la configuración de la botonera. Se usan los valores por defecto.')
  }
}
