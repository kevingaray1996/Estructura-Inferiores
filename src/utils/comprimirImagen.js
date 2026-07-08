// Redimensiona y recomprime una imagen en el navegador antes de subirla,
// para no gastar de más el storage de Supabase (1GB en el plan free).
// Si algo falla, devuelve el archivo original tal cual (nunca rechaza la promesa).
export function comprimirImagen(archivo, { maxAncho = 1000, maxAlto = 1000, calidad = 0.82 } = {}) {
  return new Promise((resolve) => {
    if (!archivo || !archivo.type || !archivo.type.startsWith('image/')) {
      resolve(archivo)
      return
    }
    // Los GIF (pueden ser animados) los dejamos como están.
    if (archivo.type === 'image/gif') {
      resolve(archivo)
      return
    }

    const lector = new FileReader()
    lector.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxAncho || height > maxAlto) {
          const ratio = Math.min(maxAncho / width, maxAlto / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Los PNG los mantenemos como PNG (suelen ser escudos con transparencia).
        // El resto se recomprime como JPEG, que pesa mucho menos para fotos.
        const tipoSalida = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg'

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= archivo.size) {
              resolve(archivo)
              return
            }
            const nombreBase = archivo.name.replace(/\.\w+$/, '')
            const extension = tipoSalida === 'image/png' ? '.png' : '.jpg'
            resolve(new File([blob], `${nombreBase}${extension}`, { type: tipoSalida }))
          },
          tipoSalida,
          calidad
        )
      }
      img.onerror = () => resolve(archivo)
      img.src = e.target.result
    }
    lector.onerror = () => resolve(archivo)
    lector.readAsDataURL(archivo)
  })
}
