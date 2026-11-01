import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Base Deportivo Premium: tokens existentes, estilos aislados, responsive y movimiento reducido', () => {
  const css = readFileSync(new URL('../src/components/ui/panelDeportivo.css', import.meta.url), 'utf8')
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const apariencia = readFileSync(new URL('../src/appearance/apariencia.css', import.meta.url), 'utf8')
  assert.match(css, /@media screen/)
  assert.doesNotMatch(sinComentarios, /!important|@media print|:root|^\s*body\s*\{/m)
  for (const token of [...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1])) assert.ok(apariencia.includes(`${token}:`), token)
  assert.match(css, /max-width: 767px/)
  assert.match(css, /max-width: 479px/)
  assert.match(css, /overflow-x: auto/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /min-height: 44px/)
  assert.doesNotMatch(sinComentarios, /#[\da-f]{3,8}\b|rgba?\(/i)
  for (const archivo of ['EncabezadoSeccion', 'TarjetaIndicador', 'PestanasAccesibles', 'BarraFiltros', 'EstadoContenido']) {
    const fuente = readFileSync(new URL(`../src/components/ui/${archivo}.jsx`, import.meta.url), 'utf8')
    assert.doesNotMatch(fuente, /supabase|fetch\(|localStorage|sessionStorage|window\.location/)
    assert.match(fuente, /import '\.\/panelDeportivo.css'/)
  }
})

test('Componentes Premium: propiedades opcionales, cero, ausencias, estados y ARIA sin servicios', async () => {
  const { crearServidorVitePrueba: createServer } = await import('./helpers/servidorVite.mjs')
  const { createElement: h } = await import('react')
  const { renderToStaticMarkup: render } = await import('react-dom/server')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const cargar = async n => (await server.ssrLoadModule(`/src/components/ui/${n}.jsx`)).default
    const Encabezado = await cargar('EncabezadoSeccion'), Indicador = await cargar('TarjetaIndicador')
    const Estado = await cargar('EstadoContenido'), Filtros = await cargar('BarraFiltros'), Pestanas = await cargar('PestanasAccesibles')
    assert.match(render(h(Encabezado, { titulo: 'Plantel' })), /<h1[^>]*>Plantel<\/h1>/)
    const cabecera = render(h(Encabezado, { titulo: 'Perfil', nivel: 2, descripcion: 'Primera', acciones: h('button', null, 'Editar') }, 'Contexto adicional'))
    for (const texto of ['<h2', 'Primera', 'Editar', 'Contexto adicional', 'Acciones de la sección']) assert.ok(cabecera.includes(texto))
    const cero = render(h(Indicador, { etiqueta: 'Goles', valor: 0, unidad: 'goles', periodo: '2026', cobertura: '2 partidos' }))
    assert.match(cero, /<dd[^>]*>0/); assert.doesNotMatch(cero, /Sin datos/)
    for (const valor of [null, undefined, '', '  ', NaN, Infinity]) {
      const html = render(h(Indicador, { etiqueta: 'Minutos', valor, unidad: 'min' }))
      assert.match(html, /Sin datos/); assert.doesNotMatch(html, /dp-indicador-unidad/)
    }
    assert.match(render(h(Indicador, { etiqueta: 'Minutos', valor: 10, sinDato: true, mensajeSinDato: 'Lectura incompleta' })), /Lectura incompleta/)
    for (const [estado, titulo] of [['cargando', 'Cargando'], ['vacio', 'Sin registros'], ['error', 'No se pudo cargar'], ['denegado', 'Acceso denegado'], ['insuficiente', 'Datos insuficientes']]) {
      const html = render(h(Estado, { estado }))
      assert.ok(html.includes(titulo)); assert.match(html, /role="(?:alert|status)"/)
      assert.doesNotMatch(html, /<button/)
    }
    assert.match(render(h(Estado, { estado: 'error', mensaje: 'Mensaje específico', onReintentar() {} })), /Mensaje específico/)
    assert.match(render(h(Estado, { estado: 'error', onReintentar() {}, reintentando: true })), /aria-busy="true"/)
    const filtros = render(h(Filtros, { acciones: h('button', null, 'Limpiar') }, h('label', null, 'Buscar', h('input', { type: 'search' }))))
    assert.match(filtros, /role="group" aria-label="Filtros"/); assert.match(filtros, /Buscar/); assert.match(filtros, /Limpiar/)
    assert.match(render(h(Pestanas, { pestanas: [] })), /role="tablist"/)
    const tabs = render(h(Pestanas, { pestanas: [{ id: 'a', etiqueta: 'Resumen', contenido: 'Datos' }], seleccionada: 'a' }))
    assert.match(tabs, /aria-selected="true"/); assert.match(tabs, /role="tabpanel"/)
  } finally { await server.close() }
})
