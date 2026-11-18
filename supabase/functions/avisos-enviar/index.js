// @ts-nocheck
/* global Deno */
// Edge Function avisos-enviar: manda los avisos (Web Push) que la base dejó pendientes y anota el resultado.
//
// Se sube pegando este archivo en el editor de Supabase (Edge Functions → Deploy a new function → Via Editor), que
// lo guarda como index.ts. Por eso es JS plano válido también como TS (@ts-nocheck), sin imports arriba de todo y sin
// APIs de Node: el test de Node importa procesar, atender y las funciones puras con la base y el envío simulados.
//
// Quién la llama: la tarea de pg_cron (cada minuto, solo si hay algo pendiente) por pg_net, con el encabezado
// x-avisos-secreto. «Verify JWT» está apagado: ese secreto es la única puerta, y se compara en tiempo constante
// antes de cargar bibliotecas, claves o tocar la base.
//
// Secretos (solo desde Deno.env, acá abajo): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AVISOS_SECRETO,
// AVISOS_VAPID_KEYS (JSON {publicKey, privateKey} en JWK, ECDSA P-256) y AVISOS_VAPID_SUBJECT (mailto:…).
//
// Pedido: POST (el cuerpo no se usa). Respuesta: 200 {ok:true, envios, entregados, fallidos} o {error:<código>}
// (sin_permiso, metodo_no_permitido, error_interno). Nunca devuelve detalles internos.
//
// Logs: solo la etapa, el código y el mensaje. Nunca el endpoint, las claves del celular, el título, el texto, las
// claves VAPID ni el secreto. De los envíos fallidos solo se registra la cuenta.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_TANDAS = 5 // tope de seguridad de tandas por llamada
const CONCURRENCIA = 10 // envíos a la vez
const TTL_POR_DEFECTO = 3600
const VENCIDA = new Set([404, 410])

function responder(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const errorInterno = () => responder(500, { error: 'error_interno' })

// Deja rastro en los logs de la función: solo la etapa y el código/mensaje del error.
function registrarFalla(etapa, error) {
  console.error('avisos-enviar', etapa, error?.code, error?.message)
}

// Error de configuración con un mensaje armado acá (sin claves ni el contenido de los secretos). atender solo
// registra el mensaje de los errores marcados así; de cualquier otro, solo el nombre.
function errorDeConfiguracion(texto, causa) {
  const e = new Error(causa?.name ? `${texto} (${causa.name})` : texto)
  e.configuracion = true
  return e
}

// Pasa una llamada a la base a {data, error} aunque el cliente tire una excepción.
async function seguro(promesa) {
  try {
    const r = await promesa
    return { data: r?.data ?? null, error: r?.error ?? null }
  } catch (e) {
    return { data: null, error: { message: String(e?.message ?? e) } }
  }
}

// Compara el secreto recibido con el esperado en tiempo constante (XOR acumulado sobre los bytes). Un largo
// distinto falla igual, sin cortar antes. Sin secreto esperado no pasa nadie.
export function secretoValido(recibido, esperado) {
  if (typeof esperado !== 'string' || esperado === '') return false
  const codificador = new TextEncoder()
  const a = codificador.encode(typeof recibido === 'string' ? recibido : '')
  const b = codificador.encode(esperado)
  const largo = Math.max(a.length, b.length)
  let diferencia = a.length ^ b.length
  for (let i = 0; i < largo; i++) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diferencia === 0
}

// El topic de Web Push: solo caracteres base64url y hasta 32. Un aviso nuevo con el mismo topic reemplaza al que
// todavía no se entregó. Sin ningún caracter válido no se manda topic.
export function topicDe(tag) {
  const limpio = String(tag ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  return limpio || undefined
}

// Qué hacer con un error del envío: 404/410 es una suscripción vencida (se borra); cualquier otra cosa es falla.
export function clasificarError(error) {
  try {
    if (typeof error?.isGone === 'function' && error.isGone()) return 'vencida'
  } catch {
    return 'falla'
  }
  return VENCIDA.has(error?.response?.status) ? 'vencida' : 'falla'
}

// Arma el enviar real con jsr:@negrel/webpush: importa las claves VAPID y crea el ApplicationServer una vez.
// enviar(destino, payload, opciones) → 'ok' | 'vencida' | 'falla'.
export async function crearEnviar(webpush, clavesJson, contacto) {
  let claves
  try {
    claves = JSON.parse(clavesJson)
  } catch {
    // El mensaje de JSON.parse puede citar un pedazo del texto (la clave): se tira uno propio.
    throw errorDeConfiguracion('AVISOS_VAPID_KEYS no es JSON válido')
  }
  let servidor
  try {
    const vapidKeys = await webpush.importVapidKeys(claves)
    servidor = await webpush.ApplicationServer.new({ contactInformation: contacto, vapidKeys })
  } catch (e) {
    throw errorDeConfiguracion('no se pudieron importar las claves VAPID', e)
  }
  return async (destino, payload, opciones) => {
    try {
      const suscriptor = servidor.subscribe({ endpoint: destino.endpoint, keys: { p256dh: destino.p256dh, auth: destino.auth } })
      await suscriptor.pushTextMessage(JSON.stringify(payload), opciones)
      return 'ok'
    } catch (e) {
      return clasificarError(e)
    }
  }
}

// Un envío a un celular, con un tope de timeoutMs: si la biblioteca no contesta a tiempo cuenta como falla. El
// temporizador se limpia siempre, así no queda nada colgado.
async function enviarUno(enviar, fila, timeoutMs) {
  const destino = { endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth }
  const payload = { titulo: fila.titulo, cuerpo: fila.cuerpo, url: fila.url, tag: fila.tag }
  const ttl = Number.isInteger(fila.ttl) && fila.ttl > 0 ? fila.ttl : TTL_POR_DEFECTO
  let temporizador
  const vencido = new Promise((resolver) => { temporizador = setTimeout(() => resolver('falla'), timeoutMs) })
  try {
    const envio = Promise.resolve().then(() => enviar(destino, payload, { ttl, topic: topicDe(fila.tag), urgency: 'normal' }))
    const resultado = await Promise.race([envio, vencido])
    return resultado === 'ok' || resultado === 'vencida' ? resultado : 'falla'
  } catch {
    // El error puede traer el endpoint o el texto: no se registra uno por uno.
    return 'falla'
  } finally {
    clearTimeout(temporizador)
  }
}

// Manda a todas las filas con a lo sumo CONCURRENCIA envíos a la vez. Devuelve el resultado de cada una en orden.
async function enviarTodos(enviar, filas, timeoutMs) {
  const resultados = new Array(filas.length)
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < filas.length) {
      const i = siguiente++
      resultados[i] = await enviarUno(enviar, filas[i], timeoutMs)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, filas.length) }, trabajador))
  return resultados
}

