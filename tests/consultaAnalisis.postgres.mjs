// Análisis en modo consulta para el cuerpo técnico: la técnica ve los análisis de su categoría (también acciones sin
// jugadora y las marcas del partido) y no puede escribir; segundo_fin para acciones que duran. Reversión y verificación.
// Sobre el esquema real con la etapa C de la pizarra, la etapa 1 de cuentas de jugadoras y las marcas del partido, en
// PostgreSQL WASM en memoria. Nunca toca la base real.
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
const marcas = leer('supabase/migrations/20261121120000_eventos_partido_analisis.sql')
const cambio = leer('supabase/migrations/20261123120000_consulta_analisis_cuerpo_tecnico.sql')
const reversion = leer('supabase/rollback/20261123120000_consulta_analisis_cuerpo_tecnico.sql')
const verificacion = leer('supabase/verification/20261123_consulta_analisis_cuerpo_tecnico.sql')

const CAT = '10000000-0000-4000-8000-000000000001', SUB16 = '10000000-0000-4000-8000-000000000003'
const U = { admin: '00000000-0000-4000-8000-000000000001', coord: 'a0000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002',
  tec16: 'a0000000-0000-4000-8000-000000000003', pf: 'a0000000-0000-4000-8000-000000000004' }
const MAIL = { admin: 'admin@club.test', coord: 'coord@club.test', tec: 'tec@club.test', tec16: 'tec16@club.test', pf: 'pf@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001'
const P = 'c0000000-0000-4000-8000-000000000001', P_VACIO = 'c0000000-0000-4000-8000-000000000002'
const E_CON = 'd0000000-0000-4000-8000-000000000001', E_SIN = 'd0000000-0000-4000-8000-000000000002'

async function crearBase() {
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
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${SUB16}','Sub 16',3,false);
    insert into auth.users (id, email) values ('${U.admin}', '${MAIL.admin}'), ('${U.coord}', '${MAIL.coord}'), ('${U.tec}', '${MAIL.tec}'),
      ('${U.tec16}', '${MAIL.tec16}'), ('${U.pf}', '${MAIL.pf}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ('${MAIL.admin}','Admin','coordinacion',null),
      ('${MAIL.coord}','Coordinadora','coordinacion',null), ('${MAIL.tec}','Técnica','tecnico','${CAT}'),
      ('${MAIL.tec16}','Técnica Sub 16','tecnico','${SUB16}'), ('${MAIL.pf}','Preparadora','preparador_fisico',null);
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'), ('b0000000-0000-4000-8000-000000000002','Bea','Benitez','${CAT}');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Rival'), ('${P_VACIO}', '${CAT}', 'Sin acciones');
    insert into public.analisis_eventos (id, partido_id, jugador_id, segundo, tipo) values
      ('${E_CON}', '${P}', '${J1}', 30, 'Remate'), ('${E_SIN}', '${P}', null, 60, 'Remate');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
  await db.exec(marcas)
  await db.exec(`insert into public.analisis_partido_eventos (partido_id, tipo, segundo) values ('${P}', 'inicio_1t', 5)`)
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
const codigo = c => e => { assert.equal(e.code, c, e.message); return true }
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)
const cuenta = async (db, quien, tabla) => Number((await como(db, quien, `select count(*) n from public.${tabla}`)).rows[0].n)

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

test('antes: la técnica no ve el análisis sin acciones ni las acciones sin jugadora', async () => {
  const db = await crearBase()
  assert.equal(await cuenta(db, 'tec', 'analisis_partidos'), 1)
  assert.equal(await cuenta(db, 'tec', 'analisis_eventos'), 1)
})

test('después: coordinación y la técnica de la categoría ven todo el análisis; otra categoría y otras áreas, como antes', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await db.exec(verificacion)
  for (const quien of ['admin', 'coord', 'tec']) {
    assert.equal(await cuenta(db, quien, 'analisis_partidos'), 2, quien)
    assert.equal(await cuenta(db, quien, 'analisis_eventos'), 2, quien)
    assert.equal(await cuenta(db, quien, 'analisis_partido_eventos'), 1, quien)
  }
  assert.equal(await cuenta(db, 'tec16', 'analisis_partidos'), 0)
  assert.equal(await cuenta(db, 'tec16', 'analisis_eventos'), 0)
  assert.equal(await cuenta(db, 'tec16', 'analisis_partido_eventos'), 0)
  // La preparadora física ve las acciones con jugadora (como antes, por el perfil individual), no las demás.
  assert.equal(await cuenta(db, 'pf', 'analisis_eventos'), 1)
  await assert.rejects(como(db, null, 'select count(*) from public.analisis_eventos', [], { rol: 'anon' }), codigo('42501'))
  await assert.rejects(como(db, null, `select public.puede_consultar_analisis('${P}')`, [], { rol: 'anon' }), codigo('42501'))
  await assert.rejects(db.exec(cambio), /Ya está aplicada/)
})

