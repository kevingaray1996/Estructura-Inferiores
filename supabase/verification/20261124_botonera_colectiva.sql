-- Verificación (solo lectura) de supabase/migrations/20261124120000_botonera_colectiva.sql
-- Correr en el editor SQL de Supabase después de la migración. Si algo no está bien, frena con un mensaje claro.
-- No modifica nada.

DO $verificar_botonera_colectiva$
DECLARE
  v_escritura text;
  v_mal text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
       AND ((table_name = 'analisis_tipos_accion' AND column_name IN ('botonera', 'duracion_defecto', 'espejo'))
         OR (table_name = 'analisis_partidos' AND column_name IN ('tipo_partido', 'equipo_local', 'equipo_visitante', 'equipo_analizado')))) <> 7 THEN
    RAISE EXCEPTION 'Faltan columnas nuevas (botonera, duracion_defecto, espejo, tipo_partido, equipo_local, equipo_visitante, equipo_analizado).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validar_forma_accion' AND tgrelid = 'public.analisis_eventos'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validar_tipo_colectivo' AND tgrelid = 'public.analisis_tipos_accion'::regclass) THEN
    RAISE EXCEPTION 'Faltan los triggers validar_forma_accion o validar_tipo_colectivo.';
  END IF;
  IF (SELECT count(*) FROM public.analisis_tipos_accion WHERE botonera = 'colectiva') < 13 THEN
    RAISE EXCEPTION 'Faltan botones colectivos.';
  END IF;
  SELECT string_agg(t.codigo, ', ') INTO v_mal FROM public.analisis_tipos_accion t
    LEFT JOIN public.analisis_tipos_accion e ON e.codigo = t.espejo
   WHERE t.espejo IS NOT NULL AND (t.botonera <> 'colectiva' OR e.botonera IS DISTINCT FROM 'colectiva');
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Espejos que no apuntan a la botonera colectiva: %.', v_mal; END IF;
  SELECT string_agg(e.id::text, ', ') INTO v_mal FROM public.analisis_eventos e
    JOIN public.analisis_tipos_accion t ON t.codigo = e.tipo
   WHERE (t.botonera = 'colectiva' AND (e.jugador_id IS NOT NULL OR e.segundo_fin IS NULL))
      OR (t.botonera = 'individual' AND e.segundo_fin IS NOT NULL);
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Acciones con forma incorrecta: %.', v_mal; END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_partidos WHERE tipo_partido = 'scouting' AND partido_calendario_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay análisis de scouting vinculados al calendario.';
  END IF;
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_partido_eventos', 'analisis_pases_detalle',
                       'analisis_tipos_accion', 'analisis_comet_nombres')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reglas que dejan escribir en Análisis a otras cuentas: %.', v_escritura;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_eventos'
                  AND policyname = 'analisis_eventos_read' AND qual LIKE '%puede_consultar_analisis%') THEN
    RAISE EXCEPTION 'La lectura de acciones no usa puede_consultar_analisis (falta la etapa 0).';
  END IF;
  RAISE NOTICE 'OK: botonera colectiva, espejos, forma de las acciones, scouting y permisos.';
END
$verificar_botonera_colectiva$;
