-- Verificación (solo lectura) de supabase/migrations/20261121120000_eventos_partido_analisis.sql
-- Se puede correr cuantas veces se quiera: no cambia nada. Si algo no está como se espera, avisa con un error.
-- Al final muestra, por cada análisis, qué marcas de tiempo tiene cargadas.

DO $verificar_eventos_partido$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.analisis_partido_eventos') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla public.analisis_partido_eventos: la migración no está aplicada.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_partido_eventos'::regclass) THEN
    RAISE EXCEPTION 'La tabla no tiene RLS forzada.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partido_eventos') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partido_eventos'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'Las reglas de acceso no son las 5 esperadas (4 de administración y la red sin_cuentas_jugadoras).';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_partido_eventos', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_partido_eventos', 'INSERT')
     OR has_table_privilege('anon', 'public.analisis_partido_eventos', 'UPDATE')
     OR has_table_privilege('anon', 'public.analisis_partido_eventos', 'DELETE') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre la tabla.';
  END IF;
  IF to_regprocedure('analisis_privado.sellar_evento_partido()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.analisis_partido_eventos'::regclass AND tgname = 'sellar_evento_partido') THEN
    RAISE EXCEPTION 'Falta el trigger sellar_evento_partido.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_eventos_partido') IS NULL THEN
    RAISE EXCEPTION 'Falta el respaldo seguridad_privado.respaldo_eventos_partido (lo necesita la reversión).';
  END IF;
  RAISE NOTICE 'OK: tabla, seguridad, trigger y respaldo como se esperaba.';
END
$verificar_eventos_partido$;

-- Por análisis: qué marcas tiene (1 = cargada) y cuántos cambios, goles y tarjetas.
SELECT a.rival, a.fecha,
       count(*) FILTER (WHERE e.tipo = 'inicio_1t') AS inicio_1t,
       count(*) FILTER (WHERE e.tipo = 'fin_1t') AS fin_1t,
       count(*) FILTER (WHERE e.tipo = 'inicio_2t') AS inicio_2t,
       count(*) FILTER (WHERE e.tipo = 'fin_partido') AS fin_partido,
       count(*) FILTER (WHERE e.tipo = 'cambio') AS cambios,
       count(*) FILTER (WHERE e.tipo = 'gol') AS goles,
       count(*) FILTER (WHERE e.tipo = 'tarjeta') AS tarjetas
  FROM public.analisis_partidos a
  LEFT JOIN public.analisis_partido_eventos e ON e.partido_id = a.id
 GROUP BY a.id, a.rival, a.fecha
 ORDER BY a.fecha DESC NULLS LAST, a.rival;
