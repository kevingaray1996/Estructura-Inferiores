// Avisos al celular (etapa 2): migración, calendario, destinatarios, permisos, tick y reversión sobre el esquema real
// con la etapa C y las cuentas de jugadoras (etapa 1) aplicadas, en PostgreSQL WASM en memoria. Sin credenciales.
// pg_cron, pg_net y Vault se simulan: cron.schedule anota en cron.job y net.http_post anota la llamada en net.llamadas.
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
const cambio = leer('supabase/migrations/20261117120000_avisos_etapa2.sql')
const reversion = leer('supabase/rollback/20261117120000_avisos_etapa2.sql')

const CAT = '10000000-0000-4000-8000-000000000001', RES = '10000000-0000-4000-8000-000000000002', SUB16 = '10000000-0000-4000-8000-000000000003'
const U = { coord: '00000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002', pf: 'a0000000-0000-4000-8000-000000000003',
  med: 'a0000000-0000-4000-8000-000000000004', nadie: 'a0000000-0000-4000-8000-0000000000ff', tecres: 'a0000000-0000-4000-8000-000000000005',
  pfsin: 'a0000000-0000-4000-8000-000000000006',
  ana: 'c0000000-0000-4000-8000-000000000001', bea: 'c0000000-0000-4000-8000-000000000002', rita: 'c0000000-0000-4000-8000-000000000003',
  dora: 'c0000000-0000-4000-8000-000000000004' }
const MAIL = { coord: 'coord@club.test', tec: 'tec@club.test', pf: 'pf@club.test', med: 'med@club.test', nadie: 'nadie@club.test',
  tecres: 'tecres@club.test', pfsin: 'pfsin@club.test',
  ana: 'ana@jugadoras.test', bea: 'bea@jugadoras.test', rita: 'rita@jugadoras.test', dora: 'dora@jugadoras.test' }
const J = { ana: 'b0000000-0000-4000-8000-000000000001', bea: 'b0000000-0000-4000-8000-000000000002', rita: 'b0000000-0000-4000-8000-000000000003',
  cami: 'b0000000-0000-4000-8000-000000000004', dora: 'b0000000-0000-4000-8000-000000000005' }
const PARTIDO = 'd0000000-0000-4000-8000-000000000010'
const HOY = `(now() at time zone 'America/Argentina/Buenos_Aires')::date`
const TABLAS = ['avisos_config', 'avisos_pausas', 'avisos_suscripciones', 'avisos_preferencias', 'avisos_envios']
const P256 = 'B' + 'A'.repeat(86), AUTH = 'abcdefghij_-KLMNOPQRST'
const ep = n => `https://fcm.googleapis.com/fcm/send/${n}`
// Jueves 19/11/2026 a las 7:10 de Argentina (UTC-3) y el martes 17/11.
const JUE = '2026-11-19', MAR = '2026-11-17'

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
    -- Simulación de pg_cron, pg_net y Vault (en producción son las extensiones reales).
    create schema cron; create schema net; create schema vault;
    create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique,
      username text not null default current_user, active boolean not null default true);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql
      as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $$;
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
    insert into auth.users (id, email) select (x->>'id')::uuid, x->>'email' from jsonb_array_elements('${JSON.stringify(Object.keys(U).map(k => ({ id: U[k], email: MAIL[k] })))}'::jsonb) x;
    insert into public.perfiles (email, nombre, rol, categoria_id) values ('${MAIL.coord}','Coordinadora','coordinacion',null),('${MAIL.tec}','Técnica','tecnico','${CAT}'),
      ('${MAIL.pf}','Profe','preparador_fisico','${CAT}'),('${MAIL.med}','Médica','medico',null),('${MAIL.tecres}','Técnico Reserva','tecnico','${RES}'),
      ('${MAIL.pfsin}','Profe sin categoría','preparador_fisico',null);
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J.ana}','Ana','Alvarez','${CAT}'),
      ('${J.bea}','Bea','Benitez','${CAT}'),('${J.rita}','Rita','Ruiz','${SUB16}'),('${J.cami}','Cami','Castro','${CAT}'),('${J.dora}','Dora','Diaz','${CAT}');
    insert into public.partidos (id, categoria_id, rival, fecha, hora) values ('${PARTIDO}','${CAT}','Rival','2026-11-22','10:00');
    insert into public.datafem_tablas (id) values (1);
    insert into public.evaluacion_criterios (nombre) values ('Técnica');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
  return db
}

// Corre una consulta como un usuario y deshace todo (o confirma). rol: 'authenticated', 'anon' o 'service_role'.
async function como(db, quien, sql, params, { rol = 'authenticated', confirmar = false } = {}) {
  await db.exec('BEGIN')
  try {
    const claims = rol === 'anon' ? { role: 'anon' } : rol === 'service_role' ? { role: 'service_role' } : { sub: U[quien], email: MAIL[quien], role: 'authenticated' }
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await db.exec(`SET LOCAL ROLE ${rol}`)
    const r = await db.query(sql, params)
    await db.exec(confirmar ? 'COMMIT' : 'ROLLBACK')
    return r
  } catch (e) { await db.exec('ROLLBACK'); throw e }
}
const valor = async (db, quien, sql, params, opciones) => (await como(db, quien, `select ${sql} as v`, params, opciones)).rows[0].v
const hacer = (db, quien, sql, params) => como(db, quien, sql, params, { confirmar: true })
const servicio = (db, sql, params) => como(db, null, sql, params, { rol: 'service_role', confirmar: true })
const codigo = (c, msg) => e => { assert.equal(e.code, c, e.message); if (msg) assert.match(e.message, msg); return true }
const n = async (db, sql, params) => (await db.query(`select (${sql})::int as n`, params)).rows[0].n

// Corre fn dentro de una transacción que se deshace.
async function enPrueba(db, fn) {
  await db.exec('BEGIN')
  try { return await fn() } finally { await db.exec('ROLLBACK') }
}

// Foto de políticas, funciones, permisos, esquemas y triggers fuera de los esquemas del sistema.
const FOTO = `
  select string_agg(linea, E'\\n' order by linea) as foto from (
    select format('pol %s.%s %s %s %s %s %s %s', schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check) as linea from pg_policies
    union all select format('fn %s %s %s', p.oid::regprocedure, md5(pg_get_functiondef(p.oid)), p.proacl) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%'
    union all select format('rel %s.%s %s %s %s', n.nspname, c.relname, c.relkind, c.relacl, c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%' and c.relkind in ('r','p','v','m','f','S')
    union all select format('esq %s %s', nspname, nspacl) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'
    union all select format('trg %s %s', tgrelid::regclass, tgname) from pg_trigger where not tgisinternal
    union all select format('def %s %s', defaclnamespace::regnamespace, defaclacl) from pg_default_acl
  ) t`
const foto = async db => (await db.query(FOTO)).rows[0].foto

// Ayudantes del calendario (como postgres, dentro de enPrueba).
const programar = async (db, ahora) => (await db.query(`select avisos_privado.programar($1::timestamptz) n`, [ahora])).rows[0].n
// Los envíos automáticos de la mañana y del RPE de una categoría (el de entrenamiento lo crea el trigger).
const envios = async (db, cat) => (await db.query(`select tipo, fecha::text as fecha, clave from public.avisos_envios
  where categoria_id = $1 and tipo in ('wellness','combinado','rpe') order by creado_at, tipo`, [cat])).rows
// Una sesión de planificación. Si la fecha es hoy, el trigger puede crear un 'entrenamiento': se borra para que el
// test del calendario no dependa de la hora real.
async function sesion(db, cat, fecha, tipo, estado) {
  await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, $3, $4)`, [cat, fecha, tipo, estado])
  await db.exec(`delete from public.avisos_envios where tipo = 'entrenamiento'`)
}
const pausa = (db, cat, desde, hasta) => db.query(`insert into public.avisos_pausas (categoria_id, desde, hasta, motivo) values ($1, $2, $3, 'Feriado')`, [cat, desde, hasta])

// Un envío cargado a mano (como postgres) y sus destinos.
async function envio(db, campos) {
  const c = { categoria_id: CAT, fecha: JUE, jugadoras: null, texto: null, rol_remitente: null, partido_id: null, ...campos }
  return (await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, jugadoras, texto, rol_remitente, partido_id)
    values ($1, $2, $3, $4, $5, $6, $7) returning id`, [c.tipo, c.categoria_id, c.fecha, c.jugadoras, c.texto, c.rol_remitente, c.partido_id])).rows[0].id
}
const destinos = async (db, id) => (await db.query(`select d.*, j.nombre from public.avisos_destinos($1) d join public.jugadores j on j.id = d.jugador_id
  order by j.nombre, d.endpoint`, [id])).rows
const nombres = filas => filas.map(f => f.nombre)
const completar = (db, jugador, fecha) => db.query(`insert into public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar)
  values ($1, $2, 3, 3, 3, 3, 3)`, [jugador, fecha])