async function cerrar(admin, id, entregados, fallidos, sinAvisos, ok, vencidas) {
  const r = await seguro(admin.rpc('avisos_cerrar_envio', {
    p_envio_id: id, p_entregados: entregados, p_fallidos: fallidos, p_sin_avisos: sinAvisos, p_ok: ok, p_vencidas: vencidas,
  }))
  if (r.error) registrarFalla('cerrar', r.error)
}

// Cuenta por jugadora (así el historial lee entregados/destinatarias): entregada si algún celular dio ok; fallida
// si ninguno dio ok y alguno falló; si todos sus celulares estaban vencidos (se borran), pasa a «sin avisos».
// p_ok y p_vencidas siguen siendo por suscripción.
function contarPorJugadora(filas, resultados) {
  const porJugadora = new Map()
  const ok = []
  const vencidas = []
  resultados.forEach((resultado, i) => {
    const fila = filas[i]
    if (resultado === 'ok') ok.push(fila.suscripcion_id)
    else if (resultado === 'vencida') vencidas.push(fila.suscripcion_id)
    const estado = porJugadora.get(fila.jugador_id) ?? { ok: false, falla: false }
    if (resultado === 'ok') estado.ok = true
    else if (resultado === 'falla') estado.falla = true
    porJugadora.set(fila.jugador_id, estado)
  })
  let entregados = 0
  let fallidos = 0
  let todasVencidas = 0
  for (const estado of porJugadora.values()) {
    if (estado.ok) entregados++
    else if (estado.falla) fallidos++
    else todasVencidas++
  }
  return { entregados, fallidos, todasVencidas, ok, vencidas }
}

// Un envío: destinos, sin_avisos, mandar y cerrar.
// Si fallan destinos o sin_avisos todavía no se mandó nada: se registra y se cierra en cero (queda en el historial
// como enviado sin entregas, y no se reintenta solo cada 10 minutos para siempre). Si falla el cierre después de
// mandar, se registra y el envío queda «enviando»: la base lo vuelve a tomar a los 10 minutos (el tag reemplaza el
// aviso repetido en el celular).
async function procesarEnvio(admin, enviar, envio, timeoutMs) {
  const id = envio.id
  const destinos = await seguro(admin.rpc('avisos_destinos', { p_envio_id: id }))
  if (destinos.error) {
    registrarFalla('destinos', destinos.error)
    await cerrar(admin, id, 0, 0, 0, [], [])
    return { entregados: 0, fallidos: 0 }
  }
  const sinAvisos = await seguro(admin.rpc('avisos_contar_sin_avisos', { p_envio_id: id }))
  if (sinAvisos.error) {
    registrarFalla('sin_avisos', sinAvisos.error)
    await cerrar(admin, id, 0, 0, 0, [], [])
    return { entregados: 0, fallidos: 0 }
  }

  const filas = Array.isArray(destinos.data) ? destinos.data : []
  const resultados = await enviarTodos(enviar, filas, timeoutMs)
  const c = contarPorJugadora(filas, resultados)
  const fallas = resultados.filter((r) => r === 'falla').length
  if (fallas) registrarFalla('enviar', { message: `${fallas} de ${filas.length} envíos fallaron (${c.fallidos} jugadoras sin entrega)` })

  const sin = (Number.isInteger(sinAvisos.data) ? sinAvisos.data : 0) + c.todasVencidas
  await cerrar(admin, id, c.entregados, c.fallidos, sin, c.ok, c.vencidas)
  return { entregados: c.entregados, fallidos: c.fallidos }
}

