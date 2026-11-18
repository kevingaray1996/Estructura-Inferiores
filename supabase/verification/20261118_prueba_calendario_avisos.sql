-- Prueba del calendario de avisos (lo que no se puede probar en vivo): el mismo recordatorio sale una sola vez por
-- día y categoría, quien completó el Wellness no lo recibe, las pausas y el Descanso frenan, la ventana de 90 minutos,
-- el RPE, que una sesión no se anuncia antes de su día (publicada la víspera: ni aviso de entrenamiento ni se ve en la
-- app; el combinado sale a las 7:10 de su día) y el corte de las 20:00 para una sesión publicada tarde.
--
-- NO toca datos reales: crea una categoría, una jugadora, su cuenta y un celular de prueba dentro de una
-- subtransacción que se deshace al final (RAISE EXCEPTION 'DESHACER_PRUEBA'), igual que la prueba 7c de la etapa 2.
-- Lo único que queda es la tabla de resultados seguridad_privado.prueba_calendario_avisos (sin permisos para nadie más
-- que postgres), que se vacía al empezar cada corrida.
--
-- Correrlo después de supabase/migrations/20261118120000_avisos_ajustes.sql, como postgres (editor SQL de Supabase).
-- Todas las filas del resultado tienen que decir OK. Los resultados también salen como NOTICE.
--
-- Para borrar la tabla de resultados cuando ya no haga falta:
--   DROP TABLE seguridad_privado.prueba_calendario_avisos;

