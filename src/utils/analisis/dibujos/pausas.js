// Pausas de un dibujo durante la reproducción, sin YouTube: con el tiempo leído del reproductor decide cuándo pausar,
// qué instante mostrar mientras dura la pausa y cuándo seguir. Lógica pura (docs/analisis-etapa4.md §4).
//
// Reglas:
//  - Se dispara si el video va reproduciendo y el tiempo cruza el instante de la pausa avanzando normalmente (menos
//    de SALTO_MAXIMO entre lecturas). Un salto (clic en la línea, cambio de clip) no la dispara.
//  - Mientras dura, el tiempo que se muestra es el de la pausa (los dibujos quedan congelados).
//  - Al cumplirse la duración se pide reanudar. Si la persona aprieta reproducir antes, termina ahí.
//  - Cada pausa se hace una vez por pasada; si el video vuelve antes de ella, se puede volver a hacer.

export const SALTO_MAXIMO = 1
const GRACIA_MS = 500 // tiempo que se le da a YouTube para pausarse antes de mirar si la persona reanudó

export function crearEstadoPausas() {
  return { previo: null, hechas: [], retenida: null }
}

// lectura: { t, reproduciendo, ahora (ms) }. pausas: [{ id, t, duracion }] ordenadas por t.
// Devuelve { estado, orden: null | { tipo: 'pausar', t } | { tipo: 'reanudar' }, tiempo, pausa: null | { restante } }.
export function pasoPausas(estado, { t, reproduciendo, ahora }, pausas) {
  const lista = pausas || []
  if (estado.retenida) {
    const r = estado.retenida
    // posPausa: la pausa ya pasó entera pero el video sigue en ese cuadro (YouTube tarda en arrancar): las animaciones
    // quedan como al final de la pausa, sin volver a empezar.
    if (ahora >= r.hastaMs) {
      const terminada = { t: r.t, transcurrido: (r.hastaMs - r.desdeMs) / 1000 }
      return { estado: { ...estado, retenida: null, previo: r.t, terminada }, orden: { tipo: 'reanudar' }, tiempo: r.t, pausa: null, posPausa: terminada }
    }
    if (reproduciendo && ahora - r.desdeMs > GRACIA_MS) {
      // La persona apretó reproducir: termina la pausa sin pedir nada.
      const terminada = { t: r.t, transcurrido: (ahora - r.desdeMs) / 1000 }
      return { estado: { ...estado, retenida: null, previo: t, terminada }, orden: null, tiempo: t, pausa: null, posPausa: Math.abs(t - r.t) < 0.002 ? terminada : null }
    }
    // transcurrido: lo que lleva la pausa (las animaciones de los dibujos siguen mientras el video está congelado).
    const duracion = (r.hastaMs - r.desdeMs) / 1000
    return { estado, orden: null, tiempo: r.t, pausa: { restante: Math.max(0, (r.hastaMs - ahora) / 1000), t: r.t, transcurrido: Math.max(0, (ahora - r.desdeMs) / 1000), duracion } }
  }

  const previo = estado.previo
  let hechas = estado.hechas
  // Volvió atrás: las pausas que quedaron adelante se pueden volver a hacer.
  if (previo !== null && t < previo - 0.05) hechas = hechas.filter((id) => (lista.find((p) => p.id === id)?.t ?? -1) < t)

  if (previo !== null && reproduciendo && t >= previo && t - previo < SALTO_MAXIMO) {
    const p = lista.find((x) => !hechas.includes(x.id) && x.t > previo && x.t <= t)
    if (p) {
      const retenida = { id: p.id, t: p.t, desdeMs: ahora, hastaMs: ahora + p.duracion * 1000 }
      return {
        estado: { previo: p.t, hechas: [...hechas, p.id], retenida },
        orden: { tipo: 'pausar', t: p.t },
        tiempo: p.t,
        pausa: { restante: p.duracion, t: p.t, transcurrido: 0, duracion: p.duracion },
      }
    }
  }
  const terminada = estado.terminada && Math.abs(t - estado.terminada.t) < 0.002 ? estado.terminada : null
  return { estado: { ...estado, hechas, previo: t, terminada }, orden: null, tiempo: t, pausa: null, posPausa: terminada }
}

// Pausa que corresponde a un instante (para el editor: mostrar el rombo elegido).
export function pausaEn(pausas, t, tolerancia = 0.05) {
  return (pausas || []).find((p) => Math.abs(p.t - t) < tolerancia) || null
}
