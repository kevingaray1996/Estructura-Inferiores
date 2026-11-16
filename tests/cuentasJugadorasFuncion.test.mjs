// Cuentas de jugadoras, Tarea 2: la Edge Function cuentas-jugadoras con clientes simulados (sin red ni Supabase).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { atender, validarPedido } from '../supabase/functions/cuentas-jugadoras/index.js'

const JUGADORA = '11111111-2222-4333-8444-555555555555'
const COORD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NUEVO = '99999999-8888-4777-8666-555555555555'

// Clientes simulados: registran cada llamada y responden lo que diga cada test.
function clientes({ rol = 'coordinacion', usuario = { id: COORD }, crear, registrar, estado, actualizar, borrar } = {}) {
  const llamadas = []
  const clienteUsuario = {
    auth: {
      getUser: async (token) => {
        llamadas.push(['getUser', token])
        return usuario ? { data: { user: usuario }, error: null } : { data: { user: null }, error: { message: 'jwt inválido' } }
      },
    },
    rpc: async (nombre, args) => {
      llamadas.push(['rpcUsuario', nombre, args])
      return { data: rol, error: null }
    },
  }
  const clienteAdmin = {
    auth: {
      admin: {
        createUser: async (args) => {
          llamadas.push(['createUser', args])
          return crear ? crear(args) : { data: { user: { id: NUEVO, email: args.email } }, error: null }
        },
        deleteUser: async (id) => {
          llamadas.push(['deleteUser', id])
          return borrar ? borrar(id) : { data: {}, error: null }
        },
        updateUserById: async (id, args) => {
          llamadas.push(['updateUserById', id, args])
          return actualizar ? actualizar(id, args) : { data: { user: { id } }, error: null }
        },
      },
    },
    rpc: async (nombre, args) => {
      llamadas.push(['rpcAdmin', nombre, args])
      if (nombre === 'cuentas_jugadoras_registrar') return registrar ? registrar(args) : { data: null, error: null }
      if (nombre === 'cuentas_jugadoras_estado') return estado ? estado(args) : { data: NUEVO, error: null }
      return { data: null, error: { code: '42883', message: 'no existe' } }
    },
  }
  return { clienteUsuario, clienteAdmin, llamadas }
}

function pedido(cuerpo, { token = 'tok', metodo = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('https://x.supabase.co/functions/v1/cuentas-jugadoras', {
    method: metodo,
    headers,
    body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  })
}

async function leer(respuesta) {
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const nombres = (llamadas) => llamadas.map((l) => (l[0].startsWith('rpc') ? `${l[0]}:${l[1]}` : l[0]))
const tocoAdmin = (llamadas) => llamadas.some((l) => l[0] === 'rpcAdmin' || ['createUser', 'deleteUser', 'updateUserById'].includes(l[0]))

test('validarPedido: normaliza el mail y acepta las tres acciones', () => {
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA.toUpperCase(), email: '  Ana.Perez@Mail.COM ' }),
    { accion: 'crear', jugador_id: JUGADORA, email: 'ana.perez@mail.com' })
  assert.deepEqual(validarPedido({ accion: 'desactivar', jugador_id: JUGADORA }), { accion: 'desactivar', jugador_id: JUGADORA })
  assert.deepEqual(validarPedido({ accion: 'reactivar', jugador_id: JUGADORA, email: 'x' }), { accion: 'reactivar', jugador_id: JUGADORA })
})

test('validarPedido: pedido_invalido para mail sin @, uuid mal formado, acción desconocida y cuerpos raros', () => {
  const malo = { error: 'pedido_invalido' }
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA, email: 'ana.mail.com' }), malo)
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA, email: 'ana @mail.com' }), malo)
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA, email: `${'a'.repeat(250)}@b.co` }), malo)
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA }), malo)
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: JUGADORA, email: 42 }), malo)
  assert.deepEqual(validarPedido({ accion: 'crear', jugador_id: '1234-no-uuid', email: 'a@b.co' }), malo)
  assert.deepEqual(validarPedido({ accion: 'desactivar', jugador_id: `${JUGADORA}x` }), malo)
  assert.deepEqual(validarPedido({ accion: 'borrar', jugador_id: JUGADORA }), malo)
  assert.deepEqual(validarPedido({ accion: 'toString', jugador_id: JUGADORA }), malo)
  assert.deepEqual(validarPedido(null), malo)
  assert.deepEqual(validarPedido([]), malo)
  assert.deepEqual(validarPedido('crear'), malo)
})

