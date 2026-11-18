import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Pantalla de coordinación «Cuentas de jugadoras» con un cliente de Supabase simulado: no toca ninguna base.
const { JSDOM } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const cat = '10000000-0000-4000-8000-000000000001'
const ana = '30000000-0000-4000-8000-000000000001'
const bea = '30000000-0000-4000-8000-000000000002'
const caro = '30000000-0000-4000-8000-000000000003'

function crearCliente() {
  const estado = {
    filas: [
      { jugador_id: ana, nombre: 'Ana', apellido: 'Alvarez', foto_url: null, email: null, activa: null, ultimo_ingreso: null },
      { jugador_id: bea, nombre: 'Bea', apellido: 'Benitez', foto_url: null, email: 'bea@club.test', activa: true, ultimo_ingreso: '2026-11-12T15:00:00Z' },
      { jugador_id: caro, nombre: 'Caro', apellido: 'Castro', foto_url: null, email: 'caro@club.test', activa: false, ultimo_ingreso: null },
    ],
    respuestaInvoke: { data: { ok: true }, error: null },
  }
  const llamadas = []
  const cliente = {
    from(tabla) {
      llamadas.push({ tipo: 'from', tabla })
      const q = { select: () => q, order: () => Promise.resolve({ data: [{ id: cat, nombre: 'Primera' }], error: null }) }
      return q
    },
    rpc(nombre, args) {
      llamadas.push({ tipo: 'rpc', nombre, args })
      if (nombre === 'cuentas_jugadoras_listar') return Promise.resolve({ data: estado.filas, error: null })
      return Promise.resolve({ data: null, error: { code: '42883', message: 'no existe' } })
    },
    functions: {
      invoke(nombre, opciones) {
        llamadas.push({ tipo: 'invoke', nombre, body: opciones?.body })
        return Promise.resolve(estado.respuestaInvoke)
      },
    },
  }
  return { cliente, llamadas, estado }
}

// Como supabase-js: un error HTTP de la función trae la respuesta en error.context.
function errorFuncion(codigo, status = 409) {
  return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: codigo }), { status }) } }
}

