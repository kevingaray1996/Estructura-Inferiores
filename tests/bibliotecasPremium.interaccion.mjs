import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { nuevaPizarra } from '../src/utils/pizarra.js'
import { crearServidorVitePrueba } from './helpers/servidorVite.mjs'
const { JSDOM } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

async function pantalla(nombre, prueba) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' }), prev = new Map()
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']) { prev.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: n === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[n], writable: true, configurable: true }) }
  const { createElement: h, act } = await import('react'), { createRoot } = await import('react-dom/client')
  const doc = nuevaPizarra(), registros = [], estado = { error: null, demorar: false, liberar: null, pizarras: [] }
  const tablas = { categorias: [{ id: 'c', nombre: 'Primera' }], jugadores: [{ id: 'j', nombre: 'Sintética', apellido: 'Prueba', categorias: { nombre: 'Primera' }, categoria_id: 'c' }], partidos: [{ id: 'p', rival: 'Rival sintético', fecha: '2026-11-01' }],
    biblioteca: [{ id: 'e', fecha: '2026-11-01', contenido: 'Pases', descripcion: 'Circuito de pase y apoyo', cantidad_jugadores: 8, imagen_url: '/ejercicio-sintetico.jpg', link_video: 'https://youtu.be/abc123def45?t=23', pizarra: doc, pizarra_revision: 3 }],
    videos: [{ id: 'v', tipo: 'colectivo', fecha: '2026-11-01', descripcion: 'Partido sintético', categoria_id: 'c', categorias: { nombre: 'Primera' }, momento: 'Postpartido', url: 'https://www.youtube.com/watch?v=abc123def45&t=23', partidos: { rival: 'Rival sintético' } }],
  }
  const cliente = { rpc: async (nombre, args) => { registros.push({ rpc: nombre, args }); return { data: { id: args.p_id || 'copia' }, error: null } }, from(tabla) {
    let op = 'select', payload, singular = false; const filtros = []
    const q = { select() { return q }, eq(k, v) { filtros.push([k, v]); return q }, order() { return q }, single() { singular = true; return q }, insert(v) { op = 'insert'; payload = v; return q }, update(v) { op = 'update'; payload = v; return q }, delete() { op = 'delete'; return q }, then(ok, mal) {
      registros.push({ tabla, op, payload: structuredClone(payload), filtros })
      let data = (tablas[tabla] || []).filter(f => filtros.every(([k, v]) => f[k] === v)), error = ['biblioteca', 'videos'].includes(tabla) ? estado.error : null
      if (op !== 'select' && !error) { if (op === 'insert') { data = [{ id: 'nuevo', ...payload }]; tablas[tabla].push(...data) } if (op === 'update') data.forEach(f => Object.assign(f, payload)); if (op === 'delete') tablas[tabla] = tablas[tabla].filter(f => !data.includes(f)) }
      const respuesta = { data: error ? null : singular ? data[0] : structuredClone(data), error }
      if (op === 'select' && tabla === 'videos' && filtros.some(([k, v]) => k === 'tipo' && v === 'colectivo') && estado.demorar) return new Promise(r => { estado.liberar = () => r(respuesta) }).then(ok, mal)
      return Promise.resolve(respuesta).then(ok, mal)
    } }; return q
  } }
  globalThis.__bibliotecasPremium = { cliente, doc, estado }
  dom.window.confirm = () => true
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'bibliotecas-sinteticas', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0bibliotecas-db'; if (s.endsWith('/PizarraEjercicio')) return '\0bibliotecas-pizarra'; if (s.endsWith('/EstadisticasEquipo')) return '\0bibliotecas-estadisticas' }, load(id) {
    if (id === '\0bibliotecas-db') return 'export const supabase=globalThis.__bibliotecasPremium.cliente'
    if (id === '\0bibliotecas-pizarra') return `import {createElement as h} from 'react';export default function P(p){globalThis.__bibliotecasPremium.estado.pizarras.push(p);return h('button',{type:'button',onClick:()=>p.onChange?.(globalThis.__bibliotecasPremium.doc,'')},p.soloLectura?'Ver ejercicio':'Abrir pizarra táctica')}`
    if (id === '\0bibliotecas-estadisticas') return `import {createElement as h} from 'react';export default function E(){return h('p',null,'Estadísticas de equipo conservadas')}`
  } }] })
  const root = createRoot(document.getElementById('root')); let key = 0
  const C = (await vite.ssrLoadModule(`/src/components/${nombre}.jsx`)).default
  const render = async props => act(async () => { root.render(h(C, { key: ++key, ...props })); await Promise.resolve() })
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await Promise.resolve() }) }
  const escribir = async (el, v) => { assert.ok(el); await act(async () => { const tipo = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement : el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement : dom.window.HTMLInputElement; Object.getOwnPropertyDescriptor(tipo.prototype, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }) }
  const boton = t => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t))
  const control = texto => [...document.querySelectorAll('label.av-campo')].find(l => l.firstElementChild?.textContent === texto)?.querySelector('input,select,textarea')
  try { await prueba({ render, click, escribir, boton, control, registros, estado, tablas, act, doc }) }
  finally { await act(() => root.unmount()); await vite.close(); dom.window.close(); delete globalThis.__bibliotecasPremium; for (const [n, d] of prev) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] } }
}

