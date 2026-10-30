const cargas = new WeakMap()
// La API debe cargarse en el Window que contiene el iframe: allí recibe
// los mensajes reales de YouTube. No se reutiliza un listener de otra ventana.
export function cargarYouTubeEnVentana(ventana) {
  if (!/^https?:$/.test(ventana.location?.protocol || '')) return Promise.reject(Error('El reproductor necesita una página HTTP real de la aplicación. Volvé a separar la ventana.'))
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

export function mensajeErrorYouTube(codigo) {
  if (Number(codigo) === 153) return 'YouTube no recibió una identificación válida del sitio (error 153). Reconectá desde la ventana de la aplicación; no cambies las restricciones de seguridad del navegador.'
  if ([101, 150].includes(Number(codigo))) return 'El propietario de este video no permite reproducirlo incrustado. Podés abrirlo directamente en YouTube.'
  return `No se pudo reproducir el video de YouTube${codigo ? ` (error ${codigo})` : ''}. Reconectá el reproductor y verificá el enlace.`
}
