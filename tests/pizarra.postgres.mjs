import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuevaPizarra, agregarElemento } from '../src/utils/pizarra.js'
import { nuevaSesion, nuevoBloque, nuevoEjercicio, prepararSesion } from '../src/utils/planificacion.js'
const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)

test('PostgreSQL aislado: pizarra, RPC invoker, RLS, revisión, snapshot y proyección pública', async () => {
  const db = new PGlite(), cat = '10000000-0000-4000-8000-000000000001', user = '20000000-0000-4000-8000-000000000001', player = '30000000-0000-4000-8000-000000000001'
  const rpc = async (datos, id = null, revision = null) => (await db.query('select public.guardar_ejercicio_pizarra($1,$2,$3::jsonb) d', [id, revision, JSON.stringify(datos)])).rows[0].d
  const rol = async (nombre, id = '') => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role ${nombre}`)
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      create table public.categorias(id uuid primary key); create table public.perfiles(email text primary key,rol text,categoria_id uuid);
      create function public.mi_rol() returns text language sql security definer set search_path='' as $$select p.rol from public.perfiles p join auth.users u on p.email=u.email where u.id=auth.uid()$$;
      create table public.biblioteca(id uuid primary key default gen_random_uuid(),fecha date not null,contenido text,descripcion text not null,cantidad_jugadores integer,imagen_url text,link_video text);
      alter table public.biblioteca enable row level security;
      create policy staff_biblioteca on public.biblioteca for all to authenticated using(public.mi_rol() in ('coordinacion','tecnico')) with check(public.mi_rol() in ('coordinacion','tecnico'));
      create policy pf_lectura on public.biblioteca for select to authenticated using(public.mi_rol()='preparador_fisico');
      grant select,insert,update,delete on public.biblioteca to authenticated;
      create table public.entrenamiento_bloques(id uuid primary key,categoria_id uuid,fecha date);
      create table public.jugadores(id uuid primary key,categoria_id uuid);create view public.jugadores_publico as select * from public.jugadores;
      insert into public.categorias values('${cat}');insert into auth.users values('${user}','staff@test.invalid');insert into public.perfiles values('staff@test.invalid','tecnico','${cat}');
      insert into public.jugadores values('${player}','${cat}');
      insert into public.biblioteca(fecha,descripcion) values(current_date,'Histórico sin pizarra');`)
    const base = readFileSync(new URL('../supabase/migrations/20261026190426_planificacion_semanal.sql', import.meta.url), 'utf8')
    const sql = readFileSync(new URL('../supabase/migrations/20261030002005_pizarra_tactica.sql', import.meta.url), 'utf8')
    await db.exec(base.replace(/^\uFEFF/, '')); await db.exec(sql.replace(/^\uFEFF/, ''))
    assert.equal((await db.query('select count(*)::int n from public.biblioteca where pizarra is null')).rows[0].n, 1)
    const pizarra = agregarElemento(nuevaPizarra(), 'pelota')
    const fecha = (await db.query("select to_char(now() at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') f")).rows[0].f
    const datos = { fecha, descripcion: 'Actividad', pizarra: { ...pizarra, notas_internas: 'NO_PUBLICAR' }, pizarra_miniatura: '' }
    await rol('authenticated', user)
    let ejercicio = await rpc(datos)
    assert.equal(ejercicio.pizarra_revision, 1); assert.equal(ejercicio.pizarra.version, 1)
    assert.doesNotMatch(JSON.stringify(ejercicio.pizarra), /NO_PUBLICAR/)
    ejercicio = await rpc({ ...datos, descripcion: 'Corregida' }, ejercicio.id, 1)
    assert.equal(ejercicio.pizarra_revision, 2)
    await assert.rejects(rpc(datos, ejercicio.id, 1), e => e.code === '40001')
    await assert.rejects(rpc({ ...datos, pizarra: { ...pizarra, version: 3 } }), e => e.code === '22023')
    await assert.rejects(rpc({ ...datos, pizarra_miniatura: '<svg onload=alert(1)>' }), e => e.code === '22023')
    const tarea = { ...nuevoEjercicio(ejercicio), visible: true, nombre: 'Circuito', notas_internas: 'NOTA_PRIVADA' }
    const sesion = prepararSesion({ ...nuevaSesion(fecha, cat), estado: 'publicado', bloques: [{ ...nuevoBloque(), visible: true, nombre: 'Definición', ejercicios: [tarea] }] })
    let s = (await db.query('select public.guardar_planificacion_sesion($1::jsonb,null) d', [JSON.stringify(sesion)])).rows[0].d
    await rol('anon')
    const publica = async () => (await db.query('select public.planificacion_publica_hoy($1,$2) d', [cat, player])).rows[0].d
    assert.equal((await publica())[0].bloques[0].ejercicios[0].pizarra, undefined)
    await assert.rejects(db.query('select pizarra from public.biblioteca'), e => e.code === '42501')
    await assert.rejects(rpc(datos), e => e.code === '42501')
    await rol('authenticated', user)
    s.bloques[0].ejercicios[0].campos_publicos.push('pizarra')
    s = (await db.query('select public.guardar_planificacion_sesion($1::jsonb,$2) d', [JSON.stringify(prepararSesion(s)), s.revision])).rows[0].d
    await rpc({ ...datos, pizarra: agregarElemento(pizarra, 'cono') }, ejercicio.id, 2)
    await rol('anon')
    const p = await publica()
    assert.equal(p[0].bloques[0].ejercicios[0].pizarra.elementos.length, 1)
    assert.doesNotMatch(JSON.stringify(p), /NOTA_PRIVADA|NO_PUBLICAR|pizarra_miniatura/)
    await rol('postgres'); await db.exec("update public.perfiles set rol='preparador_fisico'")
    await rol('authenticated', user)
    assert.ok((await db.query('select * from public.biblioteca')).rows.length > 0)
    await assert.rejects(rpc(datos), e => e.code === '42501')
    s.estado = 'borrador'
    await db.query('select public.guardar_planificacion_sesion($1::jsonb,$2)', [JSON.stringify(prepararSesion(s)), s.revision])
    await rol('anon'); assert.deepEqual(await publica(), [])
  } finally { await db.close() }
})
