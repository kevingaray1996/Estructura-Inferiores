-- Verificación (solo lectura) de supabase/migrations/20261126120000_posesion_tramos.sql
-- Correr en el editor SQL de Supabase después de la migración. Si algo no está bien, frena con un mensaje claro.
-- No modifica nada.

DO $verificar_posesion_tramos$
DECLARE
  v_mal text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.analisis_posesion_tramos') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla analisis_posesion_tramos.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_posesion_tramos'::regclass) THEN
    RAISE EXCEPTION 'La tabla no tiene la seguridad por filas activada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_posesion_tramos'
                  AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'Falta la red sin_cuentas_jugadoras.';
  END IF;
  IF has_table_privilege('anon', 'public.analisis_posesion_tramos', 'SELECT') OR has_table_privilege('anon', 'public.analisis_posesion_tramos', 'INSERT') THEN
    RAISE EXCEPTION 'anon tiene permisos sobre los tramos de posesión.';
  END IF;
  SELECT string_agg(policyname, ', ') INTO v_mal FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analisis_posesion_tramos'
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Reglas que dejan escribir a otras cuentas: %.', v_mal; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sellar_tramo_posesion' AND tgrelid = 'public.analisis_posesion_tramos'::regclass) THEN
    RAISE EXCEPTION 'Falta el trigger sellar_tramo_posesion.';
  END IF;
  SELECT string_agg(a.id::text, ', ') INTO v_mal FROM public.analisis_posesion_tramos a
    JOIN public.analisis_posesion_tramos b ON a.partido_id = b.partido_id AND a.id < b.id AND a.inicio < b.fin AND b.inicio < a.fin;
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Tramos a mano superpuestos: %.', v_mal; END IF;
  -- Lado de ataque del 1T confirmado.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analisis_partidos'
                  AND column_name = 'direccion_confirmada' AND data_type = 'boolean' AND is_nullable = 'NO'
                  AND column_default = 'false') THEN
    RAISE EXCEPTION 'Falta la columna analisis_partidos.direccion_confirmada (booleana, obligatoria y false por defecto).';
  END IF;
  RAISE NOTICE 'OK: tramos de posesión, permisos y lado del 1T (% análisis sin confirmar, % confirmados).',
    (SELECT count(*) FROM public.analisis_partidos WHERE NOT direccion_confirmada),
    (SELECT count(*) FROM public.analisis_partidos WHERE direccion_confirmada);
END
$verificar_posesion_tramos$;
