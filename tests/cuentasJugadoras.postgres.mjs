// Cuentas de jugadoras (etapa 1): migración, verificación interna y reversión sobre el esquema real con la etapa C
// aplicada (como está producción), en PostgreSQL WASM en memoria. No usa credenciales ni Supabase.
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
const cambio = leer('supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql')
const reversion = leer('supabase/rollback/20261116120000_cuentas_jugadoras_etapa1.sql')

const CAT = '10000000-0000-4000-8000-000000000001', RES = '10000000-0000-4000-8000-000000000002', SUB16 = '10000000-0000-4000-8000-000000000003'
// coord usa el primer marcador de puede_administrar_analisis(): así también se prueba el camino de administración de Análisis.
const U = { coord: '00000000-0000-4000-8000-000000000001', tec: 'a0000000-0000-4000-8000-000000000002', pf: 'a0000000-0000-4000-8000-000000000003',
  med: 'a0000000-0000-4000-8000-000000000004', nadie: 'a0000000-0000-4000-8000-0000000000ff',
  ana: 'c0000000-0000-4000-8000-000000000001', bea: 'c0000000-0000-4000-8000-000000000002', otro: 'c0000000-0000-4000-8000-000000000003' }
const MAIL = { coord: 'coord@club.test', tec: 'tec@club.test', pf: 'pf@club.test', med: 'med@club.test', nadie: 'nadie@club.test',
  ana: 'ana@jugadoras.test', bea: 'bea@jugadoras.test', otro: 'otro@jugadoras.test' }
