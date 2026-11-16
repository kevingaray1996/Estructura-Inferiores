// Service worker de la app de jugadoras (scope /jugadora/).
// Etapa 1: solo existe para que la app sea instalable con su propio scope. No guarda nada en caché ni intercepta
// pedidos: la app siempre carga la versión publicada. La etapa 2 le suma los avisos (push) sin cambiar la URL.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))
