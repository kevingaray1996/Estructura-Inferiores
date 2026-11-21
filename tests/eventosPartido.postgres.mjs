// Análisis 2C: tabla de eventos del partido (marcas de tiempo, cambios, goles y tarjetas), su reversión y su
// verificación. Sobre el esquema real con la etapa C de la pizarra y la etapa 1 de cuentas de jugadoras, en
// PostgreSQL WASM en memoria. Nunca toca la base real.
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
const cambio = leer('supabase/migrations/20261121120000_eventos_partido_analisis.sql')
const reversion = leer('supabase/rollback/20261121120000_eventos_partido_analisis.sql')
const verificacion = leer('supabase/verification/20261121_eventos_partido_analisis.sql')

const CAT = '10000000-0000-4000-8000-000000000001', SUB16 = '10000000-0000-4000-8000-000000000003'
// Las dos cuentas administradoras de Análisis del esquema real (puede_administrar_analisis), la técnica de la
// categoría del partido, la técnica de otra categoría y la preparadora física.
const U = { admin: '00000000-0000-4000-8000-000000000001', admin2: '00000000-0000-4000-8000-000000000002', tec: 'a0000000-0000-4000-8000-000000000002',
  tec16: 'a0000000-0000-4000-8000-000000000003', pf: 'a0000000-0000-4000-8000-000000000004' }
const MAIL = { admin: 'admin@club.test', admin2: 'admin2@club.test', tec: 'tec@club.test', tec16: 'tec16@club.test', pf: 'pf@club.test' }
const J1 = 'b0000000-0000-4000-8000-000000000001', J2 = 'b0000000-0000-4000-8000-000000000002'
const P = 'c0000000-0000-4000-8000-000000000001'

async function crearBase({ conAdmin = true } = {}) {
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
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  // Sin las cuentas administradoras queda igual una coordinadora (la piden las migraciones previas), que no administra Análisis.
  const admins = conAdmin ? `('${U.admin}', '${MAIL.admin}'), ('${U.admin2}', '${MAIL.admin2}'),` : `('a0000000-0000-4000-8000-000000000001', 'coord@club.test'),`
  const perfiles = conAdmin ? `('${MAIL.admin}','Admin','coordinacion',null), ('${MAIL.admin2}','Admin 2','coordinacion',null),` : `('coord@club.test','Coordinadora','coordinacion',null),`
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${SUB16}','Sub 16',3,false);
    insert into auth.users (id, email) values ${admins} ('${U.tec}', '${MAIL.tec}'), ('${U.tec16}', '${MAIL.tec16}'), ('${U.pf}', '${MAIL.pf}');
    insert into public.perfiles (email, nombre, rol, categoria_id) values ${perfiles} ('${MAIL.tec}','Técnica','tecnico','${CAT}'),
      ('${MAIL.tec16}','Técnica Sub 16','tecnico','${SUB16}'), ('${MAIL.pf}','Preparadora','preparador_fisico',null);
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.jugadores (id, nombre, apellido, categoria_id) values ('${J1}','Ana','Alvarez','${CAT}'), ('${J2}','Bea','Benitez','${CAT}');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('${P}', '${CAT}', 'Rival');`)
  await db.exec(etapaC)
  await db.exec(etapa1)
  return db
}

async function como(db, quien, sql, params, { rol = 'authenticated', confirmar = false } = {}) {
  await db.exec('BEGIN')
  try {
    const claims = rol === 'anon' ? { role: 'anon' } : { sub: U[quien], email: MAIL[quien], role: 'authenticated' }
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await db.exec(`SET LOCAL ROLE ${rol}`)
    const r = await db.query(sql, params)
    await db.exec(confirmar ? 'COMMIT' : 'ROLLBACK')
    return r
  } catch (e) { await db.exec('ROLLBACK'); throw e }
}
const hacer = (db, quien, sql, params) => como(db, quien, sql, params, { confirmar: true })
const codigo = (c, msg) => e => { assert.equal(e.code, c, e.message); if (msg) assert.match(e.message, msg); return true }
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)

test('un solo DO en migración, reversión y verificación, con lock_timeout y sin BEGIN/COMMIT ni tablas temporales', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion], ['verificación', verificacion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
    assert.match(sinComentarios, /set_config\('lock_timeout', '5s', true\)/, nombre)
  }
  for (const sql of [cambio, reversion]) assert.match(sql, /pg_notify\('pgrst', 'reload schema'\)/)
})

test('se aplica, se prueba sola sin dejar datos y no se aplica dos veces', async () => {
  const db = await crearBase()
  const r = await db.exec(cambio)
  assert.equal(r.at(-1).rows[0].tabla, 'analisis_partido_eventos')
  assert.equal(r.at(-1).rows[0].rls_forzada, true)
  assert.match(r.at(-1).rows[0].reglas, /sin_cuentas_jugadoras \(RESTRICTIVE, ALL\)/)
  assert.equal(await n(db, 'select count(*) n from public.analisis_partido_eventos'), 0)
  assert.equal(await n(db, `select count(*) n from public.analisis_partidos where rival like 'Prueba de eventos%'`), 0)
  // La prueba interna corre con otra cuenta del staff (acá, la preparadora física): si no viera los eventos del
  // partido de prueba o pudiera modificarlos, la migración no se habría aplicado.
  await assert.rejects(db.exec(cambio), /Ya estaba aplicada/)
  await db.exec(verificacion)
})

test('la prueba interna frena la migración si el resto del staff no viera los eventos', async () => {
  const db = await crearBase()
  // Misma migración, pero con la regla de ver solo para administradoras.
  const soloAdmin = cambio.replace(
    /USING \(\(SELECT public\.puede_administrar_analisis\(\)\)\n\s+OR EXISTS \(SELECT 1 FROM public\.analisis_partidos a WHERE a\.id = analisis_partido_eventos\.partido_id\)\);/,
    'USING ((SELECT public.puede_administrar_analisis()));')
  assert.notEqual(soloAdmin, cambio)
  await assert.rejects(db.exec(soloAdmin), /otra cuenta del staff: ve 0 eventos del partido de prueba y tendría que ver 6/)
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'analisis_partido_eventos'`), 0)
})

