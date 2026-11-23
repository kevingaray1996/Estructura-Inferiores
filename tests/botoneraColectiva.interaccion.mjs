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

test('Botonera colectiva: guarda al abrir (fin provisorio) y corrige el fin al cerrar; Enter, cierre solo, Charla superpuesta y espejo', async () => {
  const h = await montar({ tipos })
  const { writes, actualizaciones } = h
  // Fin corregido de la acción n (o undefined si no se mandó corrección).
  const finCorregido = (n) => actualizaciones.filter((a) => a.id === writes[n].id).at(-1)?.segundo_fin
  const enBase = (n) => h.datos.analisis_eventos.find((e) => e.id === writes[n].id)
  try {
    try { h.dom.window.localStorage.clear() } catch { /* Sin almacenamiento. */ }
    await h.iniciar()
    await h.click('Colectiva')
    assert.ok(document.querySelector('[data-tipo-colectivo="Salida"]'), 'Se ve la botonera colectiva')
    assert.equal(document.querySelector('[data-tipo-rapido="Pase correcto"]'), null, 'La individual no se muestra a la vez')

    // Tecla S: se guarda YA, con fin provisorio = inicio + duración (15 s); la misma tecla cierra y corrige el fin.
    h.activo().time = 100.4; await h.tick()
    await h.tecla('s')
    assert.equal(writes.length, 1)
    assert.deepEqual([writes[0].tipo, writes[0].segundo, writes[0].segundo_fin, writes[0].jugador_id, writes[0].resultado], ['Salida', 100, 115, null, null])
    assert.match(document.body.textContent, /Grabando: Salida · 0 s/)
    h.activo().time = 106.2; await h.tick()
    assert.match(document.body.textContent, /Grabando: Salida · 6 s/)
    await h.tecla('s')
    assert.doesNotMatch(document.body.textContent, /Grabando:/)
    assert.equal(actualizaciones.length, 0, 'La corrección espera a que el alta esté confirmada')
    await h.resolver()
    assert.equal(finCorregido(0), 106)
    assert.equal(enBase(0).segundo_fin, 106)

    // Enter cierra el abierto.
    h.activo().time = 300; await h.tick()
    await h.tecla('p')
    assert.deepEqual([writes[1].tipo, writes[1].segundo, writes[1].segundo_fin], ['Presión alta', 300, 310])
    await h.resolver()
    h.activo().time = 304; await h.tick()
    await h.tecla('Enter')
    assert.equal(finCorregido(1), 304)

    // Si no se cierra, se cierra solo al llegar a la duración (10 s): ya está guardado con ese fin, no se manda nada.
    h.activo().time = 500; await h.tick()
    await h.tecla('t')
    await h.resolver()
    h.activo().time = 510; await h.tick()
    assert.doesNotMatch(document.body.textContent, /Grabando:/)
    assert.equal(finCorregido(2), undefined)
    assert.equal(enBase(2).segundo_fin, 510)

    // Otra fase cierra la fase abierta en ese segundo y abre la nueva.
    h.activo().time = 600; await h.tick()
    await h.tecla('a')
    await h.resolver()
    h.activo().time = 605; await h.tick()
    await h.tecla('o')
    assert.equal(finCorregido(3), 605)
    assert.deepEqual([writes[4].tipo, writes[4].segundo, writes[4].segundo_fin], ['Transición ofensiva', 605, 615])
    await h.resolver()
    await h.tecla('o')

    // Charla se superpone: Error defensivo no cierra la Salida abierta; la Salida tampoco lo cierra a él.
    h.activo().time = 700; await h.tick()
    await h.tecla('s')
    await h.resolver()
    h.activo().time = 702; await h.tick()
    await h.tecla('e')
    await h.resolver()
    assert.match(document.body.textContent, /Grabando: Salida · 2 s/)
    assert.match(document.body.textContent, /Grabando: Error defensivo · 0 s/)
    assert.equal(finCorregido(5), undefined, 'Abrir una Charla no cierra la fase')
    h.activo().time = 705; await h.tick()
    await h.tecla('e')
    assert.equal(finCorregido(6), 705)
    assert.match(document.body.textContent, /Grabando: Salida · 5 s/)
    // Otra fase sí cierra la fase abierta; una Charla abierta sigue; Enter cierra el último abierto.
    h.activo().time = 708; await h.tick()
    await h.tecla('h')
    await h.resolver()
    h.activo().time = 710; await h.tick()
    await h.tecla('a')
    assert.equal(finCorregido(5), 710)
    assert.match(document.body.textContent, /Grabando: Acción destacada/)
    await h.resolver()
    h.activo().time = 712; await h.tick()
    await h.tecla('Enter')
    assert.equal(finCorregido(8), 712)
    // La Acción destacada se cierra sola a los 6 s, con el fin con que ya estaba guardada.
    h.activo().time = 714; await h.tick()
    assert.doesNotMatch(document.body.textContent, /Grabando:/)
    assert.equal(enBase(7).segundo_fin, 714)
    // Cada uno en su propia fila de la línea de tiempo.
    const filas = [...document.querySelectorAll('.lt-etiqueta')].map((e) => e.textContent)
    assert.ok(filas.includes('Error defensivo') && filas.includes('Acción destacada') && filas.includes('Salida'), filas.join(' | '))

    // Un momento abierto ya está guardado con su fin provisorio (si se recarga la página, queda así).
    h.activo().time = 800; await h.tick()
    await h.tecla('d')
    await h.resolver()
    assert.deepEqual([enBase(9).tipo, enBase(9).segundo, enBase(9).segundo_fin], ['Defensa organizada', 800, 830])
    await h.tecla('d')

    // Los momentos no son acciones individuales: la Playlist sigue en cero.
    h.registradas(0)

    // Línea de tiempo: tocar una barra la elige y muestra sus eventos.
    const barra = document.querySelector('.lt-barra[aria-label="Salida de 01:40 a 01:46"]')
    assert.ok(barra, 'Barra de la Salida con el fin corregido')
    await h.act(() => barra.click())
    assert.match(document.body.textContent, /No hay eventos individuales dentro de este momento/)

    // Espejo: desde el rival, la Presión alta es su Salida y la Transición defensiva su Transición ofensiva.
    const verRival = [...document.querySelectorAll('.lt-barra-sup button')].find((b) => b.textContent === 'Rival A')
    assert.ok(verRival, 'Botón para ver desde el rival')
    const guardadosAntes = writes.length + actualizaciones.length
    await h.act(() => verRival.click())
    const etiquetas = [...document.querySelectorAll('.lt-barra')].map((b) => b.getAttribute('aria-label'))
    assert.ok(etiquetas.includes('Salida de 05:00 a 05:04'), etiquetas.join(' | '))
    assert.ok(etiquetas.includes('Transición ofensiva de 08:20 a 08:30'), etiquetas.join(' | '))
    assert.ok(etiquetas.includes('Defensa organizada de 10:00 a 10:05'), etiquetas.join(' | '))
    assert.ok(!etiquetas.some((e) => e.startsWith('Error defensivo')), 'La Charla no tiene espejo')
    assert.equal(writes.length + actualizaciones.length, guardadosAntes, 'El espejo no guarda nada')
  } finally {
    await h.cerrar()
  }
})