test('ver no es escribir: la técnica y la coordinadora no administradora no cambian nada; la administradora sí', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  for (const quien of ['tec', 'coord']) {
    await assert.rejects(como(db, quien, `insert into public.analisis_eventos (partido_id, segundo, tipo) values ($1, 10, 'Remate')`, [P]), codigo('42501'))
    const upd = await como(db, quien, `update public.analisis_eventos set segundo = 99 where id = $1`, [E_SIN], { confirmar: true })
    assert.equal(upd.affectedRows ?? 0, 0, quien)
    const del = await como(db, quien, `delete from public.analisis_eventos where id = $1`, [E_SIN], { confirmar: true })
    assert.equal(del.affectedRows ?? 0, 0, quien)
    await assert.rejects(como(db, quien, `insert into public.analisis_partido_eventos (partido_id, tipo, segundo) values ($1, 'fin_1t', 2700)`, [P]), codigo('42501'))
  }
  assert.equal(await n(db, `select count(*) n from public.analisis_eventos where segundo = 99`), 0)
  const r = await como(db, 'admin', `update public.analisis_eventos set segundo_fin = 75 where id = $1`, [E_SIN], { confirmar: true })
  assert.equal(r.affectedRows, 1)
})

test('segundo_fin: vacío o mayor o igual que el inicio', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  assert.equal(await n(db, `select count(*) n from public.analisis_eventos where segundo_fin is not null`), 0)
  await db.query(`update public.analisis_eventos set segundo_fin = 60 where id = $1`, [E_SIN])
  await assert.rejects(db.query(`update public.analisis_eventos set segundo_fin = 10 where id = $1`, [E_SIN]), codigo('23514'))
})

test('si alguna regla deja escribir a otras cuentas, no aplica nada', async () => {
  const db = await crearBase()
  await db.exec(`create policy abierta on public.analisis_eventos for insert to authenticated with check (true)`)
  await assert.rejects(db.exec(cambio), /dejan escribir en Análisis a otras cuentas: analisis_eventos.abierta/)
  assert.equal(await n(db, `select count(*) n from pg_proc where proname = 'puede_consultar_analisis'`), 0)
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'respaldo_consulta_analisis'`), 0)
})

test('reversión: no borra segundo_fin cargado salvo que se pida; después deja las reglas como antes', async () => {
  const db = await crearBase()
  const antes = (await db.query(`select policyname, qual from pg_policies where policyname in ('analisis_partidos_read','analisis_eventos_read') order by 1`)).rows
  await db.exec(cambio)
  await db.query(`update public.analisis_eventos set segundo_fin = 70 where id = $1`, [E_SIN])
  await assert.rejects(db.exec(reversion), /Hay 1 acciones con segundo_fin/)
  await db.exec(reversion.replace('v_borrar_datos constant boolean := false', 'v_borrar_datos constant boolean := true'))
  const despues = (await db.query(`select policyname, qual from pg_policies where policyname in ('analisis_partidos_read','analisis_eventos_read') order by 1`)).rows
  assert.deepEqual(despues, antes)
  assert.equal(await cuenta(db, 'tec', 'analisis_eventos'), 1)
  assert.equal(await n(db, `select count(*) n from information_schema.columns where table_name = 'analisis_eventos' and column_name = 'segundo_fin'`), 0)
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await assert.rejects(db.exec(verificacion), /Falta la función/)
  await db.exec(cambio)
  await db.exec(verificacion)
})
