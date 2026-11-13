import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarElemento, interpolar, nuevaPizarra, SUPERFICIES, validarPizarra } from '../src/utils/pizarra.js'
import { animar, estelas, planAnimacion, posesiones, tiemposDePasos } from '../src/utils/pizarraAnimacion.js'

// Documento con pasos a partir de una lista de posiciones por paso: { id: [x, y] }.
function jugada(elementos, pasos, duraciones = null) {
  let d = nuevaPizarra()
  for (const [tipo, x, y] of elementos) d = agregarElemento(d, tipo, x, y)
  const ids = d.elementos.map(e => e.id)
  d = { ...d, pasos: pasos.map((posiciones, i) => ({ id: `p${i}`, nombre: `Paso ${i + 1}`, duracion: duraciones?.[i] ?? 2,
    poses: Object.fromEntries(ids.map((id, j) => [id, { x: posiciones[j][0], y: posiciones[j][1], rotacion: 0 }])) })) }
  return { d: validarPizarra(d), ids }
}

// Generador reproducible para pruebas con jugadas al azar.
function azar(semilla) { let s = semilla; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 }

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

test('Recto reproduce exactamente la animación anterior (interpolar)', () => {
  const { d, ids } = jugada([['jugadora', 10, 10], ['cono', 50, 50]], [[[10, 10], [50, 50]], [[60, 30], [50, 50]], [[20, 80], [55, 50]]])
  for (const t of [0, .3, 1, 2, 2.7, 3.9, 4]) {
    const nuevo = animar(d, t, 'recto').poses, viejo = interpolar(d, t).poses
    for (const id of ids) { assert.ok(cerca(nuevo[id].x, viejo[id].x) && cerca(nuevo[id].y, viejo[id].y), `t=${t}`) }
  }
})

test('Suave: pasa exacto por cada paso, arranca y termina quieta y no frena en los pasos intermedios', () => {
  const { d, ids: [j] } = jugada([['jugadora', 10, 50]], [[[10, 50]], [[40, 40]], [[70, 50]], [[90, 30]]], [2, 2, 2, 2])
  for (const [i, t] of tiemposDePasos(d).entries()) {
    const p = animar(d, t, 'suave').poses[j]
    assert.ok(cerca(p.x, d.pasos[i].poses[j].x) && cerca(p.y, d.pasos[i].poses[j].y), `paso ${i}`)
  }
  const vel = t => { const a = animar(d, t - .01, 'suave').poses[j], b = animar(d, t + .01, 'suave').poses[j]; return Math.hypot(b.x - a.x, b.y - a.y) / .02 }
  assert.ok(vel(.01) < 2, 'arranca despacio')
  assert.ok(vel(2) > 5, 'no frena en el paso intermedio')
  assert.ok(vel(5.99) < 2, 'termina despacio')
})

test('Suave sin rulos ni pasarse: en cada tramo avanza siempre hacia el destino (500 jugadas al azar)', () => {
  const r = azar(7)
  for (let caso = 0; caso < 500; caso++) {
    const n = 3 + Math.floor(r() * 5)
    // Mezcla de tramos largos, muy cortos, quietos y vueltas atrás.
    const puntos = [[r() * 100, r() * 100]]
    for (let i = 1; i < n; i++) {
      const ant = puntos[i - 1], tipo = r()
      puntos.push(tipo < .2 ? [...ant] : tipo < .45 ? [Math.min(100, Math.max(0, ant[0] + (r() - .5) * 3)), Math.min(100, Math.max(0, ant[1] + (r() - .5) * 3))] : [r() * 100, r() * 100])
    }
    const duraciones = puntos.map(() => .2 + r() * 4)
    const { d, ids: [j] } = jugada([['jugadora', 50, 50]], puntos.map(p => [p]), duraciones)
    const plan = planAnimacion(d, 'suave'), [w, h] = SUPERFICIES[d.superficie]
    for (let k = 0; k < n - 1; k++) {
      const a = d.pasos[k].poses[j], b = d.pasos[k + 1].poses[j], cx = (b.x - a.x) * w / 100, cy = (b.y - a.y) * h / 100, largo = Math.hypot(cx, cy)
      let anterior = -1e-9
      for (let s = 0; s <= 40; s++) {
        const t = plan.tiempos[k] + (plan.tiempos[k + 1] - plan.tiempos[k]) * s / 40
        const p = animar(d, t, 'suave').poses[j]
        assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, 'dentro de la cancha')
        if (largo < 1e-6) { assert.ok(cerca(p.x, a.x) && cerca(p.y, a.y), `caso ${caso}: quieta se queda quieta`); continue }
        const avance = ((p.x - a.x) * w / 100 * cx + (p.y - a.y) * h / 100 * cy) / largo
        assert.ok(avance >= anterior - 1e-6, `caso ${caso} tramo ${k}: retrocede`)
        assert.ok(avance <= largo + 1e-6, `caso ${caso} tramo ${k}: se pasa del destino`)
        // Desvío lateral acotado: nunca más de un cuarto del tramo.
        const lateral = Math.abs(((p.x - a.x) * w / 100 * cy - (p.y - a.y) * h / 100 * cx) / largo)
        assert.ok(lateral <= largo * .26, `caso ${caso} tramo ${k}: se abre demasiado`)
        anterior = avance
      }
    }
  }
})

