// Playlist de Análisis: lógica pura (sin React) para revisar y detallar las acciones de un partido.
import { reglasDe } from './catalogoAcciones.js'
import { zonaEvento } from '../orientacionAnalisis.js'

// Clip de cada acción: arranca 3 s antes y termina 5 s después.
export const SEGUNDOS_ANTES = 3
export const SEGUNDOS_DESPUES = 5

export function clipDe(evento) {
  const segundo = Math.max(0, Math.floor(Number(evento?.segundo) || 0))
  return { inicio: Math.max(0, segundo - SEGUNDOS_ANTES), fin: segundo + SEGUNDOS_DESPUES }
}

export const NOMBRE_FALTA = { jugadora: 'Jugadora', receptora: 'Receptora', zona: 'Zona', resultado: 'Resultado' }

// Qué le falta para estar detallada: jugadora; receptora si es un pase; zona o resultado si su tipo los usa.
// detalle: fila de analisis_pases_detalle (o undefined si no hay). Desconocida / No observable cuentan como detallada.
// partido: con él, una acción vieja con punto y sin zona tiene la zona calculada (no le falta).
export function faltasDetalle(evento, detalle, catalogo, partido = null) {
  const reglas = reglasDe(catalogo, evento.tipo)
  const faltan = []
  if (!evento.jugador_id) faltan.push('jugadora')
  if (reglas.es_pase && (!detalle || detalle.destinataria_estado === 'pendiente')) faltan.push('receptora')
  // El gol siempre pide la zona en la Playlist (lo carga COMET o el botón del marcador sin ubicación), aunque en el
  // catálogo sea opcional. No cambia los cálculos del informe.
  if ((reglas.ubicacion === 'obligatoria' || evento.tipo === 'Gol') && !zonaEvento(evento, partido)) faltan.push('zona')
  if (reglas.resultados.length > 0 && !evento.resultado) faltan.push('resultado')
  return faltan
}

export function estaDetallada(evento, detalles, catalogo, partido = null) {
  return faltasDetalle(evento, detalles?.[evento.id], catalogo, partido).length === 0
}

export function progresoDetalle(eventos, detalles, catalogo, partido = null) {
  const detalladas = eventos.filter((e) => estaDetallada(e, detalles, catalogo, partido)).length
  return { detalladas, total: eventos.length }
}

// filtros: { tipo: 'todos' | código, jugadora: 'todos' | id, soloPendientes: boolean }
export function filtrarPlaylist(eventos, filtros, detalles, catalogo, partido = null) {
  return eventos.filter((e) =>
    (!filtros.tipo || filtros.tipo === 'todos' || e.tipo === filtros.tipo) &&
    (!filtros.jugadora || filtros.jugadora === 'todos' || e.jugador_id === filtros.jugadora) &&
    (!filtros.soloPendientes || !estaDetallada(e, detalles, catalogo, partido)))
}

// Anterior / siguiente en la lista visible. Sin selección: ↓ va a la primera y ↑ a la última. Sin vuelta al otro extremo.
export function vecina(lista, idActual, paso) {
  if (!lista.length) return null
  const i = lista.findIndex((e) => e.id === idActual)
  if (i < 0) return paso > 0 ? lista[0].id : lista[lista.length - 1].id
  const destino = lista[i + paso]
  return destino ? destino.id : idActual
}

// Próxima acción sin detallar después de la actual (en orden de la lista); si no hay, la primera pendiente de antes.
export function siguientePendiente(lista, idActual, detalles, catalogo, partido = null) {
  const i = lista.findIndex((e) => e.id === idActual)
  const orden = [...lista.slice(i + 1), ...lista.slice(0, Math.max(i, 0))]
  return orden.find((e) => e.id !== idActual && !estaDetallada(e, detalles, catalogo, partido))?.id || null
}

// Dorsal escrito con números. citacion: la jugadora con ese dorsal (o null).
// esperar: true si otro dorsal empieza igual (con «1» puede venir «10»), así se espera al próximo número.
export function resolverDorsal(citaciones, texto) {
  const buscado = String(texto || '').trim()
  if (!/^\d{1,2}$/.test(buscado)) return { citacion: null, esperar: false }
  const dorsales = citaciones.filter((c) => c.dorsal !== null && c.dorsal !== undefined && c.dorsal !== '')
  return {
    citacion: dorsales.find((c) => String(c.dorsal) === buscado) || null,
    esperar: buscado.length < 2 && dorsales.some((c) => String(c.dorsal) !== buscado && String(c.dorsal).startsWith(buscado)),
  }
}
