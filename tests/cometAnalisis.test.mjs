// Importar COMET: lector del PDF y revisión contra lo cargado. Lógica pura.
// Usa un informe inventado (helpers/cometSintetico.mjs). Si están los PDFs reales en Comet-prueba/ (no van a GitHub),
// también los lee.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { leerComet, leerMinutoComet, normalizarNombre } from '../src/utils/analisis/comet.js'
import { cometParaGuardar, nombreLegible, nombreRival, nombresPropios, operacionesElegidas, revisarComet, sugerirJugadora } from '../src/utils/analisis/cometRevision.js'
import { cometSintetico } from './helpers/cometSintetico.mjs'

test('lector: cabecera, oficiales y resultado', () => {
  const d = leerComet(cometSintetico({ cuarta: ': SOSA, NORA' }))
  assert.equal(d.torneo, 'PRIMERA DIVISIÓN "B" 2026 - ZONA "B"')
  assert.deepEqual([d.fecha, d.hora, d.estadio, d.numero_fecha, d.numero_partido], ['2026-04-19', '14:00', 'CANCHA DE PRUEBA (LOCALIDAD)', '2', '10'])
  assert.deepEqual([d.local, d.visitante, d.propio], [{ nombre: 'ESTRELLA DEL SUR', goles: 2 }, { nombre: 'COMUNICACIONES', goles: 1 }, 'visitante'])
  assert.deepEqual(d.oficiales.arbitra, { nombre: 'GOMEZ, LAURA INES', localidad: 'CIUDAD' })
  assert.deepEqual(d.oficiales.asistente1, { nombre: 'DIAZ, MARTA', localidad: '' })
  assert.deepEqual(d.oficiales.asistente2, { nombre: 'RUIZ, ELENA', localidad: '' })
  assert.deepEqual(d.oficiales.cuarta, { nombre: 'SOSA, NORA', localidad: '' })
})

test('lector: alineaciones con AR, CP, titulares y suplentes', () => {
  const d = leerComet(cometSintetico())
  assert.deepEqual(d.alineaciones.visitante.map((j) => [j.dorsal, j.nombre, j.ar, j.cp, j.titular]), [
    [1, 'PORTERA, NUESTRA UNO', true, false, true], [7, 'PRUEBA, ANA', false, false, true],
    [10, 'DIEZ, CAPITANA NUESTRA', false, true, true], [13, 'ENSAYO, BEA MARIA', false, false, false],
  ])
  assert.equal(d.alineaciones.local.length, 4)
})

test('lector: goles, tarjetas (con 90+4) y cambios de los dos equipos, con nombres cortados en dos renglones', () => {
  const d = leerComet(cometSintetico({ rojas: [[0, "80'", '6 SEIS, CAPITANA LOCAL', 'Juego brusco']] }))
  assert.deepEqual(d.goles.map((g) => [g.equipo, g.minuto.valor, g.dorsal, g.nombre]), [
    ['local', 21, 9, 'NUEVE, GOLEADORA LOCAL'], ['local', 23, 9, 'NUEVE, GOLEADORA LOCAL'], ['visitante', 30, 7, 'PRUEBA, ANA']])
  assert.deepEqual(d.tarjetas.map((t) => [t.equipo, t.color, t.minuto, t.dorsal, t.nombre, t.motivo]), [
    ['local', 'roja', { valor: 80, extra: 0 }, 6, 'SEIS, CAPITANA LOCAL', 'Juego brusco'],
    ['visitante', 'amarilla', { valor: 90, extra: 4 }, 13, 'ENSAYO, BEA MARIA', 'Conducta antideportiva'],
  ])
  assert.deepEqual(d.cambios.map((c) => [c.equipo, c.minuto.valor, c.sale.dorsal, c.sale.nombre, c.entra.dorsal, c.entra.nombre]), [
    ['local', 50, 9, 'NUEVE, GOLEADORA LOCAL', 18, 'DIECIOCHO, SUPLENTE LOCAL'],
    ['visitante', 62, 7, 'PRUEBA, ANA', 13, 'ENSAYO, BEA MARIA'],
  ])
})

