import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nombres = ['Calendario', 'Entrenamientos', 'Asistencia', 'Medicos', 'Nutricion', 'Psicologia', 'Captacion', 'Usuarios', 'Representantes', 'Pensiones', 'Contratos', 'PaseCategoria', 'ConvocatoriasSeleccion']
const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
const variables = (s) => Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const oscuro = variables(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...variables(css.slice(css.indexOf('@media screen'))) }
const luminancia = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0)
const contraste = (a, b) => (Math.max(luminancia(a), luminancia(b)) + .05) / (Math.min(luminancia(a), luminancia(b)) + .05)

test('Gestion conserva botones oscuros y utiliza amarillo con texto negro en claro', () => {
  assert.equal(oscuro['--gestion-primario-fondo'], '#97C459')
  assert.equal(oscuro['--gestion-primario-texto'], '#1A1A18')
  assert.equal(claro['--gestion-primario-fondo'], '#F2C230')
  assert.equal(claro['--gestion-primario-texto'], '#111111')
  for (const paleta of [claro, oscuro]) assert.ok(contraste(paleta['--gestion-primario-fondo'], paleta['--gestion-primario-texto']) >= 4.5)
})

test('Avisos, informacion, alertas y estados seleccionados tienen contraste legible en claro', () => {
  for (const token of ['--ui-texto-acento', '--gestion-info', '--gestion-aviso', '--ui-exito', '--ui-peligro']) {
    for (const fondo of ['#FFFFFF', '#F5F5F2']) assert.ok(contraste(claro[token], fondo) >= 4.5, token)
  }
  for (const token of ['--ui-exito', '--ui-peligro']) assert.ok(contraste(claro[token], claro['--gestion-estado-texto']) >= 4.5)
  for (const fondo of ['#F2C230', '#7DD3FC', '#FB923C']) assert.ok(contraste(fondo, claro['--gestion-estado-claro-texto']) >= 4.5)
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
      assert.match(html, /--ui-texto/, nombre)
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
