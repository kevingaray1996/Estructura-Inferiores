import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PARTIDOS as P, textoPartido } from '../src/appearance/partidos.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const vars = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = vars(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...vars(css.slice(css.indexOf('@media screen'))) }
function resolver(v, palette) { const m = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/.exec(v); return m ? resolver(palette[m[1]] ?? m[2], palette) : v }
const lum = (h) => h.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

test('Partidos conserva la paleta oscura y adopta superficies claras y botones institucionales', () => {
  for (const [key, expected] of Object.entries({ fondo: '#0F1419', superficie: '#1A2332', fila: '#151D2A', primario: '#4ADE80', sobrePrimario: '#0F1419' })) assert.equal(resolver(P[key], oscuro), expected)
  for (const [key, expected] of Object.entries({ fondo: '#F5F5F2', superficie: '#FFFFFF', texto: '#111111', secundario: '#666666', borde: '#DEDEDE', primario: '#F2C230', sobrePrimario: '#111111' })) assert.equal(resolver(P[key], claro), expected)
})

test('Resultados, advertencias, titulares y filas alternas mantienen contraste en claro', () => {
  for (const key of ['texto', 'secundario', 'tenue', 'exito', 'peligro', 'aviso', 'informacion']) for (const bg of [P.superficie, P.fila]) assert.ok(contraste(resolver(P[key], claro), resolver(bg, claro)) >= 4.5, key)
  assert.ok(contraste(resolver(P.primario, claro), resolver(P.sobrePrimario, claro)) >= 4.5)
  assert.equal(textoPartido('#FBBF24'), P.aviso)
  assert.equal(textoPartido('#8A9BB8'), P.secundario)
})

test('Render de partidos, convocatorias, Video y estadisticas sin acceso al backend', async () => {
  const { createServer } = await import('vite')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const partido = { id: 'p', rival: 'Rival de prueba', fecha: '2026-10-26', local_visitante: 'local', goles_local: 1, goles_visitante: 1 }
  const jugadora = { id: 'j', nombre: 'Ana', apellido: 'Prueba', estado: 'lesionado' }
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{ name: 'partidos-datos-simulados', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0partidos-supabase-simulado' },
      load(id) { if (id === '\0partidos-supabase-simulado') return `export const supabase = { from() { throw Error('No se permiten consultas'); } };` },
      transform(code, id) {
        if (!/src\/components\/(?:PartidosSection|AgregarPartido|ListaPartidos|ConvocarPartido|ComparativaJugadoras|EquiposSection|VideoSection|EstadisticasEquipo)\.jsx$/.test(id.replaceAll('\\', '/'))) return
        code = code.replaceAll('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)')
        if (id.endsWith('/ListaPartidos.jsx')) code = code.replace('const [partidos, setPartidos] = useState([])', `const [partidos, setPartidos] = useState([${JSON.stringify(partido)}])`)
        if (id.endsWith('/ConvocarPartido.jsx')) code = code.replace('const [partido, setPartido] = useState(null)', `const [partido, setPartido] = useState(${JSON.stringify(partido)})`).replace('const [jugadores, setJugadores] = useState([])', `const [jugadores, setJugadores] = useState([${JSON.stringify(jugadora)}])`).replace("const [tab, setTab] = useState('convocados')", 'const [tab, setTab] = useState(tabPrueba)') + "\nlet tabPrueba = 'convocados'; export function cambiarTabPrueba(valor) { tabPrueba = valor; }"
        if (id.endsWith('/ComparativaJugadoras.jsx')) code = code.replace('const [filas, setFilas] = useState([])', `const [filas, setFilas] = useState([{...${JSON.stringify(jugadora)}, partidos: 2, titularidades: 1, minutos: 90, goles: 1, asistencias: 2, amarillas: 1, rojas: 0}])`)
        if (id.endsWith('/VideoSection.jsx')) code = code.replace("const [tipo, setTipo] = useState('colectivo')", 'const [tipo, setTipo] = useState(tipoPrueba)').replace('const [videos, setVideos] = useState([])', "const [videos, setVideos] = useState([{id:'v', tipo:'colectivo', descripcion:'Video de prueba', url:'https://example.com/video'}])") + "\nlet tipoPrueba = 'colectivo'; export function cambiarTipoPrueba(valor) { tipoPrueba = valor; }"
        return code
      },
    }],
  })
  const render = (component) => renderToStaticMarkup(createElement(component, { categoriaNombre: 'Primera', perfil: { rol: 'coordinacion' } }))
  try {
    for (const nombre of ['PartidosSection', 'AgregarPartido', 'ListaPartidos', 'ConvocarPartido', 'ComparativaJugadoras', 'EquiposSection', 'VideoSection', 'EstadisticasEquipo']) {
      const module = await server.ssrLoadModule(`/src/components/${nombre}.jsx`)
      const html = render(module.default)
      assert.match(html, /var\(--(?:ui|plantel|gestion|partidos)-/, nombre)
      assert.doesNotMatch(html, /solid COLORES\.|var\([^;]+\)40/, nombre)
      if (nombre === 'ListaPartidos') { assert.match(html, /Empate \(1-1\)/); assert.match(html, /color-mix/); }
      if (nombre === 'ComparativaJugadoras') { assert.match(html, /Prueba, Ana/); assert.match(html, /--plantel-exito/); }
      if (nombre === 'VideoSection') {
        assert.match(html, /href="https:\/\/example.com\/video"/)
        assert.match(html, /Video de prueba/)
        for (const tipo of ['individual', 'entrenamiento', 'estadisticas']) { module.cambiarTipoPrueba(tipo); assert.match(render(module.default), /--gestion-primario/); }
      }
      if (nombre === 'ConvocarPartido') {
        assert.match(html, /Lesionado/)
        for (const tab of ['formacion', 'post', 'destacados']) { module.cambiarTabPrueba(tab); const h = render(module.default); assert.match(h, /Rival de prueba/); if (tab === 'formacion') assert.match(h, /#183A2A/); }
      }
    }
  } finally { await server.close() }
})
