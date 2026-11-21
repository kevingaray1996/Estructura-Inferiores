// Análisis 2B: Playlist. Tocar una acción salta 3 s antes; ↑ / ↓; dorsal; detalle en la fila; pendientes,
// avance automático y repetir clip. YouTube y Supabase simulados; nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const ev = (id, tipo, segundo, extra = {}) => ({
  id, partido_id: 'p1', jugador_id: 'j', tipo, resultado: null, segundo, periodo: 1, zona: 'Medio centro',
  coordenada_x: null, coordenada_y: null, observaciones: null, ...extra,
})
const panel = () => document.getElementById('az-panel-playlist')
const filas = () => [...panel().querySelectorAll('article')]
const resumen = (i) => filas()[i].querySelector('.pl-fila-resumen')
const activa = () => filas().findIndex((f) => f.dataset.activa === 'si')
const campo = (texto) => [...panel().querySelectorAll('.pl-detalle label')].find((l) => l.textContent.startsWith(texto)).querySelector('select')

async function abrirPlaylist(h) {
  await h.iniciar()
  await h.act(() => document.getElementById('az-pestana-playlist').click())
}

test('Tocar una acción la elige y el video arranca 3 s antes', async () => {
  const h = await montar({ eventos: [ev('a', 'Pérdida', 100), ev('b', 'Pérdida', 200)] })
  try {
    await abrirPlaylist(h)
    await h.act(() => resumen(1).click())
    assert.equal(activa(), 1)
    assert.equal(h.activo().pending, 197)
    assert.equal(h.activo().state, 1, 'Queda reproduciendo')
  } finally {
    await h.cerrar()
  }
})

test('↑ / ↓ mueven la acción elegida con el video, y el dorsal elige a la jugadora', async () => {
  const h = await montar({ eventos: [ev('a', 'Pérdida', 100), ev('b', 'Pérdida', 200), ev('c', 'Pérdida', 300)] })
  try {
    await abrirPlaylist(h)
    await h.tecla('ArrowDown')
    assert.equal(activa(), 0)
    await h.tecla('ArrowDown')
    assert.equal(activa(), 1)
    assert.equal(h.activo().pending, 197)
    await h.tecla('ArrowUp')
    assert.equal(activa(), 0)

    // Bea lleva la 7: se elige al instante. Ana lleva la 10: con «1» espera el segundo número.
    await h.tecla('7')
    await h.act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'a', jugador_id: 'j2' })
    await h.tecla('1'); await h.tecla('0')
    await h.act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'a', jugador_id: 'j' })

    // En Etiquetado, ↑ / ↓ no mueven la Playlist.
    await h.act(() => document.getElementById('az-pestana-etiquetado').click())
    await h.tecla('ArrowDown')
    assert.equal(activa(), 0)
  } finally {
    await h.cerrar()
  }
})

test('Pendientes de detallar, progreso y avance automático a la siguiente pendiente', async () => {
  const h = await montar({ eventos: [ev('a', 'Remate', 100), ev('b', 'Pérdida', 200), ev('c', 'Remate', 300)] })
  try {
    await abrirPlaylist(h)
    assert.match(panel().textContent, /1 de 3 detalladas/)
    await h.act(() => [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Pendientes de detallar').click())
    assert.equal(filas().length, 2)

    await h.act(() => resumen(0).click())
    const gol = [...panel().querySelectorAll('.pl-detalle button')].find((b) => b.textContent === 'Gol')
    await h.act(async () => { gol.click(); await new Promise((r) => setTimeout(r, 0)) })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'a', resultado: 'Gol' })
    assert.match(panel().textContent, /2 de 3 detalladas/)
    // La detallada sale del filtro y queda elegida la siguiente pendiente, con su clip.
    assert.equal(filas().length, 1)
    assert.equal(activa(), 0)
    assert.equal(h.activo().pending, 297)
  } finally {
    await h.cerrar()
  }
})

test('Filtro por tipo y zona en la misma fila', async () => {
  const h = await montar({ eventos: [ev('a', 'Remate', 100), ev('b', 'Pérdida', 200, { zona: null })] })
  try {
    await abrirPlaylist(h)
    const tipo = [...panel().querySelectorAll('.pl-filtros label')].find((l) => l.textContent.startsWith('Acción')).querySelector('select')
    await h.cambio(tipo, 'Pérdida')
    assert.equal(filas().length, 1)
    await h.act(() => resumen(0).click())
    // La zona se marca en la cancha de la fila (ver la prueba de Zona); sin punto ni zona, queda señalada.
    assert.equal(filas()[0].querySelector('.pl-cancha').dataset.falta, 'si')
  } finally {
    await h.cerrar()
  }
})

