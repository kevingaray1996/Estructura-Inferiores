import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PLANTEL as P, textoPlantel, fondoEstadoPlantel, tintePlantel } from '../src/appearance/plantel.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const vars = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = vars(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...vars(css.slice(css.indexOf('@media screen'))) }
function resolver(valor, paleta) {
  const m = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/.exec(valor)
  return m ? resolver(paleta[m[1]] ?? m[2], paleta) : valor
}
const lum = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

test('Plantel y Perfil conservan sus superficies oscuras y comparten paleta clara institucional', () => {
  for (const [key, expected] of Object.entries({ fondoLista: '#101115', tarjetaLista: '#191B21', fondoPerfil: '#101010', tarjetaPerfil: '#202020', bordePerfil: '#383838', amarilloPerfil: '#F6C900', primario: '#4ADE80' })) assert.equal(resolver(P[key], oscuro), expected)
  for (const [key, expected] of Object.entries({ fondoLista: '#F5F5F2', fondoPerfil: '#F5F5F2', tarjetaLista: '#FFFFFF', tarjetaPerfil: '#FFFFFF', textoLista: '#111111', textoPerfil: '#111111', secundarioPerfil: '#666666', bordePerfil: '#DEDEDE', amarilloLista: '#F2C230', amarilloPerfil: '#F2C230', primario: '#F2C230' })) assert.equal(resolver(P[key], claro), expected)
})

test('Textos de estados y acentos son legibles sobre tarjetas claras y sus insignias', () => {
  for (const value of ['#4ADE80', '#F87171', '#FBBF24', '#7DD3FC', '#FB923C', '#A1A1AA', '#F4D21F', P.amarilloPerfil]) {
    const text = resolver(textoPlantel(value), claro)
    for (const bg of ['#FFFFFF', '#F5F5F2']) assert.ok(contraste(text, bg) >= 4.5, value)
  }
  for (const [text, bg] of [['#4ADE80', '#163627'], ['#F87171', '#402326'], ['#FBBF24', '#40351B'], ['#A1A1AA', '#292B32']]) assert.ok(contraste(resolver(textoPlantel(text), claro), resolver(fondoEstadoPlantel(bg), claro)) >= 4.5)
  assert.ok(contraste(resolver(P.primario, claro), resolver(P.sobrePrimario, claro)) >= 4.5)
  assert.equal(tintePlantel('#4ADE80', '18'), '#4ADE8018')
  assert.match(tintePlantel(P.secundarioPerfil, '18'), /^color-mix\(/)
})

test('Pantallas y formularios con datos simulados; informes independientes del tema', async () => {
  const { createServer } = await import('vite')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const jugadora = { id: 'prueba', nombre: 'Ana', apellido: 'Prueba', estado: 'no_disponible', posicion: 'Arquero', categorias: { nombre: 'Primera' } }
  const fixture = JSON.stringify(jugadora)
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{
      name: 'plantel-solo-datos-simulados', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0plantel-supabase-simulado' },
      load(id) { if (id === '\0plantel-supabase-simulado') return `export const supabase = { from() { throw Error('No se permiten consultas'); } };` },
      transform(code, id) {
        // Solo el modulo de prueba recibe datos; no se editan archivos ni se ejecutan efectos.
        if (id.endsWith('/PerfilJugador.jsx')) return code.replace('const [jugador, setJugador] = useState(null)', `const [jugador, setJugador] = useState(${fixture})`)
        if (id.endsWith('/ListaJugadores.jsx')) return code.replace('const [jugadores, setJugadores] = useState([])', `const [jugadores, setJugadores] = useState([${fixture}])`).replace('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)')
        if (id.endsWith('/EvaluacionesSection.jsx')) return code.replace('const [sel, setSel] = useState(null)', `const [sel, setSel] = useState(${fixture})`).replace('const [form, setForm] = useState(null)', "const [form, setForm] = useState({puntajes: {}, fortalezas: '', a_mejorar: '', comentario: '', recomendacion: '', proyeccion: ''})") + '\nexport { PanelEvaluar, Visor, htmlInforme, htmlPlantel };'
      },
    }],
  })
  const render = (component, props = {}) => renderToStaticMarkup(createElement(component, props))
  try {
    for (const nombre of ['PlantelSection', 'ListaJugadores', 'AgregarJugador', 'CargaMasiva', 'PdfPerfilModal', 'PerfilJugador', 'EvaluacionesSection']) {
      const { default: Component } = await server.ssrLoadModule(`/src/components/${nombre}.jsx`)
      const html = render(Component, { jugador: jugadora, perfil: { rol: 'coordinacion' } })
      assert.match(html, /var\(--(?:plantel|ui)-/, nombre)
      assert.doesNotMatch(html, /var\([^;]+\)(?:18|55|66)/, nombre)
      if (nombre === 'ListaJugadores') { assert.match(html, /Ana/); assert.match(html, /No disponible/); assert.match(html, /#194D38/); assert.match(html, /text-white/); }
      if (nombre === 'PerfilJugador') { assert.match(html, /Prueba, Ana/); assert.match(html, /color-mix/); assert.match(html, /Descargar PDF del perfil/); }
      if (nombre === 'AgregarJugador') assert.match(html, /ui-control/)
      if (nombre === 'PdfPerfilModal') assert.match(html, /type="checkbox"/)
    }
    const ev = await server.ssrLoadModule('/src/components/EvaluacionesSection.jsx')
    const panel = render(ev.PanelEvaluar, { tipo: 'final', perfil: { nombre: 'Prueba' }, user: { id: 'prueba' }, jugadores: [jugadora], criterios: [{id: 'tecnica', nombre: 'Tecnica'}], evals: [] })
    assert.match(panel, /--ui-superficie/)
    assert.match(panel, /--evaluaciones-control-fondo/)
    assert.match(panel, /No evalúo/)
    const visor = render(ev.Visor, { visor: { titulo: 'Prueba', html: '<p>Documento</p>' } })
    assert.match(visor, /background:var\(--ui-superficie/)
    for (const doc of [ev.htmlPlantel({ jugadores: [jugadora], criterios: [], evals: [], stats: [], escudo: '', anio: 2026 }), ev.htmlInforme({ j: jugadora, criterios: [], evals: [], nombresEval: {}, stats: [], escudo: '', modo: 'final', anio: 2026 })]) {
      assert.match(doc, /background:#111/)
      assert.match(doc, /#F2C230/)
      assert.doesNotMatch(doc, /var\(--|data-apariencia/)
    }
  } finally { await server.close() }
})
