// Sólo SVG generado por React; sin HTML arbitrario, recursos externos ni scripts.
export async function miniaturaPizarra(svg) {
  const copia = svg.cloneNode(true)
  copia.setAttribute('width', '1200'); copia.setAttribute('height', '800')
  copia.querySelectorAll('[data-seleccion]').forEach(n => n.remove())
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('No se pudo exportar la cancha.')); img.src = url })
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#24733F'; ctx.fillRect(0, 0, 900, 600); ctx.drawImage(img, 0, 0, 900, 600)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
export function descargarArchivo(contenido, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
