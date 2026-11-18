// Ajustes de avisos (revisión final de la etapa 2): corte de las 20:00 en el trigger de publicación, tick() que marca
// lo vencido, avisos-limpieza que busca avisos-tick por nombre, su reversión y el script de verificación del
// calendario. Sobre el esquema real con la etapa C, la etapa 1 y la etapa 2 aplicadas, en PostgreSQL WASM en memoria.
// pg_cron, pg_net y Vault se simulan como en tests/avisos.postgres.mjs; cron.schedule actualiza por nombre (pg_cron 1.6).
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
const etapa2 = leer('supabase/migrations/20261117120000_avisos_etapa2.sql')
const etapa2Reversion = leer('supabase/rollback/20261117120000_avisos_etapa2.sql')
const cambio = leer('supabase/migrations/20261118120000_avisos_ajustes.sql')
const reversion = leer('supabase/rollback/20261118120000_avisos_ajustes.sql')
const prueba = leer('supabase/verification/20261118_prueba_calendario_avisos.sql')

const CAT = '10000000-0000-4000-8000-000000000001', RES = '10000000-0000-4000-8000-000000000002', SUB16 = '10000000-0000-4000-8000-000000000003'
const COORD = '00000000-0000-4000-8000-000000000001', TEC = 'a0000000-0000-4000-8000-000000000002', MED = 'a0000000-0000-4000-8000-000000000004'
const HOY = `(now() at time zone 'America/Argentina/Buenos_Aires')::date`
const LIMPIEZA_NUEVA = `DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'avisos-tick') AND coalesce(end_time, start_time) < now() - interval '7 days'`

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
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
    create schema cron; create schema net; create schema vault;
    create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique,
      username text not null default current_user, active boolean not null default true);
    -- Como pg_cron 1.6: con un nombre que ya existe, actualiza la tarea (mismo jobid).
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql
      as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
            on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
    create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
      begin delete from cron.job where jobname = job_name;
        if not found then raise exception 'could not find valid entry for job ''%''', job_name; end if; return true; end $$;
    create table cron.job_run_details (runid bigserial primary key, jobid bigint, command text, status text,
      start_time timestamptz, end_time timestamptz);
    create table net.llamadas (id bigserial primary key, url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
      language sql as $$ insert into net.llamadas (url, body, params, headers, timeout_milliseconds)
        values (url, body, params, headers, timeout_milliseconds) returning id $$;
    create table vault.secretos (name text primary key, decrypted_secret text);
    create view vault.decrypted_secrets as select name, decrypted_secret from vault.secretos;
    revoke all on schema cron, net, vault from public;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${RES}','Reserva',2,true), ('${SUB16}','Sub 16',3,false);
    insert into auth.users (id, email) values ('${COORD}', 'coord@club.test'), ('${TEC}', 'tec@club.test'), ('${MED}', 'med@club.test');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ('coord@club.test','Coordinadora','coordinacion',null),
      ('tec@club.test','Técnica','tecnico','${CAT}'),('med@club.test','Médica','medico',null);
    insert into public.jugadores (nombre, apellido, categoria_id) values ('Ana','Alvarez','${CAT}'), ('Rita','Ruiz','${SUB16}');
    insert into public.partidos (categoria_id, rival, fecha, hora) values ('${CAT}','Rival','2026-11-22','10:00');
    insert into public.datafem_tablas (id) values (1);
    insert into public.evaluacion_criterios (nombre) values ('Técnica');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
  await db.exec(etapa2)
  return db
}

