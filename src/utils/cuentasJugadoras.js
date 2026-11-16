// Cuentas de jugadoras: validación del mail y llamada a la Edge Function `cuentas-jugadoras`.
// Mismo criterio de mail que la función (supabase/functions/cuentas-jugadoras/index.js).

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizarEmail(texto) {
  return String(texto ?? '').trim().toLowerCase()
}

export function emailValido(texto) {
  const email = normalizarEmail(texto)
  return email.length > 0 && email.length <= 254 && PATRON_EMAIL.test(email)
}

const MENSAJES = {
  email_en_uso: 'Ese mail ya está en uso por otra cuenta. Usá otro.',
  ya_tiene_cuenta: 'Esta jugadora ya tiene cuenta. Actualizá la lista.',
  sin_cuenta: 'Esta jugadora todavía no tiene cuenta. Actualizá la lista.',
  jugadora_inexistente: 'La jugadora ya no está en el plantel. Actualizá la lista.',
  sin_conexion: 'No se pudo guardar. Revisá la conexión y probá de nuevo.',
  sin_sesion: 'Tu sesión venció. Volvé a entrar y probá de nuevo.',
  sin_permiso: 'Solo coordinación puede crear o cambiar cuentas de jugadoras.',
}

// Error al guardar un perfil del staff (Usuarios → Staff). 23505 sale del trigger que impide usar el mail de una
// cuenta de jugadora («email_en_uso») o de la clave primaria de perfiles (mail ya usado por otro usuario del staff).
export function mensajeErrorPerfil(error) {
  if (error?.code === '42501') return 'No tenés permiso para guardar este perfil. Revisá tu sesión.'
  if (error?.code === '23505') {
    return /email_en_uso/.test(error.message || '')
      ? 'Ese mail ya pertenece a una jugadora. Usá otro mail para este usuario.'
      : 'Ese mail ya pertenece a otro usuario del staff. Buscalo en la lista y editalo.'
  }
  return 'Error al guardar: ' + (error?.message || 'sin detalle')
}

export function mensajeCuentas(codigo) {
  return MENSAJES[codigo] || 'No se pudo guardar. Probá de nuevo en un rato; si sigue, avisá a coordinación.'
}

// Devuelve { ok: true } o { error: <código> }. Nunca lanza.
export async function llamarCuentas(supabase, cuerpo) {
  try {
    const { data, error } = await supabase.functions.invoke('cuentas-jugadoras', { body: cuerpo })
    if (!error) return data?.ok ? { ok: true } : { error: 'error_interno' }
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return { error: 'sin_conexion' }
    const respuesta = error.context
    if (respuesta && typeof respuesta.json === 'function') {
      const cuerpoError = await respuesta.json().catch(() => null)
      if (typeof cuerpoError?.error === 'string') return { error: cuerpoError.error }
      // Un 401 sin código propio lo corta el gateway de Supabase (token vencido o rechazado) antes de la función.
      if (respuesta.status === 401) return { error: 'sin_sesion' }
    }
    return { error: 'error_interno' }
  } catch {
    return { error: 'sin_conexion' }
  }
}

// Fecha corta (dd/mm) en hora de Argentina, para "último ingreso".
export function fechaCorta(iso) {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}
