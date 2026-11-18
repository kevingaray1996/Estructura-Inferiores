import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// App de la jugadora (/jugadora/) con un cliente de Supabase simulado: no toca ninguna base.
const { JSDOM } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const PERFIL = { nombre: 'Ana', apellido: 'Alvarez', foto_url: null, categoria: 'Primera' }
const NUMEROS = {
  anios: [2026, 2025], anio: 2026,
  partidos: { jugados: 3, titularidades: 2, minutos: 145 },
  asistencia: { presentes: 4, tardes: 1, ausentes: 2, justificadas: 2, total: 9, porcentaje: 56 },
}

function crearCliente({ conSesion = false } = {}) {
  const llamadas = []
  const estado = {
    sesion: conSesion ? { user: { id: 'u-ana', email: 'ana@club.test' } } : null,
    perfil: { data: PERFIL, error: null },
    rol: null,
    otp: { error: null },
    verificar: { error: null },
    numeros: NUMEROS,
    respondio: false,
    oyentes: [],
    fallos: {},
    esperas: {},
  }
  const avisar = (evento) => estado.oyentes.forEach(f => f(evento, estado.sesion))
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: estado.sesion }, error: null }),
      onAuthStateChange(f) { estado.oyentes.push(f); return { data: { subscription: { unsubscribe() { estado.oyentes = estado.oyentes.filter(x => x !== f) } } } } },
      async signInWithOtp(args) { llamadas.push({ nombre: 'signInWithOtp', args }); return estado.otp },
      async verifyOtp(args) {
        llamadas.push({ nombre: 'verifyOtp', args })
        if (estado.verificar.error) return { data: null, error: estado.verificar.error }
        estado.sesion = { user: { id: 'u-ana', email: args.email } }
        avisar('SIGNED_IN')
        return { data: { session: estado.sesion }, error: null }
      },
      async signOut(args) { llamadas.push({ nombre: 'signOut', args }); estado.sesion = null; avisar('SIGNED_OUT'); return { error: null } },
    },
    async rpc(nombre, args) {
      llamadas.push({ nombre, args })
      if (estado.esperas[nombre]) await estado.esperas[nombre]
      if (estado.fallos[nombre]) return { data: null, error: estado.fallos[nombre] }
      if (nombre === 'portal_mi_perfil') return estado.perfil
      if (nombre === 'mi_rol') return { data: estado.rol, error: null }
      if (nombre === 'portal_mis_numeros') return { data: estado.numeros, error: null }
      if (nombre === 'portal_wellness_respondio') return { data: estado.respondio, error: null }
      if (nombre === 'portal_entrenamiento_hoy') return { data: [], error: null }
      if (nombre === 'portal_wellness_guardar') { estado.respondio = true; return { data: null, error: null } }
      if (nombre === 'portal_rpe_guardar') return { data: null, error: null }
      if (nombre === 'portal_avisos_estado') return { data: { preferencias: { wellness: true, rpe: true, entrenamiento: true, convocatoria: true, mensajes: true }, dispositivos: 1 }, error: null }
      if (['portal_avisos_suscribir', 'portal_avisos_desuscribir', 'portal_avisos_preferencias'].includes(nombre)) return { data: null, error: null }
      return { data: null, error: { code: '42883', message: 'no existe' } }
    },
    from(tabla) { llamadas.push({ nombre: 'from', tabla }); throw new Error('La app de la jugadora no lee tablas') },
  }
  return { cliente, llamadas, estado }
}

// Clave pública de prueba (65 bytes): solo para que la pestaña Avisos esté disponible.
const CLAVE_PRUEBA = 'B' + 'A'.repeat(86)

