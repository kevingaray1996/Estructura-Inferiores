// Etapa 4 de Análisis: el editor de dibujos montado de verdad (jsdom + YouTube simulado). Guía del editor, ayuda de
// cada herramienta, línea de instrucción y modo seguimiento (cada toque marca y adelanta; Ctrl+Z vuelve; Enter termina).
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { JSDOM } = await import(pathToFileURL(process.env.PIZARRA_DOM_PATH || join(tmpdir(), 'comunicaciones-pizarra-dom/node_modules/jsdom/lib/api.js')).href)

test('Editor de dibujos: guías, ayuda de herramientas y modo seguimiento', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid', pretendToBeVisual: true })
  const w = dom.window
  const previos = new Map()
  const poner = (n, v) => { previos.set(n, Object.getOwnPropertyDescriptor(globalThis, n)); Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true }) }
  for (const n of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame']) poner(n, w[n])
  poner('IS_REACT_ACT_ENVIRONMENT', true)
  // Todo mide 1600 × 900 (jsdom no calcula tamaños).
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 })
  w.confirm = () => true
  // YouTube simulado: guarda el tiempo y el estado; reproducir avisa PLAYING (como el real).
  const jugadores = []
  w.YT = {
    PlayerState: { PLAYING: 1 },
    Player: class {
      constructor(el, opciones) { this.t = opciones.playerVars.start; this.estado = 5; this.opciones = opciones; jugadores.push(this); setTimeout(() => opciones.events.onReady({ target: this }), 0) }
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
  const tecla = (key, extra = {}) => act(() => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, ...extra })) })
  const clic = async (el) => { await act(() => { el.click() }); await esperar() }
  const tocarVideo = async (x, y) => {
    const lienzo = document.querySelector('.dib-lienzo')
    for (const tipo of ['pointerdown', 'pointerup']) {
      await act(() => { lienzo.dispatchEvent(new w.MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y, button: 0 })) })
    }
    await esperar()
  }
  try {
    const Editor = (await vite.ssrLoadModule('/src/components/analisis/dibujo/EditorDibujo.jsx')).default
    const clip = { eventoId: 'e', espejo: false, partidoId: 'p', videoId: 'abcdefghijk', inicio: 10, fin: 20, titulo: 'Clip de prueba' }
    let version = 0
    const montar = async () => { await act(async () => { root.render(h(Editor, { key: ++version, clip, jugadoras: [], onGuardar: async () => ({}), onCerrar() {} })) }); await esperar(60) }

    // 1) Primera vez: la guía del editor, con Siguiente / Anterior / Saltar.
    await montar()
    const guia = () => document.querySelector('.dib-guia')
    assert.ok(guia(), 'La guía aparece la primera vez')
    assert.equal(guia().getAttribute('aria-label'), 'Guía del editor')
    assert.match(guia().textContent, /paso 1 de 11/)
    assert.match(guia().textContent, /Herramientas/)
    assert.ok(document.querySelector('.dib-guia-recuadro'), 'Marca la parte con un recuadro')
    await clic(boton('Siguiente'))
    assert.match(guia().textContent, /paso 2 de 11.*Flechas y zonas que se mueven/s)
    await clic(boton('Anterior'))
    assert.match(guia().textContent, /paso 1 de 11/)
    // Las teclas son de la guía mientras está abierta: «b» no cambia la herramienta.
    await tecla('b')
    assert.equal(document.querySelector('[data-herramienta="pase_bajo"][aria-pressed="true"]'), null)
    await clic(boton('Saltar'))
    assert.equal(guia(), null)
    assert.equal(w.localStorage.getItem('analisis_dibujo_guia_v1'), 'si', 'Se recuerda que ya se vio')

    // 2) La segunda vez no aparece; el botón «?» la vuelve a mostrar; Esc la cierra.
    await montar()
    assert.equal(guia(), null)
    await clic(boton('Ver la guía del editor'))
    assert.ok(guia())
    await tecla('Escape'); await esperar()
    assert.equal(guia(), null)

    // 3) Ayuda de cada herramienta (al pasar el mouse o con el foco) y línea de qué hacer ahora.
    const paseAlto = document.querySelector('[data-herramienta="pase_alto"]')
    await act(() => { paseAlto.focus() })
    const ayuda = document.getElementById('dib-pista')
    assert.ok(ayuda, 'Aparece la ayuda')
    assert.match(ayuda.textContent, /^Pase por alto \(tecla A\)Flecha curva con sombra en el piso\. Para pases elevados o centros\.$/)
    assert.equal(paseAlto.getAttribute('aria-describedby'), 'dib-pista')
    await act(() => { paseAlto.blur() })
    assert.equal(document.getElementById('dib-pista'), null)
    await tecla('b')
    assert.equal(document.querySelector('.dib-instruccion').textContent, 'Hacé clic donde empieza el pase y después donde termina (o arrastrá).')
    // Clic y clic: el primer clic queda esperando el segundo.
    await tocarVideo(100, 100)
    assert.equal(document.querySelector('.dib-instruccion').textContent, 'Ahora hacé clic donde termina el pase.')
    await tocarVideo(500, 300)
    assert.equal(document.querySelectorAll('.dib-linea-fila').length, 3, 'Pausas, Pasos y el pase nuevo')

    // Texto: se escribe ahí mismo, sobre el video. Enter lo deja; Esc lo cancela.
    await tecla('t')
    assert.match(document.querySelector('.dib-instruccion').textContent, /escribilo ahí mismo/)
    const escribir = async (valor) => {
      const campo = document.querySelector('.dib-texto-en-video')
      assert.ok(campo, 'Aparece el campo sobre el video')
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set
      await act(() => { setter.call(campo, valor); campo.dispatchEvent(new w.Event('input', { bubbles: true })) })
      return campo
    }
    await tocarVideo(800, 200)
    let campo = await escribir('Salida limpia')
    await act(() => { campo.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await esperar()
    assert.equal(document.querySelector('.dib-texto-en-video'), null)
    assert.equal(document.querySelectorAll('.dib-linea-fila').length, 4, 'Quedó el texto')
    assert.match(document.querySelector('.dib-propiedades input[type="text"]').value, /^Salida limpia$/)
    await tocarVideo(300, 600)
    campo = await escribir('No va')
    await act(() => { campo.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }); await esperar()
    assert.equal(document.querySelector('.dib-texto-en-video'), null)
    assert.equal(document.querySelectorAll('.dib-linea-fila').length, 4, 'Esc no deja nada')
    assert.equal(document.querySelector('[data-herramienta="texto"]').getAttribute('aria-pressed'), 'true', 'Esc en el campo no cambia la herramienta')

    // 4) Modo seguimiento: la primera vez aparece su guía.
    await clic(document.querySelector('[data-herramienta="anillo"]'))
    assert.equal(guia()?.getAttribute('aria-label'), 'Guía: seguir a una jugadora')
    await clic(boton('Saltar'))
    assert.equal(w.localStorage.getItem('analisis_dibujo_guia_seguimiento_v1'), 'si')
    const cartel = () => document.querySelector('.dib-seguimiento')
    assert.match(cartel().textContent, /Tocá a la jugadora\. Cada toque guarda su posición y adelanta el video solo\. Enter para terminar\./)
    assert.match(cartel().textContent, /Puntos marcados: 0/)
    const player = jugadores[jugadores.length - 1]
    assert.equal(player.t, 10)

    // Cada toque guarda el punto y adelanta 0,5 s (por defecto).
    await tocarVideo(400, 500)
    assert.match(cartel().textContent, /Puntos marcados: 1/)
    assert.equal(player.t, 10.5)
    await tocarVideo(440, 500)
    assert.match(cartel().textContent, /Puntos marcados: 2/)
    assert.equal(player.t, 11)
    assert.ok(document.querySelector('[data-punto-anterior="si"]'), 'El punto anterior se ve tenue')
    // Salto de 1 s (se recuerda).
    await clic(boton('1 s'))
    assert.equal(w.localStorage.getItem('analisis_dibujo_salto_v1'), '1')
    await tocarVideo(480, 500)
    assert.match(cartel().textContent, /Puntos marcados: 3/)
    assert.equal(player.t, 12)
    // Las flechas siguen funcionando para corregir.
    await tecla('ArrowLeft'); await esperar()
    assert.equal(player.t, 11.9)

    // Ctrl+Z borra el último punto y vuelve el video a ese momento.
    await tecla('z', { ctrlKey: true }); await esperar()
    assert.match(cartel().textContent, /Puntos marcados: 2/)
    assert.equal(player.t, 11)
    // Un dibujo de seguimiento con sus puntos clave en la línea del clip.
    assert.equal([...document.querySelectorAll('.dib-linea-fila')].pop().querySelectorAll('.dib-rombo').length, 2)

    // Enter: termina y reproduce la Vista previa.
    await tecla('Enter'); await esperar()
    assert.equal(cartel(), null, 'Sale del modo seguimiento')
    assert.ok(boton('■ Detener vista previa'), 'Arranca la vista previa')
    assert.equal(player.estado, 1)
  } finally {
    await act(() => root.unmount())
    await vite.close()
    w.close()
    for (const [n, d] of previos) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n] }
  }
})
