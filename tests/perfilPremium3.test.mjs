import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const leer = ruta => readFileSync(ruta, 'utf8').replaceAll('\r', '')

test('Perfil 3.0: temporadas reales, un solo año, sin fechas y evaluación sin valores inventados', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const { createElement: h } = await import('react')
  const { renderToStaticMarkup: render } = await import('react-dom/server')
  try {
    const Grafico = (await vite.ssrLoadModule('/src/components/perfil/GraficoTemporadasPerfil.jsx')).default
    const Evaluacion = (await vite.ssrLoadModule('/src/components/perfil/SintesisEvaluacionPerfil.jsx')).default
    const Resumen = (await vite.ssrLoadModule('/src/components/perfil/ResumenDeportivoPerfil.jsx')).default
    const anual = anio => ({ anio, partidos: 2, minutos: 90, goles: 0, asistencias: 1 })
    const sinFecha = render(h(Grafico, { estadisticasPorAnio: [anual('Sin fecha')] }))
    assert.match(sinFecha, /Sin temporadas fechadas/); assert.doesNotMatch(sinFecha, /role="listitem"/)
    const uno = render(h(Grafico, { estadisticasPorAnio: [anual('2026')] }))
    assert.match(uno, /Una temporada disponible/); assert.match(uno, /90/)
    const varios = render(h(Grafico, { estadisticasPorAnio: [anual('2026'), anual('2024'), anual('Sin fecha')] }))
    assert.ok(varios.indexOf('>2024<') < varios.indexOf('>2026<'))
    assert.match(varios, /registros sin fecha/); assert.doesNotMatch(varios, /NaN|Infinity/)
    const criterios = [{ id: 'a', nombre: 'Técnica' }, { id: 'b', nombre: 'Táctica' }]
    const grupo = { periodo: 'final-2025', tipo: 'final', evaluaciones: [{ puntajes: { a: 4, b: 'no_evaluo' } }] }
    const evaluacion = render(h(Evaluacion, { grupo, criterios }))
    assert.match(evaluacion, /FINAL/); assert.match(evaluacion, /Temporada 2025/); assert.match(evaluacion, /4.0/); assert.match(evaluacion, /Sin evaluar/)
    const props = { estadisticasPorAnio: [], fuentes: {}, evaluacionesPorPeriodo: [grupo, { ...grupo, periodo: '2026-01', tipo: 'mensual' }], criteriosEvaluacion: criterios, puedeConsultarCategoria: true, puedeWellness: true, resumenBienestar: [{ clave: 'fatiga', label: 'Fatiga', promedioActual: 3, escalaMax: 5 }, { clave: 'rpe', promedioActual: 6 }], resumenAsistencia: { presente: 7, tarde: 2 }, totalAsistenciaMarcada: 9 }
    const resumen = render(h(Resumen, props))
    assert.match(resumen, /Enero de 2026/); assert.doesNotMatch(resumen, /Temporada 2025/)
    assert.match(resumen, /6.0 \/ 10/); assert.match(resumen, /últimos 7 días/)
    const protegido = render(h(Resumen, { ...props, puedeConsultarCategoria: false, puedeWellness: false }))
    assert.match(protegido, /permanece protegido/); assert.doesNotMatch(protegido, /6.0 \/ 10|Enero de 2026/)
    const error = render(h(Resumen, { ...props, fuentes: { wellness: { error: { code: '42501' } }, asistencias: { error: { message: 'red' } } } }))
    assert.match(error, /no tiene acceso/); assert.match(error, /No se pudo consultar/); assert.doesNotMatch(error, /Sin respuestas de Wellness/)
  } finally { await vite.close() }
})

test('Perfil 3.0: consultas, fórmulas, PDF, permisos y eliminación conservados frente a 2.0', () => {
  const base = ruta => execFileSync('git', ['show', `9865f4df85dc3685afea0d9e187956b2e216c947:${ruta}`], { encoding: 'utf8' }).replaceAll('\r', '')
  const antes = base('src/components/PerfilJugador.jsx'), ahora = leer('src/components/PerfilJugador.jsx')
  for (const [inicio, fin] of [['  useEffect(() => {', '  const abrirDetalle'], ['  const descargarWellness', '  return <div className="perfil-premium">']]) {
    assert.equal(ahora.slice(ahora.indexOf(inicio), ahora.indexOf(fin, ahora.indexOf(inicio))), antes.slice(antes.indexOf(inicio), antes.indexOf(fin, antes.indexOf(inicio))))
  }
  for (const ruta of ['src/components/PdfPerfilModal.jsx', 'src/utils/generarPerfilPDF.js', 'src/utils/generarBienestarPDF.js', 'src/components/AnalisisSection.jsx']) assert.equal(leer(ruta), base(ruta))
  const cabecera = leer('src/components/perfil/CabeceraPerfil.jsx')
  assert.match(cabecera, /inicio-equipo-cuerpo-tecnico-original.jpeg/); assert.match(cabecera, /Escudo de Comunicaciones/)
  assert.doesNotMatch(cabecera, /estado_detalle|bienestar|nro_documento|dorsal|altura/)
  const css = leer('src/components/perfil/perfilPremium.css')
  for (const regla of [/perfil-dashboard/, /max-width:1050px/, /max-width:600px/, /prefers-reduced-motion/, /var\(--ui-superficie/, /minmax\(0,1fr\)/]) assert.match(css, regla)
  assert.doesNotMatch(css, /!important|@media print|:root/)
})
