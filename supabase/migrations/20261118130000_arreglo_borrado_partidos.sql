-- Arreglo: el botón «Eliminar» de la lista de partidos falla con TODOS los partidos.
--
-- Causa: la función de la app eliminar_partido_deportivo_seguro corre con search_path vacío (bien, por seguridad)
-- y sin privilegios propios, así que al borrar citaciones/estadísticas y desvincular videos se aplican las reglas
-- de acceso (RLS) de esas tablas. Esas reglas usan public.categoria_de_partido() y public.categoria_de_jugador(),
-- que nombran sus tablas SIN esquema («from partidos», «from jugadores»). Con search_path vacío, Postgres no las
-- encuentra: error 42P01 «relation "partidos" does not exist», la función se corta y la app muestra «No se pudo
-- confirmar la eliminación». Pasa desde la migración de permisos de Análisis (202611010001), no por los avisos ni
-- por las cuentas de jugadoras.
--
-- Arreglo: las mismas dos funciones, con el mismo cuerpo, pero nombrando la tabla con su esquema
-- (public.partidos, public.jugadores). No cambia quién ve o puede tocar qué: siguen sin privilegios propios
-- (respetan RLS como antes), mismas firmas, mismo dueño y mismos permisos.
--
-- Qué hace, en un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase):
--   1. Verifica que las dos funciones de producción sean exactamente las esperadas; si no, no toca nada.
--   2. Guarda su definición exacta en seguridad_privado.respaldo_arreglo_borrado_partidos (para la reversión).
--   3. Prueba como coordinación, con search_path vacío, que hoy falla (demuestra la causa).
--   4. Reemplaza las dos funciones.
--   5. Verifica: mismo dueño, permisos y tipo; como coordinación con search_path vacío ya no falla; con el
--      search_path normal ve exactamente lo mismo que antes (citaciones, estadísticas, videos); y, si existe el
--      partido de prueba vs Newell's, lo borra con el botón de la app (la misma función) y lo DESHACE enseguida.
-- Reversión: supabase/rollback/20261118130000_arreglo_borrado_partidos.sql