async function montar(f, { url = 'https://fixture.invalid/jugadora/', prepararDom } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url })
  prepararDom?.(dom)
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'FocusEvent', 'MouseEvent', 'navigator', 'location']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true); poner('__clienteJugadora', f.cliente)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_AVISOS_VAPID_PUBLICA': JSON.stringify(CLAVE_PRUEBA) }, plugins: [{ name: 'jugadora-sin-servicios', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0jugadora-cliente' }, load(id) { if (id === '\0jugadora-cliente') return 'export const supabase=globalThis.__clienteJugadora' } }] })
  const root = createRoot(document.getElementById('root'))
  const pausa = () => new Promise(r => setTimeout(r, 25))
  const restaurar = () => { for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] } }
  try {
    const App = (await vite.ssrLoadModule('/src/jugadora/AppJugadora.jsx')).default
    await act(async () => { root.render(h(App)); await pausa() })
    await act(pausa)
  } catch (error) {
    await act(async () => root.unmount())
    await vite.close()
    restaurar()
    throw error
  }
  const ayudas = {
    texto: () => document.body.textContent,
    boton: etiqueta => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === etiqueta),
    clic: async el => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await pausa() }); await act(pausa) },
    escribir: async (input, valor) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, valor)
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
        await pausa()
      })
    },
    enviar: async form => { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await pausa() }); await act(pausa) },
    async cerrar() {
      await act(async () => root.unmount())
      await vite.close()
      restaurar()
    },
  }
  return ayudas
}

test('Ingreso de la jugadora: mismo mensaje para cualquier mail, código incorrecto y código correcto', async () => {
  const f = crearCliente()
  const a = await montar(f)
  try {
    assert.match(a.texto(), /Tu email/)
    const inputMail = document.querySelector('input[type="email"]')
    assert.ok(inputMail)

    // Mail desconocido: Supabase responde que no se permiten altas; la pantalla dice lo mismo que con un mail registrado.
    f.estado.otp = { error: { message: 'Signups not allowed for otp', status: 422 } }
    await a.escribir(inputMail, ' Ana@Club.test ')
    await a.enviar(inputMail.form)
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'signInWithOtp').args,
      { email: 'ana@club.test', options: { shouldCreateUser: false, emailRedirectTo: 'https://fixture.invalid/jugadora/' } })
    assert.match(a.texto(), /Si tu mail está registrado, te llegó un link y un código de 6 dígitos\./)

    // Código incorrecto.
    f.estado.verificar = { error: { message: 'Token has expired or is invalid', status: 403 } }
    const inputCodigo = document.querySelector('input[autocomplete="one-time-code"]')
    assert.ok(inputCodigo)
    assert.equal(inputCodigo.getAttribute('inputmode'), 'numeric')
    await a.escribir(inputCodigo, '123456')
    await a.enviar(inputCodigo.form)
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'verifyOtp').args, { email: 'ana@club.test', token: '123456', type: 'email' })
    assert.match(a.texto(), /El código no es válido o venció\. Pedí uno nuevo\./)
    assert.ok(a.boton('Pedir otro código'))

    // Código correcto: entra y ve su navegación.
    f.estado.verificar = { error: null }
    await a.escribir(inputCodigo, '654321')
    await a.enviar(inputCodigo.form)
    assert.match(a.texto(), /Ana/)
    assert.ok(document.querySelector('nav[aria-label="Secciones de la jugadora"]'))
    assert.ok(!f.llamadas.some(l => l.nombre === 'from'), 'nunca lee tablas')
  } finally { await a.cerrar() }
})

