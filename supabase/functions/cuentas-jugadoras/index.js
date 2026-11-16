// @ts-nocheck
/* global Deno */
// Edge Function cuentas-jugadoras: coordinación crea, desactiva y reactiva las cuentas de las jugadoras.
//
// Se sube pegando este archivo en el editor de Supabase (Edge Functions → Deploy a new function → Via Editor), que
// lo guarda como index.ts. Por eso es JS plano válido también como TS (@ts-nocheck), sin imports arriba de todo y sin
// APIs de Node: el test de Node importa atender y validarPedido con clientes simulados.
//
// La clave service_role la inyecta Supabase y solo se lee de Deno.env acá adentro. Antes de tocar auth.admin o
// cualquier función de service_role se comprueba que quien llama tenga sesión (401) y sea coordinación (403).
//
// Pedido: POST {accion:'crear', jugador_id, email} | {accion:'desactivar'|'reactivar'|'quitar', jugador_id}
// quitar: para una cuenta creada por error. Desactiva la fila y borra el usuario de Auth; la base borra la cuenta en
// cascada y la jugadora vuelve a "Sin cuenta" (la jugadora no se toca).
// Respuesta: 200 {ok:true} o {error:<código>} (sin_sesion, sin_permiso, pedido_invalido, email_en_uso,
// ya_tiene_cuenta, jugadora_inexistente, sin_cuenta, error_interno). Nunca devuelve detalles internos.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACCIONES = ['crear', 'desactivar', 'reactivar', 'quitar']
const BAN_DESACTIVADA = '876000h'

const INVALIDO = { error: 'pedido_invalido' }

function responder(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const errorInterno = () => responder(500, { error: 'error_interno' })

// Deja rastro en los logs de la función: solo la etapa y el código/mensaje del error. Nunca el mail, el cuerpo del
// pedido ni tokens.
function registrarFalla(etapa, error) {
  console.error('cuentas-jugadoras', etapa, error?.code, error?.message)
}

// Valida y normaliza el cuerpo. Devuelve {accion, jugador_id, email?} o {error:'pedido_invalido'}.
export function validarPedido(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return INVALIDO
  const { accion, jugador_id } = cuerpo
  if (typeof accion !== 'string' || !ACCIONES.includes(accion)) return INVALIDO
  if (typeof jugador_id !== 'string' || !UUID.test(jugador_id)) return INVALIDO
  const pedido = { accion, jugador_id: jugador_id.toLowerCase() }
  if (accion !== 'crear') return pedido
  if (typeof cuerpo.email !== 'string') return INVALIDO
  const email = cuerpo.email.trim().toLowerCase()
  if (email.length > 254 || !EMAIL.test(email)) return INVALIDO
  return { ...pedido, email }
}

// El token del encabezado Authorization ("Bearer <jwt>"), o null.
function tokenDe(request) {
  const encabezado = request.headers.get('authorization') || ''
  const coincidencia = /^Bearer\s+(\S+)$/i.exec(encabezado.trim())
  return coincidencia ? coincidencia[1] : null
}

// Pasa una función de la base a {data, error} aunque el cliente tire una excepción.
async function seguro(promesa) {
  try {
    const r = await promesa
    return { data: r?.data ?? null, error: r?.error ?? null }
  } catch (e) {
    return { data: null, error: { message: String(e?.message ?? e) } }
  }
}

function yaRegistradoEnAuth(error) {
  return error?.code === 'email_exists' || /already (been )?registered/i.test(String(error?.message ?? ''))
}

async function crear(clienteAdmin, { jugador_id, email }, creadaPor) {
  const creado = await seguro(clienteAdmin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { tipo: 'jugadora' } }))
  if (creado.error) {
    if (yaRegistradoEnAuth(creado.error)) return responder(409, { error: 'email_en_uso' })
    registrarFalla('crear_usuario', creado.error)
    return errorInterno()
  }
  const usuarioId = creado.data?.user?.id
  if (!usuarioId) {
    registrarFalla('crear_usuario', { message: 'sin id de usuario' })
    return errorInterno()
  }

  const registro = await seguro(clienteAdmin.rpc('cuentas_jugadoras_registrar', {
    p_jugador_id: jugador_id, p_usuario_id: usuarioId, p_email: email, p_creada_por: creadaPor,
  }))
  if (!registro.error) return responder(200, { ok: true })
  registrarFalla('registrar', registro.error)

  // No quedó registrada: se borra el usuario recién creado para no dejar una cuenta de Auth suelta. Si el borrado
  // falla, se responde igual con el error original.
  const borrado = await seguro(clienteAdmin.auth.admin.deleteUser(usuarioId))
  if (borrado.error) registrarFalla('borrar_usuario', borrado.error)
  const { code, message } = registro.error
  const texto = String(message ?? '')
  if (code === 'P0002' && texto.includes('jugadora_inexistente')) return responder(404, { error: 'jugadora_inexistente' })
  if (code === '23505' && texto.includes('ya_tiene_cuenta')) return responder(409, { error: 'ya_tiene_cuenta' })
  if (code === '23505' && texto.includes('email_en_uso')) return responder(409, { error: 'email_en_uso' })
  // usuario_no_coincide (no debería pasar) y cualquier otra falla.
  return errorInterno()
}