test('Posesión: la pelota pegada a una jugadora es suya; suelta o lejos, de nadie', () => {
  const { d, ids: [a, b, pelota] } = jugada([['jugadora', 20, 50], ['jugadora', 60, 50], ['pelota', 22, 50]],
    [[[20, 50], [60, 50], [22, 50]], [[20, 50], [60, 50], [58, 50]], [[20, 50], [60, 50], [40, 20]]])
  assert.deepEqual(posesiones(d)[pelota], [a, b, null])
})

test('Conducción: la pelota acompaña a la jugadora por su curva, con el mismo desplazamiento', () => {
  const { d, ids: [j, pelota] } = jugada([['jugadora', 10, 50], ['pelota', 12, 50]],
    [[[10, 50], [12, 50]], [[40, 30], [42, 30]], [[70, 50], [72, 50]]])
  for (const t of [.5, 1.3, 2.4, 3.7]) {
    const p = animar(d, t, 'suave').poses
    assert.ok(cerca(p[pelota].x - p[j].x, 2, 1e-9) && cerca(p[pelota].y - p[j].y, 0, 1e-9), `t=${t}`)
  }
})

test('Pase: la pelota sale de la pasadora y llega justo cuando llega la receptora, en línea recta', () => {
  const { d, ids: [a, b, pelota] } = jugada([['jugadora', 20, 50], ['jugadora', 60, 30], ['pelota', 22, 50]],
    [[[20, 50], [60, 30], [22, 50]], [[25, 50], [70, 40], [72, 40]]], [2, 3])
  const en = t => animar(d, t, 'suave').poses
  assert.ok(cerca(en(0)[pelota].x, 22) && cerca(en(3)[pelota].x, 72))
  // A mitad del pase la pelota está entre las dos, lejos de la pasadora.
  const medio = en(1.5)
  assert.ok(medio[pelota].x > medio[a].x + 10 && medio[pelota].x < medio[b].x + 2)
  // Antes de llegar, la pelota todavía no alcanzó a la receptora.
  const casi = en(2.7)
  assert.ok(Math.hypot(casi[pelota].x - casi[b].x - 2, casi[pelota].y - casi[b].y) > .1)
})

test('Estelas: sólo de lo que se mueve, ventana corta o recorrido completo, y nada en modo oculto', () => {
  const { d, ids: [j, , cono] } = jugada([['jugadora', 10, 50], ['jugadora', 80, 80], ['cono', 50, 50]],
    [[[10, 50], [80, 80], [50, 50]], [[60, 50], [80, 80], [50, 50]], [[90, 20], [80, 80], [50, 50]]])
  const corta = estelas(d, 3, 'estela'), completa = estelas(d, 3, 'completo')
  assert.deepEqual(corta.map(e => e.id), [j])
  assert.ok(!corta.some(e => e.id === cono))
  assert.ok(completa[0].puntos.length > corta[0].puntos.length)
  assert.deepEqual(completa[0].puntos[0], [10, 50])
  const ultimo = completa[0].puntos.at(-1), ahora = animar(d, 3, 'suave').poses[j]
  assert.ok(cerca(ultimo[0], ahora.x) && cerca(ultimo[1], ahora.y))
  assert.deepEqual(estelas(d, 3, 'oculto'), [])
  assert.deepEqual(estelas(d, 0, 'estela'), [])
})

test('Rendimiento: 200 elementos y 40 pasos (cerca del tope de tamaño) animan holgados para 60 cuadros por segundo', () => {
  const r = azar(3), elementos = Array.from({ length: 200 }, (_, i) => [i % 10 === 0 ? 'pelota' : 'jugadora', 50, 50])
  const pasos = Array.from({ length: 40 }, () => elementos.map(() => [r() * 100, r() * 100]))
  const { d } = jugada(elementos, pasos, pasos.map(() => .5))
  planAnimacion(d, 'suave')
  const inicio = performance.now()
  for (let i = 0; i < 60; i++) { animar(d, i * .4, 'suave'); estelas(d, i * .4, 'estela') }
  assert.ok((performance.now() - inicio) / 60 < 16, 'menos de 16 ms por cuadro')
})
