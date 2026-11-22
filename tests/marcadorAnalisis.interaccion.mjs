// Marcador de transmisión sobre el video de Análisis y botones Gol / Gol rival / Tarjeta / Cambio de la botonera.
// YouTube y Supabase simulados (helpers/montarAnalisis.mjs); nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const esperar = () => new Promise((r) => setTimeout(r, 0))
const botonEn = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.textContent.trim() === texto)
const marcador = () => document.querySelector('.mv')
const cartel = () => document.querySelector('.mb-cartel')
const jugadoraEn = (raiz, nombre) => [...raiz.querySelectorAll('.mb-jugadora')].find((b) => b.textContent.includes(nombre))

// 1T de 0 a 45', 2T de 60' a 105' del video.
const MARCAS = [['inicio_1t', 0], ['fin_1t', 2700], ['inicio_2t', 3600], ['fin_partido', 6300]]
  .map(([tipo, segundo]) => ({ id: tipo, partido_id: 'p1', tipo, segundo }))

async function abrir(h) {
  await h.iniciar()
  await h.act(async () => { await esperar() })
}
async function enVideo(h, segundo) {
  h.activo().time = segundo
  await h.tick()
}

test('Marcador: reloj del partido y resultado siguen al video', async () => {
  const goles = [{ id: 'g1', partido_id: 'p1', tipo: 'gol', equipo: 'propio', segundo: 600, jugador_id: 'j' }]
  // Con 3' de descuento en el 2T.
  const marcas = MARCAS.map((m) => (m.tipo === 'fin_partido' ? { ...m, segundo: 6300 + 180 } : m))
  const h = await montar({ eventosPartido: [...marcas, ...goles] })
  try {
    await abrir(h)
    assert.ok(marcador(), 'El marcador está sobre el video')
    await enVideo(h, 300)
    assert.match(marcador().textContent, /COM0-0RIV/)
    assert.match(marcador().querySelector('.mv-reloj').textContent, /1T 05:00/)
    await enVideo(h, 2760)
    assert.match(marcador().querySelector('.mv-reloj').textContent, /Entretiempo/)
    await enVideo(h, 3600 + 22 * 60 + 41)
    assert.match(marcador().textContent, /COM1-0RIV/)
    assert.match(marcador().querySelector('.mv-reloj').textContent, /2T 22:41/)
    await enVideo(h, 3600 + 46 * 60 + 5)
    assert.match(marcador().querySelector('.mv-reloj').textContent, /2T 45\+2'/)
  } finally {
    await h.cerrar()
  }
})

test('Marcador sin marcas: «Marcar el inicio acá» guarda el inicio en el segundo actual', async () => {
  const h = await montar()
  try {
    await abrir(h)
    await enVideo(h, 95)
    assert.match(marcador().textContent, /Marcá el inicio/)
    await h.act(async () => { botonEn(marcador(), 'Marcar el inicio acá').click(); await esperar() })
    const fila = h.guardados.at(-1).fila
    assert.deepEqual([fila.tipo, fila.segundo], ['inicio_1t', 95])
    assert.match(marcador().querySelector('.mv-reloj').textContent, /1T 00:00/)
  } finally {
    await h.cerrar()
  }
})

test('Gol (tecla G): pausa el video, pide la jugadora y guarda el gol del marcador y la acción de gol juntos', async () => {
  const h = await montar({ eventosPartido: MARCAS })
  try {
    await abrir(h)
    assert.equal(h.tipo('Gol'), null, 'La acción «Gol» ya no tiene botón propio en la botonera')
    h.activo().playVideo()
    await enVideo(h, 3600 + 21 * 60 + 10)
    await h.tecla('g')
    assert.ok(cartel(), 'Se abre el cartel del gol')
    assert.equal(h.activo().state, 2, 'El video queda en pausa')
    assert.match(cartel().textContent, /2T 22' \(video 81:10\)/)
    // Con el cartel abierto, las teclas de la botonera no marcan acciones.
    const antes = h.writes.length
    await h.tecla('p')
    assert.equal(h.writes.length, antes)

    await h.act(() => jugadoraEn(cartel(), 'Ana Prueba').click())
    await h.act(async () => { botonEn(cartel(), 'Guardar gol').click(); await esperar() })
    const gol = h.guardados.at(-1).fila
    assert.deepEqual([gol.tipo, gol.equipo, gol.jugador_id, gol.segundo], ['gol', 'propio', 'j', 4870])
    const accion = h.writes.at(-1)
    assert.deepEqual([accion.tipo, accion.jugador_id, accion.segundo, accion.periodo], ['Gol', 'j', 4870, 2])
    await h.resolver()
    assert.equal(cartel(), null)
    assert.equal(h.activo().state, 1, 'El video sigue')
    assert.match(marcador().textContent, /COM1-0RIV/)

    // Shift + G: gol rival al instante, sin cartel.
    await h.act(async () => {
      h.dom.window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'G', shiftKey: true, bubbles: true, cancelable: true }))
      await esperar()
    })
    const rival = h.guardados.at(-1).fila
    assert.deepEqual([rival.tipo, rival.equipo, rival.jugador_id ?? null], ['gol', 'rival', null])
    assert.equal(cartel(), null)
    assert.match(marcador().textContent, /COM1-1RIV/)
  } finally {
    await h.cerrar()
  }
})