DO $prueba_calendario$
DECLARE
  v_cat uuid; v_jug uuid; v_sub uuid := gen_random_uuid(); v_email text; v_envio uuid;
  v_res jsonb := '[]';
  v_d date;
  v_sesion_hoy uuid; v_sesion_manana uuid; v_hoy jsonb;
  v_bloques jsonb := '[{"id": "prueba-bloque", "nombre": "Cancha", "visible": true, "campos_publicos": ["objetivo"],
                        "objetivo": "Prueba de avisos", "indicaciones": "", "notas_internas": "", "ejercicios": []}]';
  v_obtenido text;
  r record;
  n integer := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regprocedure('avisos_privado.programar(timestamptz)') IS NULL OR to_regprocedure('public.avisos_destinos(uuid)') IS NULL
     OR to_regprocedure('public.cuentas_jugadoras_registrar(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta la etapa 2 de avisos. No continuar.';
  END IF;
  IF to_regprocedure('avisos_privado.corte_publicacion(timestamp without time zone)') IS NULL THEN
    RAISE EXCEPTION 'Faltan los ajustes de avisos (20261118120000_avisos_ajustes.sql). Correrlos antes.';
  END IF;

  -- Tabla de resultados: fuera de la parte que se deshace.
  CREATE TABLE IF NOT EXISTS seguridad_privado.prueba_calendario_avisos (
    orden integer PRIMARY KEY,
    caso text NOT NULL,
    esperado text,
    obtenido text,
    resultado text NOT NULL
  );
  REVOKE ALL ON seguridad_privado.prueba_calendario_avisos FROM PUBLIC, anon, authenticated, service_role;
  TRUNCATE seguridad_privado.prueba_calendario_avisos;

  v_email := 'prueba-calendario-' || replace(v_sub::text, '-', '') || '@prueba.invalid';
  BEGIN
    -- Categoría de prueba (el trigger le crea la config por defecto): solo los jueves, Wellness 7:10 y RPE 10:15.
    INSERT INTO public.categorias (nombre, orden)
    VALUES ('Prueba de calendario ' || left(v_sub::text, 8), (SELECT coalesce(max(c.orden), 0) + 1 FROM public.categorias c))
    RETURNING id INTO v_cat;
    UPDATE public.avisos_config SET activo = true, dias = '{4}', hora_wellness = '07:10', hora_rpe = '10:15' WHERE categoria_id = v_cat;
    INSERT INTO public.jugadores (nombre, apellido, categoria_id) VALUES ('Prueba', 'Calendario', v_cat) RETURNING id INTO v_jug;
    INSERT INTO auth.users (id, email, aud, role) VALUES (v_sub, v_email, 'authenticated', 'authenticated');
    PERFORM public.cuentas_jugadoras_registrar(v_jug, v_sub, v_email, NULL);
    INSERT INTO public.avisos_suscripciones (jugador_id, usuario_id, endpoint, p256dh, auth, dispositivo)
    VALUES (v_jug, v_sub, 'https://fcm.googleapis.com/fcm/send/prueba-calendario-' || replace(v_sub::text, '-', ''),
            'B' || repeat('A', 86), 'abcdefghij_-KLMNOPQRST', 'android');

    -- 1) Jueves 1/1/2026 a las 7:10 de Argentina (10:10 UTC): Wellness.
    PERFORM avisos_privado.programar('2026-01-01 10:10:00+00');
    SELECT string_agg(e.tipo, ',' ORDER BY e.tipo) INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat;
    v_res := v_res || jsonb_build_object('caso', 'Día de entrenamiento a las 7:10: sale el Wellness', 'esperado', 'wellness', 'obtenido', v_obtenido);
    SELECT e.id INTO v_envio FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.tipo = 'wellness';

    -- 2) Mismo día a las 7:40: no se repite.
    PERFORM avisos_privado.programar('2026-01-01 10:40:00+00');
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat;
    v_res := v_res || jsonb_build_object('caso', 'Mismo día a las 7:40: no se repite (envíos de la categoría)', 'esperado', '1', 'obtenido', v_obtenido);

    -- 3) La jugadora con celular está en los destinos; con el Wellness completo, ya no.
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_destinos(v_envio) d WHERE d.jugador_id = v_jug;
    v_res := v_res || jsonb_build_object('caso', 'Wellness pendiente: la jugadora está en los destinos', 'esperado', '1', 'obtenido', v_obtenido);
    INSERT INTO public.bienestar (jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar)
    VALUES (v_jug, '2026-01-01', 3, 3, 3, 3, 3);
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_destinos(v_envio) d WHERE d.jugador_id = v_jug;
    v_res := v_res || jsonb_build_object('caso', 'Wellness completo: la jugadora no está en los destinos', 'esperado', '0', 'obtenido', v_obtenido);

    -- 4) 8:41: fuera de la ventana de 90 minutos. 10:15: RPE.
    PERFORM avisos_privado.programar('2026-01-01 11:41:00+00');
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat;
    v_res := v_res || jsonb_build_object('caso', 'A las 8:41 (fuera de la ventana): nada nuevo', 'esperado', '1', 'obtenido', v_obtenido);
    PERFORM avisos_privado.programar('2026-01-01 13:15:00+00');
    SELECT string_agg(e.tipo, ',' ORDER BY e.tipo) INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat;
    v_res := v_res || jsonb_build_object('caso', 'A las 10:15: sale el RPE', 'esperado', 'rpe,wellness', 'obtenido', v_obtenido);

    -- 5) Jueves 22/1 con la sesión publicada: combinado.
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado) VALUES (v_cat, '2026-01-22', 'entrenamiento', 'publicado');
    PERFORM avisos_privado.programar('2026-01-22 10:10:00+00');
    SELECT string_agg(e.tipo, ',' ORDER BY e.tipo) INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha = '2026-01-22';
    v_res := v_res || jsonb_build_object('caso', 'Con la sesión publicada a la mañana: combinado', 'esperado', 'combinado', 'obtenido', v_obtenido);

    -- 6) Jueves 15/1 en pausa: nada.
    INSERT INTO public.avisos_pausas (categoria_id, desde, hasta, motivo) VALUES (v_cat, '2026-01-15', '2026-01-15', 'Prueba');
    PERFORM avisos_privado.programar('2026-01-15 10:10:00+00');
    PERFORM avisos_privado.programar('2026-01-15 13:15:00+00');
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha = '2026-01-15';
    v_res := v_res || jsonb_build_object('caso', 'Día en pausa: nada', 'esperado', '0', 'obtenido', v_obtenido);

    -- 7) Jueves 8/1 con Descanso en borrador: nada.
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado) VALUES (v_cat, '2026-01-08', 'descanso', 'borrador');
    PERFORM avisos_privado.programar('2026-01-08 10:10:00+00');
    PERFORM avisos_privado.programar('2026-01-08 13:15:00+00');
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha = '2026-01-08';
    v_res := v_res || jsonb_build_object('caso', 'Descanso en borrador: nada', 'esperado', '0', 'obtenido', v_obtenido);

    -- 8) Una sesión no se anuncia antes de su día. D = mañana (según el reloj real, porque el trigger y
    --    planificacion_publica_hoy usan now()). La categoría de prueba entrena ese día de la semana. Si hay una pausa
    --    de todas las categorías que cubre D, se quita solo dentro de esta prueba (se deshace al final).
    v_d := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1;
    UPDATE public.avisos_config
       SET dias = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(ARRAY[4, extract(isodow FROM v_d)::smallint]::smallint[]) x)
     WHERE categoria_id = v_cat;
    DELETE FROM public.avisos_pausas p WHERE p.categoria_id IS NULL AND v_d BETWEEN p.desde AND p.hasta;
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado, bloques)
    VALUES (v_cat, v_d, 'entrenamiento', 'publicado', v_bloques);
    SELECT count(*)::text INTO v_obtenido FROM public.avisos_envios e
     WHERE e.clave = 'entrenamiento:' || v_cat || ':' || to_char(v_d, 'YYYY-MM-DD');
    v_res := v_res || jsonb_build_object('caso', 'Sesión de mañana publicada hoy: no encola el aviso de entrenamiento', 'esperado', '0', 'obtenido', v_obtenido);
    SELECT (jsonb_array_length(planificacion_privado.bloques_publicos(s.bloques)) > 0)::text INTO v_obtenido
      FROM public.planificacion_sesiones s WHERE s.categoria_id = v_cat AND s.fecha = v_d;
    v_res := v_res || jsonb_build_object('caso', 'Sesión de mañana: tiene bloques visibles (en su día se ve)', 'esperado', 'true', 'obtenido', v_obtenido);
    v_res := v_res || jsonb_build_object('caso', 'Sesión de mañana: hoy no se ve en la app de la jugadora', 'esperado', '[]',
                                         'obtenido', public.planificacion_publica_hoy(v_cat, v_jug)::text);
    PERFORM avisos_privado.programar(((v_d + time '07:10') AT TIME ZONE 'America/Argentina/Buenos_Aires'));
    SELECT string_agg(e.tipo, ',' ORDER BY e.tipo) INTO v_obtenido FROM public.avisos_envios e WHERE e.categoria_id = v_cat AND e.fecha = v_d;
    v_res := v_res || jsonb_build_object('caso', 'El día de la sesión a las 7:10: combinado', 'esperado', 'combinado', 'obtenido', v_obtenido);
    -- Control positivo: una sesión de HOY con el mismo bloque sí se ve (así el '[]' de arriba no pasa de casualidad,
    -- por ejemplo si la jugadora no estuviera en jugadores_publico). Se carga después de comprobar lo de mañana, así
    -- un aviso de entrenamiento de hoy que pueda crear el trigger no cambia esos resultados.
    SELECT s.id INTO v_sesion_manana FROM public.planificacion_sesiones s WHERE s.categoria_id = v_cat AND s.fecha = v_d;
    INSERT INTO public.planificacion_sesiones (categoria_id, fecha, tipo, estado, bloques)
    VALUES (v_cat, v_d - 1, 'entrenamiento', 'publicado', v_bloques) RETURNING id INTO v_sesion_hoy;
    v_hoy := public.planificacion_publica_hoy(v_cat, v_jug);
    v_res := v_res || jsonb_build_object('caso', 'Control: la sesión de hoy sí se ve (y la de mañana no)', 'esperado', 'hoy true · mañana false',
      'obtenido', 'hoy ' || (jsonb_typeof(v_hoy) = 'array' AND jsonb_array_length(v_hoy) > 0
                             AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_hoy) x WHERE x->>'id' = v_sesion_hoy::text))::text
               || ' · mañana ' || coalesce(EXISTS (SELECT 1 FROM jsonb_array_elements(v_hoy) x WHERE x->>'id' = v_sesion_manana::text), false)::text);

    -- 9) Sesión publicada tarde: a las 19:59 todavía avisa; a las 20:00, no.
    v_res := v_res || jsonb_build_object('caso', 'Sesión publicada a las 19:59: avisa', 'esperado', 'true',
                                         'obtenido', avisos_privado.corte_publicacion('2026-01-22 19:59:00')::text);
    v_res := v_res || jsonb_build_object('caso', 'Sesión publicada a las 20:00: no avisa', 'esperado', 'false',
                                         'obtenido', avisos_privado.corte_publicacion('2026-01-22 20:00:00')::text);

    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN
      -- Un error inesperado no aborta: queda como FALLA y la prueba igual se deshace.
      v_res := v_res || jsonb_build_object('caso', 'Error inesperado', 'esperado', 'sin error', 'obtenido', SQLSTATE || ': ' || SQLERRM);
    END IF;
  END;

  FOR r IN SELECT x.ord::integer AS orden, x.v->>'caso' AS caso, x.v->>'esperado' AS esperado, x.v->>'obtenido' AS obtenido
             FROM jsonb_array_elements(v_res) WITH ORDINALITY AS x(v, ord) ORDER BY x.ord LOOP
    INSERT INTO seguridad_privado.prueba_calendario_avisos (orden, caso, esperado, obtenido, resultado)
    VALUES (r.orden, r.caso, r.esperado, r.obtenido,
            CASE WHEN r.obtenido IS NOT DISTINCT FROM r.esperado THEN 'OK' ELSE 'FALLA' END);
    RAISE NOTICE '% · % · esperado % · obtenido % · %', r.orden, r.caso, r.esperado, coalesce(r.obtenido, '(nada)'),
      CASE WHEN r.obtenido IS NOT DISTINCT FROM r.esperado THEN 'OK' ELSE 'FALLA' END;
    IF r.obtenido IS DISTINCT FROM r.esperado THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'Prueba del calendario de avisos: % casos, % con FALLA.', jsonb_array_length(v_res), n;
END
$prueba_calendario$;

-- Resultado (solo lectura): todas las filas tienen que decir OK.
SELECT * FROM seguridad_privado.prueba_calendario_avisos ORDER BY orden;
