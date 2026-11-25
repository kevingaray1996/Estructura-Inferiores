// «✎ Dibujar» en la tarjeta de cada acción (lista Acciones), con Análisis montado de verdad (YouTube y Supabase
// simulados). Coordinación en la compu: aparece en cualquier acción, detallada o no, sin depender del ancho de la
// ventana; si la ventana es angosta, al tocarlo explica qué hacer. Celular o tablet sin mouse: no aparece.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const ev = (id, tipo, segundo, extra = {}) => ({
  id, partido_id: 'p1', jugador_id: 'j', tipo, resultado: null, segundo, periodo: 1, zona: 'Medio centro',
  coordenada_x: null, coordenada_y: null, observaciones: null, ...extra,
})
const EVENTOS = [
  ev('a', 'Pérdida', 100),
  ev('b', 'Duelo aéreo', 200, { resultado: 'Ganado', coordenada_x: 40, coordenada_y: 30, zona: 'Medio izquierda' }),
  ev('c', 'Recuperación', 300, { jugador_id: null }),
  ev('d', 'Pase', 400),
]
const panel = () => document.getElementById('az-panel-playlist')
const filas = () => [...panel().querySelectorAll('article')]
const dibujar = (fila) => [...fila.querySelectorAll('button')].find((b) => b.textContent.trim() === '✎ Dibujar')

// Equipo simulado: con o sin mouse, y el ancho de la ventana.
function equipo(h, { mouse, ancho }) {
  h.dom.window.matchMedia = (q) => ({ matches: q === '(any-pointer: fine)' ? mouse : false, addEventListener() {}, removeEventListener() {} })
  Object.defineProperty(h.dom.window, 'innerWidth', { value: ancho, configurable: true })
}

async function abrir(h) {
  await h.iniciar()
  await h.act(() => document.getElementById('az-pestana-playlist').click())
}

async function abrirTarjeta(h, i) {
  await h.act(() => filas()[i].querySelector('.pl-fila-resumen').click())
  return filas()[i]
}

test('Coordinación en la compu: «✎ Dibujar» en la tarjeta de cualquier acción, aunque la ventana sea angosta', async () => {
  const h = await montar({ eventos: EVENTOS })
  try {
    // Ventana angosta (por ejemplo, Análisis en dos ventanas): antes el botón desaparecía sin aviso.
    equipo(h, { mouse: true, ancho: 900 })
    await abrir(h)
    assert.equal(filas().length, EVENTOS.length)
    for (let i = 0; i < EVENTOS.length; i++) {
      const fila = await abrirTarjeta(h, i)
      assert.ok(dibujar(fila), `Falta «✎ Dibujar» en ${EVENTOS[i].tipo}`)
      assert.ok([...fila.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Editar todo'))
    }
    // Al tocarlo con la ventana angosta, explica qué hacer (no abre el editor).
    const duelo = await abrirTarjeta(h, 1)
    await h.act(async () => { dibujar(duelo).click(); await new Promise((r) => setTimeout(r, 0)) })
    assert.match(document.body.textContent, /agrandá la ventana: el editor necesita al menos 1024 px de ancho \(ahora tiene 900\)/)
    assert.equal(document.querySelector('.dib-editor'), null)
  } finally {
    await h.cerrar()
  }
})

test('Celular o tablet sin mouse: la tarjeta no ofrece «✎ Dibujar»', async () => {
  const h = await montar({ eventos: EVENTOS })
  try {
    equipo(h, { mouse: false, ancho: 1400 })
    await abrir(h)
    const fila = await abrirTarjeta(h, 0)
    assert.equal(dibujar(fila), undefined)
    assert.ok([...fila.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Editar todo'))
  } finally {
    await h.cerrar()
  }
})