test('rechaza sin token: 401 sin_sesion y no llama a nada', async () => {
  const c = clientes()
  const r = await leer(await atender(pedido({ accion: 'desactivar', jugador_id: JUGADORA }, { token: null }), c))
  assert.deepEqual(r, { status: 401, cuerpo: { error: 'sin_sesion' } })
  assert.equal(c.llamadas.length, 0)
})

test('rechaza un token inválido: 401 sin_sesion, sin tocar auth.admin', async () => {
  const c = clientes({ usuario: null })
  const r = await leer(await atender(pedido({ accion: 'desactivar', jugador_id: JUGADORA }), c))
  assert.deepEqual(r, { status: 401, cuerpo: { error: 'sin_sesion' } })
  assert.ok(!tocoAdmin(c.llamadas))
})

test('rechaza técnico (y a quien no tiene rol): 403 sin_permiso, sin llamar a auth.admin', async () => {
  for (const rol of ['tecnico', 'preparador_fisico', 'medico', null]) {
    const c = clientes({ rol })
    const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: 'a@b.co' }), c))
    assert.deepEqual(r, { status: 403, cuerpo: { error: 'sin_permiso' } })
    assert.ok(!tocoAdmin(c.llamadas), `rol ${rol} tocó auth.admin`)
    assert.deepEqual(c.llamadas[0], ['getUser', 'tok'])
  }
})

test('pedido_invalido llega como 400 a coordinación (y un JSON roto también)', async () => {
  for (const cuerpo of [{ accion: 'crear', jugador_id: JUGADORA, email: 'sin-arroba' }, { accion: 'crear', jugador_id: 'x', email: 'a@b.co' }, { accion: 'otra', jugador_id: JUGADORA }, '{roto']) {
    const c = clientes()
    const r = await leer(await atender(pedido(cuerpo), c))
    assert.deepEqual(r, { status: 400, cuerpo: { error: 'pedido_invalido' } })
    assert.ok(!tocoAdmin(c.llamadas))
  }
})

test('crear: createUser con mail confirmado y tipo jugadora, después registrar con p_creada_por = coordinación', async () => {
  const c = clientes()
  const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: ' Ana@Mail.com' }), c))
  assert.deepEqual(r, { status: 200, cuerpo: { ok: true } })
  assert.deepEqual(nombres(c.llamadas), ['getUser', 'rpcUsuario:mi_rol', 'createUser', 'rpcAdmin:cuentas_jugadoras_registrar'])
  assert.deepEqual(c.llamadas[2][1], { email: 'ana@mail.com', email_confirm: true, app_metadata: { tipo: 'jugadora' } })
  assert.deepEqual(c.llamadas[3][2], { p_jugador_id: JUGADORA, p_usuario_id: NUEVO, p_email: 'ana@mail.com', p_creada_por: COORD })
})

test('crear: si registrar dice ya_tiene_cuenta, borra el usuario recién creado y responde 409', async () => {
  const c = clientes({ registrar: () => ({ data: null, error: { code: '23505', message: 'ya_tiene_cuenta' } }) })
  const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: 'a@b.co' }), c))
  assert.deepEqual(r, { status: 409, cuerpo: { error: 'ya_tiene_cuenta' } })
  assert.deepEqual(c.llamadas.at(-1), ['deleteUser', NUEVO])
})

test('crear: cada falla de registrar borra el usuario creado y responde con su código, sin detalles internos', async () => {
  const casos = [
    [{ code: '23505', message: 'email_en_uso' }, 409, 'email_en_uso'],
    [{ code: 'P0002', message: 'jugadora_inexistente' }, 404, 'jugadora_inexistente'],
    [{ code: '22023', message: 'usuario_no_coincide' }, 500, 'error_interno'],
    [{ code: 'XX000', message: 'algo raro en la base' }, 500, 'error_interno'],
  ]
  for (const [error, status, codigo] of casos) {
    // También cuando deleteUser falla: mismo código, sin detalles.
    for (const borrar of [undefined, () => ({ data: null, error: { message: 'no se pudo borrar' } }), () => { throw new Error('caída') }]) {
      const c = clientes({ registrar: () => ({ data: null, error }), borrar })
      const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: 'a@b.co' }), c))
      assert.deepEqual(r, { status, cuerpo: { error: codigo } })
      assert.ok(c.llamadas.some((l) => l[0] === 'deleteUser' && l[1] === NUEVO))
    }
  }
})

test('crear: un mail que ya existe en Auth → 409 email_en_uso, sin llamar a registrar', async () => {
  for (const error of [{ code: 'email_exists', message: 'A user with this email address has already been registered', status: 422 },
    { message: 'A user with this email address has already been registered', status: 422 }]) {
    const c = clientes({ crear: () => ({ data: { user: null }, error }) })
    const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: 'a@b.co' }), c))
    assert.deepEqual(r, { status: 409, cuerpo: { error: 'email_en_uso' } })
    assert.ok(!c.llamadas.some((l) => l[1] === 'cuentas_jugadoras_registrar' || l[0] === 'deleteUser'))
  }
})

