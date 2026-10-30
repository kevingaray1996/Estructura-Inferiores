const cargas = new WeakMap()
// La API debe cargarse en el Window que contiene el iframe: allí recibe
// los mensajes reales de YouTube. No se reutiliza un listener de otra ventana.
export function cargarYouTubeEnVentana(ventana) {
  if (ventana.YT?.Player) return Promise.resolve(ventana.YT)
  if (cargas.has(ventana.document)) return cargas.get(ventana.document)
  const documento = ventana.document
  const promesa = new Promise((resolve, reject) => {
    let intervalo, limite
    const terminar = error => { ventana.clearInterval(intervalo); ventana.clearTimeout(limite); if (error) { cargas.delete(documento); reject(error) } else resolve(ventana.YT) }
    intervalo = ventana.setInterval(() => { if (ventana.YT?.Player) terminar(); else if (ventana.document !== documento) terminar(Error('La ventana del video se recargó.')) }, 100)
    limite = ventana.setTimeout(() => terminar(Error('No se pudo conectar YouTube en la ventana auxiliar.')), 15000)
    let script = documento.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (!script) { script = documento.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = () => { script.remove(); terminar(Error('No se pudo cargar YouTube.')) }; documento.head.appendChild(script) }
  })
  cargas.set(documento, promesa)
  return promesa
}
