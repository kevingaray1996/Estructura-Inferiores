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

test('Pestañas Etiquetado / Acciones / Partido: se cambian con clic y con flechas sin mover el video', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    const pestanas = [...document.querySelectorAll('[role="tab"]')]
    assert.deepEqual(pestanas.map((p) => p.textContent.replace(/\d+$/, '')), ['Etiquetado', 'Acciones', 'Partido'])
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
