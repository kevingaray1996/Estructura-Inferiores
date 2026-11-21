import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { crearServidorVitePrueba } from './helpers/servidorVite.mjs'
const { JSDOM } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

async function conPantalla(nombre, comprobar) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test' }), anteriores = new Map()
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    anteriores.set(n, Object.getOwnPropertyDescriptor(globalThis, n))
    Object.defineProperty(globalThis, n, { value: n === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[n], configurable: true, writable: true })
  }
  const { createElement: h, act } = await import('react'), { createRoot } = await import('react-dom/client')
  const tablas = {
    categorias: [{ id: 'c1', nombre: 'Primera' }, { id: 'c2', nombre: 'Reserva' }],
    candidatos: [
      { id: 'a', nombre: 'Nombre largo de prueba', apellido: 'Apellido extenso sintético', categoria_probada_id: 'c1', categorias: { nombre: 'Primera' }, posicion: 'Defensa', fecha_prueba: '2026-11-01', estado: 'en_prueba', notas: 'Observación existente' },
      { id: 'b', nombre: 'Otra', apellido: 'Aceptada', categoria_probada_id: 'c2', categorias: { nombre: 'Reserva' }, estado: 'aceptado', jugador_id: null },
    ],
    perfiles: [{ email: 'pf.sintetico@invalid.test', nombre: 'Preparador de prueba con nombre largo', rol: 'preparador_fisico', categoria_id: 'c1', categorias: { nombre: 'Primera' }, cargo_pdf: 'Cargo existente', aparece_en_pdf: true, orden_pdf: 2, foto_url: '/foto-sintetica.jpg' }], jugadores: [],
  }
  const operaciones = [], estado = { errorLectura: null, errorGuardar: null, confirmacion: true, backups: 0, cargas: 0 }
  dom.window.confirm = () => estado.confirmacion
  dom.window.alert = mensaje => { throw Error(mensaje) }
  const objetoURL = URL.createObjectURL
  URL.createObjectURL = () => 'blob:foto-sintetica'
  globalThis.__gestionPremium = { backup: async () => { estado.backups++ }, cliente: {
    storage: { from: () => ({ upload: async () => { estado.cargas++; return { error: null } }, getPublicUrl: () => ({ data: { publicUrl: '/foto-subida-sintetica.jpg' } }) }) },
    from(tabla) {
      let modo = 'select', payload, singular = false; const filtros = []
      const q = { select() { return q }, order() { return q }, eq(k, v) { filtros.push([k, v]); return q }, single() { singular = true; return q }, insert(v) { modo = 'insert'; payload = v; return q }, update(v) { modo = 'update'; payload = v; return q }, delete() { modo = 'delete'; return q },
        then(ok, mal) {
          let data = tablas[tabla] || [], error = modo === 'select' ? estado.errorLectura : estado.errorGuardar
          const coincide = fila => filtros.every(([k, v]) => fila[k] === v)
          if (modo !== 'select') {
            operaciones.push({ tabla, modo, payload: structuredClone(payload), filtros })
            if (!error) {
              if (modo === 'insert') { const nueva = { id: `nuevo-${operaciones.length}`, ...payload }; tablas[tabla].push(nueva); data = [nueva] }
              if (modo === 'update') { data = data.filter(coincide); data.forEach(fila => Object.assign(fila, payload)) }
              if (modo === 'delete') { tablas[tabla] = data.filter(fila => !coincide(fila)); data = [] }
            }
          } else data = data.filter(coincide)
          return Promise.resolve({ data: error ? null : singular ? data[0] : structuredClone(data), error }).then(ok, mal)
        },
      }; return q
    },
  } }
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'gestion-premium-simulada', enforce: 'pre', resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0gestion-premium-db'; if (s.endsWith('/exportarBackup')) return '\0gestion-premium-backup' }, load(id) { if (id === '\0gestion-premium-db') return 'export const supabase=globalThis.__gestionPremium.cliente'; if (id === '\0gestion-premium-backup') return 'export const exportarBackupCompleto=globalThis.__gestionPremium.backup' } }] })
  const root = createRoot(document.getElementById('root'))
  let clave = 0
  const render = async props => act(async () => { const C = (await vite.ssrLoadModule(`/src/components/${nombre}.jsx`)).default; root.render(h(C, { key: ++clave, ...props })); await Promise.resolve() })
  const click = async el => { assert.ok(el, 'Control disponible'); await act(async () => { el.click(); await Promise.resolve() }) }
  const escribir = async (el, value) => { assert.ok(el); await act(async () => { const tipo = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement : el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement : dom.window.HTMLInputElement; Object.getOwnPropertyDescriptor(tipo.prototype, 'value').set.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }) }
  const boton = texto => [...document.querySelectorAll('button')].find(n => n.textContent.includes(texto))
  try { await comprobar({ dom, render, click, escribir, boton, estado, tablas, operaciones, act }) }
  finally { await act(() => root.unmount()); await vite.close(); URL.createObjectURL = objetoURL; dom.window.close(); delete globalThis.__gestionPremium; for (const [n, d] of anteriores) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] } }
}

