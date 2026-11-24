-- Análisis · Etapa 4: dibujos sobre el video (uno por clip) y «con / sin dibujos» en cada clip de una playlist.
-- Diseño: docs/analisis-etapa4.md
--
-- Qué cambia (NO modifica ni mueve datos existentes: crea una tabla nueva y agrega una columna con valor por defecto):
--   a) public.analisis_dibujos: los dibujos de un clip (acción + espejo) como JSON con versión (objetos, puntos clave,
--      pausas y subtítulos), máximo 200 KB. Un solo registro por clip. El análisis (partido_id) lo pone la base desde
--      la acción y no se puede cambiar; si se borra la acción o el análisis, se borran sus dibujos.
--      Permisos: escribir solo puede_administrar_analisis(); leer quien puede ver el análisis
--      (puede_consultar_analisis). Nada para anon ni para cuentas de jugadoras (red RESTRICTIVE «sin_cuentas_jugadoras»).
--   b) public.analisis_playlist_clips.con_dibujos (true por defecto, también para los clips que ya existen): si ese
--      clip de la playlist se reproduce con sus dibujos. Los permisos de las playlists no cambian.
--
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase). Espera como máximo 5 s por
-- cada tabla; si está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261127120000_dibujos_clips.sql
-- Verificación posterior (solo lectura): supabase/verification/20261127_dibujos_clips.sql

DO $dibujos_clips$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_eventos') IS NULL OR to_regclass('public.analisis_partidos') IS NULL
     OR to_regclass('public.analisis_playlist_clips') IS NULL
     OR to_regnamespace('seguridad_privado') IS NULL OR to_regnamespace('analisis_privado') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('public.puede_consultar_analisis(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (Análisis, playlists de la etapa 2, esquemas privados, cuentas de jugadoras o la etapa 0). No se tocó nada.';
  END IF;
  IF to_regclass('public.analisis_dibujos') IS NOT NULL OR to_regclass('seguridad_privado.respaldo_dibujos_clips') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'analisis_playlist_clips' AND column_name = 'con_dibujos') THEN
    RAISE EXCEPTION 'Ya está aplicada (existe la tabla, el respaldo o la columna con_dibujos). No se tocó nada.';
  END IF;

  -- 2) Respaldo: lo que se crea.
  CREATE TABLE seguridad_privado.respaldo_dibujos_clips (tipo text NOT NULL, nombre text NOT NULL, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_dibujos_clips FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_dibujos_clips VALUES
    ('tabla', 'public.analisis_dibujos'),
    ('funcion', 'analisis_privado.sellar_dibujo()'),
    ('columna', 'public.analisis_playlist_clips.con_dibujos');

  -- «Con dibujos / sin dibujos» de cada clip de una playlist: con dibujos para todos.
  ALTER TABLE public.analisis_playlist_clips ADD COLUMN con_dibujos boolean NOT NULL DEFAULT true;
  COMMENT ON COLUMN public.analisis_playlist_clips.con_dibujos IS
    'true: el clip se reproduce con sus dibujos (si tiene). false: sin dibujos en esta playlist.';

  -- 3) La tabla.
  CREATE TABLE public.analisis_dibujos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id uuid NOT NULL REFERENCES public.analisis_eventos(id) ON DELETE CASCADE,
    espejo boolean NOT NULL DEFAULT false,
    partido_id uuid NOT NULL REFERENCES public.analisis_partidos(id) ON DELETE CASCADE,
    datos jsonb NOT NULL,
    creado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_por uuid,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dibujos_clip_unico UNIQUE (evento_id, espejo),
    CONSTRAINT dibujos_datos_check CHECK (
      jsonb_typeof(datos) = 'object'
      AND coalesce(datos->>'version', '') ~ '^[1-9][0-9]{0,2}$'
      AND octet_length(datos::text) <= 204800)
  );
  COMMENT ON TABLE public.analisis_dibujos IS
    'Análisis: dibujos de un clip (acción + espejo) sobre el video. datos: JSON versionado (docs/analisis-etapa4.md).';
  CREATE INDEX analisis_dibujos_partido_idx ON public.analisis_dibujos (partido_id);

  -- 4) Sellos; el análisis sale de la acción; un dibujo no cambia de clip.
  CREATE FUNCTION analisis_privado.sellar_dibujo() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  DECLARE
    v_partido uuid;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT e.partido_id INTO v_partido FROM public.analisis_eventos e WHERE e.id = NEW.evento_id;
      IF v_partido IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'La acción de ese clip no existe.';
      END IF;
      NEW.partido_id := v_partido;
      NEW.creado_en := now();
      NEW.creado_por := auth.uid();
    ELSE
      IF NEW.evento_id IS DISTINCT FROM OLD.evento_id OR NEW.espejo IS DISTINCT FROM OLD.espejo THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los dibujos no se pasan a otro clip.';
      END IF;
      NEW.partido_id := OLD.partido_id;
      NEW.creado_en := OLD.creado_en;
      NEW.creado_por := OLD.creado_por;
    END IF;
    NEW.actualizado_en := now();
    NEW.actualizado_por := auth.uid();
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.sellar_dibujo() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER sellar_dibujo BEFORE INSERT OR UPDATE ON public.analisis_dibujos
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.sellar_dibujo();

  -- 5) Seguridad.
  ALTER TABLE public.analisis_dibujos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_dibujos FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.analisis_dibujos FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analisis_dibujos TO authenticated;
  GRANT ALL ON TABLE public.analisis_dibujos TO service_role;
  CREATE POLICY dibujos_lectura ON public.analisis_dibujos AS PERMISSIVE FOR SELECT TO authenticated
    USING ((SELECT public.puede_administrar_analisis()) OR public.puede_consultar_analisis(partido_id));
  CREATE POLICY dibujos_alta ON public.analisis_dibujos AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY dibujos_edicion ON public.analisis_dibujos AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY dibujos_baja ON public.analisis_dibujos AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_dibujos AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  -- 6) Verificación.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_dibujos'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_dibujos') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analisis_dibujos'
                     AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE')
     OR has_table_privilege('anon', 'public.analisis_dibujos', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_dibujos', 'INSERT') THEN
    RAISE EXCEPTION 'La seguridad de la tabla no quedó como se esperaba. Se deshizo todo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_playlist_clips WHERE NOT con_dibujos) THEN
    RAISE EXCEPTION 'Algún clip de playlist quedó sin dibujos sin que nadie lo eligiera. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: dibujos de clips y «con dibujos» en % clips de playlists.',
    (SELECT count(*) FROM public.analisis_playlist_clips);
END
$dibujos_clips$;
