// API de YouTube del reproductor (iframe_api), cargada una sola vez por ventana. La usan el video de Análisis y el
// reproductor de playlists.

let youtubeApiPromise = null

export function cargarYouTubeAPI() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube solo puede iniciarse en el navegador.'))
  }

  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve, reject) => {
    const callbackAnterior = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      if (typeof callbackAnterior === 'function') callbackAnterior()

      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        youtubeApiPromise = null
        reject(new Error('YouTube no pudo inicializar el reproductor.'))
      }
    }

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    )

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true

      script.onerror = () => {
        youtubeApiPromise = null
        reject(new Error('No se pudo cargar la API de YouTube.'))
      }

      document.head.appendChild(script)
    }
  })

  return youtubeApiPromise
}
