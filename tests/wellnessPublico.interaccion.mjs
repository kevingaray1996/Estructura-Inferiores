import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

const cat = '10000000-0000-4000-8000-000000000001'
const ana = '30000000-0000-4000-8000-000000000001'
const bea = '30000000-0000-4000-8000-000000000002'

test('Wellness público: solo usa las funciones de la base, arranca vacío y conserva "ya completaste"', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/?bienestar=' + cat })
  const anteriores = new Map()
  function poner(k, v) { anteriores.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }) }
  for (const k of ['window', 'document', 'HTMLElement', 'Event', 'navigator']) poner(k, dom.window[k])
  poner('IS_REACT_ACT_ENVIRONMENT', true)

  const llamadas = [], tablas = []
  let lista = { nombre: 'Primera', jugadoras: [
    { id: ana, nombre: 'Ana', apellido: 'Alvarez', foto_url: null }, { id: bea, nombre: 'Bea', apellido: 'Benitez', foto_url: '/b.jpg' }] }
  const respondio = { [ana]: false, [bea]: true }
  poner('__wellnessPublicoDb', {
    from(tabla) { tablas.push(tabla); throw new Error('El formulario público no debe leer tablas: ' + tabla) },
    async rpc(nombre, args) {
      llamadas.push({ nombre, args })
      if (nombre === 'wellness_publico_categoria') return { data: lista, error: null }
      if (nombre === 'wellness_publico_respondio') return { data: respondio[args.p_jugadora_id], error: null }
      if (nombre === 'planificacion_publica_hoy') return { data: [], error: null }
      return { data: null, error: null }
    },
  })

  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'wellness-publico-db', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0wellness-publico-db' },
    load(id) { if (id === '\0wellness-publico-db') return 'export const supabase=globalThis.__wellnessPublicoDb' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const esperar = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }
  const botones = texto => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === texto)
  const tocar = async el => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await esperar() })
  const fila = nombre => [...document.querySelectorAll('div.cursor-pointer')].find(d => d.textContent.includes(nombre))
  try {
    const { default: Publico } = await server.ssrLoadModule('/src/components/BienestarPublico.jsx')
    await act(async () => { root.render(h(Publico, { categoriaId: cat })); await esperar() })
    assert.match(document.body.textContent, /Alvarez, Ana/)
    assert.match(document.body.textContent, /Benitez, Bea/)
    assert.deepEqual(llamadas[0], { nombre: 'wellness_publico_categoria', args: { p_categoria_id: cat } })

    // Ana no completó: el formulario arranca vacío.
    await tocar(fila('Alvarez'))
    assert.match(document.body.textContent, /Hola, Ana/)
    assert.deepEqual(llamadas.find(l => l.nombre === 'wellness_publico_respondio').args, { p_categoria_id: cat, p_jugadora_id: ana })
    await tocar(botones('Enviar')[0])
    assert.match(document.body.textContent, /Completá todas las preguntas/)
    for (const b of botones('3').slice(0, 5)) await tocar(b)
    await tocar(botones('Folicular')[0])
    await tocar(botones('Enviar')[0])
    const guardado = llamadas.find(l => l.nombre === 'wellness_publico_guardar')
    assert.deepEqual(guardado.args, { p_categoria_id: cat, p_jugadora_id: ana, p_sueno: 3, p_dolor_muscular: 3, p_fatiga: 3,
      p_estres: 3, p_animo_entrenar: 3, p_zona_dolor: null, p_fase_ciclo: 'folicular' })
    assert.match(document.body.textContent, /Ya se guardó tu bienestar de hoy/)

    // Corregir: vuelve a arrancar vacío.
    await tocar(botones('✏️ Editar mi respuesta')[0])
    await tocar(botones('Enviar')[0])
    assert.match(document.body.textContent, /Completá todas las preguntas/)
    assert.equal(llamadas.filter(l => l.nombre === 'wellness_publico_guardar').length, 1)

    // RPE: arranca vacío y solo manda el RPE.
    await tocar(botones('💪 Esfuerzo (RPE)')[0])
    await tocar(botones('Enviar')[0])
    assert.match(document.body.textContent, /Elegí un valor del 1 al 10/)
    await tocar(botones('7')[0])
    await tocar(botones('Enviar')[0])
    const rpe = llamadas.find(l => l.nombre === 'rpe_publico_guardar')
    assert.deepEqual(Object.keys(rpe.args).sort(), ['p_categoria_id', 'p_fecha', 'p_jugadora_id', 'p_rpe', 'p_tipo'])
    assert.equal(rpe.args.p_rpe, 7); assert.equal(rpe.args.p_tipo, 'entrenamiento'); assert.equal(rpe.args.p_jugadora_id, ana)
    assert.match(document.body.textContent, /Ya se guardó tu esfuerzo/)

    // Bea ya completó hoy: ve "ya completaste" sin ningún valor de su respuesta.
    await tocar(botones('← No soy yo')[0])
    await tocar(fila('Benitez'))
    assert.match(document.body.textContent, /Hola, Bea/)
    assert.match(document.body.textContent, /Ya se guardó tu bienestar de hoy/)

    // Link inválido.
    lista = null
    await act(async () => { root.render(h(Publico, { categoriaId: '10000000-0000-4000-8000-000000000009' })); await esperar() })
    assert.match(document.body.textContent, /Este link de Wellness no es válido/)

    assert.deepEqual(tablas, [], 'nunca se consulta una tabla')
  } finally {
    await act(async () => root.unmount())
    await server.close()
    for (const [k, d] of anteriores) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]
    delete globalThis.__wellnessPublicoDb
  }
})