const n = async (db, sql, params) => (await db.query(`select (${sql})::int as n`, params)).rows[0].n
const def = async (db, fn) => (await db.query(`select pg_get_functiondef($1::regprocedure) d`, [fn])).rows[0].d
async function enPrueba(db, fn) {
  await db.exec('BEGIN')
  try { return await fn() } finally { await db.exec('ROLLBACK') }
}
// Cantidad de filas de cada tabla de public.
async function filasPublic(db) {
  const tablas = (await db.query(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`)).rows
  const salida = {}
  for (const { relname } of tablas) salida[relname] = await n(db, `select count(*) from public."${relname}"`)
  return salida
}

test('un solo DO en migración, reversión y script de verificación', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', prueba]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
  for (const sql of [cambio, reversion]) assert.match(sql.replace(/--[^\n]*/g, ''), /pg_notify\('pgrst', 'reload schema'\)/)
  // El script de verificación termina con la lectura de resultados, fuera del DO.
  assert.match(prueba, /\$prueba_calendario\$;\s*\n(--[^\n]*\n)*SELECT \* FROM seguridad_privado\.prueba_calendario_avisos ORDER BY orden;\s*$/)
})

test('ajustes de avisos: corte de las 20:00, tick, limpieza y reversión', async t => {
  const db = await crearBase()
  try {
    const defTrigger = await def(db, 'avisos_privado.entrenamiento_publicado()')
    const defTick = await def(db, 'avisos_privado.tick()')
    const jobs = async () => (await db.query(`select jobid::int id, jobname, schedule, command from cron.job order by jobid`)).rows
    const jobsAntes = await jobs()
    const acl = async () => (await db.query(`select p.proname, p.proacl::text acl, p.prosecdef s, p.proconfig::text c from pg_proc p
      where p.pronamespace = 'avisos_privado'::regnamespace order by 1`)).rows
    const aclAntes = await acl()

    const res = await db.exec(cambio)
    assert.ok(res.at(-1).rows.length > 0, 'el SELECT final devuelve el resumen')
    await assert.rejects(db.exec(cambio), /ya se aplicaron/)

    await t.test('respaldo: definiciones y tarea anteriores', async () => {
      const r = Object.fromEntries((await db.query(`select nombre, detalle from seguridad_privado.respaldo_avisos_ajustes`)).rows.map(x => [x.nombre, x.detalle]))
      const limpieza = jobsAntes.find(j => j.jobname === 'avisos-limpieza')
      assert.deepEqual(r, { 'avisos_privado.entrenamiento_publicado()': defTrigger, 'avisos_privado.tick()': defTick,
        'avisos-limpieza': limpieza.command, 'avisos-limpieza horario': limpieza.schedule })
    })

    await t.test('permisos: iguales, y el ayudante nace sin permisos', async () => {
      const ahora = await acl()
      assert.deepEqual(ahora.filter(f => f.proname !== 'corte_publicacion'), aclAntes)
      const corte = ahora.find(f => f.proname === 'corte_publicacion')
      assert.equal(corte.s, true)
      assert.equal(corte.c, '{"search_path=\\"\\""}')
      for (const rol of ['anon', 'authenticated', 'service_role', 'public']) {
        for (const fn of ['avisos_privado.corte_publicacion(timestamp)', 'avisos_privado.tick()', 'avisos_privado.entrenamiento_publicado()']) {
          assert.equal((await db.query(`select has_function_privilege($1, $2, 'EXECUTE') v`, [rol, fn])).rows[0].v, false, `${rol} ${fn}`)
        }
      }
    })

    await t.test('corte_publicacion: 19:59 avisa, 20:00 no', async () => {
      const corte = async ts => (await db.query(`select avisos_privado.corte_publicacion($1::timestamp) v`, [ts])).rows[0].v
      assert.equal(await corte('2026-11-18 19:59:00'), true)
      assert.equal(await corte('2026-11-18 19:59:59'), true)
      assert.equal(await corte('2026-11-18 20:00:00'), false)
      assert.equal(await corte('2026-11-18 23:59:00'), false)
      assert.equal(await corte('2026-11-18 00:00:00'), true)
      assert.equal(await corte(null), false)
    })

    await t.test('trigger: publicada a las 20:00 o más tarde no encola; antes, igual que siempre', async () => {
      const hoy = (await db.query(`select ${HOY}::text d`)).rows[0].d
      const entrenamientos = () => n(db, `select count(*) from public.avisos_envios where tipo = 'entrenamiento'`)
      // PGlite no puede fijar now(): se reemplaza el ayudante dentro de la transacción que se deshace.
      const publicar = () => db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [CAT, hoy])
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await db.exec(`create or replace function avisos_privado.corte_publicacion(p_local timestamp) returns boolean language sql as $$ select false $$`)
        await publicar()
        assert.equal(await entrenamientos(), 0, 'a la noche no encola')
      })
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await db.exec(`create or replace function avisos_privado.corte_publicacion(p_local timestamp) returns boolean language sql as $$ select true $$`)
        await publicar()
        assert.equal(await entrenamientos(), 1, 'antes de las 20:00 encola')
      })
      // El trigger le pasa la hora local de Argentina.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await db.exec(`create table public.horas_vistas (h timestamp)`)
        await db.exec(`create or replace function avisos_privado.corte_publicacion(p_local timestamp) returns boolean language plpgsql as $$
          begin insert into public.horas_vistas values (p_local); return true; end $$`)
        await publicar()
        assert.equal(await n(db, `select count(*) from public.horas_vistas
          where abs(extract(epoch from h - (now() at time zone 'America/Argentina/Buenos_Aires'))) < 60`), 1)
      })
      // Un error adentro (también en el ayudante) nunca frena el guardado del staff.
      await enPrueba(db, async () => {
        await db.exec(`create or replace function avisos_privado.corte_publicacion(p_local timestamp) returns boolean language sql as $$ select 1/0 = 1 $$`)
        await publicar()
        assert.equal(await n(db, `select count(*) from public.planificacion_sesiones`), 1)
        assert.equal(await entrenamientos(), 0)
      })
    })

    await t.test('tick: deja en error lo vencido aunque no haya secretos', async () => {
      await db.exec('delete from public.avisos_envios; delete from net.llamadas; delete from vault.secretos')
      await db.exec('update public.avisos_config set activo = false')
      const crear = async (tipo, minutos, extra = {}) => (await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, texto, rol_remitente, creado_at, estado, tomado_at)
        values ($1, $2, ${HOY} - $6::int, $3, $4, now() - make_interval(mins => $5), $7, $8) returning id`,
        [tipo, CAT, tipo === 'manual' ? 'Hola' : null, tipo === 'manual' ? 'coordinacion' : null, minutos, extra.diasAtras || 0,
          extra.estado || 'pendiente', extra.tomado || null])).rows[0].id
      const casos = [
        ['wellness 91 min', await crear('wellness', 91), 'error'],
        ['wellness 89 min', await crear('wellness', 89), 'pendiente'],
        ['rpe de ayer', await crear('rpe', 5, { diasAtras: 1 }), 'error'],
        ['entrenamiento 181 min', await crear('entrenamiento', 181), 'error'],
        ['manual 24 h + 1 min', await crear('manual', 24 * 60 + 1), 'error'],
        ['manual 10 min', await crear('manual', 10), 'pendiente'],
        ['rpe enviando trabado y vencido', await crear('rpe', 91, { estado: 'enviando', tomado: new Date(Date.now() - 11 * 60000).toISOString() }), 'error'],
        ['wellness enviando hace poco', await crear('wellness', 91, { estado: 'enviando', tomado: new Date().toISOString() }), 'enviando'],
      ]
      await db.exec('select avisos_privado.tick()')
      for (const [nombre, id, estado] of casos) {
        const fila = (await db.query('select estado, enviado_at is not null e from public.avisos_envios where id = $1', [id])).rows[0]
        assert.equal(fila.estado, estado, nombre)
        assert.equal(fila.e, estado === 'error', `${nombre}: enviado_at`)
      }
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0, 'sin secretos no llama')
      // Con secretos: llama por lo que todavía se puede mandar.
      await db.exec(`insert into vault.secretos values ('avisos_funcion_url', 'https://ejemplo.test/functions/v1/avisos-enviar'), ('avisos_secreto', 'secreto-de-prueba')`)
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 1)
      // Solo vencidos: los marca y no llama.
      await db.exec('delete from public.avisos_envios; delete from net.llamadas')
      const solo = await crear('wellness', 91)
      await db.exec('select avisos_privado.tick()')
      assert.equal((await db.query('select estado from public.avisos_envios where id = $1', [solo])).rows[0].estado, 'error')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0)
      await db.exec('delete from public.avisos_envios; delete from net.llamadas; delete from vault.secretos')
      await db.exec('update public.avisos_config set activo = true')
    })

    await t.test('avisos-limpieza: mismo jobid, comando por nombre y borra solo lo viejo de avisos-tick', async () => {
      const ahora = await jobs()
      assert.deepEqual(ahora.map(j => j.id), jobsAntes.map(j => j.id), 'no se crean tareas nuevas')
      const limpieza = ahora.find(j => j.jobname === 'avisos-limpieza')
      assert.equal(limpieza.command, LIMPIEZA_NUEVA)
      assert.equal(limpieza.schedule, '17 4 * * *')
      assert.deepEqual(ahora.find(j => j.jobname === 'avisos-tick'), jobsAntes.find(j => j.jobname === 'avisos-tick'))
      const tickId = ahora.find(j => j.jobname === 'avisos-tick').id
      await db.query(`insert into cron.job_run_details (jobid, status, start_time, end_time) values
        ($1, 'viejo', now() - interval '8 days', now() - interval '8 days'),
        ($1, 'nuevo', now() - interval '6 days', now() - interval '6 days'),
        ($1, 'colgado', now() - interval '9 days', null),
        ($2, 'otra', now() - interval '30 days', now() - interval '30 days')`, [tickId, tickId + 100])
      await db.exec(limpieza.command)
      assert.deepEqual((await db.query(`select status from cron.job_run_details order by runid`)).rows.map(r => r.status), ['nuevo', 'otra'])
      await db.exec('delete from cron.job_run_details')
    })

    await t.test('reversión: vuelve exactamente a como estaba y se puede volver a aplicar', async () => {
      await db.exec(reversion)
      assert.equal(await def(db, 'avisos_privado.entrenamiento_publicado()'), defTrigger)
      assert.equal(await def(db, 'avisos_privado.tick()'), defTick)
      assert.deepEqual(await jobs(), jobsAntes)
      assert.deepEqual(await acl(), aclAntes)
      assert.equal(await n(db, `select count(*) from pg_class where relname = 'respaldo_avisos_ajustes'`), 0)
      await assert.rejects(db.exec(reversion), /nada que revertir/)
      await db.exec(cambio)
      assert.equal((await jobs()).find(j => j.jobname === 'avisos-limpieza').command, LIMPIEZA_NUEVA)
      // Con los ajustes puestos, la reversión de la etapa 2 se frena (el esquema no queda vacío); primero esta.
      await assert.rejects(db.exec(etapa2Reversion))
      await db.exec(reversion)
      await db.exec(etapa2Reversion)
      assert.equal(await n(db, `select count(*) from cron.job`), 0)
    })
  } finally { await db.close() }
})

