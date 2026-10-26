import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ANALISIS as A, textoAnalisis } from '../src/appearance/analisis.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const vars = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = vars(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...vars(css.slice(css.indexOf('@media screen'))) }
function resolver(v, p) { const m = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/.exec(v); return m ? resolver(p[m[1]] ?? m[2], p) : v }
const lum = (h) => h.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

test('Analisis conserva las superficies oscuras y aplica la paleta clara institucional', () => {
  for (const [k, v] of Object.entries({fondo: '#0F1419', panel: '#151D29', control: '#202A38', activo: '#303B4D', borde: '#2A3548', texto: '#F0F2F5'})) assert.equal(resolver(A[k], oscuro), v)
  for (const [k, v] of Object.entries({fondo: '#F5F5F2', panel: '#FFFFFF', control: '#FFFFFF', borde: '#DEDEDE', texto: '#111111', secundario: '#666666'})) assert.equal(resolver(A[k], claro), v)
  assert.equal(resolver(claro['--analisis-editor-primario'], claro), '#F2C230')
  assert.equal(resolver(claro['--analisis-editor-sobre-primario'], claro), '#111111')
})

test('Textos de acciones, errores, avisos y editores tienen contraste sobre superficies claras', () => {
  for (const color of ['#F2C230', '#4ADE80', '#F87171', '#60A5FA']) for (const bg of ['#FFFFFF', '#F5F5F2']) assert.ok(contraste(resolver(textoAnalisis(color), claro), bg) >= 4.5)
  for (const token of ['--analisis-editor-texto', '--analisis-editor-secundario', '--analisis-editor-aviso', '--analisis-editor-error', '--analisis-editor-exito', '--analisis-editor-link']) assert.ok(contraste(resolver(claro[token], claro), '#FFFFFF') >= 4.5, token)
  assert.doesNotMatch(css, /!important|@media print/)
})

test('Cinco vistas internas y editores de pases con datos simulados, sin consultas ni escrituras', async () => {
  const { createServer } = await import('vite')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const j = {id: 'j', nombre: 'Ana', apellido: 'Prueba'}
  const p = {id: 'p', rival: 'Rival de prueba', fecha: '2026-10-26', video_url: 'https://www.youtube.com/watch?v=abc123def45', direccion_primer_tiempo: 'izquierda'}
  const evento = {id: 'e', partido_id: 'p', jugador_id: 'j', tipo: 'Pase correcto', segundo: 65, periodo: 1, resultado: 'Exitoso', coordenada_x: 20, coordenada_y: 50}
  const server = await createServer({server: {middlewareMode: true, hmr: {port}}, appType: 'custom', plugins: [{
    name: 'analisis-solo-datos-simulados', enforce: 'pre',
    resolveId(source) {if (source.endsWith('/supabaseClient')) return '\0analisis-supabase-simulado'},
    load(id) {if (id === '\0analisis-supabase-simulado') return `export const supabase = {from() {throw Error('No se permiten consultas');}};`},
    transform(code, id) {
      const path = id.replaceAll('\\', '/')
      if (path.endsWith('/AnalisisSection.jsx')) {
        code = code.replace('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replace('const [esAdmin, setEsAdmin] = useState(false)', 'const [esAdmin, setEsAdmin] = useState(true)').replace("const [partidoId, setPartidoId] = useState('')", "const [partidoId, setPartidoId] = useState('p')").replace('const [partidos, setPartidos] = useState([])', `const [partidos, setPartidos] = useState([${JSON.stringify(p)}])`).replace('const [jugadoras, setJugadoras] = useState([])', `const [jugadoras, setJugadoras] = useState([${JSON.stringify(j)}])`).replace('const [eventos, setEventos] = useState([])', `const [eventos, setEventos] = useState([${JSON.stringify(evento)}])`).replace("const [seccion, setSeccion] = useState('video')", 'const [seccion, setSeccion] = useState(seccionPrueba)')
        return code + "\nlet seccionPrueba = 'video'; export function cambiarSeccionPrueba(v) {seccionPrueba = v;} export {CanchaInteractiva, CanchaInformePDF};"
      }
      if (path.endsWith('/DetalleDestinatariaPase.jsx')) return code.replace('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replace('const [datos, setDatos] = useState(null)', `const [datos, setDatos] = useState({opciones: [${JSON.stringify(j)}], aviso: 'Aviso de prueba'})`)
      if (path.endsWith('/DetalleDestinoPase.jsx')) return code.replace('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replace('const [ficha, setFicha] = useState(null)', "const [ficha, setFicha] = useState({detalle: {destino_x: 80, destino_y: 50, destinataria_estado: 'desconocida'}})")
    },
  }]})
  const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props))
  try {
    const mod = await server.ssrLoadModule('/src/components/AnalisisSection.jsx')
    for (const vista of ['video', 'explorador', 'estadisticas', 'mapa', 'informe']) {
      mod.cambiarSeccionPrueba(vista)
      const html = render(mod.default)
      assert.match(html, /--analisis-panel/, vista)
      assert.match(html, /Rival de prueba/, vista)
      if (vista === 'video') {assert.match(html, /<iframe/); assert.match(html, /abc123def45/); assert.match(html, /Pase/)}
      if (vista === 'explorador') {assert.match(html, /Destinataria/); assert.match(html, /Abrir el video en este momento/)}
      if (vista === 'mapa') assert.match(html, /#176344/)
      if (vista === 'informe') {assert.match(html, /id="informe-imprimible"/); assert.match(html, /@media print/); assert.match(html, /Informe técnico de partido/)}
    }
    const props = {evento, partido: p, autora: 'Ana Prueba', puedeEditar: true, onClose() {}, onVideo() {}, renderCancha: (props) => createElement(mod.CanchaInteractiva, props)}
    const {default: Destinataria} = await server.ssrLoadModule('/src/components/DetalleDestinatariaPase.jsx')
    const destinataria = render(Destinataria, props)
    assert.match(destinataria, /analisis-editor-destinataria/)
    assert.match(destinataria, /analisis-control ui-control/)
    assert.match(destinataria, /analisis-aviso/)
    assert.match(destinataria, /Ir al video/)
    const {default: Destino} = await server.ssrLoadModule('/src/components/DetalleDestinoPase.jsx')
    const destino = render(Destino, props)
    assert.match(destino, /analisis-editor-destino/)
    assert.match(destino, /analisis-primario/)
    assert.match(destino, /#176344/)
    assert.match(destino, /no se clasifica adelante/)
    for (const html of [destinataria, destino]) assert.doesNotMatch(html, /bg-slate-|text-slate-|text-amber-|text-red-/)
    const pdf = render(mod.CanchaInformePDF, {eventos: [evento]})
    assert.match(pdf, /#F8FAFC/)
    assert.match(pdf, /#4ADE80/)
    assert.doesNotMatch(pdf, /var\(--analisis/)
  } finally {await server.close()}
})
