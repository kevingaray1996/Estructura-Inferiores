// Cola de guardado del etiquetado: nunca pierde un toque, guarda en orden, reintenta sin duplicar, respeta los
// rechazos de la base, deshace y sobrevive a una recarga. Sin red ni base: todo simulado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { crearColaEtiquetado, clasificarResultado, resumenCola, CLAVE_COLA, ESPERAS_MS } from '../src/utils/analisis/colaEtiquetado.js'

const registro = (id, segundo = 10) => ({ id, partido_id: 'p1', segundo, tipo: 'Pase correcto' })
const esperar = () => new Promise((r) => setTimeout(r, 0))

function almacen(inicial) {
  const datos = new Map(inicial ? [[CLAVE_COLA, JSON.stringify(inicial)]] : [])
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v), leer: () => JSON.parse(datos.get(CLAVE_COLA) || '[]') }
}

// Base simulada: cada envío queda esperando hasta que el test decide la respuesta.
function base() {
  const envios = [], borrados = []
  return {
    envios, borrados,
    enviar: (r) => new Promise((resolve) => envios.push({ r, ok: () => resolve({ data: { ...r }, error: null }), fallar: (error) => resolve({ data: null, error }) })),
    borrar: async (id) => { borrados.push(id); return { error: null } },
  }
}

function timers() {
  const pendientes = []
  return { pendientes, programar: (fn, ms) => { const t = { fn, ms }; pendientes.push(t); return t }, cancelar: (t) => { const i = pendientes.indexOf(t); if (i >= 0) pendientes.splice(i, 1) }, correr: () => pendientes.splice(0).forEach((t) => t.fn()) }
}

test('clasifica respuestas: ok, ya existía, rechazo de la base y error de red', () => {
  assert.equal(clasificarResultado({ data: { id: 'a' } }, 'a'), 'ok')
  assert.equal(clasificarResultado({ error: { code: '23505' } }, 'a'), 'duplicado')
  assert.equal(clasificarResultado({ error: { code: '42501', message: 'permiso' } }, 'a'), 'rechazo')
  assert.equal(clasificarResultado({ error: { code: '23503' } }, 'a'), 'rechazo')
  assert.equal(clasificarResultado({ error: { message: 'TypeError: Failed to fetch' } }, 'a'), 'red')
  assert.equal(clasificarResultado({ error: { code: 'PGRST301' } }, 'a'), 'red')
  assert.equal(clasificarResultado({ data: null, error: null }, 'a'), 'red', 'Sin confirmación: se reintenta (no duplica)')
})

test('tres toques seguidos: aparecen los tres al instante y se guardan de a uno, en orden', async () => {
  const b = base(), confirmadas = []
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, alConfirmar: (f) => confirmadas.push(f.id) })
  cola.agregar(registro('a')); cola.agregar(registro('b')); cola.agregar(registro('c'))
  assert.deepEqual(cola.getSnapshot().map((i) => [i.id, i.estado]), [['a', 'enviando'], ['b', 'pendiente'], ['c', 'pendiente']])
  assert.equal(b.envios.length, 1, 'Un envío por vez')
  b.envios[0].ok(); await esperar()
  b.envios[1].ok(); await esperar()
  b.envios[2].ok(); await esperar()
  assert.deepEqual(b.envios.map((e) => e.r.id), ['a', 'b', 'c'])
  assert.deepEqual(confirmadas, ['a', 'b', 'c'])
  assert.equal(cola.getSnapshot().length, 0)
})

test('sin conexión: marca el error, sigue con las demás y reintenta sola sin duplicar', async () => {
  const b = base(), t = timers(), confirmadas = []
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, programar: t.programar, cancelar: t.cancelar, alConfirmar: (f) => confirmadas.push(f.id) })
  cola.agregar(registro('a')); cola.agregar(registro('b'))
  b.envios[0].fallar({ message: 'TypeError: Failed to fetch' }); await esperar()
  assert.deepEqual(cola.getSnapshot().map((i) => [i.id, i.estado]), [['a', 'error'], ['b', 'enviando']])
  assert.equal(t.pendientes[0].ms, ESPERAS_MS[0])
  b.envios[1].fallar({ message: 'Load failed' }); await esperar()
  assert.equal(t.pendientes.length, 1, 'Un solo reintento programado')

  // Vuelve la conexión: el primer envío sí había llegado (la base dice «ya existe») y el segundo se guarda.
  t.correr(); await esperar()
  assert.equal(b.envios[2].r.id, 'a')
  b.envios[2].fallar({ code: '23505', message: 'duplicate key' }); await esperar()
  b.envios[3].ok(); await esperar()
  assert.deepEqual(confirmadas, ['a', 'b'], 'Ninguna se pierde ni se duplica')
  assert.equal(cola.getSnapshot().length, 0)
})

