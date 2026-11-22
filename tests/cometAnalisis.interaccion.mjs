// Importar COMET en Análisis → pestaña Partido: elegir el PDF, asociar jugadoras, revisar y confirmar o cancelar.
// YouTube, Supabase, Storage y el lector de PDF simulados (el PDF es inventado: helpers/cometSintetico.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'
import { cometSintetico } from './helpers/cometSintetico.mjs'

const esperar = () => new Promise((r) => setTimeout(r, 0))
const seccion = () => document.getElementById('cm-titulo').closest('section')
const botonEn = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent.trim() === texto)
const MARCAS = [['inicio_1t', 0], ['fin_1t', 2820], ['inicio_2t', 3600], ['fin_partido', 6600]]
  .map(([tipo, segundo]) => ({ id: tipo, partido_id: 'p1', tipo, segundo }))
const CALENDARIO = [{ id: 'c1', categoria_id: 'cat', rival: 'Estrella del Sur', fecha: '2026-04-19', hora: null, lugar: null,
  local_visitante: 'visitante', numero_fecha: null, goles_local: null, goles_visitante: null }]

async function abrir(opciones) {
  globalThis.__escrituraPartidos = true
  globalThis.__cometTextos = async () => cometSintetico()
  const h = await montar({ eventosPartido: MARCAS, calendario: CALENDARIO, ...opciones })
  await h.iniciar()
  await h.act(async () => { await esperar() })
  await h.act(() => document.getElementById('az-pestana-partido').click())
  return h
}
async function elegirPdf(h) {
  const entrada = seccion().querySelector('input[type="file"]')
  const archivo = new h.dom.window.File(['%PDF-1.7'], 'informe.pdf', { type: 'application/pdf' })
  Object.defineProperty(entrada, 'files', { value: [archivo], configurable: true })
  await h.act(async () => { entrada.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); await esperar(); await esperar() })
}
function cerrarGlobales() { delete globalThis.__escrituraPartidos; delete globalThis.__cometTextos }

