import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fechaArgentina, sumarDias } from '../src/utils/planificacion.js'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Inicio: datos deportivos intactos, avisos, agenda por rol, DataFem sin recarga y Calendario contextual', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  function poner(n, v) { anteriores.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const hoy = fechaArgentina(), manana = sumarDias(hoy, 1), ayer = sumarDias(hoy, -1)
  const jugadores = Array.from({ length: 12 }, (_, i) => ({ id: 'j' + i, nombre: 'Ana', apellido: 'Jugadora ' + i,
    categoria_id: 'cat', estado: i < 5 ? 'lesionado' : 'disponible', fecha_nacimiento: hoy, categorias: { nombre: 'Primera' } }))
  let bienestar = jugadores.map((j, i) => ({ jugador_id: j.id, fecha: hoy, sueno: 1, dolor_muscular: 1,
    fatiga: i === 0 ? 5 : 1, estres: i < 10 ? 4 : 3, animo_entrenar: 1 }))
  const partidos = [
    { id: 'p1', fecha: ayer, rival: 'Rival anterior', local_visitante: 'local', goles_local: 2, goles_visitante: 1 },
    { id: 'p2', fecha: ayer, rival: 'Otro', local_visitante: 'visitante', goles_local: 3, goles_visitante: 1 },
    { id: 'p3', fecha: ayer, rival: 'Empate', local_visitante: 'local', goles_local: 0, goles_visitante: 0, penales_favor: 5, penales_contra: 4 },
    { id: 'futuro', fecha: manana, rival: 'Próximo rival', categoria_id: 'cat', hora: '17:00', categorias: { nombre: 'Primera' } },
  ]
  let sesiones = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, fecha: i === 4 ? manana : hoy, hora: '18:00', tipo: 'entrenamiento', estado: i ? 'publicado' : 'borrador', categoria_id: 'cat', objetivo: 'Actividad ' + i, categorias: { nombre: 'Primera' } }))
  const consultas = [], pendientes = []
  let errorAgenda = null, errorWellness = null, demorar = false
  poner('__inicioDB', { storage: { from() { return { getPublicUrl() { return { data: { publicUrl: '/logo.png' } } } } } }, from(tabla) {
    const filtros = []; let singular = false
    const q = { select(campos) { consultas.push({ tabla, campos, filtros }); return q }, order() { return q }, limit() { return q },
      not() { return q }, in() { return q }, ilike() { return q },
      eq(k, v) { filtros.push(['eq', k, v]); return q }, gte(k, v) { filtros.push(['gte', k, v]); return q },
      lte(k, v) { filtros.push(['lte', k, v]); return q }, lt(k, v) { filtros.push(['lt', k, v]); return q },
      maybeSingle() { singular = true; return q }, single() { singular = true; return q },
      then(ok, mal) {
        let data = tabla === 'jugadores' ? jugadores : tabla === 'partidos' ? partidos : tabla === 'planificacion_sesiones' ? sesiones :
          tabla === 'categorias' ? [{ id: 'cat', nombre: 'Primera', es_reserva: false }] : tabla === 'bienestar' ? bienestar :
          tabla === 'datafem_tablas' ? [{ id: 1, zona_a: [{ equipo: 'Comunicaciones', posicion: 3, puntos: 0 }], zona_b: [], general: [], updated_at: '2026-10-31T12:00:00Z' }] : []
        data = data.filter(r => filtros.every(([op, k, v]) => op === 'eq' ? r[k] === v : op === 'gte' ? r[k] >= v : op === 'lte' ? r[k] <= v : r[k] < v))
        const respuesta = { data: structuredClone(singular ? data[0] || null : data), error: tabla === 'planificacion_sesiones' ? errorAgenda : tabla === 'bienestar' ? errorWellness : null }
        return (demorar && tabla === 'planificacion_sesiones' ? new Promise(resolve => pendientes.push(resolve)) : Promise.resolve(respuesta)).then(ok, mal)
      } }; return q
  } })
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'inicio-local', enforce: 'pre',
    resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0inicio-db' },
    load(id) { if (id === '\0inicio-db') return 'export const supabase=globalThis.__inicioDB' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const botones = texto => [...document.querySelectorAll('button')].filter(b => b.textContent.includes(texto))
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await Promise.resolve() }) }
  let key = 0
  const render = async (C, props) => act(async () => { root.render(h(C, { key: ++key, ...props })); await Promise.resolve() })
  try {
    const { default: Inicio } = await server.ssrLoadModule('/src/components/InicioSection.jsx')
    const { default: Calendario } = await server.ssrLoadModule('/src/components/CalendarioSection.jsx')
    const destinos = [], planes = [], bienestarAbierto = [], perfil = { id: 'coord', rol: 'coordinacion' }
    await render(Inicio, { perfil, onCambiarSeccion: s => destinos.push(s), onVerPlanificacion: (...args) => planes.push(args), onVerBienestar: id => bienestarAbierto.push(id), onAbrirCalendario: (...args) => destinos.push(args) })
    const indicadores = [...document.querySelectorAll('.inicio-indicador strong')].map(n => n.textContent)
    assert.deepEqual(indicadores, ['3', '1', '1', '1', '3', '4', '-1'])
    assert.equal(document.querySelectorAll('.inicio-plantel-lista .inicio-fila').length, 3)
    assert.match(document.body.textContent, /5 lesionados activos/)
    assert.match(document.body.textContent, /Borrador/)
    assert.equal(document.querySelectorAll('.inicio-actividad').length, 6) // cuatro hoy, una mañana y el partido, sin duplicar hoy
    assert.equal(document.querySelectorAll('.inicio-hoy .inicio-actividad').length, 4)
    assert.equal(document.querySelectorAll('.inicio-proximas .inicio-actividad').length, 2)
    await click(botones('Actividad 4')[0]); assert.deepEqual(planes.at(-1), [manana, 'cat', 's4'])
    await click(botones('vs Próximo rival')[0]); assert.deepEqual(destinos.at(-1), [manana, 'cat'])
    await click(botones('Consultar partidos')[0]); assert.equal(destinos.at(-1), 'partidos')
    await click(botones('Consultar plantel')[0]); assert.equal(destinos.at(-1), 'plantel')
    await click(botones('Cumpleaños de la semana')[0]); assert.match(document.body.textContent, /¡Hoy!/)
    assert.equal(botones('Cumpleaños de la semana')[0].getAttribute('aria-expanded'), 'true')
    const wellness = document.querySelector('.inicio-wellness')
    assert.deepEqual([...wellness.querySelectorAll('.inicio-wellness-indicadores strong')].map(n => n.textContent), ['12','10','0','12'])
    assert.match(wellness.textContent, /Fatiga 5/)
    assert.equal(wellness.querySelectorAll('.inicio-seguimiento-fila').length, 10)
    await click(wellness.querySelector('.inicio-seguimiento-fila button')); assert.equal(bienestarAbierto.at(-1), 'j0')
    assert.match(wellness.textContent, /10 jugadoras con estrés alto hoy/)
    const lecturasPrevias = consultas.filter(q => q.tabla === 'bienestar').length
    await click(botones('Actualizar Wellness')[0])
    assert.equal(consultas.filter(q => q.tabla === 'bienestar').length, lecturasPrevias + 1)
    assert.equal(document.querySelectorAll('table').length, 0)
    const lecturasDataFem = consultas.filter(q => q.tabla === 'datafem_tablas').length
    await click(botones('Ver todas las posiciones')[0]); assert.match(document.body.textContent, /Comunicaciones/)
    assert.equal(document.querySelectorAll('table').length, 1)
    await click(botones('Contraer posiciones')[0]); assert.equal(document.querySelectorAll('table').length, 0)
    assert.equal(consultas.filter(q => q.tabla === 'datafem_tablas').length, lecturasDataFem)
    for (const rol of ['tecnico', 'preparador_fisico', 'medico']) {
      const inicioConsultas = consultas.length
      await render(Inicio, { perfil: { id: rol, rol, categoria_id: rol === 'preparador_fisico' ? null : 'cat' }, onCambiarSeccion: s => destinos.push(s) })
      const agenda = consultas.slice(inicioConsultas).filter(q => q.tabla === 'planificacion_sesiones')
      assert.equal(agenda.length, rol === 'tecnico' ? 1 : 0)
      assert.equal(document.querySelectorAll('.inicio-indicador').length, rol === 'medico' ? 0 : 7)
      if (rol === 'medico') {
        assert.equal(document.querySelectorAll('.inicio-seguimiento-fila').length, 0)
        assert.equal(consultas.slice(inicioConsultas).filter(q => q.tabla === 'bienestar').length, 0)
        await click(botones('Consultar Médicos')[0]); assert.equal(destinos.at(-1), 'medicos')
      }
    }
    errorWellness = { code: '42501' }
    await render(Inicio, { perfil, onCambiarSeccion() {} })
    assert.match(document.querySelector('.inicio-wellness').textContent, /no tiene acceso/)
    assert.equal(document.querySelectorAll('.inicio-wellness-indicadores strong').length, 0)
    assert.doesNotMatch(document.querySelector('.inicio-wellness').textContent, /Sin alertas registradas|Sin respuestas disponibles/)
    errorWellness = null; bienestar = []
    await render(Inicio, { perfil, onCambiarSeccion() {} })
    assert.match(document.querySelector('.inicio-wellness').textContent, /Sin respuestas disponibles/)
    assert.deepEqual([...document.querySelectorAll('.inicio-wellness-indicadores strong')].map(n => n.textContent), ['0','0','12','12'])
    const inicioOtra = consultas.length
    await render(Inicio, { perfil: { rol: 'tecnico', categoria_id: 'otra' }, onCambiarSeccion() {} })
    assert.equal(consultas.slice(inicioOtra).filter(q => q.tabla === 'bienestar').length, 0)
    assert.equal(document.querySelectorAll('.inicio-seguimiento-fila').length, 0)
    errorAgenda = { code: '42501' }
    await render(Inicio, { perfil, onCambiarSeccion() {} })
    assert.match(document.querySelector('[role="alert"]').textContent, /no tiene acceso/)
    assert.doesNotMatch(document.body.textContent, /Sin próximas actividades/)
    errorAgenda = null; demorar = true
    await render(Inicio, { perfil: { rol: 'tecnico', categoria_id: 'cat' }, onCambiarSeccion() {} })
    await render(Inicio, { perfil: { rol: 'tecnico', categoria_id: 'otra' }, onCambiarSeccion() {} })
    await act(async () => pendientes[0]({ data: sesiones, error: null }))
    assert.doesNotMatch(document.body.textContent, /Actividad 0/)
    await act(async () => pendientes[1]({ data: [], error: null }))
    demorar = false; sesiones = []
    let consumidos = 0
    await render(Calendario, { perfil, contextoInicial: { fecha: '2027-01-10', categoriaId: 'cat' }, onConsumirContexto() { consumidos++ } })
    assert.equal(consumidos, 1)
    assert.match(document.body.textContent, /Enero 2027/)
    assert.equal(document.querySelector('[aria-pressed="true"]').getAttribute('aria-label'), 'domingo, 10 de enero')
    await click(botones('Hoy')[0]); assert.doesNotMatch(document.querySelector('[aria-pressed="true"]').getAttribute('aria-label'), /10 de enero/)
    assert.ok(consultas.filter(q => q.tabla === 'planificacion_sesiones').every(q => !/bloques|notas|observaciones|pizarra/.test(q.campos)))
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, d] of anteriores) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
  }
})
