import { avisosDesuscribir, avisosSuscribir } from './portal'
import { claveAplicacion, datosSuscripcion, plataforma } from './avisos'

const SCOPE = '/jugadora/'

// El service worker de la app (scope /jugadora/). Si todavía no está (por ejemplo en desarrollo), se registra.
export async function registroAvisos(nav = globalThis.navigator) {
  const actual = await nav.serviceWorker.getRegistration(SCOPE)
  if (actual) return actual
  await nav.serviceWorker.register('/jugadora/sw.js', { scope: SCOPE })
  return nav.serviceWorker.ready
}

export async function suscripcionActual(nav = globalThis.navigator) {
  if (!nav?.serviceWorker) return null
  const registro = await nav.serviceWorker.getRegistration(SCOPE)
  return registro ? registro.pushManager.getSubscription() : null
}

// Pide el permiso (tiene que ser después de un toque), suscribe el celular y lo asocia a la cuenta.
// Devuelve { ok: true } o { error: 'bloqueado' | 'sin_permiso' | 'fallo' }.
export async function activarAvisos({ clavePublica, nav = globalThis.navigator, win = globalThis.window }) {
  try {
    const permiso = await win.Notification.requestPermission()
    if (permiso !== 'granted') return { error: permiso === 'denied' ? 'bloqueado' : 'sin_permiso' }
    const registro = await registroAvisos(nav)
    let suscripcion = await registro.pushManager.getSubscription()
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAplicacion(clavePublica) })
    }
    const { error } = await avisosSuscribir(datosSuscripcion(suscripcion, plataforma(nav)))
    return error ? { error: 'fallo' } : { ok: true }
  } catch {
    return { error: 'fallo' }
  }
}

// Saca este celular de la cuenta y de su servicio de push. Nunca lanza.
export async function desactivarAvisos(nav = globalThis.navigator) {
  try {
    const suscripcion = await suscripcionActual(nav)
    if (!suscripcion) return
    await avisosDesuscribir(suscripcion.endpoint)
    await suscripcion.unsubscribe()
  } catch {
    // Sin conexión: el celular queda suscripto hasta la próxima vez; la base lo borra si el servicio lo da por vencido.
  }
}

// Al abrir la app logueada: si este celular ya tiene permiso y suscripción, la vuelve a asociar a la cuenta actual
// (celular compartido o suscripción renovada). Nunca lanza.
export async function sincronizarAvisos(nav = globalThis.navigator, win = globalThis.window) {
  try {
    if (win?.Notification?.permission !== 'granted') return
    const suscripcion = await suscripcionActual(nav)
    if (suscripcion) await avisosSuscribir(datosSuscripcion(suscripcion, plataforma(nav)))
  } catch {
    // Se reintenta la próxima vez que abra la app.
  }
}