const J = { ana: 'b0000000-0000-4000-8000-000000000001', bea: 'b0000000-0000-4000-8000-000000000002', rita: 'b0000000-0000-4000-8000-000000000003' }
const STAFF = ['coord', 'tec', 'pf', 'med']
const ABIERTAS = ['analisis_tipos_accion', 'categorias', 'datafem_tablas', 'evaluacion_criterios']
const HOY = `(now() at time zone 'America/Argentina/Buenos_Aires')::date`

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
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;`)
  await db.exec(esquema.split('\n').filter(l => !l.startsWith('CREATE EXTENSION')).join('\n').replaceAll(' MAINTAIN,', ''))
  // Storage como quedó después del cambio de Storage, y datos para la etapa C y para esta etapa.
  await db.exec(`
    drop policy "Biblioteca select autenticados" on storage.objects; drop policy "Biblioteca insert autenticados" on storage.objects;
    drop policy "Biblioteca update autenticados" on storage.objects; drop policy "Biblioteca delete autenticados" on storage.objects;
    CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')));
    insert into public.categorias (id, nombre, orden, es_reserva) values ('${CAT}','Primera División',1,false), ('${RES}','Reserva',2,true), ('${SUB16}','Sub 16',3,false);
    insert into auth.users (id, email, last_sign_in_at) values ('${U.coord}','${MAIL.coord}',null),('${U.tec}','${MAIL.tec}',null),('${U.pf}','${MAIL.pf}',null),
      ('${U.med}','${MAIL.med}',null),('${U.nadie}','${MAIL.nadie}',null),('${U.ana}','${MAIL.ana}','2026-11-10 12:00:00+00'),
      ('${U.bea}','${MAIL.bea}',null),('${U.otro}','${MAIL.otro}',null);
    insert into public.perfiles (email, rol, categoria_id) values ('${MAIL.coord}','coordinacion',null),('${MAIL.tec}','tecnico','${CAT}'),
      ('${MAIL.pf}','preparador_fisico','${CAT}'),('${MAIL.med}','medico',null);
    insert into public.jugadores (id, nombre, apellido, foto_url, categoria_id) values ('${J.ana}','Ana','Alvarez','/ana.jpg','${CAT}'),
      ('${J.bea}','Bea','Benitez',null,'${CAT}'),('${J.rita}','Rita','Ruiz',null,'${SUB16}');
    insert into public.partidos (id, categoria_id, rival, fecha) values
      ('d0000000-0000-4000-8000-000000000001','${CAT}','Rival A','2026-03-01'),('d0000000-0000-4000-8000-000000000002','${CAT}','Rival B','2026-04-01'),
      ('d0000000-0000-4000-8000-000000000003','${CAT}','Rival C','2026-05-01'),('d0000000-0000-4000-8000-000000000004','${CAT}','Rival D','2025-05-01');
    insert into public.estadisticas_jugador (jugador_id, partido_id, minutos_jugados, titular) values
      ('${J.ana}','d0000000-0000-4000-8000-000000000001',90,true),('${J.ana}','d0000000-0000-4000-8000-000000000002',45,true),
      ('${J.ana}','d0000000-0000-4000-8000-000000000003',10,false),('${J.ana}','d0000000-0000-4000-8000-000000000004',80,true),
      ('${J.bea}','d0000000-0000-4000-8000-000000000001',30,false);
    insert into public.asistencias (fecha, jugador_id, estado) values
      ('2026-02-01','${J.ana}','presente'),('2026-02-02','${J.ana}','presente'),('2026-02-03','${J.ana}','presente'),('2026-02-04','${J.ana}','presente'),
      ('2026-02-05','${J.ana}','tarde'),('2026-02-06','${J.ana}','ausente'),('2026-02-07','${J.ana}','ausente'),
      ('2026-02-08','${J.ana}','lesionado'),('2026-02-09','${J.ana}','enfermo'),('2025-02-01','${J.ana}','ausente');
    insert into public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar) values ('${J.ana}', ${HOY} - 1, 3, 3, 3, 3, 3);
    insert into public.sesiones_fisicas (jugador_id, fecha, tipo, rpe, minutos) values ('${J.ana}', ${HOY} - 1, 'entrenamiento', 6, 80);
    insert into public.cmj (fecha, jugador_id, valor_cm) values ('2026-09-16','${J.ana}',30),('2026-09-16','${J.bea}',31);
    insert into public.entrenamiento_bloques (fecha, categoria_id, descripcion, duracion_minutos) values ('2026-09-18','${CAT}','Campo',90);
    insert into public.equipos (nombre) values ('Rival FC');
    insert into public.datafem_tablas (id) values (1);
    insert into public.evaluacion_criterios (nombre) values ('Técnica');
    insert into public.evaluaciones (jugador_id, evaluador_id, periodo, puntajes) values ('${J.ana}','${U.coord}','2026-1','{"tecnica":4}');
    insert into public.fichas_medicas (jugador_id, fecha, descripcion) values ('${J.ana}','2026-06-01','Esguince');
    insert into public.analisis_tipos_accion (codigo, etiqueta, etiqueta_boton, ubicacion, grupo) values ('Remate','Remate','Remate','opcional','ofensiva');
    insert into public.analisis_partidos (id, categoria_id, rival) values ('e0000000-0000-4000-8000-000000000001','${CAT}','Rival A');
    insert into public.analisis_eventos (partido_id, jugador_id, tipo) values ('e0000000-0000-4000-8000-000000000001','${J.ana}','Remate');`)
  // Producción ya tiene la etapa C.
  await db.exec(etapaC)
  return db
}

// Corre una consulta como un usuario y deshace todo. rol: 'authenticated' (con sub y email), 'anon' o 'service_role'.
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
const comoServicio = (db, sql, params) => como(db, null, sql, params, { rol: 'service_role', confirmar: true })
const registrar = (db, jugador, usuario, email) =>
  comoServicio(db, 'select public.cuentas_jugadoras_registrar($1, $2, $3, $4)', [jugador, usuario, email, U.coord])
const codigo = c => e => { assert.equal(e.code, c, e.message); return true }

// Todas las tablas y vistas de public.
const relaciones = async db => (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f') order by 1`)).rows.map(r => r.relname)

