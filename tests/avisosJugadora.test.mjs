import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Avisos de la jugadora: detección de plataforma y soporte, clave de la aplicación y service worker.
const { plataforma, soporte, claveAplicacion, datosSuscripcion } = await import('../src/jugadora/avisos.js')

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}

test('plataforma: iPhone (también iPad con escritorio), Android, compu y otro', () => {
  assert.equal(plataforma({ userAgent: UA.iphoneSafari }), 'iphone')
  assert.equal(plataforma({ userAgent: UA.iphoneFirefox }), 'iphone')
  assert.equal(plataforma({ userAgent: UA.ipad, platform: 'MacIntel', maxTouchPoints: 5 }), 'iphone')
  assert.equal(plataforma({ userAgent: UA.android }), 'android')
  assert.equal(plataforma({ userAgent: UA.windows }), 'compu')
  assert.equal(plataforma({ userAgent: 'algo raro' }), 'otro')
})

test('soporte: iPhone sin instalar, listo, bloqueado y sin soporte', () => {
  assert.equal(soporte({ plataforma: 'iphone', standalone: false, tienePush: false, permiso: 'default' }), 'instalar_iphone')
  // Firefox en iPhone tampoco está instalado: mismas instrucciones.
  assert.equal(soporte({ plataforma: 'iphone', standalone: false, tienePush: true, permiso: 'default' }), 'instalar_iphone')
  assert.equal(soporte({ plataforma: 'iphone', standalone: true, tienePush: true, permiso: 'default' }), 'listo')
  assert.equal(soporte({ plataforma: 'android', standalone: false, tienePush: true, permiso: 'denied' }), 'bloqueado')
  assert.equal(soporte({ plataforma: 'android', standalone: false, tienePush: true, permiso: 'granted' }), 'listo')
  assert.equal(soporte({ plataforma: 'compu', standalone: false, tienePush: false, permiso: 'default' }), 'sin_soporte')
  // iPhone instalado sin push: iOS anterior a 16.4, hay que actualizarlo.
  assert.equal(soporte({ plataforma: 'iphone', standalone: true, tienePush: false, permiso: 'default' }), 'actualizar_ios')
  assert.equal(soporte({ plataforma: 'android', standalone: true, tienePush: false, permiso: 'default' }), 'sin_soporte')
})

test('registroAvisos: siempre devuelve el registro activo (serviceWorker.ready), esté o no registrado', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'sin-supabase', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0sin-supabase' }, load(id) { if (id === '\0sin-supabase') return 'export const supabase={}' } }] })
  try {
    const { registroAvisos } = await vite.ssrLoadModule('/src/jugadora/avisosDispositivo.js')
    const instalando = { estado: 'instalando' }, activo = { estado: 'activo' }
    const crearNav = actual => {
      const nav = { registrados: [], serviceWorker: {
        getRegistration: async scope => { nav.scope = scope; return actual },
        register: async (url, opciones) => { nav.registrados.push([url, opciones]); return instalando },
        ready: Promise.resolve(activo),
      } }
      return nav
    }
    // Ya registrado (pero quizá todavía instalándose): espera a ready.
    let nav = crearNav(instalando)
    assert.equal(await registroAvisos(nav), activo)
    assert.equal(nav.scope, '/jugadora/')
    assert.deepEqual(nav.registrados, [])
    // Sin registrar: lo registra y también espera a ready.
    nav = crearNav(undefined)
    assert.equal(await registroAvisos(nav), activo)
    assert.deepEqual(nav.registrados, [['/jugadora/sw.js', { scope: '/jugadora/' }]])
  } finally { await vite.close() }
})

test('claveAplicacion: base64url a bytes (con y sin relleno)', () => {
  assert.deepEqual([...claveAplicacion('AQIDBA')], [1, 2, 3, 4])
  assert.deepEqual([...claveAplicacion('-_8')], [251, 255])
  assert.equal(claveAplicacion('B' + 'A'.repeat(86)).length, 65)
})

test('datosSuscripcion: endpoint y claves desde toJSON()', () => {
  const sub = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }) }
  assert.deepEqual(datosSuscripcion(sub, 'android'), { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'P'.repeat(87), auth: 'A'.repeat(22), dispositivo: 'android' })
})

// El service worker se evalúa con un "self" simulado.
function cargarSW({ ventanas = [] } = {}) {
  const oyentes = {}
  const mostradas = []
  const abiertas = []
  const self = {
    location: { origin: 'https://club.test' },
    addEventListener: (tipo, f) => { oyentes[tipo] = f },
    skipWaiting: () => {},
    registration: { showNotification: async (titulo, opciones) => { mostradas.push({ titulo, opciones }) } },
    clients: { claim: async () => {}, matchAll: async () => ventanas, openWindow: async (url) => { abiertas.push(url) } },
  }
  vm.runInNewContext(readFileSync(new URL('../public/jugadora/sw.js', import.meta.url), 'utf8'), { self, URL })
  const disparar = async (tipo, evento) => { let espera; oyentes[tipo]({ ...evento, waitUntil: (p) => { espera = p } }); await espera }
  return { oyentes, mostradas, abiertas, disparar }
}

test('service worker: muestra el aviso con su título, cuerpo, tag y url, y sin manejo de fetch', async () => {
  const sw = cargarSW()
  assert.equal(sw.oyentes.fetch, undefined)
  await sw.disparar('push', { data: { json: () => ({ titulo: 'Wellness', cuerpo: 'Completá tu Wellness de hoy.', url: '/jugadora/?seccion=wellness', tag: 'wellness-2026-11-19' }) } })
  assert.equal(sw.mostradas[0].titulo, 'Wellness')
  assert.equal(sw.mostradas[0].opciones.body, 'Completá tu Wellness de hoy.')
  assert.equal(sw.mostradas[0].opciones.tag, 'wellness-2026-11-19')
  assert.equal(sw.mostradas[0].opciones.icon, '/iconos/jugadora-192.png')
  assert.equal(sw.mostradas[0].opciones.data.url, 'https://club.test/jugadora/?seccion=wellness')
  // Una url de otro sitio o fuera de la app se reemplaza por el inicio de la app.
  await sw.disparar('push', { data: { json: () => ({ titulo: 'X', cuerpo: 'Y', url: 'https://otro.sitio/robo' }) } })
  assert.equal(sw.mostradas[1].opciones.data.url, 'https://club.test/jugadora/')
})

test('service worker: tocar el aviso lleva una ventana abierta de la app a la url, o abre una nueva', async () => {
  const navegadas = []
  const ventana = { url: 'https://club.test/jugadora/', focus: async () => {}, navigate: async (u) => { navegadas.push(u) } }
  let sw = cargarSW({ ventanas: [ventana] })
  const notificacion = { data: { url: 'https://club.test/jugadora/?seccion=rpe' }, close: () => {} }
  await sw.disparar('notificationclick', { notification: notificacion })
  assert.deepEqual(navegadas, ['https://club.test/jugadora/?seccion=rpe'])
  sw = cargarSW({ ventanas: [{ url: 'https://club.test/', focus: async () => {} }] })
  await sw.disparar('notificationclick', { notification: notificacion })
  assert.deepEqual(sw.abiertas, ['https://club.test/jugadora/?seccion=rpe'])
})
