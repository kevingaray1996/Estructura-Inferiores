// Avisos, Tarea 2: la Edge Function avisos-enviar con la base y el envío simulados (sin red ni Supabase).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { atender, procesar, clasificarError, crearEnviar, crearPreparar, secretoValido, topicDe } from '../supabase/functions/avisos-enviar/index.js'

const ENVIO = '11111111-2222-4333-8444-555555555555'
const ENVIO2 = '22222222-3333-4444-8555-666666666666'
const SUS1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const SUS2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const SUS3 = 'aaaaaaaa-0000-4000-8000-000000000003'
const SECRETO = 'secreto-de-la-tarea-programada-123'

function destino(suscripcion_id, n, extra = {}) {
  return {
    suscripcion_id, jugador_id: `jjjjjjjj-0000-4000-8000-00000000000${n}`,
    endpoint: `https://push.ejemplo.com/endpoint-privado-${n}`, p256dh: `clave-p256dh-${n}`, auth: `clave-auth-${n}`,
    titulo: 'Título privado', cuerpo: 'Cuerpo privado del aviso', url: '/jugadora/?seccion=wellness',
    tag: 'wellness-2026-11-17', ttl: 10800, ...extra,
  }
}

// Cliente admin simulado: tandas = lo que devuelve cada llamada a avisos_tomar_pendientes (después, []).
function base({ tandas = [], destinos = {}, sinAvisos = 0, errores = {} } = {}) {
  const llamadas = []
  let tanda = 0
  const admin = {
    rpc: async (nombre, args) => {
      llamadas.push([nombre, args])
      if (errores[nombre]) return errores[nombre](args)
      if (nombre === 'avisos_tomar_pendientes') return { data: tandas[tanda++] ?? [], error: null }
      if (nombre === 'avisos_destinos') return { data: destinos[args.p_envio_id] ?? [], error: null }
      if (nombre === 'avisos_contar_sin_avisos') return { data: sinAvisos, error: null }
      if (nombre === 'avisos_cerrar_envio') return { data: null, error: null }
      return { data: null, error: { code: '42883', message: 'no existe' } }
    },
  }
  return { admin, llamadas }
}

const pendiente = (id, tipo = 'wellness') => ({ id, tipo, categoria_id: 'cccccccc-0000-4000-8000-000000000000', fecha: '2026-11-17' })
const cierres = (llamadas) => llamadas.filter((l) => l[0] === 'avisos_cerrar_envio').map((l) => l[1])
const texto = (args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')

function pedido({ metodo = 'POST', secreto = SECRETO } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (secreto !== null) headers['x-avisos-secreto'] = secreto
  return new Request('https://x.supabase.co/functions/v1/avisos-enviar', {
    method: metodo, headers, body: metodo === 'POST' ? '{}' : undefined,
  })
}

async function leer(respuesta) {
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

test('procesar: 3 jugadoras con un celular cada una (ok, vencida, falla) cierra con (1, 1, 1), p_ok=[id1] y p_vencidas=[id2]', async () => {
  // La jugadora con el único celular vencido pasa a sin_avisos (contar da 0, el cierre lleva 1).
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1), destino(SUS2, 2), destino(SUS3, 3)] }, sinAvisos: 0 })
  const resultado = { 'clave-auth-1': 'ok', 'clave-auth-2': 'vencida', 'clave-auth-3': 'falla' }
  const enviados = []
  const enviar = async (d, payload, opciones) => { enviados.push([d, payload, opciones]); return resultado[d.auth] }
  const total = await procesar({ admin: b.admin, enviar })
  assert.deepEqual(total, { envios: 1, entregados: 1, fallidos: 1 })
  assert.deepEqual(b.llamadas.map((l) => l[0]), ['avisos_tomar_pendientes', 'avisos_destinos', 'avisos_contar_sin_avisos',
    'avisos_cerrar_envio', 'avisos_tomar_pendientes'])
  assert.deepEqual(b.llamadas[0][1], { p_max: 10 })
  assert.deepEqual(b.llamadas[1][1], { p_envio_id: ENVIO })
  assert.deepEqual(b.llamadas[2][1], { p_envio_id: ENVIO })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 1, p_fallidos: 1, p_sin_avisos: 1, p_ok: [SUS1], p_vencidas: [SUS2] }])
  // Al celular le llega el JSON {titulo, cuerpo, url, tag}; las opciones son ttl, topic y urgency normal.
  assert.equal(enviados.length, 3)
  assert.deepEqual(enviados[0][0], { endpoint: 'https://push.ejemplo.com/endpoint-privado-1', p256dh: 'clave-p256dh-1', auth: 'clave-auth-1' })
  assert.deepEqual(enviados[0][1], { titulo: 'Título privado', cuerpo: 'Cuerpo privado del aviso', url: '/jugadora/?seccion=wellness', tag: 'wellness-2026-11-17' })
  assert.deepEqual(enviados[0][2], { ttl: 10800, topic: 'wellness-2026-11-17', urgency: 'normal' })
})

