import test from 'node:test'
import assert from 'node:assert/strict'
import { cargarDetallePase, guardarDestinataria, UUID_EDITOR_PASES } from '../src/utils/destinatariasPases.js'
import {
  puntoExacto, trayectoriaExacta, direccionAtaquePase, cargarFichaDestino, guardarDestinoPase, mensajeErrorDestino,
} from '../src/utils/trayectoriasPases.js'

const pase = { id: 'p1', tipo: 'Pase correcto', jugador_id: 'a', periodo: 1, segundo: 1425, coordenada_x: 20, coordenada_y: 30 }
const detalle = { evento_id: 'p1', revision: 3, destinataria_id: 'b', destinataria_estado: 'identificada', destino_x: 70, destino_y: 40 }
function clientRpc(handler, uuid = UUID_EDITOR_PASES) {
  const llamadas = []
  return {
    llamadas,
    auth: { getUser: async () => ({ data: { user: { id: uuid } } }) },
    rpc: async (nombre, args) => { llamadas.push({ nombre, args }); return handler(nombre, args) },
  }
}
function clientLectura(respuestas) {
  const consultas = []
  return { consultas, from(tabla) {
    const consulta = { tabla }
    consultas.push(consulta)
    const r = respuestas.shift()
    assert.ok(r, 'Consulta extra inesperada')
    const q = {
      select(campos) { consulta.campos = campos; return q },
      eq(campo, valor) { consulta.filtro = [campo, valor]; return q },
      maybeSingle() { return Promise.resolve(r) },
    }
    return q
  } }
}

test('extremos exactos incluyen bordes, sin convertir null/vacios en cero ni recortar valores', () => {
  assert.deepEqual(puntoExacto(0, 100), { x: 0, y: 100 })
  for (const x of [null, undefined, '', ' ', false, true, [], {}, NaN, Infinity, -1, 101]) assert.equal(puntoExacto(x, 50), null)
  const original = structuredClone(pase)
  assert.deepEqual(trayectoriaExacta(pase, detalle), { origen: { x: 20, y: 30 }, destino: { x: 70, y: 40 } })
  assert.deepEqual(pase, original)
})

test('sin destino, con solo zona, un extremo ausente u otra accion no inventa flechas', () => {
  assert.equal(trayectoriaExacta(pase, null), null)
  assert.equal(trayectoriaExacta({ ...pase, coordenada_x: null, coordenada_y: null, zona: 'Medio centro' }, detalle), null)
  assert.equal(trayectoriaExacta(pase, { ...detalle, destino_y: null }), null)
  assert.equal(trayectoriaExacta({ ...pase, tipo: 'Remate' }, detalle), null)
  assert.deepEqual(trayectoriaExacta(pase, { ...detalle, destino_x: 20, destino_y: 30 }).destino, { x: 20, y: 30 })
})

test('direccion reutiliza partido y periodo de cada accion sin defaults ni modificar coordenadas', () => {
  const partido = { direccion_primer_tiempo: 'izquierda' }
  assert.equal(direccionAtaquePase(partido, pase), 'izquierda')
  assert.equal(direccionAtaquePase(partido, { ...pase, periodo: 2 }), 'derecha')
  assert.equal(direccionAtaquePase({ direccion_primer_tiempo: 'derecha' }, { ...pase, periodo: 2 }), 'izquierda')
  assert.equal(direccionAtaquePase({}, pase), null)
  assert.equal(direccionAtaquePase(partido, { periodo: null }), null)
  assert.equal(pase.coordenada_x, 20)
})

test('lector anterior admite columnas nuevas; ficha lee destinataria existente sin consultar convocadas', async () => {
  const client = clientLectura([{ data: detalle }, { data: { id: 'b', nombre: 'Nadia', apellido: 'M' } }])
  const ficha = await cargarFichaDestino(client, 'p1')
  assert.equal(ficha.destinataria, 'Nadia M')
  assert.deepEqual(ficha.detalle, detalle)
  assert.match(client.consultas[0].campos, /destino_x, destino_y/)
  assert.equal(client.consultas[1].tabla, 'jugadores')
  assert.deepEqual(await cargarDetallePase(clientLectura([{ data: detalle }]), 'p1'), detalle)
})

test('ausencia confirmada y fallo de lectura se distinguen; destino invalido bloquea edicion', async () => {
  assert.deepEqual(await cargarFichaDestino(clientLectura([{ data: null }]), 'p1'), { detalle: null, destinataria: null })
  await assert.rejects(cargarFichaDestino(clientLectura([{ error: { code: '42501' } }]), 'p1'), { code: '42501' })
  await assert.rejects(cargarFichaDestino(clientLectura([{ data: { ...detalle, destino_y: null } }]), 'p1'), /no es válido/)
})