DO $arreglo_borrado_partidos$
DECLARE
  v_prueba constant uuid := 'fbb190b6-b124-4c6b-838a-98ecb19812c8';
  v_email text; v_sub uuid;
  v_acl_partido text; v_acl_jugador text; v_duenio_partido oid; v_duenio_jugador oid;
  v_antes jsonb; v_despues jsonb; v_resultado text; v_estado text;
  t text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;
  IF to_regclass('seguridad_privado.respaldo_arreglo_borrado_partidos') IS NOT NULL THEN
    RAISE EXCEPTION 'El arreglo ya estaba aplicado (existe el respaldo). No se tocó nada.';
  END IF;

  -- 1) ¿Son las funciones esperadas?
  IF (SELECT lower(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) FROM pg_proc
       WHERE oid = to_regprocedure('public.categoria_de_partido(uuid)')) IS DISTINCT FROM 'select categoria_id from partidos where id = pid'
     OR (SELECT lower(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) FROM pg_proc
       WHERE oid = to_regprocedure('public.categoria_de_jugador(uuid)')) IS DISTINCT FROM 'select categoria_id from jugadores where id = jid' THEN
    RAISE EXCEPTION 'Las funciones de producción no son las esperadas. No se tocó nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid IN (to_regprocedure('public.categoria_de_partido(uuid)'), to_regprocedure('public.categoria_de_jugador(uuid)'))
              AND (prosecdef OR proconfig IS NOT NULL OR prolang <> (SELECT oid FROM pg_language WHERE lanname = 'sql') OR provolatile <> 's')) THEN
    RAISE EXCEPTION 'Las funciones de producción tienen otra configuración. No se tocó nada.';
  END IF;
  SELECT proacl::text, proowner INTO v_acl_partido, v_duenio_partido FROM pg_proc WHERE oid = 'public.categoria_de_partido(uuid)'::regprocedure;
  SELECT proacl::text, proowner INTO v_acl_jugador, v_duenio_jugador FROM pg_proc WHERE oid = 'public.categoria_de_jugador(uuid)'::regprocedure;

  -- Un usuario de coordinación para las pruebas.
  SELECT p.email, u.id INTO v_email, v_sub FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
   WHERE p.rol::text = 'coordinacion' ORDER BY p.email LIMIT 1;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No hay ningún perfil de coordinación con usuario para probar. No se tocó nada.'; END IF;

  -- 2) Respaldo exacto.
  IF to_regnamespace('seguridad_privado') IS NULL THEN
    CREATE SCHEMA seguridad_privado;
    REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated, service_role;
  END IF;
  CREATE TABLE seguridad_privado.respaldo_arreglo_borrado_partidos (nombre text PRIMARY KEY, definicion text NOT NULL);
  REVOKE ALL ON TABLE seguridad_privado.respaldo_arreglo_borrado_partidos FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO seguridad_privado.respaldo_arreglo_borrado_partidos VALUES
    ('public.categoria_de_partido(uuid)', pg_get_functiondef('public.categoria_de_partido(uuid)'::regprocedure)),
    ('public.categoria_de_jugador(uuid)', pg_get_functiondef('public.categoria_de_jugador(uuid)'::regprocedure));

  -- 3) Antes: lo que ve coordinación con el search_path normal, y la falla con search_path vacío.
  v_antes := '{}';
  FOREACH t IN ARRAY ARRAY['citaciones', 'estadisticas_jugador', 'videos'] LOOP
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'email', v_email, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*)::text FROM public.%I', t) INTO v_resultado;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_resultado := 'error ' || SQLSTATE; END IF;
    END;
    v_antes := v_antes || jsonb_build_object(t, v_resultado);
  END LOOP;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'email', v_email, 'role', 'authenticated')::text, true);
    PERFORM set_config('search_path', '', true);
    SET LOCAL ROLE authenticated;
    EXECUTE 'SELECT count(*)::text FROM public.citaciones' INTO v_resultado;
    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    v_estado := CASE WHEN SQLERRM = 'DESHACER_PRUEBA' THEN 'sin error' ELSE SQLSTATE END;
  END;
  RAISE NOTICE 'Antes del arreglo, citaciones con search_path vacío: % (se espera 42P01).', v_estado;

  -- 4) El arreglo: mismo cuerpo, tabla con esquema. CREATE OR REPLACE conserva dueño y permisos.
  CREATE OR REPLACE FUNCTION public.categoria_de_partido(pid uuid)
   RETURNS uuid
   LANGUAGE sql
   STABLE
  AS $f$
    select categoria_id from public.partidos where id = pid
  $f$;
  CREATE OR REPLACE FUNCTION public.categoria_de_jugador(jid uuid)
   RETURNS uuid
   LANGUAGE sql
   STABLE
  AS $f$
    select categoria_id from public.jugadores where id = jid
  $f$;

  -- 5) Verificación.
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.categoria_de_partido(uuid)'::regprocedure) IS DISTINCT FROM v_acl_partido
     OR (SELECT proacl::text FROM pg_proc WHERE oid = 'public.categoria_de_jugador(uuid)'::regprocedure) IS DISTINCT FROM v_acl_jugador
     OR (SELECT proowner FROM pg_proc WHERE oid = 'public.categoria_de_partido(uuid)'::regprocedure) <> v_duenio_partido
     OR (SELECT proowner FROM pg_proc WHERE oid = 'public.categoria_de_jugador(uuid)'::regprocedure) <> v_duenio_jugador
     OR EXISTS (SELECT 1 FROM pg_proc WHERE oid IN ('public.categoria_de_partido(uuid)'::regprocedure, 'public.categoria_de_jugador(uuid)'::regprocedure)
                 AND (prosecdef OR proconfig IS NOT NULL OR provolatile <> 's')) THEN
    RAISE EXCEPTION 'Cambiaron el dueño, los permisos o el tipo de las funciones. Se deshizo todo.';
  END IF;

  -- Mismo resultado que antes con el search_path normal, y sin error con search_path vacío.
  v_despues := '{}';
  FOREACH t IN ARRAY ARRAY['citaciones', 'estadisticas_jugador', 'videos'] LOOP
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'email', v_email, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*)::text FROM public.%I', t) INTO v_resultado;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_resultado := 'error ' || SQLSTATE; END IF;
    END;
    v_despues := v_despues || jsonb_build_object(t, v_resultado);
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'email', v_email, 'role', 'authenticated')::text, true);
      PERFORM set_config('search_path', '', true);
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*)::text FROM public.%I', t) INTO v_resultado;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DESHACER_PRUEBA' THEN
        RAISE EXCEPTION 'Con search_path vacío, % sigue fallando (%). Se deshizo todo.', t, SQLSTATE;
      END IF;
    END;
  END LOOP;
  IF v_despues <> v_antes THEN
    RAISE EXCEPTION 'Coordinación ve otra cantidad de filas que antes (antes %, después %). Se deshizo todo.', v_antes, v_despues;
  END IF;

  -- El botón de la app, de punta a punta, sobre el partido de prueba (si existe), y deshecho enseguida.
  IF EXISTS (SELECT 1 FROM public.partidos WHERE id = v_prueba) THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sub, 'email', v_email, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      EXECUTE 'SELECT public.eliminar_partido_deportivo_seguro($1)::text' INTO v_resultado USING v_prueba;
      v_estado := CASE WHEN v_resultado = v_prueba::text AND NOT EXISTS (SELECT 1 FROM public.partidos WHERE id = v_prueba)
                       THEN 'ok' ELSE 'no devolvió el partido' END;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_estado := SQLSTATE || ' ' || SQLERRM; END IF;
    END;
    IF v_estado <> 'ok' THEN
      RAISE EXCEPTION 'El borrado desde la app sigue fallando con el partido de prueba (%). Se deshizo todo.', v_estado;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partidos WHERE id = v_prueba) THEN
      RAISE EXCEPTION 'La prueba no se deshizo. Se deshizo todo.';
    END IF;
    RAISE NOTICE 'Prueba del botón Eliminar con el partido de prueba: ok (deshecha, el partido sigue ahí).';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'OK: arreglo aplicado. Coordinación ve lo mismo que antes: %.', v_despues;
END
$arreglo_borrado_partidos$;

-- Comprobación final (solo lectura): las dos funciones nombran la tabla con esquema.
SELECT p.oid::regprocedure AS funcion, btrim(p.prosrc) AS cuerpo, p.prosecdef AS privilegios_propios, p.proconfig AS config
  FROM pg_proc p
 WHERE p.oid IN ('public.categoria_de_partido(uuid)'::regprocedure, 'public.categoria_de_jugador(uuid)'::regprocedure);
