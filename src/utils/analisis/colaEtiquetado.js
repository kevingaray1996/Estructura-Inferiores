// Cola de guardado del etiquetado de Análisis.
//
// Cada toque se registra al instante (con su id, el segundo del video y el período) y se guarda de fondo, de a uno
// y en orden, sin bloquear los botones. Si un envío falla por la red se reintenta solo, con esperas crecientes; si la
// base lo rechaza (permiso, dato inválido) queda marcado para que el usuario lo vea y lo descarte.
//
// Reintentar nunca duplica: el id lo genera la app en el toque, así que si un envío anterior sí llegó a guardarse,
// la base responde «ya existe» (23505) y la acción se da por guardada.
//
// Las acciones pendientes se respaldan en el navegador (localStorage): si se cierra o recarga la página, se envían
// al volver a abrir Análisis.

export const CLAVE_COLA = 'analisis_cola_etiquetado_v1'
export const ESPERAS_MS = [1000, 3000, 8000, 15000, 30000]

const ES_CODIGO_SQL = /^[0-9A-Z]{5}$/

// 'ok' | 'duplicado' | 'rechazo' (la base lo rechazó: no sirve reintentar) | 'red' (se reintenta).
export function clasificarResultado({ data, error } = {}, id) {
  if (!error) return data?.id === id ? 'ok' : 'red'
  const codigo = String(error.code || '')
  if (codigo === '23505') return 'duplicado'
  if (ES_CODIGO_SQL.test(codigo) || codigo === '42501' || Number(error.status) === 403) return 'rechazo'
  return 'red'
}

function leerAlmacen(almacen) {
  try {
    const lista = JSON.parse(almacen?.getItem(CLAVE_COLA) || '[]')
    return Array.isArray(lista) ? lista.filter((r) => r && typeof r.id === 'string' && r.partido_id) : []
  } catch {
    return []
  }
}

// enviar(registro) → Promise<{ data, error }> (insert … select().single()).
// borrar(id) → Promise<{ error }> (para deshacer una acción que ya se estaba enviando).
// Opcionales: almacen (localStorage), programar/cancelar (timers), alConfirmar(fila), alFallarBorrado(fila, error).
export function crearColaEtiquetado({
  enviar, borrar, almacen = null, programar = (fn, ms) => setTimeout(fn, ms), cancelar = (t) => clearTimeout(t),
  alConfirmar = () => {}, alFallarBorrado = () => {},
} = {}) {
  // Orden de llegada. estado: 'pendiente' | 'enviando' | 'error' (se reintenta) | 'rechazada' (no se reintenta).
  let items = leerAlmacen(almacen).map((registro) => ({ id: registro.id, registro, estado: 'pendiente', intentos: 0, error: null, cancelada: false }))
  let snapshot = items
  let enviando = false, temporizador = null, detenida = false
  const oyentes = new Set()

  function publicar() {
    snapshot = items.slice()
    try { almacen?.setItem(CLAVE_COLA, JSON.stringify(items.filter((i) => i.estado !== 'rechazada').map((i) => i.registro))) } catch { /* Sin respaldo local. */ }
    oyentes.forEach((fn) => fn())
  }

  function cambiar(id, cambios) {
    items = items.map((i) => (i.id === id ? { ...i, ...cambios } : i))
  }

  function quitar(id) {
    items = items.filter((i) => i.id !== id)
  }

  function programarReintento(intentos) {
    if (temporizador || detenida) return
    const espera = ESPERAS_MS[Math.min(intentos - 1, ESPERAS_MS.length - 1)]
    temporizador = programar(() => { temporizador = null; reintentarAhora() }, espera)
  }

  async function procesar() {
    if (enviando || detenida) return
    const siguiente = items.find((i) => i.estado === 'pendiente')
    if (!siguiente) return
    enviando = true
    cambiar(siguiente.id, { estado: 'enviando' }); publicar()
    let resultado
    try {
      resultado = await enviar(siguiente.registro)
    } catch (error) {
      resultado = { data: null, error }
    }
    const tipo = clasificarResultado(resultado, siguiente.id)
    const actual = items.find((i) => i.id === siguiente.id)
    if (tipo === 'ok' || tipo === 'duplicado') {
      quitar(siguiente.id)
      const fila = tipo === 'ok' ? resultado.data : siguiente.registro
      if (actual?.cancelada) {
        // Se deshizo mientras viajaba: ya está en la base, se borra.
        let borrado
        try { borrado = await borrar(siguiente.id) } catch (error) { borrado = { error } }
        if (borrado?.error) { alConfirmar(fila); alFallarBorrado(fila, borrado.error) }
      } else {
        alConfirmar(fila)
      }
    } else if (actual?.cancelada) {
      // Se deshizo y no llegó a guardarse: se descarta.
      quitar(siguiente.id)
    } else if (tipo === 'rechazo') {
      cambiar(siguiente.id, { estado: 'rechazada', error: resultado.error })
    } else {
      const intentos = (actual?.intentos || 0) + 1
      cambiar(siguiente.id, { estado: 'error', intentos, error: resultado.error })
      // Una acción con error de red no frena a las que siguen: cada una se intenta en su turno.
      programarReintento(intentos)
    }
    enviando = false
    publicar()
    procesar()
  }

  function agregar(registro) {
    items = [...items, { id: registro.id, registro, estado: 'pendiente', intentos: 0, error: null, cancelada: false }]
    publicar()
    procesar()
  }

  // Vuelve a intentar ya todas las que fallaron por la red.
  function reintentarAhora() {
    if (temporizador) { cancelar(temporizador); temporizador = null }
    let hubo = false
    items = items.map((i) => (i.estado === 'error' ? ((hubo = true), { ...i, estado: 'pendiente' }) : i))
    if (hubo) publicar()
    procesar()
  }

  // Deshacer una acción que todavía no está confirmada. true si la cola se hace cargo.
  function cancelarAccion(id) {
    const item = items.find((i) => i.id === id)
    if (!item) return false
    if (item.estado === 'enviando') cambiar(id, { cancelada: true })
    else quitar(id)
    publicar()
    return true
  }

  // Quitar de la lista una acción rechazada por la base.
  function descartar(id) {
    const item = items.find((i) => i.id === id)
    if (!item || item.estado !== 'rechazada') return false
    quitar(id); publicar(); return true
  }

  return {
    agregar, reintentarAhora, cancelar: cancelarAccion, descartar,
    iniciar() { detenida = false; procesar() },
    detener() { detenida = true; if (temporizador) { cancelar(temporizador); temporizador = null } },
    getSnapshot: () => snapshot,
    subscribe(fn) { oyentes.add(fn); return () => oyentes.delete(fn) },
  }
}