test('procesar: sin destinos cierra con sin_avisos y entregados = 0, sin llamar a enviar', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)]], sinAvisos: 4 })
  let llamadasEnviar = 0
  const total = await procesar({ admin: b.admin, enviar: async () => { llamadasEnviar++; return 'ok' } })
  assert.equal(llamadasEnviar, 0)
  assert.deepEqual(total, { envios: 1, entregados: 0, fallidos: 0 })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 0, p_fallidos: 0, p_sin_avisos: 4, p_ok: [], p_vencidas: [] }])
})

test('procesar: si enviar tira una excepción (o devuelve algo raro) cuenta como falla y sigue con los demás', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1), destino(SUS2, 2), destino(SUS3, 3)] } })
  const enviar = async (d) => {
    if (d.auth === 'clave-auth-1') throw new Error('se cayó la red')
    if (d.auth === 'clave-auth-2') return 'cualquier-cosa'
    return 'ok'
  }
  const total = await procesar({ admin: b.admin, enviar })
  assert.deepEqual(total, { envios: 1, entregados: 1, fallidos: 2 })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 1, p_fallidos: 2, p_sin_avisos: 0, p_ok: [SUS3], p_vencidas: [] }])
})

test('procesar: manda a lo sumo 10 a la vez y espera a todos antes de cerrar', async () => {
  const lista = Array.from({ length: 25 }, (_, i) => destino(`aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`, i))
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: lista } })
  let enVuelo = 0
  let maximo = 0
  const enviar = async () => {
    enVuelo++
    maximo = Math.max(maximo, enVuelo)
    await new Promise((r) => setTimeout(r, 2))
    enVuelo--
    return 'ok'
  }
  const total = await procesar({ admin: b.admin, enviar })
  assert.equal(maximo, 10)
  assert.deepEqual(total, { envios: 1, entregados: 25, fallidos: 0 })
  assert.equal(cierres(b.llamadas)[0].p_ok.length, 25)
})

test('procesar: sigue tomando tandas hasta que una vuelve vacía, con un tope de 5', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)], [pendiente(ENVIO2)]] })
  let total = await procesar({ admin: b.admin, enviar: async () => 'ok', max: 3 })
  assert.equal(total.envios, 2)
  assert.equal(b.llamadas.filter((l) => l[0] === 'avisos_tomar_pendientes').length, 3)
  assert.ok(b.llamadas.filter((l) => l[0] === 'avisos_tomar_pendientes').every((l) => l[1].p_max === 3))

  // Una base que nunca se vacía: corta a las 5 tandas.
  const siempre = base({ errores: { avisos_tomar_pendientes: () => ({ data: [pendiente(ENVIO)], error: null }) } })
  total = await procesar({ admin: siempre.admin, enviar: async () => 'ok' })
  assert.equal(total.envios, 5)
  assert.equal(siempre.llamadas.filter((l) => l[0] === 'avisos_tomar_pendientes').length, 5)
})

