// Análisis parte 2A: video fijo + panel con pestañas, y botonera leída de la configuración de la base.
// YouTube y Supabase simulados; nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const tipo = (codigo, etiqueta_boton, color, orden, extra = {}) => ({
  codigo, etiqueta: codigo, etiqueta_boton, icono: '•', color, ubicacion: 'obligatoria', resultados: [],
  resultado_implicito: null, es_pase: false, grupo: 'ofensiva', orden, visible: true, atajo: null, ...extra,
})

test('La botonera sale de la base: solo los visibles, en su orden y con su nombre de botón', async () => {
  const h = await montar({ tipos: [
    tipo('Pérdida', 'Perdió', 'peligro', 2),
    tipo('Remate', 'Tiro', 'acento', 1),
    tipo('Despeje', 'Despeje', 'info', 3, { visible: false }),
  ] })
  try {
    await h.iniciar()
    const botones = [...document.querySelectorAll('[data-tipo-rapido]')]
    assert.deepEqual(botones.map((b) => b.dataset.tipoRapido), ['Remate', 'Pérdida'])
    assert.match(botones[0].textContent, /Tiro/)
    assert.equal(h.tipo('Despeje'), null)
    // La tecla de siempre sigue andando para los que están en la botonera.
    assert.equal(h.tipo('Pérdida').querySelector('kbd').textContent, 'P')
  } finally {
    await h.cerrar()
  }
})

test('Pestañas Etiquetado / Acciones / Partido / Posesión: se cambian con clic y con flechas sin mover el video', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    const pestanas = [...document.querySelectorAll('[role="tab"]')]
    assert.deepEqual(pestanas.map((p) => p.textContent.replace(/\d+$/, '')), ['Etiquetado', 'Acciones', 'Partido', 'Posesión'])
    const panel = (id) => document.getElementById(`az-panel-${id}`)
    assert.equal(panel('etiquetado').hidden, false)
    assert.equal(panel('playlist').hidden, true)
    // Lo de las pestañas ocultas sigue montado (no se pierde lo que se estaba editando).
    h.registradas(0)

    await h.act(() => pestanas[1].click())
    assert.equal(panel('playlist').hidden, false)
    assert.equal(panel('etiquetado').hidden, true)
    assert.equal(pestanas[1].getAttribute('aria-selected'), 'true')

    // → sobre la pestaña pasa a Partido y no salta el video 5 s.
    h.activo().time = 60
    pestanas[1].focus()
    await h.act(() => pestanas[1].dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })))
    assert.equal(panel('partido').hidden, false)
    assert.equal(document.activeElement, pestanas[2])
    assert.equal(h.activo().pending, undefined, 'La flecha en las pestañas no mueve el video')
    assert.match(panel('partido').textContent, /Formación y banco/)
    assert.match(panel('partido').textContent, /Hacia dónde atacamos en el 1T/)
  } finally {
    await h.cerrar()
  }
})

test('Pestaña Posesión: la P no marca Pérdida ni la G abre el marcador; Espacio sigue pausando; la Q solo anda acá', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    await h.click('Marcar sin jugadora')
    const pestanas = [...document.querySelectorAll('[role="tab"]')]
    const indicador = () => document.querySelector('#az-panel-posesion .mp-indicador')
    // Fuera de la pestaña, la Q no hace nada del Modo posesión.
    h.activo().time = 30
    await h.tecla('q')
    assert.doesNotMatch(indicador().textContent, /Marcando desde/)

    await h.act(() => pestanas[3].click())
    const antes = h.writes.length
    await h.tecla('p')
    await h.tecla('g')
    assert.equal(h.writes.length, antes, 'Las teclas de la botonera no marcan acciones en Posesión')
    assert.equal(document.querySelector('.mb-cartel, [role="dialog"][aria-label*="Gol"]'), null, 'La G no abre el marcador')
    const estado = h.activo().state
    await h.tecla(' ')
    assert.notEqual(h.activo().state, estado, 'Espacio sigue pausando el video')
    h.activo().time = 40
    await h.tecla('q')
    assert.match(indicador().textContent, /Marcando desde 00:40/)
    assert.equal(indicador().dataset.estado, 'analizado')

    // De vuelta en Etiquetado, la P vuelve a marcar Pérdida.
    await h.act(() => pestanas[0].click())
    await h.tecla('p')
    assert.equal(h.writes.at(-1)?.tipo, 'Pérdida')
    await h.resolver()
  } finally {
    await h.cerrar()
  }
})

test('Lado de ataque del 1T sin confirmar: aviso en el mapa y en la pantalla del partido; elegir el lado lo confirma', async () => {
  globalThis.__escrituraPartidos = true
  const h = await montar()
  try {
    h.datos.analisis_partidos[0].direccion_confirmada = false
    await h.iniciar()
    await h.click('▦ Mapa')
    assert.match(document.body.textContent, /Lado de ataque del 1T sin confirmar: el mapa puede estar espejado/)
    await h.click('▥ Estadísticas')
    assert.match(document.body.textContent, /Lado de ataque del 1T sin confirmar/)
    await h.act(async () => { [...document.querySelectorAll('.ev-lado button')].find((b) => b.textContent.includes('izquierda')).click(); await new Promise((r) => setTimeout(r, 20)) })
    const guardado = h.guardados.filter((g) => g.tabla === 'analisis_partidos' && g.op === 'update').at(-1)
    assert.deepEqual(guardado.valores, { direccion_primer_tiempo: 'izquierda', direccion_confirmada: true })
    assert.doesNotMatch(document.body.textContent, /sin confirmar/)
  } finally {
    delete globalThis.__escrituraPartidos
    await h.cerrar()
  }
})

test('1T / 2T en Etiquetado: la acción nueva se guarda con el tiempo elegido', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    await h.click('Marcar sin jugadora')
    await h.click('2T')
    assert.equal(h.boton('2T').getAttribute('aria-pressed'), 'true')
    await h.marcar('Pérdida')
    assert.equal(h.writes.at(-1).periodo, 2)
    await h.resolver()
  } finally {
    await h.cerrar()
  }
})
