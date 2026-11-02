import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const base = '62a21ea33cde9059931e2f91d78bf8bd841832bb'
const leer = p => readFileSync(p, 'utf8').replaceAll('\r', '')
const antes = p => execFileSync('git', ['show', `${base}:${p}`], { encoding: 'utf8' }).replaceAll('\r', '')

test('Bibliotecas Premium conservan escrituras, filtros, reproducción por enlace y pizarra', () => {
  for (const n of ['EntrenamientosSection', 'VideoSection']) {
    const p = `src/components/${n}.jsx`, a = antes(p), b = leer(p)
    const inicio = n === 'EntrenamientosSection' ? '  function abrirNuevo()' : '  function cambiarTipo(t)'
    const fin = n === 'EntrenamientosSection' ? '\n  return (' : '  const videosFiltrados ='
    const bloque = s => s.slice(s.indexOf(inicio), s.lastIndexOf(fin))
    assert.equal(bloque(b), bloque(a), 'Handlers y payloads idénticos: ' + n)
    for (const re of [/\.from\('[^']+'\)/g, /\.select\('[^']*'\)/g, /\.rpc\('[^']+'/g]) assert.deepEqual(b.match(re), a.match(re), n)
  }
  // La referencia espacial de Analisis cambia en la entrega de orientacion;
  // su catalogo se conserva y su comportamiento tiene regresiones especificas.
  const catalogo = s => s.slice(s.indexOf('const TIPOS ='), s.indexOf('const inputClass ='))
  assert.equal(catalogo(leer('src/components/AnalisisSection.jsx')), catalogo(antes('src/components/AnalisisSection.jsx')))
  const entrenamiento = leer('src/components/EntrenamientosSection.jsx')
  const pizarras = s => s.match(/<PizarraEjercicio[^\n]+\/>/g)
  assert.deepEqual(pizarras(entrenamiento), pizarras(antes('src/components/EntrenamientosSection.jsx')))
  assert.match(leer('src/components/VideoSection.jsx'), /href=\{v.url\}/)
  for (const p of ['src/components/PizarraTactica.jsx', 'src/components/EstadisticasEquipo.jsx', 'src/components/EncabezadoFotografico.jsx', 'src/components/fotografiasClub.css']) assert.equal(leer(p), antes(p), p)
})

test('Fotografías Etapa 2: originales completos, rutas públicas y recurso de rival reservado', () => {
  const hashes = {
    'banner_entrenamientos.jpg': 'ed6e58b8372e12b0db4c44d536f8205b1a787d3fef196a5cfe2fcaa23ec878f4',
    'banner_videoanalisis.jpg': 'b9018d0e04f984413977678a954d49f7c62b31e9b3e2ddf4f0d2597fde0f2eda',
    'foto_analisis_rival_reserva.jpg': '77ef38e0c0a071bb819197081f9802a7d1580a074c03a5c59c5cb2bc7654fdb2',
  }
  for (const [n, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(`public/images/fotos-comunicaciones/${n}`)).digest('hex'), hash, n)
  for (const [n, foto] of [['EntrenamientosSection', 'banner_entrenamientos.jpg'], ['VideoSection', 'banner_videoanalisis.jpg']]) {
    assert.ok(leer(`src/components/${n}.jsx`).includes(`/images/fotos-comunicaciones/${foto}`))
    assert.doesNotMatch(leer(`src/components/${n}.jsx`), /foto_analisis_rival_reserva/)
  }
})

test('CSS audiovisual: temas, encuadres distintos, móvil y controles de pizarra aislados', () => {
  const css = leer('src/components/audiovisualPremium.css')
  assert.match(css, /club-foto-video-premium > img[^}]+object-fit: contain/)
  assert.match(css, /club-foto-entrenamientos-premium > img[^}]+object-position: 50% 49%/)
  assert.match(css, /linear-gradient/)
  assert.match(css, /max-width: 1100px/); assert.match(css, /max-width: 760px/); assert.match(css, /max-width: 480px/)
  assert.match(css, /minmax\(0, 1fr\)/); assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /data-apariencia=claro/); assert.match(css, /prefers-reduced-motion/)
  assert.doesNotMatch(css, /!important|@media print|\.pizarra\b|^\s*body\s*\{/m)
})