test('Cuenta desactivada y cuenta del staff en la app de jugadoras', async () => {
  const f = crearCliente({ conSesion: true })
  f.estado.perfil = { data: null, error: { code: '42501', message: 'Esta cuenta no está activa.' } }
  let a = await montar(f)
  try {
    assert.match(a.texto(), /Esta cuenta no está activa\. Hablá con coordinación\./)
    assert.ok(a.boton('Cerrar sesión'))
    assert.ok(!document.querySelector('a[href="/"]'), 'sin rol de staff no ofrece ir al sistema')
  } finally { await a.cerrar() }

  const g = crearCliente({ conSesion: true })
  g.estado.perfil = { data: null, error: { code: '42501', message: 'Esta cuenta no está activa.' } }
  g.estado.rol = 'tecnico'
  a = await montar(g)
  try {
    assert.match(a.texto(), /Esta es la app de jugadoras/)
    assert.ok(document.querySelector('a[href="/"]'))
    await a.clic(a.boton('Cerrar sesión'))
    // Solo cierra este dispositivo: las otras sesiones de la persona siguen abiertas.
    assert.deepEqual(g.llamadas.find(l => l.nombre === 'signOut').args, { scope: 'local' })
    assert.match(a.texto(), /Tu email/)
  } finally { await a.cerrar() }
})

test('Instalación: manifest propio en /jugadora/, íconos locales y entrada de Vite', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/jugadora/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.start_url, '/jugadora/')
  assert.equal(manifest.scope, '/jugadora/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.name, 'Club Comunicaciones · Jugadoras')
  assert.equal(manifest.short_name, 'Comunicaciones')
  assert.ok(manifest.icons.length >= 2)
  for (const icono of manifest.icons) {
    assert.doesNotMatch(icono.src, /supabase\.co|^https?:/)
    assert.ok(readFileSync(new URL('../public' + icono.src, import.meta.url)).length > 0, icono.src)
  }
  const html = readFileSync(new URL('../jugadora/index.html', import.meta.url), 'utf8')
  assert.match(html, /rel="manifest" href="\/jugadora\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" href="\/iconos\/apple-touch-icon-180\.png"/)
  assert.doesNotMatch(html, /supabase\.co/)
  const sw = readFileSync(new URL('../public/jugadora/sw.js', import.meta.url), 'utf8')
  assert.doesNotMatch(sw, /addEventListener\(['"]fetch/, 'sin manejo de fetch en esta etapa')
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /jugadora: 'jugadora\/index\.html'/)
})

test('Pestañas de la jugadora: Mis números, Wellness desde la cuenta y nada que no sea suyo', async () => {
  const f = crearCliente({ conSesion: true })
  const a = await montar(f)
  try {
    const nav = document.querySelector('nav[aria-label="Secciones de la jugadora"]')
    const pestana = nombre => [...nav.querySelectorAll('button')].find(b => b.textContent.trim() === nombre)

    // Inicio: todavía no completó el Wellness.
    assert.match(a.texto(), /Wellness de hoy/)
    assert.ok(a.boton('Completar Wellness'))

    // Mis números.
    await a.clic(pestana('Mis números'))
    assert.equal(pestana('Mis números').getAttribute('aria-current'), 'page')
    const valores = [...document.querySelectorAll('.jg-dato')].map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])
    assert.deepEqual(valores, [['Jugados', '3'], ['Titular', '2'], ['Minutos', "145'"], ['Presentes', '4'], ['Tardes', '1'], ['Ausentes', '2'], ['Justificadas', '2']])
    // Igual que el PDF de perfil: (4 + 1) / (9 − 2 justificadas) = 71 %, sobre 7 sesiones.
    assert.match(a.texto(), /71 % de asistencia sobre 7 sesiones/)
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'portal_mis_numeros').args, { p_anio: null })

    // Otro año, sin registros de asistencia.
    f.estado.numeros = { ...NUMEROS, anio: 2025, asistencia: { presentes: 0, tardes: 0, ausentes: 0, justificadas: 0, total: 0, porcentaje: null } }
    const select = document.querySelector('select')
    await (async () => {
      const { act } = await import('react')
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, '2025')
        select.dispatchEvent(new window.Event('change', { bubbles: true }))
        await new Promise(r => setTimeout(r, 25))
      })
      await act(() => new Promise(r => setTimeout(r, 25)))
    })()
    assert.deepEqual(f.llamadas.filter(l => l.nombre === 'portal_mis_numeros').at(-1).args, { p_anio: 2025 })
    assert.match(a.texto(), /Sin registros este año/)

    // Wellness desde la cuenta: guarda con portal_wellness_guardar (sin ids) y vuelve "ya completaste".
    await a.clic(pestana('Wellness'))
    for (const fila of document.querySelectorAll('.space-y-5 > div')) {
      const tres = [...fila.querySelectorAll('button')].find(b => b.textContent.trim() === '3')
      await a.clic(tres)
    }
    await a.clic(a.boton('Enviar'))
    const guardado = f.llamadas.find(l => l.nombre === 'portal_wellness_guardar')
    assert.deepEqual(guardado.args, { p_sueno: 3, p_dolor_muscular: 3, p_fatiga: 3, p_estres: 3, p_animo_entrenar: 3, p_zona_dolor: null, p_fase_ciclo: null })
    assert.match(a.texto(), /Ya se guardó tu bienestar de hoy/)
    await a.clic(pestana('Inicio'))
    assert.match(a.texto(), /Ya completaste el Wellness de hoy/)

    // RPE desde la cuenta.
    await a.clic(pestana('Wellness'))
    await a.clic(a.boton('Esfuerzo (RPE)'))
    await a.clic(a.boton('7'))
    await a.clic(a.boton('Enviar'))
    const rpe = f.llamadas.find(l => l.nombre === 'portal_rpe_guardar')
    assert.deepEqual(Object.keys(rpe.args).sort(), ['p_fecha', 'p_rpe', 'p_tipo'])
    assert.equal(rpe.args.p_rpe, 7)

    // Nada que no sea suyo, y nunca una tabla.
    assert.doesNotMatch(a.texto(), /semáforo|evaluaci|médic/i)
    assert.ok(!f.llamadas.some(l => l.nombre === 'from'))
  } finally { await a.cerrar() }
})

