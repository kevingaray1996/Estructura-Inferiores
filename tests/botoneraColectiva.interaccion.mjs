// Etapa 1 de Análisis en pantalla: botonera colectiva (abrir y cerrar momentos con tecla, Enter o solos), que se
// guardan con inicio y fin sin jugadora, no entran en la Playlist individual y aparecen en la línea de tiempo (con
// su espejo). YouTube y Supabase simulados; nunca usa producción.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE } from '../src/utils/analisis/catalogoAcciones.js'
import { montar } from './helpers/montarAnalisis.mjs'

const col = (codigo, etiqueta_boton, grupo, duracion_defecto, espejo, orden) => ({
  codigo, etiqueta: codigo, etiqueta_boton, icono: '•', color: 'acento', ubicacion: 'opcional', resultados: [], resultado_implicito: null,
  es_pase: false, grupo, orden, visible: true, atajo: null, botonera: 'colectiva', duracion_defecto, espejo,
})
const tipos = [
  ...CATALOGO_BASE,
  // Mismas duraciones que la migración 20261124120000.
  col('Salida', 'Salida', 'con_pelota', 15, null, 101),
  col('Ataque posicional', 'Ataque posic.', 'con_pelota', 30, 'Defensa organizada', 102),
  col('Transición ofensiva', 'Transición of.', 'con_pelota', 10, 'Transición defensiva', 103),
  col('Presión alta', 'Presión alta', 'sin_pelota', 10, 'Salida', 104),
  col('Defensa organizada', 'Defensa org.', 'sin_pelota', 30, 'Ataque posicional', 105),
  col('Transición defensiva', 'Transición def.', 'sin_pelota', 10, 'Transición ofensiva', 106),
  col('Error defensivo', 'Error def.', 'charla', 6, null, 112),
  col('Acción destacada', 'Destacada', 'charla', 6, null, 113),
]

