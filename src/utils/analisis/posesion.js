// Posesión (etapa 3, docs/analisis-etapa3.md). Lógica pura.
// Estados: 'analizado' (pelota del equipo analizado), 'otro' (pelota del otro), 'detenida', 'sin_datos'.
// Origen: 'manual' (analisis_posesion_tramos), 'auto' (calculado desde los momentos colectivos) o null (sin datos).
// Lo marcado a mano pisa lo automático; lo automático solo llena lo que no está marcado a mano.
import { reglasDe } from './catalogoAcciones.js'

export const ESTADOS_MANUALES = Object.freeze(['analizado', 'otro', 'detenida'])
export const NOMBRE_ESTADO = Object.freeze({ analizado: 'Equipo analizado', otro: 'Otro equipo', detenida: 'Pelota detenida', sin_datos: 'Sin datos' })

// Momentos con la pelota de cada lado (desde el equipo analizado, como se marcan).
const DEL_ANALIZADO = new Set(['Salida', 'Ataque posicional', 'Transición ofensiva', 'Córner a favor', 'Tiro libre a favor'])
const DEL_OTRO = new Set(['Presión alta', 'Defensa organizada', 'Transición defensiva', 'Salida rival', 'Córner en contra', 'Tiro libre en contra'])

// De quién es la pelota en un momento colectivo: 'analizado' | 'otro' | null (Charla y botones sin lado).
export function ladoDeMomento(tipo, catalogo) {
  const reglas = reglasDe(catalogo, tipo)
  if (reglas.grupo === 'charla') return null
  if (DEL_ANALIZADO.has(tipo)) return 'analizado'
  if (DEL_OTRO.has(tipo)) return 'otro'
  if (reglas.botonera === 'colectiva' && reglas.grupo === 'con_pelota') return 'analizado'
  if (reglas.botonera === 'colectiva' && reglas.grupo === 'sin_pelota') return 'otro'
  return null
}

export const opuesto = (estado) => (estado === 'analizado' ? 'otro' : estado === 'otro' ? 'analizado' : null)
const entero = (v) => Math.floor(Number(v) || 0)

// Tramos automáticos (sin pisarse entre sí: si dos momentos se superponen, manda el que empezó después).
export function tramosAutomaticos(momentos, catalogo) {
  return (momentos || [])
    .map((m, orden) => ({ inicio: entero(m.segundo), fin: entero(m.segundo_fin ?? m.segundo), estado: ladoDeMomento(m.tipo, catalogo), momentoId: m.id, orden }))
    .filter((t) => t.estado && t.fin > t.inicio)
}

// Tramos del partido que se miran: 1T y 2T con las marcas; si faltan, lo que tenga datos.
export function rangosDelPartido(marcas, extension = null) {
  const rangos = []
  if (marcas?.inicio_1t != null && marcas?.fin_1t != null && marcas.fin_1t > marcas.inicio_1t) rangos.push({ periodo: 1, desde: marcas.inicio_1t, hasta: marcas.fin_1t })
  if (marcas?.inicio_2t != null && marcas?.fin_partido != null && marcas.fin_partido > marcas.inicio_2t) rangos.push({ periodo: 2, desde: marcas.inicio_2t, hasta: marcas.fin_partido })
  if (rangos.length) return rangos
  if (extension && extension.hasta > extension.desde) return [{ periodo: null, desde: extension.desde, hasta: extension.hasta }]
  return []
}

// Línea de posesión: tramos seguidos que cubren los rangos del partido.
// manuales: filas de analisis_posesion_tramos. Devuelve [{ inicio, fin, estado, origen, periodo, id? }].
export function lineaPosesion({ momentos = [], manuales = [], catalogo, marcas = null }) {
  const autos = tramosAutomaticos(momentos, catalogo)
  const mans = (manuales || []).filter((t) => ESTADOS_MANUALES.includes(t.estado) && Number(t.fin) > Number(t.inicio))
    .map((t) => ({ ...t, inicio: entero(t.inicio), fin: entero(t.fin) }))
  const todos = [...autos, ...mans]
  const extension = todos.length ? { desde: Math.min(...todos.map((t) => t.inicio)), hasta: Math.max(...todos.map((t) => t.fin)) } : null
  const salida = []
  for (const rango of rangosDelPartido(marcas, extension)) {
    const cortes = new Set([rango.desde, rango.hasta])
    for (const t of todos) {
      if (t.inicio > rango.desde && t.inicio < rango.hasta) cortes.add(t.inicio)
      if (t.fin > rango.desde && t.fin < rango.hasta) cortes.add(t.fin)
    }
    const puntos = [...cortes].sort((a, b) => a - b)
    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i], b = puntos[i + 1]
      const manual = mans.find((t) => t.inicio <= a && t.fin >= b)
      let tramo
      if (manual) tramo = { estado: manual.estado, origen: 'manual', id: manual.id }
      else {
        const cubren = autos.filter((t) => t.inicio <= a && t.fin >= b)
        const ganador = cubren.sort((x, y) => y.inicio - x.inicio || y.orden - x.orden)[0]
        tramo = ganador ? { estado: ganador.estado, origen: 'auto', momentoId: ganador.momentoId } : { estado: 'sin_datos', origen: null }
      }
      const previo = salida[salida.length - 1]
      if (previo && previo.fin === a && previo.periodo === rango.periodo && previo.estado === tramo.estado
          && previo.origen === tramo.origen && previo.id === tramo.id) previo.fin = b
      else salida.push({ inicio: a, fin: b, periodo: rango.periodo, ...tramo })
    }
  }
  return salida
}

