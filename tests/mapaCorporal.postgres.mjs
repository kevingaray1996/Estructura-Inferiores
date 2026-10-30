import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const jugadora = '30000000-0000-4000-8000-000000000001'
const staff = '20000000-0000-4000-8000-000000000001'
test('Mapa: migración en PostgreSQL aislado, RLS, historial, restricciones y revisiones', async () => {
  const db = new PGlite()
  const sql = readFileSync(new URL('../supabase/migrations/20261030231602_mapa_corporal_medicos.sql', import.meta.url), 'utf8')
  const rol = async (nombre, perfil = '') => db.exec(`reset role; set request.jwt.claim.sub='${perfil ? staff : ''}'; set request.test.rol='${perfil}'; set role ${nombre};`)
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create function public.mi_rol() returns text language sql stable as $$select current_setting('request.test.rol',true)$$;
      create table public.jugadores(id uuid primary key);
      insert into public.jugadores values ('${jugadora}');
      create table public.fichas_medicas(id uuid primary key default gen_random_uuid(),jugador_id uuid not null references public.jugadores,fecha date,descripcion text,tiempo_recuperacion text,recuperado boolean default false,link_informe text,fecha_estimada_alta date,created_at timestamptz default now());
      alter table public.fichas_medicas enable row level security;
      grant all on public.fichas_medicas to anon,authenticated;
      create policy "preparador_fisico ve fichas medicas" on public.fichas_medicas for select using(mi_rol()='preparador_fisico');
      create policy "acceso ficha medica" on public.fichas_medicas for all using(mi_rol() in ('coordinacion','medico')) with check(mi_rol() in ('coordinacion','medico'));
      insert into public.fichas_medicas(jugador_id,fecha,descripcion) values('${jugadora}','2026-10-20','Antecedente sin clasificación');`)
    const anterior = (await db.query('select * from public.fichas_medicas')).rows[0]
    await db.exec(sql)
    const despues = (await db.query('select * from public.fichas_medicas')).rows[0]
    for (const [campo, valor] of Object.entries(anterior)) assert.deepEqual(despues[campo], valor)
    assert.equal(despues.zona_corporal, null)
    await rol('anon')
    await assert.rejects(db.query('select * from public.fichas_medicas'), e => e.code === '42501')
    for (const perfil of ['tecnico','jugadora','']) {
      await rol('authenticated', perfil)
      assert.equal((await db.query('select * from public.fichas_medicas')).rows.length, 0)
      await assert.rejects(db.query(`insert into public.fichas_medicas(jugador_id) values('${jugadora}')`), e => e.code === '42501')
    }
    const insertar = async (extra = {}) => {
      const f = { jugador_id: jugadora, fecha: '2026-10-30', zona_corporal: 'rodilla', lateralidad: 'derecha', tipo_incidencia: 'molestia', estado_seguimiento: 'seguimiento', recuperado: false, ...extra }
      const campos = Object.keys(f)
      return (await db.query(`insert into public.fichas_medicas(${campos.join(',')}) values(${campos.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(f))).rows[0]
    }
    for (const perfil of ['coordinacion','medico','preparador_fisico']) {
      await rol('authenticated', perfil)
      const f = await insertar()
      assert.equal(f.revision, 0)
      assert.equal(f.modificado_por, staff)
      const resuelta = (await db.query("update public.fichas_medicas set estado_seguimiento='resuelta',recuperado=true,fecha_resolucion='2026-10-30' where id=$1 and revision=0 returning *", [f.id])).rows[0]
      assert.equal(resuelta.revision, 1)
      assert.equal((await db.query("update public.fichas_medicas set descripcion='Obsoleto' where id=$1 and revision=0 returning id", [f.id])).rows.length, 0)
      await assert.rejects(db.query('update public.fichas_medicas set jugador_id=$1 where id=$2',[staff,f.id]), e => e.code === '23514')
      assert.equal((await db.query('select * from public.fichas_medicas where id=$1',[f.id])).rows.length,1,'Resolver conserva el antecedente')
      if (perfil === 'preparador_fisico') assert.equal((await db.query('delete from public.fichas_medicas where id=$1 returning id',[f.id])).rows.length,0)
    }
    await rol('authenticated','preparador_fisico')
    await assert.rejects(insertar({ lateralidad: 'central' }), e => e.code === '23514')
    await assert.rejects(insertar({ zona_corporal: 'inventada' }), e => e.code === '23514')
    await assert.rejects(insertar({ estado_seguimiento: 'resuelta' }), e => e.code === '23514')
    await assert.rejects(insertar({ tipo_incidencia: null }), e => e.code === '23514')
    await assert.rejects(insertar({ jugador_id: staff }), e => e.code === '23503')
    await assert.rejects(db.exec('truncate public.fichas_medicas'), e => e.code === '42501')
    await assert.rejects(db.exec('select medicos_privado.validar_ficha_corporal()'), e => e.code === '42501')
    await rol('authenticated','coordinacion')
    const f = await insertar()
    await assert.rejects(db.query('update public.fichas_medicas set zona_corporal=null where id=$1',[f.id]),e=>e.code==='23514')
    // Incluso una política permisiva accidental no supera la barrera restrictiva.
    await rol('anon')
    await assert.rejects(db.query('select * from public.fichas_medicas'), e => e.code === '42501')
    await db.exec('reset role; create policy prueba_permisiva on public.fichas_medicas for select to authenticated using(true)')
    await rol('authenticated','tecnico')
    assert.equal((await db.query('select * from public.fichas_medicas')).rows.length,0)
    await db.exec('reset role')
    await assert.rejects(db.exec(sql), /ya existe|parcialmente/)
    await db.exec('rollback')
  } finally { await db.close() }
})