// Toma tandas de pendientes hasta que una vuelve vacía, MAX_TANDAS o se pasa el presupuesto de tiempo (contado desde
// el inicio; la primera tanda se toma siempre) y procesa cada envío. Totales por jugadora.
export async function procesar({ admin, enviar, max = 10, presupuestoMs = 60000, timeoutMs = 10000, ahora = Date.now }) {
  const inicio = ahora()
  const total = { envios: 0, entregados: 0, fallidos: 0 }
  for (let tanda = 0; tanda < MAX_TANDAS; tanda++) {
    if (tanda > 0 && ahora() - inicio >= presupuestoMs) break
    const tomados = await seguro(admin.rpc('avisos_tomar_pendientes', { p_max: max }))
    if (tomados.error) {
      registrarFalla('tomar', tomados.error)
      break
    }
    const envios = (Array.isArray(tomados.data) ? tomados.data : []).filter((e) => typeof e?.id === 'string')
    if (!envios.length) break
    for (const envio of envios) {
      const r = await procesarEnvio(admin, enviar, envio, timeoutMs)
      total.envios++
      total.entregados += r.entregados
      total.fallidos += r.fallidos
    }
  }
  return total
}

// deps: {secreto, preparar} (preparar() → {admin, enviar}, solo se llama con el secreto correcto) o, en los tests,
// {secreto, admin, enviar} directo.
export async function atender(request, deps) {
  if (request.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (request.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' })
  if (!secretoValido(request.headers.get('x-avisos-secreto'), deps?.secreto)) return responder(401, { error: 'sin_permiso' })
  try {
    let admin = deps.admin
    let enviar = deps.enviar
    if (deps.preparar) {
      try {
        ({ admin, enviar } = await deps.preparar())
      } catch (e) {
        registrarFalla('configuracion', { message: e?.configuracion ? e.message : `no se pudo preparar el envío (${e?.name ?? 'Error'})` })
        return errorInterno()
      }
    }
    const total = await procesar({ admin, enviar })
    return responder(200, { ok: true, ...total })
  } catch (e) {
    registrarFalla('inesperado', { code: e?.code, message: e?.message })
    return errorInterno()
  }
}

// Arma el preparar de Deno, que atender llama recién después de validar el secreto del pedido. Comprueba los demás
// secretos (registra solo los nombres que faltan), carga las bibliotecas con cargar() y arma el cliente admin y el
// envío. leer(nombre) devuelve el valor de un secreto (en Deno, Deno.env.get).
export function crearPreparar(leer, cargar) {
  return async () => {
    const faltantes = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AVISOS_VAPID_KEYS', 'AVISOS_VAPID_SUBJECT'].filter((nombre) => !leer(nombre))
    // Solo los nombres de los secretos que faltan, nunca sus valores.
    if (faltantes.length) throw errorDeConfiguracion(`faltan secretos: ${faltantes.join(', ')}`)
    let bibliotecas
    try {
      bibliotecas = await cargar()
    } catch (e) {
      throw errorDeConfiguracion('no se pudieron cargar las bibliotecas', e)
    }
    const admin = bibliotecas.createClient(leer('SUPABASE_URL'), leer('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const enviar = await crearEnviar(bibliotecas.webpush, leer('AVISOS_VAPID_KEYS'), leer('AVISOS_VAPID_SUBJECT'))
    return { admin, enviar }
  }
}

// Solo en Supabase (Deno): atender valida primero el secreto del pedido contra AVISOS_SECRETO (si falta, 401 para
// todos); recién después preparar comprueba los demás secretos, carga supabase-js y webpush y arma el
// ApplicationServer (una vez por pedido). Así un POST sin el secreto siempre recibe 401, nunca 500.
if (globalThis.Deno) {
  Deno.serve(async (request) => {
    try {
      const cargar = async () => {
        const [supabase, webpush] = await Promise.all([import('jsr:@supabase/supabase-js@2'), import('jsr:@negrel/webpush@0.5.0')])
        return { createClient: supabase.createClient, webpush }
      }
      const leer = (nombre) => Deno.env.get(nombre)
      return await atender(request, { secreto: Deno.env.get('AVISOS_SECRETO'), preparar: crearPreparar(leer, cargar) })
    } catch (e) {
      registrarFalla('inesperado', { code: e?.code, message: e?.message })
      return errorInterno()
    }
  })
}