test('crear destino sin detalle envia revision null; admite origen sin coordenadas sin inventarlo', async () => {
  const client = clientRpc(() => ({ data: { ...detalle, revision: 1, destino_x: 0, destino_y: 100 } }))
  await guardarDestinoPase(client, { ...pase, coordenada_x: null, coordenada_y: null }, null, { x: 0, y: 100 })
  assert.deepEqual(client.llamadas[0], { nombre: 'guardar_destino_pase', args: {
    p_evento_id: 'p1', p_destino_x: 0, p_destino_y: 100, p_revision_esperada: null,
  } })
})

test('corregir y quitar destino comparten revision y no envian cambios de destinataria', async () => {
  const client = clientRpc((_nombre, args) => ({ data: {
    ...detalle, revision: args.p_revision_esperada + 1, destino_x: args.p_destino_x, destino_y: args.p_destino_y,
  } }))
  const cambiado = await guardarDestinoPase(client, pase, detalle, { x: 80, y: 50 })
  const quitado = await guardarDestinoPase(client, pase, cambiado, null)
  assert.equal(quitado.destinataria_id, 'b')
  assert.equal(quitado.revision, 5)
  assert.deepEqual(client.llamadas[1].args, { p_evento_id: 'p1', p_destino_x: null, p_destino_y: null, p_revision_esperada: 4 })
  assert.equal(detalle.revision, 3)
})

test('compatibilidad cruzada: cliente de destinatarias conserva retorno del destino y usa revision nueva', async () => {
  let actual = { ...detalle }
  const client = clientRpc((nombre, args) => {
    if (args.p_revision_esperada !== actual.revision) return { error: { code: '40001' } }
    actual = nombre === 'guardar_destino_pase'
      ? { ...actual, destino_x: args.p_destino_x, destino_y: args.p_destino_y, revision: actual.revision + 1 }
      : { ...actual, destinataria_id: args.p_destinataria_id, destinataria_estado: args.p_destinataria_estado, revision: actual.revision + 1 }
    return { data: actual }
  })
  const conDestino = await guardarDestinoPase(client, pase, detalle, { x: 80, y: 50 })
  await assert.rejects(guardarDestinataria(client, pase, detalle, 'desconocida', null), { code: '40001' })
  const conDestinataria = await guardarDestinataria(client, pase, conDestino, 'desconocida', null)
  assert.equal(conDestinataria.destino_x, 80)
  assert.equal(conDestinataria.revision, 5)
  await assert.rejects(guardarDestinoPase(client, pase, conDestino, null), { code: '40001' })
  assert.match(mensajeErrorDestino({ code: '40001' }), /destinataria o el destino cambió/)
})

test('UUID ajeno, coordenadas invalidas, otra accion y revision faltante no invocan la RPC', async () => {
  const ajeno = clientRpc(() => assert.fail(), 'otra-cuenta')
  await assert.rejects(guardarDestinoPase(ajeno, pase, detalle, null), { code: '42501' })
  assert.equal(ajeno.llamadas.length, 0)
  const client = clientRpc(() => assert.fail())
  for (const destino of [{ x: null, y: 5 }, { x: 101, y: 2 }, { x: NaN, y: 2 }]) {
    await assert.rejects(guardarDestinoPase(client, pase, detalle, destino), { code: '22023' })
  }
  await assert.rejects(guardarDestinoPase(client, { ...pase, tipo: 'Centro' }, detalle, null), { code: '22023' })
  await assert.rejects(guardarDestinoPase(client, pase, { evento_id: 'p1' }, null), { code: '40001' })
  await assert.rejects(guardarDestinoPase(client, pase, null, null), { code: '22023' })
  assert.equal(client.llamadas.length, 0)
})

test('respuesta incierta no se reintenta automaticamente', async () => {
  const client = clientRpc(() => ({ data: { ...detalle, revision: 4, destino_x: 99 } }))
  await assert.rejects(guardarDestinoPase(client, pase, detalle, { x: 80, y: 50 }), /confirmar el guardado/)
  assert.equal(client.llamadas.length, 1)
  assert.match(mensajeErrorDestino(new Error('red')), /comprobar si el cambio llegó/)
})

test('SVG muestra flechas correctas/incorrectas solo con extremos exactos y puntos coincidentes sin linea', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: FlechasPases } = await server.ssrLoadModule('/src/components/FlechasPases.jsx')
    const html = renderToStaticMarkup(createElement('svg', {}, createElement(FlechasPases, {
      eventos: [pase, { ...pase, id: 'p2', tipo: 'Pase incorrecto' }, { ...pase, id: 'sin-destino' }],
      detalles: { p1: detalle, p2: { ...detalle, destino_x: 20, destino_y: 30 } }, onSelect: () => {},
    })))
    assert.match(html, /x1="20" y1="19.2" x2="70" y2="25.6"/)
    assert.match(html, /stroke="#4ADE80"/)
    assert.match(html, /stroke="#F87171"/)
    assert.match(html, /Sin desplazamiento/)
    assert.equal((html.match(/role="button"/g) || []).length, 2)
    assert.equal((html.match(/marker-end=/g) || []).length, 1)
  } finally { await server.close() }
})
