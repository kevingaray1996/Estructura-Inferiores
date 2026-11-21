-- Reversión de supabase/migrations/20261121120000_eventos_partido_analisis.sql
--
-- Borra exactamente lo que creó la migración (anotado en seguridad_privado.respaldo_eventos_partido): la tabla
-- public.analisis_partido_eventos, su trigger y la función analisis_privado.sellar_evento_partido(). No toca nada más.
--
-- Si la tabla ya tiene eventos cargados, NO corre: borraría las marcas, cambios, goles y tarjetas cargados.
-- Para revertir igual, cambiar v_borrar_datos a true (los eventos se pierden).
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase).

DO $revertir_eventos_partido$
DECLARE
  v_borrar_datos constant boolean := false;
  v_n bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_eventos_partido') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo: la migración no está aplicada o ya se revirtió. No se tocó nada.';
  END IF;
  IF (SELECT count(*) FROM seguridad_privado.respaldo_eventos_partido) <> 2
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_eventos_partido WHERE tipo = 'tabla' AND nombre = 'public.analisis_partido_eventos')
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_eventos_partido WHERE tipo = 'funcion' AND nombre = 'analisis_privado.sellar_evento_partido()') THEN
    RAISE EXCEPTION 'El respaldo no es el esperado. No se tocó nada.';
  END IF;

  IF to_regclass('public.analisis_partido_eventos') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.analisis_partido_eventos;
    IF v_n > 0 AND NOT v_borrar_datos THEN
      RAISE EXCEPTION 'Hay % eventos del partido cargados. No se tocó nada (ver v_borrar_datos al principio).', v_n;
    END IF;
    DROP TABLE public.analisis_partido_eventos;
  END IF;
  DROP FUNCTION IF EXISTS analisis_privado.sellar_evento_partido();
  DROP TABLE seguridad_privado.respaldo_eventos_partido;

  IF to_regclass('public.analisis_partido_eventos') IS NOT NULL
     OR to_regprocedure('analisis_privado.sellar_evento_partido()') IS NOT NULL THEN
    RAISE EXCEPTION 'No se pudo borrar todo. Se deshizo la reversión.';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'OK: eventos del partido revertidos.';
END
$revertir_eventos_partido$;
