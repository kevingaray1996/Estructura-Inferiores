// Etiquetado sin esperas en Análisis: varios toques seguidos no se pierden, se ven al instante y se guardan de
// fondo; un corte de conexión se reintenta sin duplicar; atajos de teclado; tramos sin acciones.
// YouTube y Supabase simulados; nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montar } from './helpers/montarAnalisis.mjs'

const texto = () => document.body.textContent
const filas = (estado) => document.querySelectorAll(`article[data-guardado="${estado}"]`).length

test('Un toque: tres acciones seguidas aparecen al instante y se guardan las tres, en orden', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    await h.click('Marcar sin jugadora')
    h.activo().time = 100.2
    // Tres toques sin esperar a la base (antes se perdían dos).
    await h.act(() => { h.tipo('Remate').click(); h.tipo('Remate').click(); h.tipo('Pase correcto').click() })
    h.registradas(3)
    assert.equal(document.querySelectorAll('article[data-guardado="enviando"], article[data-guardado="pendiente"]').length, 3)
    assert.equal(h.tipo('Pase incorrecto').disabled, false, 'Los botones nunca se bloquean mientras se guarda')
    assert.equal(h.writes.length, 1, 'Se envían de a una')
    await h.resolver(); await h.resolver(); await h.resolver()
    assert.deepEqual(h.writes.map((w) => w.tipo), ['Remate', 'Remate', 'Pase correcto'])
    assert.equal(new Set(h.writes.map((w) => w.id)).size, 3)
    h.registradas(3)
    assert.equal(filas('guardada'), 3)
    assert.match(texto(), /Pase correcto|P\+|Pase \+/)
  } finally {
    await h.cerrar()
  }
})

test('Corte de conexión mientras se etiqueta: avisa, sigue marcando y reintenta sin duplicar', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    await h.click('Marcar sin jugadora')
    h.activo().time = 200
    await h.marcar('Remate')
    await h.fallar()
    assert.match(texto(), /Sin guardar · reintentando/)
    assert.match(document.querySelector('.et-alerta-cola').textContent, /1 acción sin guardar/)

    // Se puede seguir marcando con la conexión caída.
    h.activo().time = 210
    await h.marcar('Pérdida')
    h.registradas(2)
    await h.fallar()

    // Vuelve la conexión: «Reintentar ahora» reenvía las dos, con el mismo id (no duplica).
    await h.click('Reintentar ahora')
    await h.resolver(); await h.resolver()
    const ids = h.writes.map((w) => w.id)
    assert.equal(ids.length, 4)
    assert.deepEqual([ids[2], ids[3]].sort(), [ids[0], ids[1]].sort())
    assert.equal(document.querySelector('.et-alerta-cola'), null)
    assert.equal(filas('guardada'), 2)
    h.registradas(2)
  } finally {
    await h.cerrar()
  }
})

test('Atajos: tecla por acción, Espacio, flechas, Ctrl+Z, ayuda, editar una tecla y escribir en un campo', async () => {
  const h = await montar()
  try {
    await h.iniciar()
    await h.click('Marcar sin jugadora')
    assert.match(texto(), /Atajos (activos|pausados)/)
    const boton = h.tipo('Pase correcto')
    assert.equal(boton.querySelector('kbd').textContent, '+')

    // «+» marca Pase +, con aviso corto y el botón iluminado.
    h.activo().time = 1390.4
    await h.tecla('+')
    assert.equal(h.writes.at(-1).tipo, 'Pase correcto')
    assert.equal(h.writes.at(-1).segundo, 1390)
    assert.match(document.querySelector('.et-aviso').textContent, /· 23:10/)
    assert.ok(h.tipo('Pase correcto').classList.contains('et-iluminado'))
    await h.resolver()

    // Ctrl+Z deshace la última (ya guardada: se borra de la base).
    await h.tecla('z', { ctrlKey: true })
    assert.equal(h.borrados.length, 1)
    h.registradas(0)

    // Espacio: pausa/sigue. Flechas: 5 s atrás/adelante, encadenables sin esperar a YouTube.
    const estadoAntes = h.activo().state
    await h.tecla(' ')
    assert.notEqual(h.activo().state, estadoAntes)
    h.activo().time = 60
    await h.tecla('ArrowRight'); await h.tecla('ArrowRight')
    assert.equal(h.activo().pending, 70, 'Dos → seguidas saltan 10 s')
    await h.act(() => h.activo().confirmarSalto()); await h.tick()

    // Escribiendo en un campo, las teclas escriben normal (no marcan).
    const campo = document.querySelector('input:not([type="checkbox"]):not([type="radio"]):not([type="range"])')
    assert.ok(campo)
    const antes = h.writes.length
    await h.act(() => { campo.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })) })
    assert.equal(h.writes.length, antes)

    // «?» muestra los atajos; se cambia la tecla de Pérdida a «q» y queda guardada en esta computadora.
    // G, Y y X son del marcador (gol, tarjeta y cambio): no se pueden dar a una acción.
    await h.tecla('?')
    assert.match(texto(), /Atajos de teclado/)
    const fila = [...document.querySelectorAll('.et-ayuda li')].find((li) => li.textContent.includes('Pérdida'))
    await h.act(() => [...fila.querySelectorAll('button')].find((b) => b.textContent === 'Cambiar tecla').click())
    await h.tecla('+')
    assert.match(texto(), /ya es de/, 'No deja repetir una tecla')
    await h.tecla('x')
    assert.match(texto(), /son del marcador/, 'La X es del marcador')
    await h.tecla('q')
    assert.equal(JSON.parse(h.dom.window.localStorage.getItem('analisis_atajos_v1')).Pérdida, 'q')
    assert.equal(h.tipo('Pérdida').querySelector('kbd').textContent, 'Q')
    h.activo().time = 75
    await h.tecla('q')
    assert.equal(h.writes.at(-1).tipo, 'Pérdida')
    await h.resolver()
  } finally {
    await h.cerrar()
  }
})

test('Tramos sin acciones: lista los huecos largos de cada tiempo', async () => {
  const eventos = [10, 40, 400, 430].map((segundo, i) => ({
    id: `t${i}`, partido_id: 'p1', jugador_id: 'j', tipo: 'Pérdida', resultado: 'Fallido', segundo, periodo: 1,
    zona: null, coordenada_x: null, coordenada_y: null, observaciones: null,
  }))
  const h = await montar({ eventos })
  try {
    await h.iniciar()
    assert.match(texto(), /Tramos sin acciones \(1\)/)
    assert.match(texto(), /1\.er tiempo · 00:40 a 06:40 \(6 min\)/)
  } finally {
    await h.cerrar()
  }
})
