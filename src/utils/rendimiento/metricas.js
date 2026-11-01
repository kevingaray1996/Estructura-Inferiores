import { fechaValida } from '../planificacion.js'
import { MAX_JUGADORAS_COMPARATIVA, MIN_JUGADORAS_PERCENTIL } from './configuracion.js'

const numero = v => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' &&
  Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null
const porcentaje = (n, d) => d > 0 ? n * 100 / d : null

export function resumirAcciones(eventos) {
  if (!Array.isArray(eventos)) return null
  const tipos = Object.create(null), resultados = { exitosos: 0, fallidos: 0, neutros: 0, pendientes: 0, desconocidos: 0 }
  for (const e of eventos) {
    tipos[e.tipo] = (tipos[e.tipo] || 0) + 1
    if (['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)) resultados.exitosos++
    else if (['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)) resultados.fallidos++
    else if (e.resultado === 'Neutro') resultados.neutros++
    else if (!e.resultado) resultados.pendientes++
    else resultados.desconocidos++
  }
  const correctos = tipos['Pase correcto'] || 0, incorrectos = tipos['Pase incorrecto'] || 0
  const evaluadas = resultados.exitosos + resultados.fallidos
  return { total: eventos.length, tipos, resultados,
    pases: { correctos, incorrectos, total: correctos + incorrectos, precision: porcentaje(correctos, correctos + incorrectos) },
    efectividad: { exitosos: resultados.exitosos, evaluadas, porcentaje: porcentaje(resultados.exitosos, evaluadas) } }
}

// Se espera una jugadora. No suma duplicados ni considera una fila ausente como cero.
export function resumirParticipacion(filas, partidoIds) {
  if (!Array.isArray(filas)) return { estado: 'no_disponible', minutos: null, titularidades: null }
  const esperados = [...new Set(partidoIds)]
  if (!esperados.length) return { estado: 'sin_registros', minutos: null, titularidades: null }
  let minutos = 0, titularidades = 0, minutosValidos = true, titularidadesValidas = true
  const incidencias = []
  for (const id of esperados) {
    const registros = filas.filter(f => f.partido_id === id)
    if (registros.length !== 1) {
      incidencias.push({ partidoId: id, motivo: registros.length ? 'participacion_duplicada' : 'participacion_ausente' })
      minutosValidos = false; titularidadesValidas = false; continue
    }
    const m = numero(registros[0].minutos_jugados)
    if (m === null) minutosValidos = false
    else minutos += m
    if (typeof registros[0].titular !== 'boolean') titularidadesValidas = false
    else if (registros[0].titular) titularidades++
  }
  return { estado: minutosValidos && titularidadesValidas ? 'disponible' : 'incompleto',
    minutos: minutosValidos ? minutos : null, titularidades: titularidadesValidas ? titularidades : null, incidencias }
}

export function filtrarPartidos(partidos, { desde, hasta, partidoIds } = {}) {
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta)) || (desde && hasta && desde > hasta)) throw new Error('Rango de fechas inválido.')
  return partidos.filter(p => (!partidoIds || partidoIds.includes(p.id)) &&
    (!desde && !hasta || fechaValida(p.fecha) && (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta)))
}

/** Cada fila representa exactamente un partido deportivo de una jugadora.
 * Solo tasas de acciones registradas, nunca acredita etiquetado completo.
 * No usa los minutos totales para normalizar un primer/segundo tiempo.
 */
export function calcularPor90(filas, { periodo = 'todos' } = {}) {
  const ids = filas.map(f => f.partidoId)
  if (periodo !== 'todos' || !filas.length || new Set(ids).size !== ids.length ||
      filas.some(f => !f.partidoId || f.estadoAnalisis !== 'con_acciones' && f.estadoAnalisis !== 'sin_acciones' ||
        numero(f.minutos) === null || Number(f.minutos) <= 0 || numero(f.acciones) === null)) {
    return { valor: null, motivo: 'Conjunto de partidos o minutos insuficiente.', cobertura: 'desconocida' }
  }
  const acciones = filas.reduce((s, f) => s + Number(f.acciones), 0), minutos = filas.reduce((s, f) => s + Number(f.minutos), 0)
  return { valor: acciones * 90 / minutos, acciones, minutos, partidoIds: ids, cobertura: 'desconocida',
    advertencia: 'Tasa de acciones registradas; no confirma cobertura completa del análisis.' }
}

/** Fuentes null = no consultadas o fallidas, [] = lectura confirmada sin filas.
 * El caller entrega fuentes del mismo usuario/categoría; no se infieren permisos.
 */
export function construirRendimiento({ partidos, analisis, eventos, estadisticas, fuentes = {} }, filtros = {}) {
  const disponible = nombre => Array.isArray({ partidos, analisis, eventos, estadisticas }[nombre]) &&
    !['error', 'denegado', 'no_disponible'].includes(fuentes[nombre]?.estado)
  if (!disponible('partidos')) return { estado: 'no_disponible', partidos: [], jugadoras: [], sinVinculo: [], fuentes }
  if (filtros.periodo != null && !['todos', 1, 2].includes(filtros.periodo)) throw new Error('Período inválido.')
  const seleccionados = filtrarPartidos(partidos, filtros)
  const ids = new Set(seleccionados.map(p => p.id)), todosIds = new Set(partidos.map(p => p.id))
  // Nunca asocia por rival/fecha. La categoría debe coincidir si ambas están informadas.
  const vinculo = a => partidos.find(p => p.id === a.partido_calendario_id &&
    (!p.categoria_id || !a.categoria_id || p.categoria_id === a.categoria_id))
  const vinculados = disponible('analisis') ? analisis.filter(a => vinculo(a) && ids.has(a.partido_calendario_id)) : []
  const sinVinculo = disponible('analisis') ? analisis.filter(a => !vinculo(a)).map(a => ({ id: a.id, motivo:
    todosIds.has(a.partido_calendario_id) ? 'categoria_incompatible' : 'vinculo_no_verificado_en_el_alcance' })) : []
  const mapaAnalisis = new Map(vinculados.map(a => [a.id, a]))
  const registrosPorId = new Map(), conflictos = new Set(), analisisInvalidos = new Set()
  for (const e of disponible('eventos') ? eventos : []) {
    if (!mapaAnalisis.has(e.partido_id)) continue
    if (!e.id) { analisisInvalidos.add(e.partido_id); continue }
    const firma = JSON.stringify([e.partido_id, e.jugador_id, e.tipo, e.resultado ?? null, e.segundo, e.periodo])
    if (registrosPorId.has(e.id) && registrosPorId.get(e.id).firma !== firma) {
      conflictos.add(e.id); analisisInvalidos.add(e.partido_id)
      analisisInvalidos.add(registrosPorId.get(e.id).partidoId)
    } else registrosPorId.set(e.id, { firma, partidoId: e.partido_id })
  }
  const idsEventos = new Set(), duplicados = [], eventosSinJugadora = []
  const validos = disponible('eventos') ? eventos.filter(e => {
    if (!mapaAnalisis.has(e.partido_id)) return false
    if (!e.id || idsEventos.has(e.id)) { duplicados.push(e.id || null); return false }
    idsEventos.add(e.id)
    if (conflictos.has(e.id)) return false
    if (!e.jugador_id) eventosSinJugadora.push(e.id)
    return (filtros.periodo == null || filtros.periodo === 'todos' || Number(e.periodo) === filtros.periodo)
  }) : null
  const estados = seleccionados.map(p => {
    const asociados = vinculados.filter(a => a.partido_calendario_id === p.id)
    const estado = !disponible('analisis') || !disponible('eventos') || asociados.some(a => analisisInvalidos.has(a.id)) ? 'no_disponible' : !asociados.length ? 'sin_analisis' :
      validos.some(e => asociados.some(a => a.id === e.partido_id)) ? 'con_acciones' : 'sin_acciones'
    return { ...p, estadoAnalisis: estado, analisisIds: asociados.map(a => a.id), cobertura: 'desconocida', multiplesAnalisis: asociados.length > 1 }
  })
  const jugadoraIds = filtros.jugadoraIds || [...new Set([
    ...(validos || []).map(e => e.jugador_id), ...(disponible('estadisticas') ? estadisticas.filter(s => ids.has(s.partido_id)).map(s => s.jugador_id) : []),
  ].filter(Boolean))]
  const jugadoras = [...new Set(jugadoraIds)].map(jugadorId => {
    const filas = estados.map(p => {
      const propios = validos?.filter(e => e.jugador_id === jugadorId && mapaAnalisis.get(e.partido_id).partido_calendario_id === p.id) ?? null
      const participacion = resumirParticipacion(disponible('estadisticas') ? estadisticas.filter(s => s.jugador_id === jugadorId) : null, [p.id])
      const acciones = p.estadoAnalisis === 'sin_analisis' || p.estadoAnalisis === 'no_disponible' ? null : resumirAcciones(propios)
      return { partidoId: p.id, estadoAnalisis: p.estadoAnalisis, acciones, participacion, cobertura: 'desconocida' }
    })
    const todosObservados = filas.length > 0 && filas.every(f => f.acciones !== null)
    return { jugadorId, partidos: filas,
      acciones: todosObservados ? resumirAcciones(validos.filter(e => e.jugador_id === jugadorId)) : null,
      participacion: resumirParticipacion(disponible('estadisticas') ? estadisticas.filter(s => s.jugador_id === jugadorId) : null, seleccionados.map(p => p.id)),
      por90: calcularPor90(filas.map(f => ({ partidoId: f.partidoId, acciones: f.acciones?.total, minutos: f.participacion.minutos, estadoAnalisis: f.estadoAnalisis })), filtros),
    }
  })
  return { estado: ['analisis', 'eventos', 'estadisticas'].every(disponible) ? 'disponible' : 'incompleto',
    partidos: estados, jugadoras, sinVinculo, eventosSinJugadora, duplicados, eventosConflictivos: [...conflictos], fuentes }
}

// Contrato de selección y normalización para futuras vistas, sin construirlas.
export function seleccionarJugadora(seleccion, id) {
  return seleccion.includes(id) ? seleccion : seleccion.length < MAX_JUGADORAS_COMPARATIVA ? [...seleccion, id] : seleccion
}
export function percentilInterno(valor, referencia) {
  const unicos = new Map()
  for (const fila of referencia) if (fila.jugadorId && !unicos.has(fila.jugadorId)) unicos.set(fila.jugadorId, numero(fila.valor))
  const validos = [...unicos.values()].filter(v => v !== null)
  if (numero(valor) === null || validos.length < MIN_JUGADORAS_PERCENTIL) return null
  const menores = validos.filter(v => v < Number(valor)).length
  const iguales = validos.filter(v => v === Number(valor)).length
  return (menores + iguales / 2) * 100 / validos.length
}
export function normalizarEscala(valor, minimo, maximo) {
  if (numero(valor) === null || !Number.isFinite(minimo) || !Number.isFinite(maximo) || maximo <= minimo) return null
  return Math.max(0, Math.min(100, (Number(valor) - minimo) * 100 / (maximo - minimo)))
}
