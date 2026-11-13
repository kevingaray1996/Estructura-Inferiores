import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

// PostgreSQL WASM solo en memoria, con una base parecida a Supabase. No usa credenciales ni Supabase.
const modulePath = process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(modulePath).href)

const leer = ruta => readFileSync(new URL('../supabase/' + ruta, import.meta.url), 'utf8').replace(/^﻿/, '')
const paso0 = leer('migrations/20261112150000_seguridad_paso0_jugadores_publico.sql')
const pasoA = leer('migrations/20261112160000_seguridad_pasoA_wellness_publico_rpc.sql')
const pasoB = leer('migrations/20261112170000_seguridad_pasoB_cerrar_anon.sql')
const reversionB = leer('rollback/20261112170000_seguridad_pasoB_cerrar_anon.sql')

const cat = '10000000-0000-4000-8000-000000000001'
const ana = '30000000-0000-4000-8000-000000000001'

// Privilegios por defecto amplios (como Supabase), las 3 políticas de anon, permisos por columna,
// una secuencia y una función que authenticated solo ejecuta gracias a PUBLIC.
async function crearBaseSupabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
    create table public.perfiles (email text primary key, rol text not null, categoria_id uuid);
    create table public.categorias (id uuid primary key, nombre text not null);
    create table public.jugadores (id uuid primary key, nombre text not null, apellido text not null, foto_url text, categoria_id uuid not null);
    create table public.partidos (id uuid primary key default gen_random_uuid(), categoria_id uuid, fecha date);
    create table public.bienestar (id uuid primary key default gen_random_uuid(), jugador_id uuid not null, fecha date not null,
      sueno smallint, dolor_muscular smallint, fatiga smallint, estres smallint, animo_entrenar smallint, zona_dolor text, fase_ciclo text,
      unique (fecha, jugador_id));
    create table public.sesiones_fisicas (id uuid primary key default gen_random_uuid(), fecha date not null, jugador_id uuid not null,
      tipo text not null, rpe smallint, minutos integer, unique (fecha, jugador_id, tipo));
    create table public.contador (id serial primary key);
    create view public.jugadores_publico as select id, nombre, apellido, foto_url, categoria_id from public.jugadores;
    grant select, insert, update (fecha, jugador_id, tipo, rpe) on public.sesiones_fisicas to anon;
    alter table public.perfiles enable row level security;
    alter table public.categorias enable row level security;
    alter table public.jugadores enable row level security;
    alter table public.partidos enable row level security;
    alter table public.bienestar enable row level security;
    alter table public.sesiones_fisicas enable row level security;
    create function public.mi_rol() returns text language sql stable security definer set search_path = public
      as $$ select rol from perfiles where email = current_setting('request.jwt.claim.email', true) $$;
    create function public.solo_por_public(x integer) returns integer language sql immutable as $$ select x $$;
    revoke all on function public.solo_por_public(integer) from anon, authenticated, service_role;
    create policy "staff lee bienestar" on public.bienestar for select to authenticated using (mi_rol() is not null);
    create policy "publico bienestar de hoy" on public.bienestar for all to anon
      using (fecha = (now() at time zone 'America/Argentina/Buenos_Aires')::date)
      with check (fecha = (now() at time zone 'America/Argentina/Buenos_Aires')::date);
    create policy "publico rpe reciente" on public.sesiones_fisicas for all to anon
      using (fecha >= current_date - 3) with check (fecha >= current_date - 3);
    create policy "publico ve categorias" on public.categorias for select to anon using (true);
    create function public.planificacion_publica_hoy(p_categoria_id uuid, p_jugadora_id uuid) returns jsonb
      language plpgsql stable security definer set search_path = '' as $$
      begin
        if not exists (select 1 from public.jugadores_publico j where j.id = p_jugadora_id and j.categoria_id = p_categoria_id) then
          return '[]'::jsonb;
        end if;
        return '[{"ok": true}]'::jsonb;
      end $$;
    revoke all on function public.planificacion_publica_hoy(uuid, uuid) from public, anon, authenticated;
    grant execute on function public.planificacion_publica_hoy(uuid, uuid) to anon, authenticated;
    insert into public.categorias values ('${cat}', 'Primera');
    insert into public.jugadores values ('${ana}', 'Ana', 'Alvarez', null, '${cat}');
  `)
  return db
}

async function comoAnon(db, sql, params) {
  await db.exec('SET ROLE anon')
  try { return await db.query(sql, params) } finally { await db.exec('RESET ROLE') }
}

// Todos los permisos de public (sin contar quién otorgó), políticas y opciones de la vista.
const FOTO_PERMISOS = `
  select string_agg(linea, E'\\n' order by linea) as foto from (
    select format('rel %s %s %s %s', c.relname, x.grantee::regrole, x.privilege_type, x.is_grantable) as linea
      from pg_class c join pg_namespace n on n.oid = c.relnamespace,
      aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) x
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
    union all
    select format('col %s.%s %s %s', c.relname, a.attname, x.grantee::regrole, x.privilege_type)
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace,
      aclexplode(a.attacl) x
     where n.nspname = 'public' and a.attacl is not null
    union all
    select format('fun %s %s %s', p.proname, x.grantee, x.privilege_type)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
      aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
     where n.nspname = 'public'
    union all
    select format('def %s %s %s', d.defaclobjtype, x.grantee::regrole, x.privilege_type)
      from pg_default_acl d, aclexplode(d.defaclacl) x
     where d.defaclnamespace = 'public'::regnamespace
    union all
    select format('pol %s %s %s %s', tablename, policyname, cmd, roles) from pg_policies where schemaname = 'public'
    union all
    select format('opt %s', coalesce(reloptions::text, '-')) from pg_class where oid = 'public.jugadores_publico'::regclass
  ) t`

const valor = async (db, sql) => (await db.query(`select ${sql} as v`)).rows[0].v

test('Paso B: anon solo ejecuta las 5 funciones, authenticated no cambia y la reversión vuelve exacto', async () => {
  const db = await crearBaseSupabase()
  try {
    await db.exec(paso0)
    await db.exec(pasoA)
    const antes = (await db.query(FOTO_PERMISOS)).rows[0].foto
    assert.equal(await valor(db, `has_function_privilege('authenticated', 'public.solo_por_public(integer)', 'EXECUTE')`), true)
    // Antes del paso B, anon lee categorías (el agujero que se cierra).
    assert.equal((await comoAnon(db, 'select count(*)::int as n from public.categorias')).rows[0].n, 1)

    await db.exec(pasoB)

    // anon: ni tablas, ni vistas, ni columnas, ni secuencias, ni políticas.
    for (const tabla of ['bienestar', 'sesiones_fisicas', 'jugadores', 'jugadores_publico', 'categorias', 'partidos', 'perfiles', 'contador']) {
      await assert.rejects(comoAnon(db, `select 1 from public.${tabla}`), /permission denied/, tabla)
    }
    await assert.rejects(comoAnon(db, `insert into public.sesiones_fisicas (fecha, jugador_id, tipo, rpe) values (current_date, '${ana}', 'entrenamiento', 5)`), /permission denied/)
    await assert.rejects(comoAnon(db, `select nextval('public.contador_id_seq')`), /permission denied/)
    assert.equal(await valor(db, `(select count(*)::int from pg_policies where 'anon'::name = any (roles))`), 0)

    // anon: exactamente las 5 funciones.
    const funcionesAnon = await valor(db, `(select string_agg(p.proname, ',' order by p.proname) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE'))`)
    assert.equal(funcionesAnon, 'planificacion_publica_hoy,rpe_publico_guardar,wellness_publico_categoria,wellness_publico_guardar,wellness_publico_respondio')

    // Las funciones del formulario siguen andando sin permisos sobre tablas.
    assert.equal((await comoAnon(db, 'select public.wellness_publico_categoria($1) as d', [cat])).rows[0].d.jugadoras.length, 1)
    await comoAnon(db, 'select public.wellness_publico_guardar($1, $2, 1, 2, 3, 4, 5)', [cat, ana])
    assert.equal((await comoAnon(db, 'select public.wellness_publico_respondio($1, $2) as r', [cat, ana])).rows[0].r, true)
    await comoAnon(db, `select public.rpe_publico_guardar($1, $2, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'entrenamiento', 6)`, [cat, ana])
    assert.deepEqual((await comoAnon(db, 'select public.planificacion_publica_hoy($1, $2) as d', [cat, ana])).rows[0].d, [{ ok: true }])

    // authenticated y service_role conservan todo, incluida la función que tenían por PUBLIC.
    for (const rol of ['authenticated', 'service_role']) {
      assert.equal(await valor(db, `has_function_privilege('${rol}', 'public.solo_por_public(integer)', 'EXECUTE')`), true, rol)
      assert.equal(await valor(db, `has_function_privilege('${rol}', 'public.mi_rol()', 'EXECUTE')`), true, rol)
      assert.equal(await valor(db, `has_table_privilege('${rol}', 'public.bienestar', 'INSERT')`), true, rol)
    }
    assert.equal(await valor(db, `(select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.jugadores_publico'::regclass)`), true)

    // Lo nuevo ya no nace abierto para anon (y authenticated sigue recibiendo sus permisos).
    await db.exec('create table public.nueva (id integer)')
    assert.equal(await valor(db, `has_table_privilege('anon', 'public.nueva', 'SELECT')`), false)
    assert.equal(await valor(db, `has_table_privilege('authenticated', 'public.nueva', 'SELECT')`), true)
    await db.exec('drop table public.nueva')

    // La foto auxiliar se borró y el respaldo quedó.
    assert.equal(await valor(db, `to_regclass('seguridad_privado.pasob_antes') is null`), true)
    assert.ok(await valor(db, `(select count(*)::int from seguridad_privado.respaldo_paso_b)`) > 0)

    await assert.rejects(db.exec(pasoB), /ya se aplicó/)

    // Reversión: todo exactamente como antes del paso B.
    await db.exec(reversionB)
    assert.equal((await db.query(FOTO_PERMISOS)).rows[0].foto, antes)
    assert.equal((await comoAnon(db, 'select count(*)::int as n from public.categorias')).rows[0].n, 1)

    // Se puede volver a aplicar.
    await db.exec(pasoB)
    await assert.rejects(comoAnon(db, 'select 1 from public.bienestar'), /permission denied/)
  } finally { await db.close() }
})

// El editor de Supabase puede ejecutar cada sentencia por separado: los scripts tienen que ser un único DO.
test('Paso B y su reversión: un solo bloque DO, sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['paso B', pasoB], ['reversión', reversionB]]) {
    const sinComentarios = sql.replace(/--.*$/gm, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/m, nombre)
    assert.doesNotMatch(sinComentarios, /\bTEMP(ORARY)?\b/i, nombre)
  }
})

test('Paso B: si falla a mitad de camino no queda nada aplicado', async () => {
  const db = await crearBaseSupabase()
  try {
    await db.exec(paso0)
    await db.exec(pasoA)
    const antes = (await db.query(FOTO_PERMISOS)).rows[0].foto
    // Sin jugadoras, la prueba como anon del final falla después de haber revocado todo.
    await db.exec('delete from public.jugadores')
    await assert.rejects(db.exec(pasoB), /No hay jugadoras/)
    assert.equal((await db.query(FOTO_PERMISOS)).rows[0].foto, antes)
    assert.equal(await valor(db, `to_regclass('seguridad_privado.respaldo_paso_b') is null`), true)
    assert.equal(await valor(db, `to_regclass('seguridad_privado.pasob_antes') is null`), true)
  } finally { await db.close() }
})
