export function calcularCuentaRegresiva(fecha, hora) {
  if (!fecha) return ''

  const horaFormateada = hora
    ? hora.length === 5
      ? `${hora}:00`
      : hora
    : '00:00:00'

  const fechaHoraPartido = new Date(`${fecha}T${horaFormateada}`)
  const diffMs = fechaHoraPartido - new Date()

  if (diffMs <= 0) return 'Es hoy'

  const totalHoras = diffMs / (1000 * 60 * 60)
  const dias = Math.floor(totalHoras / 24)
  const horas = Math.floor(totalHoras % 24)

  if (dias === 0) {
    return horas <= 1 ? 'Falta menos de 1 hora' : `Faltan ${horas} horas`
  }

  if (dias === 1) {
    return horas > 0 ? `Falta 1 día y ${horas}h` : 'Falta 1 día'
  }

  return horas > 0
    ? `Faltan ${dias} días y ${horas}h`
    : `Faltan ${dias} días`
}

