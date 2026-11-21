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
    assert.equal(campo('Zona').closest('label').dataset.falta, 'si')
    await h.act(async () => { await h.cambio(campo('Zona'), 'Ataque derecha'); await new Promise((r) => setTimeout(r, 0)) })
    assert.deepEqual(h.actualizaciones.at(-1), { id: 'b', zona: 'Ataque derecha' })
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
