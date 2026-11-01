export const FORMACIONES = {
  '4-4-2': [
    [
      { id: 'DC1', nombre: 'Delantera', acepta: ['Delantero centro'] },
      { id: 'DC2', nombre: 'Delantera', acepta: ['Delantero centro'] },
    ],
    [
      { id: 'EI', nombre: 'Volante izquierdo', acepta: ['Extremo izquierdo'] },
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'ED', nombre: 'Volante derecho', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
  '4-2-3-1': [
    [{ id: 'DC', nombre: 'Delantera', acepta: ['Delantero centro'] }],
    [
      { id: 'EI', nombre: 'Extrema izquierda', acepta: ['Extremo izquierdo'] },
      { id: 'VO', nombre: 'Volante ofensiva', acepta: ['Volante ofensivo'] },
      { id: 'ED', nombre: 'Extrema derecha', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
}

const normalizar = valor => (valor || '').trim().toLocaleLowerCase('es-AR')

export function obtenerMinutos(jugadora, estadisticas) {
  return Number(estadisticas[String(jugadora.id)]?.minutos || 0)
}

export function asignarOnce(jugadoras, estadisticas, formacion) {
  const filas = FORMACIONES[formacion]
  const puestos = filas.flat()
  const asignadas = new Map()
  const usadas = new Set()

  const ordenadas = [...jugadoras].sort((a, b) => {
    const diferencia =
      obtenerMinutos(b, estadisticas) - obtenerMinutos(a, estadisticas)

    if (diferencia !== 0) return diferencia

    return `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(
      `${b.apellido || ''} ${b.nombre || ''}`,
      'es'
    )
  })

  for (const jugadora of ordenadas) {
    const principal = normalizar(jugadora.posicion)
    const secundaria = normalizar(jugadora.posicion_secundaria)

    const puestoPrincipal = puestos.find(
      (puesto) =>
        !asignadas.has(puesto.id) &&
        puesto.acepta.some((p) => normalizar(p) === principal)
    )

    if (puestoPrincipal) {
      asignadas.set(puestoPrincipal.id, jugadora)
      usadas.add(String(jugadora.id))
      continue
    }

    const puestoSecundario = puestos.find(
      (puesto) =>
        !asignadas.has(puesto.id) &&
        puesto.acepta.some((p) => normalizar(p) === secundaria)
    )

    if (puestoSecundario) {
      asignadas.set(puestoSecundario.id, jugadora)
      usadas.add(String(jugadora.id))
    }
  }

  return {
    filas: filas.map((fila) =>
      fila.map((puesto) => ({
        ...puesto,
        jugadora: asignadas.get(puesto.id) || null,
      }))
    ),
    usadas,
  }
}