test('Wellness de la jugadora: lo marcado sobrevive al cambiar a RPE y volver', async () => {
  const f = crearCliente({ conSesion: true })
  const a = await montar(f)
  try {
    const nav = document.querySelector('nav[aria-label="Secciones de la jugadora"]')
    await a.clic([...nav.querySelectorAll('button')].find(b => b.textContent.trim() === 'Wellness'))
    // El formulario marca la opción elegida en negrita (fontWeight 700).
    const filas = () => [...document.querySelectorAll('.space-y-5 > div')]
    const elegido = fila => [...fila.querySelectorAll('button')].filter(b => b.style.fontWeight === '700').map(b => b.textContent.trim())
    await a.clic([...filas()[0].querySelectorAll('button')].find(b => b.textContent.trim() === '2'))
    await a.clic([...filas()[1].querySelectorAll('button')].find(b => b.textContent.trim() === '4'))
    assert.deepEqual(filas().slice(0, 3).map(elegido), [['2'], ['4'], []])

    await a.clic(a.boton('Esfuerzo (RPE)'))
    assert.ok(filas()[0].closest('[hidden]'), 'el Wellness queda oculto, no desmontado')
    await a.clic(a.boton('Bienestar de hoy'))
    assert.ok(!filas()[0].closest('[hidden]'))
    assert.deepEqual(filas().slice(0, 3).map(elegido), [['2'], ['4'], []])
    assert.ok(!f.llamadas.some(l => l.nombre === 'portal_wellness_guardar'), 'cambiar de pestaña no guarda nada')
  } finally { await a.cerrar() }
})