test('lector: no guarda médicas ni quién imprimió; rechaza PDFs que no son de COMET o no son nuestros', () => {
  const texto = JSON.stringify(leerComet(cometSintetico()))
  assert.doesNotMatch(texto, /médica|Persona Inventada|Otra Persona|Impreso|Persona Que Imprime/i)
  assert.throws(() => leerComet([{ pagina: 1, x: 10, y: 100, ancho: 10, texto: 'Hola' }]), /no parece un «Informe del partido» de COMET/)
  assert.throws(() => leerComet(cometSintetico({ visitante: 'OTRO CLUB' })), /no es un partido de Comunicaciones/)
  assert.deepEqual(leerMinutoComet("90+4'"), { valor: 90, extra: 4 })
  assert.equal(leerMinutoComet('90'), null)
  assert.equal(normalizarNombre(' Ávila  Ñandú ,ána '), 'AVILA NANDU, ANA')
})

// Los PDFs reales (si están en esta computadora): solo se revisa la forma, sin escribir nombres de personas en el test.
const carpeta = join(process.cwd(), 'Comet-prueba')
const reales = existsSync(carpeta) ? readdirSync(carpeta).filter((f) => f.endsWith('.pdf')) : []
test('PDFs reales de Comet-prueba/ (si están)', { skip: reales.length ? false : 'No están los PDFs reales (no van a GitHub).' }, async () => {
  const { textosComet } = await import('./helpers/textosComet.mjs')
  for (const archivo of reales) {
    const d = leerComet(await textosComet(join(carpeta, archivo)))
    assert.equal(d.visitante.nombre, 'COMUNICACIONES', archivo)
    assert.ok(d.oficiales.arbitra?.nombre.includes(','), archivo)
    assert.ok(d.alineaciones.local.filter((j) => j.titular).length === 11 && d.alineaciones.visitante.filter((j) => j.titular).length === 11, archivo)
    assert.equal(d.goles.filter((g) => g.equipo === 'local').length, d.local.goles, archivo)
    assert.equal(d.goles.filter((g) => g.equipo === 'visitante').length, d.visitante.goles, archivo)
    for (const c of d.cambios) assert.ok(c.sale.dorsal && c.entra.dorsal && c.sale.nombre.includes(',') && c.entra.nombre.includes(','), archivo)
    for (const g of d.goles) assert.ok(g.dorsal && g.nombre.includes(','), archivo)
    assert.doesNotMatch(JSON.stringify(d), /médica|Impreso/i, archivo)
  }
})

// ---------- Revisión ----------

const MARCAS = { inicio_1t: 0, fin_1t: 2820, inicio_2t: 3600, fin_partido: 6600 }
const ANA = 'j-ana', BEA = 'j-bea'
const nombres = { 'PRUEBA, ANA': ANA, 'ENSAYO, BEA MARIA': BEA }
const nombreDe = (id) => ({ [ANA]: 'Ana Prueba', [BEA]: 'Bea Ensayo' }[id] || '')
const citaciones = [{ jugador_id: ANA, dorsal: 7, titular: true }, { jugador_id: BEA, dorsal: 12, titular: false }]
const enMinuto = (m) => (m <= 45 ? (m - 1) * 60 + 20 : 3600 + (m - 46) * 60 + 20)
const revisar = (extra = {}) => revisarComet({ comet: leerComet(cometSintetico()), marcas: MARCAS, idDe: (n) => nombres[n] || null, citaciones, nombreDe, ...extra })
const porId = (r) => Object.fromEntries(r.items.map((i) => [i.id, i]))

test('nombres: lista de las nuestras y sugerencia por apellido y nombre', () => {
  const d = leerComet(cometSintetico())
  assert.deepEqual(nombresPropios(d).map((n) => n.nombre), ['PORTERA, NUESTRA UNO', 'PRUEBA, ANA', 'DIEZ, CAPITANA NUESTRA', 'ENSAYO, BEA MARIA'])
  const candidatas = [{ id: ANA, nombre: 'Ana', apellido: 'Prueba', dorsal: 7 }, { id: BEA, nombre: 'Bea', apellido: 'Ensayo', dorsal: 12 },
    { id: 'j-otra', nombre: 'Ana', apellido: 'Otra', dorsal: 3 }]
  assert.equal(sugerirJugadora('PRUEBA, ANA', 7, candidatas), ANA)
  assert.equal(sugerirJugadora('ENSAYO, BEA MARIA', 13, candidatas), BEA, 'Con segundo nombre en COMET y dorsal distinto')
  assert.equal(sugerirJugadora('NADIE, ANA', null, candidatas), null)
  assert.equal(sugerirJugadora('PRUEBA, CARLA', null, candidatas), null, 'Mismo apellido, otro nombre')
  assert.equal(nombreLegible('GOMEZ, LAURA INES'), 'Laura Ines Gomez')
  assert.equal(nombreRival('NUEVE, GOLEADORA LOCAL'), 'Nueve, Goleadora Local')
})

