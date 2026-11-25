// Etapa 5 de Análisis: el editor montado de verdad (jsdom + YouTube simulado) en «Pizarra 2D». Pide calibrar la
// primera vez (con su guía), se eligen puntos en la cancha chica y se marcan en el video, aparecen las líneas de
// control, la 2D muestra las fichas, se agrega una ficha en un cuadro y se guarda en la Biblioteca de jugadas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

// Cámara inventada (cancha en metros → video de 0 a 1), la misma de pizarra2dAnalisis.test.mjs.
const CAMARA = [0.008, 0.002, 0.1, 0.0005, 0.006, 0.25, 0.00002, 0.004, 1]
const enVideo = ({ x, y }) => { const w = CAMARA[6] * x + CAMARA[7] * y + CAMARA[8]; return { x: (CAMARA[0] * x + CAMARA[1] * y + CAMARA[2]) / w, y: (CAMARA[3] * x + CAMARA[4] * y + CAMARA[5]) / w } }
const PUNTOS = [
  ['Mitad de cancha con el lateral de arriba', { x: 50, y: 0 }],
  ['Centro de la cancha', { x: 50, y: 32 }],
  ['Área grande (izquierda): esquina del frente, arriba', { x: 16.5, y: 32 - 20.16 }],
  ['Área grande (izquierda): esquina del frente, abajo', { x: 16.5, y: 32 + 20.16 }],
]

