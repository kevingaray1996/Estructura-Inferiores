import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PARTIDOS as P } from '../src/appearance/partidos.js'
import { WELLNESS as W } from '../src/appearance/wellness.js'
import { textoPlantel } from '../src/appearance/plantel.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const vars = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = vars(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...vars(css.slice(css.indexOf('@media screen'))) }
function resolver(v, p) { const m = /^var\((--[\w-]+)(?:,\s*(.*))?\)$/.exec(v); return m ? resolver(p[m[1]] ?? m[2], p) : v }
const lum = (h) => h.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)

test('Carga, RPE y riesgo reutilizan superficies claras y preservan las oscuras', () => {
  assert.equal(resolver(W.filaAlternativa, oscuro), '#20201E')
  assert.equal(resolver(P.superficie, oscuro), '#1A2332')
  assert.equal(resolver(W.tarjeta, claro), '#FFFFFF')
  assert.equal(resolver(P.superficie, claro), '#FFFFFF')
  assert.equal(resolver('var(--cmj-fila, #1F1F1D)', claro), '#F5F5F2')
  assert.equal(resolver('var(--riesgo-detalle, #121A28)', claro), '#F5F5F2')
  assert.equal(resolver(W.primarioWellness, claro), '#F2C230')
})

test('Chips CMJ, RPE y textos del semaforo mantienen contraste en ambos temas', () => {
  for (const color of ['#4ADE80', '#FBBF24', '#F87171']) {
    assert.ok(contraste(color, '#0F1419') >= 4.5)
    assert.ok(contraste(resolver(textoPlantel(color), claro), '#FFFFFF') >= 4.5)
  }
  assert.ok(contraste('#7DD3FC', '#082F49') >= 4.5)
  for (const [bg, text] of [['#E24B4A', '#111111'], ['#97C459', '#1A1A1A'], ['#F2C230', '#1A1A1A'], [claro['--ui-peligro'], claro['--riesgo-chip-texto']], [claro['--ui-exito'], claro['--riesgo-chip-texto']]]) assert.ok(contraste(bg, text) >= 4.5)
})

test('Render de los seis componentes, alertas, chips y grafico con datos simulados', async () => {
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const j = { id: 'j', nombre: 'Ana', apellido: 'Prueba', posicion: 'Arquero' }
  const fixture = JSON.stringify(j)
  const historial = [{fecha: '2026-10-25', valor_cm: 32}, {fecha: '2026-10-26', valor_cm: 30}]
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{ name: 'riesgo-sin-backend', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0riesgo-supabase-simulado' },
      load(id) { if (id === '\0riesgo-supabase-simulado') return `export const supabase = { from() { throw Error('No se permiten consultas'); } };` },
      transform(code, id) {
        const path = id.replaceAll('\\', '/')
        if (!/src\/components\/(?:CargaEntrenamiento|RPEComparativo|CargaCMJ|CMJComparativo|SemaforoRiesgo|AlertasDatosFisicos)\.jsx$/.test(path)) return
        code = code.replaceAll('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replaceAll('const [categoria, setCategoria] = useState(null)', "const [categoria, setCategoria] = useState({id: 'cat', nombre: 'Primera'})").replaceAll('const [jugadores, setJugadores] = useState([])', `const [jugadores, setJugadores] = useState([${fixture}])`)
        if (path.endsWith('/AlertasDatosFisicos.jsx')) code = code.replace('useState({ wellness: [], carga: [], cmj: [] })', "useState({wellness: ['Prueba, Ana'], carga: ['Prueba, Ana'], cmj: ['Prueba, Ana']})").replace('const [abierto, setAbierto] = useState(false)', 'const [abierto, setAbierto] = useState(true)')
        if (path.endsWith('/SemaforoRiesgo.jsx')) code = code.replace('const [resultados, setResultados] = useState({})', "const [resultados, setResultados] = useState({j: {semaforo: 'amarillo', puntos: 3, cmj: {bajaConsecutiva: true}}})")
        if (path.endsWith('/CargaCMJ.jsx')) code = code.replace("const [mensaje, setMensaje] = useState('')", "const [mensaje, setMensaje] = useState('Listo, CMJ guardado.')")
        if (path.endsWith('/CMJComparativo.jsx')) code = code.replace('const [resumenGeneral, setResumenGeneral] = useState([])', `const [resumenGeneral, setResumenGeneral] = useState(${JSON.stringify(['normal', 'moderado', 'alerta'].map((nivel, i) => ({jugador: {...j, id: 'j'+i}, resultado: {nivel, ultimoValor: 30, porcentaje: 5}})))})`) + '\nexport { GraficoCMJ };'
        if (path.endsWith('/RPEComparativo.jsx')) code += '\nexport { EstadoChip };'
        return code
      },
    }],
  })
  const render = (Component, props = {}) => renderToStaticMarkup(createElement(Component, props))
  try {
    for (const name of ['CargaEntrenamiento', 'RPEComparativo', 'CargaCMJ', 'CMJComparativo', 'SemaforoRiesgo', 'AlertasDatosFisicos']) {
      const module = await server.ssrLoadModule(`/src/components/${name}.jsx`)
      const html = render(module.default, { incluirCargaYCmj: true })
      assert.match(html, /var\(--(?:wellness|ui|plantel|partidos)-/, name)
      assert.doesNotMatch(html, /var\([^;]+\)(?:18|35|40|50)/, name)
      if (name === 'CargaCMJ') { assert.match(html, /color-mix/); assert.match(html, /--riesgo-boton-texto/); assert.match(html, /Prueba, Ana/); }
      if (name === 'AlertasDatosFisicos') { assert.match(html, /datos insuficientes \(3\)/); assert.match(html, /menos de 15 respuestas/); assert.match(html, /menos de 2 mediciones/); }
      if (name === 'SemaforoRiesgo') { assert.match(html, /Amarillo \(3\)/); assert.match(html, /CMJ en baja consecutiva/); assert.match(html, /--plantel-aviso/); }
      if (name === 'RPEComparativo') {
        for (const [nivel, label] of [['normal', 'Normal'], ['moderado', 'Moderado'], ['alerta', 'Alerta']]) assert.match(render(module.EstadoChip, {resultado: {nivel}}), new RegExp(label))
        assert.match(render(module.EstadoChip, {resultado: {datosInsuficientes: true, cargaSemanal: 120}}), /Respaldo: 120/)
      }
      if (name === 'CMJComparativo') {
        for (const label of ['Normal', 'Moderado', 'Alerta']) assert.match(html, new RegExp(label))
        assert.match(html, /--riesgo-chip-texto, #111111/)
        const graph = render(module.GraficoCMJ, {historial})
        assert.match(graph, /stroke="var\(--ui-peligro/)
        assert.match(graph, /--ui-texto-muted/)
        assert.match(graph, /25\.10\.26/)
      }
    }
  } finally { await server.close() }
})
