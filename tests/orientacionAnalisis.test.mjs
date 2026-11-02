import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { direccionDelPeriodo, referenciaNueva, referenciaVerificada, zonaTactica, zonaEvento } from '../src/utils/orientacionAnalisis.js'

test('Orientación: ambos períodos y sentidos, campo propio/rival y carriles tácticos', () => {
  for (const inicial of ['derecha', 'izquierda']) for (const periodo of [1, 2]) {
    const d = direccionDelPeriodo({ direccion_primer_tiempo: inicial }, periodo)
    assert.equal(d, periodo === 1 ? inicial : inicial === 'derecha' ? 'izquierda' : 'derecha')
    for (const [x, sector] of [[10, 'Defensa'], [50, 'Medio'], [90, 'Ataque']]) {
      for (const [y, carril] of [[10, 'izquierda'], [50, 'centro'], [90, 'derecha']]) {
        assert.equal(zonaTactica(d === 'derecha' ? x : 100-x, d === 'derecha' ? y : 100-y, d), `${sector} ${carril}`)
      }
    }
  }
  for (const valor of [null, undefined, '', -1, 101, NaN]) assert.equal(zonaTactica(valor, 50, 'derecha'), null)
  assert.equal(zonaTactica(20, 20, null), null)
  assert.throws(() => referenciaNueva({}, 1), /Configurá/)
})
test('La captura es independiente de cambios posteriores del partido; el historial nunca se reinterpreta', () => {
  const partido = { direccion_primer_tiempo: 'izquierda' }
  const e = { ...referenciaNueva(partido, 2), coordenada_x: 90, coordenada_y: 90, zona: 'Defensa centro' }
  const copia = JSON.stringify(e)
  assert.equal(zonaEvento(e), 'Ataque derecha')
  partido.direccion_primer_tiempo = 'derecha'
  assert.equal(zonaEvento(e), 'Ataque derecha')
  assert.equal(JSON.stringify(e), copia)
  const historico = { coordenada_x: 90, coordenada_y: 90, zona: 'Defensa izquierda' }
  assert.equal(referenciaVerificada(historico), false)
  assert.equal(zonaEvento(historico), 'Defensa izquierda')
  assert.equal(zonaEvento({ coordenada_x: 90, coordenada_y: 90 }), null)
  assert.equal(zonaEvento({ ...e, coordenada_x: null, coordenada_y: null, zona: 'Medio centro' }), 'Medio centro')
})
test('Integración: mapa, filtros y PDF comparten clasificación, sin inversión de coordenadas guardadas', () => {
  const s = readFileSync('src/components/AnalisisSection.jsx', 'utf8')
  assert.match(s, /zonaEvento as zonaEfectivaEvento/)
  assert.doesNotMatch(s, /function zonaDesdeCoordenadas/)
  assert.match(s, /coordenada_x: coordenadasAccion\?\.x \?\? null/)
  assert.match(s, /coordenada_y: coordenadasAccion\?\.y \?\? null/)
  assert.equal((s.match(/\.\.\.referenciaCaptura,/g) || []).length, 2)
  const pdf = s.slice(s.indexOf('function CanchaInformePDF'), s.indexOf('function AnalisisSection'))
  assert.match(pdf, /zonaEfectivaEvento\(evento\)/)
  assert.match(pdf, /referencia táctica histórica no verificada/)
  assert.match(pdf, /Cancha visual fija/)
})
test('Migración aditiva: sin backfill ni políticas, referencia inmutable y validación antes del guardado', () => {
  const sql = readFileSync('supabase/migrations/202611020001_orientacion_tactica_analisis.sql', 'utf8')
  assert.equal((sql.match(/ADD COLUMN/g) || []).length, 3)
  assert.doesNotMatch(sql, /UPDATE\s+public\.|DELETE\s+FROM|DROP\s|CREATE POLICY|ALTER POLICY/i)
  assert.match(sql, /IS DISTINCT FROM ROW\(OLD.sistema_coordenadas/)
  assert.match(sql, /FOR SHARE/)
  assert.match(sql, /SECURITY INVOKER/)
  assert.match(sql, /NEW.zona :=/)
})

test('Render real de selector e informe PDF conserva puntos y clasifica ambos sentidos sin depender del partido actual', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{
    name: 'orientacion-sintetica', enforce: 'pre',
    resolveId(source) { if (source.endsWith('/supabaseClient')) return '\0orientacion-sin-red' },
    load(id) { if (id === '\0orientacion-sin-red') return "export const supabase = {from() {throw Error('No se permiten consultas reales')}}" },
    transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/AnalisisSection.jsx')) return code + '\nexport { CanchaInteractiva, CanchaInformePDF };' },
  }] })
  try {
    const { CanchaInteractiva, CanchaInformePDF } = await server.ssrLoadModule('/src/components/AnalisisSection.jsx')
    const e = { id: 'sintetico', tipo: 'Recuperación', segundo: 60, coordenada_x: 90, coordenada_y: 90,
      ...referenciaNueva({ direccion_primer_tiempo: 'izquierda' }, 1) }
    const previo = JSON.stringify(e)
    const cancha = renderToStaticMarkup(createElement(CanchaInteractiva, { direccion: 'izquierda', eventos: [e] }))
    assert.match(cancha, /<span>ATAQUE<\/span><span>MEDIO<\/span><span>DEFENSA<\/span>/)
    assert.match(cancha, /Defensa izquierda/)
    assert.match(cancha, /cx="90" cy="57.6"/)
    const historico = { ...e, id: 'historico', sistema_coordenadas: null, direccion_captura: null, periodo_captura: null, zona: 'Ataque derecha' }
    const pdf = renderToStaticMarkup(createElement(CanchaInformePDF, { eventos: [e, historico], direccionReal: 'derecha' }))
    assert.match(pdf, /1 acciones con referencia táctica histórica no verificada/)
    assert.match(pdf, /IZQUIERDA VISUAL/)
    assert.match(pdf, /Defensa izquierda/)
    assert.match(pdf, /Ataque derecha/)
    assert.equal(JSON.stringify(e), previo)
  } finally { await server.close() }
})
