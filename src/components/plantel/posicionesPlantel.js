// Equivalencias de la posición principal que ya utiliza ListaJugadores.
const POSICIONES = {
  Arquero: ['arqueras', 'ARQ'],
  'Defensor central': ['defensoras', 'DFC'],
  'Lateral derecho': ['defensoras', 'LD'],
  'Lateral izquierdo': ['defensoras', 'LI'],
  'Mediocampista central': ['mediocampistas', 'MC'],
  'Volante ofensivo': ['mediocampistas', 'VO'],
  'Extremo derecho': ['mediocampistas', 'ED'],
  'Extremo izquierdo': ['mediocampistas', 'EI'],
  'Delantero centro': ['delanteras', 'DEL'],
}
export const GRUPOS_PLANTEL = [
  ['arqueras', 'ARQUERAS'], ['defensoras', 'DEFENSORAS'],
  ['mediocampistas', 'MEDIOCAMPISTAS'], ['delanteras', 'DELANTERAS'],
  ['sin_equivalencia', 'POSICIÓN SIN CLASIFICAR'],
]
export function puestoPlantel(posicion) {
  const texto = typeof posicion === 'string' ? posicion.trim().toLocaleLowerCase('es-AR') : ''
  const entrada = Object.entries(POSICIONES).find(([nombre]) => nombre.toLocaleLowerCase('es-AR') === texto)
  return entrada ? { grupo: entrada[1][0], abreviatura: entrada[1][1] } : { grupo: 'sin_equivalencia', abreviatura: '—' }
}
export function agruparPlantel(jugadoras) {
  return GRUPOS_PLANTEL.map(([id, nombre]) => ({ id, nombre,
    jugadoras: jugadoras.filter(j => puestoPlantel(j.posicion).grupo === id) }))
    .filter(g => g.jugadoras.length > 0)
}
