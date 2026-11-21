// Informe de partido: columna analisis_partidos.informe, su reversión y su verificación. Sobre el esquema real con
// la etapa C de la pizarra y la etapa 1 de cuentas de jugadoras, en PostgreSQL WASM en memoria. Nunca toca la base real.
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
const cambio = leer('supabase/migrations/20261122120000_informe_partido_analisis.sql')
const reversion = leer('supabase/rollback/20261122120000_informe_partido_analisis.sql')
const verificacion = leer('supabase/verification/20261122_informe_partido_analisis.sql')

const CAT = '10000000-0000-4000-8000-000000000001', SUB16 = '10000000-0000-4000-8000-000000000003'
// Las dos cuentas administradoras de Análisis del esquema real (puede_administrar_analisis), la técnica de la
// categoría del partido, la técnica de otra categoría y la preparadora física.
const U = { admin: '00000000-0000-4000-8000-000000000001', admin2: '00000000-0000-4000-8000-000000000002', tec: 'a0000000-0000-4000-8000-000000000002',
  tec16: 'a0000000-0000-4000-8000-000000000003', pf: 'a0000000-0000-4000-8000-000000000004' }
const MAIL = { admin: 'admin@club.test', admin2: 'admin2@club.test', tec: 'tec@club.test', tec16: 'tec16@club.test', pf: 'pf@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001', J2 = 'b0000000-0000-4000-8000-000000000002'
const P = 'c0000000-0000-4000-8000-000000000001'

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
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  // Sin las cuentas administradoras queda igual una coordinadora (la piden las migraciones previas), que no administra Análisis.
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
    insert into auth.users (id, email) values ${admins} ('${U.tec}', '${MAIL.tec}'), ('${U.tec16}', '${MAIL.tec16}'), ('${U.pf}', '${MAIL.pf}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ${perfiles} ('${MAIL.tec}','Técnica','tecnico','${CAT}'),
      ('${MAIL.tec16}','Técnica Sub 16','tecnico','${SUB16}'), ('${MAIL.pf}','Preparadora','preparador_fisico',null);
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'), ('${J2}','Bea','Benitez','${CAT}');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Rival');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
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
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)

const informe = '{"arbitra":"M. Sánchez","claves":[{"titulo":"Uno","texto":"Dos"}],"posicion_antes":8}'

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

test('se aplica, se prueba sola sin dejar datos, pasa la verificación y no se aplica dos veces', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  assert.equal(await n(db, `select count(*) n from public.analisis_partidos where informe is not null`), 0)
  assert.equal(await n(db, `select count(*) n from seguridad_privado.respaldo_informe_partido`), 2)
  await db.exec(verificacion)
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
})

test('la regla: solo un objeto de hasta 8000 caracteres', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(`update public.analisis_partidos set informe = $1::jsonb where id = $2`, [informe, P])
  await assert.rejects(db.query(`update public.analisis_partidos set informe = '[1]'::jsonb where id = $1`, [P]), codigo('23514'))
  await assert.rejects(db.query(`update public.analisis_partidos set informe = jsonb_build_object('x', repeat('a', 9000)) where id = $1`, [P]), codigo('23514'))
})

test('guardan el informe solo las administradoras de Análisis; la técnica lo ve pero no lo cambia; anon nada', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await hacer(db, 'admin', `update public.analisis_partidos set informe = $1::jsonb where id = $2`, [informe, P])
  assert.equal((await db.query(`select informe->>'arbitra' a from public.analisis_partidos where id = $1`, [P])).rows[0].a, 'M. Sánchez')
  // La técnica de la categoría no administra Análisis: su UPDATE no toca ninguna fila.
  const r = await como(db, 'tec', `update public.analisis_partidos set informe = '{}'::jsonb where id = $1`, [P], { confirmar: true })
  assert.equal(r.affectedRows ?? 0, 0)
  assert.equal((await db.query(`select informe->>'arbitra' a from public.analisis_partidos where id = $1`, [P])).rows[0].a, 'M. Sánchez')
  await assert.rejects(como(db, null, `select informe from public.analisis_partidos`, [], { rol: 'anon' }), codigo('42501'))
})

test('sin la regla esperada para modificar analisis_partidos, no aplica nada', async () => {
  const db = await crearBase()
  await db.exec(`drop policy analisis_partidos_update_admin on public.analisis_partidos;
    create policy analisis_partidos_update_admin on public.analisis_partidos for update to authenticated using (true) with check (true);`)
  await assert.rejects(db.exec(cambio), /no es la esperada/)
  assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name = 'analisis_partidos' and column_name = 'informe'`), 0)
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'respaldo_informe_partido'`), 0)
})

test('reversión: no borra datos guardados salvo que se pida; después deja todo como antes', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.query(`update public.analisis_partidos set informe = $1::jsonb where id = $2`, [informe, P])
  await assert.rejects(db.exec(reversion), /Hay 1 análisis con datos del informe/)
  assert.equal(await n(db, `select count(*) n from public.analisis_partidos where informe is not null`), 1)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name = 'analisis_partidos' and column_name = 'informe'`), 0)
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'respaldo_informe_partido'`), 0)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Falta la columna/)
  // Se puede volver a aplicar.
  await db.exec(cambio)
  await db.exec(verificacion)
})