test('crear: otra falla de createUser → 500 error_interno sin detalles', async () => {
  const c = clientes({ crear: () => ({ data: { user: null }, error: { code: 'unexpected_failure', message: 'Database error creating new user' } }) })
  const r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: 'a@b.co' }), c))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.ok(!c.llamadas.some((l) => l[1] === 'cuentas_jugadoras_registrar'))
})

test('las fallas internas quedan en el log con su etapa, sin el mail ni el token; la respuesta sigue siendo fija', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const MAIL = 'secreta.jugadora@mail.com'
  const texto = (args) => args.map((a) => String(a)).join(' ')

  // createUser falla.
  let c = clientes({ crear: () => ({ data: { user: null }, error: { code: 'unexpected_failure', message: 'Database error creating new user' } }) })
  let r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: MAIL }, { token: 'tok-secreto' }), c))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.equal(registros.length, 1)
  assert.deepEqual(registros[0].slice(0, 2), ['cuentas-jugadoras', 'crear_usuario'])
  assert.equal(registros[0][2], 'unexpected_failure')

  // registrar falla y el borrado de limpieza también.
  c = clientes({ registrar: () => ({ data: null, error: { code: 'XX000', message: 'algo raro' } }), borrar: () => ({ data: null, error: { message: 'no se pudo borrar' } }) })
  r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: MAIL }, { token: 'tok-secreto' }), c))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.deepEqual(registros.slice(1).map((a) => a[1]), ['registrar', 'borrar_usuario'])

  // El ban falla y la reversión también.
  c = clientes({ actualizar: () => ({ data: null, error: { message: 'falló' } }), estado: ({ p_activa }) => (p_activa ? { data: null, error: { code: 'XX000', message: 'no volvió' } } : { data: NUEVO, error: null }) })
  r = await leer(await atender(pedido({ accion: 'desactivar', jugador_id: JUGADORA }), c))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.deepEqual(registros.slice(3).map((a) => a[1]), ['bloquear', 'revertir'])

  // Una excepción inesperada (el cliente explota fuera de seguro()).
  c = clientes()
  c.clienteAdmin.auth =new Proxy(c.clienteAdmin.auth, { get: () => { throw new Error('sin auth') } })
  r = await leer(await atender(pedido({ accion: 'crear', jugador_id: JUGADORA, email: MAIL }, { token: 'tok-secreto' }), c))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.equal(registros.at(-1)[1], 'inesperado')

  for (const args of registros) {
    assert.ok(!texto(args).includes(MAIL), 'el log no puede tener el mail')
    assert.ok(!texto(args).includes('tok-secreto'), 'el log no puede tener el token')
  }
})

