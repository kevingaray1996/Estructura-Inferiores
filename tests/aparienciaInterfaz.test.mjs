import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PALETA_INICIO, textoInicio } from '../src/appearance/paletaInicio.js'

const css = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
function variables(fragmento) {
  return Object.fromEntries([...fragmento.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const oscuro = variables(css.slice(0, css.indexOf('@media screen')))
const claro = { ...oscuro, ...variables(css.slice(css.indexOf('@media screen'))) }
function contraste(a, b) {
  const luminancia = (hex) => {
    const canales = hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return canales[0] * 0.2126 + canales[1] * 0.7152 + canales[2] * 0.0722
  }
  const valores = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (valores[0] + 0.05) / (valores[1] + 0.05)
}

test('Inicio mantiene paleta oscura y transparencias de los colores originales', () => {
  const original = { fondo:'#101010', tarjeta:'#1B1B1B', tarjetaHover:'#232323', borde:'#303030',
    amarillo:'#F6C900', amarilloSuave:'#332B00', blanco:'#FAFAFA', gris:'#B5B5B5', tenue:'#858585', verde:'#72C58B', rojo:'#F07171' }
  for (const [key, color] of Object.entries(original)) {
    const token = /^var\((--[\w-]+), (#[\da-fA-F]+)\)$/.exec(PALETA_INICIO[key])
    if (token) { assert.equal(oscuro[token[1]], color); assert.equal(token[2], color) }
    else assert.equal(PALETA_INICIO[key], color)
  }
  assert.equal(`${PALETA_INICIO.amarillo}35`, '#F6C90035')
  assert.equal(oscuro['--inicio-escudo-opacidad'], '0.025')
  assert.equal(oscuro['--inicio-escudo-filtro'], 'none')
  assert.equal(textoInicio('#123456'), '#123456')
})

test('modo claro conserva amarillo institucional y contraste de textos principales y activos', () => {
  assert.equal(claro['--ui-acento'], '#F2C230')
  for (const [texto, fondo] of [
    ['--ui-nav-activo-texto', '--ui-nav-activo-fondo'],
    ['--ui-texto', '--ui-fondo-sidebar'], ['--ui-texto-acento', '--ui-fondo-sidebar'],
    ['--inicio-texto', '--inicio-tarjeta'], ['--inicio-secundario', '--inicio-tarjeta'],
    ['--inicio-tenue', '--inicio-tarjeta'], ['--inicio-texto-acento', '--inicio-tarjeta'],
    ['--inicio-texto-exito', '--inicio-tarjeta'], ['--inicio-texto-peligro', '--inicio-tarjeta'],
  ]) assert.ok(contraste(claro[texto], claro[fondo]) >= 4.5, `${texto} / ${fondo}`)
  assert.ok(Number(claro['--inicio-escudo-opacidad']) > Number(oscuro['--inicio-escudo-opacidad']))
})

test('Inicio reutiliza el escudo decorativo y no introduce una clave de remontaje por tema', () => {
  const inicio = readFileSync(new URL('../src/components/InicioSection.jsx', import.meta.url), 'utf8')
  assert.match(inicio, /src=\{ESCUDO_CLUB_URL\}\s+alt=""\s+aria-hidden="true"/)
  const estilosInicio = readFileSync(new URL('../src/components/inicio.css', import.meta.url), 'utf8')
  assert.match(inicio, /className="inicio-marca"/)
  assert.match(estilosInicio, /pointer-events: none/)
  assert.match(estilosInicio, /--inicio-escudo-opacidad/)
  assert.doesNotMatch(inicio, /key=\{(?:tema|preferencia|apariencia)/)
  assert.ok(css.indexOf('--inicio-escudo-filtro: grayscale') > css.indexOf('@media screen'))
  assert.ok(!css.includes('@media print'))
})

test('selector usa el contexto existente, ofrece tres preferencias y variante compacta accesible', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  // Vite usa su puerto HMR por defecto cuando recibe 0; buscar uno libre evita
  // colisiones con la prueba SVG existente, que se ejecuta en otro worker.
  const { createServer: crearSocket } = await import('node:net')
  const socket = crearSocket()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const puerto = socket.address().port
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  const server = await createServer({server:{middlewareMode:true,hmr:{port:puerto}},appType:'custom'})
  try {
    const { default: Selector } = await server.ssrLoadModule('/src/appearance/SelectorApariencia.jsx')
    const { ContextoApariencia } = await server.ssrLoadModule('/src/appearance/contextoApariencia.js')
    for (const preferencia of ['claro', 'oscuro', 'sistema']) {
      const html = renderToStaticMarkup(createElement(ContextoApariencia.Provider,
        {value:{preferencia,establecerPreferencia:()=>{}}},createElement(Selector)))
      assert.match(html, new RegExp(`value="${preferencia}" selected=""`))
      assert.equal((html.match(/<option /g)||[]).length, 3)
      assert.match(html, /Automático \(según el dispositivo\)/)
      assert.match(html, /<label for="/)
    }
    const compacto = renderToStaticMarkup(createElement(ContextoApariencia.Provider,
      {value:{preferencia:'oscuro',establecerPreferencia:()=>{}}},createElement(Selector,{compacto:true})))
    assert.match(compacto, /<summary aria-label="Configurar apariencia"/)
    assert.match(compacto, /left-full/)
    assert.match(compacto, /md:hidden/)
  } finally { await server.close() }
})
