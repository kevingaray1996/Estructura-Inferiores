import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cargarDetallePase, cargarOpcionesDestinatarias, cargarResumenDestinatarias, guardarDestinataria,
  mensajeErrorDestinataria, UUID_EDITOR_PASES,
} from '../src/utils/destinatariasPases.js'

const pase = { id: 'p1', tipo: 'Pase correcto', jugador_id: 'autora' }

// Cliente simulado: no importa supabaseClient ni abre conexiones.
function clienteLectura(respuestas) {
  const consultas = []
  return {
    consultas,
    from(tabla) {
      const consulta = { tabla, filtros: [] }
      consultas.push(consulta)
      const respuesta = respuestas.shift()
      assert.ok(respuesta, 'Consulta inesperada')
      const builder = {
        select(campos) { consulta.campos = campos; return builder },
        eq(campo, valor) { consulta.filtros.push(['eq', campo, valor]); return builder },
        in(campo, valor) { consulta.filtros.push(['in', campo, valor]); return builder },
        maybeSingle() { return Promise.resolve(respuesta) },
        then(resolve, reject) { return Promise.resolve(respuesta).then(resolve, reject) },
      }
      return builder
    },
  }
}

test('convocadas por partido: incluye otra categoria, excluye autora y conserva destinataria anterior', async () => {
  const client = clienteLectura([
    { data: [{ jugador_id: 'autora' }, { jugador_id: 'reserva' }] },
    { data: [{ id: 'autora' }, { id: 'reserva', nombre: 'Reserva', categoria_id: 'otra' }] },
    { data: { id: 'anterior', nombre: 'Anterior' } },
  ])
  const resultado = await cargarOpcionesDestinatarias(client,
    { partido_calendario_id: 'calendario-del-pase', categoria_id: 'categoria' },
    { jugador_id: 'autora' }, { destinataria_id: 'anterior' })
  assert.deepEqual(client.consultas[0].filtros, [['eq', 'partido_id', 'calendario-del-pase']])
  assert.deepEqual(resultado.opciones.map((j) => j.id).sort(), ['anterior', 'reserva'])
  assert.equal(resultado.opciones.find((j) => j.id === 'anterior').previamenteGuardada, true)
  assert.ok(!client.consultas.some((q) => q.filtros.some((f) => f[1] === 'categoria_id')))
})

test('sin citaciones: usa exclusivamente categoria del partido e informa limitacion', async () => {
  const client = clienteLectura([{ data: [] }, { data: [{ id: 'compañera' }] }])
  const resultado = await cargarOpcionesDestinatarias(client,
    { partido_calendario_id: 'cal', categoria_id: 'categoria-del-pase' }, { jugador_id: 'autora' }, null)
  assert.deepEqual(client.consultas[1].filtros, [['eq', 'categoria_id', 'categoria-del-pase']])
  assert.match(resultado.aviso, /no se confirma su participación/)
})

test('error de citaciones no se interpreta como convocatoria vacia', async () => {
  const client = clienteLectura([{ error: { code: '42501' } }])
  await assert.rejects(cargarOpcionesDestinatarias(client,
    { partido_calendario_id: 'cal', categoria_id: 'cat' }, {}, null), { code: '42501' })
  assert.equal(client.consultas.length, 1)
})

test('destinataria anterior no visible sigue representada, sin inventar nombre', async () => {
  const client = clienteLectura([{ data: [] }, { data: [] }, { data: null }])
  const resultado = await cargarOpcionesDestinatarias(client,
    { partido_calendario_id: 'cal', categoria_id: 'cat' }, {}, { destinataria_id: 'guardada' })
  assert.equal(resultado.opciones[0].id, 'guardada')
  assert.equal(resultado.opciones[0].previamenteGuardada, true)
})

test('resumen solo consulta pases, conserva acciones y no escribe', async () => {
  const eventos = [{ id: 'p1', tipo: 'Pase correcto' }, { id: 'r1', tipo: 'Remate' }]
  const original = structuredClone(eventos)
  const client = clienteLectura([{ data: [{ evento_id: 'p1', destinataria_estado: 'pendiente' }] }])
  const resultado = await cargarResumenDestinatarias(client, eventos)
  assert.deepEqual(client.consultas[0].filtros, [['in', 'evento_id', ['p1']]])
  assert.equal(resultado.detalles.p1.destinataria_estado, 'pendiente')
  assert.deepEqual(eventos, original)
})

