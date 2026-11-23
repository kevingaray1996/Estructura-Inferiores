// Etapa 1 de Análisis: los partidos de scouting y las acciones colectivas no se cuentan en lo de siempre (Playlist,
// explorador, estadísticas, mapa, informe). En scouting solo hay botonera colectiva. YouTube y Supabase simulados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE } from '../src/utils/analisis/catalogoAcciones.js'
import { montar } from './helpers/montarAnalisis.mjs'

const tipos = [
  ...CATALOGO_BASE,
  { codigo: 'Salida', etiqueta: 'Salida', etiqueta_boton: 'Salida', icono: '•', color: 'acento', ubicacion: 'opcional', resultados: [],
    resultado_implicito: null, es_pase: false, grupo: 'con_pelota', orden: 101, visible: true, atajo: null, botonera: 'colectiva', duracion_defecto: 15, espejo: null },
]
const eventos = [
  { id: 'e1', partido_id: 'p1', jugador_id: 'j', tipo: 'Remate', segundo: 40, periodo: 1, resultado: 'Gol' },
  { id: 'm1', partido_id: 'p1', jugador_id: null, tipo: 'Salida', segundo: 30, segundo_fin: 45, periodo: 1, resultado: null },
  { id: 'm2', partido_id: 's1', jugador_id: null, tipo: 'Salida', segundo: 10, segundo_fin: 25, periodo: 1, resultado: null },
]
const scouting = {
  id: 's1', tipo_partido: 'scouting', equipo_local: 'Estrella del Sur', equipo_visitante: 'Otro Club', equipo_analizado: 'local',
  rival: 'Estrella del Sur', fecha: '2026-11-01', categoria_id: 'cat', direccion_primer_tiempo: 'derecha', partido_calendario_id: null,
  video_url: 'https://www.youtube.com/watch?v=abc123def45',
}
const opciones = () => [...document.querySelectorAll('option')].map((o) => o.textContent)

test('Scouting y momentos colectivos no cuentan en Playlist, explorador, estadísticas, mapa ni informe', async () => {
  const h = await montar({ tipos, eventos })
  try {
    try { h.dom.window.localStorage.clear() } catch { /* Sin almacenamiento. */ }
    h.datos.analisis_partidos.push(scouting)
    await h.iniciar()

    // Biblioteca: el scouting se distingue y se filtra.
    assert.match(document.body.textContent, /Estrella del Sur vs Otro Club/)
    assert.ok(document.querySelector('.bib-chip'), 'Marca «Scouting»')
    assert.match(document.body.textContent, /1 momentos/)
    const filtro = (texto) => [...document.querySelectorAll('.bib-filtros button')].find((b) => b.textContent === texto)
    await h.act(() => filtro('Propios').click())
    assert.doesNotMatch(document.body.textContent, /Estrella del Sur vs Otro Club/)
    await h.act(() => filtro('Todos').click())

    // Partido propio: el momento colectivo no entra en la Playlist (solo el Remate).
    h.registradas(1)

    // Explorador, estadísticas y mapa: solo partidos propios.
    await h.click('Explorador de acciones')
    assert.ok(!opciones().some((t) => t.includes('Estrella del Sur')), 'El explorador no ofrece el scouting')
    await h.click('Estadísticas')
    await h.click('Todos los partidos')
    assert.match(document.body.textContent, /Acumulado de 1 partidos registrados/)
    await h.click('Mapa')
    await h.click('Todos los partidos')
    assert.ok(!opciones().some((t) => t.includes('Estrella del Sur')), 'El mapa acumulado no ofrece el scouting')

    // Scouting: sin Informe, sin botonera individual.
    const tarjeta = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Estrella del Sur vs Otro Club'))
    await h.act(() => tarjeta.click())
    assert.equal([...document.querySelectorAll('nav button')].some((b) => b.textContent.includes('Informe')), false, 'Sin Informe en scouting')
    const individual = [...document.querySelectorAll('.col-selector button')].find((b) => b.textContent === 'Individual')
    assert.ok(individual?.disabled, 'La botonera individual queda deshabilitada')
    assert.ok(document.querySelector('[data-tipo-colectivo="Salida"]'), 'Se ve la colectiva')
    assert.equal(document.querySelector('[data-tipo-rapido="Remate"]'), null)
  } finally {
    await h.cerrar()
  }
})
