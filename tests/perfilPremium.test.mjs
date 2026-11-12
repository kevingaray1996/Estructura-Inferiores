import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { soloLogica } from './helpers/soloLogica.mjs'
const leer = p => readFileSync(p, 'utf8').replaceAll('\r', '')
// Base publicada anterior al rediseño; estable también después de crear su commit.
const anterior = p => execFileSync('git', ['show', `9d764909fdf6532421af8bcb955a7f482f78e1cc:${p}`], { encoding: 'utf8' }).replaceAll('\r', '')

test('Perfil Premium: cálculos deportivos, agrupaciones y eliminación se conservan literalmente', () => {
  // La única ampliación del catálogo es el detalle de minutos, cubierto por la
  // regresión interactiva. Las fórmulas y todos los otros filtros siguen iguales.
  const antes = anterior('src/components/PerfilJugador.jsx'), ahora = leer('src/components/PerfilJugador.jsx').replace(/    minutos: \{\n      titulo: 'Minutos jugados',\n      filtro: [^\n]+\n      valor: [^\n]+\n    \},\n/, '')
  for (const [a, b] of [['  const totales =', '  const datosPersonales ='], ['  const evaluacionesPorPeriodo =', '  if (filtroStat) {']]) {
    const finActual = a.includes('evaluacionesPorPeriodo') ? '  const fuentes = lectura.fuentes' : b
    assert.equal(ahora.slice(ahora.indexOf(a), ahora.indexOf(finActual, ahora.indexOf(a))), antes.slice(antes.indexOf(a), antes.indexOf(b, antes.indexOf(a))))
  }
  const eliminar = s => s.slice(s.indexOf('  async function handleEliminarJugador()'), s.indexOf('\n  if (', s.indexOf('  async function handleEliminarJugador()')))
  assert.equal(eliminar(ahora), eliminar(antes))
})

test('Perfil Premium: mismos select y tablas, sin integración de acciones ni nuevas escrituras', () => {
  const antes = anterior('src/components/PerfilJugador.jsx'), ahora = leer('src/components/PerfilJugador.jsx')
  for (const patron of [/\.from\('([^']+)'\)/g, /\.select\('([^']+)'\)/g]) {
    const valores = s => [...s.matchAll(new RegExp(patron))].map(m => m[1]).sort()
    assert.deepEqual(valores(ahora), valores(antes))
  }
  assert.doesNotMatch(ahora, /analisis_eventos|guardar_detalle_pase|guardar_destino_pase|\.insert\(|\.upsert\(|\.update\(/)
  assert.match(ahora, /exigirLectura: true/)
  assert.match(ahora, /lectura.id !== jugadorId/)
})

test('Perfil Premium: generadores, diez opciones y datos PDF intactos', () => {
  // generarPerfilPDF.js se rediseñó a propósito (página 1): sus tests están en portadaPerfil.test.mjs.
  // El modal solo suma el dorsal; fuera de eso, su lógica sigue igual.
  const sinDorsal = s => s.replace(/^\s*dorsal,\n/gm, '')
  assert.equal(soloLogica(sinDorsal(leer('src/components/PdfPerfilModal.jsx'))), soloLogica(anterior('src/components/PdfPerfilModal.jsx')), 'PdfPerfilModal')
  assert.equal(soloLogica(leer('src/utils/generarBienestarPDF.js')), soloLogica(anterior('src/utils/generarBienestarPDF.js')), 'generarBienestarPDF')
  const anteriorPerfil = anterior('src/components/PerfilJugador.jsx'), ahora = leer('src/components/PerfilJugador.jsx')
  const props = s => [...s.slice(s.indexOf('<PdfPerfilModal')).matchAll(/(\w+)=\{([\w]+)\}/g)].map(m => [m[1], m[2]])
  assert.deepEqual(props(ahora).filter(([clave]) => clave !== 'dorsal'), props(anteriorPerfil))
  assert.ok(props(ahora).some(([clave, valor]) => clave === 'dorsal' && valor === 'dorsal'), 'El modal recibe el dorsal')
})

test('Perfil Premium: helpers de evaluación conservan escala, datos ausentes y períodos', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const helpers = await vite.ssrLoadModule('/src/components/perfil/presentacionPerfil.js')
    const criterios = [{ id: 'a' }, { id: 'b' }]
    const r = helpers.calcularResumenEvaluacion([{ puntajes: { a: 4, b: 'no_evaluo' } }, { puntajes: { a: 2, b: 5 } }], criterios)
    assert.equal(r.general, 4); assert.deepEqual(r.porCriterio.map(c => [c.promedio, c.cantidad]), [[3, 2], [5, 1]])
    assert.equal(helpers.calcularResumenEvaluacion([], criterios).general, null)
    assert.equal(helpers.valorPuntaje('no_evaluo'), 'No evaluó')
    assert.equal(helpers.valorPuntaje(null), '—')
    assert.equal(helpers.nombrePeriodo('final-2026', 'final'), 'Temporada 2026')
    assert.equal(helpers.estadoErrorPerfil({ code: '42501' }), 'denegado')
    assert.equal(helpers.estadoErrorPerfil(new Error('red')), 'error')
  } finally { await vite.close() }
})

test('Perfil Premium: CSS aislado, seis pestañas, móvil, temas y movimiento reducido', () => {
  const css = leer('src/components/perfil/perfilPremium.css'), perfil = leer('src/components/PerfilJugador.jsx')
  for (const id of ['resumen', 'rendimiento', 'evaluaciones', 'seguimiento', 'datos', 'documentos']) assert.match(perfil, new RegExp(`id: '${id}'`))
  assert.match(css, /max-width:1440px/); assert.match(css, /max-width:1050px/); assert.match(css, /max-width:600px/)
  assert.match(css, /min-height:44px/); assert.match(css, /focus-visible/); assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /var\(--ui-/); assert.doesNotMatch(css, /!important|@media print|:root/)
  const cabecera = leer('src/components/perfil/CabeceraPerfil.jsx')
  assert.doesNotMatch(cabecera, /estado_detalle|fichas|bienestar|nro_documento/)
  assert.match(cabecera, /Estado sin confirmar/); assert.match(cabecera, /onError/)
})
