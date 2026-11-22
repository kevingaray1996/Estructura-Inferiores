// Importar COMET: columnas analisis_partidos.comet / comet_pdf, tabla analisis_comet_nombres, bucket privado comet-pdf,
// su reversión y su verificación. Sobre el esquema real con la etapa C de la pizarra y la etapa 1 de cuentas de
// jugadoras, en PostgreSQL WASM en memoria. Nunca toca la base real.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const leer = r => readFileSync(new URL('../' + r, import.meta.url), 'utf8').replace(/^﻿/, '')
const esquema = leer('supabase/esquema/esquema_real.sql')
const etapaC = leer('supabase/migrations/20261114120000_pizarra_etapa_c.sql')
const etapa1 = leer('supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql')
const cambio = leer('supabase/migrations/20261122150000_comet_partido.sql')
const reversion = leer('supabase/rollback/20261122150000_comet_partido.sql')
const verificacion = leer('supabase/verification/20261122_comet_partido.sql')

const CAT = '10000000-0000-4000-8000-000000000001', SUB16 = '10000000-0000-4000-8000-000000000003'
// Las dos cuentas administradoras de Análisis del esquema real, la técnica de la categoría del partido, la técnica de
// otra categoría y una cuenta de jugadora.
const U = { admin: '00000000-0000-4000-8000-000000000001', admin2: '00000000-0000-4000-8000-000000000002', tec: 'a0000000-0000-4000-8000-000000000002',
  tec16: 'a0000000-0000-4000-8000-000000000003', jug: 'a0000000-0000-4000-8000-000000000009' }
const MAIL = { admin: 'admin@club.test', admin2: 'admin2@club.test', tec: 'tec@club.test', tec16: 'tec16@club.test', jug: 'jugadora@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001', J2 = 'b0000000-0000-4000-8000-000000000002'
const P = 'c0000000-0000-4000-8000-000000000001'
const PDF = `${P}/comet.pdf`

async function crearBase({ conAdmin = true } = {}) {
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
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, unique (bucket_id, name));
    alter table storage.objects enable row level security;
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  const admins = conAdmin ? `('${U.admin}', '${MAIL.admin}'), ('${U.admin2}', '${MAIL.admin2}'),` : `('a0000000-0000-4000-8000-000000000001', 'coord@club.test'),`
  const perfiles = conAdmin ? `('${MAIL.admin}','Admin','coordinacion',null), ('${MAIL.admin2}','Admin 2','coordinacion',null),` : `('coord@club.test','Coordinadora','coordinacion',null),`
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${SUB16}','Sub 16',3,false);
    insert into auth.users (id, email) values ${admins} ('${U.tec}', '${MAIL.tec}'), ('${U.tec16}', '${MAIL.tec16}'), ('${U.jug}', '${MAIL.jug}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ${perfiles} ('${MAIL.tec}','Técnica','tecnico','${CAT}'),
      ('${MAIL.tec16}','Técnica Sub 16','tecnico','${SUB16}');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'), ('${J2}','Bea','Benitez','${CAT}');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Rival');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
  await db.exec(`insert into public.cuentas_jugadoras (jugador_id, usuario_id, email) values ('${J1}', '${U.jug}', '${MAIL.jug}');`)
  return db
}

async function como(db, quien, sql, params, { rol = 'authenticated', confirmar = false } = {}) {
  await db.exec('BEGIN')
  try {
    const claims = rol === 'anon' ? { role: 'anon' } : { sub: U[quien], email: MAIL[quien], role: 'authenticated' }
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await db.exec(`SET LOCAL ROLE ${rol}`)
    const r = await db.query(sql, params)
    await db.exec(confirmar ? 'COMMIT' : 'ROLLBACK')
    return r
  } catch (e) { await db.exec('ROLLBACK'); throw e }
}
const hacer = (db, quien, sql, params) => como(db, quien, sql, params, { confirmar: true })
const codigo = (c, msg) => e => { assert.equal(e.code, c, e.message); if (msg) assert.match(e.message, msg); return true }
const n = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].n)
const filas = async (db, quien, sql, params) => (await como(db, quien, sql, params)).rows.length

test('un solo DO en migración, reversión y verificación, con lock_timeout y sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', verificacion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
  for (const sql of [cambio, reversion]) assert.match(sql, /pg_notify\('pgrst', 'reload schema'\)/)
  // Toda tabla nueva de public lleva la red de cuentas de jugadoras.
  assert.match(cambio, /CREATE POLICY sin_cuentas_jugadoras ON public\.analisis_comet_nombres AS RESTRICTIVE/)
})

