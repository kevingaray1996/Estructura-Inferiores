// Análisis 2C y 2D: pestaña Partido (marcas, cambios, goles) y lo que se calcula con las marcas (minuto real,
// 1T / 2T automático, jugadora fuera de cancha, minutos sugeridos a la planilla). YouTube y Supabase simulados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const panel = (id) => document.getElementById(`az-panel-${id}`)
const marca = (nombre) => [...panel('partido').querySelectorAll('.pa-marca')].find((li) => li.textContent.includes(nombre))
const botonEn = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent.trim() === texto)
const esperar = () => new Promise((r) => setTimeout(r, 0))

// Partido: 1T de 0 a 45', 2T de 60' a 105' del video. A los 30' del 2T sale Ana (10, titular) y entra Bea (7).
const MARCAS = [['inicio_1t', 0], ['fin_1t', 2700], ['inicio_2t', 3600], ['fin_partido', 6300]]
  .map(([tipo, segundo]) => ({ id: tipo, partido_id: 'p1', tipo, segundo }))
const CAMBIO = { id: 'cambio1', partido_id: 'p1', tipo: 'cambio', segundo: 5400, jugadora_sale: 'j', jugadora_entra: 'j2' }

async function abrir(h, pestana) {
  await h.iniciar()
  await h.act(async () => { await esperar() })
  await h.act(() => document.getElementById(`az-pestana-${pestana}`).click())
}
async function escribir(h, input, valor) {
  await h.act(async () => {
    Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype, 'value').set.call(input, valor)
    input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }))
  })
  await h.act(async () => {
    input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await esperar()
  })
}

test('Marcas: «Marcar ahora» toma el segundo del video, a mano con mm:ss, y avisa las que faltan o están fuera de orden', async () => {
  const h = await montar()
  try {
    await abrir(h, 'partido')
    assert.match(panel('partido').textContent, /Faltan: Inicio del partido, Fin del 1T, Inicio del 2T, Fin del partido/)
    h.activo().time = 95.6
    await h.act(async () => { botonEn(marca('Inicio del partido'), 'Marcar ahora').click(); await esperar() })
    assert.deepEqual(h.guardados.at(-1).fila, { id: h.guardados.at(-1).fila.id, tipo: 'inicio_1t', segundo: 95, partido_id: 'p1' })
    assert.equal(marca('Inicio del partido').querySelector('input').value, '01:35')

    await escribir(h, marca('Fin del 1T').querySelector('input'), '47:00')
    assert.equal(h.guardados.at(-1).fila.segundo, 2820)
    await escribir(h, marca('Inicio del 2T').querySelector('input'), '40:00')
    assert.match(panel('partido').textContent, /«Inicio del 2T» tiene que ser después de «Fin del 1T»/)
    // Escrito mal: avisa y no guarda.
    const antes = h.guardados.length
    await escribir(h, marca('Fin del partido').querySelector('input'), '9x')
    assert.equal(h.guardados.length, antes)
    assert.match(marca('Fin del partido').textContent, /minutos:segundos/)
  } finally {
    await h.cerrar()
  }
})

