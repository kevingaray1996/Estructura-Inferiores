// Etapa 2 de Análisis: equipos como listado, márgenes de clips y playlists. Migración, verificación, listado y
// reversión sobre el esquema real + etapas previas, en PostgreSQL WASM en memoria. Nunca toca la base real.
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
  'supabase/migrations/20261124120000_botonera_colectiva.sql'].map(leer)
const cambio = leer('supabase/migrations/20261125120000_equipos_clips_playlists.sql')
const reversion = leer('supabase/rollback/20261125120000_equipos_clips_playlists.sql')
const verificacion = leer('supabase/verification/20261125_equipos_clips_playlists.sql')
const listado = leer('supabase/verification/20261125_equipos_listado.sql')

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
const nombresEquipos = async db => (await db.query(`select nombre from public.equipos order by nombre`)).rows.map(r => r.nombre)

test('un solo DO en migración, reversión y verificación; el listado es una sola consulta de lectura', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', verificacion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
  for (const sql of [cambio, reversion]) assert.match(sql, /pg_notify\('pgrst', 'reload schema'\)/)
  const lectura = listado.replace(/--[^\n]*/g, '')
  assert.doesNotMatch(lectura, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i)
  assert.equal((lectura.match(/;/g) || []).length, 1)
})

test('equipos: agrega los rivales que faltan sin duplicar (mayúsculas, acentos, espacios) y sin Comunicaciones', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.exec(verificacion)
  // «camioneros  » ya estaba como «Camioneros»; «Atlético Sur» queda una vez, con la forma más usada.
  assert.deepEqual(await nombresEquipos(db), ['Atlético Sur', 'Camioneros', 'Camioneros FC', 'Estrella del Sur'])
  assert.equal(await n(db, `select count(*) n from seguridad_privado.respaldo_equipos_agregados`), 3)
  assert.equal(await n(db, `select count(*) n from public.equipos where not activo`), 0)
  // Nada de lo existente se vinculó solo.
  assert.equal(await n(db, `select count(*) n from public.partidos where equipo_id is not null`), 1)
  assert.equal(await n(db, `select count(*) n from public.analisis_partidos where equipo_local_id is not null or equipo_visitante_id is not null`), 0)
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
})

test('listado: muestra equipos, posibles duplicados, scouting con texto libre y partidos sin equipo', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const filas = (await db.query(listado)).rows
  const de = s => filas.filter(f => f.seccion === s)
  assert.equal(de('equipo').length, 4)
  assert.ok(de('posible duplicado').some(f => f.nombre.includes('Camioneros') && f.nombre.includes('Camioneros FC')))
  assert.equal(de('scouting con texto libre').length, 1)
  assert.match(de('equipo').find(f => f.nombre === 'Camioneros').detalle, /2 partidos/)
})

test('márgenes de los clips: por tipo, el resto −4/+3 y las colectivas −2/+2', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const m = Object.fromEntries((await db.query(`select codigo, margen_antes a, margen_despues d from public.analisis_tipos_accion`)).rows.map(r => [r.codigo, [r.a, r.d]]))
  assert.deepEqual(m['Remate'], [6, 3])
  assert.deepEqual(m['Pérdida'], [5, 5])
  assert.deepEqual(m['Centro'], [4, 3])
  assert.deepEqual(m['Salida'], [2, 2])
  assert.deepEqual(m['Transición defensiva'], [2, 2])
  await assert.rejects(db.query(`update public.analisis_tipos_accion set margen_antes = 61 where codigo = 'Remate'`), codigo('23514'))
})