// Navegador simulado con push: un registro del service worker, su pushManager y Notification.
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
function navegadorConPush(dom, { ua = UA_ANDROID, permiso = 'default', respuesta = 'granted', suscripta = false, instalada = false, conPush = true } = {}) {
  const w = dom.window
  const registro = { opciones: null, desuscripto: false }
  const crearSub = () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/prueba',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } } },
    async unsubscribe() { registro.pushManager.sub = null; registro.desuscripto = true; return true },
  })
  registro.pushManager = {
    sub: suscripta ? crearSub() : null,
    async getSubscription() { return this.sub },
    async subscribe(opciones) { registro.opciones = opciones; this.sub = crearSub(); return this.sub },
  }
  Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(w.navigator, 'serviceWorker', { value: { getRegistration: async () => registro, register: async () => registro, ready: Promise.resolve(registro) }, configurable: true })
  if (conPush) {
    w.PushManager = function PushManager() {}
    w.Notification = { permission: permiso, requestPermission: async () => { w.Notification.permission = respuesta; return respuesta } }
  }
  if (instalada) w.matchMedia = consulta => ({ matches: consulta === '(display-mode: standalone)' })
  return registro
}
const pestanaJugadora = nombre => [...document.querySelectorAll('nav[aria-label="Secciones de la jugadora"] button')].find(b => b.textContent.trim() === nombre)

test('Avisos: activar con permiso, elegir tipos y desactivar en este celular', async () => {
  const f = crearCliente({ conSesion: true })
  let registro
  const a = await montar(f, { prepararDom: dom => { registro = navegadorConPush(dom) } })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    assert.equal(pestanaJugadora('Avisos').getAttribute('aria-current'), 'page')
    assert.ok(!f.llamadas.some(l => l.nombre === 'portal_avisos_suscribir'), 'sin permiso todavía no se asocia nada')
    await a.clic(a.boton('Activar avisos'))
    assert.equal(registro.opciones.userVisibleOnly, true)
    assert.equal(registro.opciones.applicationServerKey.length, 65)
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'portal_avisos_suscribir').args,
      { p_endpoint: 'https://fcm.googleapis.com/fcm/send/prueba', p_p256dh: 'P'.repeat(87), p_auth: 'A'.repeat(22), p_dispositivo: 'android' })
    assert.match(a.texto(), /Los avisos están activados en este celular/)

    const rpe = [...document.querySelectorAll('label')].find(l => l.textContent.includes('RPE')).querySelector('input')
    await a.clic(rpe)
    assert.deepEqual(f.llamadas.filter(l => l.nombre === 'portal_avisos_preferencias').at(-1).args,
      { p_wellness: true, p_rpe: false, p_entrenamiento: true, p_convocatoria: true, p_mensajes: true })
    assert.equal(rpe.checked, false)

    await a.clic(a.boton('Desactivar avisos en este celular'))
    assert.deepEqual(f.llamadas.find(l => l.nombre === 'portal_avisos_desuscribir').args, { p_endpoint: 'https://fcm.googleapis.com/fcm/send/prueba' })
    assert.equal(registro.desuscripto, true)
    assert.ok(a.boton('Activar avisos'))
  } finally { await a.cerrar() }
})

test('Avisos: bloqueados, iPhone sin instalar y sincronización al abrir con permiso', async () => {
  let f = crearCliente({ conSesion: true })
  let a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { permiso: 'denied' }) })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    assert.match(a.texto(), /Los avisos están bloqueados para esta app/)
    assert.equal(a.boton('Activar avisos'), undefined)
  } finally { await a.cerrar() }

  f = crearCliente({ conSesion: true })
  a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { ua: UA_IPHONE }) })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    assert.match(a.texto(), /Agregar a pantalla de inicio/)
  } finally { await a.cerrar() }

  // iPhone con la app instalada pero sin push (iOS anterior a 16.4): pide actualizar, no el texto genérico.
  f = crearCliente({ conSesion: true })
  a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { ua: UA_IPHONE, instalada: true, conPush: false }) })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    assert.match(a.texto(), /Tu iPhone necesita iOS 16\.4 o más para recibir avisos\. Actualizalo desde Ajustes → General → Actualización de software\./)
    assert.doesNotMatch(a.texto(), /Este navegador no recibe avisos|Agregar a pantalla de inicio/)
  } finally { await a.cerrar() }

  // Con permiso y suscripción, al abrir la app la vuelve a asociar a esta cuenta (sin tocar nada).
  f = crearCliente({ conSesion: true })
  a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { permiso: 'granted', suscripta: true }) })
  try {
    assert.equal(f.llamadas.filter(l => l.nombre === 'portal_avisos_suscribir').length, 1)
  } finally { await a.cerrar() }
})