test('Con las marcas: minuto real en la Playlist, aviso de jugadora fuera de cancha y 1T / 2T automático al etiquetar', async () => {
  const eventos = [{ id: 'a', partido_id: 'p1', jugador_id: 'j2', tipo: 'Pérdida', resultado: null, segundo: 4260, periodo: 1,
    zona: 'Medio centro', coordenada_x: null, coordenada_y: null, observaciones: null }]
  const h = await montar({ eventos, eventosPartido: [...MARCAS, CAMBIO] })
  try {
    await abrir(h, 'playlist')
    const fila = panel('playlist').querySelector('article')
    assert.match(fila.querySelector('.pl-tiempo').textContent, /2T 12'/)
    assert.match(fila.textContent, /Fuera de cancha/, 'Bea entra recién a los 30\' del 2T')
    assert.doesNotMatch(panel('playlist').textContent, /Faltan marcas de tiempo/)

    // Etiquetar en el 2T del video: el tiempo sale de las marcas aunque el botón diga 1T.
    await h.act(() => document.getElementById('az-pestana-etiquetado').click())
    assert.equal(h.boton('1T').disabled, true)
    await h.click('Marcar sin jugadora')
    h.activo().time = 4000
    await h.marcar('Pérdida')
    assert.equal(h.writes.at(-1).periodo, 2)
    assert.match(document.querySelector('.et-aviso').textContent, /Pérdida · 2T 7'/)
    await h.resolver()

    // Con jugadora: Bea no estaba en cancha a los 7' del 2T.
    await h.click('Marcar sin jugadora')
    await h.marcar('Remate')
    await h.etiquetar('Bea Ensayo')
    assert.match(document.querySelector('.et-aviso').textContent, /Bea Ensayo no estaba en cancha/)
    await h.resolver()
  } finally {
    await h.cerrar()
  }
})

test('Sin marcas: la Playlist avisa y lleva a la pestaña Partido', async () => {
  const eventos = [{ id: 'a', partido_id: 'p1', jugador_id: 'j', tipo: 'Pérdida', resultado: null, segundo: 100, periodo: 1, zona: 'Medio centro' }]
  const h = await montar({ eventos })
  try {
    await abrir(h, 'playlist')
    assert.match(panel('playlist').textContent, /Faltan marcas de tiempo/)
    assert.match(panel('playlist').querySelector('.pl-tiempo').textContent, /1T/)
    await h.act(() => botonEn(panel('playlist'), 'Cargarlas en Partido').click())
    assert.equal(panel('partido').hidden, false)
  } finally {
    await h.cerrar()
  }
})

test('Cambios y goles: se cargan con el tiempo del video', async () => {
  const h = await montar({ eventosPartido: MARCAS })
  try {
    await abrir(h, 'partido')
    await h.cambio(document.getElementById('pa-cambio-sale'), 'j')
    await h.cambio(document.getElementById('pa-cambio-entra'), 'j2')
    h.activo().time = 5400.2
    const seccionCambios = document.getElementById('pa-cambios-titulo').closest('section')
    await h.act(() => botonEn(seccionCambios, 'Tomar del video').click())
    assert.equal(document.getElementById('pa-cambio-tiempo').value, '90:00')
    await h.act(async () => { botonEn(seccionCambios, 'Agregar cambio').click(); await esperar() })
    assert.deepEqual({ ...h.guardados.at(-1).fila, id: undefined },
      { id: undefined, tipo: 'cambio', segundo: 5400, jugadora_sale: 'j', jugadora_entra: 'j2', partido_id: 'p1' })
    assert.match(seccionCambios.textContent, /2T 31' · 90:00/)
    assert.match(seccionCambios.textContent, /Sale 10 · Ana Prueba · Entra 7 · Bea Ensayo/)

    const seccionGoles = document.getElementById('pa-goles-titulo').closest('section')
    await h.act(() => botonEn(seccionGoles, 'Rival').click())
    await h.act(async () => {
      const input = document.getElementById('pa-gol-tiempo')
      Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype, 'value').set.call(input, '20:00')
      input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }))
    })
    await h.act(async () => { botonEn(seccionGoles, 'Agregar gol').click(); await esperar() })
    const gol = h.guardados.at(-1).fila
    assert.deepEqual([gol.tipo, gol.segundo, gol.equipo, gol.jugador_id, gol.tarjeta], ['gol', 1200, 'rival', null, null])
    assert.match(seccionGoles.textContent, /1T 21' · 20:00Gol · Rival/)
  } finally {
    await h.cerrar()
  }
})

test('Minutos sugeridos: se muestran, se corrigen y se guardan en la planilla solo al confirmar', async () => {
  const h = await montar({ eventosPartido: [...MARCAS, CAMBIO], planilla: [{ id: 'f1', jugador_id: 'j', partido_id: 'c1', minutos_jugados: 70, titular: true }] })
  try {
    await abrir(h, 'partido')
    await h.act(async () => { await esperar() })
    const tabla = panel('partido').querySelector('.pa-tabla')
    const filaDe = (nombre) => [...tabla.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(nombre))
    assert.match(filaDe('Ana Prueba').textContent, /75'70'/, 'Sugeridos 75\', en planilla 70\'')
    assert.match(filaDe('Bea Ensayo').textContent, /15'—/)

    // Sin confirmar no se guarda nada.
    let preguntas = 0
    h.dom.window.confirm = () => { preguntas += 1; return false }
    const guardar = botonEn(panel('partido'), 'Guardar minutos en la planilla (2)')
    await h.act(async () => { guardar.click(); await esperar() })
    assert.equal(preguntas, 1)
    assert.equal(h.guardados.filter((g) => g.tabla === 'estadisticas_jugador').length, 0)

    // Corrige a mano a Bea (16') y confirma: Ana se actualiza, Bea se agrega.
    await h.act(async () => {
      const input = filaDe('Bea Ensayo').querySelector('input')
      Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype, 'value').set.call(input, '16')
      input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }))
    })
    h.dom.window.confirm = () => true
    await h.act(async () => { guardar.click(); await esperar(); await esperar() })
    const planilla = h.guardados.filter((g) => g.tabla === 'estadisticas_jugador')
    assert.equal(planilla.length, 2)
    const actualizada = planilla.find((g) => g.op === 'update'), nueva = planilla.find((g) => g.op === 'insert')
    assert.deepEqual(actualizada.valores, { minutos_jugados: 75 })
    assert.deepEqual(actualizada.ids, ['f1'])
    assert.deepEqual({ ...nueva.fila, id: undefined }, { id: undefined, jugador_id: 'j2', partido_id: 'c1', minutos_jugados: 16, titular: false })
    await h.act(async () => { await esperar() })
    assert.match(botonEn(panel('partido'), 'La planilla ya tiene estos minutos')?.textContent || '', /ya tiene/)
  } finally {
    await h.cerrar()
  }
})
