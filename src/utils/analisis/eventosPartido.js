// Eventos del partido atados al video (analisis_partido_eventos): marcas de tiempo, cambios, goles y tarjetas.
// Lógica pura: minuto real, quién estaba en cancha y minutos jugados sugeridos.

export const MARCAS = [
  { tipo: 'inicio_1t', nombre: 'Inicio del partido' },
  { tipo: 'fin_1t', nombre: 'Fin del 1T' },
  { tipo: 'inicio_2t', nombre: 'Inicio del 2T' },
  { tipo: 'fin_partido', nombre: 'Fin del partido' },
]
const TIPOS_MARCA = MARCAS.map((m) => m.tipo)
export const esMarca = (tipo) => TIPOS_MARCA.includes(tipo)

// Segundo del video de cada marca (o null).
export function marcasDe(eventos) {
  const marcas = Object.fromEntries(TIPOS_MARCA.map((t) => [t, null]))
  for (const e of eventos || []) if (esMarca(e.tipo)) marcas[e.tipo] = Number(e.segundo)
  return marcas
}

export function faltanMarcas(marcas) {
  return MARCAS.filter((m) => marcas?.[m.tipo] == null).map((m) => m.nombre)
}

// Marcas fuera de orden (inicio < fin del 1T < inicio del 2T < fin). Devuelve los avisos, en castellano.
export function problemasOrden(marcas) {
  const cargadas = MARCAS.filter((m) => marcas?.[m.tipo] != null)
  const avisos = []
  for (let i = 1; i < cargadas.length; i++) {
    const antes = cargadas[i - 1], despues = cargadas[i]
    if (marcas[despues.tipo] <= marcas[antes.tipo]) avisos.push(`«${despues.nombre}» tiene que ser después de «${antes.nombre}».`)
  }
  return avisos
}

// Tiempo del partido de un segundo del video, según las marcas. null si no se puede saber (falta el inicio del 2T).
export function periodoPorMarcas(segundo, marcas) {
  if (marcas?.inicio_2t == null) return null
  return Number(segundo) >= marcas.inicio_2t ? 2 : 1
}

// Duración reglamentaria de cada tiempo. Por ahora la misma para todas las categorías.
export const MINUTOS_POR_TIEMPO = 45

// «12'» o, en el descuento, «45+2'» (el minuto 47 del tiempo).
export const textoMinutoDelTiempo = (minuto) => (minuto > MINUTOS_POR_TIEMPO
  ? `${MINUTOS_POR_TIEMPO}+${minuto - MINUTOS_POR_TIEMPO}'` : `${minuto}'`)

// Minuto real («1T 12'», «2T 3'», «1T 45+2'») de un segundo del video. El primer minuto de cada tiempo es el 1'.
// estado: 'juego' | 'antes' | 'entretiempo' | 'despues'. null si faltan las marcas necesarias.
export function minutoReal(segundo, marcas) {
  const s = Number(segundo)
  if (!Number.isFinite(s) || !marcas) return null
  const minuto = (desde) => Math.floor((s - desde) / 60) + 1
  if (marcas.inicio_2t != null && s >= marcas.inicio_2t) {
    if (marcas.fin_partido != null && s > marcas.fin_partido) return { estado: 'despues', periodo: 2, texto: 'Después del final' }
    return { estado: 'juego', periodo: 2, minuto: minuto(marcas.inicio_2t), texto: `2T ${textoMinutoDelTiempo(minuto(marcas.inicio_2t))}` }
  }
  if (marcas.inicio_1t == null) return null
  if (s < marcas.inicio_1t) return { estado: 'antes', periodo: 1, texto: 'Antes del inicio' }
  // Después del fin del 1T y antes del inicio del 2T (o sin el inicio del 2T todavía).
  if (marcas.fin_1t != null && s > marcas.fin_1t) return { estado: 'entretiempo', periodo: 1, texto: 'Entretiempo' }
  return { estado: 'juego', periodo: 1, minuto: minuto(marcas.inicio_1t), texto: `1T ${textoMinutoDelTiempo(minuto(marcas.inicio_1t))}` }
}

// Cambios en orden de video.
export function cambiosDe(eventos) {
  return (eventos || []).filter((e) => e.tipo === 'cambio').sort((a, b) => Number(a.segundo) - Number(b.segundo))
}