test('revisión sin nada cargado: todo va a «Se va a completar»', () => {
  const r = revisar({ calendario: { id: 'c1', lugar: null, hora: null, numero_fecha: null, goles_local: null, goles_visitante: null, local_visitante: 'visitante', fecha: '2026-04-19' } })
  const completar = r.items.filter((i) => i.grupo === 'completar')
  assert.equal(r.items.filter((i) => i.grupo !== 'completar').length, 0)
  const ops = operacionesElegidas(r.items, new Set(completar.map((i) => i.id)))
  const inserts = ops.filter((o) => o.op === 'insertar_evento').map((o) => o.evento)
  // 2 goles rivales (con autora en observaciones), 1 nuestro (con jugadora), 1 tarjeta nuestra (90+4) y 1 cambio nuestro.
  assert.deepEqual(inserts.filter((e) => e.tipo === 'gol').map((e) => [e.equipo, e.segundo, e.jugador_id, e.observaciones]), [
    ['propio', 29 * 60, ANA, null], ['rival', 20 * 60, null, 'Nueve, Goleadora Local'], ['rival', 22 * 60, null, 'Nueve, Goleadora Local']])
  assert.deepEqual(inserts.filter((e) => e.tipo === 'tarjeta').map((e) => [e.equipo, e.tarjeta, e.segundo, e.jugador_id]), [['propio', 'amarilla', 3600 + 48 * 60, BEA]])
  assert.deepEqual(inserts.filter((e) => e.tipo === 'cambio').map((e) => [e.segundo, e.jugadora_sale, e.jugadora_entra]), [[3600 + 16 * 60, ANA, BEA]])
  assert.ok(ops.some((o) => o.op === 'informe' && o.campos.arbitra === 'Laura Ines Gomez'))
  assert.deepEqual(Object.assign({}, ...ops.filter((o) => o.op === 'calendario').map((o) => o.campos)),
    { lugar: 'CANCHA DE PRUEBA (LOCALIDAD)', hora: '14:00', numero_fecha: '2', goles_local: 2, goles_visitante: 1 })
  // Dorsal distinto (13 en COMET, 12 en convocados) y Bea suplente: solo aviso.
  assert.ok(r.avisos.some((a) => /Dorsal de Bea Ensayo: en COMET 13, en los convocados 12/.test(a)))
  // Lo que se guarda en el análisis: sin médicas; partes elegidas.
  const guardado = cometParaGuardar(leerComet(cometSintetico()), ops, null, 'informe.pdf')
  assert.deepEqual(Object.keys(guardado.partes).sort(), ['alineacion_rival', 'cambios_rival', 'oficiales'])
  assert.equal(guardado.partes.cambios_rival.length, 1)
  assert.ok(JSON.stringify(guardado).length < 60000)
})

test('revisión: lo cargado igual coincide; minutos con más de 2\' o goles de más no coinciden', () => {
  const eventos = [
    { id: 'g1', tipo: 'gol', equipo: 'propio', segundo: enMinuto(31), jugador_id: ANA },
    { id: 'g2', tipo: 'gol', equipo: 'rival', segundo: enMinuto(21), observaciones: 'Nueve, Goleadora' },
    { id: 'g3', tipo: 'gol', equipo: 'rival', segundo: enMinuto(27), observaciones: null },
    { id: 'g4', tipo: 'gol', equipo: 'rival', segundo: enMinuto(80), observaciones: null },
    { id: 't1', tipo: 'tarjeta', equipo: 'propio', tarjeta: 'amarilla', segundo: 3600 + 48 * 60 + 10, jugador_id: null },
    { id: 'c1', tipo: 'cambio', segundo: enMinuto(62), jugadora_sale: ANA, jugadora_entra: BEA },
  ]
  const r = revisar({ eventos, informe: { arbitra: 'Laura Gómez' } })
  const i = porId(r)
  assert.equal(i['gol-propio--0-minuto'].grupo, 'coincide', '31 contra 30: dentro de los 2\'')
  assert.equal(i['gol-rival--0-minuto'].grupo, 'coincide')
  assert.equal(i['gol-rival--1-minuto'].grupo, 'distinto', '27 contra 23')
  assert.deepEqual(i['gol-rival--1-minuto'].ops, [{ op: 'actualizar_evento', id: 'g3', cambios: { segundo: 22 * 60 } }])
  assert.equal(i['gol-rival--1-minuto'].segundoMio, enMinuto(27))
  assert.equal(i['gol-rival--1-obs'].grupo, 'completar', 'La autora del rival se completa si falta')
  assert.equal(i['gol-rival--0-obs'], undefined, 'Si ya tiene la autora, no se toca')
  assert.equal(i['gol-rival--sobra-0'].grupo, 'distinto')
  assert.deepEqual(i['gol-rival--sobra-0'].ops, [{ op: 'borrar_evento', id: 'g4' }])
  assert.equal(i['tarjeta-propio-amarilla-0-jugadora'].grupo, 'completar')
  assert.equal(i['cambio-0'].grupo, 'coincide')
  assert.equal(i.arbitra.grupo, 'coincide')
  // «Dejar el mío» (no elegido): no hace nada.
  assert.deepEqual(operacionesElegidas([i['gol-rival--1-minuto']], new Set()), [])
})