const suscribir = (db, quien, endpoint, dispositivo = 'android') =>
  hacer(db, quien, 'select public.portal_avisos_suscribir($1, $2, $3, $4)', [endpoint, P256, AUTH, dispositivo])
const mandar = (db, quien, cat, texto = 'Mañana se entrena a las 9.', jugadoras = null) =>
  hacer(db, quien, 'select public.avisos_mandar($1, $2, $3) as id', [cat, jugadoras, texto])

// Todas las funciones nuevas con argumentos de ejemplo, para probar quién puede llamarlas.
const STAFF_FN = [
  'public.avisos_panel()', `public.avisos_jugadoras('${CAT}')`,
  `public.avisos_guardar_config('${CAT}', true, '{3,4,5}'::smallint[], '07:10', '10:15')`,
  `public.avisos_crear_pausa(null, '2026-12-24', '2026-12-26', 'Fiestas')`, `public.avisos_borrar_pausa('${CAT}')`,
  `public.avisos_mandar('${CAT}', null, 'Hola plantel')`, `public.avisos_avisar_convocatoria('${PARTIDO}')`,
  `public.avisos_historial('${CAT}')`]
const JUGADORA_FN = ['public.portal_avisos_estado()', `public.portal_avisos_suscribir('${ep('x')}', '${P256}', '${AUTH}', 'android')`,
  `public.portal_avisos_desuscribir('${ep('x')}')`, 'public.portal_avisos_preferencias(true, true, true, true, true)']
const SERVICIO_FN = ['public.avisos_tomar_pendientes(10)', `public.avisos_destinos('${CAT}')`,
  `public.avisos_cerrar_envio('${CAT}', 0, 0, 0, '{}', '{}')`, `public.avisos_contar_sin_avisos('${CAT}')`]

test('un solo DO en migración y reversión', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
    assert.match(sinComentarios, /pg_notify\('pgrst', 'reload schema'\)/, nombre)
  }
  // Sin secretos en el SQL: la URL y el secreto salen del Vault.
  assert.doesNotMatch(cambio, /supabase\.co|https:\/\/[a-z0-9-]+\.functions/i)
})