test('sin cuenta administradora para probar, no aplica nada', async () => {
  const db = await crearBase({ conAdmin: false })
  await assert.rejects(db.exec(cambio), /No se encontró una cuenta administradora/)
  assert.equal(await n(db, `select count(*) n from pg_class where relname = 'analisis_partido_eventos'`), 0)
})

test('ver como las acciones de Análisis; cargar, editar y borrar solo las administradoras', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  await hacer(db, 'admin', `insert into public.analisis_partido_eventos (partido_id, tipo, segundo) values ($1, 'inicio_1t', 30)`, [P])
  const ver = async (quien) => (await como(db, quien, `select count(*)::int n from public.analisis_partido_eventos`)).rows[0].n
  assert.deepEqual((await como(db, 'admin2', `select creado_por, segundo from public.analisis_partido_eventos`)).rows, [{ creado_por: U.admin, segundo: 30 }])
  // Sin acciones etiquetadas, el partido analizado no lo ve el resto del staff, y tampoco sus eventos.
  for (const quien of ['tec', 'tec16', 'pf']) assert.equal(await ver(quien), 0, quien)
  // Con una acción de una jugadora de Primera: la ven la técnica de Primera y la preparadora física, no la de Sub 16.
  await hacer(db, 'admin', `insert into public.analisis_eventos (partido_id, jugador_id, tipo, segundo) values ($1, $2, 'Remate', 10)`, [P, J1])
  assert.equal(await ver('tec'), 1)
  assert.equal(await ver('pf'), 1)
  assert.equal(await ver('tec16'), 0)
  // Ver no es modificar: nadie del staff fuera de las administradoras carga, edita ni borra.
  for (const quien of ['tec', 'pf', 'tec16']) {
    await assert.rejects(como(db, quien, `insert into public.analisis_partido_eventos (partido_id, tipo, segundo) values ($1, 'fin_1t', 30)`, [P]), codigo('42501'), quien)
    assert.equal((await como(db, quien, `update public.analisis_partido_eventos set segundo = 1`)).affectedRows, 0, quien)
    assert.equal((await como(db, quien, `delete from public.analisis_partido_eventos`)).affectedRows, 0, quien)
  }
  await assert.rejects(como(db, null, `select * from public.analisis_partido_eventos`, [], { rol: 'anon' }), codigo('42501'))
  // Cuentas de jugadoras: la red RESTRICTIVE sigue (no ven nada aunque vieran a la jugadora).
  const politica = (await db.query(`select qual from pg_policies where tablename = 'analisis_partido_eventos' and policyname = 'sin_cuentas_jugadoras' and permissive = 'RESTRICTIVE'`)).rows
  assert.match(politica[0].qual, /es_cuenta_jugadora/)
})

