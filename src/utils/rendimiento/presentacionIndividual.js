import { zonaEvento } from '../orientacionAnalisis.js'
import { fechaValida } from '../planificacion.js'
import { resumirAcciones } from './metricas.js'

export const FILTROS_INDIVIDUALES = Object.freeze({ partido: '', tipo: '', resultado: '', periodo: '', zona: '', minutoDesde: '', minutoHasta: '' })
export const numeroCoordenada = valor => (typeof valor === 'number' || typeof valor === 'string') && String(valor).trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0 && Number(valor) <= 100 ? Number(valor) : null
export function puntoEventoIndividual(e) {
  const x = numeroCoordenada(e.coordenada_x), y = numeroCoordenada(e.coordenada_y)
  return x === null || y === null ? null : { x, y }
}
export function filtrarEventosIndividual(eventos, filtros) {
  return eventos.filter(e => (!filtros.partido || e.partido_id === filtros.partido || filtros.analisisPartido?.includes(e.partido_id)) && (!filtros.tipo || e.tipo === filtros.tipo) &&
    (!filtros.resultado || (filtros.resultado === '__pendiente' ? !e.resultado : e.resultado === filtros.resultado)) &&
    (!filtros.periodo || String(e.periodo) === filtros.periodo) && (!filtros.zona || zonaEvento(e) === filtros.zona) &&
    ((!filtros.minutoDesde && !filtros.minutoHasta) || (typeof e.segundo === 'number' && Number.isFinite(e.segundo) && e.segundo >= 0 &&
      (!filtros.minutoDesde || e.segundo >= Number(filtros.minutoDesde) * 60) && (!filtros.minutoHasta || e.segundo < (Number(filtros.minutoHasta) + 1) * 60))))
}
// Solo presenta el contrato ya construido por el motor. No acredita permisos ni realiza lecturas.
export function accionesDeContrato(lectura, jugadorId, anio) {
  if (lectura?.estado && !['disponible', 'parcial'].includes(lectura.estado)) return null
  const contrato = lectura?.contrato
  if (!['disponible', 'parcial'].includes(contrato?.estado) || String(contrato.anio) !== String(anio) ||
      !['eventos', 'analisis', 'partidos'].every(k => contrato.fuentes?.[k]?.estado === 'disponible')) return null
  const datos = contrato.jugadoras.find(j => j.jugadorId === jugadorId)
  if (!datos || datos.acciones.estado !== 'con_registros') return datos?.acciones.estado === 'sin_registros_accesibles' ? [] : null
  return [...datos.acciones.vinculadas, ...datos.acciones.sinVinculo]
}
export function distribucionIndividual(eventos) {
  const resumen = resumirAcciones(eventos)
  return Object.entries(resumen.tipos).map(([tipo, cantidad]) => ({ tipo, cantidad, ...resumirAcciones(eventos.filter(e => e.tipo === tipo)) })).sort((a,b) => b.cantidad-a.cantidad || a.tipo.localeCompare(b.tipo))
}
export function evolucionIndividual(eventos, analisis) {
  const grupos = new Map()
  for (const a of analisis) {
    const p = a.partido_deportivo
    if (!p?.id || p.id !== a.partido_calendario_id || !fechaValida(p.fecha)) continue
    const propios = eventos.filter(e => e.partido_id === a.id)
    if (!propios.length) continue
    if (!grupos.has(p.id)) grupos.set(p.id, { id:p.id, fecha:p.fecha, rival:p.rival, eventos:new Map() })
    for (const e of propios) grupos.get(p.id).eventos.set(e.id,e)
  }
  return [...grupos.values()].map(g=>({id:g.id,fecha:g.fecha,rival:g.rival,resumen:resumirAcciones([...g.eventos.values()])}))
    .sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
}
export const nombreIndividual = j => [j.apellido, j.nombre].filter(Boolean).join(', ')

const colores = ['#F2C230', '#64D5FF', '#C5A3FF', '#FFAA76', '#70DFC0']
export const colorTipoIndividual = tipo => colores[[...String(tipo)].reduce((n,c) => n+c.charCodeAt(0),0)%colores.length]
