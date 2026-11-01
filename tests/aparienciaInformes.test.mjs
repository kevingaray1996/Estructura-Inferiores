import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tintePlantel } from '../src/appearance/plantel.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
test('Informes y resumen de Fisico usan superficies claras sin cambiar valores oscuros', () => {
  assert.match(css, /--informes-superficie: var\(--ui-superficie\)/)
  assert.match(css, /--wellness-resumen-fondo: var\(--ui-fondo-pagina\)/)
  const fisico = readFileSync(new URL('../src/components/FisicoSection.jsx', import.meta.url), 'utf8')
  assert.match(fisico, /backgroundColor: 'var\(--wellness-resumen-fondo, #1A1A18\)'/)
  const informes = readFileSync(new URL('../src/components/InformesAutomaticosSection.jsx', import.meta.url), 'utf8')
  assert.match(informes, /var\(--informes-superficie, #0A0A0A\)/)
  assert.doesNotMatch(css, /!important|@media print/)
})

test('Transparencias de Inicio admiten el estado sin ultimo resultado', () => {
  assert.equal(tintePlantel('#F6C900', '16'), '#F6C90016')
  assert.match(tintePlantel('var(--inicio-tenue, #858585)', '16'), /^color-mix\(/)
  const inicio = readFileSync(new URL('../src/components/InicioSection.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(inicio, /\$\{(?:color|colorUltimo|item\.accent)\}[\da-f]{2}/i)
  assert.match(inicio, /tintePlantel\(color, '16'\)/)
})

test('Informes conserva las consultas disponibles por rol y renderiza tablas y errores sin backend', async () => {
  const { createServer } = await import('vite')
  const { createServer: socketServer } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = socketServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const server = await createServer({server: {middlewareMode: true, hmr: {port}}, appType: 'custom', plugins: [{
    name: 'informes-solo-datos-simulados', enforce: 'pre',
    resolveId(source) {if (source.endsWith('/supabaseClient')) return '\0informes-supabase-simulado'},
    load(id) {if (id === '\0informes-supabase-simulado') return `export const supabase = {from() {throw Error('No se permiten consultas');}};`},
    transform(code, id) {
      const path = id.replaceAll('\\', '/')
      if (path.endsWith('/InicioSection.jsx')) return code + '\nexport { EtiquetaEstado };'
      if (!path.endsWith('/InformesAutomaticosSection.jsx')) return
      return code.replace('const [cargando, setCargando] = useState(true)', 'const [cargando, setCargando] = useState(false)').replace("const [consulta, setConsulta] = useState('minutos')", 'const [consulta, setConsulta] = useState(consultaPrueba)').replace("const [error, setError] = useState('')", 'const [error, setError] = useState(errorPrueba)').replace('const [jugadoras, setJugadoras] = useState([])', "const [jugadoras, setJugadoras] = useState([{id: 'j', nombre: 'Ana', apellido: 'Prueba'}, {id:'sin',nombre:'Sin',apellido:'Minutos'}])").replace('const [estadisticas, setEstadisticas] = useState([])', "const [estadisticas, setEstadisticas] = useState([{jugador_id:'j', minutos_jugados:90, goles:2, asistencias:1, partidos:{fecha:'2026-10-26'}}])").replace('const [fichasMedicas, setFichasMedicas] = useState([])', "const [fichasMedicas, setFichasMedicas] = useState([{jugador_id:'j', fecha:'2026-10-26', recuperado:false}])") + "\nlet consultaPrueba='minutos', errorPrueba=''; export function escenarioPrueba(c,e=''){consultaPrueba=c;errorPrueba=e;}"
    },
  }]})
  const render = (Component, rol) => renderToStaticMarkup(createElement(Component, {perfil:{rol}}))
  try {
    const module = await server.ssrLoadModule('/src/components/InformesAutomaticosSection.jsx')
    for (const consulta of ['minutos','sin_minutos','goles','medicos']) {
      module.escenarioPrueba(consulta)
      const html = render(module.default, 'coordinacion')
      assert.match(html, /--informes-superficie/)
      assert.match(html, /--ui-texto-acento/)
      assert.match(html, /<table/)
      assert.match(html, /ui-control/)
      assert.match(html, /@media print/)
      assert.match(html, consulta === 'sin_minutos' ? /Sin Minutos/ : /Ana Prueba/)
    }
    module.escenarioPrueba('minutos')
    assert.doesNotMatch(render(module.default, 'tecnico'), /Registros médicos activos/)
    for (const rol of ['medico','preparador_fisico']) {
      const html=render(module.default,rol)
      assert.match(html, /disponible para Coordinación y Cuerpo Técnico/)
      assert.doesNotMatch(html, /<table/)
    }
    module.escenarioPrueba('minutos','Error de prueba')
    assert.match(render(module.default,'coordinacion'), /--plantel-error-texto/)
    const {EtiquetaEstado} = await server.ssrLoadModule('/src/components/InicioSection.jsx')
    const etiqueta = renderToStaticMarkup(createElement(EtiquetaEstado,{color:'var(--inicio-tenue, #858585)'},'Sin resultado'))
    assert.match(etiqueta,/color-mix/)
    assert.doesNotMatch(etiqueta,/\)16|\)45/)
  } finally {await server.close()}
})