test('Tarjeta (Y) y Cambio (X): fila aparte en la botonera, con cartel', async () => {
  const h = await montar({ eventosPartido: MARCAS })
  try {
    await abrir(h)
    assert.ok(document.querySelector('.mb-fila [data-marcador="tarjeta"]'))
    await enVideo(h, 1200)
    await h.tecla('y')
    await h.act(() => botonEn(cartel(), 'Rival').click())
    await h.act(() => botonEn(cartel(), 'Roja').click())
    await h.act(async () => { botonEn(cartel(), 'Guardar tarjeta').click(); await esperar() })
    const tarjeta = h.guardados.at(-1).fila
    assert.deepEqual([tarjeta.tipo, tarjeta.equipo, tarjeta.tarjeta, tarjeta.jugador_id, tarjeta.segundo], ['tarjeta', 'rival', 'roja', null, 1200])

    // Cambio: «Sale» muestra a las que estaban en cancha (Ana, titular) y «Entra» al resto.
    await enVideo(h, 3600 + 30 * 60)
    await h.click('Cambio')
    const [sale, entra] = cartel().querySelectorAll('fieldset')
    assert.ok(jugadoraEn(sale, 'Ana Prueba')); assert.equal(jugadoraEn(sale, 'Bea Ensayo'), undefined)
    await h.act(async () => { botonEn(cartel(), 'Guardar cambio').click(); await esperar() })
    assert.match(cartel().textContent, /Elegí quién sale y quién entra/)
    await h.act(() => jugadoraEn(sale, 'Ana Prueba').click())
    await h.act(() => jugadoraEn(cartel().querySelectorAll('fieldset')[1], 'Bea Ensayo').click())
    await h.act(async () => { botonEn(cartel(), 'Guardar cambio').click(); await esperar() })
    const cambio = h.guardados.at(-1).fila
    assert.deepEqual([cambio.tipo, cambio.jugadora_sale, cambio.jugadora_entra, cambio.segundo], ['cambio', 'j', 'j2', 5400])
    assert.equal(cartel(), null)
    assert.ok(entra)

    // Cancelar no guarda nada.
    const antes = h.guardados.length
    await h.tecla('x')
    await h.act(() => botonEn(cartel(), 'Cancelar').click())
    assert.equal(cartel(), null)
    assert.equal(h.guardados.length, antes)
  } finally {
    await h.cerrar()
  }
})

test('Pestaña Partido: se escribe el minuto del partido y se convierte solo al segundo del video', async () => {
  const h = await montar({ eventosPartido: MARCAS })
  try {
    await abrir(h)
    await h.act(() => document.getElementById('az-pestana-partido').click())
    const seccion = document.getElementById('pa-goles-titulo').closest('section')
    const input = document.getElementById('pa-gol-tiempo')
    await h.act(async () => {
      Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype, 'value').set.call(input, "67'")
      input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }))
    })
    assert.match(seccion.textContent, /= 2T 22' \(video 81:00\)/)
    await h.act(() => botonEn(seccion, 'Rival').click())
    await h.act(async () => { botonEn(seccion, 'Agregar gol').click(); await esperar() })
    assert.equal(h.guardados.at(-1).fila.segundo, 4860)
    assert.match(seccion.textContent, /2T 22'81:00Gol · Rival/)
  } finally {
    await h.cerrar()
  }
})