test('procesar: si falla tomar, lo registra y no hace nada más', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const b = base({ errores: { avisos_tomar_pendientes: () => ({ data: null, error: { code: 'XX000', message: 'base caída' } }) } })
  const total = await procesar({ admin: b.admin, enviar: async () => 'ok' })
  assert.deepEqual(total, { envios: 0, entregados: 0, fallidos: 0 })
  assert.equal(b.llamadas.length, 1)
  assert.deepEqual(registros, [['avisos-enviar', 'tomar', 'XX000', 'base caída']])
})

test('procesar: si fallan destinos o sin_avisos, lo registra y cierra el envío en cero sin mandar nada', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  for (const [rpc, etapa] of [['avisos_destinos', 'destinos'], ['avisos_contar_sin_avisos', 'sin_avisos']]) {
    registros.length = 0
    const b = base({
      tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1)] },
      errores: { [rpc]: () => { throw new Error('se cortó') } },
    })
    let llamadasEnviar = 0
    const total = await procesar({ admin: b.admin, enviar: async () => { llamadasEnviar++; return 'ok' } })
    assert.equal(llamadasEnviar, 0)
    assert.deepEqual(total, { envios: 1, entregados: 0, fallidos: 0 })
    assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 0, p_fallidos: 0, p_sin_avisos: 0, p_ok: [], p_vencidas: [] }])
    assert.deepEqual(registros.map((r) => r[1]), [etapa])
  }
})

test('procesar: si cerrar falla lo registra y sigue con el próximo envío (lo retoma la base a los 10 minutos)', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const b = base({
    tandas: [[pendiente(ENVIO), pendiente(ENVIO2)]],
    destinos: { [ENVIO]: [destino(SUS1, 1)], [ENVIO2]: [destino(SUS2, 2)] },
    errores: { avisos_cerrar_envio: (args) => (args.p_envio_id === ENVIO ? { data: null, error: { code: 'P0002', message: 'envio_inexistente' } } : { data: null, error: null }) },
  })
  const total = await procesar({ admin: b.admin, enviar: async () => 'ok' })
  assert.deepEqual(total, { envios: 2, entregados: 2, fallidos: 0 })
  assert.equal(cierres(b.llamadas).length, 2)
  assert.deepEqual(registros, [['avisos-enviar', 'cerrar', 'P0002', 'envio_inexistente']])
})

test('ningún console.error incluye el endpoint, las claves del celular, el título, el texto ni el secreto', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const d = destino(SUS1, 1)
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [d, destino(SUS2, 2)] } })
  // enviar falla con un error que trae el endpoint y el texto adentro (como podría hacerlo la biblioteca).
  const enviar = async (x, payload) => { throw new Error(`falló ${x.endpoint} ${x.auth} ${payload.titulo} ${payload.cuerpo}`) }
  await procesar({ admin: b.admin, enviar })
  await atender(pedido({ secreto: 'otro-secreto' }), { secreto: SECRETO, admin: b.admin, enviar })
  await atender(pedido(), { secreto: SECRETO, preparar: async () => { throw new Error(`clave rota ${SECRETO}`) } })
  assert.ok(registros.length > 0)
  assert.ok(registros.some((r) => r[1] === 'enviar'), 'deja un resumen de las fallas de envío')
  for (const args of registros) {
    const t = texto(args)
    for (const prohibido of [d.endpoint, 'push.ejemplo.com', d.p256dh, d.auth, d.titulo, d.cuerpo, SECRETO, 'otro-secreto']) {
      assert.ok(!t.includes(prohibido), `el log no puede tener ${prohibido}`)
    }
  }
})

test('topicDe: solo [A-Za-z0-9_-] y hasta 32 caracteres; sin nada válido no hay topic', () => {
  assert.equal(topicDe('wellness-2026-11-17'), 'wellness-2026-11-17')
  assert.equal(topicDe(`manual-${ENVIO}`), `manual-${ENVIO}`.slice(0, 32))
  assert.equal(topicDe(`manual-${ENVIO}`).length, 32)
  assert.equal(topicDe('rpe:2026 11/17'), 'rpe20261117')
  assert.equal(topicDe('ñ!'), undefined)
  assert.equal(topicDe(null), undefined)
})

