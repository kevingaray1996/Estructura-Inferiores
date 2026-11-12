// Imágenes para las PDF: se cargan como data URL; si algo falla, devuelven null
// y la PDF sigue sin la imagen.

export async function cargarImagenDataURL(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Recorte cuadrado centrado a lo ancho y desde arriba, para no cortar la cara.
export async function cargarImagenCuadradaDataURL(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const objectUrl = URL.createObjectURL(await res.blob())
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const lado = Math.min(img.width, img.height)
          const canvas = document.createElement('canvas')
          canvas.width = lado
          canvas.height = lado
          canvas.getContext('2d').drawImage(img, (img.width - lado) / 2, 0, lado, lado, 0, 0, lado, lado)
          resolve(canvas.toDataURL('image/jpeg', 0.9))
        }
        img.onerror = reject
        img.src = objectUrl
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}
