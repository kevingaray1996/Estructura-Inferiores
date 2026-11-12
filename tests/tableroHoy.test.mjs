import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function enDias(n, anio) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); if (anio) d.setFullYear(anio); return fechaISO(d) }

// Base simulada mínima: registra cada lectura con sus filtros.
function crearBase(tablas) {
  const lecturas = []
  return { lecturas, from(tabla) {
    const filtros = []
    const q = { select() { return q }, ilike() { return q }, limit() { return q }, maybeSingle() { q.unica = true; return q },
      order() { return q }, range() { return q }, not(c) { filtros.push(['not', c]); return q },
      eq(c, v) { filtros.push(['eq', c, v]); return q }, in(c, v) { filtros.push(['in', c, v]); return q },
      gte(c, v) { filtros.push(['gte', c, v]); return q }, lte(c, v) { filtros.push(['lte', c, v]); return q }, or(v) { filtros.push(['or', v]); return q },
      then(ok, mal) {
        lecturas.push({ tabla, filtros })
        let filas = tablas[tabla] || []
        for (const [op, c, v] of filtros) {
          if (op === 'eq' && !c.includes('.')) filas = filas.filter(f => !(c in f) || f[c] === v)
          if (op === 'in' && !c.includes('.')) filas = filas.filter(f => !(c in f) || v.includes(f[c]))
        }
        if (tabla === 'categorias' && q.unica) return Promise.resolve({ data: tablas.categorias.find(c => /primera/i.test(c.nombre)) || null }).then(ok, mal)
        return Promise.resolve({ data: filas, error: null }).then(ok, mal)
      } }
    return q
  } }
}

async function cargarModulo(db) {
  globalThis.__hoyDb = db
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'hoy-db', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0hoy-db' },
    load(id) { if (id === '\0hoy-db') return 'export const supabase=globalThis.__hoyDb' },
  }] })
  return { server, modulo: await server.ssrLoadModule('/src/utils/hoyDatos.js') }
}

const tablas = () => ({
  categorias: [{ id: 'primera', nombre: 'Primera División', es_reserva: false }, { id: 'sub16', nombre: 'Sub 16', es_reserva: false }],
  jugadores: [
    { id: 'a', nombre: 'Ana', apellido: 'Alvarez', categoria_id: 'primera', posicion: null, estado: 'disponible', fecha_nacimiento: enDias(0, 2004) },
    { id: 'b', nombre: 'Bea', apellido: 'Benitez', categoria_id: 'primera', posicion: null, estado: 'lesionado', estado_detalle: 'Esguince de tobillo', fecha_nacimiento: enDias(3, 2001) },
    { id: 'c', nombre: 'Caro', apellido: 'Castro', categoria_id: 'primera', posicion: null, estado: 'suspendido', fecha_nacimiento: enDias(20, 2000) },
    { id: 'd', nombre: 'Dani', apellido: 'Diaz', categoria_id: 'primera', posicion: null, estado: 'no_disponible', estado_detalle: 'Viaje familiar' },
    { id: 's', nombre: 'Sol', apellido: 'Sosa', categoria_id: 'sub16', posicion: null, estado: 'lesionado', fecha_nacimiento: enDias(1, 2010) },
  ],
  bienestar: [{ jugador_id: 'a', sueno: 2, dolor_muscular: 2, fatiga: 2, estres: 2, animo_entrenar: 2 }],
  fichas_medicas: [{ jugador_id: 'b', fecha_estimada_alta: '2026-12-01', recuperado: false }],
  partidos: [
    { id: 'q', categoria_id: 'sub16', fecha: enDias(1), hora: '10:00:00', rival: 'Juveniles FC', lugar: 'Cancha 3', local_visitante: 'visitante', categorias: { nombre: 'Sub 16' } },
    { id: 'p', categoria_id: 'primera', fecha: enDias(2), hora: '15:30:00', rival: 'Rival FC', lugar: 'Cancha 1', local_visitante: 'local', categorias: { nombre: 'Primera División' } },
  ],
})

async function cargar(modulo, perfil) {
  const bloques = {}
  await modulo.cargarTableroHoy(perfil, parcial => Object.assign(bloques, parcial))
  return bloques
}