// Totales: % de posesión solo sobre tiempo de juego (sin pelota detenida ni sin datos) y cobertura (con algún dato).
export function resumenPosesion(linea) {
  const t = { analizado: 0, otro: 0, detenida: 0, sin_datos: 0 }
  for (const s of linea || []) t[s.estado] = (t[s.estado] || 0) + (s.fin - s.inicio)
  const total = t.analizado + t.otro + t.detenida + t.sin_datos
  const juego = t.analizado + t.otro
  const cobertura = total ? Math.round(((total - t.sin_datos) / total) * 100) : 0
  const porcentaje = juego ? Math.round((t.analizado / juego) * 100) : null
  return { ...t, total, juego, porcentaje, porcentajeOtro: porcentaje == null ? null : 100 - porcentaje, cobertura, parcial: cobertura < 50 }
}

// «Posesión 56% · calculada sobre el 82% del partido»
export function textoPosesion(resumen, nombre = '') {
  if (resumen?.porcentaje == null) return 'Posesión sin datos'
  return `Posesión${nombre ? ` ${nombre}` : ''} ${resumen.porcentaje}% · calculada sobre el ${resumen.cobertura}% del partido`
}

// Dominio por bloques de 5 minutos, separado por tiempo: segundos de cada equipo en cada bloque.
export function dominioPorBloques(linea, marcas, bloque = 300) {
  const tramos = linea || []
  const extension = tramos.length ? { desde: tramos[0].inicio, hasta: tramos[tramos.length - 1].fin } : null
  return rangosDelPartido(marcas, extension).map((rango) => {
    const bloques = []
    for (let desde = rango.desde; desde < rango.hasta; desde += bloque) {
      const hasta = Math.min(rango.hasta, desde + bloque)
      const b = { minuto: Math.round((desde - rango.desde) / 60), desde, hasta, analizado: 0, otro: 0, detenida: 0, sin_datos: 0 }
      for (const s of tramos) {
        const solape = Math.min(hasta, s.fin) - Math.max(desde, s.inicio)
        if (solape > 0) b[s.estado] += solape
      }
      bloques.push(b)
    }
    return { periodo: rango.periodo, bloques }
  })
}

// Estado en un segundo del video (para el indicador del Modo posesión).
export function estadoEn(linea, segundo) {
  const s = Number(segundo)
  const tramo = (linea || []).find((t) => s >= t.inicio && s < t.fin)
  return tramo ? tramo.estado : 'sin_datos'
}

// ---------- Escribir tramos a mano sin pisarse ----------

// Inserta un tramo a mano: recorta, parte o borra los tramos a mano que se pisan con él.
// Devuelve las operaciones en el orden en que hay que hacerlas: borrar, achicar (actualizar) y crear.
// conId: si el tramo nuevo es uno existente que se movió (se actualiza en vez de crearse).
export function insertarTramo(manuales, nuevo, { conId = null } = {}) {
  const borrar = [], actualizar = [], crear = []
  const inicio = entero(nuevo.inicio), fin = entero(nuevo.fin)
  if (fin <= inicio || !ESTADOS_MANUALES.includes(nuevo.estado)) return { borrar, actualizar, crear }
  for (const t of manuales || []) {
    if (t.id === conId) continue
    const ti = entero(t.inicio), tf = entero(t.fin)
    if (tf <= inicio || ti >= fin) continue
    if (ti >= inicio && tf <= fin) borrar.push(t.id)
    else if (ti < inicio && tf > fin) {
      actualizar.push({ id: t.id, inicio: ti, fin: inicio })
      crear.push({ inicio: fin, fin: tf, estado: t.estado })
    } else if (ti < inicio) actualizar.push({ id: t.id, inicio: ti, fin: inicio })
    else actualizar.push({ id: t.id, inicio: fin, fin: tf })
  }
  if (conId) actualizar.push({ id: conId, inicio, fin, estado: nuevo.estado })
  else crear.push({ inicio, fin, estado: nuevo.estado })
  return { borrar, actualizar, crear }
}

