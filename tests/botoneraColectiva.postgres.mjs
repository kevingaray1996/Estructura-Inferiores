// Etapa 1 de Análisis: botonera colectiva (catálogo, espejos, forma de las acciones), equipo analizado y scouting.
// Migración, verificación y reversión sobre el esquema real + etapa C de la pizarra + etapa 1 de cuentas de jugadoras
// + marcas del partido + etapa 0 (consulta del cuerpo técnico), en PostgreSQL WASM en memoria. Nunca toca la base real.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const leer = r => readFileSync(new URL('../' + r, import.meta.url), 'utf8').replace(/^﻿/, '')
const esquema = leer('supabase/esquema/esquema_real.sql')
const previas = ['supabase/migrations/20261114120000_pizarra_etapa_c.sql', 'supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql',
  'supabase/migrations/20261121120000_eventos_partido_analisis.sql', 'supabase/migrations/20261123120000_consulta_analisis_cuerpo_tecnico.sql'].map(leer)
const cambio = leer('supabase/migrations/20261124120000_botonera_colectiva.sql')
const reversion = leer('supabase/rollback/20261124120000_botonera_colectiva.sql')
const verificacion = leer('supabase/verification/20261124_botonera_colectiva.sql')

const CAT = '10000000-0000-4000-8000-000000000001'
const U = { admin: '00000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002' }
const MAIL = { admin: 'admin@club.test', tec: 'tec@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001'
const P = 'c0000000-0000-4000-8000-000000000001'

async function crearBase({ antes = '' } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_admin;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users (instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email text,
      banned_until timestamptz, last_sign_in_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false);
    insert into auth.users (id, email) values ('${U.admin}', '${MAIL.admin}'), ('${U.tec}', '${MAIL.tec}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ('${MAIL.admin}','Admin','coordinacion',null),
      ('${MAIL.tec}','Técnica','tecnico','${CAT}');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'),
      ('b0000000-0000-4000-8000-000000000002','Bea','Benitez','${CAT}');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Rival');
    insert into public.analisis_eventos (partido_id, jugador_id, segundo, tipo) values ('${P}', '${J1}', 30, 'Remate');`)
  for (const sql of previas) await db.exec(sql)
  if (antes) await db.exec(antes)
  return db
}

async function como(db, quien, sql, params, { confirmar = false } = {}) {
  await db.exec('BEGIN')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U[quien], email: MAIL[quien], role: 'authenticated' })])
    await db.exec('SET LOCAL ROLE authenticated')
    const r = await db.query(sql, params)
    await db.exec(confirmar ? 'COMMIT' : 'ROLLBACK')
    return r
  } catch (e) { await db.exec('ROLLBACK'); throw e }
}
const codigo = c => e => { assert.equal(e.code, c, e.message); return true }
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)
const momento = (tipo, inicio, fin, jugador = null) =>
  [`insert into public.analisis_eventos (partido_id, jugador_id, segundo, segundo_fin, tipo) values ($1, $2, $3, $4, $5)`, [P, jugador, inicio, fin, tipo]]

test('un solo DO en migración, reversión y verificación, con lock_timeout y sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', verificacion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
  for (const sql of [cambio, reversion]) assert.match(sql, /pg_notify\('pgrst', 'reload schema'\)/)
})

test('se aplica sin tocar lo existente: 13 botones colectivos, 10 espejos, pasa la verificación y no se aplica dos veces', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.exec(verificacion)
  assert.equal(await n(db, `select count(*) n from public.analisis_tipos_accion where botonera = 'colectiva'`), 13)
  assert.equal(await n(db, `select count(*) n from public.analisis_tipos_accion where espejo is not null`), 10)
  assert.equal((await db.query(`select botonera, duracion_defecto from public.analisis_tipos_accion where codigo = 'Remate'`)).rows[0].botonera, 'individual')
  const p = (await db.query(`select tipo_partido, equipo_analizado from public.analisis_partidos where id = $1`, [P])).rows[0]
  assert.deepEqual(p, { tipo_partido: 'propio', equipo_analizado: 'propio' })
  const espejo = async c => (await db.query(`select espejo from public.analisis_tipos_accion where codigo = $1`, [c])).rows[0].espejo
  assert.equal(await espejo('Transición defensiva'), 'Transición ofensiva')
  assert.equal(await espejo('Defensa organizada'), 'Ataque posicional')
  assert.equal(await espejo('Presión alta'), 'Salida')
  assert.equal(await espejo('Córner en contra'), 'Córner a favor')
  assert.equal(await espejo('Error defensivo'), null)
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
})

test('forma de las acciones: colectiva sin jugadora y con fin; individual sin fin; fin nunca antes del inicio', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(...momento('Transición ofensiva', 100, 108))
  await assert.rejects(db.query(...momento('Transición ofensiva', 100, null)), codigo('23514'))
  await assert.rejects(db.query(...momento('Transición ofensiva', 100, 108, J1)), codigo('23514'))
  await assert.rejects(db.query(...momento('Transición ofensiva', 100, 90)), codigo('23514'))
  await assert.rejects(db.query(...momento('Remate', 100, 108, J1)), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_eventos set segundo_fin = 40 where tipo = 'Remate'`), codigo('23514'))
})

