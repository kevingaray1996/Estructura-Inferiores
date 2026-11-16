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
      if (nombre === 'portal_mi_perfil') return estado.perfil
      if (nombre === 'mi_rol') return { data: estado.rol, error: null }
      if (nombre === 'portal_mis_numeros') return { data: estado.numeros, error: null }
      if (nombre === 'portal_wellness_respondio') return { data: estado.respondio, error: null }
      if (nombre === 'portal_entrenamiento_hoy') return { data: [], error: null }
      if (nombre === 'portal_wellness_guardar') { estado.respondio = true; return { data: null, error: null } }
      if (nombre === 'portal_rpe_guardar') return { data: null, error: null }
      return { data: null, error: { code: '42883', message: 'no existe' } }
    },
    from(tabla) { llamadas.push({ nombre: 'from', tabla }); throw new Error('La app de la jugadora no lee tablas') },
  }
  return { cliente, llamadas, estado }
}

async function montar(f) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/jugadora/' })
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'FocusEvent', 'MouseEvent', 'navigator', 'location']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true); poner('__clienteJugadora', f.cliente)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'jugadora-sin-servicios', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0jugadora-cliente' }, load(id) { if (id === '\0jugadora-cliente') return 'export const supabase=globalThis.__clienteJugadora' } }] })
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