test('avisos: migración, calendario, destinos, permisos, tick y reversión', async t => {
  const db = await crearBase()
  try {
    const antes = await foto(db)
    const res = await db.exec(cambio)
    assert.ok(res.at(-1).rows.length > 0, 'el SELECT final devuelve el resumen')
    await assert.rejects(db.exec(cambio), /ya se aplicó/)
    // La verificación interna no dejó nada.
    for (const tabla of ['avisos_pausas', 'avisos_suscripciones', 'avisos_preferencias', 'avisos_envios']) {
      assert.equal(await n(db, `select count(*) from public.${tabla}`), 0, tabla)
    }
    assert.equal(await n(db, 'select count(*) from public.cuentas_jugadoras'), 0)
    assert.equal(await n(db, 'select count(*) from public.categorias'), 3)
    assert.equal(await n(db, 'select count(*) from public.planificacion_sesiones'), 0)
    assert.equal(await n(db, `select count(*) from auth.users`), Object.keys(U).length)
    assert.equal(await n(db, `select count(*) from net.llamadas`), 0)
    const jobs = (await db.query(`select jobid::int id, jobname, schedule, command, username from cron.job order by jobid`)).rows
    const tickId = jobs[0].id
    assert.deepEqual(jobs.map(({ id, ...j }) => j), [
      { jobname: 'avisos-tick', schedule: '* * * * *', command: 'SELECT avisos_privado.tick()', username: 'postgres' },
      { jobname: 'avisos-limpieza', schedule: '17 4 * * *', username: 'postgres',
        command: `DELETE FROM cron.job_run_details WHERE jobid = ${tickId} AND coalesce(end_time, start_time) < now() - interval '7 days'` }])

    await t.test('avisos-limpieza: borra solo las corridas viejas de avisos-tick', async () => {
      await db.query(`insert into cron.job_run_details (jobid, status, start_time, end_time) values
        ($1, 'succeeded', now() - interval '8 days', now() - interval '8 days'),
        ($1, 'succeeded', now() - interval '6 days', now() - interval '6 days'),
        ($1, 'running', now() - interval '9 days', null),
        ($2, 'succeeded', now() - interval '30 days', now() - interval '30 days')`, [tickId, tickId + 100])
      await db.exec(jobs[1].command)
      assert.deepEqual((await db.query(`select jobid::int j, status from cron.job_run_details order by runid`)).rows,
        [{ j: tickId, status: 'succeeded' }, { j: tickId + 100, status: 'succeeded' }])
      await db.exec('delete from cron.job_run_details')
    })

    await t.test('config inicial: una fila por categoría con los valores por defecto', async () => {
      const filas = (await db.query(`select categoria_id, activo, dias, hora_wellness::text hw, hora_rpe::text hr from public.avisos_config order by categoria_id`)).rows
      assert.deepEqual(filas.map(f => [f.categoria_id, f.activo, f.dias, f.hw, f.hr]), [CAT, RES, SUB16].map(c => [c, true, [3, 4, 5], '07:10:00', '10:15:00']))
      // Una categoría nueva (creada por coordinación) recibe su fila.
      const nueva = (await hacer(db, 'coord', `insert into public.categorias (nombre, orden) values ('Sub 14', 9) returning id`)).rows[0].id
      assert.equal(await n(db, `select count(*) from public.avisos_config where categoria_id = $1 and activo and dias = '{3,4,5}'`, [nueva]), 1)
      await db.query('delete from public.categorias where id = $1', [nueva])
      assert.equal(await n(db, 'select count(*) from public.avisos_config'), 3)
      await assert.rejects(db.exec(`update public.avisos_config set dias = '{}' where categoria_id = '${CAT}'`), codigo('23514'))
      await assert.rejects(db.exec(`update public.avisos_config set dias = '{3,3}' where categoria_id = '${CAT}'`), codigo('23514'))
      await assert.rejects(db.exec(`update public.avisos_config set dias = '{0,3}' where categoria_id = '${CAT}'`), codigo('23514'))
      await assert.rejects(db.exec(`update public.avisos_config set dias = '{3,8}' where categoria_id = '${CAT}'`), codigo('23514'))
    })

    await t.test('estructura: RLS, red, permisos y funciones', async () => {
      for (const tabla of TABLAS) {
        const r = (await db.query(`select c.relrowsecurity rls,
            has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') anon,
            has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') aut,
            exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'sin_cuentas_jugadoras'
              and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL' and p.roles = '{authenticated}'
              and p.qual = '(NOT ( SELECT portal_privado.es_cuenta_jugadora() AS es_cuenta_jugadora))'
              and p.with_check = p.qual) red,
            (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'PERMISSIVE')::int permisivas
          from pg_class c where c.oid = $1::regclass`, [`public.${tabla}`])).rows[0]
        assert.deepEqual(r, { rls: true, anon: false, aut: false, red: true, permisivas: 0 }, tabla)
      }
      // Todas las funciones nuevas: SECURITY DEFINER, search_path vacío y nada para anon ni PUBLIC.
      const fns = (await db.query(`select p.oid::regprocedure::text f, p.prosecdef d, p.proconfig c,
          has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') aut,
          has_function_privilege('service_role', p.oid, 'EXECUTE') srv,
          exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) publico
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'avisos_privado' or (n.nspname = 'public' and (p.proname like 'avisos\\_%' or p.proname like 'portal\\_avisos\\_%'))
        order by 1`)).rows
      assert.equal(fns.length, 22, fns.map(f => f.f).join(', '))
      for (const f of fns) {
        assert.equal(f.d, true, `${f.f} SECURITY DEFINER`)
        assert.deepEqual(f.c, ['search_path=""'], `${f.f} search_path`)
        assert.equal(f.anon, false, `${f.f} anon`)
        assert.equal(f.publico, false, `${f.f} PUBLIC`)
        const nombre = f.f.replace(/\(.*/, '')
        const esServicio = /^avisos_(tomar_pendientes|destinos|cerrar_envio|contar_sin_avisos)$/.test(nombre)
        const esPrivada = f.f.startsWith('avisos_privado.')
        assert.equal(f.aut, !esServicio && !esPrivada, `${f.f} authenticated`)
        assert.equal(f.srv, esServicio, `${f.f} service_role`)
      }
      assert.equal((await db.query(`select has_schema_privilege('authenticated', 'avisos_privado', 'USAGE') a, has_schema_privilege('anon', 'avisos_privado', 'USAGE') b`)).rows[0].a, false)
      // anon sigue con sus 5 funciones públicas de siempre.
      const funcionesAnon = (await db.query(`select string_agg(p.proname, ',' order by p.proname) f from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows[0].f
      assert.equal(funcionesAnon, 'planificacion_publica_hoy,rpe_publico_guardar,wellness_publico_categoria,wellness_publico_guardar,wellness_publico_respondio')
      // La red está en todas las tablas de public con RLS.
      assert.equal(await n(db, `select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and c.relrowsecurity
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'sin_cuentas_jugadoras')`), 0)
      // Triggers.
      assert.deepEqual((await db.query(`select tgrelid::regclass::text t, tgname from pg_trigger where tgname in ('avisos_entrenamiento_publicado', 'avisos_config_por_defecto') order by 1`)).rows,
        [{ t: 'categorias', tgname: 'avisos_config_por_defecto' }, { t: 'planificacion_sesiones', tgname: 'avisos_entrenamiento_publicado' }])
    })

    await t.test('programar: calendario a hora fija', async () => {
      const J710 = `${JUE} 10:10:00+00`
      // Día de entrenamiento sin sesión: Wellness (en las 3 categorías, que tienen miércoles a viernes).
      await enPrueba(db, async () => {
        assert.equal(await programar(db, J710), 3)
        assert.deepEqual(await envios(db, CAT), [{ tipo: 'wellness', fecha: JUE, clave: `manana:${CAT}:${JUE}` }])
        // Segunda corrida: no duplica.
        assert.equal(await programar(db, J710), 0)
        assert.equal(await programar(db, `${JUE} 10:30:00+00`), 0)
        assert.equal((await envios(db, CAT)).length, 1)
      })
      // Con sesión publicada: combinado.
      await enPrueba(db, async () => {
        await sesion(db, CAT, JUE, 'entrenamiento', 'publicado')
        await programar(db, J710)
        assert.deepEqual((await envios(db, CAT)).map(e => e.tipo), ['combinado'])
      })
      // Una sesión en borrador no cuenta como publicada.
      await enPrueba(db, async () => {
        await sesion(db, CAT, JUE, 'entrenamiento', 'borrador')
        await programar(db, J710)
        assert.deepEqual((await envios(db, CAT)).map(e => e.tipo), ['wellness'])
      })
      // Descanso en borrador: nada.
      await enPrueba(db, async () => {
        await sesion(db, CAT, JUE, 'descanso', 'borrador')
        await programar(db, J710)
        assert.deepEqual(await envios(db, CAT), [])
        assert.equal((await envios(db, RES)).length, 1, 'las otras categorías siguen')
      })
      // Pausa de todas: nada en ninguna.
      await enPrueba(db, async () => {
        await pausa(db, null, '2026-11-18', '2026-11-20')
        assert.equal(await programar(db, J710), 0)
      })
      // Pausa de la categoría: nada en esa.
      await enPrueba(db, async () => {
        await pausa(db, CAT, JUE, JUE)
        assert.equal(await programar(db, J710), 2)
        assert.deepEqual(await envios(db, CAT), [])
      })
      // Pausa que ya terminó: no frena.
      await enPrueba(db, async () => {
        await pausa(db, CAT, '2026-11-01', '2026-11-18')
        await programar(db, J710)
        assert.equal((await envios(db, CAT)).length, 1)
      })
      // Martes (no es día de entrenamiento) con partido publicado: combinado.
      await enPrueba(db, async () => {
        await sesion(db, CAT, MAR, 'partido', 'publicado')
        assert.equal(await programar(db, `${MAR} 10:10:00+00`), 1)
        assert.deepEqual(await envios(db, CAT), [{ tipo: 'combinado', fecha: MAR, clave: `manana:${CAT}:${MAR}` }])
      })
      // Martes sin nada: nada.
      await enPrueba(db, async () => {
        assert.equal(await programar(db, `${MAR} 10:10:00+00`), 0)
      })
      // Fuera de la ventana de 90 minutos: 8:41 nada; 8:40 todavía sale.
      await enPrueba(db, async () => {
        assert.equal(await programar(db, `${JUE} 11:41:00+00`), 0)
        assert.equal(await programar(db, `${JUE} 10:09:59+00`), 0)
        assert.equal(await programar(db, `${JUE} 11:40:30+00`), 3)
      })
      // 10:15: RPE.
      await enPrueba(db, async () => {
        assert.equal(await programar(db, `${JUE} 13:15:00+00`), 3)
        assert.deepEqual(await envios(db, CAT), [{ tipo: 'rpe', fecha: JUE, clave: `rpe:${CAT}:${JUE}` }])
        assert.equal(await programar(db, `${JUE} 14:45:00+00`), 0)
        assert.equal(await programar(db, `${JUE} 14:46:00+00`), 0)
      })
      // Config inactiva: nada en esa categoría.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set activo = false where categoria_id = '${CAT}'`)
        assert.equal(await programar(db, J710), 2)
        assert.deepEqual(await envios(db, CAT), [])
      })
      // Días y horarios propios de la categoría.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set dias = '{2}', hora_wellness = '08:00' where categoria_id = '${CAT}'`)
        assert.equal(await programar(db, `${MAR} 10:10:00+00`), 0)
        assert.equal(await programar(db, `${MAR} 11:00:00+00`), 1)
        assert.deepEqual((await envios(db, CAT)).map(e => e.tipo), ['wellness'])
      })
    })

    await t.test('trigger: entrenamiento publicado tarde', async () => {
      const hoy = (await db.query(`select ${HOY}::text d`)).rows[0].d
      const entrenamientos = () => n(db, `select count(*) from public.avisos_envios where tipo = 'entrenamiento' and clave = $1`, [`entrenamiento:${CAT}:${hoy}`])
      const manana = tipo => db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, clave) values ($1, $2, $3, $4)`, [tipo, CAT, hoy, `manana:${CAT}:${hoy}`])
      // Hora de Wellness 00:00: cualquier hora real de hoy es posterior (como publicar a las 9:00).
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await manana('wellness')
        const id = (await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado') returning id`, [CAT, hoy])).rows[0].id
        assert.equal(await entrenamientos(), 1)
        // Se retira y se vuelve a publicar: no se duplica.
        await db.query(`update public.planificacion_sesiones set estado = 'borrador' where id = $1`, [id])
        await db.query(`update public.planificacion_sesiones set estado = 'publicado' where id = $1`, [id])
        await db.query(`update public.planificacion_sesiones set tipo = 'partido' where id = $1`, [id])
        assert.equal(await entrenamientos(), 1)
        assert.equal(await n(db, `select count(*) from public.avisos_envios where tipo = 'entrenamiento'`), 1)
      })
      // Con el combinado de la mañana: nada.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await manana('combinado')
        await sesion(db, CAT, hoy, 'entrenamiento', 'borrador')
        await db.query(`update public.planificacion_sesiones set estado = 'publicado'`)
        assert.equal(await entrenamientos(), 0)
      })
      // Antes de la hora de Wellness (como publicar a las 6:00): nada.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '23:59:59' where categoria_id = '${CAT}'`)
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [CAT, hoy])
        assert.equal(await entrenamientos(), 0)
      })
      // Otra fecha, borrador, descanso, pausa o config inactiva: nada.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00'`)
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2::date + 1, 'entrenamiento', 'publicado')`, [CAT, hoy])
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'borrador')`, [CAT, hoy])
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'descanso', 'publicado')`, [CAT, hoy])
        await pausa(db, RES, hoy, hoy)
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [RES, hoy])
        await db.exec(`update public.avisos_config set activo = false where categoria_id = '${SUB16}'`)
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [SUB16, hoy])
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [CAT, hoy])
        assert.equal(await n(db, `select count(*) from public.avisos_envios`), 0, 'descanso, pausa e inactiva frenan')
      })
      // Un error adentro del trigger nunca frena el guardado del staff.
      await enPrueba(db, async () => {
        await db.exec(`alter table public.avisos_config rename to avisos_config_x`)
        await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, tipo, estado) values ($1, $2, 'entrenamiento', 'publicado')`, [CAT, hoy])
        assert.equal(await n(db, `select count(*) from public.planificacion_sesiones`), 1)
      })
      // Por la función del staff (técnico de la categoría) también anda.
      await enPrueba(db, async () => {
        await db.exec(`update public.avisos_config set hora_wellness = '00:00' where categoria_id = '${CAT}'`)
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.tec, email: MAIL.tec, role: 'authenticated' })])
        await db.exec('SET LOCAL ROLE authenticated')
        await db.query(`select public.guardar_planificacion_sesion($1::jsonb)`, [JSON.stringify({ categoria_id: CAT, fecha: hoy, tipo: 'entrenamiento', estado: 'publicado', bloques: [] })])
        await db.exec('RESET ROLE')
        assert.equal(await entrenamientos(), 1)
      })
    })

    // Cuentas: ana, bea y dora en Primera, rita en Sub 16; cami sin cuenta. Dora queda desactivada.
    for (const k of ['ana', 'bea', 'rita', 'dora']) {
      await servicio(db, 'select public.cuentas_jugadoras_registrar($1, $2, $3, $4)', [J[k], U[k], MAIL[k], U.coord])
    }
    for (const k of ['ana', 'bea', 'rita', 'dora']) await suscribir(db, k, ep(k + '1'), k === 'bea' ? 'iphone' : 'android')
    await servicio(db, `select public.cuentas_jugadoras_estado($1, false)`, [J.dora])

    await t.test('jugadora: estado, suscripción y preferencias', async () => {
      assert.deepEqual(await valor(db, 'ana', 'public.portal_avisos_estado()'),
        { preferencias: { wellness: true, rpe: true, entrenamiento: true, convocatoria: true, mensajes: true }, dispositivos: 1 })
      // Datos inválidos: 22023 suscripcion_invalida.
      const malos = [
        ['https://evil.example.com/push/1', P256, AUTH, 'android'],
        ['http://fcm.googleapis.com/fcm/send/1', P256, AUTH, 'android'],
        ['https://fcm.googleapis.com.evil.com/x', P256, AUTH, 'android'],
        ['https://fcm.googleapis.com@evil.com/x', P256, AUTH, 'android'],
        ['https://fcm.googleapis.com:8443/x', P256, AUTH, 'android'],
        [ep('x'.repeat(1000)), P256, AUTH, 'android'],
        [ep('ok'), 'corto', AUTH, 'android'],
        [ep('ok'), P256.slice(0, 80) + '+'.repeat(10), AUTH, 'android'],
        [ep('ok'), P256, 'x'.repeat(15), 'android'],
        [ep('ok'), P256, AUTH, 'tablet'],
        [null, P256, AUTH, 'android']]
      for (const m of malos) {
        await assert.rejects(como(db, 'ana', 'select public.portal_avisos_suscribir($1, $2, $3, $4)', m), codigo('22023', /suscripcion_invalida/), String(m[0]).slice(0, 60))
      }
      // Hosts permitidos.
      for (const e of ['https://web.push.apple.com/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://wns2-by3p.notify.windows.com/w/?token=abc']) {
        await como(db, 'ana', 'select public.portal_avisos_suscribir($1, $2, $3, $4)', [e, P256, AUTH, 'compu'])
      }
      // El cuarto celular reemplaza al más viejo.
      for (const k of ['ana2', 'ana3', 'ana4']) await suscribir(db, 'ana', ep(k))
      assert.deepEqual((await db.query(`select endpoint from public.avisos_suscripciones where jugador_id = $1 order by creada_at`, [J.ana])).rows.map(r => r.endpoint),
        [ep('ana2'), ep('ana3'), ep('ana4')])
      // Volver a suscribir el mismo endpoint no lo duplica.
      await suscribir(db, 'ana', ep('ana2'))
      assert.equal(await n(db, `select count(*) from public.avisos_suscripciones where jugador_id = $1`, [J.ana]), 3)
      // Un endpoint de otra jugadora pasa a la nueva (celular compartido).
      await suscribir(db, 'bea', ep('ana4'))
      assert.deepEqual((await db.query(`select jugador_id, usuario_id from public.avisos_suscripciones where endpoint = $1`, [ep('ana4')])).rows, [{ jugador_id: J.bea, usuario_id: U.bea }])
      assert.equal(await n(db, `select count(*) from public.avisos_suscripciones where jugador_id = $1`, [J.ana]), 2)
      // Desuscribir un endpoint ajeno no hace nada; el propio, sí.
      await hacer(db, 'ana', 'select public.portal_avisos_desuscribir($1)', [ep('ana4')])
      assert.equal(await n(db, `select count(*) from public.avisos_suscripciones where endpoint = $1`, [ep('ana4')]), 1)
      await hacer(db, 'bea', 'select public.portal_avisos_desuscribir($1)', [ep('ana4')])
      await hacer(db, 'ana', 'select public.portal_avisos_desuscribir($1)', [ep('ana2')])
      await hacer(db, 'ana', 'select public.portal_avisos_desuscribir($1)', [ep('ana3')])
      assert.equal(await n(db, `select count(*) from public.avisos_suscripciones where jugador_id = $1`, [J.ana]), 0)
      assert.equal((await valor(db, 'ana', 'public.portal_avisos_estado()')).dispositivos, 0)
      await suscribir(db, 'ana', ep('ana1'))
      assert.deepEqual((await db.query(`select endpoint from public.avisos_suscripciones where jugador_id = $1`, [J.ana])).rows.map(r => r.endpoint), [ep('ana1')])
      assert.deepEqual((await db.query(`select endpoint from public.avisos_suscripciones where jugador_id = $1`, [J.bea])).rows.map(r => r.endpoint), [ep('bea1')])
      // Preferencias.
      await hacer(db, 'ana', 'select public.portal_avisos_preferencias(false, true, true, false, true)')
      assert.deepEqual((await valor(db, 'ana', 'public.portal_avisos_estado()')).preferencias,
        { wellness: false, rpe: true, entrenamiento: true, convocatoria: false, mensajes: true })
      await hacer(db, 'ana', 'select public.portal_avisos_preferencias(true, true, true, true, true)')
      await assert.rejects(como(db, 'ana', 'select public.portal_avisos_preferencias(null, true, true, true, true)'), codigo('22023'))
      // No puede leer ni escribir ninguna tabla nueva.
      for (const tabla of TABLAS) {
        let visto
        try { visto = (await como(db, 'ana', `select count(*)::int n from public.${tabla}`)).rows[0].n } catch (e) { visto = e.code }
        assert.ok(visto === 0 || visto === '42501', `${tabla}: ${visto}`)
      }
      await assert.rejects(como(db, 'ana', `insert into public.avisos_suscripciones (jugador_id, usuario_id, endpoint, p256dh, auth, dispositivo)
        values ('${J.ana}', '${U.ana}', '${ep('z')}', '${P256}', '${AUTH}', 'otro')`), codigo('42501'))
      // Cuenta desactivada, staff y anon: no usan las funciones de la jugadora.
      for (const sql of JUGADORA_FN) {
        await assert.rejects(como(db, 'dora', `select ${sql}`), codigo('42501', /Esta cuenta no está activa\./), `dora ${sql}`)
        await assert.rejects(como(db, 'coord', `select ${sql}`), codigo('42501'), `coord ${sql}`)
        await assert.rejects(como(db, null, `select ${sql}`, [], { rol: 'anon' }), codigo('42501'), `anon ${sql}`)
      }
      // Ni las del staff ni las de service_role.
      for (const sql of [...STAFF_FN, ...SERVICIO_FN]) {
        await assert.rejects(como(db, 'ana', `select ${sql}`), codigo('42501'), `ana ${sql}`)
      }
    })

    await t.test('avisos_destinos: destinatarias y textos', async () => {
      // Wellness: excluye a quien completó (cinco campos) y a las cuentas desactivadas; incluye a quien completó a medias.
      await enPrueba(db, async () => {
        await completar(db, J.ana, JUE)
        await db.query(`insert into public.bienestar (jugador_id, fecha, sueno) values ($1, $2, 3)`, [J.bea, JUE])
        await completar(db, J.bea, '2026-11-18')
        const id = await envio(db, { tipo: 'wellness' })
        const d = await destinos(db, id)
        assert.deepEqual(d.map(f => [f.nombre, f.endpoint, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]),
          [['Bea', ep('bea1'), 'Wellness', 'Completá tu Wellness de hoy.', '/jugadora/?seccion=wellness', `wellness-${JUE}`, 10800]])
        assert.equal(d[0].p256dh, P256)
        assert.equal(d[0].auth, AUTH)
        // Sin avisos: Cami (sin cuenta) y Dora (desactivada).
        assert.equal((await db.query(`select public.avisos_contar_sin_avisos($1) n`, [id])).rows[0].n, 2)
      })
      // Combinado: quien completó recibe solo el de entrenamiento.
      await enPrueba(db, async () => {
        await completar(db, J.ana, JUE)
        const id = await envio(db, { tipo: 'combinado' })
        assert.deepEqual((await destinos(db, id)).map(f => [f.nombre, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]), [
          ['Ana', 'Entrenamiento', 'Ya está tu entrenamiento de hoy.', '/jugadora/?seccion=inicio', `combinado-${JUE}`, 10800],
          ['Bea', 'Hoy entrenás', 'Ya está tu entrenamiento de hoy · Completá tu Wellness.', '/jugadora/?seccion=wellness', `combinado-${JUE}`, 10800]])
        // Día de partido.
        await sesion(db, CAT, JUE, 'partido', 'publicado')
        assert.deepEqual((await destinos(db, id)).filter(f => f.nombre === 'Bea').map(f => [f.titulo, f.cuerpo]),
          [['Hoy hay partido', 'Hoy hay partido · Completá tu Wellness.']])
      })
      // RPE: excluye a quien tiene cualquier RPE de hoy.
      await enPrueba(db, async () => {
        await db.query(`insert into public.sesiones_fisicas (jugador_id, fecha, tipo, rpe) values ($1, $2, 'partido', 7)`, [J.ana, JUE])
        await db.query(`insert into public.sesiones_fisicas (jugador_id, fecha, tipo, rpe) values ($1, $2, 'entrenamiento', null)`, [J.bea, JUE])
        const id = await envio(db, { tipo: 'rpe' })
        assert.deepEqual((await destinos(db, id)).map(f => [f.nombre, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]),
          [['Bea', 'RPE', 'Cargá tu RPE de hoy.', '/jugadora/?seccion=rpe', `rpe-${JUE}`, 10800]])
      })
      // Entrenamiento.
      await enPrueba(db, async () => {
        const id = await envio(db, { tipo: 'entrenamiento' })
        assert.deepEqual((await destinos(db, id)).map(f => [f.nombre, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]), [
          ['Ana', 'Entrenamiento', 'Ya está tu entrenamiento de hoy.', '/jugadora/?seccion=inicio', `entrenamiento-${JUE}`, 21600],
          ['Bea', 'Entrenamiento', 'Ya está tu entrenamiento de hoy.', '/jugadora/?seccion=inicio', `entrenamiento-${JUE}`, 21600]])
      })
      // Cada preferencia se respeta.
      await enPrueba(db, async () => {
        await db.query(`insert into public.avisos_preferencias (jugador_id, wellness, rpe, entrenamiento, convocatoria, mensajes) values ($1, false, false, false, false, false)`, [J.bea])
        for (const tipo of ['wellness', 'rpe', 'entrenamiento', 'combinado']) {
          assert.deepEqual(nombres(await destinos(db, await envio(db, { tipo }))), ['Ana'], tipo)
        }
        assert.deepEqual(nombres(await destinos(db, await envio(db, { tipo: 'manual', texto: 'Hola', rol_remitente: 'tecnico' }))), ['Ana'])
        await db.query(`insert into public.citaciones (partido_id, jugador_id) values ($1, $2), ($1, $3)`, [PARTIDO, J.ana, J.bea])
        assert.deepEqual(nombres(await destinos(db, await envio(db, { tipo: 'convocatoria', partido_id: PARTIDO, jugadoras: [J.ana, J.bea] }))), ['Ana'])
        // Las desactivadas cuentan como «sin avisos».
        assert.equal((await db.query(`select public.avisos_contar_sin_avisos($1) n`, [await envio(db, { tipo: 'manual', texto: 'Hola', rol_remitente: 'tecnico' })])).rows[0].n, 3)
        // Combinado: Wellness sí y Entrenamiento no → solo el de Wellness; al revés → solo el de entrenamiento.
        await db.query(`update public.avisos_preferencias set wellness = true where jugador_id = $1`, [J.bea])
        assert.deepEqual((await destinos(db, await envio(db, { tipo: 'combinado' }))).filter(f => f.nombre === 'Bea').map(f => [f.titulo, f.url]), [['Wellness', '/jugadora/?seccion=wellness']])
        await db.query(`update public.avisos_preferencias set wellness = false, entrenamiento = true where jugador_id = $1`, [J.bea])
        assert.deepEqual((await destinos(db, await envio(db, { tipo: 'combinado' }))).filter(f => f.nombre === 'Bea').map(f => f.titulo), ['Entrenamiento'])
      })
      // Categoría actual: si Ana pasa a Sub 16, recibe los de Sub 16 y no los de Primera.
      await enPrueba(db, async () => {
        await db.query(`update public.jugadores set categoria_id = $1 where id = $2`, [SUB16, J.ana])
        assert.deepEqual(nombres(await destinos(db, await envio(db, { tipo: 'wellness' }))), ['Bea'])
        assert.deepEqual(nombres(await destinos(db, await envio(db, { tipo: 'wellness', categoria_id: SUB16 }))), ['Ana', 'Rita'])
      })
      // Convocatoria: solo las citadas (también de otra categoría), con el texto del partido.
      await enPrueba(db, async () => {
        await db.query(`insert into public.citaciones (partido_id, jugador_id) values ($1, $2), ($1, $3)`, [PARTIDO, J.ana, J.rita])
        const id = await envio(db, { tipo: 'convocatoria', partido_id: PARTIDO, jugadoras: [J.ana, J.rita], rol_remitente: 'tecnico' })
        assert.deepEqual((await destinos(db, id)).map(f => [f.nombre, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]), [
          ['Ana', 'Convocatoria', 'Estás convocada: vs Rival · 22/11 10:00.', '/jugadora/?seccion=inicio', `convocatoria-${id}`, 86400],
          ['Rita', 'Convocatoria', 'Estás convocada: vs Rival · 22/11 10:00.', '/jugadora/?seccion=inicio', `convocatoria-${id}`, 86400]])
        await db.query(`update public.partidos set hora = null where id = $1`, [PARTIDO])
        assert.deepEqual([...new Set((await destinos(db, id)).map(f => f.cuerpo))], ['Estás convocada: vs Rival · 22/11.'])
      })
      // Manual: título según quién lo manda; jugadoras elegidas.
      await enPrueba(db, async () => {
        const coord = await envio(db, { tipo: 'manual', texto: 'Traer la ropa de entrenamiento.', rol_remitente: 'coordinacion' })
        assert.deepEqual((await destinos(db, coord)).map(f => [f.nombre, f.titulo, f.cuerpo, f.url, f.tag, f.ttl]), [
          ['Ana', 'Mensaje de coordinación', 'Traer la ropa de entrenamiento.', '/jugadora/?seccion=inicio', `manual-${coord}`, 86400],
          ['Bea', 'Mensaje de coordinación', 'Traer la ropa de entrenamiento.', '/jugadora/?seccion=inicio', `manual-${coord}`, 86400]])
        const tec = await envio(db, { tipo: 'manual', texto: 'Hola', rol_remitente: 'preparador_fisico', jugadoras: [J.bea] })
        assert.deepEqual((await destinos(db, tec)).map(f => [f.nombre, f.titulo]), [['Bea', 'Mensaje del cuerpo técnico']])
      })
    })

    await t.test('staff: mandar, límites y permisos', async () => {
      await db.exec('delete from public.avisos_envios')
      // Técnico: no puede mandar a otra categoría; un PF sin categoría, a ninguna.
      await assert.rejects(mandar(db, 'tec', RES), codigo('42501', /sin_permiso/))
      await assert.rejects(mandar(db, 'tecres', CAT), codigo('42501', /sin_permiso/))
      await assert.rejects(mandar(db, 'pfsin', CAT), codigo('42501', /sin_permiso/))
      await assert.rejects(mandar(db, 'pfsin', null), codigo('42501', /sin_permiso/))
      // Texto de 3 a 140 caracteres sin contar espacios.
      await assert.rejects(mandar(db, 'tec', CAT, 'ab'), codigo('22023', /texto_invalido/))
      await assert.rejects(mandar(db, 'tec', CAT, '   ab   '), codigo('22023', /texto_invalido/))
      await assert.rejects(mandar(db, 'tec', CAT, 'x'.repeat(141)), codigo('22023', /texto_invalido/))
      await assert.rejects(mandar(db, 'tec', CAT, null), codigo('22023', /texto_invalido/))
      // Jugadoras elegidas: tienen que ser de la categoría.
      await assert.rejects(mandar(db, 'tec', CAT, 'Hola chicas', [J.ana, J.rita]), codigo('22023', /jugadoras_invalidas/))
      await assert.rejects(mandar(db, 'tec', CAT, 'Hola chicas', []), codigo('22023', /jugadoras_invalidas/))
      const id = (await mandar(db, 'tec', CAT, '  Mañana a las 9.  ', [J.ana, J.ana])).rows[0].id
      assert.deepEqual((await db.query(`select tipo, categoria_id, fecha = ${HOY} hoy, clave, jugadoras, texto, enviado_por, rol_remitente, estado
        from public.avisos_envios where id = $1`, [id])).rows,
        [{ tipo: 'manual', categoria_id: CAT, hoy: true, clave: null, jugadoras: [J.ana], texto: 'Mañana a las 9.', enviado_por: U.tec, rol_remitente: 'tecnico', estado: 'pendiente' }])
      // Doble clic: el mismo texto (sin contar espacios) del mismo remitente, a la misma categoría y jugadoras, en menos
      // de 60 segundos da duplicado.
      await assert.rejects(mandar(db, 'tec', CAT, 'Mañana a las 9.', [J.ana]), codigo('P0001', /duplicado/))
      await assert.rejects(mandar(db, 'tec', CAT, ' Mañana a las 9. ', [J.ana, J.ana]), codigo('P0001', /duplicado/))
      // 5 por remitente por día: el sexto da limite_remitente.
      for (let i = 2; i <= 5; i++) await mandar(db, 'tec', CAT, `Aviso ${i}`)
      await assert.rejects(mandar(db, 'tec', CAT), codigo('P0001', /limite_remitente/))
      // 10 por categoría por día: coordinación manda 5 y el undécimo (del PF) da limite_categoria.
      for (let i = 1; i <= 5; i++) await mandar(db, 'coord', CAT, `Coordinación ${i}`)
      await assert.rejects(mandar(db, 'pf', CAT), codigo('P0001', /limite_categoria/))
      await assert.rejects(mandar(db, 'coord', SUB16), codigo('P0001', /limite_remitente/))
      assert.equal(await n(db, `select count(*) from public.avisos_envios where tipo = 'manual'`), 10)
      // Los de otro día no cuentan.
      await db.exec(`update public.avisos_envios set fecha = fecha - 1`)
      await mandar(db, 'pf', CAT)
      // Coordinación manda a cualquier categoría; a una que no existe, no.
      await mandar(db, 'coord', SUB16)
      // Duplicado: el mismo mensaje enseguida, no; a otras jugadoras o pasado el minuto, sí.
      await assert.rejects(mandar(db, 'coord', SUB16), codigo('P0001', /duplicado/))
      await mandar(db, 'coord', SUB16, undefined, [J.rita])
      await assert.rejects(mandar(db, 'coord', SUB16, undefined, [J.rita]), codigo('P0001', /duplicado/))
      await db.exec(`update public.avisos_envios set creado_at = creado_at - interval '61 seconds'`)
      await mandar(db, 'coord', SUB16)
      await assert.rejects(mandar(db, 'coord', 'ffffffff-0000-4000-8000-000000000000'), codigo('22023'))
      assert.equal((await db.query(`select rol_remitente from public.avisos_envios where categoria_id = $1`, [SUB16])).rows[0].rol_remitente, 'coordinacion')

      // Convocatoria: coordinación o el técnico de la categoría del partido.
      await assert.rejects(hacer(db, 'tec', 'select public.avisos_avisar_convocatoria($1)', [PARTIDO]), codigo('22023', /sin_convocadas/))
      await db.query(`insert into public.citaciones (partido_id, jugador_id) values ($1, $2), ($1, $3)`, [PARTIDO, J.ana, J.rita])
      for (const quien of ['tecres', 'pf', 'med', 'pfsin', 'nadie']) {
        await assert.rejects(hacer(db, quien, 'select public.avisos_avisar_convocatoria($1)', [PARTIDO]), codigo('42501'), quien)
      }
      const conv = (await hacer(db, 'tec', 'select public.avisos_avisar_convocatoria($1) id', [PARTIDO])).rows[0].id
      assert.deepEqual((await db.query(`select tipo, categoria_id, partido_id, clave, rol_remitente, jugadoras from public.avisos_envios where id = $1`, [conv])).rows[0],
        { tipo: 'convocatoria', categoria_id: CAT, partido_id: PARTIDO, clave: null, rol_remitente: 'tecnico', jugadoras: [J.ana, J.rita].sort() })
      // Doble clic: un segundo aviso del mismo partido en menos de 60 segundos da duplicado (aunque sea de otra persona).
      await assert.rejects(hacer(db, 'coord', 'select public.avisos_avisar_convocatoria($1)', [PARTIDO]), codigo('P0001', /duplicado/))
      const pasarMinuto = () => db.exec(`update public.avisos_envios set creado_at = creado_at - interval '61 seconds' where tipo = 'convocatoria'`)
      await pasarMinuto()
      await hacer(db, 'coord', 'select public.avisos_avisar_convocatoria($1)', [PARTIDO])
      await pasarMinuto()
      await hacer(db, 'tec', 'select public.avisos_avisar_convocatoria($1)', [PARTIDO])
      await pasarMinuto()
      await assert.rejects(hacer(db, 'coord', 'select public.avisos_avisar_convocatoria($1)', [PARTIDO]), codigo('P0001', /limite_partido/))
      assert.equal(await n(db, `select count(*) from public.avisos_envios where tipo = 'convocatoria'`), 3)

      // Un médico, alguien sin rol y anon no pueden nada.
      for (const sql of STAFF_FN) {
        await assert.rejects(como(db, 'med', `select ${sql}`), codigo('42501'), `médico ${sql}`)
        await assert.rejects(como(db, 'nadie', `select ${sql}`), codigo('42501'), `sin rol ${sql}`)
        await assert.rejects(como(db, null, `select ${sql}`, [], { rol: 'anon' }), codigo('42501'), `anon ${sql}`)
      }
      for (const sql of SERVICIO_FN) {
        await assert.rejects(como(db, 'coord', `select ${sql}`), codigo('42501'), `coord ${sql}`)
        await assert.rejects(como(db, null, `select ${sql}`, [], { rol: 'anon' }), codigo('42501'), `anon ${sql}`)
      }
      await assert.rejects(como(db, 'coord', 'select avisos_privado.programar()'), codigo('42501'))
      await assert.rejects(como(db, 'coord', 'select avisos_privado.tick()'), codigo('42501'))
      // Técnico y PF: solo lo de coordinación les está vedado.
      for (const quien of ['tec', 'pf']) {
        for (const sql of STAFF_FN.slice(0, 5)) await assert.rejects(como(db, quien, `select ${sql}`), codigo('42501', /sin_permiso/), `${quien} ${sql}`)
      }
      // El staff no lee las tablas nuevas directamente.
      for (const tabla of TABLAS) await assert.rejects(como(db, 'coord', `select count(*) from public.${tabla}`), codigo('42501'), tabla)
    })

    await t.test('staff: historial, panel, jugadoras, horarios y pausas', async () => {
      await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, clave) values ('wellness', $1, ${HOY}, 'manana:x'), ('rpe', $2, ${HOY}, 'rpe:x')`, [CAT, RES])
      // Técnico: solo su categoría.
      const tec = await valor(db, 'tec', 'public.avisos_historial(null)')
      assert.ok(tec.length > 0)
      assert.deepEqual([...new Set(tec.map(h => h.categoria))], ['Primera División'])
      assert.deepEqual(await valor(db, 'tec', `public.avisos_historial('${CAT}')`), tec)
      await assert.rejects(como(db, 'tec', `select public.avisos_historial('${RES}')`), codigo('42501'))
      await assert.rejects(como(db, 'pfsin', `select public.avisos_historial(null)`), codigo('42501'))
      assert.deepEqual([...new Set((await valor(db, 'pf', 'public.avisos_historial(null)')).map(h => h.categoria))], ['Primera División'])
      // Coordinación: todas, o una.
      const todo = await valor(db, 'coord', 'public.avisos_historial(null, 500)')
      assert.deepEqual([...new Set(todo.map(h => h.categoria))].sort(), ['Primera División', 'Reserva', 'Sub 16'])
      assert.deepEqual([...new Set((await valor(db, 'coord', `public.avisos_historial('${RES}')`)).map(h => h.categoria))], ['Reserva'])
      assert.equal((await valor(db, 'coord', 'public.avisos_historial(null, 2)')).length, 2)
      const auto = todo.find(h => h.tipo === 'wellness')
      assert.equal(auto.remitente, 'Automático')
      assert.deepEqual(Object.keys(auto).sort(), ['categoria', 'creado_at', 'destinatarias', 'entregados', 'estado', 'fallidos', 'fecha', 'id', 'remitente', 'sin_avisos', 'texto', 'tipo'])
      assert.equal(todo.find(h => h.tipo === 'manual' && h.texto === 'Mañana a las 9.').remitente, 'Técnica')

      // Panel.
      const panel = await valor(db, 'coord', 'public.avisos_panel()')
      assert.deepEqual(panel.categorias.map(c => c.nombre), ['Primera División', 'Reserva', 'Sub 16'])
      const prim = panel.categorias[0]
      assert.deepEqual({ ...prim, hoy: undefined }, { categoria_id: CAT, nombre: 'Primera División', activo: true, dias: [3, 4, 5],
        hora_wellness: '07:10', hora_rpe: '10:15', jugadoras: 4, con_avisos: 2, hoy: undefined })
      assert.equal(typeof prim.hoy.aplica, 'boolean')
      assert.ok(['dia_de_entrenamiento', 'sin_entrenamiento'].includes(prim.hoy.motivo), prim.hoy.motivo)
      assert.deepEqual(panel.pausas, [])

      // Motivos de hoy.
      // Dentro de enPrueba no se puede usar como() (abriría otra transacción): se cambia de rol a mano.
      const motivo = async () => {
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.coord, email: MAIL.coord, role: 'authenticated' })])
        await db.exec('SET LOCAL ROLE authenticated')
        const r = (await db.query('select public.avisos_panel() v')).rows[0].v.categorias[0].hoy
        await db.exec('RESET ROLE')
        return r
      }
      const hoy = (await db.query(`select ${HOY}::text d, extract(isodow from ${HOY})::int dow`)).rows[0]
      await enPrueba(db, async () => {
        await db.query(`update public.avisos_config set dias = $1 where categoria_id = $2`, [[hoy.dow], CAT])
        assert.deepEqual(await motivo(), { aplica: true, motivo: 'dia_de_entrenamiento' })
        await db.query(`update public.avisos_config set dias = $1 where categoria_id = $2`, [[(hoy.dow % 7) + 1], CAT])
        assert.deepEqual(await motivo(), { aplica: false, motivo: 'sin_entrenamiento' })
        await sesion(db, CAT, hoy.d, 'partido', 'publicado')
        assert.deepEqual(await motivo(), { aplica: true, motivo: 'sesion_publicada' })
        await sesion(db, CAT, hoy.d, 'descanso', 'borrador')
        assert.deepEqual(await motivo(), { aplica: false, motivo: 'descanso' })
        await pausa(db, null, hoy.d, hoy.d)
        assert.deepEqual(await motivo(), { aplica: false, motivo: 'pausa' })
        await db.query(`update public.avisos_config set activo = false where categoria_id = $1`, [CAT])
        assert.deepEqual(await motivo(), { aplica: false, motivo: 'inactivo' })
      })
      // Todo se deshizo.
      assert.equal(await n(db, `select count(*) from public.avisos_config where categoria_id = $1 and activo and dias = '{3,4,5}'`, [CAT]), 1)
      assert.equal(await n(db, 'select count(*) from public.avisos_pausas'), 0)
      assert.equal(await n(db, 'select count(*) from public.planificacion_sesiones'), 0)

      // Jugadoras de una categoría con su cuenta, celulares y preferencias.
      await hacer(db, 'bea', 'select public.portal_avisos_preferencias(true, false, true, true, false)')
      const lista = await valor(db, 'coord', `public.avisos_jugadoras('${CAT}')`)
      assert.deepEqual(lista.map(j => [j.nombre, j.cuenta, j.dispositivos, j.tipos]),
        [['Ana', 'activa', 1, ['android']], ['Bea', 'activa', 1, ['iphone']], ['Cami', null, 0, []], ['Dora', 'desactivada', 1, ['android']]])
      assert.deepEqual(lista[1].preferencias, { wellness: true, rpe: false, entrenamiento: true, convocatoria: true, mensajes: false })
      assert.deepEqual(lista[0].preferencias, { wellness: true, rpe: true, entrenamiento: true, convocatoria: true, mensajes: true })
      assert.deepEqual(Object.keys(lista[0]).sort(), ['apellido', 'cuenta', 'dispositivos', 'jugador_id', 'nombre', 'preferencias', 'tipos'])
      await hacer(db, 'bea', 'select public.portal_avisos_preferencias(true, true, true, true, true)')

      // Horarios.
      await hacer(db, 'coord', `select public.avisos_guardar_config($1, false, '{5,1,3}'::smallint[], '06:45', '11:30')`, [RES])
      assert.deepEqual((await db.query(`select activo, dias, hora_wellness::text hw, hora_rpe::text hr, actualizado_por, actualizado_at is not null a
        from public.avisos_config where categoria_id = $1`, [RES])).rows[0], { activo: false, dias: [1, 3, 5], hw: '06:45:00', hr: '11:30:00', actualizado_por: U.coord, a: true })
      for (const malo of [`'{}'::smallint[]`, `'{3,3}'::smallint[]`, `'{0}'::smallint[]`, `'{8}'::smallint[]`, `'{1,null}'::smallint[]`, 'null']) {
        await assert.rejects(como(db, 'coord', `select public.avisos_guardar_config('${RES}', true, ${malo}, '07:10', '10:15')`), codigo('22023', /config_invalida/), malo)
      }
      await assert.rejects(como(db, 'coord', `select public.avisos_guardar_config('${RES}', null, '{3}', '07:10', '10:15')`), codigo('22023', /config_invalida/))
      await assert.rejects(como(db, 'coord', `select public.avisos_guardar_config('${RES}', true, '{3}', null, '10:15')`), codigo('22023', /config_invalida/))
      await assert.rejects(como(db, 'coord', `select public.avisos_guardar_config('ffffffff-0000-4000-8000-000000000000', true, '{3}', '07:10', '10:15')`), codigo('22023', /config_invalida/))
      await hacer(db, 'coord', `select public.avisos_guardar_config($1, true, '{3,4,5}'::smallint[], '07:10', '10:15')`, [RES])

      // Pausas.
      const p1 = (await hacer(db, 'coord', `select public.avisos_crear_pausa(null, '2099-12-24', '2099-12-26', '  Fiestas  ') id`)).rows[0].id
      const p2 = (await hacer(db, 'coord', `select public.avisos_crear_pausa($1, '2099-12-20', '2099-12-20', null) id`, [CAT])).rows[0].id
      await hacer(db, 'coord', `select public.avisos_crear_pausa(null, '2020-01-01', '2020-01-02', 'Vieja')`)
      assert.deepEqual((await valor(db, 'coord', 'public.avisos_panel()')).pausas, [
        { id: p2, categoria_id: CAT, categoria: 'Primera División', desde: '2099-12-20', hasta: '2099-12-20', motivo: null },
        { id: p1, categoria_id: null, categoria: null, desde: '2099-12-24', hasta: '2099-12-26', motivo: 'Fiestas' }])
      for (const [cat, desde, hasta, motivo] of [[null, '2099-12-26', '2099-12-24', 'x'], [null, null, '2099-12-24', 'x'], [null, '2099-12-24', '2099-12-24', 'x'.repeat(81)],
        ['ffffffff-0000-4000-8000-000000000000', '2099-12-24', '2099-12-24', 'x']]) {
        await assert.rejects(como(db, 'coord', 'select public.avisos_crear_pausa($1, $2, $3, $4)', [cat, desde, hasta, motivo]), codigo('22023', /pausa_invalida/))
      }
      await hacer(db, 'coord', 'select public.avisos_borrar_pausa($1)', [p1])
      await assert.rejects(como(db, 'coord', 'select public.avisos_borrar_pausa($1)', [p1]), codigo('22023', /pausa_invalida/))
      assert.equal(await n(db, 'select count(*) from public.avisos_pausas'), 2)
      await db.exec('delete from public.avisos_pausas')
    })

    await t.test('service_role: lo vencido no se toma y queda en error', async () => {
      await db.exec('delete from public.avisos_envios')
      const crear = async (tipo, minutos) => (await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, texto, rol_remitente, creado_at)
        values ($1, $2, ${HOY}, $3, $4, now() - make_interval(mins => $5)) returning id`,
        [tipo, CAT, tipo === 'manual' ? 'Hola' : null, tipo === 'manual' ? 'coordinacion' : null, minutos])).rows[0].id
      const casos = [['wellness', 91, 'error'], ['wellness', 89, 'enviando'], ['combinado', 91, 'error'], ['combinado', 89, 'enviando'],
        ['rpe', 91, 'error'], ['rpe', 89, 'enviando'], ['entrenamiento', 181, 'error'], ['entrenamiento', 179, 'enviando'],
        ['manual', 24 * 60 + 1, 'error'], ['manual', 24 * 60 - 1, 'enviando'], ['convocatoria', 24 * 60 + 1, 'error'], ['convocatoria', 24 * 60 - 1, 'enviando']]
      const ids = []
      for (const [tipo, minutos] of casos) ids.push(await crear(tipo, minutos))
      const tomados = (await servicio(db, 'select public.avisos_tomar_pendientes(50) t')).rows[0].t.map(x => x.id)
      for (const [i, [tipo, minutos, estado]] of casos.entries()) {
        assert.equal(tomados.includes(ids[i]), estado === 'enviando', `${tipo} de hace ${minutos} min tomado`)
        assert.equal((await db.query('select estado from public.avisos_envios where id = $1', [ids[i]])).rows[0].estado, estado, `${tipo} de hace ${minutos} min`)
      }
      // Uno «enviando» trabado que ya venció tampoco se vuelve a tomar.
      await db.query(`update public.avisos_envios set tomado_at = now() - interval '11 minutes', creado_at = now() - interval '91 minutes' where id = $1`, [ids[1]])
      assert.deepEqual((await servicio(db, 'select public.avisos_tomar_pendientes(50) t')).rows[0].t, [])
      assert.equal((await db.query('select estado from public.avisos_envios where id = $1', [ids[1]])).rows[0].estado, 'error')
      await db.exec('delete from public.avisos_envios')
    })

    await t.test('service_role: tomar, destinos y cerrar', async () => {
      await db.exec('delete from public.avisos_envios')
      const a = (await mandar(db, 'coord', CAT, 'Primero')).rows[0].id
      const b = (await mandar(db, 'coord', CAT, 'Segundo')).rows[0].id
      // Un recordatorio automático de otro día no se manda tarde: queda en error.
      const viejo = (await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, clave) values ('wellness', $1, ${HOY} - 1, 'manana:viejo') returning id`, [CAT])).rows[0].id
      const tomados = (await servicio(db, 'select public.avisos_tomar_pendientes(1) t')).rows[0].t
      assert.deepEqual(tomados.map(x => x.id), [a])
      assert.equal(tomados[0].tipo, 'manual')
      assert.equal((await db.query(`select estado from public.avisos_envios where id = $1`, [viejo])).rows[0].estado, 'error')
      assert.deepEqual((await servicio(db, 'select public.avisos_tomar_pendientes() t')).rows[0].t.map(x => x.id), [b])
      assert.deepEqual((await servicio(db, 'select public.avisos_tomar_pendientes() t')).rows[0].t, [])
      // Uno que quedó «enviando» hace más de 10 minutos se vuelve a tomar.
      await db.query(`update public.avisos_envios set tomado_at = now() - interval '11 minutes' where id = $1`, [b])
      assert.deepEqual((await servicio(db, 'select public.avisos_tomar_pendientes() t')).rows[0].t.map(x => x.id), [b])

      const d = (await servicio(db, 'select * from public.avisos_destinos($1)', [a])).rows
      assert.deepEqual(d.map(x => x.endpoint).sort(), [ep('ana1'), ep('bea1')])
      assert.equal((await servicio(db, 'select public.avisos_contar_sin_avisos($1) n', [a])).rows[0].n, 2)
      const okId = d.find(x => x.endpoint === ep('ana1')).suscripcion_id, vencida = d.find(x => x.endpoint === ep('bea1')).suscripcion_id
      await servicio(db, 'select public.avisos_cerrar_envio($1, 1, 1, 2, $2, $3)', [a, [okId], [vencida]])
      assert.deepEqual((await db.query(`select estado, destinatarias, entregados, fallidos, sin_avisos, enviado_at is not null e from public.avisos_envios where id = $1`, [a])).rows[0],
        { estado: 'enviado', destinatarias: 4, entregados: 1, fallidos: 1, sin_avisos: 2, e: true })
      assert.equal(await n(db, 'select count(*) from public.avisos_suscripciones where id = $1', [vencida]), 0, 'la vencida se borra')
      assert.equal((await db.query('select ultimo_ok_at is not null v from public.avisos_suscripciones where id = $1', [okId])).rows[0].v, true)
      // No entregó a nadie habiendo destinos: error.
      await servicio(db, 'select public.avisos_cerrar_envio($1, 0, 1, 3, $2, $3)', [b, [], []])
      const fila = id => db.query(`select estado, entregados, fallidos, sin_avisos from public.avisos_envios where id = $1`, [id]).then(r => r.rows[0])
      assert.deepEqual(await fila(b), { estado: 'error', entregados: 0, fallidos: 1, sin_avisos: 3 })
      // Un cierre tardío o repetido no pisa un envío terminado (ni toca las suscripciones).
      await servicio(db, 'select public.avisos_cerrar_envio($1, 0, 0, 3, $2, $3)', [b, [], []])
      assert.deepEqual(await fila(b), { estado: 'error', entregados: 0, fallidos: 1, sin_avisos: 3 })
      await servicio(db, 'select public.avisos_cerrar_envio($1, 5, 0, 0, $2, $3)', [a, [], [okId]])
      assert.deepEqual(await fila(a), { estado: 'enviado', entregados: 1, fallidos: 1, sin_avisos: 2 })
      assert.equal(await n(db, 'select count(*) from public.avisos_suscripciones where id = $1', [okId]), 1, 'no borra suscripciones')
      // Un pendiente que nadie tomó tampoco se cierra.
      const pendiente = (await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, texto, rol_remitente) values ('manual', $1, ${HOY}, 'Tercero', 'coordinacion') returning id`, [CAT])).rows[0].id
      await servicio(db, 'select public.avisos_cerrar_envio($1, 1, 0, 0, $2, $3)', [pendiente, [], []])
      assert.deepEqual(await fila(pendiente), { estado: 'pendiente', entregados: null, fallidos: null, sin_avisos: null })
      // Sin destinos: enviado.
      assert.deepEqual((await servicio(db, 'select public.avisos_tomar_pendientes() t')).rows[0].t.map(x => x.id), [pendiente])
      await servicio(db, 'select public.avisos_cerrar_envio($1, 0, 0, 3, $2, $3)', [pendiente, [], []])
      assert.equal((await fila(pendiente)).estado, 'enviado')
      await assert.rejects(servicio(db, 'select public.avisos_cerrar_envio($1, 0, 0, 0, $2, $3)', ['ffffffff-0000-4000-8000-000000000000', [], []]), codigo('P0002'))
      await suscribir(db, 'bea', ep('bea1'), 'iphone')
    })

    await t.test('tick: llama a la función solo con pendientes y secretos', async () => {
      await db.exec('delete from public.avisos_envios; delete from net.llamadas; delete from vault.secretos')
      // tick() programa con la hora real: se apagan las categorías para que el test no dependa de la hora.
      await db.exec('update public.avisos_config set activo = false')
      // Sin pendientes: no llama.
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0)
      // Con un pendiente pero sin secretos: no llama.
      await mandar(db, 'coord', CAT, 'Para el tick')
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0)
      await db.exec(`insert into vault.secretos values ('avisos_funcion_url', 'https://ejemplo.test/functions/v1/avisos-enviar')`)
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0, 'falta avisos_secreto')
      // Con los dos secretos: llama con el encabezado.
      await db.exec(`insert into vault.secretos values ('avisos_secreto', 'secreto-de-prueba')`)
      await db.exec('select avisos_privado.tick()')
      const llamadas = (await db.query('select url, headers from net.llamadas')).rows
      assert.deepEqual(llamadas, [{ url: 'https://ejemplo.test/functions/v1/avisos-enviar', headers: { 'Content-Type': 'application/json', 'x-avisos-secreto': 'secreto-de-prueba' } }])
      // Tomado hace poco: no vuelve a llamar; tomado hace más de 10 minutos: sí.
      await servicio(db, 'select public.avisos_tomar_pendientes()')
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 1)
      await db.exec(`update public.avisos_envios set tomado_at = now() - interval '11 minutes'`)
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 2)
      // Solo pendientes vencidos (Wellness de hace 91 minutos): no llama. Uno de hace 89: sí.
      await db.exec('delete from public.avisos_envios; delete from net.llamadas')
      await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, creado_at) values ('wellness', $1, ${HOY}, now() - interval '91 minutes')`, [CAT])
      await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, estado, tomado_at, creado_at)
        values ('rpe', $1, ${HOY}, 'enviando', now() - interval '11 minutes', now() - interval '91 minutes')`, [CAT])
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 0, 'lo vencido no llama')
      await db.query(`insert into public.avisos_envios (tipo, categoria_id, fecha, creado_at) values ('wellness', $1, ${HOY}, now() - interval '89 minutes')`, [SUB16])
      await db.exec('select avisos_privado.tick()')
      assert.equal(await n(db, 'select count(*) from net.llamadas'), 1)
      await db.exec('delete from public.avisos_envios; delete from net.llamadas; delete from vault.secretos')
      await db.exec('update public.avisos_config set activo = true')
    })

    await t.test('reversión', async () => {
      await assert.rejects(db.exec(reversion), /suscripciones/)
      assert.equal(await n(db, `select count(*) from cron.job`), 2)
      await db.exec('delete from public.avisos_suscripciones')
      await db.exec(reversion)
      assert.equal(await foto(db), antes)
      assert.equal(await n(db, `select count(*) from cron.job`), 0, 'las dos tareas se desagendan')
      // Se puede volver a aplicar.
      await db.exec(cambio)
      assert.equal(await n(db, `select count(*) from cron.job where jobname in ('avisos-tick', 'avisos-limpieza')`), 2)
    })
  } finally { await db.close() }
})