test('Biblioteca (antes Entrenamientos): edición con revisión, búsqueda, duplicación, alta, pizarra y planificación', async () => pantalla('BibliotecaSection', async ({ render, click, escribir, boton, estado, registros }) => {
  let plan = 0
  await render({ perfil: { rol: 'coordinacion' }, onPlanificar: () => plan++ })
  assert.ok(document.querySelector('img[src$="banner_entrenamientos.jpg"]'))
  assert.ok(document.querySelector('img[src="/ejercicio-sintetico.jpg"]') || document.querySelector('.bib-tarjeta svg'), 'tarjeta con su vista')
  await click(boton('▦ Entrenamientos')); assert.equal(plan, 1)
  const campo = texto => [...document.querySelectorAll('label.bib-campo')].find(l => l.firstElementChild?.textContent === texto)?.querySelector('input,select,textarea')
  await escribir(campo('Buscar'), 'no coincide')
  assert.ok(document.querySelector('[data-estado="vacio"]'))
  await escribir(campo('Buscar'), '')
  await click(document.querySelector('[aria-label="Editar Pases"]'))
  assert.equal(campo('Nombre').value, 'Pases')
  assert.equal(campo('Descripción y consignas').value, 'Circuito de pase y apoyo')
  assert.equal(campo('Jugadoras').value, '8')
  await escribir(campo('Descripción y consignas'), 'Edición sintética')
  await click(boton('Guardar'))
  const guardar = registros.find(r => r.rpc)
  assert.equal(guardar.rpc, 'guardar_ejercicio_pizarra'); assert.equal(guardar.args.p_id, 'e'); assert.equal(guardar.args.p_revision, 3)
  assert.equal(guardar.args.p_datos.descripcion, 'Edición sintética'); assert.ok(guardar.args.p_datos.pizarra, 'conserva la pizarra')
  await click(document.querySelector('[aria-label="Duplicar Pases"]'))
  assert.equal(campo('Nombre').value, 'Pases (copia)')
  await click(boton('Guardar'))
  assert.equal(registros.filter(r => r.rpc).at(-1).args.p_id, null)
  await click(boton('+ Nuevo ejercicio o jugada'))
  await escribir(campo('Nombre'), 'Ejercicio nuevo sin pizarra')
  await click(boton('Guardar'))
  const alta = registros.filter(r => r.rpc).at(-1).args
  assert.equal(alta.p_id, null); assert.equal(alta.p_datos.contenido, 'Ejercicio nuevo sin pizarra'); assert.equal(alta.p_datos.ambito, 'cancha')
  await click(document.querySelector('[aria-label="Eliminar Pases"]'))
  assert.ok(registros.some(r => r.tabla === 'biblioteca' && r.op === 'delete'))
  estado.error = { code: '42501' }; await render({ perfil: { rol: 'coordinacion' } })
  assert.ok(document.querySelector('[data-estado="denegado"]')); assert.equal(document.querySelector('[data-estado="vacio"]'), null)
}))