// Ajuste de un tramo desde la línea de tiempo: si era a mano, se mueve; si era automático, queda un tramo a mano con
// esos límites (el momento colectivo no cambia). Los tramos «sin datos» no se ajustan.
export function ajustarTramo(manuales, tramo, { segundo, segundo_fin }) {
  if (!tramo || tramo.estado === 'sin_datos') return { borrar: [], actualizar: [], crear: [] }
  return insertarTramo(manuales, { inicio: segundo, fin: segundo_fin, estado: tramo.estado }, { conId: tramo.origen === 'manual' ? tramo.id : null })
}

// ---------- Modo posesión: grabación con dos teclas ----------

export const CLAVE_TECLAS_POSESION = 'analisis_teclas_posesion_v1'
export const TECLAS_POSESION_POR_DEFECTO = Object.freeze({ cambio: 'q', detenida: 'w' })

// grabacion: { estado, inicio, ultimoEquipo } o null. estadoActual: lo que muestra la línea en ese segundo.
// Devuelve { grabacion, guardar } (guardar: el tramo que se cierra, o null).
export function tocarPosesion(grabacion, orden, segundo, estadoActual) {
  const s = entero(segundo)
  const equipoAntes = grabacion
    ? (grabacion.estado === 'detenida' ? grabacion.ultimoEquipo : grabacion.estado)
    : (opuesto(estadoActual) ? estadoActual : null)
  let estado
  if (orden === 'detenida') {
    if (grabacion?.estado === 'detenida') return { grabacion, guardar: null }
    estado = 'detenida'
  } else if (orden === 'cambio') {
    if (grabacion && grabacion.estado !== 'detenida') estado = opuesto(grabacion.estado)
    else estado = equipoAntes ? opuesto(equipoAntes) : 'analizado'
  } else return { grabacion, guardar: null }
  const guardar = grabacion && s > grabacion.inicio ? { inicio: grabacion.inicio, fin: s, estado: grabacion.estado } : null
  return { grabacion: { estado, inicio: s, ultimoEquipo: estado === 'detenida' ? equipoAntes : estado }, guardar }
}

// Terminar la grabación (salir del modo o tocar «Terminar»): guarda el tramo abierto.
export function terminarPosesion(grabacion, segundo) {
  const s = entero(segundo)
  return grabacion && s > grabacion.inicio ? { inicio: grabacion.inicio, fin: s, estado: grabacion.estado } : null
}

// Tecla para el Modo posesión: una sola, que no sea Espacio (pausa), ? (ayuda) ni un número, y distinta de la otra.
// En la pestaña Posesión las teclas de la botonera y del marcador no marcan nada, así que no chocan.
export function validarTeclaPosesion(tecla, otra) {
  const t = String(tecla || '').toLowerCase()
  if (t.length !== 1) return { ok: false, motivo: 'Elegí una sola tecla (una letra).' }
  if (t === ' ' || t === '?' || /[0-9]/.test(t)) return { ok: false, motivo: 'Espacio, ? y los números ya se usan (pausa, ayuda y dorsales).' }
  if (otra && t === String(otra).toLowerCase()) return { ok: false, motivo: 'Esa tecla ya es de la otra acción.' }
  return { ok: true }
}

function almacenLocal() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}
export function leerTeclasPosesion(almacen = almacenLocal()) {
  try {
    const g = JSON.parse(almacen?.getItem(CLAVE_TECLAS_POSESION) || 'null')
    const ok = (t) => validarTeclaPosesion(t, null).ok
    if (g && ok(g.cambio) && ok(g.detenida) && g.cambio.toLowerCase() !== g.detenida.toLowerCase()) {
      return { cambio: g.cambio.toLowerCase(), detenida: g.detenida.toLowerCase() }
    }
  } catch { /* Valores por defecto. */ }
  return { ...TECLAS_POSESION_POR_DEFECTO }
}
export function guardarTeclasPosesion(teclas, almacen = almacenLocal()) {
  try { almacen?.setItem(CLAVE_TECLAS_POSESION, JSON.stringify(teclas)); return true } catch { return false }
}
