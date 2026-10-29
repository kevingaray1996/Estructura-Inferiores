import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { inicioSemana, sumarDias, nuevaSesion, nuevoBloque, nuevoEjercicio, prepararSesion } from '../src/utils/planificacion.js'

// PostgreSQL WASM sólo en memoria. No lee credenciales ni usa el cliente Supabase.
const modulePath = process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(modulePath).href)
const cat = '10000000-0000-4000-8000-000000000001'
const otra = '10000000-0000-4000-8000-000000000002'
const tecnico = '20000000-0000-4000-8000-000000000001'
const coord = '20000000-0000-4000-8000-000000000002'
const medico = '20000000-0000-4000-8000-000000000003'
const pf = '20000000-0000-4000-8000-000000000004'
const jugadora = '30000000-0000-4000-8000-000000000001'
const biblioteca = '40000000-0000-4000-8000-000000000001'
const real = '50000000-0000-4000-8000-000000000001'

test('PostgreSQL aislado: migracion, RLS, RPC, privacidad, revisiones, copias y borrados', async () => {
  const db = new PGlite()
  const sql = readFileSync(new URL('../supabase/migrations/20261026190426_planificacion_semanal.sql', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
  async function rol(nombre, id = '') { await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${id}'; SET ROLE ${nombre};`) }
  async function guardar(s, revision = null) { return (await db.query('select public.guardar_planificacion_sesion($1::jsonb,$2::integer) as data', [JSON.stringify(prepararSesion(s)), revision])).rows[0].data }
  async function publicada(categoria = cat, id = jugadora) { return (await db.query('select public.planificacion_publica_hoy($1::uuid,$2::uuid) as data', [categoria,id])).rows[0].data }
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      create table public.categorias(id uuid primary key,nombre text);
      create table public.perfiles(email text primary key,rol text,categoria_id uuid references public.categorias);
      create table public.biblioteca(id uuid primary key,descripcion text);
      create table public.entrenamiento_bloques(id uuid primary key,fecha date,categoria_id uuid references public.categorias,descripcion text);
      create table public.jugadores(id uuid primary key,categoria_id uuid references public.categorias);
      create view public.jugadores_publico as select id,categoria_id from public.jugadores;
      insert into public.categorias values('${cat}','Primera'),('${otra}','Reserva');
      insert into auth.users values('${tecnico}','tecnico@test.invalid'),('${coord}','coord@test.invalid'),('${medico}','medico@test.invalid'),('${pf}','pf@test.invalid');
      insert into public.perfiles values('tecnico@test.invalid','tecnico','${cat}'),('coord@test.invalid','coordinacion',null),('medico@test.invalid','medico','${cat}'),('pf@test.invalid','preparador_fisico','${cat}');
      insert into public.jugadores values('${jugadora}','${cat}');
      insert into public.biblioteca values('${biblioteca}','Ejercicio real existente');
    `)
    await db.exec(sql)
    const dia = (await db.query("select to_char(now() at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') as dia")).rows[0].dia
    await db.exec(`insert into public.entrenamiento_bloques values('${real}','${dia}','${cat}','Carga ya registrada')`)
    const bloque = {...nuevoBloque(), nombre:'Gimnasio', visible:true, objetivo:'Fuerza', notas_internas:'SECRETO BLOQUE'}
    const ejercicio = {...nuevoEjercicio({id:biblioteca, contenido:'Sentadillas', descripcion:'Indicacion compartida'}), visible:true, notas_internas:'SECRETO TAREA'}
    bloque.ejercicios = [ejercicio, {...nuevoEjercicio(), nombre:'Tarea privada', visible:false}]
    let sesion = {...nuevaSesion(dia,cat), observaciones_internas:'SECRETO SESION', responsable:'INTERNO STAFF', bloques:[bloque], entrenamiento_real_id:real}
    await rol('authenticated',tecnico)
    sesion = await guardar(sesion)
    assert.equal(sesion.revision,1)
    assert.equal(sesion.creado_por,tecnico)
    assert.equal((await db.query('select * from public.planificacion_sesiones')).rows.length,1)
    await assert.rejects(db.exec("insert into public.planificacion_sesiones(categoria_id,fecha) values('"+cat+"',current_date)"), (e) => e.code==='42501')
    await assert.rejects(guardar({...nuevaSesion(dia,otra)}), (e)=>e.code==='42501')
    await rol('anon')
    assert.deepEqual(await publicada(),[])
    await assert.rejects(db.query('select * from public.planificacion_sesiones'),(e)=>e.code==='42501')
    await assert.rejects(db.query('select public.guardar_planificacion_sesion($1::jsonb,null)',[JSON.stringify(prepararSesion(sesion))]),(e)=>e.code==='42501')
    await assert.rejects(db.query('select planificacion_privado.bloques_publicos($1::jsonb)',[JSON.stringify(sesion.bloques)]),(e)=>e.code==='42501')
    await rol('authenticated',tecnico)
    const version1=sesion
    sesion=await guardar({...sesion,estado:'publicado'},sesion.revision)
    assert.equal(sesion.revision,2)
    await assert.rejects(guardar({...version1,objetivo:'No debe pisar datos'},1),(e)=>e.code==='40001')
    await assert.rejects(db.query('select public.eliminar_planificacion_sesion($1::uuid,1)',[sesion.id]),(e)=>e.code==='40001')
    await rol('anon')
    const visible=await publicada()
    assert.equal(visible.length,1)
    assert.equal(visible[0].bloques[0].ejercicios.length,1)
    assert.equal(visible[0].bloques[0].nombre,'Gimnasio')
    assert.doesNotMatch(JSON.stringify(visible),/SECRETO|INTERNO|notas_internas|observaciones_internas|Tarea privada|biblioteca_id/)
    assert.deepEqual(await publicada(otra),[])
    assert.deepEqual(await publicada(cat,coord),[])
    await rol('authenticated',medico)
    assert.equal((await db.query('select * from public.planificacion_sesiones')).rows.length,0)
    await assert.rejects(guardar(nuevaSesion(dia,cat)),(e)=>e.code==='42501')
    await rol('authenticated',pf)
    assert.equal((await db.query('select * from public.planificacion_sesiones')).rows.length,1)
    await assert.rejects(guardar(nuevaSesion(dia,otra)),(e)=>e.code==='42501')
    await rol('authenticated',coord)
    const otraSesion=await guardar(nuevaSesion(dia,otra))
    assert.equal(otraSesion.categoria_id,otra)
    await rol('authenticated',tecnico)
    await assert.rejects(guardar({...nuevaSesion(dia,cat),entrenamiento_real_id:coord}),(e)=>e.code==='23514')
    const futuro=await guardar({...nuevaSesion(sumarDias(dia,1),cat),estado:'publicado',bloques:sesion.bloques})
    const vacia=await guardar({...nuevaSesion(dia,cat),estado:'publicado',bloques:[{...nuevoBloque(),visible:true}]})
    await rol('anon')
    assert.equal((await publicada()).length,1,'ni el futuro ni un bloque vacío se muestran')
    await rol('authenticated',tecnico)
    sesion=await guardar({...sesion,estado:'borrador'},sesion.revision)
    await rol('anon')
    assert.deepEqual(await publicada(),[],'retirar publicación oculta todo')
    await rol('authenticated',tecnico)
    const origen=inicioSemana(dia),destino=sumarDias(origen,14)
    const copia=(await db.query('select public.copiar_planificacion_semana($1::uuid,$2::date,$3::date) as cantidad',[cat,origen,destino])).rows[0].cantidad
    assert.ok(copia>=2)
    const nuevas=(await db.query('select estado,revision,entrenamiento_real_id from public.planificacion_sesiones where fecha between $1::date and $1::date+6',[destino])).rows
    assert.equal(nuevas.length,copia)
    assert.ok(nuevas.every(s=>s.estado==='borrador'&&s.revision===1&&s.entrenamiento_real_id===null))
    await db.query('select public.eliminar_planificacion_sesion($1::uuid,$2::integer)',[futuro.id,futuro.revision])
    assert.equal((await db.query('select id from public.planificacion_sesiones where id=$1',[futuro.id])).rows.length,0)
    await rol('postgres')
    await db.exec(`delete from public.entrenamiento_bloques where id='${real}'`)
    const desvinculada=(await db.query('select entrenamiento_real_id,revision from public.planificacion_sesiones where id=$1',[sesion.id])).rows[0]
    assert.equal(desvinculada.entrenamiento_real_id,null)
    assert.equal(desvinculada.revision,sesion.revision+1)
    assert.ok(vacia.id)
  } finally { await db.close() }
})
