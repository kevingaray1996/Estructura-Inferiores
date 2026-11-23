-- Reversión de supabase/migrations/20261124120000_botonera_colectiva.sql
--
-- Deja el catálogo, las acciones y los análisis como estaban: borra los triggers y funciones nuevos, los botones
-- colectivos, las columnas nuevas y vuelve a poner la regla de grupos de antes (texto guardado en el respaldo).
-- Un único bloque DO (todo o nada); correr como postgres en el editor SQL de Supabase.
--
-- Si ya hay acciones colectivas o análisis de scouting cargados, NO corre (para no perder datos). Para borrarlos
-- igual, cambiar v_borrar_datos a true: se borran esas acciones colectivas y esos análisis de scouting (con todo lo
-- que tengan adentro).

DO $revertir_botonera_colectiva$
DECLARE
  v_borrar_datos constant boolean := false;
  v_grupo text;
  v_colectivas bigint;
  v_scouting bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_botonera_colectiva') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo (seguridad_privado.respaldo_botonera_colectiva): la migración no está aplicada. No se tocó nada.';
  END IF;
  SELECT definicion INTO v_grupo FROM seguridad_privado.respaldo_botonera_colectiva
   WHERE tipo = 'regla_anterior' AND nombre = 'analisis_tipos_accion_grupo_check';
  IF v_grupo IS NULL THEN RAISE EXCEPTION 'Falta en el respaldo la regla de grupos anterior. No se tocó nada.'; END IF;

  SELECT count(*) INTO v_colectivas FROM public.analisis_eventos e
    JOIN public.analisis_tipos_accion t ON t.codigo = e.tipo WHERE t.botonera = 'colectiva';
  SELECT count(*) INTO v_scouting FROM public.analisis_partidos WHERE tipo_partido = 'scouting';
  IF (v_colectivas > 0 OR v_scouting > 0) AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay % acciones colectivas y % análisis de scouting. No se tocó nada (cambiar v_borrar_datos a true para borrarlos igual).', v_colectivas, v_scouting;
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_partidos WHERE tipo_partido = 'propio' AND equipo_analizado <> 'propio') AND NOT v_borrar_datos THEN
    RAISE EXCEPTION 'Hay análisis propios marcados con equipo analizado = rival; se perdería ese dato. No se tocó nada (v_borrar_datos = true para seguir).';
  END IF;

  DELETE FROM public.analisis_eventos e USING public.analisis_tipos_accion t
   WHERE t.codigo = e.tipo AND t.botonera = 'colectiva';
  DELETE FROM public.analisis_partidos WHERE tipo_partido = 'scouting';

  DROP TRIGGER IF EXISTS validar_forma_accion ON public.analisis_eventos;
  DROP FUNCTION IF EXISTS analisis_privado.validar_forma_accion();
  DROP TRIGGER IF EXISTS validar_tipo_colectivo ON public.analisis_tipos_accion;
  DROP FUNCTION IF EXISTS analisis_privado.validar_tipo_colectivo();
  DROP TRIGGER IF EXISTS validar_tipo_partido ON public.analisis_partidos;
  DROP FUNCTION IF EXISTS analisis_privado.validar_tipo_partido();

  UPDATE public.analisis_tipos_accion SET espejo = NULL WHERE espejo IS NOT NULL;
  DELETE FROM public.analisis_tipos_accion WHERE botonera = 'colectiva';
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT analisis_tipos_accion_grupo_check;
  EXECUTE format('ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_grupo_check %s', v_grupo);
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT IF EXISTS tipos_colectiva_sin_resultado;
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT IF EXISTS tipos_espejo_check;
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT IF EXISTS tipos_duracion_check;
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT IF EXISTS tipos_botonera_check;
  ALTER TABLE public.analisis_tipos_accion DROP COLUMN IF EXISTS espejo;
  ALTER TABLE public.analisis_tipos_accion DROP COLUMN IF EXISTS duracion_defecto;
  ALTER TABLE public.analisis_tipos_accion DROP COLUMN IF EXISTS botonera;

  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_equipo_analizado_check;
  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_equipos_check;
  ALTER TABLE public.analisis_partidos DROP CONSTRAINT IF EXISTS analisis_partidos_tipo_partido_check;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS equipo_analizado;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS equipo_visitante;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS equipo_local;
  ALTER TABLE public.analisis_partidos DROP COLUMN IF EXISTS tipo_partido;

  DROP TABLE seguridad_privado.respaldo_botonera_colectiva;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Revertido: sin botonera colectiva ni scouting; el catálogo y los análisis quedan como antes.';
END
$revertir_botonera_colectiva$;