test('scouting: referencia a equipos solo en scouting, local distinto de visitante; borrar el equipo deja el nombre', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const est = (await db.query(`select id from public.equipos where nombre = 'Estrella del Sur'`)).rows[0].id
  await db.query(`update public.analisis_partidos set equipo_local_id = $1, equipo_visitante_id = $2 where id = $3`, [est, E_CAMIONEROS, S])
  await assert.rejects(db.query(`update public.analisis_partidos set equipo_visitante_id = $1 where id = $2`, [est, S]), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_partidos set equipo_local_id = $1 where id = $2`, [est, P]), codigo('23514'))
  await db.query(`delete from public.equipos where id = $1`, [est])
  const fila = (await db.query(`select equipo_local_id, equipo_local from public.analisis_partidos where id = $1`, [S])).rows[0]
  assert.deepEqual(fila, { equipo_local_id: null, equipo_local: 'Estrella del Sur' })
})

const nuevaPlaylist = (cat = CAT) => [`insert into public.analisis_playlists (id, categoria_id, nombre, filtro) values ('f0000000-0000-4000-8000-000000000001', $1, 'Remates', '{"v":1,"tipos":["Remate"]}') returning creado_por`, [cat]]
const nuevoClip = [`insert into public.analisis_playlist_clips (playlist_id, evento_id, orden) values ('f0000000-0000-4000-8000-000000000001', $1, 0)`, [EV]]

test('permisos: coordinación crea; la técnica ve las de su categoría y no edita; otra categoría no ve nada', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const creada = await como(db, 'admin', ...nuevaPlaylist(), { confirmar: true })
  assert.equal(creada.rows[0].creado_por, U.admin)
  await como(db, 'admin', ...nuevoClip, { confirmar: true })
  assert.equal(Number((await como(db, 'tec', `select count(*) n from public.analisis_playlists`)).rows[0].n), 1)
  assert.equal(Number((await como(db, 'tec', `select count(*) n from public.analisis_playlist_clips`)).rows[0].n), 1)
  assert.equal(Number((await como(db, 'tec2', `select count(*) n from public.analisis_playlists`)).rows[0].n), 0)
  assert.equal(Number((await como(db, 'tec2', `select count(*) n from public.analisis_playlist_clips`)).rows[0].n), 0)
  await assert.rejects(como(db, 'tec', `insert into public.analisis_playlists (categoria_id, nombre) values ($1, 'Mía')`, [CAT]), codigo('42501'))
  const r = await como(db, 'tec', `update public.analisis_playlist_clips set nota = 'x'`, [], { confirmar: true })
  assert.equal(r.affectedRows ?? 0, 0)
  const b = await como(db, 'tec', `delete from public.analisis_playlists`, [], { confirmar: true })
  assert.equal(b.affectedRows ?? 0, 0)
  await db.exec('set role anon')
  try { await assert.rejects(db.query(`select count(*) from public.analisis_playlists`), codigo('42501')) } finally { await db.exec('reset role') }
})

test('el ajuste del clip es de la playlist: la acción original no cambia; el clip no cambia de acción', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(...nuevaPlaylist())
  await db.query(...nuevoClip)
  await db.query(`update public.analisis_playlist_clips set ajuste_inicio = -2, ajuste_fin = 3, nota = 'Mirá el perfil'`)
  assert.equal(await n(db, `select segundo n from public.analisis_eventos where id = $1`, [EV]), 300)
  await assert.rejects(db.query(`update public.analisis_playlist_clips set evento_id = gen_random_uuid()`), codigo('22023'))
  await assert.rejects(db.query(...nuevoClip), codigo('23505'))
  await assert.rejects(db.query(`update public.analisis_playlist_clips set ajuste_fin = 500`), codigo('23514'))
  // Si se borra la acción, se va su clip; si se borra la playlist, sus clips.
  await db.query(`delete from public.analisis_eventos where id = $1`, [EV])
  assert.equal(await n(db, `select count(*) n from public.analisis_playlist_clips`), 0)
})

test('reversión: no borra playlists sin permiso; con permiso deja todo como antes y se puede volver a aplicar', async () => {
  const db = await crearBase()
  const antes = await nombresEquipos(db)
  await db.exec(cambio)
  await db.query(...nuevaPlaylist())
  await assert.rejects(db.exec(reversion), /Hay 1 playlists/)
  // Un equipo agregado que después eligió el calendario queda en el listado.
  await db.query(`update public.partidos set equipo_id = (select id from public.equipos where nombre = 'Camioneros FC') where rival = 'Camioneros FC'`)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  assert.deepEqual(await nombresEquipos(db), [...antes, 'Camioneros FC'].sort())
  assert.equal(await n(db, `select count(*) n from information_schema.columns where (table_name = 'equipos' and column_name = 'activo') or column_name in ('equipo_local_id','equipo_visitante_id','margen_antes','margen_despues')`), 0)
  assert.equal(await n(db, `select count(*) n from pg_class where relname in ('analisis_playlists','analisis_playlist_clips')`), 0)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Faltan columnas/)
  await db.exec(cambio)
  await db.exec(verificacion)
})