test('Pizarra 2D en el editor: calibrar, ver fichas, agregar una y guardar en la Biblioteca', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid', pretendToBeVisual: true })
  const w = dom.window
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']) poner(n, w[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 })
  w.confirm = () => true
  // La guía del editor ya se vio: así se ve la de calibración.
  w.localStorage.setItem('analisis_dibujo_guia_v1', 'si')
  w.YT = {
    PlayerState: { PLAYING: 1 },
    Player: class {
      constructor(el, opciones) { this.t = opciones.playerVars.start; this.estado = 5; this.opciones = opciones; setTimeout(() => opciones.events.onReady({ target: this }), 0) }
      getCurrentTime() { return this.t }
      getPlayerState() { return this.estado }
      getPlaybackRate() { return 1 }
      seekTo(t) { this.t = t }
      pauseVideo() { this.estado = 2 }
      playVideo() { this.estado = 1; this.opciones.events.onStateChange?.({ target: this, data: 1 }) }
      mute() {} unMute() {} destroy() {}
    },
  }

  const { act, createElement: h } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const vite = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  const esperar = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)))
  const boton = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === texto || b.getAttribute('aria-label') === texto)
  const clic = async (el) => { await act(() => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) }); await esperar() }
  const tocarVideo = async (p) => {
    const lienzo = document.querySelector('.dib-lienzo')
    for (const tipo of ['pointerdown', 'pointerup']) {
      await act(() => { lienzo.dispatchEvent(new w.MouseEvent(tipo, { bubbles: true, clientX: p.x * 1600, clientY: p.y * 900, button: 0 })) })
    }
    await esperar()
  }
  try {
    const Editor = (await vite.ssrLoadModule('/src/components/analisis/dibujo/EditorDibujo.jsx')).default
    const clip = { eventoId: 'e', espejo: false, partidoId: 'p', videoId: 'abcdefghijk', inicio: 10, fin: 14, titulo: 'Salida por abajo' }
    // Una jugadora nuestra seguida con anillo (de la etapa 4, versión 1).
    const dibujoInicial = {
      version: 1, clip: { inicio: 10, fin: 14 }, pausas: [], subtitulos: [],
      objetos: [{ id: 'a', tipo: 'anillo', desde: 10, hasta: 14, color: 'amarillo', grosor: 2, efectos: {}, pista: { fuente: 'manual', claves: [{ t: 10, x: 0.4, y: 0.45 }, { t: 13, x: 0.45, y: 0.5 }] } }],
    }
    const guardados = []
    const biblioteca = {
      cargarCarpetas: async () => ({ carpetas: [{ id: 'k1', ambito: 'cancha', nombre: 'Sin clasificar', orden: 0, sistema: true }, { id: 'k2', ambito: 'cancha', nombre: 'Jugadas de partido', orden: 10, sistema: false }] }),
      guardar: async (form) => { guardados.push(form); return { id: 'nuevo' } },
    }
    let pegado = null
    await act(async () => {
      root.render(h(Editor, { clip, dibujoInicial, jugadoras: [], biblioteca, rival: null, canchaPartido: { largo: 100, ancho: 64 }, onGuardar: async (d) => { pegado = d; return {} }, onCerrar() {} }))
    })
    await esperar(80)

    // 1) Pasar a «Pizarra 2D» la primera vez: pide calibrar y abre la guía de calibración.
    await clic(boton('Pizarra 2D'))
    const guia = () => document.querySelector('.dib-guia')
    assert.equal(guia()?.getAttribute('aria-label'), 'Guía: calibrar la cancha')
    assert.match(guia().textContent, /Medidas de la cancha/)
    await clic(boton('Saltar'))
    assert.equal(w.localStorage.getItem('analisis_dibujo_guia_calibracion_v1'), 'si')
    assert.ok(document.querySelector('.dib-calibrar'), 'Se ve el panel de calibración')
    assert.equal(document.querySelectorAll('.dib-mini-punto').length, 29, 'La cancha chica tiene los puntos conocidos')
    // Las herramientas de dibujo quedan apagadas en la 2D.
    assert.ok(document.querySelector('[data-herramienta="pase_bajo"]').disabled)

    // 2) Sin elegir punto, el clic en el video avisa.
    await tocarVideo({ x: 0.5, y: 0.5 })
    assert.match(document.querySelector('.dib-controles').textContent, /Primero elegí en la cancha chica/)

    // 3) Elegir cada punto y marcarlo en el video.
    for (const [nombre, metros] of PUNTOS) {
      const punto = document.querySelector(`.dib-mini-punto[aria-label^="${nombre}"]`)
      assert.ok(punto, nombre)
      await clic(punto)
      assert.match(document.querySelector('.dib-calibrar .dib-instruccion').textContent, new RegExp(`donde está: ${nombre.replace(/[()]/g, '.')}`))
      await tocarVideo(enVideo(metros))
    }
    assert.match(document.querySelector('.dib-calibrar').textContent, /Puntos marcados: 4/)
    assert.match(document.querySelector('.dib-calibrar').textContent, /Calibración lista/)
    assert.ok(document.querySelectorAll('[data-calibracion] .dib-cal-linea').length >= 5, 'Las líneas de la cancha aparecen sobre el video')
    await clic(boton('Listo'))

    // 4) La 2D muestra la ficha de la jugadora seguida.
    assert.equal(document.querySelector('.dib-calibrar'), null)
    assert.ok(document.querySelector('.dib-2d [data-elemento="a"]'), 'Ficha de la jugadora seguida')

    // 5) Agregar jugadora en este cuadro.
    await clic(boton('+ Agregar jugadora en este cuadro'))
    await tocarVideo(enVideo({ x: 30, y: 40 }))
    const fichas = [...document.querySelectorAll('.dib-2d [data-elemento]')].map((e) => e.getAttribute('data-elemento'))
    assert.equal(fichas.length, 2, fichas.join())
    assert.match(document.querySelector('.dib-propiedades').textContent, /Ficha \(solo 2D\)/)

    // 6) Guardar en la Biblioteca de jugadas: carpeta elegida, enlace al clip y pizarra válida.
    await clic(boton('Guardar en Biblioteca de jugadas'))
    await esperar(40)
    const ventana = document.querySelector('[aria-label="Guardar en Biblioteca de jugadas"]')
    assert.ok(ventana)
    assert.match(ventana.textContent, /2 fichas/)
    assert.equal(ventana.querySelector('select').value, 'k2', 'Propone la carpeta de jugadas')
    await clic([...ventana.querySelectorAll('button')].find((b) => b.textContent === 'Guardar'))
    await esperar(40)
    assert.equal(guardados.length, 1)
    assert.equal(guardados[0].tipo, 'jugada'); assert.equal(guardados[0].carpeta_id, 'k2')
    assert.equal(guardados[0].link_video, 'https://www.youtube.com/watch?v=abcdefghijk&t=10s')
    assert.equal(guardados[0].pizarra.elementos.filter((e) => e.tipo === 'jugadora').length, 2)
    assert.match(document.querySelector('[aria-label="Guardar en Biblioteca de jugadas"]').textContent, /Guardada en la Biblioteca/)
    await clic(boton('Cerrar'))

    // 7) «Pegar en la línea de tiempo» guarda la versión 2 con la calibración y la ficha.
    await clic(boton('Pegar en la línea de tiempo'))
    assert.equal(pegado.version, 2)
    assert.equal(pegado.calibraciones.length, 1)
    assert.equal(pegado.calibraciones[0].puntos.length, 4)
    assert.deepEqual(pegado.cancha, { largo: 100, ancho: 64 })
    assert.ok(pegado.objetos.some((o) => o.tipo === 'ficha'))
  } finally {
    await act(async () => { root.unmount() })
    await vite.close()
    for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
    dom.window.close()
  }
})
