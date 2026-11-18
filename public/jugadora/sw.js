// Service worker de la app de jugadoras (scope /jugadora/).
// No guarda nada en caché ni intercepta pedidos: la app siempre carga la versión publicada.
// Etapa 2: muestra los avisos (push) y, al tocarlos, abre la app en la pestaña que corresponde.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

const INICIO = () => self.location.origin + '/jugadora/'

// Solo se abren direcciones de la propia app; cualquier otra cosa va al inicio.
function urlSegura(url) {
  try {
    const destino = new URL(url || '/jugadora/', self.location.origin)
    if (destino.origin === self.location.origin && destino.pathname.startsWith('/jugadora/')) return destino.href
  } catch {
    // dirección inválida: va al inicio
  }
  return INICIO()
}

self.addEventListener('push', (evento) => {
  let datos
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' }
  }
  evento.waitUntil(self.registration.showNotification(datos.titulo || 'Club Comunicaciones', {
    body: datos.cuerpo || '',
    icon: '/iconos/jugadora-192.png',
    badge: '/iconos/jugadora-192.png',
    tag: datos.tag || undefined,
    data: { url: urlSegura(datos.url) },
  }))
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = urlSegura(evento.notification.data && evento.notification.data.url)
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const ventana of ventanas) {
      if (new URL(ventana.url).pathname.startsWith('/jugadora/')) {
        await ventana.focus()
        if (typeof ventana.navigate === 'function') return ventana.navigate(destino)
        return undefined
      }
    }
    return self.clients.openWindow(destino)
  })())
})