test('desactivar: estado(false) y después ban de 876000h al usuario de la cuenta', async () => {
  const c = clientes()
  const r = await leer(await atender(pedido({ accion: 'desactivar', jugador_id: JUGADORA }), c))
  assert.deepEqual(r, { status: 200, cuerpo: { ok: true } })
  assert.deepEqual(c.llamadas.slice(2), [
    ['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: false }],
    ['updateUserById', NUEVO, { ban_duration: '876000h' }],
  ])
})

test('desactivar: si el ban falla, vuelve la fila a activa y responde 500', async () => {
  for (const actualizar of [() => ({ data: null, error: { message: 'falló' } }), () => { throw new Error('caída') }]) {
    const c = clientes({ actualizar })
    const r = await leer(await atender(pedido({ accion: 'desactivar', jugador_id: JUGADORA }), c))
    assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
    assert.deepEqual(c.llamadas.at(-1), ['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: true }])
  }
})

test('desactivar / reactivar sin cuenta → 404 sin_cuenta, sin tocar Auth', async () => {
  for (const accion of ['desactivar', 'reactivar']) {
    const c = clientes({ estado: () => ({ data: null, error: { code: 'P0002', message: 'sin_cuenta' } }) })
    const r = await leer(await atender(pedido({ accion, jugador_id: JUGADORA }), c))
    assert.deepEqual(r, { status: 404, cuerpo: { error: 'sin_cuenta' } })
    assert.ok(!c.llamadas.some((l) => l[0] === 'updateUserById'))
  }
})

test('reactivar: estado(true) y ban_duration none', async () => {
  const c = clientes()
  const r = await leer(await atender(pedido({ accion: 'reactivar', jugador_id: JUGADORA }), c))
  assert.deepEqual(r, { status: 200, cuerpo: { ok: true } })
  assert.deepEqual(c.llamadas.slice(2), [
    ['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: true }],
    ['updateUserById', NUEVO, { ban_duration: 'none' }],
  ])
})

test('reactivar: si el desbloqueo falla, la fila queda activa (nunca se llama estado(false)) y responde 500', async () => {
  for (const actualizar of [() => ({ data: null, error: { message: 'falló' } }), () => { throw new Error('caída') }]) {
    const c = clientes({ actualizar })
    const r = await leer(await atender(pedido({ accion: 'reactivar', jugador_id: JUGADORA }), c))
    assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
    const estados = c.llamadas.filter((l) => l[1] === 'cuentas_jugadoras_estado')
    assert.deepEqual(estados, [['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: true }]])
    assert.deepEqual(c.llamadas.at(-1), ['updateUserById', NUEVO, { ban_duration: 'none' }])
  }
})

test('reactivar una cuenta que ya estaba activa: estado(true) y desbloqueo, responde 200 (idempotente)', async () => {
  // La base no distingue: estado(true) sobre una fila ya activa devuelve el usuario igual, y ban 'none' sin ban no falla.
  const c = clientes({ estado: ({ p_activa }) => ({ data: p_activa ? NUEVO : null, error: null }) })
  for (let vez = 0; vez < 2; vez++) {
    const r = await leer(await atender(pedido({ accion: 'reactivar', jugador_id: JUGADORA }), c))
    assert.deepEqual(r, { status: 200, cuerpo: { ok: true } })
  }
  const auth = c.llamadas.filter((l) => l[0] === 'rpcAdmin' || l[0] === 'updateUserById')
  assert.deepEqual(auth, [
    ['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: true }],
    ['updateUserById', NUEVO, { ban_duration: 'none' }],
    ['rpcAdmin', 'cuentas_jugadoras_estado', { p_jugador_id: JUGADORA, p_activa: true }],
    ['updateUserById', NUEVO, { ban_duration: 'none' }],
  ])
})

test('GET → 405 pedido_invalido, sin llamar a nada', async () => {
  const c = clientes()
  const respuesta = await atender(pedido(null, { metodo: 'GET' }), c)
  assert.deepEqual(await leer(respuesta), { status: 405, cuerpo: { error: 'pedido_invalido' } })
  assert.equal(c.llamadas.length, 0)
})

test('OPTIONS (preflight) responde con los encabezados CORS', async () => {
  const c = clientes()
  const respuesta = await atender(pedido(null, { metodo: 'OPTIONS', token: null }), c)
  assert.ok(respuesta.status === 200 || respuesta.status === 204)
  assert.equal(respuesta.headers.get('access-control-allow-origin'), '*')
  assert.equal(respuesta.headers.get('access-control-allow-headers'), 'authorization, x-client-info, apikey, content-type')
  assert.equal(respuesta.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
  assert.equal(c.llamadas.length, 0)
  // Las respuestas JSON también llevan CORS, para que el navegador pueda leer el error.
  const error = await atender(pedido({}, { token: null }), c)
  assert.equal(error.headers.get('access-control-allow-origin'), '*')
})

test('el archivo sirve pegado como index.ts: sin imports arriba, sin sintaxis TS y la clave solo desde Deno.env', () => {
  const fuente = readFileSync('supabase/functions/cuentas-jugadoras/index.js', 'utf8')
  assert.ok(!/^\s*import\s/m.test(fuente), 'no puede tener import estático')
  assert.ok(fuente.includes("import('jsr:@supabase/supabase-js@2')"))
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fuente), 'no puede tener un JWT pegado')
  assert.ok(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(fuente))
})

test('src/ y dist/ no tienen SERVICE_ROLE ni claves de Resend (re_...)', () => {
  const hallazgos = []
  const recorrer = (dir) => {
    if (!existsSync(dir)) return
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) { recorrer(ruta); continue }
      if (!/\.(js|jsx|mjs|ts|tsx|html|css|json|map|txt)$/.test(nombre)) continue
      const texto = readFileSync(ruta, 'utf8')
      if (texto.includes('SERVICE_ROLE')) hallazgos.push(`${ruta}: SERVICE_ROLE`)
      // Las claves de Resend son re_ seguido de unos 30 caracteres; \b evita falsos positivos como "are_".
      if (/\bre_[A-Za-z0-9_]{20,}/.test(texto)) hallazgos.push(`${ruta}: re_`)
    }
  }
  recorrer('src')
  recorrer('dist')
  assert.deepEqual(hallazgos, [])
})
