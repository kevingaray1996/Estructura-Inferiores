import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Plantel Premium: filtros, fotos, cancha, acciones y regreso sin servicios reales', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  function poner(n, v) { anteriores.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h, useContext, useState } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const jugadores = [
    { id: 'arq', nombre: 'Ana', apellido: 'Arquera', categoria_id: 'primera', posicion: 'Arquero', estado: 'disponible', foto_url: '/ana.png' },
    { id: 'def', nombre: 'Beatriz', apellido: 'Defensora', categoria_id: 'primera', posicion: 'Defensor central', posicion_secundaria: 'Delantero centro', estado: 'lesionado' },
    { id: 'lat', nombre: 'Carolina', apellido: 'Nombre muy largo '.repeat(8), categoria_id: 'primera', posicion: 'Lateral derecho', estado: 'suspendido', foto_url: '/rota.png' },
    { id: 'mc', nombre: 'Daniela', apellido: 'Mediocampo', categoria_id: 'primera', posicion: 'Mediocampista central', estado: 'no_disponible' },
    { id: 'reserva', nombre: 'Otra', apellido: 'Categoría', categoria_id: 'reserva', posicion: 'Arquero' },
  ]
  const stats = jugadores.map((j, i) => ({ jugador_id: j.id, minutos_jugados: 90 + i, goles: i, titular: true }))
  let errorCarga = null, sinJugadoras = false, demorar = false, pdf = 0
  const pendientes = [], consultas = [], perfiles = []
  poner('__plantelPremium', { from(tabla) {
    let singular = false; const filtros = []
    const q = { select(campos) { consultas.push({ tabla, campos, filtros }); return q }, order() { return q }, limit() { return q }, ilike() { return q },
      eq(k, v) { filtros.push([k, v]); return q }, in(k, v) { filtros.push([k, v]); return q },
      maybeSingle() { singular = true; return q },
      then(ok, mal) {
        let data = tabla === 'categorias' ? [{ id: 'primera', nombre: 'Primera División' }] : tabla === 'jugadores' ? sinJugadoras ? [] : jugadores : tabla === 'estadisticas_jugador' ? stats : []
        data = data.filter(r => filtros.every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
        const respuesta = { data: structuredClone(singular ? data[0] || null : data), error: tabla === 'jugadores' ? errorCarga : null }
        return (demorar && tabla === 'jugadores' ? new Promise(resolve => pendientes.push(() => resolve(respuesta))) : Promise.resolve(respuesta)).then(ok, mal)
      } }; return q
  } })
  poner('__plantelPDF', () => pdf++)
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'plantel-premium-mocks', enforce: 'pre',
    resolveId(s) {
      if (s.endsWith('/supabaseClient')) return '\0plantel-premium-db'
      if (s.endsWith('/generarPlantelPDF')) return '\0plantel-premium-pdf'
      if (s.endsWith('/PerfilJugador')) return '\0plantel-premium-perfil'
      if (s.endsWith('/AgregarJugador')) return '\0plantel-premium-alta'
      if (s.endsWith('/CargaMasiva')) return '\0plantel-premium-masiva'
    },
    load(id) {
      if (id === '\0plantel-premium-db') return 'export const supabase=globalThis.__plantelPremium'
      if (id === '\0plantel-premium-pdf') return 'export const generarPlantelPDF=globalThis.__plantelPDF'
      if (id === '\0plantel-premium-perfil') return `import React from 'react'; export default function Perfil(p){return React.createElement('div',null,'Perfil '+p.jugadorId,React.createElement('button',{onClick:p.onVolver},'Volver al listado'),React.createElement('button',{onClick:()=>p.onEditar(p.jugadorId)},'Editar perfil'));}`
      if (id === '\0plantel-premium-alta' || id === '\0plantel-premium-masiva') return `import React from 'react'; export default function Form(p){return React.createElement('div',null,'Formulario simulado',React.createElement('button',{onClick:p.onGuardado},'Finalizar sin guardar datos'));}`
    },
  }] })
  const root = createRoot(document.getElementById('root'))
  const botones = t => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === t)
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await Promise.resolve() }) }
  const ids = () => [...document.querySelectorAll('[data-jugadora-id]')].map(n => n.dataset.jugadoraId)
  const escribir = async valor => act(() => {
    const input = document.querySelector('#plantel-busqueda')
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, valor)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  try {
    const { default: Lista } = await server.ssrLoadModule('/src/components/ListaJugadores.jsx')
    const { default: Plantel } = await server.ssrLoadModule('/src/components/PlantelSection.jsx')
    const { default: Proveedor } = await server.ssrLoadModule('/src/appearance/ProveedorApariencia.jsx')
    const { ContextoApariencia } = await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    let nuevo = 0, masiva = 0, clave = 0
    function Ejemplo() {
      const { establecerPreferencia } = useContext(ContextoApariencia)
      return h('div', null, ...['claro', 'oscuro', 'sistema'].map(t => h('button', { key: t, onClick: () => establecerPreferencia(t) }, 'Tema ' + t)),
        h(Lista, { onSelectJugador: id => perfiles.push(id), onNuevoJugador: () => nuevo++, onCargaMasiva: () => masiva++ }))
    }
    await act(async () => { root.render(h(Proveedor, null, h(Ejemplo))); await Promise.resolve() })
    assert.deepEqual(ids(), ['arq', 'def', 'lat', 'mc'])
    assert.equal(document.querySelector('.plantel-portada-foto').getAttribute('src'), '/images/plantel/plantel-femenino-portada.jpg')
    assert.match(document.querySelector('#grupo-arqueras').parentElement.textContent, /ARQUERAS\(1\)/)
    const lecturasAntes = consultas.length
    const tabRendimiento = document.querySelector('[role="tab"][id$="rendimiento"]')
    await click(tabRendimiento)
    assert.equal(tabRendimiento.getAttribute('aria-selected'), 'true')
    assert.match(document.getElementById(tabRendimiento.getAttribute('aria-controls')).textContent, /Minutos acumulados/)
    for (const area of ['comparativas', 'rankings', 'evolucion', 'formaciones']) {
      const tab = document.querySelector(`[role="tab"][id$="${area}"]`)
      await click(tab)
      assert.equal(document.getElementById(tab.getAttribute('aria-controls')).hidden, false)
    }
    assert.equal(consultas.length, lecturasAntes, 'Los paneles ocultos y la navegación no repiten consultas')
    assert.equal(consultas.some(c => c.tabla === 'analisis_eventos'), false, 'El motor de lectura no se conecta todavía a producción')
    await click(document.querySelector('[role="tab"][id$="jugadoras"]'))
    await act(() => document.querySelector('[data-jugadora-id="arq"]').focus())
    assert.equal(document.activeElement.dataset.jugadoraId, 'arq')
    assert.equal(document.querySelector('[data-jugadora-id="def"] img'), null)
    assert.match(document.querySelector('[data-jugadora-id="def"]').textContent, /BD/)
    await act(() => document.querySelector('[data-jugadora-id="lat"] img').dispatchEvent(new window.Event('error')))
    assert.equal(document.querySelector('[data-jugadora-id="lat"] img'), null)
    assert.match(document.querySelector('[data-jugadora-id="lat"]').textContent, /Nombre muy largo/)
    assert.equal(document.querySelector('[data-jugadora-id="arq"] dl'), null)
    assert.match(document.querySelector('[data-jugadora-id="arq"]').textContent, /ARQ/)
    assert.doesNotMatch(document.querySelector('[data-jugadora-id="arq"]').textContent, /Minutos|Goles|Titularidades/)
    assert.equal(document.querySelector('[data-jugadora-id="reserva"]'), null)
    await click(botones('Delanteras')[0]); assert.deepEqual(ids(), ['def'], 'Incluye la posición secundaria')
    for (const tema of ['claro', 'oscuro', 'sistema']) { await click(botones('Tema ' + tema)[0]); assert.deepEqual(ids(), ['def']) }
    await click(botones('Limpiar filtros')[0]); assert.equal(ids().length, 4)
    await click(botones('No disponibles')[0]); assert.deepEqual(ids(), ['lat', 'mc'])
    await click(botones('Limpiar filtros')[0])
    await escribir('Beatriz'); assert.deepEqual(ids(), ['def'])
    await click(botones('Limpiar filtros')[0]); await escribir('imposible')
    assert.equal(ids().length, 0); assert.match(document.body.textContent, /No hay jugadoras para mostrar/)
    await click(botones('Limpiar filtros')[0])
    await click(document.querySelector('[data-jugadora-id="arq"]')); assert.equal(perfiles.at(-1), 'arq')
    await click(document.querySelector('[role="tab"][id$="rendimiento"]'))
    await click(document.querySelector('[role="tab"][id$="formaciones"]'))
    assert.equal(document.querySelector('[role="tab"][id$="formaciones"]').getAttribute('aria-selected'), 'true')
    const cancha = botones('4-4-2')[0].closest('section')
    const puestos = () => [...cancha.querySelectorAll('button[title]')].map(n => n.title).sort()
    const iniciales = puestos()
    await click(botones('4-2-3-1')[0]); assert.equal(botones('4-2-3-1')[0].getAttribute('aria-pressed'), 'true')
    await click(botones('4-4-2')[0]); assert.deepEqual(puestos(), iniciales)
    assert.match(cancha.textContent, /No representa una convocatoria oficial/)
    await click(botones('↓ Descargar PDF')[0]); assert.equal(pdf, 1)
    await click(botones('+ Nueva jugadora')[0]); await click(botones('Carga masiva')[0]); assert.equal(nuevo, 1); assert.equal(masiva, 1)
    assert.equal(document.querySelector('[data-jugadora-id]').tagName, 'BUTTON')
    assert.ok(consultas.filter(q => q.tabla === 'jugadores').every(q => q.filtros.some(([k, v]) => k === 'categoria_id' && v === 'primera')))
    const montar = async props => act(async () => { root.render(h(Plantel, { key: ++clave, ...props })); await Promise.resolve() })
    let consumidos = 0
    await montar({ jugadorInicialId: 'def', onConsumirJugadorInicial() { consumidos++ } })
    assert.match(document.body.textContent, /Perfil def/); assert.equal(consumidos, 1)
    await click(botones('Editar perfil')[0]); assert.match(document.body.textContent, /Formulario simulado/)
    await click(botones('Finalizar sin guardar datos')[0]); assert.match(document.body.textContent, /Perfil def/)
    await click(botones('Volver al listado')[0]); assert.equal(ids().length, 4)
    await escribir('Beatriz')
    await click(document.querySelector('[data-jugadora-id="def"]'))
    await click(botones('Volver al listado')[0])
    assert.equal(document.querySelector('#plantel-busqueda').value, 'Beatriz')
    assert.deepEqual(ids(), ['def'], 'Volver del perfil conserva la búsqueda de la galería')
    sinJugadoras = true; await montar({}); assert.equal(ids().length, 0)
    assert.match(document.body.textContent, /No hay jugadoras para mostrar/)
    sinJugadoras = false; errorCarga = { code: '42501' }; await montar({})
    assert.match(document.querySelector('[role="alert"]').textContent, /No se pudo cargar el plantel/)
    errorCarga = null; demorar = true; await montar({})
    assert.match(document.querySelector('[role="status"]').textContent, /Cargando plantel/)
    demorar = false; await act(async () => { pendientes.forEach(fn => fn()); await Promise.resolve() })
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, d] of anteriores) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
  }
})
