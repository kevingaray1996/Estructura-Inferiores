// Etapa F: Wellness muestra el entrenamiento del día con sus bloques de Gimnasio y Cancha.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ambitoBloque, lineasTecnica, recetaGimnasio, resumenBloques } from '../src/utils/planificacion.js'
import { SET_INICIAL } from '../src/utils/bibliotecaInicial.js'

const id = '20000000-0000-4000-8000-000000000001'
// Lo que devuelve planificacion_publica_hoy (item_publico de la etapa C) para una sesión de dos bloques.
const sesion = {
  id, fecha: '2026-11-16', hora: '18:00:00', lugar: 'Predio', objetivo: 'Fuerza y salida',
  bloques: [
    { nombre: 'Gimnasio', ambito: 'gimnasio', duracion: 30, ejercicios: [
      { nombre: 'Sentadilla búlgara', series: '4', repeticiones: '8', carga: '20 kg', tecnica: '- Rodilla alineada con el pie\nTronco erguido\n',
        demostracion: { tipo: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', credito: 'Canal' } },
      { nombre: 'Plancha frontal', series: '3', demostracion: { tipo: 'youtube', url: 'https://otra.web/video', credito: '' } },
    ] },
    { nombre: 'Salida', ambito: 'cancha', ejercicios: [{ nombre: 'Salida con 3', duracion: 15, indicaciones: 'La 5 baja', pizarra: SET_INICIAL[0].pizarra }] },
    { nombre: 'Vuelta a la calma', indicaciones: 'Elongación', ejercicios: [] },
  ],
}

test('Receta, técnica y resumen de los bloques', () => {
  assert.equal(recetaGimnasio({ series: '4', repeticiones: '8', carga: '20 kg' }), '4 × 8 · 20 kg')
  assert.equal(recetaGimnasio({ series: '3' }), '3 series')
  assert.equal(recetaGimnasio({ repeticiones: '10', carga: '' }), '10 repeticiones')
  assert.equal(recetaGimnasio({ carga: '70% 1RM' }), '70% 1RM')
  assert.equal(recetaGimnasio({}), '')
  assert.deepEqual(lineasTecnica('- Rodilla alineada\n\n• Tronco erguido\n  '), ['Rodilla alineada', 'Tronco erguido'])
  assert.equal(ambitoBloque({ ambito: 'pileta' }), null)
  assert.equal(ambitoBloque({ ambito: 'toString' }), null, 'solo ámbitos propios')
  assert.deepEqual(resumenBloques(sesion.bloques), [
    { ambito: 'gimnasio', texto: 'Gimnasio · 2 ejercicios' }, { ambito: 'cancha', texto: 'Cancha · 1 tarea' }, { ambito: null, texto: 'Vuelta a la calma' }])
})

test('Wellness: bloques de Gimnasio y Cancha, receta del día, técnica y demostración sin cargar el video', async () => {
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{
    name: 'wellness-sin-backend', enforce: 'pre',
    resolveId(s) { if (s.endsWith('/supabaseClient')) return '\0wellness-mock' },
    load(i) { if (i === '\0wellness-mock') return 'export const supabase={from(){throw Error("No acceder al backend")},rpc(){throw Error("No escribir")}}' },
  }] })
  try {
    const { ContenidoEntrenamientoHoy } = await server.ssrLoadModule('/src/components/EntrenamientoDeHoy.jsx')
    const html = renderToStaticMarkup(createElement(ContenidoEntrenamientoHoy, { sesiones: [sesion] }))
    assert.match(html, /Tu entrenamiento de hoy/)
    assert.match(html, /aria-label="Bloques de hoy"/)
    assert.match(html, /Gimnasio · 2 ejercicios/); assert.match(html, /Cancha · 1 tarea/)
    assert.match(html, /class="eh-bloque eh-gimnasio"/); assert.match(html, /class="eh-bloque eh-cancha"/); assert.match(html, /class="eh-bloque"/)
    assert.match(html, /Bloque 1<\/span><h3>Gimnasio<\/h3>/, 'sin repetir el nombre'); assert.match(html, /Bloque 2 · Cancha<\/span><h3>Salida<\/h3>/)
    assert.match(html, /4 × 8 · 20 kg/)
    assert.match(html, /<li>Rodilla alineada con el pie<\/li><li>Tronco erguido<\/li>/)
    assert.match(html, /i\.ytimg\.com\/vi\/dQw4w9WgXcQ/, 'miniatura de la demostración')
    assert.doesNotMatch(html, /<iframe/, 'el video no se carga hasta abrir la demostración')
    assert.doesNotMatch(html, /otra\.web/, 'una demostración inválida no se muestra')
    assert.match(html, /class="eh-pizarra"[^>]*><svg/, 'la jugada de cancha muestra su pizarra en miniatura'); assert.match(html, /Ver ejercicio/)
    assert.doesNotMatch(html, /<input|<textarea|<select/)
    // Una sesión vieja (sin ámbitos) se sigue viendo como antes, sin resumen ni etiquetas de ámbito.
    const vieja = renderToStaticMarkup(createElement(ContenidoEntrenamientoHoy, { sesiones: [{ id, fecha: '2026-11-16', bloques: [{ nombre: 'Entrada en calor', ejercicios: [{ nombre: 'Trote', series: '2' }] }] }] }))
    assert.match(vieja, /Bloque 1<\/span><h3>Entrada en calor<\/h3>/); assert.match(vieja, /Series: 2/); assert.doesNotMatch(vieja, /Bloques de hoy|eh-gimnasio|eh-cancha/)
    const css = readFileSync(new URL('../src/components/entrenamientoHoy.css', import.meta.url), 'utf8')
    assert.doesNotMatch(css, /!important|#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'colores solo del tema')
  } finally { await server.close() }
})