test('Receptora de un pase en la misma fila', async () => {
  const h = await montar({ eventos: [ev('p', 'Pase correcto', 100, { resultado: 'Exitoso' })] })
  try {
    await abrirPlaylist(h)
    await h.act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    await h.act(() => resumen(0).click())
    assert.match(filas()[0].textContent, /Falta receptora/)
    await h.act(async () => { await h.cambio(campo('Receptora'), 'j2'); await new Promise((r) => setTimeout(r, 0)) })
    assert.equal(h.rpcs.at(-1).p_destinataria_id, 'j2')
    assert.equal(h.rpcs.at(-1).p_destinataria_estado, 'identificada')
    assert.match(filas()[0].textContent, /Detallada/)
    assert.match(filas()[0].textContent, /→ Bea Ensayo/)
  } finally {
    await h.cerrar()
  }
})

test('Repetir clip: al llegar a 5 s después vuelve a 3 s antes', async () => {
  const h = await montar({ eventos: [ev('a', 'Pérdida', 100)] })
  try {
    await abrirPlaylist(h)
    await h.act(() => resumen(0).click())
    await h.act(() => h.activo().confirmarSalto()); await h.tick()
    await h.act(() => [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Repetir clip').click())
    await h.act(() => h.activo().confirmarSalto()); await h.tick()
    h.activo().time = 105.3
    await h.tick()
    assert.equal(h.activo().pending, 97)
  } finally {
    await h.cerrar()
  }
})

test('Zona: una acción vieja con punto ya no «falta zona» (calculada) y la cancha de la fila guarda punto y zona', async () => {
  // El partido de prueba ataca a la derecha en el 1T. «v» es vieja (sin dirección de captura) con punto y sin zona;
  // «n» es nueva (marcada con un toque), sin punto ni zona.
  const h = await montar({ eventos: [
    ev('v', 'Pérdida', 100, { zona: null, coordenada_x: 80, coordenada_y: 20 }),
    ev('n', 'Pérdida', 200, { zona: null, sistema_coordenadas: 'visual_v1', direccion_captura: 'izquierda', periodo_captura: 1 }),
  ] })
  try {
    await abrirPlaylist(h)
    assert.match(filas()[0].textContent, /Ataque izquierda \(calculada\)/)
    assert.match(filas()[0].textContent, /Detallada/)
    assert.match(filas()[1].textContent, /Falta zona/)

    // Con el mouse: se toca el lugar (la cancha mide 200 × 128 en esta prueba).
    await h.act(() => resumen(1).click())
    const svg = filas()[1].querySelector('.pl-cancha-svg')
    assert.match(filas()[1].querySelector('.pl-cancha').textContent, /Atacamos ←/)
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 128, right: 200, bottom: 128 })
    await h.act(async () => {
      svg.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true, clientX: 20, clientY: 64 }))
      await new Promise((r) => setTimeout(r, 0))
    })
    // Atacando a la izquierda, x = 10 es campo rival.
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'n', coordenada_x: 10, coordenada_y: 50, zona: 'Ataque centro' })

    // Con el teclado: cada sector es un botón. En la vieja (1T a la derecha), arriba a la derecha es Ataque izquierda.
    await h.act(() => resumen(0).click())
    const sector = [...filas()[0].querySelectorAll('.pl-cancha-sector')].find((r) => r.getAttribute('aria-label') === 'Marcar en Defensa derecha')
    await h.act(async () => {
      sector.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await new Promise((r) => setTimeout(r, 0))
    })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'v', coordenada_x: 16.7, coordenada_y: 83.3, zona: 'Defensa derecha' })
    assert.doesNotMatch(filas()[0].textContent, /calculada/, 'Ya quedó guardada')

    await h.act(async () => {
      [...filas()[0].querySelectorAll('button')].find((b) => b.textContent === 'Quitar punto').click()
      await new Promise((r) => setTimeout(r, 0))
    })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'v', coordenada_x: null, coordenada_y: null, zona: null })
    assert.match(filas()[0].textContent, /Falta zona/)
  } finally {
    await h.cerrar()
  }
})