test('reintentar ahora no espera el temporizador', async () => {
  const b = base(), t = timers()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, programar: t.programar, cancelar: t.cancelar })
  cola.agregar(registro('a'))
  b.envios[0].fallar({ message: 'Failed to fetch' }); await esperar()
  cola.reintentarAhora()
  assert.equal(t.pendientes.length, 0)
  assert.equal(b.envios.length, 2)
  assert.equal(cola.getSnapshot()[0].estado, 'enviando')
})

test('un rechazo de la base no se reintenta: queda visible hasta descartarlo', async () => {
  const b = base(), t = timers()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, programar: t.programar, cancelar: t.cancelar })
  cola.agregar(registro('a'))
  b.envios[0].fallar({ code: '42501', message: 'new row violates row-level security policy' }); await esperar()
  assert.equal(cola.getSnapshot()[0].estado, 'rechazada')
  assert.equal(t.pendientes.length, 0)
  cola.reintentarAhora()
  assert.equal(b.envios.length, 1, 'Reintentar no reenvía un rechazo')
  assert.equal(cola.descartar('a'), true)
  assert.equal(cola.getSnapshot().length, 0)
})

test('deshacer: una pendiente se quita sin enviarse; una que viajaba se borra al confirmarse', async () => {
  const b = base(), confirmadas = []
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, alConfirmar: (f) => confirmadas.push(f.id) })
  cola.agregar(registro('a')); cola.agregar(registro('b'))
  assert.equal(cola.cancelar('b'), true)
  assert.deepEqual(cola.getSnapshot().map((i) => i.id), ['a'])
  assert.equal(cola.cancelar('a'), true, 'La que se está enviando también se deshace')
  b.envios[0].ok(); await esperar()
  assert.deepEqual(b.borrados, ['a'])
  assert.deepEqual(confirmadas, [])
  assert.equal(b.envios.length, 1, 'La pendiente deshecha nunca se envió')
  assert.equal(cola.cancelar('zzz'), false)
})

test('respaldo en el navegador: lo pendiente sobrevive a una recarga y se envía al volver', async () => {
  const a = almacen(), b = base()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, almacen: a })
  cola.agregar(registro('a', 5)); cola.agregar(registro('b', 6))
  assert.deepEqual(a.leer().map((r) => r.id), ['a', 'b'])
  cola.detener()

  // «Recarga»: una cola nueva con el mismo almacén retoma lo que faltaba.
  const b2 = base(), confirmadas = []
  const otra = crearColaEtiquetado({ enviar: b2.enviar, borrar: b2.borrar, almacen: a, alConfirmar: (f) => confirmadas.push(f.id) })
  assert.deepEqual(otra.getSnapshot().map((i) => [i.id, i.estado]), [['a', 'pendiente'], ['b', 'pendiente']])
  otra.iniciar()
  b2.envios[0].ok(); await esperar()
  b2.envios[1].ok(); await esperar()
  assert.deepEqual(confirmadas, ['a', 'b'])
  assert.deepEqual(a.leer(), [])
})

test('almacén roto o ilegible: la cola funciona igual, sin respaldo', async () => {
  const roto = { getItem: () => { throw Error('bloqueado') }, setItem: () => { throw Error('lleno') } }
  const b = base()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, almacen: roto })
  cola.agregar(registro('a'))
  b.envios[0].ok(); await esperar()
  assert.equal(cola.getSnapshot().length, 0)
  const basura = { getItem: () => '{no es json', setItem() {} }
  assert.deepEqual(crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, almacen: basura }).getSnapshot(), [])
})

test('una rechazada sigue respaldada hasta descartarla y al recargar se intenta otra vez', async () => {
  const a = almacen(), b = base()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, almacen: a })
  cola.agregar(registro('a'))
  b.envios[0].fallar({ code: '42501', message: 'permiso' }); await esperar()
  assert.deepEqual(a.leer().map((r) => r.id), ['a'], 'No se olvida por un rechazo')
  cola.detener()
  const b2 = base(), confirmadas = []
  const otra = crearColaEtiquetado({ enviar: b2.enviar, borrar: b2.borrar, almacen: a, alConfirmar: (f) => confirmadas.push(f.id) })
  otra.iniciar()
  b2.envios[0].ok(); await esperar()
  assert.deepEqual(confirmadas, ['a'])
  assert.deepEqual(a.leer(), [])
  // Descartar sí la olvida.
  const a3 = almacen(), b3 = base()
  const tercera = crearColaEtiquetado({ enviar: b3.enviar, borrar: b3.borrar, almacen: a3 })
  tercera.agregar(registro('z'))
  b3.envios[0].fallar({ code: '23514' }); await esperar()
  tercera.descartar('z')
  assert.deepEqual(a3.leer(), [])
})

