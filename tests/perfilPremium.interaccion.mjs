import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Perfil Premium: pestañas conservan estado sin lecturas adicionales; errores diferenciados y foto alternativa', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://comunicaciones.test/' })
  const anteriores = new Map()
  const poner = (n, v) => { anteriores.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) poner(n, dom.window[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  let fallo = null, consultas = 0
  poner('__perfilPrueba', { from(tabla) {
    consultas++
    const q = { select() { return q }, eq() { return q }, order() { return q }, gte() { return q }, lte() { return q }, not() { return q }, single() { return q },
      then(ok, mal) { return Promise.resolve({ data: tabla === 'jugadores' ? { id: 'a', nombre: 'Jugadora', apellido: 'Prueba', categoria_id: 'c', categorias: { nombre: 'Primera' }, foto_url: '/foto.jpg', estado_detalle: 'Detalle privado' } : tabla === 'evaluaciones' ? [{ id: 'ev', periodo: '2026-01', tipo: 'mensual', puntajes: { tecnica: 4 } }] : tabla === 'evaluacion_criterios' ? [{ id: 'tecnica', nombre: 'Técnica' }] : [], error: tabla === 'estadisticas_jugador' ? fallo : null }).then(ok, mal) } }
    return q
  } })
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'perfil-prueba', enforce: 'pre',
    resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0perfil-db'; if (s.endsWith('/generarBienestarPDF')) return '\0perfil-pdf' },
    load(id) { if (id === '\0perfil-db') return 'export const supabase = globalThis.__perfilPrueba'; if (id === '\0perfil-pdf') return 'export const generarBienestarPDF = async () => {}' },
  }] })
  const root = createRoot(document.getElementById('root'))
  const click = async el => { assert.ok(el); await act(async () => { el.click(); await Promise.resolve() }) }
  const tab = nombre => [...document.querySelectorAll('[role="tab"]')].find(n => n.textContent === nombre)
  const montar = async key => act(async () => { root.render(h(Perfil, { key, jugadorId: 'a', perfil: { rol: 'coordinacion' }, onVolver() {}, onEditar() {} })); await new Promise(r => setTimeout(r, 20)) })
  let Perfil
  try {
    Perfil = (await server.ssrLoadModule('/src/components/PerfilJugador.jsx')).default
    await montar('primero')
    assert.equal(document.querySelectorAll('[role="tab"]').length, 6)
    assert.match(document.body.textContent, /Estado sin confirmar/)
    assert.doesNotMatch(document.querySelector('.perfil-cabecera').textContent, /Detalle privado/)
    const foto = document.querySelector('.perfil-cabecera img.perfil-foto')
    await act(() => foto.dispatchEvent(new window.Event('error')))
    assert.equal(document.querySelector('.perfil-cabecera img.perfil-foto'), null)
    const inicial = consultas
    await click([...document.querySelectorAll('button')].find(n => n.textContent === 'Abrir evaluación completa →'))
    assert.equal(tab('Evaluaciones').getAttribute('aria-selected'), 'true')
    assert.equal(document.querySelector('.perfil-selector-periodo select').value, '2026-01')
    for (const nombre of ['Evaluaciones', 'Seguimiento', 'Datos', 'Documentos', 'Rendimiento', 'Resumen']) await click(tab(nombre))
    assert.equal(consultas, inicial, 'Cambiar pestañas no vuelve a leer las fuentes')
    await click(tab('Rendimiento'))
    assert.match(document.getElementById(tab('Rendimiento').getAttribute('aria-controls')).textContent, /Sin estadísticas registradas/)
    fallo = { code: '42501', message: 'denegado' }
    await montar('denegado')
    await click(tab('Rendimiento'))
    const panel = document.getElementById(tab('Rendimiento').getAttribute('aria-controls'))
    assert.match(panel.textContent, /La sesión no tiene acceso a esta fuente/)
    assert.doesNotMatch(panel.textContent, /Sin estadísticas registradas/)
    const Grafico = (await server.ssrLoadModule('/src/components/perfil/GraficoTemporadasPerfil.jsx')).default
    await act(() => root.render(h(Grafico, { estadisticasPorAnio: [{ anio: '2026', partidos: 2, minutos: 180, goles: 0, asistencias: 1 }] })))
    const selector = document.querySelector('select')
    await act(() => { selector.value = 'goles'; selector.dispatchEvent(new window.Event('change', { bubbles: true })) })
    assert.match(document.querySelector('[role="list"]').getAttribute('aria-label'), /Goles/)
    assert.equal(document.querySelector('.perfil-pista-barra span').style.width, '0%')
    assert.match(document.body.textContent, /Una temporada disponible/)
  } finally {
    await act(() => root.unmount()); await server.close(); dom.window.close()
    for (const [n, d] of anteriores) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
  }
})