// Desactivar: activa=false y después ban en Auth; si el ban falla, la fila vuelve a activa.
// Reactivar: activa=true y después se levanta el ban; si eso falla, la fila queda activa (fila activa + usuario
// bloqueado igual no entra, así que falla del lado seguro) y coordinación puede reintentar: es idempotente.
async function cambiarEstado(clienteAdmin, { jugador_id }, activa) {
  const estado = await seguro(clienteAdmin.rpc('cuentas_jugadoras_estado', { p_jugador_id: jugador_id, p_activa: activa }))
  if (estado.error) {
    if (estado.error.code === 'P0002' && String(estado.error.message ?? '').includes('sin_cuenta')) return responder(404, { error: 'sin_cuenta' })
    registrarFalla('estado', estado.error)
    return errorInterno()
  }
  const usuarioId = estado.data
  let auth = { error: { message: 'sin usuario' } }
  if (typeof usuarioId === 'string' && usuarioId) {
    auth = await seguro(clienteAdmin.auth.admin.updateUserById(usuarioId, { ban_duration: activa ? 'none' : BAN_DESACTIVADA }))
  }
  if (auth.error) {
    registrarFalla(activa ? 'desbloquear' : 'bloquear', auth.error)
    if (!activa) {
      const revertido = await seguro(clienteAdmin.rpc('cuentas_jugadoras_estado', { p_jugador_id: jugador_id, p_activa: true }))
      if (revertido.error) registrarFalla('revertir', revertido.error)
    }
    return errorInterno()
  }
  return responder(200, { ok: true })
}

// Quitar: primero desactiva la fila (así, si algo falla después, la cuenta queda bloqueada para la red y para las
// funciones del portal) y después borra el usuario de Auth. cuentas_jugadoras.usuario_id es ON DELETE CASCADE, así
// que la fila desaparece con el usuario. Si el borrado falla, la cuenta queda desactivada y se puede reintentar.
async function quitar(clienteAdmin, { jugador_id }) {
  const estado = await seguro(clienteAdmin.rpc('cuentas_jugadoras_estado', { p_jugador_id: jugador_id, p_activa: false }))
  if (estado.error) {
    if (estado.error.code === 'P0002' && String(estado.error.message ?? '').includes('sin_cuenta')) return responder(404, { error: 'sin_cuenta' })
    registrarFalla('estado', estado.error)
    return errorInterno()
  }
  const usuarioId = estado.data
  if (typeof usuarioId !== 'string' || !usuarioId) {
    registrarFalla('quitar_usuario', { message: 'sin usuario' })
    return errorInterno()
  }
  const borrado = await seguro(clienteAdmin.auth.admin.deleteUser(usuarioId))
  if (borrado.error) {
    registrarFalla('quitar_usuario', borrado.error)
    return errorInterno()
  }
  return responder(200, { ok: true })
}

export async function atender(request, { clienteUsuario, clienteAdmin }) {
  if (request.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (request.method !== 'POST') return responder(405, INVALIDO)
  try {
    // 1. Sesión: sin token o con un token que Auth no reconoce → 401.
    const token = tokenDe(request)
    if (!token) return responder(401, { error: 'sin_sesion' })
    const quien = await seguro(clienteUsuario.auth.getUser(token))
    const creadaPor = quien.data?.user?.id
    if (quien.error || !creadaPor) return responder(401, { error: 'sin_sesion' })

    // 2. Rol: solo coordinación. mi_rol() corre con el token de quien llama.
    const rol = await seguro(clienteUsuario.rpc('mi_rol'))
    if (rol.error) {
      registrarFalla('rol', rol.error)
      return errorInterno()
    }
    if (rol.data !== 'coordinacion') return responder(403, { error: 'sin_permiso' })

    // 3. Cuerpo.
    let cuerpo
    try {
      cuerpo = await request.json()
    } catch {
      return responder(400, INVALIDO)
    }
    const pedido = validarPedido(cuerpo)
    if (pedido.error) return responder(400, INVALIDO)

    if (pedido.accion === 'crear') return await crear(clienteAdmin, pedido, creadaPor)
    if (pedido.accion === 'quitar') return await quitar(clienteAdmin, pedido)
    return await cambiarEstado(clienteAdmin, pedido, pedido.accion === 'reactivar')
  } catch (e) {
    registrarFalla('inesperado', e)
    return errorInterno()
  }
}

// Solo en Supabase (Deno): carga supabase-js, arma los dos clientes por pedido y atiende.
if (globalThis.Deno) {
  Deno.serve(async (request) => {
    if (request.method !== 'POST') return atender(request, {})
    try {
      const { createClient } = await import('jsr:@supabase/supabase-js@2')
      const url = Deno.env.get('SUPABASE_URL')
      const faltantes = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((nombre) => !Deno.env.get(nombre))
      if (faltantes.length) {
        // Solo los nombres de los secretos que faltan, nunca sus valores.
        registrarFalla('configuracion', { message: `faltan secretos: ${faltantes.join(', ')}` })
        return errorInterno()
      }
      const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      const clienteUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY'), {
        ...opciones,
        global: { headers: { Authorization: request.headers.get('authorization') || '' } },
      })
      const clienteAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), opciones)
      return await atender(request, { clienteUsuario, clienteAdmin })
    } catch (e) {
      registrarFalla('inesperado', e)
      return errorInterno()
    }
  })
}
