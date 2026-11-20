// Traduce los errores de Supabase (base, Storage, red) a mensajes en castellano que no culpan a quien usa la app y
// dicen qué hacer. `accion` completa la frase «No se pudo …»: 'guardar', 'subir la foto', 'borrar el registro', etc.

const SIN_CONEXION = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network|conexi/i
const ARCHIVO_PESADO = /payload too large|maximum allowed size|entity too large|too large/i
const ARCHIVO_TIPO = /mime type|invalid_mime_type|not supported/i

function codigoDe(error) {
  return String(error?.code ?? error?.error ?? '')
}

function estadoDe(error) {
  return Number(error?.status ?? error?.statusCode ?? 0)
}

// true si el error viene de Supabase o de la red; false si es un mensaje armado por la propia app.
export function esErrorDeServicio(error) {
  if (!error || typeof error !== 'object') return false
  if (error.code || error.status || error.statusCode || error.details || error.hint) return true
  if (error.name === 'StorageError' || error.name === 'StorageApiError' || error.name === 'AuthApiError') return true
  return SIN_CONEXION.test(String(error.message || ''))
}

export function mensajeError(error, accion = 'guardar') {
  const codigo = codigoDe(error)
  const estado = estadoDe(error)
  const texto = String(error?.message || '')

  if (SIN_CONEXION.test(texto)) return `No se pudo ${accion}. Revisá la conexión y probá de nuevo.`
  if (['PGRST301', 'PGRST302', 'PGRST303'].includes(codigo) || estado === 401 || /jwt expired|invalid jwt/i.test(texto)) {
    return 'Tu sesión venció. Volvé a entrar y probá de nuevo.'
  }
  if (codigo === '42501' || estado === 403 || /row-level security|permission denied|unauthorized/i.test(texto)) {
    return `No se pudo ${accion}: tu usuario no tiene permiso para esto. Si lo necesitás, pedíselo a coordinación.`
  }
  if (estado === 413 || ARCHIVO_PESADO.test(texto)) {
    return `No se pudo ${accion}: el archivo es muy pesado. Probá con una imagen de menos de 5 MB.`
  }
  if (estado === 415 || ARCHIVO_TIPO.test(texto)) {
    return `No se pudo ${accion}: el archivo no es una imagen. Elegí una foto JPG o PNG.`
  }
  if (codigo === '23505' || (estado === 409 && /duplicate|already exists/i.test(texto))) {
    return `No se pudo ${accion}: ya existe un registro igual. Buscalo en la lista y editalo.`
  }
  if (codigo === '23503') {
    return /still referenced/i.test(texto)
      ? `No se pudo ${accion} porque tiene otros datos asociados. Quitá primero esos datos y probá de nuevo.`
      : `No se pudo ${accion}: uno de los datos elegidos ya no existe. Recargá la pantalla y probá de nuevo.`
  }
  if (codigo === '22001') return `No se pudo ${accion}: un texto es demasiado largo. Acortalo y probá de nuevo.`
  if (['23502', '23514', '22P02', '22007', '22008', '22003'].includes(codigo)) {
    return `No se pudo ${accion}: falta un dato obligatorio o un dato no tiene el formato esperado. Revisá el formulario.`
  }
  return `No se pudo ${accion}. Probá de nuevo; si sigue pasando, avisá a coordinación.`
}

// Para pantallas que también muestran mensajes propios (ya en castellano): esos se conservan; los de la base se
// traducen.
export function mensajeErrorOPropio(error, accion = 'guardar') {
  if (!esErrorDeServicio(error) && error?.message) return error.message
  return mensajeError(error, accion)
}
