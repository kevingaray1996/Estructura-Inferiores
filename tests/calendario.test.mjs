import test from 'node:test'
import assert from 'node:assert/strict'
import { cambiarMes, cargarEventosCalendario, matrizMes, normalizarEventos } from '../src/utils/calendario.js'
import { fechaArgentina } from '../src/utils/planificacion.js'

const cat = '10000000-0000-4000-8000-000000000001'
const otra = '10000000-0000-4000-8000-000000000002'
const sesion = { id: 'a', fecha: '2026-10-31', hora: '18:30:00', categoria_id: cat, tipo: 'entrenamiento', estado: 'borrador', objetivo: 'Pases', categorias: { nombre: 'Primera' } }

test('Fechas civiles argentinas y grilla completas, sin depender del huso del dispositivo', () => {
  assert.equal(fechaArgentina(new Date('2027-01-01T01:00:00Z')), '2026-12-31')
  assert.equal(cambiarMes('2026-12-31', 1), '2027-01-01')
  assert.equal(cambiarMes('2027-01-31', -1), '2026-12-01')
  const dias = matrizMes('2024-02-01').flat()
  assert.equal(dias[0].iso, '2024-01-28')
  assert.equal(dias.at(-1).iso, '2024-03-02')
  assert.equal(dias.filter(d => d.delMes).length, 29)
  assert.throws(() => matrizMes('2026-02-30'))
})

test('Tres fuentes, identidades independientes y horario sin conversiones', () => {
  const eventos = normalizarEventos({ partidos: [{ id: 'a', fecha: sesion.fecha, rival: 'Rival' }],
    videos: [{ id: 'a', fecha: sesion.fecha, contenido: 'Pases' }],
    planificaciones: [sesion, { ...sesion, id: 'b', estado: 'publicado', entrenamiento_real_id: 'real' }] })
  assert.equal(eventos.length, 4)
  assert.equal(new Set(eventos.map(e => e.id)).size, 4)
  const plan = eventos.filter(e => e.tipo === 'planificacion')
  assert.equal(plan.length, 2)
  assert.equal(plan[0].hora, '18:30')
  assert.equal(plan[1].entrenamientoRealId, 'real')
  assert.equal(eventos.find(e => e.id === 'video-a').tipo, 'video')
})

function cliente(fallos = {}) {
  const llamadas = []
  return { llamadas, from(tabla) {
    const llamada = { tabla, filtros: [] }; llamadas.push(llamada)
    const q = { select(campos) { llamada.campos = campos; return q },
      eq(k, v) { llamada.filtros.push([k, v]); return q }, gte(k,v) { llamada.filtros.push(['gte',k,v]); return q },
      lte(k,v) { llamada.filtros.push(['lte',k,v]); return q },
      then(ok, mal) { return Promise.resolve({ data: tabla === 'planificacion_sesiones' ? [sesion, { ...sesion, id:'otra', categoria_id:otra }] : [{ id:tabla, fecha:sesion.fecha }], error: fallos[tabla] }).then(ok, mal) } }
    return q
  } }
}

test('Lectura mínima, rango y restricción de categoría; sin operaciones de escritura', async () => {
  const c = cliente()
  const r = await cargarEventosCalendario(c, { rol:'tecnico', categoria_id:cat }, '2026-10-01','2026-10-31')
  assert.equal(r.eventos.filter(e => e.tipo === 'planificacion').length, 1)
  const q = c.llamadas.find(q => q.tabla === 'planificacion_sesiones')
  assert.ok(q.filtros.some(f => f[0] === 'categoria_id' && f[1] === cat))
  assert.doesNotMatch(q.campos, /\*|bloques|pizarra|observaciones|responsable/)
  assert.deepEqual(q.filtros.filter(f => f[0] !== 'categoria_id'), [['gte','fecha','2026-10-01'],['lte','fecha','2026-10-31']])
})

test('Roles no autorizados y PF sin categoría no consultan planificación; coordinación conserva todas', async () => {
  for (const perfil of [{ rol:'medico' }, { rol:'preparador_fisico', categoria_id:null }]) {
    const c = cliente(); await cargarEventosCalendario(c, perfil,'2026-10-01','2026-10-31')
    assert.equal(c.llamadas.some(q => q.tabla === 'planificacion_sesiones'), false)
  }
  const c = cliente()
  assert.equal((await cargarEventosCalendario(c,{rol:'coordinacion'},'2026-10-01','2026-10-31')).eventos.filter(e => e.tipo === 'planificacion').length, 2)
})

test('Un fallo no oculta otras fuentes; permisos se distinguen de conexión', async () => {
  for (const [code, mensaje] of [['42501', /no tiene acceso/], ['NETWORK', /conexión/]]) {
    const r = await cargarEventosCalendario(cliente({planificacion_sesiones:{code}}),{rol:'coordinacion'},'2026-10-01','2026-10-31')
    assert.equal(r.eventos.length, 2)
    assert.equal(r.errores.length, 1)
    assert.match(r.errores[0], mensaje)
  }
})