// Quiénes están en cancha en un segundo: las titulares, con los cambios hechos hasta ese segundo (inclusive).
export function enCancha(segundo, titulares, cambios) {
  const cancha = new Set(titulares)
  for (const c of cambios) {
    if (Number(c.segundo) > Number(segundo)) break
    cancha.delete(c.jugadora_sale)
    cancha.add(c.jugadora_entra)
  }
  return cancha
}

// true / false si estaba en cancha; null si no se puede saber (no hay titulares cargadas).
export function estabaEnCancha(jugadorId, segundo, titulares, cambios) {
  if (!jugadorId || !titulares?.length) return null
  return enCancha(segundo, titulares, cambios).has(jugadorId)
}

// Minutos jugados sugeridos (redondeados) por jugadora, dentro de los dos tiempos. Necesita las 4 marcas en orden
// y titulares; si no, null. Las convocadas que no jugaron quedan en 0.
export function minutosSugeridos(convocadas, titulares, cambios, marcas) {
  if (!titulares?.length || faltanMarcas(marcas).length || problemasOrden(marcas).length) return null
  const segundos = Object.fromEntries((convocadas || []).map((id) => [id, 0]))
  for (const [desde, hasta] of [[marcas.inicio_1t, marcas.fin_1t], [marcas.inicio_2t, marcas.fin_partido]]) {
    const cortes = [desde, ...cambios.map((c) => Number(c.segundo)).filter((s) => s > desde && s < hasta), hasta]
    for (let i = 0; i < cortes.length - 1; i++) {
      // Quiénes estaban entre este corte y el siguiente (los cambios del corte ya se hicieron).
      for (const id of enCancha(cortes[i], titulares, cambios)) segundos[id] = (segundos[id] || 0) + (cortes[i + 1] - cortes[i])
    }
  }
  return Object.fromEntries(Object.entries(segundos).map(([id, s]) => [id, Math.round(s / 60)]))
}

// «12:34», «1:02:03» o segundos sueltos → segundos. null si no se entiende.
export function leerTiempo(texto) {
  const limpio = String(texto ?? '').trim()
  if (/^\d+$/.test(limpio)) return Number(limpio)
  const partes = limpio.split(':')
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null
  const numeros = partes.map(Number)
  if (numeros.slice(1).some((n) => n > 59)) return null
  return numeros.reduce((total, n) => total * 60 + n, 0)
}

// ---------- Etapa 3: minutos con expulsiones y avisos ----------

// Expulsiones nuestras (roja o segunda amarilla de la misma jugadora), en orden de video. sinJugadora: rojas nuestras
// sin jugadora cargada (no se pueden descontar).
export function expulsionesDe(eventos) {
  const tarjetas = (eventos || []).filter((e) => e.tipo === 'tarjeta' && e.equipo === 'propio')
    .sort((a, b) => Number(a.segundo) - Number(b.segundo))
  const amarillas = {}, expulsadas = new Set(), expulsiones = []
  let sinJugadora = 0
  for (const t of tarjetas) {
    if (!t.jugador_id) { if (t.tarjeta === 'roja') sinJugadora += 1; continue }
    if (expulsadas.has(t.jugador_id)) continue
    if (t.tarjeta === 'amarilla') amarillas[t.jugador_id] = (amarillas[t.jugador_id] || 0) + 1
    if (t.tarjeta === 'roja' || amarillas[t.jugador_id] >= 2) {
      expulsadas.add(t.jugador_id)
      expulsiones.push({ segundo: Number(t.segundo), jugadora: t.jugador_id })
    }
  }
  return { expulsiones, sinJugadora }
}