test('clasificarError: 404 y 410 (o isGone) son vencida; cualquier otra cosa es falla', () => {
  assert.equal(clasificarError({ isGone: () => true, response: { status: 500 } }), 'vencida')
  assert.equal(clasificarError({ response: { status: 410 } }), 'vencida')
  assert.equal(clasificarError({ response: { status: 404 } }), 'vencida')
  assert.equal(clasificarError({ isGone: () => false, response: { status: 410 } }), 'vencida')
  assert.equal(clasificarError({ isGone: () => false, response: { status: 429 } }), 'falla')
  assert.equal(clasificarError({ response: { status: 500 } }), 'falla')
  assert.equal(clasificarError(new Error('timeout')), 'falla')
  assert.equal(clasificarError({ isGone: () => { throw new Error('x') } }), 'falla')
  assert.equal(clasificarError(null), 'falla')
  assert.equal(clasificarError('texto'), 'falla')
})

test('secretoValido: compara en tiempo constante; distinto largo, ausente o vacío es falso', () => {
  assert.equal(secretoValido(SECRETO, SECRETO), true)
  assert.equal(secretoValido(`${SECRETO}x`, SECRETO), false)
  assert.equal(secretoValido(SECRETO.slice(0, -1), SECRETO), false)
  assert.equal(secretoValido(SECRETO.replace('1', '2'), SECRETO), false)
  assert.equal(secretoValido(null, SECRETO), false)
  assert.equal(secretoValido('', ''), false)
  assert.equal(secretoValido('algo', undefined), false)
  assert.equal(secretoValido(undefined, undefined), false)
})

test('atender: un secreto incorrecto o ausente da 401 sin tocar la base ni preparar nada', async () => {
  for (const secreto of [null, '', 'otro-secreto', `${SECRETO}x`, SECRETO.slice(1), SECRETO.toUpperCase()]) {
    const b = base({ tandas: [[pendiente(ENVIO)]] })
    let preparado = false
    const r = await leer(await atender(pedido({ secreto }), { secreto: SECRETO, preparar: async () => { preparado = true; return { admin: b.admin, enviar: async () => 'ok' } } }))
    assert.deepEqual(r, { status: 401, cuerpo: { error: 'sin_permiso' } })
    assert.equal(b.llamadas.length, 0)
    assert.equal(preparado, false)
  }
  // Si la función no tiene AVISOS_SECRETO, nadie pasa (ni con el encabezado vacío).
  const b = base()
  for (const secreto of [null, '']) {
    const r = await leer(await atender(pedido({ secreto }), { secreto: undefined, admin: b.admin, enviar: async () => 'ok' }))
    assert.equal(r.status, 401)
  }
  assert.equal(b.llamadas.length, 0)
})

test('atender: GET da 405 y OPTIONS responde CORS, sin tocar la base', async () => {
  const b = base()
  const deps = { secreto: SECRETO, admin: b.admin, enviar: async () => 'ok' }
  const get = await atender(pedido({ metodo: 'GET' }), deps)
  assert.deepEqual(await leer(get), { status: 405, cuerpo: { error: 'metodo_no_permitido' } })
  const opciones = await atender(pedido({ metodo: 'OPTIONS', secreto: null }), deps)
  assert.equal(opciones.status, 200)
  assert.equal(opciones.headers.get('access-control-allow-origin'), '*')
  assert.equal(opciones.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
  assert.equal(b.llamadas.length, 0)
})

test('atender: con el secreto correcto procesa y responde 200 {ok, envios, entregados, fallidos}', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1), destino(SUS2, 2)] } })
  const enviar = async (d) => (d.auth === 'clave-auth-1' ? 'ok' : 'falla')
  const r = await leer(await atender(pedido(), { secreto: SECRETO, preparar: async () => ({ admin: b.admin, enviar }) }))
  assert.deepEqual(r, { status: 200, cuerpo: { ok: true, envios: 1, entregados: 1, fallidos: 1 } })
})

