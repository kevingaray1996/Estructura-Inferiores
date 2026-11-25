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
    // Mejoras etapa A (2026-11-20): error de subida en castellano y confirmación que nombra el video.
    const a = antes(p).replace("const nombreArchivo = `${Date.now()}-", "const nombreArchivo = `videos/${Date.now()}-").replace('upsert: true,', 'upsert: false,')
      .replace("alert('Error al subir la imagen: ' + error.message)", "alert(mensajeError(error, 'subir la imagen'))")
      .replace("    const confirmar = window.confirm('¿Seguro que querés eliminar este video?')",
        "    const v = videos.find((x) => x.id === videoId)\n    const titulo = v?.contenido || v?.categorias?.nombre || 'Entrenamiento'\n    const confirmar = window.confirm(`¿Eliminar el video «${titulo}»${v?.fecha ? ` del ${fechaLegible(v.fecha)}` : ''}? No se puede deshacer.`)")
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
  // EstadisticasEquipo cambió a propósito (mejoras etapa A): lee en tandas y avisa si falla. Lo cubre el test de abajo.
  // EncabezadoFotografico cambió a propósito (rediseño paso 3, bbc2a97): suma eyebrow y parte resaltada del título,
  // igual que EncabezadoSeccion. Su comportamiento lo cubre tests/fotografiasClub.test.mjs.
})

// Base simulada: guarda cada consulta y responde por tramos (range), como Supabase con su límite de 1000 filas.
function baseSimulada(tablas, { fallaEn } = {}) {
  const consultas = []
  return {
    consultas,
    from(tabla) {
      const c = { tabla, filtros: [], select: null, orden: null, rango: null }
      consultas.push(c)
      const q = {
        select(s) { c.select = s; return q },
        not(...a) { c.filtros.push(['not', ...a]); return q },
        eq(...a) { c.filtros.push(['eq', ...a]); return q },
        order(o) { c.orden = o; return q },
        range(desde, hasta) {
          c.rango = [desde, hasta]
          if (fallaEn === tabla) return Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } })
          return Promise.resolve({ data: tablas[tabla].slice(desde, Math.min(hasta + 1, desde + 1000)), error: null })
        },
      }
      return q
    },
  }
}

test('Estadísticas del equipo: trae todo en tandas, filtra la categoría en la base y avisa si falla', async () => {
  const { leerEstadisticasEquipo, TAMANO_TANDA } = await import('../src/utils/estadisticasEquipo.js')
  assert.equal(TAMANO_TANDA, 1000)
  // 1500 partidos ganados 1-0 y 2500 filas de estadísticas: 2500 goles de la jugadora a y 1250 asistencias de b.
  const partidos = Array.from({ length: 1500 }, (_, i) => ({ id: `p${i}`, goles_local: 1, goles_visitante: 0, local_visitante: 'local', formacion: i % 2 ? '4-4-2' : '4-3-3' }))
  const estadisticas = Array.from({ length: 2500 }, (_, i) => ({ id: `s${i}`, jugador_id: i % 2 ? 'b' : 'a', goles: i % 2 ? 0 : 2, asistencias: i % 2 ? 1 : 0, jugadores: { nombre: i % 2 ? 'Bea' : 'Ana', apellido: 'Simulada' } }))
  const db = baseSimulada({ partidos, estadisticas_jugador: estadisticas })

  const { datos, error } = await leerEstadisticasEquipo(db, 'cat')
  assert.equal(error, undefined)
  assert.deepEqual(datos.resultados, { victorias: 1500, empates: 0, derrotas: 0 })
  assert.deepEqual(datos.goles, { favor: 1500, contra: 0 })
  assert.deepEqual(datos.golesJugadoras, [{ nombre: 'Simulada, Ana', valor: 2500 }])
  assert.deepEqual(datos.asistJugadoras, [{ nombre: 'Simulada, Bea', valor: 1250 }])
  // Partidos: 2 tandas (1000 + 500). Estadísticas: 3 tandas (1000 + 1000 + 500). Todas ordenadas por id.
  assert.deepEqual(db.consultas.map((c) => [c.tabla, c.rango[0]]), [['partidos', 0], ['partidos', 1000], ['estadisticas_jugador', 0], ['estadisticas_jugador', 1000], ['estadisticas_jugador', 2000]])
  assert.ok(db.consultas.every((c) => c.orden === 'id'))
  // La categoría se filtra en la base: en partidos por categoria_id, y en estadísticas con el join «!inner».
  assert.ok(db.consultas.filter((c) => c.tabla === 'partidos').every((c) => c.filtros.some((f) => f[0] === 'eq' && f[1] === 'categoria_id' && f[2] === 'cat')))
  for (const c of db.consultas.filter((x) => x.tabla === 'estadisticas_jugador')) {
    assert.match(c.select, /jugadores!inner\(/)
    assert.ok(c.filtros.some((f) => f[0] === 'eq' && f[1] === 'jugadores.categoria_id' && f[2] === 'cat'))
  }

  // Sin categoría: no filtra ni usa el join que descarta filas.
  const todas = baseSimulada({ partidos: [], estadisticas_jugador: [] })
  await leerEstadisticasEquipo(todas, null)
  assert.ok(todas.consultas.every((c) => !c.filtros.some((f) => f[0] === 'eq')))
  assert.doesNotMatch(todas.consultas.find((c) => c.tabla === 'estadisticas_jugador').select, /!inner/)

  // Si falla cualquiera de las dos lecturas, devuelve el error (nunca datos en cero).
  for (const tabla of ['partidos', 'estadisticas_jugador']) {
    const r = await leerEstadisticasEquipo(baseSimulada({ partidos, estadisticas_jugador: estadisticas }, { fallaEn: tabla }), 'cat')
    assert.equal(r.datos, undefined, tabla)
    assert.equal(r.error.code, 'XX000', tabla)
  }

  // La pantalla usa esa lectura y muestra el aviso con «Reintentar» cuando hay error.
  const pantalla = leer('src/components/EstadisticasEquipo.jsx')
  assert.match(pantalla, /leerEstadisticasEquipo\(supabase, categoriaId\)/)
  assert.match(pantalla, /<EstadoContenido[\s\S]*estado="error"[\s\S]*No se pudieron cargar las estadísticas[\s\S]*onReintentar=/)
  assert.doesNotMatch(pantalla, /\.from\(/, 'La pantalla no consulta la base directo')
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
