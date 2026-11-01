import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const variables = (texto) => Object.fromEntries([...texto.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = variables(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...variables(css.slice(css.indexOf('@media screen'))) }

test('paleta clara exacta y consistente entre Layout, carga, Inicio y controles compartidos', () => {
  for (const [valor, tokens] of Object.entries({
    '#F5F5F2': ['--ui-fondo-pagina', '--ui-fondo-sidebar', '--ui-estado-fondo', '--inicio-fondo', '--ui-compartido-fondo'],
    '#FFFFFF': ['--ui-superficie', '--inicio-tarjeta', '--ui-compartido-superficie', '--login-control-fondo'],
    '#111111': ['--ui-texto', '--ui-texto-sobre-acento', '--inicio-texto', '--ui-estado-texto', '--ui-compartido-texto', '--login-control-texto', '--login-boton-texto'],
    '#666666': ['--ui-texto-secundario', '--inicio-secundario', '--ui-estado-secundario', '--ui-compartido-secundario', '--ui-compartido-tenue'],
    '#DEDEDE': ['--ui-borde', '--inicio-borde', '--ui-control-borde', '--ui-compartido-borde'],
    '#F2C230': ['--ui-acento', '--marca-amarillo', '--ui-nav-activo-fondo'],
  })) for (const token of tokens) assert.equal(claro[token], valor, token)
})

test('valores oscuros originales de Login y componentes compartidos no se invierten', () => {
  const esperados = {
    '--login-control-fondo': '#FFFFFF', '--login-control-texto': '#1A1A18', '--login-boton-texto': '#1A1A18',
    '--ui-compartido-fondo': '#0F1419', '--ui-compartido-superficie': '#1A2332',
    '--ui-compartido-texto': '#F0F2F5', '--ui-compartido-secundario': '#8A9BB8',
    '--ui-compartido-tenue': '#5B6B85', '--ui-compartido-borde': '#2A3548',
  }
  for (const [token, valor] of Object.entries(esperados)) assert.equal(oscuro[token], valor)
})

test('estilos interactivos estan acotados a controles compartidos y al medio pantalla', () => {
  assert.match(css, /@media screen\s*\{\s*\.ui-control:focus-visible/)
  assert.equal(claro['--ui-foco'], '#755600')
  assert.doesNotMatch(css, /!important|@media print/)
})

test('render compartido sin consultas: Login, busqueda, categoria y tabla DataFem', async () => {
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const { createServer: crearSocket } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = crearSocket()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{
      name: 'supabase-sin-conexiones-para-render', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0supabase-render-simulado' },
      load(id) {
        if (id === '\0supabase-render-simulado') return `export const supabase = {
          from() { throw new Error('No se permiten consultas en esta prueba'); },
          storage: { from() { return { getPublicUrl() { return { data: { publicUrl: '/escudo-de-prueba.png' } }; } }; } }
        };`
      },
    }],
  })
  try {
    const { default: Login } = await server.ssrLoadModule('/src/components/Login.jsx')
    const login = renderToStaticMarkup(createElement(Login))
    assert.match(login, /background-color:var\(--login-control-fondo/)
    assert.match(login, /color:var\(--login-boton-texto/)
    assert.match(login, /type="password"/)
    assert.match(login, /autoComplete="current-password"/i)
    const { default: Buscador } = await server.ssrLoadModule('/src/components/BuscadorGlobal.jsx')
    const buscador = renderToStaticMarkup(createElement(Buscador))
    assert.match(buscador, /--ui-compartido-superficie/)
    assert.match(buscador, /ui-control/)
    const { default: Categoria } = await server.ssrLoadModule('/src/components/CategoriaFiltro.jsx')
    const categoria = renderToStaticMarkup(createElement(Categoria, { bloqueada: true, categoriaNombre: 'Reserva', busqueda: 'Ana', onBusquedaChange: () => {} }))
    assert.match(categoria, /Reserva/)
    assert.match(categoria, /value="Ana"/)
    assert.doesNotMatch(categoria, /<select/)
    const libre = renderToStaticMarkup(createElement(Categoria, { categoriaId: '', busqueda: '', onCategoriaChange: () => {}, onBusquedaChange: () => {} }))
    assert.match(libre, /Todas las categorías/)
    const { TablaPosiciones } = await server.ssrLoadModule('/src/components/TablaDataFem.jsx')
    const tabla = renderToStaticMarkup(createElement(TablaPosiciones, { titulo: 'Zona B', destacarComunicaciones: true,
      filas: [{ equipo: 'Comunicaciones', posicion: 1, puntos: 30 }, { equipo: 'Otro equipo', posicion: 2, puntos: 25 }] }))
    assert.match(tabla, /★ /)
    assert.match(tabla, /--inicio-texto-acento/)
    assert.match(tabla, /--inicio-fondo/)
    assert.match(tabla, /Otro equipo/)
    const vacia = renderToStaticMarkup(createElement(TablaPosiciones, { titulo: 'General' }))
    assert.match(vacia, /No hay posiciones disponibles/)
  } finally { await server.close() }
})
