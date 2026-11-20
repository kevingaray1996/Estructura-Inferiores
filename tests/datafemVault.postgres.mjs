// DataFem al Vault: la migración cambia el comando de "actualizar-datafem-lunes" para que lea el secreto del Vault,
// la verificación lo confirma, la prueba manual usa el comando real y los headers viejos, y la reversión restaura
// el comando original. PostgreSQL WASM en memoria; pg_cron, pg_net y Vault simulados. Nunca toca la base real.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const leer = r => readFileSync(new URL('../' + r, import.meta.url), 'utf8').replace(/^﻿/, '')
const RUTAS = {
  migracion: 'supabase/migrations/20261120120000_datafem_secreto_vault.sql',
  reversion: 'supabase/rollback/20261120120000_datafem_secreto_vault.sql',
  verificacion: 'supabase/verification/20261120_datafem_secreto_vault.sql',
  prueba: 'supabase/verification/20261120_prueba_datafem_manual.sql',
}
const migracion = leer(RUTAS.migracion)
const reversion = leer(RUTAS.reversion)
const verificacion = leer(RUTAS.verificacion)
const prueba = leer(RUTAS.prueba)

const URL_FUNCION = 'https://qvjviyjkxyngiggoeqlj.supabase.co/functions/v1/actualizar-datafem'
const VIEJO = 'secreto-viejo-solo-para-el-test-0123456789'
const NUEVO = 'nuevo'.repeat(8) + '-0123456789abcdef'
const ORIGINAL = `select
  net.http_post(
      url:='${URL_FUNCION}',
      headers:='{"x-datafem-secret":"${VIEJO}","Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=1000
  );`

