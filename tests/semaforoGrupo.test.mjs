import test from 'node:test'
import assert from 'node:assert/strict'

// Base simulada: filtra en memoria como PostgREST y, como Supabase, corta cada
// respuesta en 1000 filas. Así, si la versión por grupo no paginara, perdería datos.
const LIMITE = 1000

function crearBase(tablas) {
  const consultas = []
  function from(tabla) {
    const filtros = [], orden = []
    let rango = null, limite = null, unica = false, embebido = null
    const valor = (fila, campo) => campo.includes('.') ? campo.split('.').reduce((o, k) => o?.[k], fila) : fila[campo]
    const q = {
      select(columnas) { embebido = /partidos(!inner)?\(fecha\)/.exec(columnas || ''); return q },
      eq(c, v) { filtros.push(f => valor(f, c) === v); return q },
      in(c, vs) { filtros.push(f => vs.includes(valor(f, c))); return q },
      gte(c, v) { filtros.push(f => valor(f, c) != null && valor(f, c) >= v); return q },
      lte(c, v) { filtros.push(f => valor(f, c) != null && valor(f, c) <= v); return q },
      not(c, op, v) { assert.equal(op, 'is'); assert.equal(v, null); filtros.push(f => valor(f, c) != null); return q },
      order(c, { ascending = true } = {}) { orden.push([c, ascending]); return q },
      limit(n) { limite = n; return q },
      range(a, b) { rango = [a, b]; return q },
      single() { unica = true; return q },
      then(ok, mal) {
        consultas.push({ tabla, rango })
        let filas = (tablas[tabla] || []).map(f => ({ ...f }))
        if (embebido) {
          filas = filas.map(f => ({ ...f, partidos: tablas.partidos.find(p => p.id === f.partido_id) ? { fecha: tablas.partidos.find(p => p.id === f.partido_id).fecha } : null }))
          if (embebido[1]) filas = filas.filter(f => f.partidos)
        }
        filas = filas.filter(f => filtros.every(fn => fn(f)))
        if (orden.length) filas.sort((x, y) => {
          for (const [c, asc] of orden) { const a = valor(x, c), b = valor(y, c); if (a < b) return asc ? -1 : 1; if (a > b) return asc ? 1 : -1 }
          return 0
        })
        if (limite != null) filas = filas.slice(0, limite)
        if (rango) filas = filas.slice(rango[0], rango[1] + 1)
        filas = filas.slice(0, LIMITE)
        const respuesta = unica ? { data: filas[0] ?? null, error: filas.length === 1 ? null : { code: 'PGRST116' } } : { data: filas, error: null }
        return Promise.resolve(respuesta).then(ok, mal)
      },
    }
    return q
  }
  return { from, consultas }
}

// Generador con semilla: los mismos datos en cada corrida.
function azar(semilla) {
  let s = semilla
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function haceDias(n) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return fechaISO(d) }

function datosSimulados() {
  const r = azar(20261112)
  const posiciones = ['arquera', 'defensora', 'mediocampista', 'delantera', null]
  const jugadores = Array.from({ length: 60 }, (_, i) => ({ id: `j${String(i).padStart(2, '0')}`, posicion: posiciones[i % 5], categoria_id: 'primera' }))
  const t = { jugadores, bienestar: [], entrenamiento_bloques: [], asistencias: [], estadisticas_jugador: [], sesiones_fisicas: [], cmj: [], partidos: [] }

  let idBloque = 0
  for (let d = 34; d >= 0; d--) {
    t.entrenamiento_bloques.push({ id: ++idBloque, categoria_id: 'primera', fecha: haceDias(d), duracion_minutos: 60, posiciones: [] })
    t.entrenamiento_bloques.push({ id: ++idBloque, categoria_id: 'primera', fecha: haceDias(d), duracion_minutos: 25, posiciones: ['arquera'] })
    t.entrenamiento_bloques.push({ id: ++idBloque, categoria_id: 'otra', fecha: haceDias(d), duracion_minutos: 90, posiciones: null })
  }
  for (const [i, dias] of [[1, 3], [2, 10], [3, 20], [4, 40]].map(([i, d]) => [i, d])) t.partidos.push({ id: 'p' + i, fecha: haceDias(dias) })

  jugadores.forEach((j, i) => {
    const perfil = i % 6 // 0: estable, 1: wellness malo hoy, 2: carga alta, 3: CMJ en baja, 4: todo junto, 5: pocos datos
    for (let d = 34; d >= 0; d--) {
      if (perfil === 5 && d > 6) continue
      const base = 2 + r()
      const pico = d === 0 && (perfil === 1 || perfil === 4) ? 2.5 : 0
      const v = () => Math.min(5, Math.max(1, Math.round(base + pico + (r() - 0.5))))
      t.bienestar.push({ jugador_id: j.id, fecha: haceDias(d), sueno: v(), dolor_muscular: v(), fatiga: v(), estres: v(), animo_entrenar: d % 7 === 3 ? null : v() })
      const estado = r() < 0.1 ? 'ausente' : r() < 0.15 ? 'tarde' : 'presente'
      t.asistencias.push({ jugador_id: j.id, fecha: haceDias(d), estado })
      const alta = (perfil === 2 || perfil === 4) && d < 7
      t.sesiones_fisicas.push({ jugador_id: j.id, fecha: haceDias(d), tipo: 'entrenamiento', rpe: alta ? 9 : 3 + Math.round(r() * 3) })
      if (d % 4 === 0) t.sesiones_fisicas.push({ jugador_id: j.id, fecha: haceDias(d), tipo: 'partido', rpe: r() < 0.2 ? null : 5 + Math.round(r() * 3) })
    }
    for (let s = 30; s >= 0; s--) {
      const baja = (perfil === 3 || perfil === 4) ? s === 0 ? 4 : 0 : 0
      t.cmj.push({ jugador_id: j.id, fecha: haceDias(s * 7), valor_cm: 30 + Math.round(r() * 30) / 10 - baja })
    }
    for (const p of t.partidos) if (r() < 0.8) t.estadisticas_jugador.push({ jugador_id: j.id, partido_id: p.id, minutos_jugados: Math.round(r() * 90) })
  })
  // Una jugadora sin ningún dato y una estadística sin partido.
  t.jugadores.push({ id: 'vacia', posicion: 'delantera', categoria_id: 'primera' })
  t.estadisticas_jugador.push({ jugador_id: 'j00', partido_id: 'inexistente', minutos_jugados: 50 })
  return t
}