test('guardado solo via RPC: creacion null y actualizacion con revision leida', async () => {
  const llamadas = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: UUID_EDITOR_PASES } } }) },
    rpc: async (nombre, args) => {
      llamadas.push({ nombre, args })
      return { data: { evento_id: args.p_evento_id, revision: (args.p_revision_esperada || 0) + 1 } }
    },
  }
  await guardarDestinataria(client, pase, null, 'desconocida', 'ignorada')
  await guardarDestinataria(client, pase, { revision: 7 }, 'identificada', 'compañera')
  assert.deepEqual(llamadas[0], { nombre: 'guardar_detalle_pase', args: {
    p_evento_id: 'p1', p_destinataria_estado: 'desconocida', p_destinataria_id: null, p_revision_esperada: null,
  } })
  assert.equal(llamadas[1].args.p_revision_esperada, 7)
  assert.equal(llamadas[1].args.p_destinataria_id, 'compañera')
})

test('otra cuenta no llega a invocar RPC', async () => {
  let llamadas = 0
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'otra' } } }) },
    rpc: async () => { llamadas++; return {} },
  }
  await assert.rejects(guardarDestinataria(client, pase, null, 'pendiente', null), { code: '42501' })
  assert.equal(llamadas, 0)
})

test('conflicto se propaga sin reintentar ni sobrescribir revision', async () => {
  let llamadas = 0
  const detalle = { revision: 2 }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: UUID_EDITOR_PASES } } }) },
    rpc: async () => { llamadas++; return { error: { code: '40001' } } },
  }
  await assert.rejects(guardarDestinataria(client, pase, detalle, 'pendiente', null), { code: '40001' })
  assert.equal(llamadas, 1)
  assert.equal(detalle.revision, 2)
  assert.match(mensajeErrorDestinataria({ code: '40001' }), /Recargá/)
})

test('respuesta de guardado incierta exige consultar antes de reintentar', async () => {
  let llamadas = 0
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: UUID_EDITOR_PASES } } }) },
    rpc: async () => { llamadas++; return { data: null } },
  }
  await assert.rejects(guardarDestinataria(client, pase, null, 'no_observable', null),
    /confirmar la respuesta/)
  assert.equal(llamadas, 1)
  assert.match(mensajeErrorDestinataria(new Error('red')), /comprobar si el cambio llegó/)
})

test('sin pases no consulta Supabase ni interpreta otras acciones como pendientes', async () => {
  const client = clienteLectura([])
  assert.deepEqual(await cargarResumenDestinatarias(client, [{ id: 'r1', tipo: 'Remate' }]),
    { detalles: {}, nombres: {} })
  assert.equal(client.consultas.length, 0)
})

test('lectura: solo ausencia confirmada se representa sin detalle; errores se propagan', async () => {
  assert.equal(await cargarDetallePase(clienteLectura([{ data: null }]), 'p1'), null)
  await assert.rejects(cargarDetallePase(clienteLectura([{ error: { code: '42501' } }]), 'p1'), { code: '42501' })
  await assert.rejects(cargarResumenDestinatarias(clienteLectura([{ error: { code: '42501' } }]), [pase]), { code: '42501' })
})

test('lectura invalida nunca se convierte en pendiente ni revision de creacion', async () => {
  for (const detalle of [
    { evento_id: 'p1', destinataria_estado: 'pendiente' },
    { evento_id: 'p1', destinataria_estado: 'inventado', revision: 1 },
    { evento_id: 'p1', destinataria_estado: 'identificada', revision: 1, destinataria_id: null },
    { evento_id: 'otra', destinataria_estado: 'pendiente', revision: 1 },
  ]) {
    await assert.rejects(cargarDetallePase(clienteLectura([{ data: detalle }]), 'p1'), /no es válido/)
  }
  const detalle = { evento_id: 'p1', destinataria_estado: 'identificada', revision: 4, destinataria_id: 'compañera' }
  assert.deepEqual(await cargarDetallePase(clienteLectura([{ data: detalle }]), 'p1'), detalle)
})

test('validacion local evita RPC para autora, estado invalido y acciones que no son pases', async () => {
  let llamadas = 0
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: UUID_EDITOR_PASES } } }) },
    rpc: async () => { llamadas++; return {} },
  }
  for (const [evento, estado, id] of [
    [pase, 'identificada', 'autora'],
    [pase, 'identificada', ''],
    [pase, 'inventado', null],
    [{ ...pase, tipo: 'Remate' }, 'pendiente', null],
  ]) {
    await assert.rejects(guardarDestinataria(client, evento, null, estado, id), { code: '22023' })
  }
  assert.equal(llamadas, 0)
})