test('Cuentas de jugadoras: estados, alta con validación al salir del campo, errores y baja con confirmación', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' })
  const previos = new Map()
  const f = crearCliente()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'FocusEvent', 'MouseEvent', 'navigator']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true); poner('__clienteCuentas', f.cliente)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'cuentas-sin-servicios', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0cuentas-cliente' }, load(id) { if (id === '\0cuentas-cliente') return 'export const supabase=globalThis.__clienteCuentas' } }] })
  const root = createRoot(document.getElementById('root'))
  const pausa = () => new Promise(r => setTimeout(r, 20))
  const texto = () => document.body.textContent
  const boton = (etiqueta, dentro = document) => [...dentro.querySelectorAll('button')].find(b => b.textContent.trim() === etiqueta)
  const fila = nombre => [...document.querySelectorAll('[data-fila-jugadora]')].find(el => el.textContent.includes(nombre))
  const clic = async el => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await pausa() }) }
  const escribir = async (input, valor) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, valor)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      await pausa()
    })
  }
  const salir = async input => { await act(async () => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); await pausa() }) }
  try {
    const Panel = (await vite.ssrLoadModule('/src/components/usuarios/CuentasJugadorasPanel.jsx')).default
    await act(async () => { root.render(h(Panel, { perfil: { rol: 'coordinacion' }, activo: true })); await pausa() })
    await act(pausa)

    assert.deepEqual(f.llamadas.find(l => l.nombre === 'cuentas_jugadoras_listar').args, { p_categoria_id: cat })
    assert.match(fila('Alvarez').textContent, /Sin cuenta/)
    assert.match(fila('Benitez').textContent, /Activa · último ingreso 12\/11/)
    assert.match(fila('Castro').textContent, /Desactivada/)
    assert.match(texto(), /La jugadora entra en https:\/\/fixture\.invalid\/jugadora\/ con su mail/)
    assert.equal(document.querySelector('a.cj-link')?.getAttribute('href'), 'https://fixture.invalid/jugadora/')

    // Copiar link: copia el link completo y lo anuncia en el aviso; sin portapapeles, da la salida.
    const aviso = () => document.querySelector('[role="status"]').textContent
    const copiados = []
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async t => { copiados.push(t) } } })
    await clic(boton('Copiar link'))
    assert.deepEqual(copiados, ['https://fixture.invalid/jugadora/'])
    assert.equal(aviso(), 'Link copiado.')
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denegado') } } })
    await clic(boton('Copiar link'))
    assert.equal(aviso(), 'No se pudo copiar. Mantené apretado el link para copiarlo.')
    delete window.navigator.clipboard

    // Alta: el campo tiene etiqueta visible; el error aparece recién al salir del campo y no se llama a la función.
    await clic(boton('Crear cuenta', fila('Alvarez')))
    const input = fila('Alvarez').querySelector('input[type="email"]')
    assert.ok(input, 'aparece el campo de email en la misma fila')
    assert.equal(document.querySelector(`label[for="${input.id}"]`)?.textContent.trim(), 'Email de la jugadora')
    await escribir(input, 'ana-sin-arroba')
    assert.doesNotMatch(fila('Alvarez').textContent, /mail válido/, 'no marca el error mientras escribe')
    await salir(input)
    assert.match(fila('Alvarez').textContent, /Escribí un mail válido/)
    await clic(boton('Crear cuenta', fila('Alvarez')))
    assert.equal(f.llamadas.filter(l => l.tipo === 'invoke').length, 0, 'con mail inválido no se llama a la función')
    await escribir(input, ' Ana@Club.test ')
    assert.doesNotMatch(fila('Alvarez').textContent, /Escribí un mail válido/, 'el error se borra al corregir')

    // Mail en uso: mensaje claro y el campo sigue abierto.
    f.estado.respuestaInvoke = errorFuncion('email_en_uso')
    await clic(boton('Crear cuenta', fila('Alvarez')))
    await act(pausa)
    assert.deepEqual(f.llamadas.filter(l => l.tipo === 'invoke').at(-1), { tipo: 'invoke', nombre: 'cuentas-jugadoras', body: { accion: 'crear', jugador_id: ana, email: 'ana@club.test' } })
    assert.match(fila('Alvarez').textContent, /Ese mail ya está en uso por otra cuenta\. Usá otro\./)

    // Alta correcta: recarga la lista.
    f.estado.respuestaInvoke = { data: { ok: true }, error: null }
    f.estado.filas[0] = { ...f.estado.filas[0], email: 'ana@club.test', activa: true }
    const listadosAntes = f.llamadas.filter(l => l.nombre === 'cuentas_jugadoras_listar').length
    await clic(boton('Crear cuenta', fila('Alvarez')))
    await act(pausa)
    assert.equal(f.llamadas.filter(l => l.nombre === 'cuentas_jugadoras_listar').length, listadosAntes + 1)
    assert.match(fila('Alvarez').textContent, /Activa · nunca ingresó/)

    // Baja: pide confirmación con el nombre antes de llamar a la función.
    const invokesAntes = f.llamadas.filter(l => l.tipo === 'invoke').length
    await clic(boton('Desactivar cuenta', fila('Benitez')))
    assert.equal(f.llamadas.filter(l => l.tipo === 'invoke').length, invokesAntes, 'el primer clic solo pide confirmar')
    assert.match(fila('Benitez').textContent, /Desactivar la cuenta de Bea Benitez/)
    // El foco va al botón de confirmar; Cancelar lo devuelve al botón de la fila.
    assert.equal(document.activeElement, boton('Desactivar cuenta', fila('Benitez')))
    assert.ok(document.activeElement.closest('.cj-confirmar'))
    await clic(boton('Cancelar', fila('Benitez')))
    assert.doesNotMatch(fila('Benitez').textContent, /Desactivar la cuenta de/)
    assert.equal(document.activeElement, boton('Desactivar cuenta', fila('Benitez')))
    await clic(boton('Desactivar cuenta', fila('Benitez')))
    await clic(boton('Desactivar cuenta', fila('Benitez')))
    await act(pausa)
    assert.deepEqual(f.llamadas.filter(l => l.tipo === 'invoke').at(-1).body, { accion: 'desactivar', jugador_id: bea })

    // Reactivar no pide confirmación. Sin conexión: mensaje con salida.
    f.estado.respuestaInvoke = { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } }
    await clic(boton('Reactivar cuenta', fila('Castro')))
    await act(pausa)
    assert.deepEqual(f.llamadas.filter(l => l.tipo === 'invoke').at(-1).body, { accion: 'reactivar', jugador_id: caro })
    assert.match(fila('Castro').textContent, /No se pudo guardar\. Revisá la conexión y probá de nuevo\./)

    // Quitar cuenta (solo en una cuenta desactivada): pide confirmar con el nombre y el mail, y la jugadora vuelve a
    // "Sin cuenta". Las cuentas activas no ofrecen quitar.
    assert.equal(boton('Quitar cuenta', fila('Alvarez')), undefined, 'una cuenta activa no ofrece quitar')
    f.estado.respuestaInvoke = { data: { ok: true }, error: null }
    const invokesAntesDeQuitar = f.llamadas.filter(l => l.tipo === 'invoke').length
    await clic(boton('Quitar cuenta', fila('Castro')))
    assert.equal(f.llamadas.filter(l => l.tipo === 'invoke').length, invokesAntesDeQuitar, 'el primer clic solo pide confirmar')
    assert.match(fila('Castro').textContent, /Quitar la cuenta de Caro Castro\. Se borra su usuario de ingreso \(caro@club\.test\)/)
    assert.equal(boton('Reactivar cuenta', fila('Castro')), undefined, 'mientras confirma no ofrece otras acciones')
    assert.equal(document.activeElement, boton('Quitar cuenta', fila('Castro')))
    assert.ok(document.activeElement.closest('.cj-confirmar'))
    await clic(boton('Cancelar', fila('Castro')))
    assert.doesNotMatch(fila('Castro').textContent, /Quitar la cuenta de/)
    assert.equal(document.activeElement, boton('Quitar cuenta', fila('Castro')))
    await clic(boton('Quitar cuenta', fila('Castro')))
    f.estado.filas[2] = { ...f.estado.filas[2], email: null, activa: null }
    await clic(boton('Quitar cuenta', fila('Castro')))
    await act(pausa)
    assert.deepEqual(f.llamadas.filter(l => l.tipo === 'invoke').at(-1).body, { accion: 'quitar', jugador_id: caro })
    assert.match(fila('Castro').textContent, /Sin cuenta/)
    assert.match(texto(), /Cuenta de Caro Castro quitada\. Ya se le puede crear una nueva\./)

    // Nunca consulta tablas de cuentas directamente: solo categorías (para el selector) y la función de la base.
    assert.deepEqual([...new Set(f.llamadas.filter(l => l.tipo === 'from').map(l => l.tabla))], ['categorias'])
  } finally {
    await act(async () => root.unmount())
    await vite.close()
    for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
  }
})