test('se aplica, se prueba sola sin dejar datos, pasa la verificación y no se aplica dos veces', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  assert.equal(await n(db, `select count(*) n from public.analisis_comet_nombres`), 0)
  assert.equal(await n(db, `select count(*) n from storage.objects where bucket_id = 'comet-pdf'`), 0)
  assert.equal(await n(db, `select count(*) n from public.analisis_partidos where comet is not null or comet_pdf is not null`), 0)
  assert.deepEqual((await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'comet-pdf'`)).rows[0],
    { public: false, file_size_limit: 2097152, allowed_mime_types: ['application/pdf'] })
  await db.exec(verificacion)
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
})

test('sin cuenta administradora de Análisis, o con la regla de analisis_partidos cambiada, no aplica nada', async () => {
  const sinAdmin = await crearBase({ conAdmin: false })
  await assert.rejects(sinAdmin.exec(cambio), /No se encontró una cuenta administradora/)
  const otra = await crearBase()
  await otra.exec(`drop policy analisis_partidos_update_admin on public.analisis_partidos;
    create policy analisis_partidos_update_admin on public.analisis_partidos for update to authenticated using (true) with check (true);`)
  await assert.rejects(otra.exec(cambio), /no es la esperada/)
  for (const db of [sinAdmin, otra]) {
    assert.equal(await n(db, `select count(*) n from pg_class where relname in ('analisis_comet_nombres', 'respaldo_comet_partido')`), 0)
    assert.equal(await n(db, `select count(*) n from storage.buckets where id = 'comet-pdf'`), 0)
    assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name = 'analisis_partidos' and column_name like 'comet%'`), 0)
  }
})

test('columnas: comet es un objeto de hasta 60000 caracteres; el PDF solo en la carpeta del mismo análisis', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await hacer(db, 'admin', `update public.analisis_partidos set comet = '{"arbitra":"GOMEZ, LAURA"}'::jsonb, comet_pdf = $1 where id = $2`, [PDF, P])
  assert.equal((await db.query(`select comet->>'arbitra' a from public.analisis_partidos where id = $1`, [P])).rows[0].a, 'GOMEZ, LAURA')
  await assert.rejects(db.query(`update public.analisis_partidos set comet = '[1]'::jsonb where id = $1`, [P]), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_partidos set comet = jsonb_build_object('x', repeat('a', 61000)) where id = $1`, [P]), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_partidos set comet_pdf = 'c0000000-0000-4000-8000-000000000099/comet.pdf' where id = $1`, [P]), codigo('23514'))
  // La técnica ve el partido pero no lo modifica.
  const r = await como(db, 'tec', `update public.analisis_partidos set comet = '{}'::jsonb where id = $1`, [P], { confirmar: true })
  assert.equal(r.affectedRows ?? 0, 0)
})

test('nombres de COMET: los cargan las administradoras; el staff los ve; jugadoras y anon nada', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await hacer(db, 'admin', `insert into public.analisis_comet_nombres (nombre_comet, jugador_id) values ('ALVAREZ, ANA', $1)`, [J1])
  assert.equal((await db.query(`select creado_por from public.analisis_comet_nombres`)).rows[0].creado_por, U.admin)
  await assert.rejects(hacer(db, 'admin', `insert into public.analisis_comet_nombres (nombre_comet, jugador_id) values ('Benitez, Bea', $1)`, [J2]), codigo('23514'))
  await assert.rejects(hacer(db, 'admin', `insert into public.analisis_comet_nombres (nombre_comet, jugador_id) values ('ALVAREZ, ANA', $1)`, [J2]), codigo('23505'))
  await hacer(db, 'admin2', `update public.analisis_comet_nombres set jugador_id = $1 where nombre_comet = 'ALVAREZ, ANA'`, [J2])
  assert.equal(await filas(db, 'tec', `select * from public.analisis_comet_nombres`), 1)
  assert.equal(await filas(db, 'tec16', `select * from public.analisis_comet_nombres`), 1)
  await assert.rejects(hacer(db, 'tec', `insert into public.analisis_comet_nombres (nombre_comet, jugador_id) values ('BENITEZ, BEA', $1)`, [J2]), codigo('42501'))
  const borrado = await como(db, 'tec', `delete from public.analisis_comet_nombres`, [], { confirmar: true })
  assert.equal(borrado.affectedRows ?? 0, 0)
  assert.equal(await filas(db, 'jug', `select * from public.analisis_comet_nombres`), 0)
  await assert.rejects(como(db, null, `select * from public.analisis_comet_nombres`, [], { rol: 'anon' }), codigo('42501'))
  // Si se borra la jugadora, se borra su asociación.
  await db.exec(`delete from public.cuentas_jugadoras; delete from public.jugadores where id = '${J2}'`)
  assert.equal(await n(db, `select count(*) n from public.analisis_comet_nombres`), 0)
})

