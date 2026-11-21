// Tramos largos sin acciones dentro de cada tiempo de un partido ya etiquetado, para revisarlos.
// Se miden entre acciones consecutivas del mismo tiempo (el inicio y el fin de cada tiempo todavía no se guardan).

export const UMBRALES_TRAMO = [120, 180, 300, 600]

export function tramosSinAcciones(eventos, umbralSegundos = 180) {
  const porPeriodo = new Map()
  for (const e of eventos || []) {
    const segundo = Number(e?.segundo)
    if (!Number.isFinite(segundo)) continue
    const periodo = Number(e.periodo) === 2 ? 2 : 1
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, [])
    porPeriodo.get(periodo).push(segundo)
  }
  const tramos = []
  for (const periodo of [...porPeriodo.keys()].sort()) {
    const segundos = porPeriodo.get(periodo).sort((a, b) => a - b)
    for (let i = 1; i < segundos.length; i++) {
      const duracion = segundos[i] - segundos[i - 1]
      if (duracion >= umbralSegundos) tramos.push({ periodo, desde: segundos[i - 1], hasta: segundos[i], duracion })
    }
  }
  return tramos
}