test('Video Premium: enlaces y miniaturas, filtros, categorías, formularios y lecturas tardías', async () => pantalla('VideoSection', async ({ render, click, escribir, boton, control, registros, estado, tablas, act }) => {
  const perfil = { rol: 'coordinacion' }
  tablas.videos.push({ id: 'externo', tipo: 'colectivo', fecha: '2026-10-01', descripcion: 'Enlace de otro proveedor', url: 'https://example.invalid/clip?t=30' })
  await render({ perfil })
  assert.ok(document.querySelector('img[src$="banner_videoanalisis.jpg"]'))
  const enlace = document.querySelector('.av-video-enlace')
  assert.equal(enlace.getAttribute('href'), 'https://www.youtube.com/watch?v=abc123def45&t=23')
  assert.equal(enlace.target, '_blank'); assert.equal(enlace.querySelector('button'), null)
  assert.ok(enlace.querySelector('img[src="https://i.ytimg.com/vi/abc123def45/hqdefault.jpg"]'))
  const externo = document.querySelector('a[href="https://example.invalid/clip?t=30"]')
  assert.ok(externo.querySelector('.av-reproducir'))
  assert.equal(externo.querySelector('img'), null, 'No se inventa una miniatura para otro proveedor')
  await click(document.querySelector('[aria-label="Eliminar video Enlace de otro proveedor"]'))
  assert.equal(tablas.videos.some(v => v.id === 'externo'), false)
  await click(boton('Nuevo video')); await escribir(control('Link de YouTube'), 'https://youtu.be/abc123def45?t=12')
  await escribir(document.querySelector('.av-form-campos select'), 'c')
  await escribir(control('Partido (opcional)'), 'p')
  await escribir(control('Descripción'), 'Nuevo colectivo')
  await click(boton('Guardar video'))
  assert.equal(registros.filter(r => r.tabla === 'videos' && r.op === 'insert').at(-1).payload.partido_id, 'p')
  assert.equal(registros.filter(r => r.tabla === 'videos' && r.op === 'insert').at(-1).payload.categoria_id, 'c')
  await escribir(control('Momento del análisis'), 'Prepartido')
  assert.ok(document.querySelector('[data-estado="vacio"]'))
  await click(boton('Individuales')); assert.ok(document.querySelector('[data-estado="vacio"]'))
  await click(boton('Nuevo video')); assert.ok(control('Jugadora')); await escribir(control('Jugadora'), 'j'); await escribir(control('Link de YouTube'), 'https://youtu.be/abc123def45?t=50'); await click(boton('Guardar video'))
  assert.equal(registros.filter(r => r.tabla === 'videos' && r.op === 'insert').at(-1).payload.jugador_id, 'j')
  await click(boton('Entrenamientos')); await click(boton('Nuevo video'))
  await escribir(control('Contenido'), 'Circuito'); await escribir(control('Link de YouTube'), 'https://youtu.be/abc123def45'); await click(document.querySelector('input[type="checkbox"]')); await click(boton('Guardar video'))
  assert.equal(tablas.biblioteca.at(-1).contenido, 'Circuito')
  await click(boton('Estadísticas')); assert.match(document.body.textContent, /Estadísticas de equipo conservadas/)
  estado.error = { code: '42501' }; await click(boton('Colectivos')); assert.ok(document.querySelector('[data-estado="denegado"]')); assert.equal(document.querySelector('[data-estado="vacio"]'), null)
  estado.error = null; estado.demorar = true; await render({ perfil })
  assert.ok(document.querySelector('[data-estado="cargando"]')); const liberar = estado.liberar
  await click(boton('Individuales'))
  await act(async () => { liberar(); await Promise.resolve() })
  assert.doesNotMatch(document.querySelector('.av-videos').textContent, /Partido sintético/)
  estado.demorar = false; await render({ perfil: { rol: 'tecnico', categoria_id: 'c', categorias: { nombre: 'Primera' } } })
  assert.equal(control('Categoría'), undefined, 'La categoría del técnico sigue bloqueada')
}))
