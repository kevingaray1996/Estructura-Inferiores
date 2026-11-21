-- Análisis 2C: eventos del partido atados al video.
--
-- Qué guarda: por cada análisis, las marcas de tiempo del partido (inicio, fin del 1T, inicio del 2T, fin) y,
-- opcionalmente, cambios (sale / entra), goles y tarjetas, cada uno con el segundo del video en que pasó.
-- Hacia dónde atacamos en el 1T ya existe (analisis_partidos.direccion_primer_tiempo): no se toca.
--
-- Qué hace, en un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase):
--   1. Revisa los requisitos (Análisis y la etapa 1 de cuentas de jugadoras) y que no esté aplicada.
--   2. Respaldo: no se modifica ni se borra nada existente. En seguridad_privado.respaldo_eventos_partido se anota lo
--      que se crea, para que la reversión borre exactamente eso.
--   3. Crea public.analisis_partido_eventos:
--        - tipo: inicio_1t, fin_1t, inicio_2t, fin_partido, cambio, gol o tarjeta;
--        - segundo del video (0 a 10 horas);
--        - cambio: jugadora_sale y jugadora_entra (las dos, distintas);
--        - gol y tarjeta: equipo (propio o rival) y, si es propio, la jugadora (opcional);
--        - tarjeta: amarilla o roja;
--        - una sola marca de cada tipo por análisis (no puede haber dos «inicio del partido»);
--        - si se borra el análisis, se borran sus eventos.
--      El orden de las marcas (inicio < fin del 1T < inicio del 2T < fin) lo controla la app, con aviso.
--   4. Un trigger (analisis_privado.sellar_evento_partido) completa quién lo creó y cuándo se modificó, y no deja
--      pasar un evento a otro análisis.
--   5. Seguridad igual que las acciones de Análisis: RLS forzada; leer, crear, editar y borrar solo las dos cuentas
--      administradoras de Análisis (puede_administrar_analisis()); la red RESTRICTIVE «sin_cuentas_jugadoras»;
--      anon sin ningún permiso.
--   6. Verifica, con datos de prueba que se deshacen: que una cuenta administradora carga marcas, un cambio, un gol y
--      una tarjeta; que rechaza una marca repetida y un cambio inválido; que edita y borra; y que otra persona del
--      staff (si hay) no ve ni carga nada. Si algo falla, no se aplica nada.
--
-- Bloqueos: crea una clave foránea hacia analisis_partidos y jugadores (bloqueo corto). Cada bloqueo espera como
-- máximo 5 s: si una tabla está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261121120000_eventos_partido_analisis.sql
-- Verificación posterior (solo lectura): supabase/verification/20261121_eventos_partido_analisis.sql