test('Importar COMET: asocia jugadoras la primera vez, revisa y guarda solo lo confirmado', async () => {
  const h = await abrir()
  try {
    assert.ok(botonEn(seccion(), 'Importar COMET') === undefined, 'Es un label con el selector de archivo')
    assert.match(seccion().textContent, /Importar COMET/)
    await elegirPdf(h)

    // Paso 1: jugadoras. Ana y Bea se sugieren solas; las demás quedan sin asociar.
    assert.match(seccion().textContent, /confirmá quién es quién/)
    const valor = (nombre) => [...seccion().querySelectorAll('.cm-nombres li')].find((li) => li.querySelector('.cm-nombre-comet').textContent === nombre).querySelector('select').value
    assert.equal(valor('Ana Prueba'), 'j')
    assert.equal(valor('Bea Maria Ensayo'), 'j2')
    assert.equal(valor('Nuestra Uno Portera'), '')
    await h.act(async () => { botonEn(seccion(), 'Confirmar jugadoras').click(); await esperar() })
    const upsert = h.guardados.find((g) => g.op === 'upsert')
    assert.deepEqual(upsert.filas, [{ nombre_comet: 'PRUEBA, ANA', jugador_id: 'j' }, { nombre_comet: 'ENSAYO, BEA MARIA', jugador_id: 'j2' }])

    // Paso 2: revisión. Todo se completa (no había nada cargado); el resultado y la árbitra también.
    const completar = seccion().querySelector('[data-grupo="completar"]')
    assert.match(completar.textContent, /Se va a completar/)
    assert.match(completar.textContent, /Gol 30' · Ana Prueba \(y su acción Gol, para ubicarla en la Playlist\)/)
    assert.match(completar.textContent, /Gol 21' · Nueve, Goleadora Local \(rival\)/)
    assert.match(completar.textContent, /Tarjeta amarilla 90\+4' · Bea Ensayo · Conducta antideportiva/)
    assert.match(completar.textContent, /Cambio 62' · sale Ana Prueba, entra Bea Ensayo/)
    assert.match(completar.textContent, /Árbitra: Laura Ines Gomez/)
    assert.match(seccion().textContent, /Dorsal de Bea Ensayo: en COMET 13, en los convocados 7/)
    // Destildo los cambios del rival: no se guardan.
    const tildeRival = [...completar.querySelectorAll('label')].find((l) => l.textContent.startsWith('Cambios del rival')).querySelector('input')
    await h.act(() => tildeRival.click())
    assert.equal(tildeRival.checked, false)
    assert.equal(h.subidas.length, 0, 'Nada se guarda antes de confirmar')

    await h.act(async () => { botonEn(seccion(), 'Confirmar').click(); for (let i = 0; i < 6; i++) await esperar() })
    assert.deepEqual(h.subidas.map((s) => [s.bucket, s.ruta, s.opciones.upsert]), [['comet-pdf', 'p1/comet.pdf', true]])
    const eventos = h.guardados.filter((g) => g.tabla === 'analisis_partido_eventos' && g.op === 'insert').map((g) => g.fila)
    assert.deepEqual(eventos.map((e) => [e.tipo, e.equipo ?? null, e.segundo]).sort(), [
      ['cambio', null, 3600 + 16 * 60], ['gol', 'propio', 29 * 60], ['gol', 'rival', 20 * 60], ['gol', 'rival', 22 * 60], ['tarjeta', 'propio', 3600 + 48 * 60]])
    // El gol nuestro también crea la acción «Gol» de la jugadora, sin ubicación (pendiente en la Playlist).
    const accionGol = h.writes.filter((w) => w.tipo === 'Gol')
    assert.deepEqual(accionGol.map((w) => [w.jugador_id, w.segundo, w.periodo, w.zona, w.coordenada_x, w.coordenada_y]), [['j', 29 * 60, 1, null, null, null]])
    assert.match(seccion().textContent, /El gol nuestro quedó en la Playlist para marcar desde dónde fue/)
    await h.resolver()
    const analisis = h.guardados.find((g) => g.tabla === 'analisis_partidos' && g.op === 'update')
    assert.equal(analisis.valores.comet_pdf, 'p1/comet.pdf')
    assert.equal(analisis.valores.informe.arbitra, 'Laura Ines Gomez')
    assert.deepEqual(Object.keys(analisis.valores.comet.partes).sort(), ['alineacion_rival', 'oficiales'])
    assert.doesNotMatch(JSON.stringify(analisis.valores.comet), /médica|Impreso/i)
    const calendario = h.guardados.find((g) => g.tabla === 'partidos' && g.op === 'update')
    assert.deepEqual(calendario.valores, { lugar: 'CANCHA DE PRUEBA (LOCALIDAD)', hora: '14:00', numero_fecha: '2', goles_local: 2, goles_visitante: 1 })
    assert.match(seccion().textContent, /COMET importado/)
    assert.match(seccion().textContent, /Ver PDF/)
  } finally {
    await h.cerrar(); cerrarGlobales()
  }
})

test('Importar COMET: con las jugadoras ya asociadas va directo a la revisión; «Dejar el mío» y Cancelar no cambian nada', async () => {
  const goles = [{ id: 'g1', partido_id: 'p1', tipo: 'gol', equipo: 'rival', segundo: 27 * 60, observaciones: 'Ya anotada' }]
  const h = await abrir({
    eventosPartido: [...MARCAS, ...goles],
    nombresComet: [{ nombre_comet: 'PRUEBA, ANA', jugador_id: 'j' }, { nombre_comet: 'ENSAYO, BEA MARIA', jugador_id: 'j2' },
      { nombre_comet: 'PORTERA, NUESTRA UNO', jugador_id: 'j' }, { nombre_comet: 'DIEZ, CAPITANA NUESTRA', jugador_id: 'j2' }],
  })
  try {
    await elegirPdf(h)
    assert.doesNotMatch(seccion().textContent, /confirmá quién es quién/)
    const distinto = seccion().querySelector('[data-grupo="distinto"]')
    assert.match(distinto.textContent, /Gol: el minuto no coincide/)
    // Por defecto queda «Dejar el mío»; se puede ver cada momento en el video.
    const item = distinto.querySelector('.cm-item')
    assert.equal(botonEn(item, 'Dejar el mío').getAttribute('aria-pressed'), 'true')
    assert.ok(botonEn(item, 'Ver el mío') && botonEn(item, 'Ver COMET'))
    await h.act(() => botonEn(seccion(), 'Cancelar').click())
    assert.equal(seccion().querySelector('.cm-paso'), null)
    assert.equal(h.subidas.length, 0)
    assert.equal(h.guardados.length, 0)
  } finally {
    await h.cerrar(); cerrarGlobales()
  }
})
