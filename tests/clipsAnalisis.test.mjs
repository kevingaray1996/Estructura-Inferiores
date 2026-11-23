// Etapa 2 de Análisis: equipos, rangos de clips, ajuste propio de la playlist, filtro por equipo con espejo,
// reproductor que pasa entre partidos y tablero clickeable. Lógica pura, sin base ni pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_BASE, crearCatalogo } from '../src/utils/analisis/catalogoAcciones.js'
import { aplicarAjuste, claveClip, crearClip, moverBorde, moverClip, rangoClip, resolverClipsGuardados } from '../src/utils/analisis/clips.js'
import {
  CLUB, buscarEquipos, equiposConAnalisis, equiposParaElegir, filtrarPorEquipo, ladosDelAnalisis, nombreDeClave, tituloPartido, validarEquipoNuevo,
} from '../src/utils/analisis/equipos.js'
import { clipsDeFiltro, clipsParaSumar, normalizarFiltro, partidosDelFiltro, resumenFiltro } from '../src/utils/analisis/filtroPlaylist.js'
import { alTerminarClip, llegoAlFin, minutoDelClip, ordenDeTecla, planDeClip, rotuloClip, videoIdDe } from '../src/utils/analisis/reproductorPlaylist.js'
import { clipsDeAnalisis, crucesDestacados, estadisticasColectivas, tablaJugadoraAccion, textoDuracion } from '../src/utils/analisis/tableroClips.js'

const col = (codigo, grupo, espejo = null) => ({
  codigo, etiqueta: codigo, etiqueta_boton: codigo, color: 'acento', ubicacion: 'opcional', resultados: [],
  grupo, orden: 100, botonera: 'colectiva', duracion_defecto: 10, espejo,
})
const catalogo = crearCatalogo([
  ...CATALOGO_BASE,
  col('Salida', 'con_pelota'),
  col('Ataque posicional', 'con_pelota', 'Defensa organizada'),
  col('Defensa organizada', 'sin_pelota', 'Ataque posicional'),
  col('Transición ofensiva', 'con_pelota', 'Transición defensiva'),
  col('Transición defensiva', 'sin_pelota', 'Transición ofensiva'),
  col('Córner a favor', 'pelota_parada', 'Córner en contra'),
  col('Córner en contra', 'pelota_parada', 'Córner a favor'),
  col('Tiro libre a favor', 'pelota_parada'),
])

const E_CAM = 'eq-camioneros', E_EST = 'eq-estrella'
const equipos = [
  { id: E_CAM, nombre: 'Camioneros', activo: true },
  { id: E_EST, nombre: 'Estrella del Sur', activo: true },
  { id: 'eq-viejo', nombre: 'Viejo Club', activo: false },
]
// A1: nosotros vs Camioneros (calendario con equipo), analizado Comunicaciones.
const A1 = { id: 'A1', tipo_partido: 'propio', equipo_analizado: 'propio', rival: 'Camioneros', video_url: 'https://youtu.be/AAAAAAAAAAA',
  partido_calendario: { equipo_id: E_CAM, rival: 'Camioneros', local_visitante: 'local', fecha: '2026-03-01' } }
