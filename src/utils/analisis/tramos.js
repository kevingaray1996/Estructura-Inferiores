// Tramos largos sin acciones dentro de cada tiempo de un partido ya etiquetado, para revisarlos.
// Se miden entre acciones consecutivas del mismo tiempo. Con las marcas del partido (inicio y fin de cada tiempo)
// también cuentan el hueco desde el inicio hasta la primera acción y desde la última hasta el fin, y un tiempo entero
// sin acciones.

export const UMBRALES_TRAMO = [120, 180, 300, 600]

// marcas: { inicio_1t, fin_1t, inicio_2t, fin_partido } en segundos del video (o null), opcional.
export function tramosSinAcciones(eventos, umbralSegundos = 180, marcas = null) {
  const porPeriodo = new Map([[1, []], [2, []]])
  for (const e of eventos || []) {
    const segundo = Number(e?.segundo)
    if (!Number.isFinite(segundo)) continue
    porPeriodo.get(Number(e.periodo) === 2 ? 2 : 1).push(segundo)
  }
  const limites = { 1: [marcas?.inicio_1t, marcas?.fin_1t], 2: [marcas?.inicio_2t, marcas?.fin_partido] }
  const tramos = []
  for (const periodo of [1, 2]) {
    const segundos = porPeriodo.get(periodo).sort((a, b) => a - b)
    const [inicio, fin] = limites[periodo]
    const puntos = [
      ...(inicio != null && (segundos.length === 0 || inicio < segundos[0]) ? [inicio] : []),
      ...segundos,
      ...(fin != null && (segundos.length === 0 || fin > segundos[segundos.length - 1]) ? [fin] : []),
    ]
    // Un tiempo sin acciones solo cuenta si están las dos marcas.
    if (segundos.length === 0 && (inicio == null || fin == null)) continue
    for (let i = 1; i < puntos.length; i++) {
      const duracion = puntos[i] - puntos[i - 1]
      if (duracion >= umbralSegundos) tramos.push({ periodo, desde: puntos[i - 1], hasta: puntos[i], duracion })
    }
  }
  return tramos
}