test('Avisos: si no se cargan las preferencias, no muestra los interruptores y deja reintentar', async () => {
  const f = crearCliente({ conSesion: true })
  f.estado.fallos.portal_avisos_estado = { message: 'Failed to fetch' }
  const a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { permiso: 'granted', suscripta: true }) })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    assert.match(a.texto(), /Los avisos están activados en este celular/)
    assert.match(a.texto(), /No se pudieron cargar tus preferencias\. Probá de nuevo\./)
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0, 'sin interruptores')
    assert.ok(a.boton('Desactivar avisos en este celular'), 'desactivar sigue disponible')
    delete f.estado.fallos.portal_avisos_estado
    await a.clic(a.boton('Reintentar'))
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 5)
    assert.doesNotMatch(a.texto(), /No se pudieron cargar tus preferencias/)
  } finally { await a.cerrar() }
})

test('Avisos: mientras se guarda un cambio, los interruptores quedan deshabilitados', async () => {
  const f = crearCliente({ conSesion: true })
  const a = await montar(f, { prepararDom: dom => navegadorConPush(dom, { permiso: 'granted', suscripta: true }) })
  try {
    await a.clic(pestanaJugadora('Avisos'))
    let soltar
    f.estado.esperas.portal_avisos_preferencias = new Promise(r => { soltar = r })
    const interruptores = () => [...document.querySelectorAll('input[type="checkbox"]')]
    assert.equal(interruptores().length, 5)
    const rpe = [...document.querySelectorAll('label')].find(l => l.textContent.includes('RPE')).querySelector('input')
    await a.clic(rpe)
    assert.ok(interruptores().every(i => i.disabled), 'todos deshabilitados mientras guarda')
    // Un segundo toque mientras guarda no manda otra llamada.
    const wellness = [...document.querySelectorAll('label')].find(l => l.textContent.includes('Wellness')).querySelector('input')
    await a.clic(wellness)
    assert.equal(f.llamadas.filter(l => l.nombre === 'portal_avisos_preferencias').length, 1)
    delete f.estado.esperas.portal_avisos_preferencias
    soltar()
    await a.clic(document.body)
    assert.ok(interruptores().every(i => !i.disabled), 'se habilitan al terminar')
    assert.deepEqual(f.llamadas.filter(l => l.nombre === 'portal_avisos_preferencias').at(-1).args,
      { p_wellness: true, p_rpe: false, p_entrenamiento: true, p_convocatoria: true, p_mensajes: true })
  } finally { await a.cerrar() }
})

test('Aviso tocado: ?seccion=rpe abre Wellness en la vista RPE y limpia la dirección; Salir desasocia el celular antes de cerrar', async () => {
  const f = crearCliente({ conSesion: true })
  let registro
  const a = await montar(f, { url: 'https://fixture.invalid/jugadora/?seccion=rpe', prepararDom: dom => { registro = navegadorConPush(dom, { permiso: 'granted', suscripta: true }) } })
  try {
    assert.equal(pestanaJugadora('Wellness').getAttribute('aria-current'), 'page')
    assert.equal(a.boton('Esfuerzo (RPE)').getAttribute('aria-pressed'), 'true')
    assert.equal(window.location.search, '')
    await a.clic(a.boton('Salir'))
    const orden = f.llamadas.map(l => l.nombre)
    assert.ok(orden.lastIndexOf('portal_avisos_desuscribir') < orden.indexOf('signOut'), 'desasocia antes de cerrar la sesión')
    assert.equal(registro.desuscripto, true)
  } finally { await a.cerrar() }
})