test('Captación Premium: filtros, campos, edición, alta, conversión, borrado y mensajes conservados', async () => conPantalla('CaptacionSection', async ({ render, click, escribir, boton, estado, operaciones, tablas }) => {
  await render({ perfil: { rol: 'coordinacion' } })
  assert.equal(document.querySelector('h1').textContent, 'Captación')
  assert.equal(document.querySelectorAll('.dp-candidato').length, 2)
  await escribir(document.querySelector('input[placeholder="Buscar jugador..."]'), 'inexistente')
  assert.match(document.body.textContent, /Sin candidatos para estos filtros/)
  await escribir(document.querySelector('input[placeholder="Buscar jugador..."]'), '')
  await click(boton('Nuevo candidato'))
  assert.equal(document.querySelectorAll('#captacion-editor fieldset').length, 4)
  await click(boton('Guardar candidato'))
  assert.match(document.querySelector('[role="alert"]').textContent, /Completá nombre/)
  await escribir(document.querySelector('input[placeholder="Nombre"]'), 'Alta')
  await escribir(document.querySelector('input[placeholder="Apellido"]'), 'Sintética')
  await escribir(document.querySelector('#captacion-categoriaProbadaId'), 'c1')
  await escribir(document.querySelector('textarea'), 'Notas reales del fixture')
  document.documentElement.dataset.apariencia = 'claro'
  assert.equal(document.querySelector('input[placeholder="Nombre"]').value, 'Alta', 'Cambiar tema no remonta el formulario')
  document.documentElement.dataset.apariencia = 'oscuro'
  await click(boton('Guardar candidato'))
  assert.deepEqual(operaciones.at(-1).payload, { nombre: 'Alta', apellido: 'Sintética', fecha_nacimiento: null, posicion: null, categoria_probada_id: 'c1', fecha_prueba: operaciones.at(-1).payload.fecha_prueba, contacto_nombre: null, telefono_contacto: null, notas: 'Notas reales del fixture', estado: 'en_prueba' })
  await click(document.querySelector('button[aria-label^="Editar candidato Apellido"]'))
  assert.equal(document.querySelector('textarea').value, 'Observación existente')
  await escribir(document.querySelector('textarea'), 'Nota editada')
  await click(boton('Guardar cambios'))
  assert.equal(tablas.candidatos.find(c => c.id === 'a').notas, 'Nota editada')
  await click(boton('Pasar a plantel'))
  assert.equal(tablas.jugadores.length, 1)
  assert.ok(tablas.candidatos.find(c => c.id === 'b').jugador_id)
  estado.confirmacion = false
  const antes = operaciones.length
  await click(document.querySelector('button[aria-label^="Eliminar candidato"]'))
  assert.equal(operaciones.length, antes)
  estado.confirmacion = true
  await click(document.querySelector('button[aria-label^="Eliminar candidato"]'))
  assert.equal(tablas.candidatos.length, 2)
  await render({ perfil: { rol: 'tecnico', categoria_id: 'c1', categorias: { nombre: 'Primera' } } })
  await click(boton('Nuevo candidato'))
  assert.equal(document.querySelector('#captacion-categoriaProbadaId'), null, 'Categoría técnica permanece bloqueada')
  estado.errorLectura = { code: '42501' }
  await render({ perfil: { rol: 'coordinacion' } })
  assert.ok(document.querySelector('[data-estado="denegado"]'))
  assert.equal(document.querySelector('[data-estado="vacio"]'), null)
  estado.errorLectura = null
  await click(boton('Reintentar'))
  assert.ok(document.querySelector('.dp-candidato'))
}))