test('llamarCuentas: un 401 del gateway sin código propio se lee como sin_sesion', async () => {
  const { llamarCuentas } = await import('../src/utils/cuentasJugadoras.js')
  const cliente = respuesta => ({ functions: { invoke: async () => ({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: respuesta } }) } })
  // El gateway responde 401 con otro formato ({msg}) o sin JSON.
  assert.deepEqual(await llamarCuentas(cliente(new Response(JSON.stringify({ code: 401, msg: 'Invalid JWT' }), { status: 401 })), {}), { error: 'sin_sesion' })
  assert.deepEqual(await llamarCuentas(cliente(new Response('no es json', { status: 401 })), {}), { error: 'sin_sesion' })
  // Si la función mandó su código, manda ese.
  assert.deepEqual(await llamarCuentas(cliente(new Response(JSON.stringify({ error: 'sin_sesion' }), { status: 401 })), {}), { error: 'sin_sesion' })
  assert.deepEqual(await llamarCuentas(cliente(new Response(JSON.stringify({ error: 'sin_permiso' }), { status: 403 })), {}), { error: 'sin_permiso' })
  // Otro status sin código sigue siendo error_interno.
  assert.deepEqual(await llamarCuentas(cliente(new Response('{}', { status: 500 })), {}), { error: 'error_interno' })
})

test('Usuarios: el selector Staff / Jugadoras solo aparece para coordinación', async () => {
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('../src/components/UsuariosSection.jsx', import.meta.url), 'utf8')
  assert.match(fuente, /perfil\?\.rol === 'coordinacion'/)
  assert.match(fuente, /CuentasJugadorasPanel/)
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /<UsuariosSection perfil=\{perfil\} \/>/)
})