test('no corre sin pg_cron, sin pg_net, sin la etapa 1 o con la tarea ya agendada', async () => {
  const db = await crearBase()
  try {
    const antes = await foto(db)
    await db.exec('alter function cron.schedule(text, text, text) rename to schedule_x')
    await assert.rejects(db.exec(cambio), /pg_cron/)
    await db.exec('alter function cron.schedule_x(text, text, text) rename to schedule')
    await db.exec('alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_x')
    await assert.rejects(db.exec(cambio), /pg_net/)
    await db.exec('alter function net.http_post_x(text, jsonb, jsonb, jsonb, integer) rename to http_post')
    await db.exec(`select cron.schedule('avisos-tick', '* * * * *', 'select 1')`)
    await assert.rejects(db.exec(cambio), /avisos-tick/)
    await db.exec(`select cron.unschedule('avisos-tick')`)
    await db.exec(`select cron.schedule('avisos-limpieza', '17 4 * * *', 'select 1')`)
    await assert.rejects(db.exec(cambio), /avisos-limpieza/)
    await db.exec(`select cron.unschedule('avisos-limpieza')`)
    await db.exec('alter table cron.job_run_details rename to job_run_details_x')
    await assert.rejects(db.exec(cambio), /job_run_details/)
    await db.exec('alter table cron.job_run_details_x rename to job_run_details')
    await db.exec('alter function portal_privado.es_cuenta_jugadora() rename to es_cuenta_jugadora_x')
    await assert.rejects(db.exec(cambio), /etapa 1/)
    await db.exec('alter function portal_privado.es_cuenta_jugadora_x() rename to es_cuenta_jugadora')
    assert.equal(await foto(db), antes)
    assert.equal(await n(db, 'select count(*) from cron.job'), 0)
  } finally { await db.close() }
})
