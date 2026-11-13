import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

// PostgreSQL WASM solo en memoria, con un Storage parecido al de Supabase. No usa credenciales ni Supabase.
const modulePath = process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(modulePath).href)

const leer = ruta => readFileSync(new URL('../supabase/' + ruta, import.meta.url), 'utf8').replace(/^﻿/, '')
const cambio = leer('migrations/20261113170000_seguridad_storage_biblioteca.sql')
const reversion = leer('rollback/20261113170000_seguridad_storage_biblioteca.sql')

const ESCUDO = 'escudos/Escudo simplificado.png'

// Estado auditado el 2026-11-13: bucket público sin límites y 4 políticas "authenticated puede todo".
const BLOQUEO_BORRADO = 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'

// codigoBorrado y mensajeBorrado imitan el trigger de Storage que bloquea borrar por SQL (en Supabase: 42501).
async function crearBase({ conTecnico = true, codigoBorrado = '42501', mensajeBorrado = BLOQUEO_BORRADO } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated;
    create table public.perfiles (email text primary key, rol text not null);
    create function public.mi_rol() returns text language sql stable security definer set search_path = public
      as $$ select rol::text from perfiles where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;
    insert into public.perfiles values ('coord@club.test', 'coordinacion'), ('pf@club.test', 'preparador_fisico'),
      ('medico@club.test', 'medico') ${conTecnico ? ", ('tecnico@club.test', 'tecnico')" : ''};

    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets,
      name text, owner_id text, metadata jsonb, unique (bucket_id, name));
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
    -- Como Supabase: borrar por SQL está bloqueado.
    create function storage.protect_delete() returns trigger language plpgsql as
      $$ begin raise exception '${mensajeBorrado}' using errcode = '${codigoBorrado}'; end $$;
    create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();

    insert into storage.buckets values ('Biblioteca', 'Biblioteca', true, null, null);
    insert into storage.objects (bucket_id, name) values ('Biblioteca', '${ESCUDO}'), ('Biblioteca', 'jugadores/1-ana.jpg');
    create policy "Biblioteca select autenticados" on storage.objects for select to authenticated using (bucket_id = 'Biblioteca');
    create policy "Biblioteca insert autenticados" on storage.objects for insert to authenticated with check (bucket_id = 'Biblioteca');
    create policy "Biblioteca update autenticados" on storage.objects for update to authenticated using (bucket_id = 'Biblioteca');
    create policy "Biblioteca delete autenticados" on storage.objects for delete to authenticated using (bucket_id = 'Biblioteca');
  `)
  return db
}

async function como(db, email, sql) {
  await db.exec('BEGIN')
  try {
    if (email) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ email, role: 'authenticated' })])
      await db.exec('SET LOCAL ROLE authenticated')
    } else {
      await db.exec('SET LOCAL ROLE anon')
    }
    return await db.query(sql)
  } finally { await db.exec('ROLLBACK') }
}
const subir = (db, email, nombre) => como(db, email, `insert into storage.objects (bucket_id, name) values ('Biblioteca', '${nombre}')`)

const FOTO = `
  select string_agg(linea, E'\\n' order by linea) as foto from (
    select format('pol %s %s %s %s %s', policyname, cmd, roles, qual, with_check) as linea from pg_policies where schemaname = 'storage'
    union all
    select format('bucket %s %s %s %s', id, public, file_size_limit, allowed_mime_types) from storage.buckets
  ) t`

test('Storage: cada rol sube solo en su carpeta, nadie lista, reemplaza ni borra; la reversión vuelve exacto', async () => {
  const db = await crearBase()
  try {
    const antes = (await db.query(FOTO)).rows[0].foto
    // Antes: cualquier logueado (incluso PF) lista y modifica.
    assert.equal((await como(db, 'pf@club.test', `select 1 from storage.objects`)).rows.length, 2)

    await db.exec(cambio)

    for (const carpeta of ['jugadores', 'escudos', 'entrenamientos', 'videos', 'staff']) await subir(db, 'coord@club.test', `${carpeta}/2-x.jpg`)
    for (const carpeta of ['jugadores', 'escudos', 'entrenamientos', 'videos']) await subir(db, 'tecnico@club.test', `${carpeta}/2-x.jpg`)
    const rechazos = [
      ['tecnico@club.test', 'staff/2-x.jpg'], ['coord@club.test', '2-x.jpg'], ['coord@club.test', 'otra/2-x.jpg'],
      ['coord@club.test', 'jugadores/sub/2-x.jpg'], ['pf@club.test', 'jugadores/2-x.jpg'], ['medico@club.test', 'escudos/2-x.jpg'],
      ['nadie@club.test', 'jugadores/2-x.jpg'], [null, 'jugadores/2-x.jpg'],
    ]
    for (const [email, nombre] of rechazos) await assert.rejects(subir(db, email, nombre), /row-level security/, `${email} ${nombre}`)
    // El escudo no se puede pisar subiendo otro con el mismo nombre.
    await assert.rejects(subir(db, 'coord@club.test', ESCUDO), /duplicate key/)

    for (const email of ['coord@club.test', 'tecnico@club.test', null]) {
      assert.equal((await como(db, email, `select 1 from storage.objects`)).rows.length, 0, `${email} lista`)
      assert.equal((await como(db, email, `update storage.objects set name = 'x' where bucket_id = 'Biblioteca'`)).affectedRows ?? 0, 0)
    }
    assert.equal((await db.query(`select count(*)::int as n from storage.objects where name = '${ESCUDO}'`)).rows[0].n, 1)
    assert.equal((await db.query(`select count(*)::int as n from storage.objects where name like '%prueba-seguridad%'`)).rows[0].n, 0)
    assert.deepEqual((await db.query(`select public, file_size_limit::int as limite, allowed_mime_types from storage.buckets`)).rows[0],
      { public: true, limite: 5242880, allowed_mime_types: ['image/*'] })

    await assert.rejects(db.exec(cambio), /ya se aplicó/)

    await db.exec(reversion)
    assert.equal((await db.query(FOTO)).rows[0].foto, antes)
    assert.equal((await como(db, 'pf@club.test', `select 1 from storage.objects`)).rows.length, 2)

    // Se puede volver a aplicar.
    await db.exec(cambio)
    await assert.rejects(subir(db, 'pf@club.test', 'jugadores/3-x.jpg'), /row-level security/)
  } finally { await db.close() }
})

test('Storage: sin técnicos se saltean sus pruebas y se aplica igual; si una prueba falla no queda nada', async () => {
  const db = await crearBase({ conTecnico: false })
  try {
    await db.exec(cambio)
    assert.equal((await db.query(`select count(*)::int as n from pg_policies where schemaname = 'storage'`)).rows[0].n, 1)
  } finally { await db.close() }

  const db2 = await crearBase()
  try {
    const antes = (await db2.query(FOTO)).rows[0].foto
    // Simulamos una falla en la verificación final: falta el escudo.
    await db2.exec(`alter table storage.objects disable trigger protect_objects_delete; delete from storage.objects where name = '${ESCUDO}'`)
    await assert.rejects(db2.exec(cambio), /escudo del club no está/)
    assert.equal((await db2.query(FOTO)).rows[0].foto, antes)
    assert.equal((await db2.query(`select to_regclass('seguridad_privado.respaldo_storage') is null as v`)).rows[0].v, true)
  } finally { await db2.close() }
})

test('Storage: el bloqueo de borrado de Storage cuenta como "no borró"; cualquier otro permission denied frena todo', async () => {
  const sinAplicar = async db => {
    assert.equal((await db.query(`select count(*)::int as n from pg_policies where schemaname = 'storage'`)).rows[0].n, 4)
    assert.equal((await db.query(`select to_regclass('seguridad_privado.respaldo_storage') is null as v`)).rows[0].v, true)
  }

  // El mismo bloqueo con otro código (versión distinta de Storage) también se acepta.
  for (const codigoBorrado of ['42501', 'P0001']) {
    const db = await crearBase({ codigoBorrado })
    try {
      await db.exec(cambio)
      assert.equal((await db.query(`select count(*)::int as n from pg_policies where schemaname = 'storage'`)).rows[0].n, 1, codigoBorrado)
    } finally { await db.close() }
  }

  // Un 42501 en un DELETE con otro mensaje no se toma como el bloqueo de Storage.
  let db = await crearBase({ mensajeBorrado: 'permiso denegado por otra cosa' })
  try {
    await assert.rejects(db.exec(cambio), /PRUEBA_FALLIDA: coordinación no pudo hacer: DELETE/)
    await sinAplicar(db)
  } finally { await db.close() }

  // Un 42501 donde se espera poder subir sigue fallando.
  db = await crearBase()
  try {
    await db.exec('revoke insert on storage.objects from authenticated')
    await assert.rejects(db.exec(cambio), /PRUEBA_FALLIDA: coordinación no pudo hacer: INSERT .*jugadores/)
    await sinAplicar(db)
  } finally { await db.close() }

  // Un 42501 en una lectura que tendría que dar cero filas sigue fallando.
  db = await crearBase()
  try {
    await db.exec('revoke select on storage.objects from authenticated')
    await assert.rejects(db.exec(cambio), /PRUEBA_FALLIDA: coordinación no pudo hacer: SELECT/)
    await sinAplicar(db)
  } finally { await db.close() }
})

test('Storage: cambio y reversión en un solo bloque DO, sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['cambio', cambio], ['reversión', reversion]]) {
    const sinComentarios = sql.replace(/--.*$/gm, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/m, nombre)
    assert.doesNotMatch(sinComentarios, /\bTEMP(ORARY)?\b/i, nombre)
  }
})