// Cuántas filas ve un usuario en cada tabla y vista (o el código de error).
async function cantidades(db, quien) {
  const salida = {}
  for (const t of await relaciones(db)) {
    try { salida[t] = (await como(db, quien, `select count(*)::int as n from public.${t}`)).rows[0].n } catch (e) { salida[t] = e.code }
  }
  return salida
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

test('un solo DO en migración y reversión', () => {
  for (const [nombre, sql] of [['migración', cambio], ['reversión', reversion]]) {
    const sinComentarios = sql.replace(/--[^\n]*/g, '')
    assert.equal((sinComentarios.match(/^DO \$/gm) || []).length, 1, nombre)
    assert.doesNotMatch(sinComentarios, /^\s*(BEGIN|COMMIT)\s*;/mi, nombre)
    assert.doesNotMatch(sinComentarios, /TEMP(ORARY)? TABLE/i, nombre)
  }
})

test('cuentas de jugadoras: cierre, portal, permisos y reversión', async t => {
  const db = await crearBase()
  try {
    const antes = await foto(db)
    const staffAntes = {}
    for (const s of STAFF) staffAntes[s] = await cantidades(db, s)
    const sinRolAntes = {}
    for (const tabla of ABIERTAS) sinRolAntes[tabla] = (await como(db, 'nadie', `select count(*)::int n from public.${tabla}`)).rows[0].n

    const res = await db.exec(cambio)
    assert.ok(res.at(-1).rows.length > 0, 'el SELECT final devuelve el resumen')
    await assert.rejects(db.exec(cambio), /ya se aplicó/)
    // La verificación interna no dejó nada.
    assert.equal((await db.query('select count(*)::int n from public.cuentas_jugadoras')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n, 8)
    assert.equal((await db.query(`select to_regprocedure('seguridad_privado.cuentas_jugadoras_contar(uuid,text)') is null v`)).rows[0].v, true, 'el ayudante se borró')
    assert.equal((await db.query(`select count(*)::int n from pg_policies where policyname = 'prueba_abierta_por_error'`)).rows[0].n, 0)

    await registrar(db, J.ana, U.ana, ' Ana@Jugadoras.test ')
    await registrar(db, J.bea, U.bea, MAIL.bea)
    assert.equal((await db.query(`select email from public.cuentas_jugadoras where jugador_id = $1`, [J.ana])).rows[0].email, MAIL.ana)

    // Antes de que la jugadora cargue nada por el portal: con cuentas creadas, el staff ve exactamente lo mismo.
    await t.test('staff igual que antes', async () => {
      for (const s of STAFF) {
        const despues = await cantidades(db, s)
        for (const [tabla, n] of Object.entries(staffAntes[s])) assert.equal(despues[tabla], n, `${s} en ${tabla}`)
        assert.equal(despues.cuentas_jugadoras, '42501', `${s} no lee cuentas_jugadoras`)
        assert.ok(Object.values(despues).some(n => typeof n === 'number' && n > 0), `${s} ve algo`)
      }
    })

    await t.test('jugadora no ve ninguna tabla', async () => {
      assert.ok((await db.query(`select count(*)::int n from public.analisis_eventos where jugador_id = '${J.ana}'`)).rows[0].n > 0)
      const vistas = await cantidades(db, 'ana')
      assert.ok(Object.keys(vistas).length > 30, 'recorre todas las tablas y vistas')
      for (const [tabla, n] of Object.entries(vistas)) assert.ok(n === 0 || n === '42501', `${tabla}: ${n}`)
      await assert.rejects(como(db, 'ana', `insert into public.bienestar (jugador_id, fecha, sueno) values ('${J.ana}', ${HOY} + 1, 3)`), codigo('42501'))
      // Si una migración futura abre algo por error, la red RESTRICTIVE igual frena a la cuenta (y no a los demás).
      await db.exec(`create policy abierta_por_error on public.jugadores for all to authenticated using (true) with check (true)`)
      try {
        assert.equal((await como(db, 'nadie', 'select count(*)::int n from public.jugadores')).rows[0].n, 3)
        assert.equal((await como(db, 'ana', 'select count(*)::int n from public.jugadores')).rows[0].n, 0)
        assert.equal((await como(db, 'ana', 'select count(*)::int n from public.analisis_eventos')).rows[0].n, 0)
        await assert.rejects(como(db, 'ana', `insert into public.jugadores (nombre, apellido, categoria_id) values ('X', 'Y', '${CAT}')`), codigo('42501'))
        assert.equal((await como(db, 'ana', `update public.jugadores set nombre = 'X' where id = '${J.ana}' returning id`)).rows.length, 0)
      } finally { await db.exec('drop policy abierta_por_error on public.jugadores') }
    })

    await t.test('jugadora ve sus números', async () => {
      const n = await valor(db, 'ana', 'public.portal_mis_numeros(2026)')
      assert.deepEqual(n.anios, [2026, 2025])
      assert.equal(n.anio, 2026)
      assert.deepEqual(n.partidos, { jugados: 3, titularidades: 2, minutos: 145 })
      assert.deepEqual(n.asistencia, { presentes: 4, tardes: 1, ausentes: 2, justificadas: 2, total: 9, porcentaje: 56 })
      const anioActual = (await db.query(`select extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::int a`)).rows[0].a
      assert.equal((await valor(db, 'ana', 'public.portal_mis_numeros()')).anio, anioActual)
      assert.deepEqual(await valor(db, 'ana', 'public.portal_mi_perfil()'), { nombre: 'Ana', apellido: 'Alvarez', foto_url: '/ana.jpg', categoria: 'Primera División' })
      assert.deepEqual(await valor(db, 'ana', 'public.portal_entrenamiento_hoy()'), [])
    })

    await t.test('sin registros', async () => {
      const n = await valor(db, 'bea', 'public.portal_mis_numeros(2026)')
      assert.equal(n.asistencia.total, 0)
      assert.equal(n.asistencia.porcentaje, null)
      assert.deepEqual(n.partidos, { jugados: 1, titularidades: 0, minutos: 30 })
    })

    await t.test('wellness y rpe por la cuenta', async () => {
      assert.equal(await valor(db, 'ana', 'public.portal_wellness_respondio()'), false)
      await como(db, 'ana', 'select public.portal_wellness_guardar(4,3,3,2,5)', [], { confirmar: true })
      const fila = (await db.query(`select sueno, dolor_muscular, fatiga, estres, animo_entrenar from public.bienestar where jugador_id = $1 and fecha = ${HOY}`, [J.ana])).rows
      assert.deepEqual(fila, [{ sueno: 4, dolor_muscular: 3, fatiga: 3, estres: 2, animo_entrenar: 5 }])
      assert.equal(await valor(db, 'ana', 'public.portal_wellness_respondio()'), true)
      assert.equal(await valor(db, 'bea', 'public.portal_wellness_respondio()'), false)
      await como(db, 'ana', `select public.portal_rpe_guardar(${HOY}, 'entrenamiento', 8)`, [], { confirmar: true })
      assert.equal((await db.query(`select rpe from public.sesiones_fisicas where jugador_id = $1 and fecha = ${HOY}`, [J.ana])).rows[0].rpe, 8)
      await assert.rejects(como(db, 'ana', `select public.portal_rpe_guardar(${HOY} - 4, 'entrenamiento', 7)`), codigo('22023'))
    })

    await t.test('cambio de categoría', async () => {
      await db.exec(`update public.jugadores set categoria_id = '${SUB16}' where id = '${J.ana}'`)
      await como(db, 'ana', 'select public.portal_wellness_guardar(5,5,5,5,5, $1, $2)', ['rodilla', 'lutea'], { confirmar: true })
      assert.equal((await db.query(`select sueno from public.bienestar where jugador_id = $1 and fecha = ${HOY}`, [J.ana])).rows[0].sueno, 5)
      assert.equal(await valor(db, 'ana', 'public.portal_wellness_respondio()'), true)
      assert.equal((await valor(db, 'ana', 'public.portal_mi_perfil()')).categoria, 'Sub 16')
      await db.exec(`update public.jugadores set categoria_id = '${CAT}' where id = '${J.ana}'`)
    })

    await t.test('mails cruzados', async () => {
      await assert.rejects(db.exec(`insert into public.perfiles (email, rol) values (' ANA@jugadoras.test', 'tecnico')`), codigo('23505'))
      await assert.rejects(db.exec(`update public.perfiles set email = '${MAIL.ana}' where email = '${MAIL.tec}'`), codigo('23505'))
      await assert.rejects(registrar(db, J.rita, U.tec, 'TEC@club.test'), e => e.code === '23505' && /email_en_uso/.test(e.message))
      await assert.rejects(registrar(db, J.rita, U.otro, MAIL.ana), e => e.code === '23505' && /email_en_uso/.test(e.message))
      await assert.rejects(registrar(db, J.ana, U.otro, MAIL.otro), e => e.code === '23505' && /ya_tiene_cuenta/.test(e.message))
      await assert.rejects(registrar(db, '00000000-0000-4000-8000-00000000abcd', U.otro, MAIL.otro), e => e.code === 'P0002' && /jugadora_inexistente/.test(e.message))
      // El usuario de Auth tiene que ser el del mail: ni uno del staff con un mail libre, ni uno que no existe.
      await assert.rejects(registrar(db, J.rita, U.tec, MAIL.otro), e => e.code === '22023' && /usuario_no_coincide/.test(e.message))
      await assert.rejects(registrar(db, J.rita, '00000000-0000-4000-8000-00000000dead', MAIL.otro), e => e.code === '22023' && /usuario_no_coincide/.test(e.message))
      // Si la jugadora cambia su mail en Auth, el mail nuevo tampoco puede ser de un perfil del staff.
      await db.exec(`update auth.users set email = 'ana.nueva@jugadoras.test' where id = '${U.ana}'`)
      try {
        await assert.rejects(db.exec(`insert into public.perfiles (email, rol) values ('Ana.Nueva@jugadoras.test', 'tecnico')`),
          e => e.code === '23505' && /email_en_uso/.test(e.message))
        await assert.rejects(db.exec(`update public.perfiles set email = 'ana.nueva@jugadoras.test' where email = '${MAIL.tec}'`), codigo('23505'))
      } finally { await db.exec(`update auth.users set email = '${MAIL.ana}' where id = '${U.ana}'`) }
      await assert.rejects(como(db, 'coord', `select public.cuentas_jugadoras_registrar('${J.rita}', '${U.otro}', '${MAIL.otro}', '${U.coord}')`), codigo('42501'))
      assert.equal((await db.query('select count(*)::int n from public.cuentas_jugadoras')).rows[0].n, 2)
    })

    await t.test('solo coordinación lista', async () => {
      const lista = await valor(db, 'coord', `public.cuentas_jugadoras_listar('${CAT}')`)
      assert.deepEqual(lista.map(j => [j.nombre, j.email, j.activa]), [['Ana', MAIL.ana, true], ['Bea', MAIL.bea, true]])
      assert.equal(new Date(lista[0].ultimo_ingreso).toISOString(), '2026-11-10T12:00:00.000Z')
      assert.equal(lista[1].ultimo_ingreso, null)
      const sub16 = await valor(db, 'coord', `public.cuentas_jugadoras_listar('${SUB16}')`)
      assert.deepEqual(sub16, [{ jugador_id: J.rita, nombre: 'Rita', apellido: 'Ruiz', foto_url: null, email: null, activa: null, ultimo_ingreso: null }])
      for (const quien of ['tec', 'pf', 'med', 'nadie', 'ana']) {
        await assert.rejects(como(db, quien, `select public.cuentas_jugadoras_listar('${CAT}')`), codigo('42501'), quien)
      }
    })

    await t.test('anon', async () => {
      for (const sql of ['select public.portal_mi_perfil()', `select public.cuentas_jugadoras_listar('${CAT}')`]) {
        await assert.rejects(como(db, null, sql, [], { rol: 'anon' }), codigo('42501'), sql)
      }
      const funcionesAnon = (await db.query(`select string_agg(p.proname, ',' order by p.proname) f from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows[0].f
      assert.equal(funcionesAnon, 'planificacion_publica_hoy,rpe_publico_guardar,wellness_publico_categoria,wellness_publico_guardar,wellness_publico_respondio')
      assert.equal((await db.query(`select has_schema_privilege('anon', 'portal_privado', 'USAGE') v`)).rows[0].v, false)
    })

    await t.test('logueado sin rol', async () => {
      for (const tabla of ABIERTAS) {
        assert.ok(sinRolAntes[tabla] > 0, `${tabla} tenía filas visibles antes`)
        assert.equal((await como(db, 'nadie', `select count(*)::int n from public.${tabla}`)).rows[0].n, 0, tabla)
      }
    })

    await t.test('cuenta desactivada', async () => {
      assert.equal((await comoServicio(db, `select public.cuentas_jugadoras_estado('${J.ana}', false) u`)).rows[0].u, U.ana)
      for (const sql of ['public.portal_mi_perfil()', 'public.portal_mis_numeros()', 'public.portal_mis_numeros(2026)', 'public.portal_wellness_respondio()',
        'public.portal_wellness_guardar(3,3,3,3,3)', `public.portal_rpe_guardar(${HOY}, 'entrenamiento', 5)`, 'public.portal_entrenamiento_hoy()']) {
        await assert.rejects(como(db, 'ana', `select ${sql}`), e => e.code === '42501' && /Esta cuenta no está activa\./.test(e.message), sql)
      }
      // Desactivada, la red la sigue frenando: no ve nada, ni siquiera con una política abierta por error.
      for (const [tabla, n] of Object.entries(await cantidades(db, 'ana'))) assert.ok(n === 0 || n === '42501', `${tabla}: ${n}`)
      await db.exec(`create policy abierta_por_error on public.jugadores for all to authenticated using (true) with check (true)`)
      try {
        assert.equal((await como(db, 'nadie', 'select count(*)::int n from public.jugadores')).rows[0].n, 3, 'la política abre jugadores')
        for (const [tabla, n] of Object.entries(await cantidades(db, 'ana'))) assert.ok(n === 0 || n === '42501', `con la política abierta, ${tabla}: ${n}`)
        await assert.rejects(como(db, 'ana', `insert into public.jugadores (nombre, apellido, categoria_id) values ('X', 'Y', '${CAT}')`), codigo('42501'))
        assert.equal((await como(db, 'ana', `update public.jugadores set nombre = 'X' where id = '${J.ana}' returning id`)).rows.length, 0)
        assert.equal(await valor(db, 'ana', 'portal_privado.es_cuenta_jugadora()'), true)
        assert.equal(await valor(db, 'ana', 'portal_privado.mi_jugadora_id()'), null)
        assert.equal(await valor(db, 'nadie', 'portal_privado.es_cuenta_jugadora()'), false)
      } finally { await db.exec('drop policy abierta_por_error on public.jugadores') }
      await assert.rejects(comoServicio(db, `select public.cuentas_jugadoras_estado('${J.rita}', true)`), e => e.code === 'P0002' && /sin_cuenta/.test(e.message))
      await comoServicio(db, `select public.cuentas_jugadoras_estado('${J.ana}', true)`)
      assert.equal((await valor(db, 'ana', 'public.portal_mi_perfil()')).nombre, 'Ana')
    })

    await t.test('reversión', async () => {
      await assert.rejects(db.exec(reversion), /Hay cuentas de jugadoras/)
      assert.equal((await db.query(`select count(*)::int n from pg_policies where policyname = 'sin_cuentas_jugadoras'`)).rows[0].n > 0, true)
      await db.exec('delete from public.cuentas_jugadoras')
      await db.exec(reversion)
      assert.equal(await foto(db), antes)
      // Se puede volver a aplicar.
      await db.exec(cambio)
    })
  } finally { await db.close() }
})

test('no corre si alguna política abierta no es la auditada', async () => {
  const db = await crearBase()
  try {
    const antes = await foto(db)
    await db.exec(`alter policy criterios_select on public.evaluacion_criterios using (activo)`)
    await assert.rejects(db.exec(cambio), /no son las auditadas/)
    await db.exec(`alter policy criterios_select on public.evaluacion_criterios using (true)`)
    assert.equal(await foto(db), antes)
  } finally { await db.close() }
})

// Si la verificación aborta después de crear todo (incluido el ayudante), no queda nada.
test('si la verificación falla no queda nada, ni el ayudante', async () => {
  const db = await crearBase()
  try {
    const antes = await foto(db)
    // Se rompe una de las funciones públicas en las que delega el portal: la prueba con la cuenta falla al final,
    // cuando ya se crearon la tabla, las funciones, la red y el ayudante.
    await db.exec(`alter function public.wellness_publico_respondio(uuid, uuid) rename to wellness_publico_respondio_orig`)
    await db.exec(`create function public.wellness_publico_respondio(p_categoria_id uuid, p_jugadora_id uuid) returns boolean
      language plpgsql security definer set search_path = '' as $$ begin raise exception 'roto' using errcode = 'XX000'; end $$`)
    await assert.rejects(db.exec(cambio), /error inesperado: roto/)
    await db.exec(`drop function public.wellness_publico_respondio(uuid, uuid);
      alter function public.wellness_publico_respondio_orig(uuid, uuid) rename to wellness_publico_respondio`)
    assert.equal(await foto(db), antes)
    assert.equal((await db.query(`select to_regprocedure('seguridad_privado.cuentas_jugadoras_contar(uuid,text)') is null
      and to_regclass('seguridad_privado.respaldo_cuentas_jugadoras') is null and to_regnamespace('portal_privado') is null v`)).rows[0].v, true)
  } finally { await db.close() }
})

test('no corre si hay una tabla de public sin RLS abierta a authenticated', async () => {
  const db = await crearBase()
  try {
    await db.exec(`create table public.suelta (id integer); grant select on public.suelta to authenticated`)
    await assert.rejects(db.exec(cambio), /sin RLS/)
    assert.equal((await db.query(`select to_regclass('public.cuentas_jugadoras') is null v`)).rows[0].v, true)
  } finally { await db.close() }
})
