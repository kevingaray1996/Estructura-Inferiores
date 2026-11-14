// Etapa C de la pizarra: migración, verificación interna y reversión sobre el esquema real, en PostgreSQL WASM en memoria.
// No usa credenciales ni Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(pathToFileURL(process.env.PLANIFICACION_PG_PATH || join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const leer = r => readFileSync(new URL('../' + r, import.meta.url), 'utf8').replace(/^\uFEFF/, '')
const cambio = leer('supabase/migrations/20261114120000_pizarra_etapa_c.sql')
const reversion = leer('supabase/rollback/20261114120000_pizarra_etapa_c.sql')
const esquema = leer('supabase/esquema/esquema_real.sql')

const CAT = '10000000-0000-4000-8000-000000000001', RES = '10000000-0000-4000-8000-000000000002'
const U = { coord: 'a0000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002', pf: 'a0000000-0000-4000-8000-000000000003',
  med: 'a0000000-0000-4000-8000-000000000004', tecres: 'a0000000-0000-4000-8000-000000000005' }
const J = { a: 'b0000000-0000-4000-8000-000000000001', r: 'b0000000-0000-4000-8000-000000000002' }

async function crearBase({ medico = true } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create role supabase_admin;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users (id uuid primary key, email text, banned_until timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  // Storage como quedó después del cambio de Storage (ya aplicado en producción).
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    update storage.buckets set file_size_limit = 5242880, allowed_mime_types = '{image/*}' where id = 'Biblioteca';
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${RES}','Reserva',2,true);
    insert into auth.users (id, email) values ('${U.coord}','coord@club.test'),('${U.tec}','tec@club.test'),('${U.pf}','pf@club.test'),
      ('${U.med}','med@club.test'),('${U.tecres}','tecres@club.test');
    insert into public.perfiles (email, rol, categoria_id) values ('coord@club.test','coordinacion',null),('tec@club.test','tecnico','${CAT}'),
      ('pf@club.test','preparador_fisico','${CAT}'),('tecres@club.test','tecnico','${RES}') ${medico ? ",('med@club.test','medico',null)" : ''};
    insert into public.jugadores (id, nombre, apellido, categoria_id, tambien_reserva) values ('${J.a}','Ana','Uno','${CAT}',false),('${J.r}','Rita','Dos','${CAT}',true);
    insert into public.cmj (fecha, jugador_id, valor_cm) values ('2026-09-16','${J.a}',30),('2026-09-16','${J.r}',31);
    insert into public.entrenamiento_bloques (fecha, categoria_id, descripcion, duracion_minutos) values ('2026-09-18','${CAT}','Campo',90);
    insert into public.equipos (nombre) values ('Rival FC');`)
  return db
}

async function como(db, sub, email, sql) {
  await db.exec('BEGIN')
  try {
    if (sub) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, email, role: 'authenticated' })])
      await db.exec('SET LOCAL ROLE authenticated')
    } else await db.exec('SET LOCAL ROLE anon')
    return await db.query(sql)
  } finally { await db.exec('ROLLBACK') }
}

const FOTO = `
  select string_agg(linea, E'\\n' order by linea) as foto from (
    select format('pol %s.%s %s %s %s %s %s', schemaname, tablename, policyname, cmd, roles, qual, with_check) as linea from pg_policies
    union all select format('fn %s %s', p.oid::regprocedure, md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','pizarra_privado','planificacion_privado')
    union all select format('col %s.%s %s %s %s', table_schema, table_name, column_name, data_type, column_default) from information_schema.columns
      where table_schema in ('public','seguridad_privado')
    union all select format('con %s %s', conrelid::regclass, conname) from pg_constraint where connamespace = 'public'::regnamespace
    union all select format('grant %s %s %s', table_name, grantee, privilege_type) from information_schema.role_table_grants where table_schema = 'public'
  ) t`

test('etapa C: se aplica, verifica, es idempotente y la reversión vuelve exacto', async () => {
  const db = await crearBase()
  try {
    const antes = (await db.query(FOTO)).rows[0].foto
    const res = await db.exec(cambio)
    const resumen = res.at(-1).rows
    assert.equal(resumen.filter(r => r.que === 'carpeta').length, 14)
    await assert.rejects(db.exec(cambio), /ya se aplicó/)

    // Semáforo/Inicio del técnico: ve cmj y bloques de su categoría; el de Reserva ve las "también Reserva".
    assert.equal((await como(db, U.tec, 'tec@club.test', 'select count(*)::int n from public.cmj')).rows[0].n, 2)
    assert.equal((await como(db, U.tecres, 'tecres@club.test', 'select count(*)::int n from public.cmj')).rows[0].n, 1)
    assert.equal((await como(db, U.tecres, 'tecres@club.test', 'select count(*)::int n from public.entrenamiento_bloques')).rows[0].n, 1)
    assert.equal((await como(db, U.med, 'med@club.test', 'select count(*)::int n from public.cmj')).rows[0].n, 2)
    // Editor actual (sin campos nuevos) sigue guardando y no borra la carpeta.
    const nuevo = (await como(db, U.tec, 'tec@club.test', `select public.guardar_ejercicio_pizarra(null,null,'{"descripcion":"x","contenido":"Rondo"}') d`)).rows[0].d
    assert.equal(nuevo.ambito, 'cancha'); assert.equal(nuevo.pizarra_revision, 1); assert.equal(nuevo.creado_por, U.tec)
    // Wellness público sigue andando con un bloque de gimnasio.
    const hoy = (await db.query(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text f`)).rows[0].f
    await db.query(`insert into public.planificacion_sesiones (categoria_id, fecha, estado, bloques) values ($1, $2, 'publicado', $3)`, [CAT, hoy, JSON.stringify([
      { id: 'b', nombre: 'Gimnasio', visible: true, campos_publicos: [], objetivo: '', indicaciones: '', notas_internas: '', ambito: 'gimnasio',
        ejercicios: [{ id: 'e', nombre: 'Sentadilla', visible: true, campos_publicos: ['carga'], objetivo: '', indicaciones: '', notas_internas: 'NO',
          series: '', repeticiones: '', materiales: '', imagen_url: '', link_video: '', carga: '40 kg' }] }])])
    const pub = (await como(db, null, null, `select public.planificacion_publica_hoy('${CAT}','${J.a}') d`)).rows[0].d
    assert.deepEqual(pub[0].bloques, [{ nombre: 'Gimnasio', ambito: 'gimnasio', ejercicios: [{ nombre: 'Sentadilla', carga: '40 kg' }] }])
    await db.exec(`delete from public.planificacion_sesiones; delete from public.biblioteca`)

    await db.exec(reversion)
    assert.equal((await db.query(FOTO)).rows[0].foto, antes)
    // Y se puede volver a aplicar.
    await db.exec(cambio)
  } finally { await db.close() }
})

