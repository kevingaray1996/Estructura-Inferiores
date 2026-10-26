import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WELLNESS as W, textoWellness } from '../src/appearance/wellness.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const vars = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = vars(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...vars(css.slice(css.indexOf('@media screen'))) }
function resolver(v, p) { const m = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/.exec(v); return m ? resolver(p[m[1]] ?? m[2], p) : v }
const lum = (h) => h.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

test('Wellness conserva la paleta oscura y adapta superficies, controles y cabeceras claras', () => {
  for (const [k, expected] of Object.entries({ fondo: '#191917', tarjeta: '#242422', borde: '#393934', texto: '#F4F2EA', exito: '#97C459', peligro: '#E77970' })) assert.equal(resolver(W[k], oscuro), expected)
  for (const [k, expected] of Object.entries({ fondo: '#F5F5F2', tarjeta: '#FFFFFF', borde: '#DEDEDE', texto: '#111111', secundario: '#666666', acento: '#F2C230', controlOscuro: '#FFFFFF', panel: '#FFFFFF', tab: '#FFFFFF', primario: '#F2C230' })) assert.equal(resolver(W[k], claro), expected)
})

test('Ejes, textos, lineas y niveles de riesgo mantienen contraste legible en claro', () => {
  for (const color of [W.texto, W.secundario, W.muted, W.exito, W.peligro, W.advertencia, textoWellness(W.acento)]) for (const bg of [W.fondo, W.tarjeta, W.filaAlternativa]) assert.ok(contraste(resolver(color, claro), resolver(bg, claro)) >= 4.5, color)
  assert.equal(resolver(textoWellness(W.acento), oscuro), '#F2C230')
  assert.ok(contraste(resolver(W.primario, claro), '#171715') >= 4.5)
})

test('Acceso publico comparte el proveedor existente y no fija un tema independiente', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const publico = readFileSync(new URL('../src/components/BienestarPublico.jsx', import.meta.url), 'utf8')
  assert.match(main, /<ProveedorApariencia[^>]*><App\s*\/>/)
  assert.match(app, /return <BienestarPublico/)
  assert.doesNotMatch(publico, /data-apariencia|matchMedia|localStorage|key=\{.*(?:tema|apariencia)/)
  for (const name of ['FisicoSection', 'CargaWellness', 'BienestarComparativo', 'BienestarPublico', 'CicloComparativo']) {
    const source = readFileSync(new URL(`../src/components/${name}.jsx`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /focus-visible:ui-control/, name)
    assert.match(source, /ui-control/, name)
  }
})

test('Render de cinco interfaces con datos simulados, grafico y acceso publico sin sesion', async () => {
  const { createServer } = await import('vite')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const j = { id: 'j', nombre: 'Ana', apellido: 'Prueba' }
  const fixture = JSON.stringify(j)
  const resumen = JSON.stringify(['alerta', 'moderado', 'normal'].map((nivel, i) => ({jugador: {...j, id: `j${i}`}, respuestas: 3, promedioSemanal: 3, promedioMensual: 3, nivel})))
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{ name: 'wellness-sin-backend', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0wellness-supabase-simulado' },
      load(id) { if (id === '\0wellness-supabase-simulado') return `export const supabase = { from() { throw Error('No se permiten consultas'); } };` },
      transform(code, id) {
        const path = id.replaceAll('\\', '/')
        if (!/src\/components\/(?:FisicoSection|CargaWellness|BienestarComparativo|BienestarPublico|CicloComparativo)\.jsx$/.test(path)) return
        code = code.replaceAll("useState(esTecnico ? perfil.categoria_id : '')", "useState('cat')").replaceAll('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replaceAll('const [categoria, setCategoria] = useState(null)', "const [categoria, setCategoria] = useState({id: 'cat', nombre: 'Primera'})").replaceAll('const [jugadores, setJugadores] = useState([])', `const [jugadores, setJugadores] = useState([${fixture}])`)
        if (path.endsWith('/CicloComparativo.jsx')) code = code.replace('const [jugadoras, setJugadoras] = useState([])', `const [jugadoras, setJugadoras] = useState([${fixture}])`).replace('const [fases, setFases] = useState({})', "const [fases, setFases] = useState({j: 'menstrual'})")
        if (path.endsWith('/BienestarComparativo.jsx')) code = code.replace('const [resumenGeneral, setResumenGeneral] = useState([])', `const [resumenGeneral, setResumenGeneral] = useState(${resumen})`) + '\nexport { MiniLinea };'
        if (path.endsWith('/BienestarPublico.jsx')) code = code.replace('const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)', 'const [jugadorSeleccionado, setJugadorSeleccionado] = useState(jugadoraPrueba)').replace("const [vista, setVista] = useState('bienestar')", 'const [vista, setVista] = useState(vistaPrueba)') + `\nlet jugadoraPrueba = null; let vistaPrueba = 'bienestar'; export function seleccionarPrueba(vista) { jugadoraPrueba = ${fixture}; vistaPrueba = vista; }`
        return code
      },
    }],
  })
  const render = (Component) => renderToStaticMarkup(createElement(Component, { perfil: { rol: 'coordinacion' } }))
  try {
    for (const name of ['FisicoSection', 'CargaWellness', 'BienestarComparativo', 'BienestarPublico', 'CicloComparativo']) {
      const module = await server.ssrLoadModule(`/src/components/${name}.jsx`)
      const html = render(module.default)
      assert.match(html, /var\(--(?:wellness|ui)-/, name)
      if (name === 'FisicoSection') { assert.match(html, /--wellness-cabecera/); assert.match(html, /--wellness-control-oscuro/); }
      if (name === 'CargaWellness') { assert.match(html, /min="1"/); assert.match(html, /max="5"/); assert.match(html, /Prueba, Ana/); }
      if (name === 'BienestarComparativo') {
        for (const text of ['Alerta', 'Moderado', 'Normal']) assert.match(html, new RegExp(text))
        const graph = renderToStaticMarkup(createElement(module.MiniLinea, { serie: [{fecha: '2026-10-26', valor: 3}], escalaMax: 5, color: W.acento }))
        assert.match(graph, /stroke="var\(--ui-texto-acento/)
        assert.match(graph, /fill="var\(--wellness-muted/)
      }
      if (name === 'BienestarPublico') {
        assert.match(html, /Prueba, Ana/)
        for (const view of ['bienestar', 'rpe']) { module.seleccionarPrueba(view); const form = render(module.default); assert.match(form, /Hola, Ana/); assert.match(form, /--ui-texto-sobre-acento/); assert.match(form, /<button/); }
      }
      if (name === 'CicloComparativo') { assert.match(html, /Menstrual/); assert.match(html, /--ui-texto-acento/); }
    }
  } finally { await server.close() }
})