test('revisión: árbitra distinta, jugadora distinta y sin marcas', () => {
  const eventos = [{ id: 'g1', tipo: 'gol', equipo: 'propio', segundo: enMinuto(30), jugador_id: BEA }]
  const r = revisar({ eventos, informe: { arbitra: 'Otra Persona' } })
  const i = porId(r)
  assert.equal(i.arbitra.grupo, 'distinto')
  assert.equal(i['gol-propio--0-jugadora'].grupo, 'distinto')
  assert.deepEqual(i['gol-propio--0-jugadora'].ops, [{ op: 'actualizar_evento', id: 'g1', cambios: { jugador_id: ANA } }])
  const sinMarcas = revisar({ marcas: { inicio_1t: null, fin_1t: null, inicio_2t: null, fin_partido: null } })
  assert.ok(sinMarcas.avisos.some((a) => /Faltan marcas de tiempo/.test(a)))
  const bloqueados = sinMarcas.items.filter((x) => x.tema === 'gol' || x.tema === 'tarjeta' || x.tema === 'cambio')
  assert.ok(bloqueados.length && bloqueados.every((x) => x.bloqueado && !x.ops.length))
  assert.ok(sinMarcas.avisos.some((a) => /no está vinculado a un partido del calendario/.test(a)))
})

test('revisión: segunda importación; las partes iguales coinciden y el calendario distinto no coincide', () => {
  const comet = leerComet(cometSintetico())
  const primera = revisar()
  const anterior = cometParaGuardar(comet, operacionesElegidas(primera.items, new Set(primera.items.map((x) => x.id))), null)
  const r = revisar({ anterior, calendario: { id: 'c1', lugar: 'Otra cancha', hora: '14:00:00', numero_fecha: 'Fecha 2', goles_local: 1, goles_visitante: 1, local_visitante: 'local', fecha: '2026-04-20' } })
  const i = porId(r)
  assert.equal(i['parte-alineacion_rival'].grupo, 'coincide')
  assert.equal(i['cal-lugar'].grupo, 'distinto')
  assert.equal(i['cal-hora'].grupo, 'coincide')
  assert.equal(i['cal-numero_fecha'].grupo, 'coincide')
  assert.equal(i['cal-resultado'].grupo, 'distinto')
  assert.ok(r.avisos.some((a) => /jugamos de local y COMET dice visitante/.test(a)))
  assert.ok(r.avisos.some((a) => /no es la de COMET/.test(a)))
})

test('revisión: goles rivales ya cargados dentro de la tolerancia (22\' y 24\'): COMET completa la autora igual', () => {
  const eventos = [
    { id: 'g1', tipo: 'gol', equipo: 'rival', segundo: enMinuto(22), observaciones: null },
    { id: 'g2', tipo: 'gol', equipo: 'rival', segundo: enMinuto(24), observaciones: 'De cabeza' },
  ]
  const i = porId(revisar({ eventos }))
  assert.equal(i['gol-rival--0-minuto'].grupo, 'coincide')
  assert.equal(i['gol-rival--1-minuto'].grupo, 'coincide')
  assert.equal(i['gol-rival--0-obs'].grupo, 'completar')
  assert.deepEqual(i['gol-rival--0-obs'].ops, [{ op: 'actualizar_evento', id: 'g1', cambios: { observaciones: 'Nueve, Goleadora Local' } }])
  assert.deepEqual(i['gol-rival--1-obs'].ops, [{ op: 'actualizar_evento', id: 'g2', cambios: { observaciones: 'Nueve, Goleadora Local · De cabeza' } }])
  assert.match(i['gol-rival--0-obs'].titulo, /^Gol 21': autora Nueve, Goleadora Local/)
})