test('etapa C: sin médico se saltea su prueba; la reversión no corre si ya hay datos nuevos', async () => {
  const db = await crearBase({ medico: false })
  try {
    await db.exec(cambio)
    await db.exec(`insert into public.biblioteca (descripcion, ambito) values ('Plancha', 'gimnasio')`)
    await assert.rejects(db.exec(reversion), /ejercicios de Gimnasio/)
    await db.exec(`delete from public.biblioteca; update public.equipos set color_camiseta = '#112233'`)
    await assert.rejects(db.exec(reversion), /colores de equipos/)
  } finally { await db.close() }
})

test('etapa C: no corre si las políticas no son las auditadas', async () => {
  const db = await crearBase()
  try {
    await db.exec(`create policy extra on public.cmj for select to anon using (true)`)
    await assert.rejects(db.exec(cambio), /no son las auditadas/)
    assert.equal((await db.query(`select count(*)::int n from information_schema.columns where table_name = 'biblioteca' and column_name = 'ambito'`)).rows[0].n, 0)
  } finally { await db.close() }
})

test('los dos archivos son un solo DO más un SELECT final', () => {
  for (const sql of [cambio, reversion]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i)
  }
})

test('etapa C: la base devuelve igual una pizarra v2 armada por la app (etapa I)', async () => {
  const { agregarElemento, alternarFoco, alternarOcultos, copiarPaso, nuevaPizarra, validarPizarra } = await import('../src/utils/pizarra.js')
  let d = nuevaPizarra()
  for (const tipo of ['jugadora', 'jugadora', 'pelota', 'sombra', 'pase', 'cono']) d = agregarElemento(d, tipo, 40, 40)
  d = copiarPaso(d, 0)
  const [j, r, , z] = d.elementos.map(e => e.id)
  d = alternarOcultos(alternarFoco(d, 1, j), 0, [z])
  d = { ...d, recorrido: 'recto', placa: { titulo: 'Córner a favor', analista: 'Cuerpo técnico' },
    elementos: d.elementos.map(e => e.id === r ? { ...e, vinculo: { tipo: 'rival', id: crypto.randomUUID() } } : e),
    pasos: d.pasos.map((p, i) => i === 1 ? { ...p, texto: 'Centro al segundo palo', pausa: 1.5, pase: 'alto' } : p) }
  const limpio = validarPizarra(d)
  const db = await crearBase()
  try {
    await db.exec(cambio)
    const deLaBase = (await db.query('select pizarra_privado.validar($1::jsonb) d', [JSON.stringify(limpio)])).rows[0].d
    assert.deepEqual(deLaBase, limpio)
  } finally { await db.close() }
})