async function crearBase({ comando = ORIGINAL, secretoVault = NUEVO } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema cron; create schema net; create schema vault; create schema seguridad_privado;
    create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique,
      username text not null default current_user, active boolean not null default true);
    -- Como pg_cron: los parámetros en null no cambian nada.
    create function cron.alter_job(job_id bigint, schedule text default null, command text default null,
      database text default null, username text default null, active boolean default null) returns void language plpgsql as $$
      begin
        update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command),
          active = coalesce(alter_job.active, j.active) where j.jobid = job_id;
        if not found then raise exception 'Could not find valid entry for job %', job_id; end if;
      end $$;
    create table net.llamadas (id bigserial primary key, url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
      language sql as $$ insert into net.llamadas (url, body, params, headers, timeout_milliseconds)
        values (url, body, params, headers, timeout_milliseconds) returning id $$;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create table public.datafem_tablas (id smallint primary key, zona_a jsonb, zona_b jsonb, general jsonb, updated_at timestamptz);
  `)
  await db.query(`insert into cron.job (jobname, schedule, command) values ('otra-tarea', '* * * * *', 'select 1')`)
  await db.query(`insert into cron.job (jobname, schedule, command) values ('actualizar-datafem-lunes', '0 12 * * 1', $1)`, [comando])
  if (secretoVault !== null) await db.query(`insert into vault.decrypted_secrets values ('datafem_secreto', $1)`, [secretoVault])
  return db
}

const tarea = async db => (await db.query(`select * from cron.job where jobname = 'actualizar-datafem-lunes'`)).rows[0]
const hayRespaldo = async db => (await db.query(`select to_regclass('seguridad_privado.respaldo_datafem_cron') is not null as hay`)).rows[0].hay
const pasos = sql => sql.split(/^-- Paso [A-F]\..*$/m).slice(1).map(p => p.replace(/^--.*$/gm, '').trim()).filter(Boolean)

async function rechaza(db, sql, patron) {
  await assert.rejects(db.exec(sql), patron)
  assert.equal((await tarea(db)).command, ORIGINAL, 'el comando queda igual')
  assert.equal(await hayRespaldo(db), false, 'no queda respaldo')
}

test('Los scripts para el editor: un único bloque DO y ningún secreto escrito', () => {
  for (const [nombre, sql] of Object.entries({ migracion, reversion })) {
    assert.equal((sql.match(/^DO \$do\$/gm) || []).length, 1, `${nombre}: un solo DO`)
    assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)\s*;/im, `${nombre}: sin BEGIN/COMMIT`)
    assert.doesNotMatch(sql, /create\s+temp/i, `${nombre}: sin tablas temporales`)
  }
  for (const [nombre, sql] of Object.entries({ migracion, reversion, verificacion, prueba })) {
    assert.doesNotMatch(sql, /[0-9a-f]{32,}/i, `${nombre}: sin nada con forma de secreto`)
    assert.doesNotMatch(sql, /"x-datafem-secret"\s*:\s*"(?!\*\*\*")/i, `${nombre}: sin el secreto en un texto JSON (solo *** de ejemplo)`)
  }
})

test('Migración: el comando lee el secreto del Vault, timeout 30 s, mismo horario, y la verificación da todo true', async () => {
  const db = await crearBase()
  const antes = await tarea(db)
  await db.exec(migracion)
  const despues = await tarea(db)
  assert.equal(despues.jobid, antes.jobid)
  assert.equal(despues.schedule, antes.schedule)
  assert.equal(despues.active, true)
  assert.ok(!despues.command.includes(VIEJO), 'sin el secreto viejo')
  assert.ok(!despues.command.includes(NUEVO), 'sin el secreto nuevo escrito')
  assert.match(despues.command, /jsonb_build_object\('x-datafem-secret', \(SELECT s\.decrypted_secret FROM vault\.decrypted_secrets s WHERE s\.name = 'datafem_secreto' LIMIT 1\), 'Content-Type', 'application\/json'\)/)
  assert.match(despues.command, /timeout_milliseconds:=30000/)
  assert.equal((await db.query(`select command from cron.job where jobname = 'otra-tarea'`)).rows[0].command, 'select 1', 'otras tareas intactas')

  const respaldo = (await db.query('select * from seguridad_privado.respaldo_datafem_cron')).rows
  assert.equal(respaldo.length, 1)
  assert.equal(respaldo[0].command, ORIGINAL, 'respaldo del comando original completo')

  const fila = (await db.query(verificacion)).rows[0]
  for (const [columna, valor] of Object.entries(fila)) assert.equal(valor, true, `verificación: ${columna}`)
})

test('Prueba manual: el comando real manda el secreto del Vault; el paso E manda los headers viejos', async () => {
  const db = await crearBase()
  await db.exec(migracion)
  const [a, b, c, d, e] = pasos(prueba)
  await db.query(a)
  await db.exec(b)
  let llamada = (await db.query('select * from net.llamadas order by id desc limit 1')).rows[0]
  assert.equal(llamada.url, URL_FUNCION)
  assert.deepEqual(llamada.headers, { 'x-datafem-secret': NUEVO, 'Content-Type': 'application/json' })
  assert.equal(llamada.timeout_milliseconds, 30000)
  assert.ok(c.includes('net._http_response') && d.includes('datafem_tablas'))
  await db.query(d)
  const id = (await db.query(e)).rows[0].id_pedido
  llamada = (await db.query('select * from net.llamadas where id = $1', [id])).rows[0]
  assert.equal(llamada.url, URL_FUNCION)
  assert.deepEqual(llamada.headers, { 'x-datafem-secret': VIEJO, 'Content-Type': 'application/json' })
})

test('Migración: frena sin aplicar nada si falta el Vault, si es el mismo secreto o si el comando tiene otra forma', async () => {
  await rechaza(await crearBase({ secretoVault: null }), migracion, /Falta datafem_secreto/)
  await rechaza(await crearBase({ secretoVault: 'corto' }), migracion, /Falta datafem_secreto/)
  await rechaza(await crearBase({ secretoVault: NUEVO + '\n' }), migracion, /espacios o saltos/)
  await rechaza(await crearBase({ secretoVault: ' ' + NUEVO }), migracion, /espacios o saltos/)
  await rechaza(await crearBase({ secretoVault: VIEJO }), migracion, /igual al secreto viejo/)

  const otraForma = ORIGINAL.replace(`'{"x-datafem-secret":"${VIEJO}","Content-Type":"application/json"}'::jsonb`,
    `jsonb_build_object('x-datafem-secret', '${VIEJO}')`)
  const db1 = await crearBase({ comando: otraForma })
  await assert.rejects(db1.exec(migracion), /Los headers del comando/)
  assert.equal((await tarea(db1)).command, otraForma)

  const conBody = ORIGINAL.replace('timeout_milliseconds:=1000', `body:='{}'::jsonb, timeout_milliseconds:=1000`)
  const db2 = await crearBase({ comando: conBody })
  await assert.rejects(db2.exec(migracion), /forma esperada/)

  const otraUrl = ORIGINAL.replace('actualizar-datafem\'', 'otra-funcion\'')
  const db3 = await crearBase({ comando: otraUrl })
  await assert.rejects(db3.exec(migracion), /no llama a la función/)

  const conOtroHeader = ORIGINAL.replace('"Content-Type":"application/json"', '"Content-Type":"application/json","Authorization":"Bearer x"')
  const db4 = await crearBase({ comando: conOtroHeader })
  await assert.rejects(db4.exec(migracion), /Los headers del comando/)
})

test('Migración: no se puede correr dos veces', async () => {
  const db = await crearBase()
  await db.exec(migracion)
  const despues = (await tarea(db)).command
  await assert.rejects(db.exec(migracion), /ya se corrió/)
  assert.equal((await tarea(db)).command, despues)
})

test('Reversión: restaura el comando original completo; sin respaldo, frena', async () => {
  const sinRespaldo = await crearBase()
  await assert.rejects(sinRespaldo.exec(reversion), /no hay nada que restaurar/)

  const db = await crearBase()
  await db.exec(migracion)
  await db.exec(reversion)
  const t = await tarea(db)
  assert.equal(t.command, ORIGINAL)
  assert.equal(t.schedule, '0 12 * * 1')
  assert.equal(await hayRespaldo(db), true, 'el respaldo se conserva')
})