async function cargarModulo(db) {
  globalThis.__semaforoDb = db
  const { crearServidorVitePrueba } = await import('./helpers/servidorVite.mjs')
  const server = await crearServidorVitePrueba({ server: { middlewareMode: true, hmr: false }, appType: 'custom', plugins: [{ name: 'semaforo-db', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0semaforo-db' },
    load(id) { if (id === '\0semaforo-db') return 'export const supabase=globalThis.__semaforoDb' },
  }] })
  return { server, modulo: await server.ssrLoadModule('/src/utils/semaforoRiesgo.js') }
}

test('calcularSemaforoGrupo da exactamente lo mismo que calcularSemaforoJugador para cada jugadora', async () => {
  const tablas = datosSimulados()
  assert.ok(tablas.bienestar.length > LIMITE && tablas.cmj.length > LIMITE, 'los datos tienen que pasar el límite de 1000 filas')
  const db = crearBase(tablas)
  const { server, modulo } = await cargarModulo(db)
  try {
    const { calcularSemaforoGrupo, calcularSemaforoJugador } = modulo
    const ids = tablas.jugadores.map(j => j.id)

    db.consultas.length = 0
    const grupo = await calcularSemaforoGrupo(ids.map(id => ({ id })), 'primera')
    const consultasGrupo = db.consultas.length
    assert.ok(consultasGrupo <= 15, `por grupo tiene que hacer pocas consultas, hizo ${consultasGrupo}`)
    assert.ok(db.consultas.filter(c => c.tabla === 'bienestar').length >= 2, 'bienestar tiene que leerse en más de una página')
    assert.ok(db.consultas.every(c => c.rango), 'todas las lecturas por grupo van paginadas')

    // Con la posición ya leída, el resultado es el mismo y no vuelve a leer jugadores.
    db.consultas.length = 0
    const conPosicion = await calcularSemaforoGrupo(tablas.jugadores.map(({ id, posicion }) => ({ id, posicion })), 'primera')
    assert.equal(db.consultas.filter(c => c.tabla === 'jugadores').length, 0)
    assert.deepStrictEqual(conPosicion, grupo)

    const colores = new Set()
    for (const id of ids) {
      const individual = await calcularSemaforoJugador(id, 'primera')
      assert.deepStrictEqual(grupo[id], individual, `jugadora ${id}`)
      colores.add(individual.semaforo)
    }
    assert.deepEqual([...colores].sort(), ['amarillo', 'rojo', 'verde'], 'los datos cubren los tres colores')
    assert.deepEqual(Object.keys(grupo).sort(), [...ids].sort())
    assert.deepEqual(await calcularSemaforoGrupo([], 'primera'), {})
  } finally {
    await server.close()
  }
})

test('motivoPrincipalSemaforo nombra la fuente que más suma', async () => {
  const { server, modulo } = await cargarModulo(crearBase({}))
  try {
    const { motivoPrincipalSemaforo } = modulo
    const nada = { wellness: { nivel: null, z: null }, carga: { nivel: null, acwr: null }, cmj: { nivel: null, porcentaje: null } }
    assert.equal(motivoPrincipalSemaforo(nada), null)
    assert.equal(motivoPrincipalSemaforo({ ...nada, carga: { nivel: 'normal', acwr: 1 } }), null)
    assert.equal(motivoPrincipalSemaforo({ ...nada, carga: { nivel: 'alerta', acwr: 1.62 }, cmj: { nivel: 'moderado', porcentaje: 4 } }), 'Carga alta · ACWR 1,62')
    assert.equal(motivoPrincipalSemaforo({ ...nada, carga: { nivel: 'alerta', acwr: 0.5 } }), 'Carga baja · ACWR 0,50')
    assert.equal(motivoPrincipalSemaforo({ ...nada, wellness: { nivel: 'moderado', z: 1.2 }, cmj: { nivel: 'alerta', porcentaje: 7.25 } }), 'CMJ −7,3 % vs. su promedio')
    assert.equal(motivoPrincipalSemaforo({ ...nada, wellness: { nivel: 'alerta', z: -1.8 } }), 'Wellness fuera de lo habitual · z -1,8')
  } finally {
    await server.close()
  }
})
