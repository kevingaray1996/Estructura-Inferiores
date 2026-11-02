import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { ids, prepararAnalisisSintetico, sesionSintetica } from './helpers/analisisSintetico.mjs'

// Motor PostgreSQL embebido en memoria; sin configuración ni conexión remota.
const { PGlite } = await import(pathToFileURL(join(tmpdir(), 'comunicaciones-planificacion-pg/node_modules/@electric-sql/pglite/dist/index.js')).href)
const ruta = 'supabase/migrations/202611020001_orientacion_tactica_analisis.sql'

test('Ensayo SQL aislado: orientación, históricos, edición, permisos y reaplicación', async () => {
  const db = new PGlite()
  const sql = readFileSync(ruta, 'utf8')
  try {
    await prepararAnalisisSintetico(db)
    // Completar únicamente el esquema sintético previo: estos campos ya existen
    // en el modelo de la aplicación, pero el fixture anterior no los necesitaba.
    await db.exec(`ALTER TABLE public.analisis_partidos ADD COLUMN direccion_primer_tiempo text;
      ALTER TABLE public.analisis_eventos ADD COLUMN zona text;
      UPDATE public.analisis_partidos SET direccion_primer_tiempo='izquierda';
      UPDATE public.analisis_eventos SET periodo=1,segundo=65,coordenada_x=90,coordenada_y=80,zona='Ataque derecha';`)
    const historicos = (await db.query('SELECT * FROM public.analisis_eventos ORDER BY id')).rows
    const seguridad = async () => ({
      politicas: (await db.query("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows,
      tablas: (await db.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).rows,
      funciones: (await db.query("SELECT p.oid::regprocedure::text AS nombre,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','analisis_privado') AND p.proname<>'validar_referencia_tactica_analisis' ORDER BY nombre")).rows,
    })
    const antes = await seguridad()
    // Ejecutar el archivo EXACTO, sin sustituciones de SQL ni identidades.
    await db.exec(sql)
    const columnas = (await db.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='analisis_eventos' AND column_name IN ('sistema_coordenadas','direccion_captura','periodo_captura') ORDER BY column_name")).rows
    assert.equal(columnas.length, 3)
    assert.ok(columnas.every(c => c.is_nullable === 'YES' && c.column_default === null))
    const verificarHistoricos = async () => {
      for (const fila of historicos) {
        const r = (await db.query('SELECT * FROM public.analisis_eventos WHERE id=$1', [fila.id])).rows[0]
        assert.equal(r.sistema_coordenadas, null)
        assert.equal(r.direccion_captura, null)
        assert.equal(r.periodo_captura, null)
        const { sistema_coordenadas, direccion_captura, periodo_captura, ...original } = r
        assert.deepEqual(original, fila)
      }
    }
    await verificarHistoricos()
    assert.deepEqual(await seguridad(), antes)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.analisis_eventos'::regclass AND tgname='validar_referencia_tactica_analisis' AND NOT tgisinternal")).rows[0].n, 1)

    await sesionSintetica(db, 'a')
    const nuevos = []
    for (const [periodo, direccion, zona] of [[1, 'izquierda', 'Defensa izquierda'], [2, 'derecha', 'Ataque derecha']]) {
      const e = (await db.query(`INSERT INTO public.analisis_eventos(partido_id,jugador_id,tipo,periodo,coordenada_x,coordenada_y,zona,sistema_coordenadas,direccion_captura,periodo_captura)
        VALUES($1,$2,'Recuperación',$3::integer::smallint,90,90,'Medio centro','visual_v1',$4,$3::integer) RETURNING *`, [ids.an, ids.j, periodo, direccion])).rows[0]
      assert.equal(e.zona, zona)
      assert.equal(e.direccion_captura, direccion)
      assert.equal(e.periodo_captura, periodo)
      assert.equal(e.coordenada_x, 90)
      assert.equal(e.coordenada_y, 90)
      nuevos.push(e)
    }
    // El cliente antiguo sigue insertando sin los nuevos campos.
    const antiguo = (await db.query("INSERT INTO public.analisis_eventos(partido_id,jugador_id,tipo,zona) VALUES($1,$2,'Pase correcto','Defensa centro') RETURNING *", [ids.an, ids.j])).rows[0]
    assert.equal(antiguo.sistema_coordenadas, null)
    assert.equal(antiguo.zona, 'Defensa centro')
    await db.query("UPDATE public.analisis_partidos SET direccion_primer_tiempo='derecha' WHERE id=$1", [ids.an])
    for (const e of nuevos) {
      const editado = (await db.query("UPDATE public.analisis_eventos SET segundo=125,resultado='Exitoso' WHERE id=$1 RETURNING *", [e.id])).rows[0]
      assert.equal(editado.direccion_captura, e.direccion_captura)
      assert.equal(editado.periodo_captura, e.periodo_captura)
      assert.equal(editado.zona, e.zona)
      await assert.rejects(db.query("UPDATE public.analisis_eventos SET direccion_captura=$1 WHERE id=$2", [e.direccion_captura === 'derecha' ? 'izquierda' : 'derecha', e.id]), /inmutable/)
    }
    await assert.rejects(db.query("INSERT INTO public.analisis_eventos(partido_id,tipo,periodo,sistema_coordenadas,direccion_captura,periodo_captura) VALUES($1,'Gol',1,'visual_v1','izquierda',1)", [ids.an]), /orientación cambió/)
    await sesionSintetica(db, 'pf')
    await assert.rejects(db.query("INSERT INTO public.analisis_eventos(partido_id,tipo) VALUES($1,'Gol')", [ids.an]), e => e.code === '42501')
    await db.exec('RESET ROLE')
    await verificarHistoricos()
    assert.deepEqual(await seguridad(), antes)
    const estado = (await db.query('SELECT * FROM public.analisis_eventos ORDER BY id')).rows
    await assert.rejects(db.exec(sql), e => e.code === '42701')
    await db.exec('ROLLBACK')
    assert.deepEqual((await db.query('SELECT * FROM public.analisis_eventos ORDER BY id')).rows, estado)
    assert.deepEqual(await seguridad(), antes)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='validar_referencia_tactica_analisis' AND NOT tgisinternal")).rows[0].n, 1)
    assert.equal(readFileSync(ruta, 'utf8'), sql)
    console.log('Migración exacta SHA256:', createHash('sha256').update(sql).digest('hex'))
    console.log('Verificado: 3 columnas, históricos intactos, captura por período, edición inmutable, compatibilidad antigua, RLS/ACL sin cambios y segunda aplicación rechazada sin efectos.')
  } finally { await db.close() }
})