// A2: scouting Estrella (local) vs Camioneros (visitante), analizado Camioneros.
const A2 = { id: 'A2', tipo_partido: 'scouting', equipo_analizado: 'visitante', equipo_local: 'Estrella del Sur', equipo_visitante: 'Camioneros',
  equipo_local_id: E_EST, equipo_visitante_id: E_CAM, fecha: '2026-03-10', video_url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB' }
// A3: scouting viejo con texto libre: «camioneros » (local, analizado) vs «Estrella  del Sur».
const A3 = { id: 'A3', tipo_partido: 'scouting', equipo_analizado: 'local', equipo_local: 'camioneros ', equipo_visitante: 'Estrella  del Sur', fecha: '2026-03-20' }
// A4: nosotros (de visitante) vs Estrella, sin equipo elegido en el calendario.
const A4 = { id: 'A4', tipo_partido: 'propio', equipo_analizado: 'propio', rival: 'Estrella del Sur',
  partido_calendario: { equipo_id: null, rival: 'Estrella del Sur', local_visitante: 'visitante', fecha: '2026-04-01' } }
const analisis = [A1, A2, A3, A4]

const ev = (id, partido_id, tipo, segundo, extra = {}) => ({ id, partido_id, tipo, segundo, segundo_fin: null, jugador_id: null, resultado: null, periodo: 1, ...extra })
const mom = (id, partido_id, tipo, segundo, fin) => ev(id, partido_id, tipo, segundo, { segundo_fin: fin })
const acciones = [
  mom('m1', 'A1', 'Transición defensiva', 100, 110),
  ev('i1', 'A1', 'Pérdida', 105, { jugador_id: 'J1' }),
  ev('i2', 'A1', 'Pase correcto', 300, { jugador_id: 'J2', periodo: 2 }),
  ev('i3', 'A1', 'Remate', 400, { jugador_id: 'J1', resultado: 'Fuera' }),
  mom('m2', 'A2', 'Transición ofensiva', 50, 58),
  mom('m3', 'A2', 'Salida', 200, 215),
  mom('m4', 'A3', 'Ataque posicional', 30, 60),
  mom('m5', 'A4', 'Transición ofensiva', 10, 20),
]

// ---------- Equipos ----------

test('equipos: lados de cada análisis (calendario, scouting con listado y scouting viejo con texto)', () => {
  assert.deepEqual(ladosDelAnalisis(A1, equipos), { analizado: CLUB, otro: E_CAM, local: CLUB, visitante: E_CAM })
  assert.deepEqual(ladosDelAnalisis(A2, equipos), { analizado: E_CAM, otro: E_EST, local: E_EST, visitante: E_CAM })
  // Texto libre: se junta con el equipo del listado de igual nombre al leer.
  assert.deepEqual(ladosDelAnalisis(A3, equipos), { analizado: E_CAM, otro: E_EST, local: E_CAM, visitante: E_EST })
  assert.equal(ladosDelAnalisis(A4, equipos).local, E_EST)
  assert.equal(ladosDelAnalisis({ ...A1, equipo_analizado: 'rival' }, equipos).analizado, E_CAM)
  // Un nombre que no está en el listado sigue funcionando como clave de texto.
  assert.equal(ladosDelAnalisis({ ...A3, equipo_local: 'Otro FC' }, equipos).analizado, 'nombre:otro fc')
  assert.equal(nombreDeClave('nombre:otro fc', equipos), 'Otro Fc')
})

test('equipos: biblioteca filtrada por equipo trae scouting (local o visitante) y nuestros partidos contra él', () => {
  assert.deepEqual(filtrarPorEquipo(analisis, E_CAM, equipos).map((a) => a.id), ['A1', 'A2', 'A3'])
  assert.deepEqual(filtrarPorEquipo(analisis, E_EST, equipos).map((a) => a.id), ['A2', 'A3', 'A4'])
  assert.deepEqual(filtrarPorEquipo(analisis, CLUB, equipos).map((a) => a.id), ['A1', 'A4'])
  assert.equal(filtrarPorEquipo(analisis, null, equipos).length, 4)
})

test('equipos: inactivos no aparecen al cargar (salvo el ya elegido), buscador sin acentos y alta sin duplicados', () => {
  assert.deepEqual(equiposParaElegir(equipos).map((e) => e.nombre), ['Camioneros', 'Estrella del Sur'])
  assert.equal(equiposParaElegir(equipos, { elegidos: ['eq-viejo'] }).length, 3)
  assert.deepEqual(buscarEquipos(equipos, 'ESTRELLA').map((e) => e.id), [E_EST])
  assert.equal(validarEquipoNuevo('  camioneros ', equipos).ok, false)
  assert.match(validarEquipoNuevo('Camioneros', equipos).motivo, /Ya existe «Camioneros»/)
  assert.equal(validarEquipoNuevo('Comunicaciones', equipos).ok, false)
  assert.deepEqual(validarEquipoNuevo('  Nuevo   Club ', equipos), { ok: true, nombre: 'Nuevo Club' })
  assert.equal(tituloPartido(A2, equipos), 'Estrella del Sur vs Camioneros')
  assert.equal(tituloPartido(A4, equipos), 'Estrella del Sur vs Comunicaciones')
  assert.equal(equiposConAnalisis(analisis, equipos)[0].clave, CLUB)
})

// ---------- Rangos de los clips ----------

test('rangos: margen por tipo (Pase −4/+2, Pérdida −5/+5, Remate −6/+3, Falta −3/+8, Gol −15/+5, resto −4/+3)', () => {
  const r = (tipo, segundo = 100) => rangoClip(ev('x', 'A1', tipo, segundo), catalogo)
  assert.deepEqual(r('Pase correcto'), { inicio: 96, fin: 102 })
  assert.deepEqual(r('Pérdida'), { inicio: 95, fin: 105 })
  assert.deepEqual(r('Remate'), { inicio: 94, fin: 103 })
  assert.deepEqual(r('Falta cometida'), { inicio: 97, fin: 108 })
  assert.deepEqual(r('Gol'), { inicio: 85, fin: 105 })
  assert.deepEqual(r('Centro'), { inicio: 96, fin: 103 })
  assert.deepEqual(r('Gol', 5), { inicio: 0, fin: 10 })
})

test('rangos: colectiva de su inicio a su fin con −2/+2; el catálogo puede cambiar los márgenes', () => {
  assert.deepEqual(rangoClip(mom('x', 'A1', 'Salida', 200, 215), catalogo), { inicio: 198, fin: 217 })
  assert.deepEqual(rangoClip(mom('x', 'A1', 'Salida', 1, 4), catalogo), { inicio: 0, fin: 6 })
  const propio = crearCatalogo([{ ...CATALOGO_BASE.find((t) => t.codigo === 'Remate'), margen_antes: 10, margen_despues: 1 }])
  assert.deepEqual(rangoClip(ev('x', 'A1', 'Remate', 100), propio), { inicio: 90, fin: 101 })
})

test('ajuste: es solo de la playlist (la acción original no cambia), ±1 s sin vaciar el clip', () => {
  const accion = ev('i9', 'A1', 'Remate', 100, { jugador_id: 'J1' })
  const copia = structuredClone(accion)
  const clip = crearClip(accion, { analisis: A1, catalogo, equipos, ajuste: { ajuste_inicio: -2, ajuste_fin: 3 }, nota: 'Perfil' })
  assert.deepEqual([clip.inicio, clip.fin], [92, 106])
  assert.deepEqual(accion, copia)
  assert.equal(rangoClip(accion, catalogo).inicio, 94)
  const base = { inicio: 94, fin: 103 }
  let ajuste = { ajuste_inicio: 0, ajuste_fin: 0 }
  ajuste = moverBorde(ajuste, 'inicio', -1, base)
  assert.deepEqual(ajuste, { ajuste_inicio: -1, ajuste_fin: 0 })
  // El fin no puede quedar antes del inicio + 1 s.
  for (let i = 0; i < 20; i++) ajuste = moverBorde(ajuste, 'fin', -1, base)
  assert.deepEqual(aplicarAjuste(base, ajuste), { inicio: 93, fin: 94 })
  // El inicio nunca antes del segundo 0.
  assert.deepEqual(moverBorde({ ajuste_inicio: 0, ajuste_fin: 0 }, 'inicio', -1, { inicio: 0, fin: 5 }), { ajuste_inicio: 0, ajuste_fin: 0 })
  assert.deepEqual(accion, copia)
})

test('clips guardados: respetan el orden, el espejo y el ajuste; los de acciones que no se ven quedan aparte', () => {
  const filas = [
    { id: 'f2', evento_id: 'm1', espejo: true, orden: 1, nota: null, ajuste_inicio: 0, ajuste_fin: 2 },
    { id: 'f1', evento_id: 'i1', espejo: false, orden: 0, nota: 'Ojo', ajuste_inicio: 0, ajuste_fin: 0 },
    { id: 'f3', evento_id: 'borrada', espejo: false, orden: 2 },
  ]
  const { clips, faltan } = resolverClipsGuardados(filas, {
    accionesPorId: new Map(acciones.map((a) => [a.id, a])), analisisPorId: new Map(analisis.map((a) => [a.id, a])), catalogo, equipos,
  })
  assert.deepEqual(clips.map((c) => [c.clave, c.tipo, c.equipo]), [['i1', 'Pérdida', CLUB], ['m1:espejo', 'Transición ofensiva', E_CAM]])
  assert.equal(clips[1].fin, 114)
  assert.equal(clips[0].nota, 'Ojo')
  assert.deepEqual(faltan.map((f) => f.id), ['f3'])
  assert.deepEqual(moverClip(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.equal(claveClip('x', true), 'x:espejo')
})

// ---------- Filtro por equipo con espejo ----------

const filtrar = (filtro, extra = {}) => clipsDeFiltro({ filtro, analisis, acciones, catalogo, equipos, ...extra }).map((c) => c.clave)

test('filtro por equipo: momentos de Camioneros cuando fue el analizado y espejos de cuando fue el rival', () => {
  // A1 (espejo de nuestra Transición defensiva), A2 (marcados), A3 (scouting viejo con texto).
  assert.deepEqual(filtrar({ equipo: E_CAM, mirada: 'equipo' }).sort(), ['m1:espejo', 'm2', 'm3', 'm4'])
  assert.deepEqual(filtrar({ equipo: E_CAM, mirada: 'equipo', tipos: ['Transición ofensiva'] }).sort(), ['m1:espejo', 'm2'])
  // Sus rivales: lo nuestro contra Camioneros (con individuales) y los espejos de Estrella.
  assert.deepEqual(filtrar({ equipo: E_CAM, mirada: 'rival' }).sort(), ['i1', 'i2', 'i3', 'm1', 'm2:espejo', 'm4:espejo'])
  // Comunicaciones: lo marcado en nuestros partidos.
  assert.deepEqual(filtrar({ equipo: CLUB, mirada: 'equipo' }).sort(), ['i1', 'i2', 'i3', 'm1', 'm5'])
  // Como se marcó y desde el otro equipo, sin equipo elegido.
  assert.equal(filtrar({}).length, acciones.length)
  assert.deepEqual(filtrar({ mirada: 'espejo' }).sort(), ['m1:espejo', 'm2:espejo', 'm4:espejo', 'm5:espejo'])
})

test('filtro: últimos N partidos del equipo, partidos elegidos, jugadora, tiempo y correcta / incorrecta', () => {
  assert.deepEqual(partidosDelFiltro(analisis, { equipo: E_CAM, ultimos: 2 }, equipos).map((a) => a.id), ['A3', 'A2'])
  assert.deepEqual(filtrar({ equipo: E_CAM, ultimos: 1, mirada: 'equipo' }), ['m4'])
  assert.deepEqual(filtrar({ partidos: ['A2'] }), ['m2', 'm3'])
  assert.deepEqual(filtrar({ jugadoras: ['J1'] }), ['i1', 'i3'])
  assert.deepEqual(filtrar({ tiempo: 2 }), ['i2'])
  // Con las marcas del partido, el tiempo sale de ahí.
  assert.deepEqual(filtrar({ tiempo: 2, partidos: ['A1'] }, { marcasPorPartido: new Map([['A1', { inicio_1t: 0, fin_1t: 200, inicio_2t: 250, fin_partido: 500 }]]) }), ['i2', 'i3'])
  // El pase correcto es correcto aunque no tenga resultado cargado (resultado implícito).
  assert.deepEqual(filtrar({ resultado: 'correcta' }), ['i2'])
  assert.deepEqual(filtrar({ resultado: 'incorrecta' }), ['i3'])
  assert.equal(normalizarFiltro({ mirada: 'equipo' }).mirada, 'marcado')
  assert.equal(normalizarFiltro({ ultimos: 3 }).ultimos, null)
  assert.match(resumenFiltro({ equipo: E_CAM, ultimos: 5, tipos: ['Pérdida'], tiempo: 2, mirada: 'equipo' }, { equipos }), /Camioneros · últimos 5 · Pérdida · 2T · de Camioneros/)
})

test('actualizar con el filtro: suma solo los clips nuevos y no vuelve a sumar los quitados a mano', () => {
  const delFiltro = clipsDeFiltro({ filtro: { equipo: E_CAM, mirada: 'equipo' }, analisis, acciones, catalogo, equipos })
  const nuevos = clipsParaSumar(delFiltro, ['m2', 'm3'], ['m4'])
  assert.deepEqual(nuevos.map((c) => c.clave), ['m1:espejo'])
})

// ---------- Reproductor ----------

test('reproductor: pasa de un partido a otro cambiando de video y, en el mismo video, solo salta', () => {
  const clips = [
    { ...rangoClip(acciones[1], catalogo), videoId: videoIdDe(A1.video_url) },
    { ...rangoClip(acciones[4], catalogo), videoId: videoIdDe(A2.video_url) },
    { ...rangoClip(acciones[5], catalogo), videoId: videoIdDe(A2.video_url) },
    { ...rangoClip(acciones[3], catalogo), videoId: videoIdDe(A1.video_url) },
  ]
  assert.equal(clips[0].videoId, 'AAAAAAAAAAA')
  assert.equal(clips[1].videoId, 'BBBBBBBBBBB')
  // Simulación: reproduce toda la lista sin pausa al final, como el componente.
  let videoCargado = '', indice = 0
  const pasos = []
  for (;;) {
    const plan = planDeClip(clips[indice], videoCargado)
    pasos.push(`${plan.accion} ${plan.videoId} ${plan.inicio}-${plan.fin}`)
    if (plan.accion === 'cargar') videoCargado = plan.videoId
    assert.ok(llegoAlFin(plan.fin, clips[indice]))
    const despues = alTerminarClip({ indice, total: clips.length })
    if (despues.tipo !== 'siguiente') { assert.equal(despues.tipo, 'terminar'); break }
    indice = despues.indice
  }
  assert.deepEqual(pasos, [
    'cargar AAAAAAAAAAA 100-110', 'cargar BBBBBBBBBBB 48-60', 'saltar BBBBBBBBBBB 198-217', 'cargar AAAAAAAAAAA 394-403',
  ])
  assert.deepEqual(planDeClip({ inicio: 1, fin: 2, videoId: '' }, 'x'), { accion: 'sin_video' })
})

test('reproductor: repetir, pausa al final, atajos, rótulo y minuto', () => {
  assert.deepEqual(alTerminarClip({ indice: 2, total: 5, repetir: true, pausaAlFinal: true }), { tipo: 'repetir', indice: 2 })
  assert.deepEqual(alTerminarClip({ indice: 2, total: 5, pausaAlFinal: true }), { tipo: 'pausar', indice: 2 })
  assert.deepEqual(alTerminarClip({ indice: 2, total: 5 }), { tipo: 'siguiente', indice: 3 })
  assert.equal(llegoAlFin(9.5, { fin: 10 }), false)
  assert.equal(ordenDeTecla({ key: 'ArrowRight' }), 'siguiente')
  assert.equal(ordenDeTecla({ key: 'r', target: { tagName: 'TEXTAREA' } }), null)
  assert.equal(ordenDeTecla({ key: 'f', ctrlKey: true }), null)
  assert.equal(rotuloClip({ indice: 2, total: 12, etiqueta: 'Salida', partido: 'Estrella del Sur vs Camioneros', minuto: "2T 14'" }),
    "Clip 3/12 · Salida · Estrella del Sur vs Camioneros · 2T 14'")
  assert.equal(minutoDelClip({ periodo: 2, segundo: 845 }, null), "2T 14'")
  assert.equal(minutoDelClip({ periodo: 1, segundo: 10 }, "1T 3'"), "1T 3'")
})

// ---------- Tablero ----------

test('tablero: momentos colectivos con cantidad, tiempo total y promedio; cruces sin contar dos veces', () => {
  const extra = [
    mom('c1', 'A1', 'Córner a favor', 600, 615),
    mom('c2', 'A1', 'Tiro libre a favor', 610, 620),
    ev('r1', 'A1', 'Remate', 612, { jugador_id: 'J1' }),
    ev('r2', 'A1', 'Remate', 700, { jugador_id: 'J1' }),
    mom('s1', 'A1', 'Salida', 800, 815),
    ev('p1', 'A1', 'Pérdida', 805, { jugador_id: 'J2' }),
  ]
  const clips = clipsDeAnalisis({ analisis, acciones: [...acciones, ...extra], catalogo, equipos })
  const nuestros = estadisticasColectivas(clips, CLUB)
  const td = nuestros.find((g) => g.tipo === 'Transición defensiva')
  assert.deepEqual([td.cantidad, td.total], [1, 10])
  const deCam = estadisticasColectivas(clips, E_CAM)
  const to = deCam.find((g) => g.tipo === 'Transición ofensiva')
  // Camioneros: su Transición ofensiva marcada en A2 (8 s) y el espejo de nuestra Transición defensiva en A1 (10 s).
  assert.deepEqual([to.cantidad, to.total, to.promedio], [2, 18, 9])
  assert.equal(textoDuracion(92), '1:32')
  assert.equal(textoDuracion(45), '45 s')
  const cruces = Object.fromEntries(crucesDestacados(clips).map((c) => [c.id, c.clips.map((x) => x.clave)]))
  assert.deepEqual(cruces.remates_pelota_parada, ['r1'])
  assert.deepEqual(cruces.perdidas_en_salida, ['p1'])
  assert.deepEqual(cruces.faltas_transicion_defensiva, [])
})

test('tablero: tabla jugadora × acción, cada celda con sus clips', () => {
  const clips = clipsDeAnalisis({ analisis, acciones, catalogo, equipos })
  const { tipos, filas } = tablaJugadoraAccion(clips, { orden: catalogo.tipos.map((t) => t.codigo) })
  assert.deepEqual(tipos, ['Pase correcto', 'Pérdida', 'Remate'])
  assert.equal(filas[0].jugadoraId, 'J1')
  assert.deepEqual(filas[0].celdas['Remate'].map((c) => c.clave), ['i3'])
  assert.equal(filas[0].total, 2)
})