test('atender: si preparar falla (biblioteca o claves VAPID) registra configuracion y responde 500 fijo', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const r = await leer(await atender(pedido(), { secreto: SECRETO, preparar: async () => { throw new Error('no se pudo importar la clave') } }))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.deepEqual(registros.map((x) => x[1]), ['configuracion'])
})

test('atender: una excepción inesperada da 500 error_interno y queda como inesperado', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  const admin = new Proxy({}, { get: () => { throw new Error('sin cliente') } })
  const r = await leer(await atender(pedido(), { secreto: SECRETO, admin, enviar: async () => 'ok' }))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.equal(registros.at(-1)[1], 'inesperado')
})

// Biblioteca simulada con la forma de jsr:@negrel/webpush.
function webpushFalso({ falla } = {}) {
  const llamadas = []
  const webpush = {
    importVapidKeys: async (claves) => { llamadas.push(['importVapidKeys', claves]); return { importadas: true } },
    ApplicationServer: {
      new: async (opciones) => {
        llamadas.push(['ApplicationServer.new', opciones])
        return {
          subscribe: (suscripcion) => {
            llamadas.push(['subscribe', suscripcion])
            return {
              pushTextMessage: async (textoMensaje, opcionesMensaje) => {
                llamadas.push(['pushTextMessage', textoMensaje, opcionesMensaje])
                if (falla) throw falla
              },
            }
          },
        }
      },
    },
  }
  return { webpush, llamadas }
}

test('crearEnviar: importa las claves, arma el ApplicationServer una vez y manda el JSON con ttl, topic y urgency', async () => {
  const claves = { publicKey: { kty: 'EC', crv: 'P-256', x: 'X', y: 'Y' }, privateKey: { kty: 'EC', crv: 'P-256', x: 'X', y: 'Y', d: 'D' } }
  const w = webpushFalso()
  const enviar = await crearEnviar(w.webpush, JSON.stringify(claves), 'mailto:club@ejemplo.com')
  const payload = { titulo: 'T', cuerpo: 'C', url: '/u', tag: 'g' }
  const opciones = { ttl: 60, topic: 'g', urgency: 'normal' }
  assert.equal(await enviar({ endpoint: 'https://e', p256dh: 'P', auth: 'A' }, payload, opciones), 'ok')
  assert.equal(await enviar({ endpoint: 'https://f', p256dh: 'P2', auth: 'A2' }, payload, opciones), 'ok')
  assert.deepEqual(w.llamadas.slice(0, 5), [
    ['importVapidKeys', claves],
    ['ApplicationServer.new', { contactInformation: 'mailto:club@ejemplo.com', vapidKeys: { importadas: true } }],
    ['subscribe', { endpoint: 'https://e', keys: { p256dh: 'P', auth: 'A' } }],
    ['pushTextMessage', JSON.stringify(payload), opciones],
    ['subscribe', { endpoint: 'https://f', keys: { p256dh: 'P2', auth: 'A2' } }],
  ])
  assert.equal(w.llamadas.filter((l) => l[0] === 'ApplicationServer.new').length, 1)
})

test('crearEnviar: 410 es vencida, otro error es falla; un JSON roto de claves falla sin mostrar la clave', async () => {
  const claves = JSON.stringify({ publicKey: {}, privateKey: {} })
  const vencida = webpushFalso({ falla: { isGone: () => true, response: { status: 410 } } })
  assert.equal(await (await crearEnviar(vencida.webpush, claves, 'mailto:a@b.co'))({ endpoint: 'e', p256dh: 'p', auth: 'a' }, {}, {}), 'vencida')
  const otra = webpushFalso({ falla: new Error('500') })
  assert.equal(await (await crearEnviar(otra.webpush, claves, 'mailto:a@b.co'))({ endpoint: 'e', p256dh: 'p', auth: 'a' }, {}, {}), 'falla')
  await assert.rejects(crearEnviar(webpushFalso().webpush, '{"privateKey": "CLAVE-SUPER-PRIVADA"', 'mailto:a@b.co'), (e) => {
    assert.ok(!String(e.message).includes('CLAVE-SUPER-PRIVADA'))
    return true
  })
})

