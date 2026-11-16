// Asistencia a entrenamientos: un solo cálculo para el PDF de perfil y la app de la jugadora.
// Lesionada y enferma son ausencias justificadas: no cuentan como sesiones.
//   porcentaje = (presentes + tardes) / (total de registros − justificadas)
// Devuelve null si no queda ninguna sesión para contar.
export function asistenciaSobreSesiones({ presentes = 0, tardes = 0, justificadas = 0, total = 0 } = {}) {
  const sesiones = total - justificadas
  if (sesiones <= 0) return null
  return {
    porcentaje: Math.round(((presentes + tardes) / sesiones) * 100),
    sesiones,
    detalle: `sobre ${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'}`,
  }
}