test('PDF: lo sube la administradora en la carpeta de un análisis; lo ve el staff que ve ese partido; jugadoras nunca', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await hacer(db, 'admin', `insert into storage.objects (bucket_id, name) values ('comet-pdf', $1)`, [PDF])
  await assert.rejects(hacer(db, 'admin', `insert into storage.objects (bucket_id, name) values ('comet-pdf', 'suelto.pdf')`), codigo('42501'))
  await assert.rejects(hacer(db, 'admin', `insert into storage.objects (bucket_id, name) values ('comet-pdf', 'c0000000-0000-4000-8000-000000000099/comet.pdf')`), codigo('42501'))
  await assert.rejects(hacer(db, 'tec', `insert into storage.objects (bucket_id, name) values ('comet-pdf', $1)`, [PDF]), codigo('42501'))
  assert.equal(await filas(db, 'admin', `select * from storage.objects where bucket_id = 'comet-pdf'`), 1)
  // La técnica ve el partido analizado recién cuando tiene una acción de una jugadora suya; la de Sub 16, no.
  assert.equal(await filas(db, 'tec', `select * from storage.objects where bucket_id = 'comet-pdf'`), 0)
  await db.exec(`insert into public.analisis_eventos (partido_id, jugador_id, tipo, segundo, periodo) values ('${P}', '${J1}', 'Remate', 10, 1)`)
  assert.equal(await filas(db, 'tec', `select * from storage.objects where bucket_id = 'comet-pdf'`), 1)
  assert.equal(await filas(db, 'tec16', `select * from storage.objects where bucket_id = 'comet-pdf'`), 0)
  assert.equal(await filas(db, 'jug', `select * from storage.objects where bucket_id = 'comet-pdf'`), 0)
  assert.equal(await filas(db, null, `select * from storage.objects where bucket_id = 'comet-pdf'`, [], { rol: 'anon' }), 0)
  // Reemplazar y borrar: solo la administradora.
  assert.equal((await como(db, 'tec', `update storage.objects set metadata = '{}'::jsonb where bucket_id = 'comet-pdf'`, [], { confirmar: true })).affectedRows ?? 0, 0)
  assert.equal((await como(db, 'tec', `delete from storage.objects where bucket_id = 'comet-pdf'`, [], { confirmar: true })).affectedRows ?? 0, 0)
  assert.equal((await como(db, 'admin', `update storage.objects set metadata = '{}'::jsonb where bucket_id = 'comet-pdf'`, [], { confirmar: true })).affectedRows, 1)
  assert.equal((await como(db, 'admin', `delete from storage.objects where bucket_id = 'comet-pdf'`, [], { confirmar: true })).affectedRows, 1)
  // La regla de Biblioteca sigue como estaba.
  assert.equal(await n(db, `select count(*) n from pg_policies where schemaname = 'storage' and policyname = 'Biblioteca subir segun rol'`), 1)
})

test('reversión: no corre con PDFs ni con datos guardados salvo que se pida; después deja todo como antes', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(`insert into storage.objects (bucket_id, name) values ('comet-pdf', $1)`, [PDF])
  await db.query(`insert into public.analisis_comet_nombres (nombre_comet, jugador_id) values ('ALVAREZ, ANA', $1)`, [J1])
  await assert.rejects(db.exec(reversion), /Hay PDFs de COMET guardados/)
  await db.exec(`delete from storage.objects where bucket_id = 'comet-pdf'`)
  await assert.rejects(db.exec(reversion), /Hay 0 análisis con datos de COMET y 1 nombres asociados/)
  assert.equal(await n(db, `select count(*) n from public.analisis_comet_nombres`), 1)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  assert.equal(await n(db, `select count(*) n from pg_class where relname in ('analisis_comet_nombres', 'respaldo_comet_partido')`), 0)
  assert.equal(await n(db, `select count(*) n from storage.buckets where id = 'comet-pdf'`), 0)
  assert.equal(await n(db, `select count(*) n from pg_policies where schemaname = 'storage' and policyname like 'comet-pdf%'`), 0)
  assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name = 'analisis_partidos' and column_name like 'comet%'`), 0)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Faltan las columnas/)
  // Se puede volver a aplicar.
  await db.exec(cambio)
  await db.exec(verificacion)
})
