// Saca los textos de un PDF de COMET con su posición en la página (para leerComet en comet.js).
// pdfjs-dist se carga recién al importar un PDF (no pesa en el resto de la app). Versión «legacy»: anda también en
// celulares con navegadores viejos.

// pdfjs: el módulo de pdfjs-dist. datos: Uint8Array del PDF. y va de arriba hacia abajo.
export async function extraerTextos(pdfjs, datos) {
  const tarea = pdfjs.getDocument({ data: datos, isEvalSupported: false, useSystemFonts: false })
  const doc = await tarea.promise
  const textos = []
  try {
    for (let pagina = 1; pagina <= doc.numPages; pagina++) {
      const hoja = await doc.getPage(pagina)
      const vista = hoja.getViewport({ scale: 1 })
      const contenido = await hoja.getTextContent()
      for (const item of contenido.items) {
        if (!item.str || !item.str.trim()) continue
        textos.push({
          pagina, x: item.transform[4], y: vista.height - item.transform[5], ancho: item.width,
          texto: item.str, anchoPagina: vista.width, altoPagina: vista.height,
        })
      }
    }
  } finally {
    await tarea.destroy()
  }
  return textos
}

// En el navegador: lee el archivo elegido y devuelve sus textos.
export async function textosDeArchivo(archivo) {
  const [pdfjs, { default: trabajador }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = trabajador
  return extraerTextos(pdfjs, new Uint8Array(await archivo.arrayBuffer()))
}
