// Dibujos nivel profesional, montados de verdad (jsdom + YouTube simulado): anillo con hueco, plantilla del pase
// incorrecto con «Opciones de pase», línea defensiva sin calibrar, cámara lenta (en el editor y en la capa que usan el
// video de Análisis y las playlists), pausa explicativa y «Mi estilo».
import test from 'node:test'
import assert from 'node:assert/strict'
import { montarComponente } from './helpers/montarComponente.mjs'

// Reproductor simulado: guarda las velocidades que se le piden.
function youtubeFalso(w, registro) {
  w.YT = {
    PlayerState: { PLAYING: 1 },
    Player: class {
      constructor(el, opciones) {
        this.t = opciones.playerVars?.start ?? 0; this.estado = 5; this.velocidad = 1; this.opciones = opciones
        registro.player = this
        setTimeout(() => opciones.events.onReady({ target: this }), 0)
      }
      getCurrentTime() { return this.t }
      getPlayerState() { return this.estado }
      getPlaybackRate() { return this.velocidad }
      setPlaybackRate(v) { this.velocidad = v; registro.velocidades.push(v) }
      seekTo(t) { this.t = t }
      pauseVideo() { this.estado = 2 }
      playVideo() { this.estado = 1; this.opciones.events.onStateChange?.({ target: this, data: 1 }) }
      loadVideoById({ startSeconds }) { this.t = startSeconds; this.estado = 1 }
      mute() {} unMute() {} destroy() {}
    },
  }
}

const anillo = (id, x, y, jugadora) => ({
  id, tipo: 'anillo', desde: 10, hasta: 20, color: 'amarillo', grosor: 2, efectos: { entrada: false, pulso: false, sombra: false, rastro: false },
  pista: { fuente: 'manual', claves: [{ t: 10, x, y }] }, ...(jugadora ? { jugadora } : {}),
})