test('resumen para el indicador: guardando, guardado y error', () => {
  const item = (estado, extra = {}) => ({ id: estado, estado, cancelada: false, ...extra })
  assert.deepEqual(resumenCola([]), { estado: 'guardado', texto: 'Todo guardado' })
  assert.equal(resumenCola([item('pendiente')]).texto, 'Guardando…')
  assert.equal(resumenCola([item('pendiente'), item('enviando')]).texto, 'Guardando 2…')
  assert.equal(resumenCola([item('enviando'), item('error')]).estado, 'error')
  assert.match(resumenCola([item('error')]).texto, /reintentando/)
  assert.match(resumenCola([item('rechazada')]).texto, /rechazada/)
  assert.equal(resumenCola([item('pendiente', { cancelada: true })]).estado, 'guardado')
})

// Etapa 1: un momento colectivo se guarda al abrirse (fin provisorio) y al cerrarse se corrige el fin.
function baseConActualizar() {
  const b = base(), actualizaciones = []
  b.actualizaciones = actualizaciones
  b.actualizar = (id, cambios) => new Promise((resolve) => actualizaciones.push({ id, cambios, ok: () => resolve({ data: { id }, error: null }), fallar: (error) => resolve({ data: null, error }) }))
  return b
}

test('actualizar: si el alta todavía no salió, el fin viaja con ella (un solo envío)', async () => {
  const b = baseConActualizar(), a = almacen()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, actualizar: b.actualizar, almacen: a })
  cola.detener()
  cola.agregar({ ...registro('m', 100), segundo_fin: 115 })
  cola.actualizar('m', { segundo_fin: 106 })
  assert.equal(a.leer()[0].segundo_fin, 106, 'El respaldo ya tiene el fin corregido')
  cola.iniciar()
  assert.equal(b.envios[0].r.segundo_fin, 106)
  b.envios[0].ok(); await esperar()
  assert.equal(b.actualizaciones.length, 0)
  assert.deepEqual(a.leer(), [])
})

test('actualizar: con el alta en viaje o con error de red, espera a que esté confirmada; nunca se adelanta', async () => {
  const b = baseConActualizar(), t = timers(), actualizadas = []
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, actualizar: b.actualizar, programar: t.programar, cancelar: t.cancelar, alActualizar: (id, c) => actualizadas.push([id, c.segundo_fin]) })
  cola.agregar({ ...registro('m', 100), segundo_fin: 115 })
  cola.actualizar('m', { segundo_fin: 104 })
  cola.actualizar('m', { segundo_fin: 106 })
  assert.equal(b.actualizaciones.length, 0, 'El alta todavía no se confirmó')
  b.envios[0].fallar({ message: 'Failed to fetch' }); await esperar()
  assert.equal(b.actualizaciones.length, 0, 'Con el alta en error, la actualización espera')
  t.correr(); await esperar()
  b.envios[1].ok(); await esperar()
  assert.equal(b.actualizaciones.length, 1, 'Dos cierres seguidos se juntan en un solo envío')
  assert.deepEqual([b.actualizaciones[0].id, b.actualizaciones[0].cambios], ['m', { segundo_fin: 106 }])
  b.actualizaciones[0].ok(); await esperar()
  assert.deepEqual(actualizadas, [['m', 106]])
  assert.equal(cola.getSnapshot().length, 0)
})

test('actualizar: se reintenta si falla la red, sobrevive a una recarga y se descarta con su alta', async () => {
  const b = baseConActualizar(), t = timers(), a = almacen()
  const cola = crearColaEtiquetado({ enviar: b.enviar, borrar: b.borrar, actualizar: b.actualizar, programar: t.programar, cancelar: t.cancelar, almacen: a })
  cola.agregar({ ...registro('m', 100), segundo_fin: 115 })
  b.envios[0].ok(); await esperar()
  cola.actualizar('m', { segundo_fin: 108 })
  b.actualizaciones[0].fallar({ message: 'Failed to fetch' }); await esperar()
  assert.equal(cola.getSnapshot()[0].estado, 'error')
  cola.detener()
  // «Recarga»: la actualización pendiente sigue en el respaldo y se manda al volver.
  const b2 = baseConActualizar()
  const otra = crearColaEtiquetado({ enviar: b2.enviar, borrar: b2.borrar, actualizar: b2.actualizar, almacen: a })
  otra.iniciar()
  assert.deepEqual([b2.actualizaciones[0].id, b2.actualizaciones[0].cambios], ['m', { segundo_fin: 108 }])
  b2.actualizaciones[0].ok(); await esperar()
  assert.deepEqual(a.leer(), [])
  // La fila ya no está (se borró): rechazo, no reintento eterno.
  assert.equal(clasificarResultado({ error: { code: 'PGRST116' } }, 'm'), 'rechazo')
  // Deshacer un alta que no salió se lleva sus actualizaciones.
  const b3 = baseConActualizar()
  const tercera = crearColaEtiquetado({ enviar: b3.enviar, borrar: b3.borrar, actualizar: b3.actualizar })
  tercera.agregar(registro('x', 5)); tercera.agregar({ ...registro('y', 6), segundo_fin: 20 })
  tercera.actualizar('y', { segundo_fin: 9 })
  tercera.cancelar('y')
  assert.deepEqual(tercera.getSnapshot().map((i) => i.id), ['x'])
})
