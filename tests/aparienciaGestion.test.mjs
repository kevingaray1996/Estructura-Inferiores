import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Entrenamientos (la pantalla vieja de la biblioteca) se reemplazó por Biblioteca (etapas D + G).
const nombres = ['Calendario', 'Biblioteca', 'Asistencia', 'Medicos', 'Nutricion', 'Psicologia', 'Captacion', 'Usuarios', 'Representantes', 'Pensiones', 'Contratos', 'PaseCategoria', 'ConvocatoriasSeleccion']
const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const variables = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = variables(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...variables(css.slice(css.indexOf('@media screen'))) }
const luminancia = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(luminancia(a), luminancia(b)) + .05) / (Math.min(luminancia(a), luminancia(b)) + .05)
// Los tokens de gestión son alias de --ui-*: se resuelven dentro del tema indicado.
const resolver = (token, paleta) => {
  const alias = /^var\((--[\w-]+)\)$/.exec(paleta[token] ?? '')
  return alias ? resolver(alias[1], paleta) : paleta[token]
}

test('Gestion usa el amarillo del club como botón principal en ambos temas', () => {
  for (const paleta of [oscuro, claro]) {
    assert.equal(resolver('--gestion-primario-fondo', paleta), '#f4c400')
    assert.equal(resolver('--gestion-primario-texto', paleta), '#141200')
    assert.ok(contraste(resolver('--gestion-primario-fondo', paleta), resolver('--gestion-primario-texto', paleta)) >= 4.5)
  }
})

test('Avisos, informacion, alertas y estados seleccionados tienen contraste legible en claro', () => {
  for (const token of ['--ui-texto-acento', '--gestion-info', '--gestion-aviso', '--ui-exito', '--ui-peligro']) {
    for (const fondo of ['#ffffff', '#f3f1e8']) assert.ok(contraste(resolver(token, claro), fondo) >= 4.5, token)
  }
  for (const token of ['--ui-exito', '--ui-peligro', '--ui-alerta']) assert.ok(contraste(resolver(token, claro), resolver('--gestion-estado-texto', claro)) >= 4.5, token)
  assert.ok(contraste(resolver('--ui-acento', claro), resolver('--gestion-estado-claro-texto', claro)) >= 4.5)
})

test('Los 13 modulos usan controles semanticos sin bordes literales invalidos', () => {
  for (const nombre of nombres) {
    const source = readFileSync(new URL(`../src/components/${nombre}Section.jsx`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /'\dpx solid COLORES\./, nombre)
    assert.match(source, /ui-control outline-none/, nombre)
    assert.doesNotMatch(source, /backgroundColor: COLORES.exito, color: COLORES.fondoPagina/, nombre)
    assert.doesNotMatch(source, /useApariencia|key=\{.*(?:tema|apariencia)/, nombre)
  }
})

test('Render de Gestion y Salud sin conexion a Supabase ni efectos de guardado', async () => {
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const { createServer: crearSocket } = await import('node:net')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const socket = crearSocket()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close((e) => e ? reject(e) : resolve()))
  const server = await createServer({
    server: { middlewareMode: true, hmr: { port } }, appType: 'custom',
    plugins: [{
      name: 'gestion-sin-backend', enforce: 'pre',
      resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0gestion-supabase-simulado' },
      load(id) { if (id === '\0gestion-supabase-simulado') return `export const supabase = { from() { throw Error('No se permiten consultas'); } };` },
    }],
  })
  try {
    for (const nombre of nombres) {
      const { default: Componente } = await server.ssrLoadModule(`/src/components/${nombre}Section.jsx`)
      const html = renderToStaticMarkup(createElement(Componente, { perfil: { rol: 'coordinacion' }, onVolver() {} }))
      // Estas dos pantallas ahora heredan los tokens del contenedor Premium,
      // en lugar de necesitar un color inline en el primer render.
      assert.match(html, ['Captacion', 'Usuarios'].includes(nombre) ? /class="dp-gestion"/ : /--ui-texto/, nombre)
      assert.match(html, /<h1/, nombre)
      assert.doesNotMatch(html, /solid COLORES\.|undefined/, nombre)
    }
    const { textoGestion, textoSobreEstado, BOTON_GESTION } = await server.ssrLoadModule('/src/appearance/gestion.js')
    const { COLORES } = await server.ssrLoadModule('/src/theme.js')
    assert.match(BOTON_GESTION.backgroundColor, /--gestion-primario-fondo/)
    assert.match(textoGestion(COLORES.acento), /--ui-texto-acento/)
    assert.match(textoGestion('#7DD3FC'), /--gestion-info/)
    assert.equal(textoGestion(COLORES.peligro), COLORES.peligro)
    assert.match(textoSobreEstado(COLORES.acento), /--gestion-estado-claro-texto/)
    assert.match(textoSobreEstado(COLORES.peligro), /--gestion-estado-texto/)
  } finally { await server.close() }
})
