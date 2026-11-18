// Avisos de la jugadora (Web Push): lógica pura, sin la base. La llamada a las funciones portal_avisos_* está en
// avisosDispositivo.js.

// 'iphone' | 'android' | 'compu' | 'otro'. Un iPad con Safari de escritorio se presenta como Mac con pantalla táctil.
export function plataforma(nav = globalThis.navigator) {
  const ua = nav?.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1)) return 'iphone'
  if (/Android/.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'compu'
  return 'otro'
}

// La app abierta desde el ícono (instalada), en iPhone o Android.
export function esInstalada(win = globalThis.window) {
  return Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches || win?.navigator?.standalone === true)
}

export function tienePush(win = globalThis.window) {
  return Boolean(win && 'serviceWorker' in (win.navigator || {}) && 'PushManager' in win && 'Notification' in win)
}

// 'listo' | 'instalar_iphone' | 'actualizar_ios' | 'sin_soporte' | 'bloqueado'.
// En iPhone los avisos solo funcionan con la app instalada desde Safari (iOS 16.4 o más): instalada y sin push quiere
// decir un iOS anterior.
export function soporte({ plataforma: donde, standalone, tienePush: hayPush, permiso }) {
  if (donde === 'iphone' && !standalone) return 'instalar_iphone'
  if (donde === 'iphone' && !hayPush) return 'actualizar_ios'
  if (!hayPush) return 'sin_soporte'
  if (permiso === 'denied') return 'bloqueado'
  return 'listo'
}

// Clave pública VAPID (base64url) a bytes, para pushManager.subscribe.
export function claveAplicacion(base64url) {
  const base64 = String(base64url).replace(/-/g, '+').replace(/_/g, '/')
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = atob(base64 + relleno)
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

// Lo que se manda a portal_avisos_suscribir.
export function datosSuscripcion(suscripcion, dispositivo) {
  const { endpoint, keys } = suscripcion.toJSON()
  return { endpoint, p256dh: keys?.p256dh, auth: keys?.auth, dispositivo }
}
