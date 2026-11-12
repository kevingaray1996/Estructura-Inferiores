import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

// PostgreSQL WASM solo en memoria, con una copia mínima del esquema auditado. No usa credenciales ni Supabase.
const modulePath = process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(modulePath).href)

const leer = ruta => readFileSync(new URL('../supabase/' + ruta, import.meta.url), 'utf8').replace(/^﻿/, '')
const paso0 = leer('migrations/20261112150000_seguridad_paso0_jugadores_publico.sql')
const reversion0 = leer('rollback/20261112150000_seguridad_paso0_jugadores_publico.sql')
const pasoA = leer('migrations/20261112160000_seguridad_pasoA_wellness_publico_rpc.sql')
const reversionA = leer('rollback/20261112160000_seguridad_pasoA_wellness_publico_rpc.sql')

const cat = '10000000-0000-4000-8000-000000000001'
const otra = '10000000-0000-4000-8000-000000000002'
const ana = '30000000-0000-4000-8000-000000000001'
const bea = '30000000-0000-4000-8000-000000000002'
const sol = '30000000-0000-4000-8000-000000000003'

async function crearBase() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create table public.categorias (id uuid primary key, nombre text not null, orden integer not null default 0, es_reserva boolean);
    create table public.jugadores (id uuid primary key, nombre text not null, apellido text not null, foto_url text,
      categoria_id uuid not null references public.categorias(id), estado text not null default 'disponible', fecha_nacimiento date);
    create table public.bienestar (id uuid primary key default gen_random_uuid(), jugador_id uuid not null references public.jugadores(id) on delete cascade,
      fecha date not null, sueno smallint check (sueno between 1 and 5), dolor_muscular smallint check (dolor_muscular between 1 and 5),
      fatiga smallint check (fatiga between 1 and 5), estres smallint check (estres between 1 and 5), animo_entrenar smallint,
      zona_dolor text, fase_ciclo text, constraint bienestar_fecha_jugador_id_key unique (fecha, jugador_id));
    create table public.sesiones_fisicas (id uuid primary key default gen_random_uuid(), fecha date not null, jugador_id uuid not null,
      tipo text not null check (tipo in ('partido','entrenamiento')), partido_id uuid, minutos integer, distancia_total_m numeric,
      rpe smallint check (rpe between 1 and 10), created_at timestamptz default now(),
      constraint sesiones_fisicas_fecha_jugador_id_tipo_key unique (fecha, jugador_id, tipo));
    alter table public.categorias enable row level security;
    alter table public.jugadores enable row level security;
    alter table public.bienestar enable row level security;
    alter table public.sesiones_fisicas enable row level security;
    create view public.jugadores_publico as select id, nombre, apellido, foto_url, categoria_id from public.jugadores;
    -- Permisos como en la auditoría: todo para anon y authenticated.
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;

    insert into public.categorias (id, nombre) values ('${cat}', 'Primera'), ('${otra}', 'Sub 16');
    insert into public.jugadores (id, nombre, apellido, foto_url, categoria_id) values
      ('${ana}', 'Ana', 'Alvarez', '/a.jpg', '${cat}'), ('${bea}', 'Bea', 'Benitez', null, '${cat}'), ('${sol}', 'Sol', 'Sosa', null, '${otra}');
    -- Datos reales previos de la primera jugadora: la verificación del paso A no los tiene que tocar.
    insert into public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar, fase_ciclo)
      values ('${ana}', (now() at time zone 'America/Argentina/Buenos_Aires')::date, 2, 2, 2, 2, 2, 'lutea');
    insert into public.sesiones_fisicas (jugador_id, fecha, tipo, rpe, minutos, distancia_total_m)
      values ('${ana}', (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1, 'entrenamiento', 4, 80, 6200);
  `)
  return db
}

async function comoAnon(db, sql, params) {
  await db.exec('SET ROLE anon')
  try { return await db.query(sql, params) } finally { await db.exec('RESET ROLE') }
}

test('Paso 0: anon deja de escribir en jugadores_publico, sigue leyendo, y la reversión vuelve exacto', async () => {
  const db = await crearBase()
  try {
    const aclOriginal = (await db.query(`select relacl::text as a from pg_class where oid = 'public.jugadores_publico'::regclass`)).rows[0].a
    // El agujero: anon cambia una jugadora a través de la vista.
    await comoAnon(db, `update public.jugadores_publico set nombre = 'Cambiado' where id = '${bea}'`)
    assert.equal((await db.query(`select nombre from public.jugadores where id = '${bea}'`)).rows[0].nombre, 'Cambiado')
    await db.exec(`update public.jugadores set nombre = 'Bea' where id = '${bea}'`)

    await db.exec(paso0)
    await assert.rejects(comoAnon(db, `update public.jugadores_publico set nombre = 'X' where id = '${bea}'`), /permission denied/)
    await assert.rejects(comoAnon(db, `delete from public.jugadores_publico where id = '${bea}'`), /permission denied/)
    await assert.rejects(comoAnon(db, `insert into public.jugadores_publico (id, nombre, apellido, categoria_id) values (gen_random_uuid(), 'a', 'b', '${cat}')`), /permission denied/)
    assert.equal((await comoAnon(db, 'select count(*)::int as n from public.jugadores_publico')).rows[0].n, 3)
    await assert.rejects(db.exec(paso0), /ya se aplicó/)
    await db.exec('ROLLBACK')

    await db.exec(reversion0)
    assert.equal((await db.query(`select relacl::text as a from pg_class where oid = 'public.jugadores_publico'::regclass`)).rows[0].a, aclOriginal)
    await comoAnon(db, `update public.jugadores_publico set nombre = nombre where id = '${bea}'`)
    // Se puede volver a aplicar después de revertir.
    await db.exec(paso0)
    await assert.rejects(comoAnon(db, `update public.jugadores_publico set nombre = nombre where id = '${bea}'`), /permission denied/)
  } finally { await db.close() }
})

test('Paso A: funciones públicas validadas, sin tocar datos existentes; la reversión las borra', async () => {
  const db = await crearBase()
  try {
    const antes = (await db.query(`select (select json_agg(b order by b.id)::text from public.bienestar b) as b,
      (select json_agg(s order by s.id)::text from public.sesiones_fisicas s) as s`)).rows[0]
    await db.exec(pasoA)
    const despues = (await db.query(`select (select json_agg(b order by b.id)::text from public.bienestar b) as b,
      (select json_agg(s order by s.id)::text from public.sesiones_fisicas s) as s`)).rows[0]
    assert.deepEqual(despues, antes, 'la verificación interna no deja datos de prueba')
    await assert.rejects(db.exec(pasoA), /ya se aplicó/)
    await db.exec('ROLLBACK')

    const lista = (await comoAnon(db, 'select public.wellness_publico_categoria($1) as d', [cat])).rows[0].d
    assert.deepEqual(lista, { nombre: 'Primera', jugadoras: [
      { id: ana, nombre: 'Ana', apellido: 'Alvarez', foto_url: '/a.jpg' }, { id: bea, nombre: 'Bea', apellido: 'Benitez', foto_url: null }] })
    assert.equal((await comoAnon(db, 'select public.wellness_publico_categoria(gen_random_uuid()) as d')).rows[0].d, null)

    const respondio = async j => (await comoAnon(db, 'select public.wellness_publico_respondio($1, $2) as r', [cat, j])).rows[0].r
    assert.equal(await respondio(ana), true)
    assert.equal(await respondio(bea), false)
    await comoAnon(db, 'select public.wellness_publico_guardar($1, $2, 3, 3, 3, 3, 3, $3, $4)', [cat, bea, ' rodilla ', 'menstrual'])
    assert.equal(await respondio(bea), true)
    // Corregir reemplaza la respuesta completa.
    await comoAnon(db, 'select public.wellness_publico_guardar($1, $2, 4, 4, 4, 4, 4)', [cat, bea])
    const fila = (await db.query(`select sueno, zona_dolor, fase_ciclo from public.bienestar where jugador_id = '${bea}'`)).rows
    assert.deepEqual(fila, [{ sueno: 4, zona_dolor: null, fase_ciclo: null }])
    await assert.rejects(comoAnon(db, 'select public.wellness_publico_guardar($1, $2, 3, 3, 3, 3, 3)', [cat, sol]), /no corresponde a este link/)
    assert.equal(await (async () => (await comoAnon(db, 'select public.wellness_publico_respondio($1, $2) as r', [cat, sol])).rows[0].r)(), false)

    // RPE: solo cambia rpe.
    await comoAnon(db, `select public.rpe_publico_guardar($1, $2, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1, 'entrenamiento', 9)`, [cat, ana])
    const sesion = (await db.query(`select rpe, minutos, distancia_total_m::text as d from public.sesiones_fisicas where jugador_id = '${ana}'`)).rows
    assert.deepEqual(sesion, [{ rpe: 9, minutos: 80, d: '6200' }])
    await assert.rejects(comoAnon(db, `select public.rpe_publico_guardar($1, $2, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 4, 'entrenamiento', 5)`, [cat, ana]), /3 días anteriores/)

    await db.exec(reversionA)
    assert.equal((await db.query(`select count(*)::int as n from pg_proc where proname in ('wellness_publico_categoria','wellness_publico_respondio','wellness_publico_guardar','rpe_publico_guardar')`)).rows[0].n, 0)
    // Se puede volver a aplicar después de revertir.
    await db.exec(pasoA)
  } finally { await db.close() }
})