test('editor: hueco del anillo, opciones de pase desde la plantilla, línea defensiva, cámara lenta, pausa explicativa y mi estilo', async () => {
  const registro = { velocidades: [] }
  const m = await montarComponente({
    antes: (w) => {
      youtubeFalso(w, registro)
      w.localStorage.setItem('analisis_dibujo_guia_v1', 'si')
      w.localStorage.setItem('analisis_dibujo_guia_seguimiento_v1', 'si')
    },
  })
  const { w, act, esperar, boton, clic } = m
  const tecla = (key) => act(() => { w.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true })) })
  const tocar = async (x, y, hasta = null) => {
    const lienzo = document.querySelector('.dib-lienzo')
    await act(() => { lienzo.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: x * 1600, clientY: y * 900, button: 0 })) })
    if (hasta) await act(() => { lienzo.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: hasta.x * 1600, clientY: hasta.y * 900 })) })
    const fin = hasta || { x, y }
    await act(() => { lienzo.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: fin.x * 1600, clientY: fin.y * 900 })) })
    await esperar()
  }
  const instruccion = () => document.querySelector('.dib-instruccion')?.textContent
  try {
    const Editor = (await m.cargar('/src/components/analisis/dibujo/EditorDibujo.jsx')).default
    const clip = { eventoId: 'e', espejo: false, partidoId: 'p', videoId: 'abcdefghijk', inicio: 10, fin: 20, titulo: 'Pase incorrecto #1' }
    const ana = { id: 'j7', nombre: 'Ana', dorsal: '7', foto: '' }
    const dibujoInicial = {
      version: 1, clip: { inicio: 10, fin: 20 }, pausas: [], subtitulos: [],
      objetos: [anillo('a', 0.3, 0.6, ana), anillo('b', 0.55, 0.62), anillo('c', 0.7, 0.5)],
    }
    let pegado = null
    const estilos = []
    await m.render(m.h(Editor, {
      clip, dibujoInicial, jugadoras: [ana],
      plantilla: { tipo: 'opciones_pase', pasadora: { jugadora: ana }, receptora: { jugadora: { rival: true, dorsal: '4', nombre: '' } } },
      miEstilo: { pase_bajo: { color: 'azul', crecer: { modo: 'rapida', pelota: true } } },
      onGuardarEstilo: async (e) => { estilos.push(e); return {} },
      onGuardar: async (d) => { pegado = d; return {} }, onCerrar() {},
    }))
    await esperar(80)

    // 1) El anillo de siempre ya se dibuja con el hueco atrás (detrás de las piernas).
    assert.ok(document.querySelector('[data-tipo="anillo"] [data-hueco="si"] .dib-anillo-trazo'), 'Anillo con hueco')

    // 2) Plantilla del pase incorrecto: ofrece «Opciones de pase» con los nombres de la acción.
    assert.match(document.querySelector('.dib-plantilla').textContent, /Es un pase incorrecto.*#7 Ana.*#4 Rival/s)
    await clic(boton('Empezar con Opciones de pase'))
    assert.equal(document.querySelector('.dib-plantilla'), null)
    assert.equal(instruccion(), '1) Tocá a #7 Ana, la jugadora que tenía la pelota.')
    await tocar(0.3, 0.6) // la pasadora (ya seguida: el pase la sigue)
    assert.equal(instruccion(), '2) Ahora tocá a #4 Rival, la que recibió el pase que salió mal.')
    await tocar(0.45, 0.3) // la receptora, en un punto
    assert.match(instruccion(), /^3\) Tocá a las compañeras que eran mejores opciones \(van 0\)/)
    assert.ok(document.querySelector('[data-opciones-pase] [data-pase-hecho]'), 'Se ve el pase en rojo')
    await tocar(0.7, 0.5) // una opción mejor
    assert.match(instruccion(), /van 1\)/)
    await clic(boton('Listo (Enter)'))
    assert.match(document.querySelector('.dib-propiedades').textContent, /Opciones de pase.*Opción 1/s)
    assert.ok(document.querySelector('[data-opcion="1"]'), 'La opción 1, numerada')

    // Mi estilo: guardar el de las opciones de pase.
    await clic(boton('Guardar como mi estilo'))
    assert.deepEqual(Object.keys(estilos[0]).sort(), ['opciones_pase', 'pase_bajo'])
    assert.match(document.body.textContent, /estilo guardado en tu usuario/)

    // 3) Línea defensiva sin calibrar: se tocan las seguidas y Enter.
    await tecla('d')
    assert.match(instruccion(), /Tocá a las defensoras .* Van 0/)
    await tocar(0.3, 0.6); await tocar(0.55, 0.62); await tocar(0.7, 0.5)
    assert.equal(document.querySelectorAll('[data-marcada]').length, 3, 'Las elegidas quedan marcadas')
    await tecla('Enter'); await esperar()
    assert.ok(document.querySelector('[data-linea-defensiva="manual"]'), 'Se dibuja la línea')
    assert.match(document.querySelector('.dib-propiedades').textContent, /La cancha no está calibrada: marcá a mano/)
    const estado = [...document.querySelectorAll('.dib-propiedades select')].find((s) => /Estado de/.test(s.getAttribute('aria-label')))
    await act(() => { estado.value = 'adelantada'; estado.dispatchEvent(new w.Event('change', { bubbles: true })) })
    await esperar()
    assert.ok(document.querySelector('[data-linea-defensiva] [data-estado="adelantada"]'), 'La adelantada en naranja')

    // 4) Pase nuevo con «Mi estilo» (azul, crece rápido con pelotita).
    await tecla('b')
    await tocar(0.2, 0.2, { x: 0.5, y: 0.3 })

    // 5) Cámara lenta desde este cuadro (J): tramo en la línea de tiempo.
    await tecla('j')
    assert.match(document.querySelector('.dib-propiedades').textContent, /Cámara lenta/)
    assert.match(document.querySelector('[data-grupo="lentos"]').textContent, /0,5x/)

    // 6) Pausa explicativa (X): un toque sobre la jugadora seguida.
    await tecla('x')
    assert.match(instruccion(), /^Pausa explicativa: tocá a la jugadora/)
    await tocar(0.3, 0.6)
    assert.match(document.body.textContent, /Listo: pausa de 3 s, foco sobre la jugadora y subtítulo/)
    assert.equal(document.querySelector('.dib-propiedades input[type="text"]').value, 'Escribí la explicación')

    // 7) Vista previa: al entrar al tramo lento pide 0,5x a YouTube y avisa sobre el video.
    await clic(boton('▶ Vista previa'))
    registro.player.t = 10.5; registro.player.estado = 1
    await esperar(120)
    assert.ok(registro.velocidades.includes(0.5), `Pide cámara lenta: ${registro.velocidades}`)
    await clic(boton('■ Detener vista previa'))
    assert.equal(registro.player.velocidad, 1, 'Al salir de la Vista previa vuelve la velocidad')

    // 8) Pegar: todo queda en la versión 3.
    await clic(boton('Pegar en la línea de tiempo'))
    assert.equal(pegado.version, 3)
    const tipos = pegado.objetos.map((o) => o.tipo)
    for (const t of ['opciones_pase', 'linea_defensiva', 'pase_bajo', 'foco']) assert.ok(tipos.includes(t), t)
    const op = pegado.objetos.find((o) => o.tipo === 'opciones_pase')
    assert.deepEqual([op.pasadora.seguir, op.pasadora.jugadora?.nombre, op.receptora.seguir, op.receptora.jugadora?.dorsal, op.opciones[0].seguir], ['a', 'Ana', null, '4', 'c'])
    const linea = pegado.objetos.find((o) => o.tipo === 'linea_defensiva')
    assert.deepEqual([linea.jugadoras, Object.values(linea.estados)], [['a', 'b', 'c'], ['adelantada']])
    const pase = pegado.objetos.find((o) => o.tipo === 'pase_bajo')
    assert.deepEqual([pase.color, pase.crecer], ['azul', { modo: 'rapida', pelota: true }])
    assert.deepEqual(pegado.lentos.map((l) => l.velocidad), [0.5])
    assert.equal(pegado.pausas.length, 1)
    assert.equal(pegado.subtitulos[0].texto, 'Escribí la explicación')
  } finally {
    await m.cerrar()
  }
})

