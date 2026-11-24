// Etapa 3 de Análisis: tramos de posesión marcados a mano. Migración, verificación y reversión sobre el esquema real
// + etapas previas, en PostgreSQL WASM en memoria. Nunca toca la base real.
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
  'supabase/migrations/20261121120000_eventos_partido_analisis.sql', 'supabase/migrations/20261123120000_consulta_analisis_cuerpo_tecnico.sql',
  'supabase/migrations/20261124120000_botonera_colectiva.sql', 'supabase/migrations/20261125120000_equipos_clips_playlists.sql'].map(leer)
const cambio = leer('supabase/migrations/20261126120000_posesion_tramos.sql')
const reversion = leer('supabase/rollback/20261126120000_posesion_tramos.sql')
const verificacion = leer('supabase/verification/20261126_posesion_tramos.sql')

const CAT = '10000000-0000-4000-8000-000000000001'
const CAT2 = '10000000-0000-4000-8000-000000000002'
const U = { admin: '00000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002', tec2: 'a0000000-0000-4000-8000-000000000003' }
const MAIL = { admin: 'admin@club.test', tec: 'tec@club.test', tec2: 'tec2@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001'
const P = 'c0000000-0000-4000-8000-000000000001'
const S = 'c0000000-0000-4000-8000-000000000009'
const EV = 'e0000000-0000-4000-8000-000000000001'
const E_CAMIONEROS = 'd0000000-0000-4000-8000-000000000001'

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
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${CAT2}','Cuarta',2,false);
    insert into auth.users (id, email) values ('${U.admin}', '${MAIL.admin}'), ('${U.tec}', '${MAIL.tec}'), ('${U.tec2}', '${MAIL.tec2}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ('${MAIL.admin}','Admin','coordinacion',null),
      ('${MAIL.tec}','Técnica','tecnico','${CAT}'), ('${MAIL.tec2}','Técnica 2','tecnico','${CAT2}');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values
      ('Remate','Remate','Remate','opcional','ofensiva'), ('Pérdida','Pérdida','Pérdida','opcional','ofensiva'),
      ('Centro','Centro','Centro','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'),
      ('b0000000-0000-4000-8000-000000000002','Bea','Benitez','${CAT}');
    insert into public.equipos (id, nombre) values ('${E_CAMIONEROS}', 'Camioneros');
    insert into public.partidos (categoria_id, rival, fecha, equipo_id) values
      ('${CAT}', 'Camioneros', '2026-03-01', '${E_CAMIONEROS}'),
      ('${CAT}', 'camioneros  ', '2026-03-08', null),
      ('${CAT}', 'Camioneros FC', '2026-03-15', null),
      ('${CAT}', 'Atlético Sur', '2026-03-22', null),
      ('${CAT}', 'Atlético  Sur', '2026-04-01', null),
      ('${CAT}', 'Atletico Sur', '2026-04-08', null);
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Atlético Sur');
    insert into public.analisis_eventos (id, partido_id, jugador_id, segundo, tipo) values ('${EV}', '${P}', '${J1}', 300, 'Remate');`)
  for (const sql of previas) await db.exec(sql)
  await db.exec(`insert into public.analisis_partidos (id, categoria_id, rival, tipo_partido, equipo_local, equipo_visitante, equipo_analizado)
    values ('${S}', '${CAT}', 'Estrella del Sur', 'scouting', 'Estrella del Sur', 'Club Comunicaciones', 'local')`)
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
const n = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].n)
const tramo = (inicio, fin, estado = 'analizado', partido = P) =>
  [`insert into public.analisis_posesion_tramos (partido_id, inicio, fin, estado) values ($1, $2, $3, $4) returning id`, [partido, inicio, fin, estado]]

test('un solo DO en migración, reversión y verificación, con lock_timeout y sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', verificacion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
})

test('se aplica, pasa la verificación, no se aplica dos veces; reglas de los tramos', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.exec(verificacion)
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
  await db.query(...tramo(100, 160))
  await db.query(...tramo(160, 200, 'detenida'))
  await assert.rejects(db.query(...tramo(150, 170, 'otro')), codigo('23P01'))
  await assert.rejects(db.query(...tramo(300, 300)), codigo('23514'))
  await assert.rejects(db.query(...tramo(300, 310, 'rival')), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_posesion_tramos set partido_id = $1 where inicio = 100`, [S]), codigo('22023'))
  // Se borra el análisis (base de prueba en memoria): se van sus tramos.
  await db.query(`delete from public.analisis_eventos where partido_id = $1`, [P])
  await db.query(`delete from public.analisis_partidos where id = $1`, [P])
  assert.equal(await n(db, `select count(*) n from public.analisis_posesion_tramos`), 0)
})

test('permisos: coordinación marca; la técnica de la categoría ve y no escribe; otra categoría no ve; anon nada', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await como(db, 'admin', ...tramo(10, 40), { confirmar: true })
  assert.equal(Number((await como(db, 'tec', `select count(*) n from public.analisis_posesion_tramos`)).rows[0].n), 1)
  assert.equal(Number((await como(db, 'tec2', `select count(*) n from public.analisis_posesion_tramos`)).rows[0].n), 0)
  await assert.rejects(como(db, 'tec', ...tramo(50, 60)), codigo('42501'))
  const r = await como(db, 'tec', `delete from public.analisis_posesion_tramos`, [], { confirmar: true })
  assert.equal(r.affectedRows ?? 0, 0)
  await db.exec('set role anon')
  try { await assert.rejects(db.query(`select count(*) from public.analisis_posesion_tramos`), codigo('42501')) } finally { await db.exec('reset role') }
})

test('reversión: no borra tramos sin permiso; con permiso deja todo como antes y se puede volver a aplicar', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(...tramo(10, 40))
  await assert.rejects(db.exec(reversion), /Hay 1 tramos/)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'analisis_posesion_tramos'`), 0)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Falta la tabla/)
  await db.exec(cambio)
  await db.exec(verificacion)
})
