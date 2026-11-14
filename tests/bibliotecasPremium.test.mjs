import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { soloLogica } from './helpers/soloLogica.mjs'
import { compararCatalogoAnalisis } from './helpers/catalogoReferencia.mjs'
const base = '62a21ea33cde9059931e2f91d78bf8bd841832bb'
const leer = p => readFileSync(p, 'utf8').replaceAll('\r', '')
const antes = p => execFileSync('git', ['show', `${base}:${p}`], { encoding: 'utf8' }).replaceAll('\r', '')

test('Bibliotecas Premium conservan escrituras, filtros, reproducción por enlace y pizarra', () => {
  // EntrenamientosSection se reemplazó por BibliotecaSection (etapas D + G; su comportamiento lo cubren
  // tests/biblioteca.test.mjs y bibliotecasPremium.interaccion.mjs). VideoSection conserva su lógica.
  for (const n of ['VideoSection']) {
    // Seguridad Storage (2026-11-13) cambió a propósito la subida: carpeta videos/ y sin reemplazar (upsert: false).
    const p = `src/components/${n}.jsx`, b = leer(p)
    const a = antes(p).replace("const nombreArchivo = `${Date.now()}-", "const nombreArchivo = `videos/${Date.now()}-").replace('upsert: true,', 'upsert: false,')
    const inicio = '  function cambiarTipo(t)'
    const fin = '  const videosFiltrados ='
    const bloque = s => s.slice(s.indexOf(inicio), s.lastIndexOf(fin))
    assert.equal(soloLogica(bloque(b)), soloLogica(bloque(a)), 'Handlers y payloads idénticos: ' + n)
    for (const re of [/\.from\('[^']+'\)/g, /\.select\('[^']*'\)/g, /\.rpc\('[^']+'/g]) assert.deepEqual(b.match(re), a.match(re), n)
  }
  // La referencia espacial de Analisis cambia en la entrega de orientacion;
  // su catalogo se conserva (ahora en catalogoAcciones.js) y su comportamiento tiene regresiones especificas.
  compararCatalogoAnalisis(leer('src/components/AnalisisSection.jsx'), antes('src/components/AnalisisSection.jsx'))
  // La Biblioteca sigue ofreciendo la pizarra al editar y al ver un ejercicio de cancha.
  assert.ok((leer('src/components/BibliotecaSection.jsx').match(/<PizarraEjercicio /g) || []).length >= 2)
  assert.match(leer('src/components/VideoSection.jsx'), /href=\{v.url\}/)
  // Los estilos de fotografiasClub.css cambian con el rediseño; los componentes conservan su lógica.
  // PizarraTactica.jsx se rediseñó a propósito (etapa 1 de la pizarra); su comportamiento lo cubren
  // tests/pizarra.test.mjs y tests/pizarra.interaccion.mjs.
  for (const p of ['src/components/EstadisticasEquipo.jsx', 'src/components/EncabezadoFotografico.jsx']) assert.equal(soloLogica(leer(p)), soloLogica(antes(p)), p)
})

test('Fotografías Etapa 2: originales completos, rutas públicas y recurso de rival reservado', () => {
  const hashes = {
    'banner_entrenamientos.jpg': 'ed6e58b8372e12b0db4c44d536f8205b1a787d3fef196a5cfe2fcaa23ec878f4',
    'banner_videoanalisis.jpg': 'b9018d0e04f984413977678a954d49f7c62b31e9b3e2ddf4f0d2597fde0f2eda',
    'foto_analisis_rival_reserva.jpg': '77ef38e0c0a071bb819197081f9802a7d1580a074c03a5c59c5cb2bc7654fdb2',
  }
  for (const [n, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(`public/images/fotos-comunicaciones/${n}`)).digest('hex'), hash, n)
  for (const [n, foto] of [['BibliotecaSection', 'banner_entrenamientos.jpg'], ['VideoSection', 'banner_videoanalisis.jpg']]) {
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