test('espejo: solo entre botones colectivos; un botón con acciones no cambia de botonera', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await assert.rejects(db.query(`update public.analisis_tipos_accion set espejo = 'Remate' where codigo = 'Salida'`), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_tipos_accion set espejo = 'Salida' where codigo = 'Remate'`), codigo('23514'))
  await db.query(...momento('Salida', 10, 20))
  await assert.rejects(db.query(`update public.analisis_tipos_accion set botonera = 'individual', duracion_defecto = null, grupo = 'otras', espejo = null where codigo = 'Salida'`), codigo('23514'))
})

test('permisos: la técnica ve las acciones colectivas de su categoría y no puede cargarlas ni moverlas', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await como(db, 'admin', ...momento('Presión alta', 200, 210), { confirmar: true })
  const visto = await como(db, 'tec', `select count(*) n from public.analisis_eventos where tipo = 'Presión alta'`)
  assert.equal(Number(visto.rows[0].n), 1)
  await assert.rejects(como(db, 'tec', ...momento('Presión alta', 300, 310)), codigo('42501'))
  const r = await como(db, 'tec', `update public.analisis_eventos set segundo = 205 where tipo = 'Presión alta'`, [], { confirmar: true })
  assert.equal(r.affectedRows ?? 0, 0)
  const ajuste = await como(db, 'admin', `update public.analisis_eventos set segundo = 202, segundo_fin = 215 where tipo = 'Presión alta'`, [], { confirmar: true })
  assert.equal(ajuste.affectedRows, 1)
})

test('scouting: sin calendario, con los dos equipos y equipo analizado local o visitante', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const ins = (extra) => db.query(`insert into public.analisis_partidos (categoria_id, rival, tipo_partido, equipo_local, equipo_visitante, equipo_analizado, partido_calendario_id)
    values ($1, 'Estrella del Sur', $2, $3, $4, $5, $6)`, [CAT, ...extra])
  await ins(['scouting', 'Estrella del Sur', 'Otro Club', 'local', null])
  await assert.rejects(ins(['scouting', 'Estrella del Sur', null, 'local', null]), codigo('23514'))
  await assert.rejects(ins(['scouting', 'Estrella del Sur', 'Otro Club', 'propio', null]), codigo('23514'))
  await assert.rejects(ins(['propio', null, null, 'local', null]), codigo('23514'))
  await ins(['propio', null, null, 'rival', null])
  await assert.rejects(ins(['otra', 'A', 'B', 'local', null]), codigo('23514'))
})

test('no aplica nada si hay acciones con segundo_fin o botones con el mismo código', async () => {
  const conFin = await crearBase({ antes: `update public.analisis_eventos set segundo_fin = 40` })
  await assert.rejects(conFin.exec(cambio), /acciones con segundo_fin cargado/)
  assert.equal(await n(conFin, `select count(*) n from information_schema.columns where table_name = 'analisis_tipos_accion' and column_name = 'botonera'`), 0)
  const repetido = await crearBase({ antes: `insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Córner a favor','Córner','Córner','opcional','pelota_parada')` })
  await assert.rejects(repetido.exec(cambio), /mismo código que los colectivos nuevos: Córner a favor/)
  assert.equal(await n(repetido, `select count(*) n from pg_class where relname = 'respaldo_botonera_colectiva'`), 0)
})

test('reversión: no borra datos sin permiso; con permiso deja todo como antes y se puede volver a aplicar', async () => {
  const db = await crearBase()
  const reglaAntes = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'analisis_tipos_accion_grupo_check'`)).rows[0].d
  await db.exec(cambio)
  await db.query(...momento('Salida', 10, 20))
  await assert.rejects(db.exec(reversion), /Hay 1 acciones colectivas/)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  assert.equal((await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'analisis_tipos_accion_grupo_check'`)).rows[0].d, reglaAntes)
  assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name in ('analisis_tipos_accion','analisis_partidos') and column_name in ('botonera','espejo','duracion_defecto','tipo_partido','equipo_analizado','equipo_local','equipo_visitante')`), 0)
  assert.equal(await n(db, `select count(*) n from public.analisis_eventos where tipo = 'Remate'`), 1)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Faltan columnas/)
  await db.exec(cambio)
  await db.exec(verificacion)
})
