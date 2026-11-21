// Mapa de acciones: lógica pura (capas, resultado, dirección, progresivos, calor, zonas y resumen).
// Todo se acomoda para que SIEMPRE ataquemos hacia la derecha: x crece hacia el arco rival.
// Puntos en 0..100 (x a lo largo, y a lo ancho; arriba = carril izquierdo del equipo).

import { direccionDelPeriodo, referenciaVerificada, zonaTactica } from '../orientacionAnalisis.js'
import { minutoReal, periodoPorMarcas } from './eventosPartido.js'

export const CAPAS = [
  { id: 'pases', nombre: 'Pases' },
  { id: 'remates', nombre: 'Remates' },
  { id: 'duelos', nombre: 'Duelos' },
  { id: 'recuperaciones', nombre: 'Recuperaciones' },
  { id: 'perdidas', nombre: 'Pérdidas' },
  { id: 'todas', nombre: 'Todas' },
]

const PASES = ['Pase correcto', 'Pase incorrecto']
const REMATES = ['Remate', 'Gol']
const DUELOS = ['Duelo ofensivo', 'Duelo defensivo', 'Duelo aéreo']
const RECUPERACIONES = ['Recuperación', 'Intercepción']

export const esPaseMapa = (evento) => PASES.includes(evento?.tipo)
export const esRemateMapa = (evento) => REMATES.includes(evento?.tipo)

// ¿La acción entra en la capa? Pérdidas suma los pases errados si el interruptor está prendido.
export function enCapa(evento, capa, { pasesErrados = true } = {}) {
  const tipo = evento?.tipo
  if (capa === 'pases') return PASES.includes(tipo)
  if (capa === 'remates') return REMATES.includes(tipo)
  if (capa === 'duelos') return DUELOS.includes(tipo)
  if (capa === 'recuperaciones') return RECUPERACIONES.includes(tipo)
  if (capa === 'perdidas') return tipo === 'Pérdida' || (pasesErrados && tipo === 'Pase incorrecto')
  return true
}

// Remates: 'gol' | 'arco' (atajado) | 'afuera' (fuera o bloqueado) | 'pendiente'.
export function claseRemate(evento) {
  if (evento?.tipo === 'Gol' || evento?.resultado === 'Gol') return 'gol'
  if (evento?.resultado === 'Atajada') return 'arco'
  if (['Fuera', 'Bloqueado'].includes(evento?.resultado)) return 'afuera'
  return 'pendiente'
}

// 'bien' | 'mal' | 'neutro'. Un remate atajado no es «bien»: los remates se leen con claseRemate.
export function calidad(evento) {
  if (esRemateMapa(evento)) {
    const clase = claseRemate(evento)
    return clase === 'gol' ? 'bien' : clase === 'afuera' ? 'mal' : 'neutro'
  }
  const tipo = evento?.tipo
  if (['Pase correcto', 'Recuperación', 'Intercepción', 'Atajada'].includes(tipo)) return 'bien'
  if (['Pase incorrecto', 'Pérdida'].includes(tipo)) return 'mal'
  if (['Exitoso', 'Gol', 'Atajada'].includes(evento?.resultado)) return 'bien'
  if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento?.resultado)) return 'mal'
  return 'neutro'
}

// Opciones del filtro de resultado según la capa (Pérdidas no tiene: son todas incorrectas).
export function opcionesResultado(capa) {
  if (capa === 'perdidas') return []
  if (capa === 'remates') return [['todas', 'Todos'], ['arco', 'Al arco'], ['afuera', 'Afuera']]
  return [['todas', 'Todas'], ['bien', 'Correctas'], ['mal', 'Incorrectas']]
}

export function pasaResultado(accion, resultado, capa) {
  if (!resultado || resultado === 'todas' || capa === 'perdidas') return true
  if (capa === 'remates') {
    const clase = claseRemate(accion.evento)
    return resultado === 'arco' ? ['gol', 'arco'].includes(clase) : clase === 'afuera'
  }
  return accion.calidad === resultado
}

// Tiempo de la acción: por las marcas si está el inicio del 2T; si no, el cargado en la acción.
export function periodoDe(evento, marcas) {
  return periodoPorMarcas(evento?.segundo, marcas) ?? (Number(evento?.periodo) === 2 ? 2 : 1)
}