test('el archivo sirve pegado como index.ts: sin imports arriba, bibliotecas dinámicas y claves solo desde Deno.env', () => {
  const fuente = readFileSync('supabase/functions/avisos-enviar/index.js', 'utf8')
  assert.ok(fuente.startsWith('// @ts-nocheck'))
  assert.ok(!/^\s*import\s/m.test(fuente), 'no puede tener import estático')
  assert.ok(fuente.includes("import('jsr:@supabase/supabase-js@2')"))
  assert.ok(fuente.includes("import('jsr:@negrel/webpush@0.5.0')"))
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fuente), 'no puede tener un JWT pegado')
  assert.ok(!/"d"\s*:\s*"/.test(fuente), 'no puede tener una clave privada JWK pegada')
  for (const nombre of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AVISOS_SECRETO', 'AVISOS_VAPID_KEYS', 'AVISOS_VAPID_SUBJECT']) {
    assert.ok(fuente.includes(`Deno.env.get('${nombre}')`) || fuente.includes(`'${nombre}'`), `lee ${nombre}`)
  }
  assert.ok(/if \(globalThis\.Deno\) \{\s*Deno\.serve\(/.test(fuente), 'Deno.serve solo dentro de globalThis.Deno')
})

// --- Ronda de arreglos 1: conteo por jugadora, tiempos y autenticación antes de los demás secretos. ---

const JUG = 'jjjjjjjj-0000-4000-8000-000000000009'

test('por jugadora: 2 celulares de la misma jugadora, ok + falla, cuenta (1, 0)', async () => {
  const filas = [destino(SUS1, 1, { jugador_id: JUG }), destino(SUS2, 2, { jugador_id: JUG })]
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: filas }, sinAvisos: 2 })
  const total = await procesar({ admin: b.admin, enviar: async (d) => (d.auth === 'clave-auth-1' ? 'ok' : 'falla') })
  assert.deepEqual(total, { envios: 1, entregados: 1, fallidos: 0 })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 1, p_fallidos: 0, p_sin_avisos: 2, p_ok: [SUS1], p_vencidas: [] }])
})

test('por jugadora: 2 celulares de la misma jugadora, los dos fallan, cuenta (0, 1)', async () => {
  const filas = [destino(SUS1, 1, { jugador_id: JUG }), destino(SUS2, 2, { jugador_id: JUG })]
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: filas } })
  const total = await procesar({ admin: b.admin, enviar: async () => 'falla' })
  assert.deepEqual(total, { envios: 1, entregados: 0, fallidos: 1 })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 0, p_fallidos: 1, p_sin_avisos: 0, p_ok: [], p_vencidas: [] }])
})

test('por jugadora: con su único celular vencido no es entregada ni fallida, suma a sin_avisos y se borra la suscripción', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1, { jugador_id: JUG })] }, sinAvisos: 3 })
  const total = await procesar({ admin: b.admin, enviar: async () => 'vencida' })
  assert.deepEqual(total, { envios: 1, entregados: 0, fallidos: 0 })
  assert.deepEqual(cierres(b.llamadas), [{ p_envio_id: ENVIO, p_entregados: 0, p_fallidos: 0, p_sin_avisos: 4, p_ok: [], p_vencidas: [SUS1] }])
})

