-- Análisis · Etapa 3: tramos de posesión marcados a mano.
-- Diseño: docs/analisis-etapa3.md
--
-- Qué cambia (NO modifica ni mueve datos existentes: solo crea una tabla nueva):
--   public.analisis_posesion_tramos: lo que se marca a mano en el «Modo posesión» (pelota del equipo analizado, del
--   otro o pelota detenida), con inicio y fin en segundos del video. Lo automático (desde los momentos colectivos) NO se
--   guarda: se calcula en la app. Los tramos a mano de un mismo análisis no se pisan (trigger). Si se borra el análisis,
--   se borran sus tramos.
--   Permisos: escribir solo puede_administrar_analisis(); leer quien puede ver el análisis
--   (puede_consultar_analisis). Nada para anon ni para cuentas de jugadoras (red RESTRICTIVE «sin_cuentas_jugadoras»).
--
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase). Espera como máximo 5 s por
-- cada tabla; si está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261126120000_posesion_tramos.sql
-- Verificación posterior (solo lectura): supabase/verification/20261126_posesion_tramos.sql

DO $posesion_tramos$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_partidos') IS NULL OR to_regnamespace('seguridad_privado') IS NULL
     OR to_regnamespace('analisis_privado') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('public.puede_consultar_analisis(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (Análisis, esquemas privados, cuentas de jugadoras o la etapa 0). No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_posesion_tramos') IS NOT NULL OR to_regclass('seguridad_privado.respaldo_posesion_tramos') IS NOT NULL THEN
    RAISE EXCEPTION 'Ya está aplicada (existe la tabla o el respaldo). No se tocó nada.';
  END IF;

  -- 2) Respaldo: lo que se crea.
  CREATE TABLE seguridad_privado.respaldo_posesion_tramos (tipo text NOT NULL, nombre text NOT NULL, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_posesion_tramos FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_posesion_tramos VALUES
    ('tabla', 'public.analisis_posesion_tramos'),
    ('funcion', 'analisis_privado.sellar_tramo_posesion()');

  -- 3) La tabla.
  CREATE TABLE public.analisis_posesion_tramos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partido_id uuid NOT NULL REFERENCES public.analisis_partidos(id) ON DELETE CASCADE,
    inicio integer NOT NULL,
    fin integer NOT NULL,
    estado text NOT NULL,
    creado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT posesion_tramos_estado_check CHECK (estado IN ('analizado', 'otro', 'detenida')),
    CONSTRAINT posesion_tramos_rango_check CHECK (inicio >= 0 AND fin > inicio AND fin <= 36000)
  );
  COMMENT ON TABLE public.analisis_posesion_tramos IS
    'Análisis: posesión marcada a mano (analizado | otro | detenida). Lo automático sale de los momentos colectivos y no se guarda.';
  CREATE INDEX analisis_posesion_tramos_partido_idx ON public.analisis_posesion_tramos (partido_id, inicio);

  -- 4) Sellos y sin superposición entre tramos a mano del mismo análisis; un tramo no pasa a otro análisis.
  CREATE FUNCTION analisis_privado.sellar_tramo_posesion() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      NEW.creado_en := now();
      NEW.creado_por := auth.uid();
    ELSE
      IF NEW.partido_id IS DISTINCT FROM OLD.partido_id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Un tramo de posesión no se pasa a otro análisis.';
      END IF;
      NEW.creado_en := OLD.creado_en;
      NEW.creado_por := OLD.creado_por;
    END IF;
    NEW.actualizado_en := now();
    -- Se bloquea el análisis para que dos guardados simultáneos no se crucen.
    PERFORM 1 FROM public.analisis_partidos p WHERE p.id = NEW.partido_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.analisis_posesion_tramos t
                WHERE t.partido_id = NEW.partido_id AND t.id <> NEW.id AND t.inicio < NEW.fin AND NEW.inicio < t.fin) THEN
      RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'Ese tramo de posesión se superpone con otro marcado a mano.';
    END IF;
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.sellar_tramo_posesion() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER sellar_tramo_posesion BEFORE INSERT OR UPDATE ON public.analisis_posesion_tramos
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.sellar_tramo_posesion();

  -- 5) Seguridad.
  ALTER TABLE public.analisis_posesion_tramos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_posesion_tramos FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.analisis_posesion_tramos FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analisis_posesion_tramos TO authenticated;
  GRANT ALL ON TABLE public.analisis_posesion_tramos TO service_role;
  CREATE POLICY posesion_tramos_lectura ON public.analisis_posesion_tramos AS PERMISSIVE FOR SELECT TO authenticated
    USING ((SELECT public.puede_administrar_analisis()) OR public.puede_consultar_analisis(partido_id));
  CREATE POLICY posesion_tramos_alta ON public.analisis_posesion_tramos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY posesion_tramos_edicion ON public.analisis_posesion_tramos AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY posesion_tramos_baja ON public.analisis_posesion_tramos AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_posesion_tramos AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  -- 6) Verificación.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_posesion_tramos'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_posesion_tramos') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_posesion_tramos'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE')
     OR has_table_privilege('anon', 'public.analisis_posesion_tramos', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_posesion_tramos', 'INSERT') THEN
    RAISE EXCEPTION 'La seguridad de la tabla no quedó como se esperaba. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: tramos de posesión marcados a mano.';
END
$posesion_tramos$;