// Hacia dónde atacábamos en esa acción. Con las marcas y la dirección del 1T del partido manda eso
// (lo de la pestaña Partido); si faltan, la dirección con la que se cargó la acción o la del partido en su tiempo.
export function direccionDe(evento, partido, marcas) {
  if (direccionDelPeriodo(partido, 1) && marcas?.inicio_2t != null) {
    return direccionDelPeriodo(partido, periodoPorMarcas(evento?.segundo, marcas))
  }
  if (referenciaVerificada(evento)) return evento.direccion_captura
  return direccionDelPeriodo(partido, Number(evento?.periodo) === 2 ? 2 : 1)
}

const numero = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
  ? Math.max(0, Math.min(100, Number(v))) : null

// Punto visual -> punto atacando a la derecha (giro de 180° si atacábamos a la izquierda).
export function orientar(x, y, direccion) {
  const px = numero(x), py = numero(y)
  if (px === null || py === null || !['derecha', 'izquierda'].includes(direccion)) return null
  return direccion === 'derecha' ? { x: px, y: py } : { x: 100 - px, y: 100 - py }
}

const TERCIOS = ['Defensa', 'Medio', 'Ataque']
export const NOMBRE_TERCIO = { Defensa: 'Tercio defensivo', Medio: 'Tercio medio', Ataque: 'Tercio ofensivo' }

const dosCifras = (n) => String(n).padStart(2, '0')
function tiempoVideo(segundo) {
  const s = Math.max(0, Math.floor(Number(segundo) || 0))
  return `${Math.floor(s / 60)}:${dosCifras(s % 60)}`
}

// Minuto real («2T 12'») o, si faltan las marcas, el tiempo y el segundo del video.
export function minutoDe(evento, marcas, periodo) {
  const real = minutoReal(evento?.segundo, marcas)
  if (real) return real.texto
  return `${periodo}T · video ${tiempoVideo(evento?.segundo)}`
}

// Arma las acciones del mapa. contexto: { partidos: Map id->partido, marcas: Map id->marcas, detallesPases: {id: detalle} }
export function prepararAcciones(eventos, { partidos, marcas, detallesPases = {} } = {}) {
  return (eventos || []).map((evento) => {
    const partido = partidos?.get?.(evento.partido_id) || null
    const marcasPartido = marcas?.get?.(evento.partido_id) || null
    const periodo = periodoDe(evento, marcasPartido)
    const direccion = direccionDe(evento, partido, marcasPartido)
    const punto = orientar(evento.coordenada_x, evento.coordenada_y, direccion)
    const detalle = esPaseMapa(evento) ? detallesPases?.[evento.id] : null
    const destino = punto && detalle ? orientar(detalle.destino_x, detalle.destino_y, direccion) : null
    const zona = punto ? zonaTactica(punto.x, punto.y, 'derecha') : (evento.zona || null)
    const tercio = TERCIOS.find((t) => zona?.startsWith(t)) || null
    return {
      id: evento.id, evento, periodo, direccion, punto, destino, zona, tercio,
      calidad: calidad(evento),
      remate: esRemateMapa(evento) ? claseRemate(evento) : null,
      minuto: minutoDe(evento, marcasPartido, periodo),
      sinDireccion: direccion === null && numero(evento.coordenada_x) !== null && numero(evento.coordenada_y) !== null,
    }
  })
}

export function filtrarAcciones(acciones, { capa = 'todas', resultado = 'todas', tiempo = 'partido', pasesErrados = true } = {}) {
  return acciones.filter((a) => enCapa(a.evento, capa, { pasesErrados }) &&
    pasaResultado(a, resultado, capa) &&
    (tiempo === 'partido' || a.periodo === Number(tiempo)))
}

// Pase progresivo (definición de Wyscout), en una cancha de 105 x 68 m: se acerca al arco rival
// al menos 30 m si empieza y termina en campo propio, 15 m si cruza de campo y 10 m si es todo en campo rival.
const LARGO = 105, ANCHO = 68
export function esProgresivo(origen, destino) {
  if (!origen || !destino) return false
  const metros = (p) => ({ x: (p.x / 100) * LARGO, y: (p.y / 100) * ANCHO })
  const o = metros(origen), d = metros(destino)
  const alArco = (p) => Math.hypot(LARGO - p.x, ANCHO / 2 - p.y)
  const avance = alArco(o) - alArco(d)
  const propioO = o.x < LARGO / 2, propioD = d.x < LARGO / 2
  const minimo = propioO && propioD ? 30 : propioO !== propioD ? 15 : 10
  return avance >= minimo
}