test('ajustes: no corren sin la etapa 2 ni sin avisos-limpieza', async () => {
  const db = await crearBase()
  try {
    await db.exec(`select cron.unschedule('avisos-limpieza')`)
    await assert.rejects(db.exec(cambio), /avisos-limpieza/)
    await db.exec(`select cron.schedule('avisos-limpieza', '17 4 * * *', 'select 1')`)
    await db.exec('alter table seguridad_privado.respaldo_avisos rename to respaldo_avisos_x')
    await assert.rejects(db.exec(cambio), /etapa 2/)
    await db.exec('alter table seguridad_privado.respaldo_avisos_x rename to respaldo_avisos')
    await enPrueba(db, async () => {
      await db.exec('delete from seguridad_privado.respaldo_avisos')
      await assert.rejects(db.exec(cambio), /no tiene respaldo/)
    })
    assert.equal(await n(db, `select count(*) from pg_proc where proname = 'corte_publicacion'`), 0)
    assert.equal(await n(db, `select count(*) from pg_class where relname = 'respaldo_avisos_ajustes'`), 0)
    await db.exec(cambio)
    assert.equal(await n(db, `select count(*) from pg_proc where proname = 'corte_publicacion'`), 1)
  } finally { await db.close() }
})

test('script de verificación del calendario: todo OK y no deja datos', async () => {
  const db = await crearBase()
  try {
    await assert.rejects(db.exec(prueba), /ajustes de avisos/)
    await db.exec(cambio)
    // Con datos reales en las tablas (categorías con su config, jugadoras, un partido): quedan igual.
    const antes = await filasPublic(db)
    const usuariosAntes = await n(db, 'select count(*) from auth.users')
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const res = await db.exec(prueba)
      const filas = res.at(-1).rows
      for (const f of filas) assert.equal(f.resultado, 'OK', `${f.caso}: esperado ${f.esperado}, obtenido ${f.obtenido}`)
      assert.deepEqual(filas.map(f => f.orden), Array.from({ length: 16 }, (_, i) => i + 1), JSON.stringify(filas))
      // La sesión de mañana publicada hoy: ni aviso de entrenamiento ni se ve hoy; el combinado sale a las 7:10 de su día.
      const caso = texto => filas.find(f => f.caso.startsWith(texto))
      assert.deepEqual(['Sesión de mañana publicada hoy', 'Sesión de mañana: tiene bloques', 'Sesión de mañana: hoy no se ve', 'El día de la sesión a las 7:10', 'Control: la sesión de hoy sí se ve']
        .map(t => [caso(t)?.esperado, caso(t)?.resultado]), [['0', 'OK'], ['true', 'OK'], ['[]', 'OK'], ['combinado', 'OK'], ['hoy true · mañana false', 'OK']])
      assert.deepEqual(await filasPublic(db), antes)
      assert.equal(await n(db, 'select count(*) from auth.users'), usuariosAntes)
      for (const tabla of ['avisos_envios', 'avisos_suscripciones', 'avisos_pausas', 'avisos_preferencias', 'cuentas_jugadoras', 'planificacion_sesiones', 'bienestar']) {
        assert.equal(await n(db, `select count(*) from public.${tabla}`), 0, tabla)
      }
    }
    // La tabla de resultados no la ve nadie más que postgres.
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query(`select has_table_privilege($1, 'seguridad_privado.prueba_calendario_avisos', 'SELECT') v`, [rol])).rows[0].v, false, rol)
    }
    // Con una pausa de todas las categorías que cubre mañana, la prueba igual da OK y la pausa queda.
    await db.exec(`insert into public.avisos_pausas (categoria_id, desde, hasta, motivo) values (null, ${HOY} + 1, ${HOY} + 1, 'Feriado')`)
    const conPausa = (await db.exec(prueba)).at(-1).rows
    assert.deepEqual(conPausa.filter(f => f.resultado !== 'OK'), [])
    assert.equal(await n(db, 'select count(*) from public.avisos_pausas'), 1)
    await db.exec('delete from public.avisos_pausas')
    // Si una regla se rompe, la fila dice FALLA (y la prueba igual se deshace).
    await db.exec(`create or replace function avisos_privado.corte_publicacion(p_local timestamp) returns boolean language sql
      security definer set search_path = '' as $$ select true $$`)
    const filas = (await db.exec(prueba)).at(-1).rows
    assert.deepEqual(filas.filter(f => f.resultado === 'FALLA').map(f => f.caso), ['Sesión publicada a las 20:00: no avisa'])
    assert.deepEqual(await filasPublic(db), antes)
  } finally { await db.close() }
})
