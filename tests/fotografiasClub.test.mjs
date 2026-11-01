import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { crearServidorVitePrueba } from './helpers/servidorVite.mjs'

// SHA-256 de los originales entregados, sin depender de la carpeta Descargas.
const FOTOS = {
  'banderin-comunicaciones.jpeg': '70abafa67c4aa8ff24d407aa9f77db1a466f8e86f973c2d1e414e35a59cd335f',
  'cancha-torre-comunicaciones.jpeg': '55fcccbd38dc49692429413791469e0704c411600d2870c9d6a072df9cfca7ba',
  'camiseta-escudo-comunicaciones.jpeg': '08faae975701c8efe7f5f7f93307a99b6222a90d33d7fdc07e17872c4814d4bf',
  'pelotas-entrenamiento-comunicaciones.jpeg': 'da020b5ad52b369e2eaf996af4572dda1beca8021d050c609d61949b0e67f0ad',
  'plantel-femenino-comunicaciones.jpeg': '06886172c49565ea329f5efdc16a0282767f645dfebf731ae90b27041bf88aee',
}
const hash = datos => createHash('sha256').update(datos).digest('hex')

test('Fotografías: cinco rutas HTTP sirven exactamente los originales, sin transformaciones', async () => {
  const vite = await crearServidorVitePrueba({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const http = createServer(vite.middlewares)
  try {
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
    for (const [archivo, esperado] of Object.entries(FOTOS)) {
      const ruta = `/images/fotos-comunicaciones/${archivo}`
      const local = readFileSync(new URL(`../public${ruta}`, import.meta.url))
      assert.equal(hash(local), esperado)
      const respuesta = await fetch(`http://127.0.0.1:${http.address().port}${ruta}`)
      assert.equal(respuesta.status, 200, ruta)
      assert.match(respuesta.headers.get('content-type'), /image\/jpeg/)
      assert.equal(hash(Buffer.from(await respuesta.arrayBuffer())), esperado, ruta)
    }
  } finally { await new Promise(resolve => http.close(resolve)); await vite.close() }
})

test('Fotografías: encabezado accesible, acciones conservadas y estilos aislados de pantalla', async () => {
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Encabezado } = await vite.ssrLoadModule('/src/components/EncabezadoFotografico.jsx')
    const { createElement: h } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(h(Encabezado, { titulo: 'Partidos', imagen: '/images/fotos-comunicaciones/camiseta-escudo-comunicaciones.jpeg', descripcionImagen: 'Camiseta con escudo' }, h('button', { type: 'button' }, 'Nuevo partido')))
    assert.match(html, /<h1>Partidos<\/h1>/)
    assert.match(html, /alt="Camiseta con escudo"/)
    assert.match(html, /<button type="button">Nuevo partido<\/button>/)
    const css = readFileSync(new URL('../src/components/fotografiasClub.css', import.meta.url), 'utf8')
    assert.match(css, /@media screen/)
    assert.match(css, /max-width:600px/)
    assert.match(css, /linear-gradient/)
    assert.doesNotMatch(css, /!important|filter:|mix-blend-mode|@media print/)
    for (const archivo of ['PartidosSection', 'ListaPartidos', 'CalendarioSection']) {
      const contenido = readFileSync(new URL(`../src/components/${archivo}.jsx`, import.meta.url), 'utf8')
      assert.match(contenido, /EncabezadoFotografico/)
      assert.doesNotMatch(contenido, /banderin-comunicaciones|plantel-femenino-comunicaciones/)
    }
  } finally { await vite.close() }
})