test('Botonera colectiva: la tecla abre y cierra, Enter cierra, se cierra sola y otro botón cierra el anterior', async () => {
  const h = await montar({ tipos })
  const { writes } = h
  try {
    try { h.dom.window.localStorage.clear() } catch { /* Sin almacenamiento. */ }
    await h.iniciar()
    await h.click('Colectiva')
    assert.ok(document.querySelector('[data-tipo-colectivo="Salida"]'), 'Se ve la botonera colectiva')
    assert.equal(document.querySelector('[data-tipo-rapido="Pase correcto"]'), null, 'La individual no se muestra a la vez')

    // Tecla S: abre en el segundo del video; la misma tecla cierra.
    h.activo().time = 100.4; await h.tick()
    await h.tecla('s')
    assert.match(document.body.textContent, /Grabando: Salida · 0 s/)
    h.activo().time = 106.2; await h.tick()
    assert.match(document.body.textContent, /Grabando: Salida · 6 s/)
    await h.tecla('s')
    assert.equal(writes.length, 1)
    assert.deepEqual([writes[0].tipo, writes[0].segundo, writes[0].segundo_fin, writes[0].jugador_id, writes[0].resultado], ['Salida', 100, 106, null, null])
    assert.doesNotMatch(document.body.textContent, /Grabando:/)
    await h.resolver()

    // Enter cierra el abierto.
    h.activo().time = 300; await h.tick()
    await h.tecla('p')
    h.activo().time = 304; await h.tick()
    await h.tecla('Enter')
    assert.deepEqual([writes[1].tipo, writes[1].segundo, writes[1].segundo_fin], ['Presión alta', 300, 304])
    await h.resolver()

    // Si no se cierra, se cierra solo al llegar a la duración por defecto (Transición defensiva: 10 s).
    h.activo().time = 500; await h.tick()
    await h.tecla('t')
    h.activo().time = 509; await h.tick()
    assert.equal(writes.length, 2)
    h.activo().time = 510; await h.tick()
    assert.deepEqual([writes[2].tipo, writes[2].segundo, writes[2].segundo_fin], ['Transición defensiva', 500, 510])
    await h.resolver()

    // Otro botón cierra el abierto en ese segundo y abre el nuevo.
    h.activo().time = 600; await h.tick()
    await h.tecla('a')
    h.activo().time = 605; await h.tick()
    await h.tecla('o')
    assert.deepEqual([writes[3].tipo, writes[3].segundo, writes[3].segundo_fin], ['Ataque posicional', 600, 605])
    assert.match(document.body.textContent, /Grabando: Transición ofensiva/)
    await h.resolver()
    await h.tecla('o')
    await h.resolver()

    // Charla se superpone: Error defensivo no cierra la Salida abierta; la Salida tampoco lo cierra a él.
    h.activo().time = 700; await h.tick()
    await h.tecla('s')
    h.activo().time = 702; await h.tick()
    await h.tecla('e')
    assert.match(document.body.textContent, /Grabando: Salida · 2 s/)
    assert.match(document.body.textContent, /Grabando: Error defensivo · 0 s/)
    assert.equal(writes.length, 5, 'Abrir una Charla no cierra la fase')
    h.activo().time = 705; await h.tick()
    await h.tecla('e')
    assert.deepEqual([writes[5].tipo, writes[5].segundo, writes[5].segundo_fin], ['Error defensivo', 702, 705])
    assert.match(document.body.textContent, /Grabando: Salida · 5 s/)
    await h.resolver()
    // Otra fase sí cierra la fase abierta; una Charla abierta sigue; Enter cierra el último abierto.
    h.activo().time = 708; await h.tick()
    await h.tecla('h')
    h.activo().time = 710; await h.tick()
    await h.tecla('a')
    assert.deepEqual([writes[6].tipo, writes[6].segundo, writes[6].segundo_fin], ['Salida', 700, 710])
    assert.match(document.body.textContent, /Grabando: Acción destacada/)
    await h.resolver()
    h.activo().time = 712; await h.tick()
    await h.tecla('Enter')
    assert.deepEqual([writes[7].tipo, writes[7].segundo, writes[7].segundo_fin], ['Ataque posicional', 710, 712])
    await h.resolver()
    // La Acción destacada se cierra sola a los 6 s.
    h.activo().time = 714; await h.tick()
    assert.deepEqual([writes[8].tipo, writes[8].segundo, writes[8].segundo_fin], ['Acción destacada', 708, 714])
    await h.resolver()
    assert.doesNotMatch(document.body.textContent, /Grabando:/)
    // Cada uno en su propia fila de la línea de tiempo.
    const filas = [...document.querySelectorAll('.lt-etiqueta')].map((e) => e.textContent)
    assert.ok(filas.includes('Error defensivo') && filas.includes('Acción destacada') && filas.includes('Salida'), filas.join(' | '))

    // Los momentos no son acciones individuales: la Playlist sigue en cero.
    h.registradas(0)

    // Línea de tiempo: una fila por tipo con su barra; tocarla la elige y muestra sus eventos.
    const barra = document.querySelector('.lt-barra[aria-label="Salida de 01:40 a 01:46"]')
    assert.ok(barra, 'Barra de la Salida en la línea de tiempo')
    await h.act(() => barra.click())
    assert.match(document.body.textContent, /No hay eventos individuales dentro de este momento/)

    // Espejo: desde el rival, la Presión alta es su Salida y la Transición defensiva su Transición ofensiva.
    const verRival = [...document.querySelectorAll('.lt-barra-sup button')].find((b) => b.textContent === 'Rival A')
    assert.ok(verRival, 'Botón para ver desde el rival')
    await h.act(() => verRival.click())
    const etiquetas = [...document.querySelectorAll('.lt-barra')].map((b) => b.getAttribute('aria-label'))
    assert.ok(etiquetas.includes('Salida de 05:00 a 05:04'), etiquetas.join(' | '))
    assert.ok(etiquetas.includes('Transición ofensiva de 08:20 a 08:30'), etiquetas.join(' | '))
    assert.ok(etiquetas.includes('Defensa organizada de 10:00 a 10:05'), etiquetas.join(' | '))
    assert.ok(!etiquetas.some((e) => e.startsWith('Error defensivo')), 'La Charla no tiene espejo')
    assert.equal(writes.length, 9, 'El espejo no guarda nada')
  } finally {
    await h.cerrar()
  }
})