test('cámara lenta en la capa del video y de las playlists: entra al tramo, pide 0,5x y al salir devuelve la velocidad', async () => {
  const m = await montarComponente()
  const { w, esperar } = m
  try {
    const Capa = (await m.cargar('/src/components/analisis/dibujo/CapaReproduccion.jsx')).default
    const velocidades = []
    const player = {
      t: 9, estado: 1, velocidad: 1.5,
      getCurrentTime() { return this.t }, getPlayerState() { return this.estado }, getPlaybackRate() { return this.velocidad },
      setPlaybackRate(v) { this.velocidad = v; velocidades.push(v) }, pauseVideo() { this.estado = 2 }, playVideo() { this.estado = 1 }, seekTo(t) { this.t = t },
    }
    const dibujo = { version: 3, clip: { inicio: 8, fin: 16 }, objetos: [], pausas: [], subtitulos: [], lentos: [{ id: 'l1', desde: 10, hasta: 12, velocidad: 0.5 }] }
    const rango = { inicio: 8, fin: 16 }
    const obtener = () => player
    await m.render(m.h('div', { style: { position: 'relative' } }, m.h(Capa, { obtenerPlayer: obtener, dibujo, rango })))
    await esperar(60)
    assert.deepEqual(velocidades, [])
    player.t = 10.5
    await esperar(100)
    assert.deepEqual(velocidades, [0.5])
    assert.match(document.querySelector('.dib-lento').textContent, /Cámara lenta 0,5x/)
    player.t = 12.4
    await esperar(100)
    assert.deepEqual(velocidades, [0.5, 1.5], 'Vuelve a la velocidad que tenía')
    assert.equal(document.querySelector('.dib-lento'), null)
    void w
  } finally {
    await m.cerrar()
  }
})
