// Cámara lenta en un tramo del clip (versión 3, docs/analisis-dibujos-pro.md §Cámara lenta). Lógica pura: dice qué
// velocidad pedirle a YouTube en cada cuadro, sin YouTube.
import { VELOCIDADES_LENTAS, nuevoId } from './formato.js'

const redondear = (t) => Math.round(Number(t) * 1000) / 1000

// Tramo lento que contiene a t, o null.
export function lentoEn(lentos, t) {
  return (lentos || []).find((l) => t >= l.desde && t < l.hasta) || null
}

// Controlador: al entrar a un tramo guarda la velocidad que había y pide la lenta; al salir, devuelve la que había.
// paso({ t, reproduciendo, velocidad, ahora }, lentos) → velocidad a pedir, o null si no hay que cambiar nada.
// Con el video pausado no cambia nada (así no pelea con quien cambia la velocidad a mano).
export function crearControlLento() {
  let dentro = null // id del tramo en el que está
  let previa = null // velocidad que había al entrar
  let pedida = null // { v, ms } último pedido (YouTube tarda en aplicarlo)
  const pedir = (v, velocidad, ahora) => {
    if (velocidad === v) { pedida = null; return null }
    if (pedida && pedida.v === v && ahora - pedida.ms < 600) return null
    pedida = { v, ms: ahora }
    return v
  }
  return {
    paso({ t, reproduciendo, velocidad = 1, ahora = 0 }, lentos) {
      if (!reproduciendo) return null
      const tramo = lentoEn(lentos, t)
      if (tramo) {
        if (dentro !== tramo.id) { if (dentro === null) previa = velocidad; dentro = tramo.id }
        return pedir(tramo.velocidad, velocidad, ahora)
      }
      if (dentro === null) return null
      const v = previa ?? 1
      dentro = null; previa = null
      return pedir(v, velocidad, ahora)
    },
    // Velocidad a devolver si se deja de mostrar el clip en medio de un tramo (o null).
    salir() {
      const v = dentro !== null ? previa ?? 1 : null
      dentro = null; previa = null; pedida = null
      return v
    },
    get dentro() { return dentro },
  }
}

// Tramo lento nuevo desde t (2 s, o hasta el próximo tramo o el fin del clip). Devuelve { dibujo, id } (id null si no
// entra: ya hay un tramo en t o queda menos de 0,2 s).
export function agregarLento(d, t, { clip = d.clip, velocidad = 0.5, duracion = 2 } = {}) {
  const lentos = d.lentos || []
  const desde = redondear(t)
  if (lentoEn(lentos, desde)) return { dibujo: d, id: null }
  const siguiente = lentos.find((l) => l.desde > desde)
  const hasta = redondear(Math.min(desde + duracion, siguiente ? siguiente.desde : Infinity, clip?.fin ?? Infinity))
  if (hasta - desde < 0.2) return { dibujo: d, id: null }
  const id = nuevoId('l', lentos.map((l) => l.id))
  const v = VELOCIDADES_LENTAS.includes(velocidad) ? velocidad : 0.5
  return { dibujo: { ...d, lentos: [...lentos, { id, desde, hasta, velocidad: v }].sort((a, b) => a.desde - b.desde) }, id }
}

// «0,5x»
export const textoVelocidad = (v) => `${String(v).replace('.', ',')}x`