test('tiempos: un envío que nunca contesta cuenta como falla al vencer el timeout', async () => {
  const b = base({ tandas: [[pendiente(ENVIO)]], destinos: { [ENVIO]: [destino(SUS1, 1), destino(SUS2, 2)] } })
  const enviar = (d) => (d.auth === 'clave-auth-1' ? new Promise(() => {}) : Promise.resolve('ok'))
  const total = await procesar({ admin: b.admin, enviar, timeoutMs: 20 })
  assert.deepEqual(total, { envios: 1, entregados: 1, fallidos: 1 })
  assert.deepEqual(cierres(b.llamadas)[0].p_ok, [SUS2])
})

test('tiempos: con el presupuesto agotado no toma otra tanda (tomar se llama una sola vez)', async () => {
  const b = base({ errores: { avisos_tomar_pendientes: () => ({ data: [pendiente(ENVIO)], error: null }) } })
  let reloj = 0
  const ahora = () => { const t = reloj; reloj += 61000; return t }
  const total = await procesar({ admin: b.admin, enviar: async () => 'ok', ahora })
  assert.equal(total.envios, 1)
  assert.equal(b.llamadas.filter((l) => l[0] === 'avisos_tomar_pendientes').length, 1)
  // Con tiempo de sobra sigue hasta el tope de 5.
  const b2 = base({ errores: { avisos_tomar_pendientes: () => ({ data: [pendiente(ENVIO)], error: null }) } })
  await procesar({ admin: b2.admin, enviar: async () => 'ok', ahora: () => 0 })
  assert.equal(b2.llamadas.filter((l) => l[0] === 'avisos_tomar_pendientes').length, 5)
})

test('Deno: sin el secreto correcto es 401 aunque falten los demás secretos; con él, 500 con los nombres que faltan', async (t) => {
  const registros = []
  t.mock.method(console, 'error', (...args) => { registros.push(args) })
  let cargadas = 0
  const cargar = async () => { cargadas++; return {} }
  const entorno = { AVISOS_SECRETO: SECRETO, SUPABASE_SERVICE_ROLE_KEY: 'clave-service-role', AVISOS_VAPID_SUBJECT: 'mailto:a@b.co' }
  const preparar = crearPreparar((n) => entorno[n], cargar)
  for (const secreto of [null, 'otro-secreto']) {
    const r = await leer(await atender(pedido({ secreto }), { secreto: entorno.AVISOS_SECRETO, preparar }))
    assert.deepEqual(r, { status: 401, cuerpo: { error: 'sin_permiso' } })
  }
  // Sin AVISOS_SECRETO: 401 para todos, nunca 500.
  const r401 = await leer(await atender(pedido(), { secreto: undefined, preparar }))
  assert.equal(r401.status, 401)
  assert.equal(registros.length, 0)
  assert.equal(cargadas, 0)

  const r = await leer(await atender(pedido(), { secreto: entorno.AVISOS_SECRETO, preparar }))
  assert.deepEqual(r, { status: 500, cuerpo: { error: 'error_interno' } })
  assert.deepEqual(registros, [['avisos-enviar', 'configuracion', undefined, 'faltan secretos: SUPABASE_URL, AVISOS_VAPID_KEYS']])
  assert.equal(cargadas, 0)
})

test('crearPreparar: con todo cargado arma el cliente admin sin sesión y el envío con las claves VAPID', async () => {
  const claves = { publicKey: { kty: 'EC' }, privateKey: { kty: 'EC' } }
  const entorno = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'clave-sr', AVISOS_VAPID_KEYS: JSON.stringify(claves), AVISOS_VAPID_SUBJECT: 'mailto:a@b.co' }
  const w = webpushFalso()
  const creados = []
  const createClient = (...args) => { creados.push(args); return { rpc: async () => ({ data: [], error: null }) } }
  const { admin, enviar } = await crearPreparar((n) => entorno[n], async () => ({ createClient, webpush: w.webpush }))()
  assert.deepEqual(creados, [['https://x.supabase.co', 'clave-sr', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }]])
  assert.equal(typeof admin.rpc, 'function')
  assert.equal(typeof enviar, 'function')
  assert.deepEqual(w.llamadas[0], ['importVapidKeys', claves])
})