// Mapa de calor: densidad en una grilla de la cancha (100 x 64), suavizada con un núcleo gaussiano.
export function calor(puntos, { columnas = 25, filas = 16, radio = 1.4 } = {}) {
  const valores = Array.from({ length: filas }, () => new Array(columnas).fill(0))
  const ancho = 100 / columnas, alto = 100 / filas
  const alcance = Math.ceil(radio * 3)
  for (const p of puntos) {
    const c = Math.min(columnas - 1, Math.floor(p.x / ancho))
    const f = Math.min(filas - 1, Math.floor(p.y / alto))
    for (let df = -alcance; df <= alcance; df++) {
      for (let dc = -alcance; dc <= alcance; dc++) {
        const ff = f + df, cc = c + dc
        if (ff < 0 || ff >= filas || cc < 0 || cc >= columnas) continue
        valores[ff][cc] += Math.exp(-(dc * dc + df * df) / (2 * radio * radio))
      }
    }
  }
  let max = 0
  for (const fila of valores) for (const v of fila) max = Math.max(max, v)
  const celdas = []
  valores.forEach((fila, f) => fila.forEach((v, c) => { if (v > max * 0.08) celdas.push({ c, f, v: v / max }) }))
  return { columnas, filas, celdas, max }
}

const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0)

// Reparto por tercio (de las acciones con zona) y cuántas salieron bien en cada uno.
export function porTercio(acciones) {
  const conZona = acciones.filter((a) => a.tercio)
  return TERCIOS.map((tercio) => {
    const del = conZona.filter((a) => a.tercio === tercio)
    const juzgadas = del.filter((a) => a.calidad !== 'neutro')
    return {
      tercio, total: del.length, pct: porcentaje(del.length, conZona.length),
      pctBien: juzgadas.length ? porcentaje(juzgadas.filter((a) => a.calidad === 'bien').length, juzgadas.length) : null,
    }
  })
}