test('Hoy: coordinación ve todo de Primera, con alta estimada y la lista de Wellness para WhatsApp', async () => {
  const db = crearBase(tablas())
  const { server, modulo } = await cargarModulo(db)
  try {
    const b = await cargar(modulo, { id: 'u', rol: 'coordinacion' })
    assert.equal(b.categoria.nombre, 'Primera División')
    assert.equal(b.wellness.estado, 'ok')
    assert.equal(b.wellness.resumen.respondieron, 1)
    assert.deepEqual(b.wellness.resumen.pendientes.map(j => j.id), ['b', 'c', 'd'])
    assert.equal(b.semaforo.estado, 'ok')
    assert.deepEqual(b.plantel.noDisponibles.map(g => [g.estado, g.jugadoras.map(x => x.jugadora.id)]),
      [['lesionado', ['b']], ['suspendido', ['c']], ['no_disponible', ['d']]])
    const lesion = b.plantel.noDisponibles[0].jugadoras[0]
    assert.equal(lesion.motivo, 'Esguince de tobillo'); assert.equal(lesion.alta, '2026-12-01')
    assert.equal(b.plantel.noDisponibles[1].jugadoras[0].motivo, 'Suspendida')
    assert.deepEqual(b.plantel.cumpleanos.map(c => [c.jugadora.id, c.diasFaltan]), [['a', 0], ['b', 3]])
    assert.equal(b.partido.partido.rival, 'Rival FC')
    assert.deepEqual(b.partido.partido.categoriasNombres, ['Primera División'], 'solo partidos de su categoría')
    // La consulta del plantel de Primera se hace una sola vez aunque la usen dos bloques.
    assert.equal(db.lecturas.filter(l => l.tabla === 'jugadores').length, 1)
    // Wellness del día en una sola consulta para todo el plantel.
    assert.equal(db.lecturas.filter(l => l.tabla === 'bienestar' && l.filtros.some(([op, c]) => op === 'eq' && c === 'fecha')).length, 1)

    const texto = modulo.textoPendientesWellness(b.wellness.resumen.pendientes, '2026-11-12')
    assert.equal(texto, ['*Wellness de hoy* (jueves 12 de noviembre)', 'Faltan completar 3 jugadoras:',
      '• Benitez, Bea', '• Castro, Caro', '• Diaz, Dani', '', 'Por favor, completalo antes del entrenamiento. ¡Gracias!'].join('\n'))
    assert.equal(modulo.textoPendientesWellness([], '2026-11-12'), '')
    assert.match(modulo.textoPendientesWellness([{ nombre: 'Ana', apellido: 'Alvarez' }], '2026-11-12'), /Faltan completar 1 jugadora:/)
  } finally { await server.close() }
})

test('Hoy: técnico de otra categoría ve su plantel, sin Wellness, semáforo ni fichas médicas', async () => {
  const db = crearBase(tablas())
  const { server, modulo } = await cargarModulo(db)
  try {
    const b = await cargar(modulo, { id: 't', rol: 'tecnico', categoria_id: 'sub16' })
    assert.equal(b.categoria.nombre, 'Sub 16')
    assert.equal(b.wellness.estado, 'restringido'); assert.equal(b.semaforo.estado, 'restringido')
    assert.equal(b.partido.partido.rival, 'Juveniles FC')
    assert.deepEqual(b.plantel.noDisponibles.map(g => g.jugadoras.map(x => x.jugadora.id)), [['s']])
    assert.equal(b.plantel.noDisponibles[0].jugadoras[0].motivo, 'Lesión')
    assert.deepEqual(b.plantel.cumpleanos.map(c => c.jugadora.id), ['s'])
    for (const tabla of ['bienestar', 'fichas_medicas', 'cmj', 'sesiones_fisicas']) assert.equal(db.lecturas.filter(l => l.tabla === tabla).length, 0, tabla)
  } finally { await server.close() }
})

test('Hoy: solo para cuerpo técnico, preparación física y coordinación; Inicio sigue siendo la pantalla inicial', async () => {
  const { server, modulo } = await cargarModulo(crearBase(tablas()))
  try {
    for (const rol of ['coordinacion', 'tecnico', 'preparador_fisico']) assert.equal(modulo.puedeVerHoy({ rol }), true)
    for (const perfil of [{ rol: 'medico' }, {}, null]) assert.equal(modulo.puedeVerHoy(perfil), false)
  } finally { await server.close() }
  const app = readFileSync('src/App.jsx', 'utf8')
  assert.match(app, /useState\('inicio'\)/)
  assert.match(app, /seccion === 'hoy' && \(puedeVerHoy\(perfil\)/)
  const layout = readFileSync('src/components/Layout.jsx', 'utf8')
  const medico = layout.slice(layout.indexOf("if (rol === 'medico')"), layout.indexOf("if (rol === 'preparador_fisico')"))
  assert.doesNotMatch(medico, /'hoy'/)
  const css = readFileSync('src/components/hoy/hoy.css', 'utf8')
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'los colores vienen de theme.js')
  assert.match(css, /min-height: 60px/)
})