test('reglas de los datos: marca única, cambio, gol, tarjeta y borrado en cascada', async () => {
  const db = await crearBase()
  await db.exec(cambio)
  const insertar = (sql, params = []) => hacer(db, 'admin', `insert into public.analisis_partido_eventos ${sql}`, params)
  await insertar(`(partido_id, tipo, segundo) values ($1, 'inicio_1t', 30)`, [P])
  await assert.rejects(insertar(`(partido_id, tipo, segundo) values ($1, 'inicio_1t', 50)`, [P]), codigo('23505'))
  await insertar(`(partido_id, tipo, segundo, jugadora_sale, jugadora_entra) values ($1, 'cambio', 900, $2, $3)`, [P, J1, J2])
  await insertar(`(partido_id, tipo, segundo, jugadora_sale, jugadora_entra) values ($1, 'cambio', 950, $2, $3)`, [P, J2, J1])
  await assert.rejects(insertar(`(partido_id, tipo, segundo, jugadora_sale, jugadora_entra) values ($1, 'cambio', 990, $2, $2)`, [P, J1]), codigo('23514'))
  await assert.rejects(insertar(`(partido_id, tipo, segundo, jugadora_sale) values ($1, 'cambio', 990, $2)`, [P, J1]), codigo('23514'))
  await assert.rejects(insertar(`(partido_id, tipo, segundo, jugadora_sale, jugadora_entra) values ($1, 'inicio_2t', 990, $2, $3)`, [P, J1, J2]), codigo('23514'))
  await insertar(`(partido_id, tipo, segundo, equipo, jugador_id) values ($1, 'gol', 1000, 'propio', $2)`, [P, J1])
  await insertar(`(partido_id, tipo, segundo, equipo) values ($1, 'gol', 1100, 'rival')`, [P])
  await assert.rejects(insertar(`(partido_id, tipo, segundo, equipo, jugador_id) values ($1, 'gol', 1200, 'rival', $2)`, [P, J1]), codigo('23514'))
  await assert.rejects(insertar(`(partido_id, tipo, segundo) values ($1, 'gol', 1200)`, [P]), codigo('23514'))
  await insertar(`(partido_id, tipo, segundo, equipo, tarjeta) values ($1, 'tarjeta', 1300, 'propio', 'roja')`, [P])
  await assert.rejects(insertar(`(partido_id, tipo, segundo, equipo) values ($1, 'tarjeta', 1300, 'propio')`, [P]), codigo('23514'))
  await assert.rejects(insertar(`(partido_id, tipo, segundo) values ($1, 'medio', 10)`, [P]), codigo('23514'))
  await assert.rejects(insertar(`(partido_id, tipo, segundo) values ($1, 'fin_1t', -1)`, [P]), codigo('23514'))
  // No se pasa a otro análisis; editar el segundo sí, y conserva quién lo creó.
  await assert.rejects(hacer(db, 'admin2', `update public.analisis_partido_eventos set partido_id = gen_random_uuid() where tipo = 'inicio_1t'`), codigo('22023'))
  await hacer(db, 'admin2', `update public.analisis_partido_eventos set segundo = 35, creado_por = $1 where tipo = 'inicio_1t'`, [U.admin2])
  assert.equal((await db.query(`select creado_por from public.analisis_partido_eventos where tipo = 'inicio_1t'`)).rows[0].creado_por, U.admin)
  assert.equal(await n(db, 'select count(*) n from public.analisis_partido_eventos'), 6)
  await hacer(db, 'admin', `delete from public.analisis_partidos where id = $1`, [P])
  assert.equal(await n(db, 'select count(*) n from public.analisis_partido_eventos'), 0)
})

test('reversión: no corre si hay eventos; sin eventos borra todo y se puede volver a aplicar', async () => {
  const db = await crearBase()
  await assert.rejects(db.exec(reversion), /No hay respaldo/)
  await db.exec(cambio)
  await hacer(db, 'admin', `insert into public.analisis_partido_eventos (partido_id, tipo, segundo) values ($1, 'inicio_1t', 30)`, [P])
  await assert.rejects(db.exec(reversion), /Hay 1 eventos del partido cargados/)
  assert.equal(await n(db, 'select count(*) n from public.analisis_partido_eventos'), 1)
  await db.exec(`delete from public.analisis_partido_eventos`)
  await db.exec(reversion)
  assert.equal(await n(db, `select count(*) n from pg_class where relname in ('analisis_partido_eventos', 'respaldo_eventos_partido')`), 0)
  assert.equal(await n(db, `select count(*) n from pg_proc where proname = 'sellar_evento_partido'`), 0)
  await assert.rejects(db.exec(verificacion), /Falta la tabla/)
  await db.exec(cambio)
  await db.exec(verificacion)
})
