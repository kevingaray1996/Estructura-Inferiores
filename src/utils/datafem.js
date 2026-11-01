export function esComunicaciones(nombre) {
  return typeof nombre === 'string' && nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase() === 'comunicaciones'
}

export function resumenComunicaciones(datos) {
  const encontrados = ['zona_a', 'zona_b'].flatMap(key =>
    (Array.isArray(datos?.[key]) ? datos[key] : [])
      .filter(f => esComunicaciones(f.equipo)).map(fila => ({ zona: key === 'zona_a' ? 'Zona A' : 'Zona B', fila })))
  if (encontrados.length !== 1) return null
  const { zona, fila } = encontrados[0]
  const valido = valor => (typeof valor === 'number' || typeof valor === 'string') &&
    String(valor).trim() !== '' && Number.isFinite(Number(valor))
  if (!valido(fila.posicion) || Number(fila.posicion) < 1 || !Number.isInteger(Number(fila.posicion)) || !valido(fila.puntos)) return null
  return { zona, posicion: fila.posicion, puntos: fila.puntos }
}