DO $eventos_partido$
DECLARE
  r record;
  v_admin uuid; v_admin_email text;
  v_otro uuid; v_otro_email text;
  v_cat uuid; v_j1 uuid; v_j2 uuid;
  v_partido uuid := gen_random_uuid();
  v_n integer;
  v_admin_res text := 'sin correr';
  v_otro_res text := 'sin correr';
  v_dup text; v_cambio text; v_tarjeta text; v_rival text; v_mover text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_partidos') IS NULL OR to_regclass('public.jugadores') IS NULL
     OR to_regclass('public.categorias') IS NULL OR to_regclass('public.perfiles') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL
     OR to_regnamespace('analisis_privado') IS NULL THEN
    RAISE EXCEPTION 'Falta Análisis o la etapa 1 de cuentas de jugadoras. No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_partido_eventos') IS NOT NULL OR to_regclass('seguridad_privado.respaldo_eventos_partido') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya estaba aplicada (existe la tabla o el respaldo). No se tocó nada.';
  END IF;

  -- Una de las dos cuentas administradoras de Análisis, y alguien del staff que no lo sea (si hay), para probar.
  FOR r IN SELECT u.id, u.email FROM auth.users u JOIN public.perfiles p ON lower(p.email) = lower(u.email) ORDER BY u.email LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.id, 'email', r.email, 'role', 'authenticated')::text, true);
    IF public.puede_administrar_analisis() THEN
      IF v_admin IS NULL THEN v_admin := r.id; v_admin_email := r.email; END IF;
    ELSIF v_otro IS NULL THEN
      v_otro := r.id; v_otro_email := r.email;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No se encontró una cuenta administradora de Análisis para probar. No se tocó nada.'; END IF;
  SELECT id INTO v_cat FROM public.categorias ORDER BY id LIMIT 1;
  SELECT id INTO v_j1 FROM public.jugadores ORDER BY id LIMIT 1;
  SELECT id INTO v_j2 FROM public.jugadores ORDER BY id OFFSET 1 LIMIT 1;
  IF v_cat IS NULL OR v_j2 IS NULL THEN RAISE EXCEPTION 'Faltan una categoría y dos jugadoras para probar. No se tocó nada.'; END IF;

  -- 2) Respaldo: lo que se crea.
  IF to_regnamespace('seguridad_privado') IS NULL THEN
    CREATE SCHEMA seguridad_privado;
    REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated, service_role;
  END IF;
  CREATE TABLE seguridad_privado.respaldo_eventos_partido (tipo text NOT NULL, nombre text NOT NULL, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON TABLE seguridad_privado.respaldo_eventos_partido FROM PUBLIC, anon, authenticated, service_role;

  -- 3) La tabla.
  CREATE TABLE public.analisis_partido_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partido_id uuid NOT NULL REFERENCES public.analisis_partidos(id) ON DELETE CASCADE,
    tipo text NOT NULL,
    segundo integer NOT NULL,
    jugadora_sale uuid REFERENCES public.jugadores(id) ON DELETE RESTRICT,
    jugadora_entra uuid REFERENCES public.jugadores(id) ON DELETE RESTRICT,
    jugador_id uuid REFERENCES public.jugadores(id) ON DELETE RESTRICT,
    equipo text,
    tarjeta text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    creado_por uuid,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT eventos_partido_tipo_check
      CHECK (tipo IN ('inicio_1t', 'fin_1t', 'inicio_2t', 'fin_partido', 'cambio', 'gol', 'tarjeta')),
    CONSTRAINT eventos_partido_segundo_check CHECK (segundo BETWEEN 0 AND 36000),
    CONSTRAINT eventos_partido_cambio_check CHECK (CASE WHEN tipo = 'cambio'
      THEN jugadora_sale IS NOT NULL AND jugadora_entra IS NOT NULL AND jugadora_sale <> jugadora_entra
      ELSE jugadora_sale IS NULL AND jugadora_entra IS NULL END),
    -- «IS NOT NULL AND …»: sin eso, un valor vacío haría pasar la regla (en SQL, NULL no la hace fallar).
    CONSTRAINT eventos_partido_equipo_check CHECK (CASE WHEN tipo IN ('gol', 'tarjeta')
      THEN equipo IS NOT NULL AND equipo IN ('propio', 'rival') ELSE equipo IS NULL END),
    CONSTRAINT eventos_partido_jugadora_check CHECK (jugador_id IS NULL OR (tipo IN ('gol', 'tarjeta') AND equipo = 'propio')),
    CONSTRAINT eventos_partido_tarjeta_check CHECK (CASE WHEN tipo = 'tarjeta'
      THEN tarjeta IS NOT NULL AND tarjeta IN ('amarilla', 'roja') ELSE tarjeta IS NULL END),
    CONSTRAINT eventos_partido_observaciones_check CHECK (observaciones IS NULL OR char_length(observaciones) <= 200)
  );
  COMMENT ON TABLE public.analisis_partido_eventos IS
    'Análisis: marcas de tiempo del partido, cambios, goles y tarjetas, con el segundo del video.';
  -- Una sola marca de cada tipo por análisis.
  CREATE UNIQUE INDEX analisis_partido_eventos_marca_unica ON public.analisis_partido_eventos (partido_id, tipo)
    WHERE tipo IN ('inicio_1t', 'fin_1t', 'inicio_2t', 'fin_partido');
  CREATE INDEX analisis_partido_eventos_partido_idx ON public.analisis_partido_eventos (partido_id, segundo);
  -- Índices de las claves foráneas a jugadores (borrar o revisar una jugadora no recorre toda la tabla).
  CREATE INDEX analisis_partido_eventos_sale_idx ON public.analisis_partido_eventos (jugadora_sale) WHERE jugadora_sale IS NOT NULL;
  CREATE INDEX analisis_partido_eventos_entra_idx ON public.analisis_partido_eventos (jugadora_entra) WHERE jugadora_entra IS NOT NULL;
  CREATE INDEX analisis_partido_eventos_jugadora_idx ON public.analisis_partido_eventos (jugador_id) WHERE jugador_id IS NOT NULL;

  -- 4) Sellos: quién lo creó y cuándo se modificó; no se pasa a otro análisis.
  CREATE FUNCTION analisis_privado.sellar_evento_partido() RETURNS trigger
    LANGUAGE plpgsql SET search_path = '' AS $f$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      NEW.creado_en := now();
      NEW.creado_por := auth.uid();
    ELSE
      IF NEW.partido_id IS DISTINCT FROM OLD.partido_id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Un evento no se puede pasar a otro análisis.';
      END IF;
      NEW.creado_en := OLD.creado_en;
      NEW.creado_por := OLD.creado_por;
    END IF;
    NEW.actualizado_en := now();
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.sellar_evento_partido() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER sellar_evento_partido BEFORE INSERT OR UPDATE ON public.analisis_partido_eventos
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.sellar_evento_partido();

  -- 5) Seguridad.
  ALTER TABLE public.analisis_partido_eventos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_partido_eventos FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.analisis_partido_eventos FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analisis_partido_eventos TO authenticated;
  GRANT ALL ON TABLE public.analisis_partido_eventos TO service_role;
  CREATE POLICY eventos_partido_lectura ON public.analisis_partido_eventos AS PERMISSIVE FOR SELECT TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY eventos_partido_alta ON public.analisis_partido_eventos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY eventos_partido_edicion ON public.analisis_partido_eventos AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY eventos_partido_baja ON public.analisis_partido_eventos AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_partido_eventos AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  INSERT INTO seguridad_privado.respaldo_eventos_partido (tipo, nombre) VALUES
    ('tabla', 'public.analisis_partido_eventos'),
    ('funcion', 'analisis_privado.sellar_evento_partido()');

  -- 6) Verificación.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_partido_eventos'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partido_eventos') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_partido_eventos'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE')
     OR has_table_privilege('anon', 'public.analisis_partido_eventos', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_partido_eventos', 'INSERT') THEN
    RAISE EXCEPTION 'La seguridad de la tabla no quedó como se esperaba. Se deshizo todo.';
  END IF;

  -- La cuenta administradora: carga, rechaza lo inválido, edita y borra. Todo se deshace al final.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'email', v_admin_email, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.analisis_partidos (id, categoria_id, rival) VALUES (v_partido, v_cat, 'Prueba de eventos (se deshace)');
    INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo) VALUES
      (v_partido, 'inicio_1t', 30), (v_partido, 'fin_1t', 2800), (v_partido, 'inicio_2t', 3400), (v_partido, 'fin_partido', 6200);
    INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, jugadora_sale, jugadora_entra)
      VALUES (v_partido, 'cambio', 4000, v_j1, v_j2);
    INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, equipo, jugador_id) VALUES (v_partido, 'gol', 4500, 'propio', v_j2);
    INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, equipo, tarjeta) VALUES (v_partido, 'tarjeta', 5000, 'rival', 'amarilla');
    SELECT count(*) INTO v_n FROM public.analisis_partido_eventos WHERE partido_id = v_partido AND creado_por = v_admin;

    BEGIN
      INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo) VALUES (v_partido, 'inicio_1t', 40);
      v_dup := 'la aceptó';
    EXCEPTION WHEN unique_violation THEN v_dup := 'ok';
    END;
    BEGIN
      INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, jugadora_sale, jugadora_entra)
        VALUES (v_partido, 'cambio', 4100, v_j1, v_j1);
      v_cambio := 'lo aceptó';
    EXCEPTION WHEN check_violation THEN v_cambio := 'ok';
    END;
    BEGIN
      INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, equipo) VALUES (v_partido, 'tarjeta', 5100, 'propio');
      v_tarjeta := 'la aceptó';
    EXCEPTION WHEN check_violation THEN v_tarjeta := 'ok';
    END;
    BEGIN
      INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, equipo, jugador_id) VALUES (v_partido, 'gol', 5200, 'rival', v_j1);
      v_rival := 'lo aceptó';
    EXCEPTION WHEN check_violation THEN v_rival := 'ok';
    END;
    BEGIN
      UPDATE public.analisis_partido_eventos SET partido_id = gen_random_uuid() WHERE partido_id = v_partido AND tipo = 'gol';
      v_mover := 'lo aceptó';
    EXCEPTION WHEN SQLSTATE '22023' THEN v_mover := 'ok';
    END;
    UPDATE public.analisis_partido_eventos SET segundo = 45 WHERE partido_id = v_partido AND tipo = 'inicio_1t';
    DELETE FROM public.analisis_partido_eventos WHERE partido_id = v_partido AND tipo = 'tarjeta';

    v_admin_res := CASE
      WHEN v_n <> 7 THEN format('cargó %s de 7 eventos', v_n)
      WHEN v_dup <> 'ok' THEN 'una marca repetida: ' || v_dup
      WHEN v_cambio <> 'ok' THEN 'un cambio con la misma jugadora: ' || v_cambio
      WHEN v_tarjeta <> 'ok' THEN 'una tarjeta sin color: ' || v_tarjeta
      WHEN v_rival <> 'ok' THEN 'un gol rival con jugadora propia: ' || v_rival
      WHEN v_mover <> 'ok' THEN 'pasar un evento a otro análisis: ' || v_mover
      WHEN (SELECT segundo FROM public.analisis_partido_eventos WHERE partido_id = v_partido AND tipo = 'inicio_1t') <> 45 THEN 'no pudo editar'
      WHEN (SELECT count(*) FROM public.analisis_partido_eventos WHERE partido_id = v_partido) <> 6 THEN 'no pudo borrar'
      ELSE 'ok' END;

    -- Otra persona del staff: no ve ni carga nada.
    IF v_otro IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_otro, 'email', v_otro_email, 'role', 'authenticated')::text, true);
      SELECT count(*) INTO v_n FROM public.analisis_partido_eventos;
      BEGIN
        INSERT INTO public.analisis_partido_eventos (partido_id, tipo, segundo, equipo) VALUES (v_partido, 'gol', 10, 'rival');
        v_otro_res := 'pudo cargar';
      EXCEPTION WHEN insufficient_privilege THEN
        v_otro_res := CASE WHEN v_n = 0 THEN 'ok' ELSE format('ve %s eventos', v_n) END;
      END;
    ELSE
      v_otro_res := 'no hay otra cuenta del staff para probar';
    END IF;
    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_admin_res := 'error ' || SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  IF v_admin_res <> 'ok' THEN RAISE EXCEPTION 'Prueba de la cuenta administradora: %. Se deshizo todo.', v_admin_res; END IF;
  IF v_otro_res NOT IN ('ok', 'no hay otra cuenta del staff para probar') THEN
    RAISE EXCEPTION 'Prueba de otra cuenta del staff: %. Se deshizo todo.', v_otro_res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_partidos WHERE id = v_partido) OR EXISTS (SELECT 1 FROM public.analisis_partido_eventos) THEN
    RAISE EXCEPTION 'Los datos de prueba no se deshicieron. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'OK: eventos del partido creados. Cuenta administradora: ok. Otra cuenta del staff: %.', v_otro_res;
END
$eventos_partido$;

-- Comprobación final (solo lectura): la tabla, su seguridad y sus reglas de acceso.
SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forzada,
       (SELECT string_agg(p.policyname || ' (' || p.permissive || ', ' || p.cmd || ')', ', ' ORDER BY p.policyname)
          FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS reglas
  FROM pg_class c
 WHERE c.oid = 'public.analisis_partido_eventos'::regclass;
