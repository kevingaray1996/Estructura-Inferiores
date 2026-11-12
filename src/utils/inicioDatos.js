// Cálculos de presentación compartidos por Inicio y Hoy. No consultan Supabase.

export function diasHastaProximoCumple(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`)
  if (Number.isNaN(nacimiento.getTime())) return null

  let proximo = new Date(
    hoy.getFullYear(),
    nacimiento.getMonth(),
    nacimiento.getDate()
  )

  if (proximo < hoy) {
    proximo = new Date(
      hoy.getFullYear() + 1,
      nacimiento.getMonth(),
      nacimiento.getDate()
    )
  }

  return Math.round((proximo - hoy) / (1000 * 60 * 60 * 24))
}

export function agruparProximoPartido(partidos) {
  if (!partidos || partidos.length === 0) return null

  const primeraFecha = partidos[0].fecha
  const delMismoDia = partidos.filter((p) => p.fecha === primeraFecha)
  const rivalPrincipal = delMismoDia[0].rival

  const delMismoPartido = delMismoDia.filter(
    (p) =>
      (p.rival || '').toLowerCase().trim() ===
      (rivalPrincipal || '').toLowerCase().trim()
  )

  return {
    ...delMismoPartido[0],
    categoriasNombres: delMismoPartido
      .map((p) => p.categorias?.nombre)
      .filter(Boolean),
  }
}

export function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}
