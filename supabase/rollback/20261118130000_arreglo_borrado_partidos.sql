-- Reversión del arreglo del borrado de partidos: deja public.categoria_de_partido() y public.categoria_de_jugador()
-- exactamente como estaban antes de supabase/migrations/20261118130000_arreglo_borrado_partidos.sql, desde el
-- respaldo, y borra el respaldo (después se puede volver a aplicar).
-- OJO: al revertir vuelve la falla (el botón «Eliminar» de partidos deja de andar).
-- Un único bloque DO: todo o nada. Correr como postgres en el editor SQL de Supabase.

DO $reversion_arreglo_borrado_partidos$
DECLARE
  v_def_partido text; v_def_jugador text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_arreglo_borrado_partidos') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo del arreglo: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT max(definicion) FILTER (WHERE nombre = ''public.categoria_de_partido(uuid)''),
                  max(definicion) FILTER (WHERE nombre = ''public.categoria_de_jugador(uuid)'')
             FROM seguridad_privado.respaldo_arreglo_borrado_partidos'
    INTO v_def_partido, v_def_jugador;
  IF v_def_partido IS NULL OR v_def_jugador IS NULL THEN RAISE EXCEPTION 'El respaldo está incompleto. No se tocó nada.'; END IF;

  EXECUTE v_def_partido;
  EXECUTE v_def_jugador;

  IF (SELECT lower(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) FROM pg_proc
       WHERE oid = 'public.categoria_de_partido(uuid)'::regprocedure) <> 'select categoria_id from partidos where id = pid'
     OR (SELECT lower(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) FROM pg_proc
       WHERE oid = 'public.categoria_de_jugador(uuid)'::regprocedure) <> 'select categoria_id from jugadores where id = jid' THEN
    RAISE EXCEPTION 'Las funciones no quedaron como antes. Se deshizo todo.';
  END IF;

  DROP TABLE seguridad_privado.respaldo_arreglo_borrado_partidos;
  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'OK: funciones restauradas como estaban antes del arreglo.';
END
$reversion_arreglo_borrado_partidos$;