// Minutos jugados sugeridos con cambios y expulsiones, sobre las marcas reales del video (incluye el agregado).
// acciones: las individuales del partido, para avisar si alguien tiene acciones mientras figura afuera.
// Devuelve { minutos: { id: minutos } | null, avisos: [{ tipo, texto, jugadoraId? }] }. Sin marcas o sin titulares,
// minutos es null y los avisos dicen qué falta.
export function minutosDetallados({ convocadas = [], titulares = [], cambios = [], tarjetas = [], marcas = null, acciones = [] }) {
  const avisos = []
  if (!titulares?.length) avisos.push({ tipo: 'titulares', texto: 'No hay titulares en la formación: cargalas en Convocados.' })
  const faltan = faltanMarcas(marcas)
  if (faltan.length) avisos.push({ tipo: 'marcas', texto: `Faltan marcas de tiempo: ${faltan.join(', ')}.` })
  for (const texto of problemasOrden(marcas || {})) avisos.push({ tipo: 'orden', texto })
  const { expulsiones, sinJugadora } = expulsionesDe(tarjetas)
  if (sinJugadora) avisos.push({ tipo: 'roja', texto: `Hay ${sinJugadora === 1 ? 'una roja nuestra' : `${sinJugadora} rojas nuestras`} sin jugadora: no se puede descontar quién salió.` })
  if (avisos.some((a) => ['titulares', 'marcas', 'orden'].includes(a.tipo))) return { minutos: null, avisos }

  const salidas = [
    ...cambios.map((c) => ({ segundo: Number(c.segundo), sale: c.jugadora_sale, entra: c.jugadora_entra, cambio: true })),
    ...expulsiones.map((e) => ({ segundo: e.segundo, sale: e.jugadora, entra: null, cambio: false })),
  ].sort((a, b) => a.segundo - b.segundo)
  const cancha = (segundo) => {
    const c = new Set(titulares)
    for (const s of salidas) {
      if (s.segundo > segundo) break
      c.delete(s.sale)
      if (s.entra) c.add(s.entra)
    }
    return c
  }
  // Cambios que sacan a alguien que no estaba en cancha.
  for (const s of salidas.filter((x) => x.cambio)) {
    const antes = cancha(s.segundo - 1)
    if (!antes.has(s.sale)) avisos.push({ tipo: 'cambio', jugadoraId: s.sale, texto: `El cambio de las ${Math.floor(s.segundo / 60)}:${String(s.segundo % 60).padStart(2, '0')} saca a una jugadora que no estaba en cancha.` })
  }

  const segundos = Object.fromEntries((convocadas || []).map((id) => [id, 0]))
  const periodos = [[marcas.inicio_1t, marcas.fin_1t], [marcas.inicio_2t, marcas.fin_partido]]
  for (const [desde, hasta] of periodos) {
    const cortes = [...new Set([desde, ...salidas.map((s) => s.segundo).filter((s) => s > desde && s < hasta), hasta])].sort((a, b) => a - b)
    for (let i = 0; i < cortes.length - 1; i++) {
      for (const id of cancha(cortes[i])) segundos[id] = (segundos[id] || 0) + (cortes[i + 1] - cortes[i])
    }
  }

  // Acciones de jugadoras que figuran afuera de la cancha (¿falta marcar un cambio?).
  const fuera = {}
  for (const a of acciones || []) {
    const s = Number(a.segundo)
    if (!a.jugador_id || !periodos.some(([d, h]) => s >= d && s <= h)) continue
    if (!cancha(s).has(a.jugador_id)) fuera[a.jugador_id] = (fuera[a.jugador_id] || 0) + 1
  }
  for (const [jugadoraId, n] of Object.entries(fuera)) {
    avisos.push({ tipo: 'fuera', jugadoraId, texto: `tiene ${n} ${n === 1 ? 'acción' : 'acciones'} mientras figura afuera de la cancha: ¿falta marcar un cambio?` })
  }
  return { minutos: Object.fromEntries(Object.entries(segundos).map(([id, s]) => [id, Math.round(s / 60)])), avisos }
}

// Fila de la tabla de minutos: sugeridos, cargados y diferencia. cambia: si confirmar escribiría algo.
export function filaMinutos(jugadoraId, sugeridos, cargados) {
  const sugerido = sugeridos?.[jugadoraId] ?? null
  const cargado = cargados?.[jugadoraId] ?? null
  const diferencia = sugerido == null || cargado == null ? null : sugerido - Number(cargado)
  const cambia = sugerido != null && (cargado == null ? sugerido > 0 : sugerido !== Number(cargado))
  return { jugadoraId, sugerido, cargado: cargado == null ? null : Number(cargado), diferencia, cambia }
}
