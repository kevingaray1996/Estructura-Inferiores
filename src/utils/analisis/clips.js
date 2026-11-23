// Clips de Análisis (etapa 2, docs/analisis-etapa2.md). Un clip es un rango del video de YouTube de una acción: no
// se corta ni se descarga nada. Lógica pura.
//   individual:  inicio = segundo − margen_antes,  fin = segundo + margen_despues
//   colectiva:   inicio = inicio − margen_antes,   fin = fin + margen_despues   (por defecto −2/+2)
// El ajuste de una playlist (ajuste_inicio, ajuste_fin) se suma a ese rango y nunca cambia la acción original.
import { margenesBase, reglasDe } from './catalogoAcciones.js'
import { espejoDe, esMomento } from './colectiva.js'
import { periodoPorMarcas } from './eventosPartido.js'
import { CLUB, ladosDelAnalisis } from './equipos.js'

export const AJUSTE_MAXIMO = 120
export const DURACION_MINIMA = 1

const entero = (v) => Math.floor(Number(v) || 0)

// Márgenes del tipo (del catálogo; si el catálogo no los trae, los de base).
export function margenesDe(catalogo, tipo, colectiva = false) {
  const reglas = reglasDe(catalogo, tipo)
  const base = margenesBase(tipo, colectiva || reglas.botonera === 'colectiva')
  return {
    antes: Number.isFinite(reglas.margen_antes) ? reglas.margen_antes : base.antes,
    despues: Number.isFinite(reglas.margen_despues) ? reglas.margen_despues : base.despues,
  }
}

// Rango del clip de una acción (individual o momento colectivo), con el ajuste de la playlist si lo hay.
export function rangoClip(evento, catalogo, ajuste = {}) {
  const colectiva = esMomento(evento, catalogo)
  const { antes, despues } = margenesDe(catalogo, evento.tipo, colectiva)
  const desde = Math.max(0, entero(evento.segundo))
  const hasta = colectiva ? Math.max(desde, entero(evento.segundo_fin ?? evento.segundo)) : desde
  return aplicarAjuste({ inicio: Math.max(0, desde - antes), fin: hasta + despues }, ajuste)
}

// Suma el ajuste propio del clip: inicio nunca negativo y el clip dura al menos 1 s.
export function aplicarAjuste(rango, { ajuste_inicio = 0, ajuste_fin = 0 } = {}) {
  const inicio = Math.max(0, rango.inicio + entero(ajuste_inicio))
  const fin = Math.max(inicio + DURACION_MINIMA, rango.fin + entero(ajuste_fin))
  return { inicio, fin }
}

// Botones ±1 s: devuelve el ajuste nuevo (solo de la playlist). No deja que el clip quede vacío o fuera de límites.
export function moverBorde(ajuste, borde, delta, rangoBase) {
  const actual = { ajuste_inicio: entero(ajuste?.ajuste_inicio), ajuste_fin: entero(ajuste?.ajuste_fin) }
  const campo = borde === 'inicio' ? 'ajuste_inicio' : 'ajuste_fin'
  const valor = Math.max(-AJUSTE_MAXIMO, Math.min(AJUSTE_MAXIMO, actual[campo] + entero(delta)))
  const nuevo = { ...actual, [campo]: valor }
  const inicio = rangoBase.inicio + nuevo.ajuste_inicio, fin = rangoBase.fin + nuevo.ajuste_fin
  if (inicio < 0 || fin - inicio < DURACION_MINIMA) return actual
  return nuevo
}

export const claveClip = (eventoId, espejo = false) => (espejo ? `${eventoId}:espejo` : String(eventoId))

// Clip de una acción de un análisis. espejo: el momento visto desde el otro equipo (su tipo es el espejo).
// Devuelve null si se pide el espejo de algo que no lo tiene.
export function crearClip(evento, { analisis, catalogo, equipos, marcas = null, espejo = false, ajuste = null, nota = '' }) {
  const momento = esMomento(evento, catalogo)
  const visto = espejo ? (momento ? espejoDe(evento, catalogo) : null) : evento
  if (!visto) return null
  const lados = ladosDelAnalisis(analisis, equipos)
  const equipo = !momento ? CLUB : (espejo ? lados.otro : lados.analizado)
  const rango = rangoClip(evento, catalogo, ajuste || {})
  return {
    clave: claveClip(evento.id, espejo),
    eventoId: evento.id,
    espejo: Boolean(espejo),
    colectiva: momento,
    tipo: visto.tipo,
    origen: espejo ? evento.tipo : null,
    partidoId: evento.partido_id,
    equipo,
    jugadoraId: momento ? null : evento.jugador_id || null,
    resultado: evento.resultado || null,
    segundo: entero(evento.segundo),
    segundoFin: momento ? entero(evento.segundo_fin ?? evento.segundo) : null,
    periodo: periodoPorMarcas(evento.segundo, marcas) ?? (Number(evento.periodo) === 2 ? 2 : 1),
    inicio: rango.inicio,
    fin: rango.fin,
    ajuste_inicio: entero(ajuste?.ajuste_inicio),
    ajuste_fin: entero(ajuste?.ajuste_fin),
    nota: nota || '',
  }
}

// Clips guardados de una playlist → clips listos para reproducir, en su orden. Los que apuntan a acciones que ya no
// se ven (borradas, o de otra categoría) se cuentan aparte.
export function resolverClipsGuardados(filas, { accionesPorId, analisisPorId, catalogo, equipos, marcasPorPartido }) {
  const clips = [], faltan = []
  for (const fila of [...(filas || [])].sort((a, b) => a.orden - b.orden)) {
    const evento = accionesPorId.get(fila.evento_id)
    const analisis = evento && analisisPorId.get(evento.partido_id)
    const clip = analisis && crearClip(evento, {
      analisis, catalogo, equipos, marcas: marcasPorPartido?.get?.(evento.partido_id) || null,
      espejo: fila.espejo, ajuste: fila, nota: fila.nota,
    })
    if (clip) clips.push({ ...clip, filaId: fila.id, orden: fila.orden })
    else faltan.push(fila)
  }
  return { clips, faltan }
}

// Mover un clip de lugar (arrastrar): devuelve la lista nueva.
export function moverClip(lista, desde, hasta) {
  const copia = [...lista]
  if (desde < 0 || desde >= copia.length || hasta < 0 || hasta >= copia.length || desde === hasta) return copia
  const [item] = copia.splice(desde, 1)
  copia.splice(hasta, 0, item)
  return copia
}
