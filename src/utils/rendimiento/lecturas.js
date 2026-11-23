// Adaptador de solo lectura. No importa cliente global ni ejecuta lecturas al importar.
const CAMPOS = {
  partidos: 'id,categoria_id,fecha,rival',
  analisis: 'id,partido_calendario_id,categoria_id,fecha,rival',
  eventos: 'id,partido_id,jugador_id,tipo,resultado,segundo,periodo,coordenada_x,coordenada_y,zona,sistema_coordenadas,direccion_captura,periodo_captura',
  estadisticas: 'id,jugador_id,partido_id,minutos_jugados,titular,goles,asistencias,tarjetas_amarillas,tarjetas_rojas',
}
const denegado = e => ['42501', 'PGRST301', 'PGRST302'].includes(e?.code) || [401, 403].includes(e?.status)
// Columna que todavía no existe en la base (SQL de Análisis sin correr): se lee sin ella.
const faltaColumna = e => ['42703', 'PGRST204'].includes(e?.code)
async function conColumnaOpcional(conColumna, sinColumna) {
  try { return await conColumna() } catch (e) { if (faltaColumna(e)) return sinColumna(); throw e }
}
// Saca una columna auxiliar de cada fila (los cálculos reciben las mismas columnas de siempre).
const sin = (filas, columna) => filas.map(fila => { const copia = { ...fila }; delete copia[columna]; return copia })
export async function leerPaginas(consulta) {
  const filas = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await consulta().order('id').range(desde, desde + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Respuesta de lectura incompleta.')
    filas.push(...data)
    if (data.length < 500) return filas
  }
}
export async function leerPorIds(cliente, tabla, campos, columna, ids) {
  const filas = [], unicos = [...new Set(ids)]
  for (let i = 0; i < unicos.length; i += 100) {
    filas.push(...await leerPaginas(() => cliente.from(tabla).select(campos).in(columna, unicos.slice(i, i + 100))))
  }
  return filas
}

/** La categoría proviene del contexto autorizado; RLS decide el acceso real.
 * Se leen los IDs de encuentros de la categoría para verificar vínculos históricos.
 * No reutiliza los agregados sin partido de exportarEstadisticas para tasas por 90.
 */
export async function leerDatosRendimiento(cliente, categoriaId) {
  if (!categoriaId) throw new Error('Falta la categoría para consultar Rendimiento.')
  const resultado = { partidos: null, analisis: null, eventos: null, estadisticas: null, fuentes: {} }
  async function fuente(nombre, consulta) {
    try {
      resultado[nombre] = await consulta()
      resultado.fuentes[nombre] = { estado: 'disponible' }
    } catch (e) {
      resultado.fuentes[nombre] = { estado: denegado(e) ? 'denegado' : 'error',
        mensaje: denegado(e) ? 'Tu sesión no tiene acceso a esta fuente.' : 'No se pudo consultar esta fuente. Reintentá la lectura.' }
    }
  }
  await Promise.all([
    fuente('partidos', () => leerPaginas(() => cliente.from('partidos').select(CAMPOS.partidos).eq('categoria_id', categoriaId))),
    // Los partidos de scouting (no juega Comunicaciones) no cuentan en las estadísticas del club.
    fuente('analisis', () => conColumnaOpcional(
      async () => (await leerPaginas(() => cliente.from('analisis_partidos').select(`${CAMPOS.analisis},tipo_partido`).eq('categoria_id', categoriaId)))
        .filter(a => a.tipo_partido !== 'scouting').map(a => sin([a], 'tipo_partido')[0]),
      () => leerPaginas(() => cliente.from('analisis_partidos').select(CAMPOS.analisis).eq('categoria_id', categoriaId)),
    )),
  ])
  await Promise.all([
    resultado.partidos !== null ? fuente('estadisticas', () => leerPorIds(cliente, 'estadisticas_jugador', CAMPOS.estadisticas, 'partido_id', resultado.partidos.map(p => p.id))) :
      Promise.resolve(resultado.fuentes.estadisticas = { estado: 'no_disponible' }),
    // Las acciones colectivas (momentos con fin, sin jugadora) no son eventos individuales: no se cuentan.
    resultado.analisis !== null ? fuente('eventos', () => conColumnaOpcional(
      async () => (await leerPorIds(cliente, 'analisis_eventos', `${CAMPOS.eventos},segundo_fin`, 'partido_id', resultado.analisis.map(a => a.id)))
        .filter(e => e.segundo_fin === null || e.segundo_fin === undefined).map(e => sin([e], 'segundo_fin')[0]),
      () => leerPorIds(cliente, 'analisis_eventos', CAMPOS.eventos, 'partido_id', resultado.analisis.map(a => a.id)),
    )) :
      Promise.resolve(resultado.fuentes.eventos = { estado: 'no_disponible' }),
  ])
  return resultado
}