test('Usuarios Premium: roles/categoría, foto, citación, guardado, errores, backup y quitar acceso', async () => conPantalla('UsuariosSection', async ({ render, click, escribir, boton, estado, tablas, operaciones, act, dom }) => {
  await render()
  assert.ok(document.querySelector('img[src="/foto-sintetica.jpg"]'))
  await click(boton('Exportar backup'))
  // Etapa B: la herramienta de Excel se baja recién al tocar el botón; se espera a que termine.
  for (let i = 0; i < 200 && estado.backups !== 1; i++) await act(() => new Promise((r) => setTimeout(r, 25)))
  assert.equal(estado.backups, 1)
  await click(document.querySelector('button[aria-label^="Editar usuario"]'))
  assert.equal(document.querySelectorAll('#usuarios-editor fieldset').length, 3)
  assert.equal(document.querySelector('[aria-label="Categoría asignada"]').value, 'c1')
  await escribir(document.querySelector('input[placeholder="Nombre (opcional)"]'), 'Actualizado')
  await click(boton('Guardar cambios'))
  assert.equal(operaciones.at(-1).payload.categoria_id, 'c1')
  assert.equal(operaciones.at(-1).payload.orden_pdf, 2)
  await click(boton('Nuevo usuario'))
  const rol = [...document.querySelectorAll('select')].find(n => !n.hasAttribute('aria-label'))
  assert.deepEqual([...rol.options].map(o => o.value), ['coordinacion', 'medico', 'tecnico', 'preparador_fisico'])
  await click(boton('Guardar usuario'))
  assert.match(document.querySelector('[role="alert"]').textContent, /email es obligatorio/)
  await escribir(document.querySelector('input[type="email"]'), 'nuevo@invalid.test')
  await click(boton('Guardar usuario'))
  assert.match(document.querySelector('[role="alert"]').textContent, /necesita una categoría/)
  await escribir(document.querySelector('[aria-label="Categoría asignada"]'), 'c2')
  await escribir(document.querySelector('#usuarios-cargoPdf'), 'Cargo sintético')
  await click(document.querySelector('input[type="checkbox"]'))
  await escribir(document.querySelector('#usuarios-ordenPdf'), '3')
  const foto = document.querySelector('input[type="file"]')
  Object.defineProperty(foto, 'files', { value: [new dom.window.File(['sintética'], 'foto.png', { type: 'image/png' })], configurable: true })
  await act(() => foto.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
  assert.ok(document.querySelector('img[src="blob:foto-sintetica"]'))
  estado.errorGuardar = { code: '42501' }
  await click(boton('Guardar usuario'))
  assert.match(document.querySelector('[role="alert"]').textContent, /No tenés permiso/)
  assert.equal(document.querySelector('[aria-label="Categoría asignada"]').value, 'c2')
  estado.errorGuardar = null
  await click(boton('Guardar usuario'))
  assert.ok(estado.cargas > 0)
  assert.equal(tablas.perfiles.at(-1).foto_url, '/foto-subida-sintetica.jpg')
  assert.equal(tablas.perfiles.at(-1).cargo_pdf, 'Cargo sintético')
  assert.equal(tablas.perfiles.at(-1).aparece_en_pdf, true)
  await click(document.querySelector('button[aria-label^="Quitar acceso"]'))
  assert.equal(tablas.perfiles.length, 1)
  estado.errorLectura = { message: 'Fallo de conexión simulado' }
  await render()
  assert.ok(document.querySelector('[data-estado="error"]'))
  assert.equal(document.querySelector('[data-estado="vacio"]'), null)
  estado.errorLectura = null; tablas.perfiles = []
  await click(boton('Reintentar'))
  assert.ok(document.querySelector('[data-estado="vacio"]'))
}))