function masAcciones(acciones, nombreDe, cuantas = 3) {
  const cuenta = new Map()
  for (const a of acciones) {
    const id = a.evento.jugador_id
    if (id) cuenta.set(id, (cuenta.get(id) || 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, cuantas)
    .map(([id, total]) => ({ id, nombre: nombreDe ? nombreDe(id) : String(id), total }))
}

// Dirección de un pase en metros, atacando a la derecha: 'adelante' | 'atras' | 'lateral'
// (adelante o atrás si avanza más a lo largo que a lo ancho; si no, lateral).
export function direccionPase(origen, destino) {
  if (!origen || !destino) return null
  const dx = ((destino.x - origen.x) / 100) * LARGO, dy = ((destino.y - origen.y) / 100) * ANCHO
  if (Math.abs(dx) <= Math.abs(dy)) return 'lateral'
  return dx > 0 ? 'adelante' : 'atras'
}
// Al último tercio: termina en el tercio ofensivo y arranca fuera de él.
export const alUltimoTercio = (origen, destino) => Boolean(origen && destino && origen.x < 200 / 3 && destino.x >= 200 / 3)

// Resumen de la capa elegida: un número grande con su bajada, filas de detalle y las jugadoras con más acciones.
export function resumenCapa(acciones, capa, nombreDe) {
  const total = acciones.length
  const juzgadas = acciones.filter((a) => a.calidad !== 'neutro')
  const bien = juzgadas.filter((a) => a.calidad === 'bien').length
  const conPct = (palabra) => (juzgadas.length
    ? { grande: `${porcentaje(bien, juzgadas.length)}%`, bajada: `${palabra} · ${bien} de ${juzgadas.length}` }
    : { grande: String(total), bajada: 'Sin resultado cargado' })
  const filas = []
  let titulo, numero, tituloTop = 'Más acciones'
  if (capa === 'pases') {
    titulo = 'Pases'; numero = conPct('Correctos'); tituloTop = 'Más pases'
    const conDestino = acciones.filter((a) => a.destino)
    const direcciones = conDestino.map((a) => direccionPase(a.punto, a.destino))
    filas.push(
      { etiqueta: 'Progresivos', valor: conDestino.filter((a) => esProgresivo(a.punto, a.destino)).length },
      { etiqueta: 'Hacia atrás', valor: direcciones.filter((d) => d === 'atras').length },
      { etiqueta: 'Laterales', valor: direcciones.filter((d) => d === 'lateral').length },
      { etiqueta: 'Al último tercio', valor: conDestino.filter((a) => alUltimoTercio(a.punto, a.destino)).length },
    )
    if (conDestino.length < total) filas.push({ etiqueta: 'Con destino cargado', valor: `${conDestino.length} de ${total}`, nota: true })
  } else if (capa === 'remates') {
    titulo = 'Remates'; tituloTop = 'Más remates'
    const alArco = acciones.filter((a) => ['gol', 'arco'].includes(a.remate)).length
    numero = { grande: String(total), bajada: `Remates · ${alArco} al arco` }
    filas.push(
      { etiqueta: 'Goles', valor: acciones.filter((a) => a.remate === 'gol').length },
      { etiqueta: 'Al arco (con los goles)', valor: alArco },
      { etiqueta: 'Afuera o bloqueados', valor: acciones.filter((a) => a.remate === 'afuera').length },
    )
  } else if (capa === 'duelos') {
    titulo = 'Duelos'; numero = conPct('Ganados'); tituloTop = 'Más duelos'
  } else if (capa === 'recuperaciones') {
    titulo = 'Recuperaciones'; tituloTop = 'Más recuperaciones'
    numero = { grande: String(total), bajada: 'Recuperaciones' }
    filas.push(
      { etiqueta: 'En campo rival', valor: acciones.filter((a) => a.punto && a.punto.x >= 50).length },
      { etiqueta: 'En el último tercio', valor: acciones.filter((a) => a.tercio === 'Ataque').length },
    )
  } else if (capa === 'perdidas') {
    titulo = 'Pérdidas'; tituloTop = 'Más pérdidas'
    numero = { grande: String(total), bajada: 'Pérdidas' }
    filas.push({ etiqueta: 'En nuestro campo', valor: acciones.filter((a) => a.punto && a.punto.x < 50).length })
    const peor = porTercio(acciones).reduce((a, b) => (b.total > a.total ? b : a), { total: 0 })
    if (peor.total) filas.push({ etiqueta: 'Donde más perdemos', valor: `${NOMBRE_TERCIO[peor.tercio]} · ${peor.pct}%` })
  } else {
    titulo = 'Todas'; numero = conPct('Correctas')
  }
  const sinUbicacion = acciones.filter((a) => !a.punto).length
  return { titulo, total, ...numero, filas, tituloTop, top: masAcciones(acciones, nombreDe), sinUbicacion }
}

// Avisos por partido: marcas de tiempo o dirección del 1T que faltan.
export function avisosDireccion(acciones, { partidos, marcas } = {}) {
  const ids = [...new Set(acciones.map((a) => a.evento.partido_id).filter(Boolean))]
  const sinMarcas = [], sinDireccion = []
  for (const id of ids) {
    const partido = partidos?.get?.(id) || null
    const m = marcas?.get?.(id) || null
    const nombre = partido?.rival || 'Rival sin nombre'
    if (m?.inicio_1t == null || m?.inicio_2t == null) sinMarcas.push(nombre)
    const perdidas = acciones.filter((a) => a.evento.partido_id === id && a.sinDireccion).length
    if (perdidas) sinDireccion.push({ nombre, perdidas })
  }
  const lista = (nombres) => nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más` : nombres.join(', ')
  const avisos = []
  if (sinMarcas.length) {
    avisos.push(`${sinMarcas.length === 1 ? 'Al partido con' : 'A los partidos con'} ${lista(sinMarcas)} ${sinMarcas.length === 1 ? 'le' : 'les'} faltan las marcas de tiempo (pestaña Partido): el 1T y el 2T salen de lo cargado en cada acción y no hay minuto real.`)
  }
  if (sinDireccion.length) {
    const n = sinDireccion.reduce((s, x) => s + x.perdidas, 0)
    avisos.push(`Falta la dirección del 1T en ${lista(sinDireccion.map((x) => x.nombre))} (pestaña Partido): ${n} ${n === 1 ? 'acción no se puede acomodar y no se muestra' : 'acciones no se pueden acomodar y no se muestran'}.`)
  }
  return avisos
}
