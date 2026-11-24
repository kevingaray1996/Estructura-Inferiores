// Coordenadas de los dibujos: siempre relativas al cuadro del video (0 a 1 en X e Y), para que se vean igual en
// cualquier pantalla. Lógica pura.

export const ASPECTO_VIDEO = 16 / 9

export const recortar01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

// Cuadro donde YouTube muestra la imagen dentro de un contenedor de ancho × alto (con franjas negras si el contenedor
// no es 16:9, por ejemplo en pantalla completa en un monitor 16:10).
export function cuadroVideo(ancho, alto, aspecto = ASPECTO_VIDEO) {
  const w = Math.max(0, Number(ancho) || 0), h = Math.max(0, Number(alto) || 0)
  if (!w || !h) return { izquierda: 0, arriba: 0, ancho: w, alto: h }
  if (w / h > aspecto) {
    const anchoVideo = h * aspecto
    return { izquierda: (w - anchoVideo) / 2, arriba: 0, ancho: anchoVideo, alto: h }
  }
  const altoVideo = w / aspecto
  return { izquierda: 0, arriba: (h - altoVideo) / 2, ancho: w, alto: altoVideo }
}

// Clic en la pantalla (px, py) → punto relativo dentro del cuadro. caja: { izquierda, arriba, ancho, alto } en px de
// pantalla (el rectángulo del cuadro del video).
export function aRelativo(px, py, caja) {
  if (!caja?.ancho || !caja?.alto) return { x: 0, y: 0 }
  return { x: recortar01((px - caja.izquierda) / caja.ancho), y: recortar01((py - caja.arriba) / caja.alto) }
}

// Punto relativo → píxeles dentro del cuadro (para dibujar).
export function aPixeles(p, caja) {
  return { x: recortar01(p?.x) * (caja?.ancho || 0), y: recortar01(p?.y) * (caja?.alto || 0) }
}

// Mueve un punto relativo sin sacarlo del cuadro.
export function desplazar(p, dx, dy) {
  return { x: recortar01(p.x + dx), y: recortar01(p.y + dy) }
}

export function distancia(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0))
}

// Trazo libre: se queda con un punto cada «paso» (relativo) para no guardar cientos.
export function simplificarTrazo(puntos, paso = 0.012, maximo = 60) {
  if (!puntos?.length) return []
  const salida = [puntos[0]]
  for (const p of puntos.slice(1)) if (distancia(p, salida[salida.length - 1]) >= paso) salida.push(p)
  const ultimo = puntos[puntos.length - 1]
  if (salida.length === 1 || salida[salida.length - 1] !== ultimo) salida.push(ultimo)
  if (salida.length <= maximo) return salida
  const salto = (salida.length - 1) / (maximo - 1)
  return Array.from({ length: maximo }, (_, i) => salida[Math.round(i * salto)])
}
