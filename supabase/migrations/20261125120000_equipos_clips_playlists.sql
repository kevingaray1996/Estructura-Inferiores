-- Análisis · Etapa 2: equipos como listado, márgenes de los clips y playlists.
-- Diseño: docs/analisis-etapa2.md
--
-- Qué cambia (NO modifica ni mueve datos existentes: agrega columnas con valor por defecto, dos tablas nuevas y
-- equipos nuevos al listado):
--   a) public.equipos (ya existe: «Equipos · Rivales y escudos»):
--        - activo (true por defecto): un equipo inactivo no aparece al cargar, pero sus datos siguen en los filtros;
--        - se AGREGAN los nombres distintos que aparecen como rival en partidos y en los análisis (y como local o
--          visitante en los scouting) y que todavía no están en el listado. Se compara sin mayúsculas, acentos ni
--          espacios de más. Los que se agregan quedan anotados en el respaldo.
--        - Los permisos de equipos NO cambian.
--   b) public.analisis_partidos: equipo_local_id y equipo_visitante_id (referencia al listado, solo en scouting).
--      Los análisis que ya existen quedan con esas columnas vacías (no se vinculan solos).
--   c) public.analisis_tipos_accion: margen_antes y margen_despues (segundos del clip antes y después de la acción).
--      Pase −4/+2, Pérdida −5/+5, Remate −6/+3, Falta −3/+8, Gol −15/+5, el resto −4/+3; colectivas −2/+2.
--   d) Tablas nuevas public.analisis_playlists y public.analisis_playlist_clips (el ajuste de inicio y fin de cada
--      clip vive en la playlist: la acción original no se toca).
--   e) Permisos de las tablas nuevas: escribir solo puede_administrar_analisis(); leer coordinación (todas) y el cuerpo
--      técnico (las de su categoría) con public.puede_consultar_playlist(categoria). Nada para anon ni para cuentas
--      de jugadoras (red RESTRICTIVE «sin_cuentas_jugadoras»).
--
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase). Espera como máximo 5 s por
-- cada tabla; si está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261125120000_equipos_clips_playlists.sql
-- Verificación posterior (solo lectura): supabase/verification/20261125_equipos_clips_playlists.sql
-- Listado de equipos para revisar (solo lectura): supabase/verification/20261125_equipos_listado.sql

DO $equipos_clips_playlists$
DECLARE
  v_escritura text;
  v_agregados integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.equipos') IS NULL OR to_regclass('public.partidos') IS NULL
     OR to_regclass('public.analisis_partidos') IS NULL OR to_regclass('public.analisis_eventos') IS NULL
     OR to_regclass('public.analisis_tipos_accion') IS NULL OR to_regclass('public.categorias') IS NULL
     OR to_regnamespace('seguridad_privado') IS NULL OR to_regnamespace('analisis_privado') IS NULL
     OR to_regnamespace('portal_privado') IS NULL
     OR to_regprocedure('portal_privado.es_cuenta_jugadora()') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('public.puede_consultar_analisis(uuid)') IS NULL
     OR to_regprocedure('public.mi_rol()') IS NULL OR to_regprocedure('public.mi_categoria()') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (tablas de Análisis, equipos, esquemas privados, cuentas de jugadoras o la etapa 0). No se tocó nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                  AND table_name = 'analisis_tipos_accion' AND column_name = 'botonera') THEN
    RAISE EXCEPTION 'Falta la etapa 1 (botonera colectiva: 20261124120000). No se tocó nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_clips_playlists') IS NOT NULL
     OR to_regclass('public.analisis_playlists') IS NOT NULL OR to_regclass('public.analisis_playlist_clips') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND ((table_name = 'equipos' AND column_name = 'activo')
                   OR (table_name = 'analisis_partidos' AND column_name IN ('equipo_local_id', 'equipo_visitante_id'))
                   OR (table_name = 'analisis_tipos_accion' AND column_name IN ('margen_antes', 'margen_despues')))) THEN
    RAISE EXCEPTION 'Ya está aplicada (existe el respaldo, alguna tabla o alguna columna nueva). No se tocó nada.';
  END IF;

  -- Escribir en Análisis: solo las administradoras (igual que en las etapas anteriores).
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_partido_eventos', 'analisis_pases_detalle',
                       'analisis_tipos_accion', 'analisis_comet_nombres')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Hay reglas que dejan escribir en Análisis a otras cuentas: %. No se tocó nada.', v_escritura;
  END IF;

  -- 2) Respaldo: lo que se crea y los equipos que se agregan (para que la reversión saque solo esos).
  CREATE TABLE seguridad_privado.respaldo_clips_playlists (
    tipo text NOT NULL, nombre text NOT NULL, definicion text, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_clips_playlists FROM PUBLIC, anon, authenticated;
  CREATE TABLE seguridad_privado.respaldo_equipos_agregados (id uuid PRIMARY KEY, nombre text NOT NULL);
  REVOKE ALL ON seguridad_privado.respaldo_equipos_agregados FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_clips_playlists VALUES
    ('columnas', 'public.equipos', 'activo'),
    ('columnas', 'public.analisis_partidos', 'equipo_local_id, equipo_visitante_id'),
    ('columnas', 'public.analisis_tipos_accion', 'margen_antes, margen_despues'),
    ('tabla', 'public.analisis_playlists', NULL),
    ('tabla', 'public.analisis_playlist_clips', NULL),
    ('funcion', 'public.puede_consultar_playlist(uuid)', NULL),
    ('funcion', 'analisis_privado.nombre_equipo_normalizado(text)', NULL),
    ('funcion', 'analisis_privado.sellar_playlist()', NULL),
    ('funcion', 'analisis_privado.sellar_clip_playlist()', NULL);

  -- 3) Equipos: activo y carga de los nombres que faltan.
  CREATE FUNCTION analisis_privado.nombre_equipo_normalizado(p_nombre text) RETURNS text
    LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
    SELECT lower(btrim(regexp_replace(translate(coalesce(p_nombre, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '\s+', ' ', 'g')))
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.nombre_equipo_normalizado(text) FROM PUBLIC, anon, authenticated, service_role;

  ALTER TABLE public.equipos ADD COLUMN activo boolean NOT NULL DEFAULT true;
  COMMENT ON COLUMN public.equipos.activo IS 'false: no aparece al cargar partidos o scouting; sus datos siguen visibles en los filtros.';

  WITH nombres AS (
    SELECT btrim(regexp_replace(n, '\s+', ' ', 'g')) AS nombre FROM (
      SELECT rival AS n FROM public.partidos WHERE equipo_id IS NULL
      UNION ALL SELECT rival FROM public.analisis_partidos WHERE tipo_partido = 'propio'
      UNION ALL SELECT equipo_local FROM public.analisis_partidos WHERE tipo_partido = 'scouting'
      UNION ALL SELECT equipo_visitante FROM public.analisis_partidos WHERE tipo_partido = 'scouting') t
    WHERE n IS NOT NULL AND btrim(n) <> ''
  ), elegidos AS (
    -- Una sola forma por nombre normalizado: la más usada (y, si empatan, la primera en orden alfabético).
    SELECT DISTINCT ON (analisis_privado.nombre_equipo_normalizado(nombre)) nombre
      FROM (SELECT nombre, count(*) AS usos FROM nombres GROUP BY nombre) c
     ORDER BY analisis_privado.nombre_equipo_normalizado(nombre), usos DESC, nombre
  ), nuevos AS (
    INSERT INTO public.equipos (nombre)
    SELECT e.nombre FROM elegidos e
     WHERE analisis_privado.nombre_equipo_normalizado(e.nombre) NOT LIKE '%comunicaciones%'
       AND char_length(e.nombre) <= 60
       AND NOT EXISTS (SELECT 1 FROM public.equipos q
                        WHERE analisis_privado.nombre_equipo_normalizado(q.nombre) = analisis_privado.nombre_equipo_normalizado(e.nombre))
    RETURNING id, nombre
  )
  INSERT INTO seguridad_privado.respaldo_equipos_agregados (id, nombre) SELECT id, nombre FROM nuevos;
  GET DIAGNOSTICS v_agregados = ROW_COUNT;

  -- 4) Scouting: referencia al listado (el nombre se sigue guardando).
  ALTER TABLE public.analisis_partidos
    ADD COLUMN equipo_local_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL,
    ADD COLUMN equipo_visitante_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL;
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_equipos_ids_check CHECK (
    (tipo_partido = 'scouting' OR (equipo_local_id IS NULL AND equipo_visitante_id IS NULL))
    AND (equipo_local_id IS NULL OR equipo_visitante_id IS NULL OR equipo_local_id <> equipo_visitante_id));
  CREATE INDEX analisis_partidos_equipo_local_idx ON public.analisis_partidos (equipo_local_id) WHERE equipo_local_id IS NOT NULL;
  CREATE INDEX analisis_partidos_equipo_visitante_idx ON public.analisis_partidos (equipo_visitante_id) WHERE equipo_visitante_id IS NOT NULL;
  COMMENT ON COLUMN public.analisis_partidos.equipo_local_id IS 'Scouting: equipo local del listado (equipos).';
  COMMENT ON COLUMN public.analisis_partidos.equipo_visitante_id IS 'Scouting: equipo visitante del listado (equipos).';

  -- 5) Márgenes de los clips en el catálogo.
  ALTER TABLE public.analisis_tipos_accion
    ADD COLUMN margen_antes smallint NOT NULL DEFAULT 4,
    ADD COLUMN margen_despues smallint NOT NULL DEFAULT 3;
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_margenes_check
    CHECK (margen_antes BETWEEN 0 AND 60 AND margen_despues BETWEEN 0 AND 60);
  COMMENT ON COLUMN public.analisis_tipos_accion.margen_antes IS 'Clip: segundos antes de la acción (colectiva: antes del inicio).';
  COMMENT ON COLUMN public.analisis_tipos_accion.margen_despues IS 'Clip: segundos después de la acción (colectiva: después del fin).';
  UPDATE public.analisis_tipos_accion t SET margen_antes = m.antes, margen_despues = m.despues
    FROM (VALUES ('Pase correcto', 4, 2), ('Pase incorrecto', 4, 2), ('Pérdida', 5, 5), ('Remate', 6, 3),
                 ('Falta cometida', 3, 8), ('Falta recibida', 3, 8), ('Gol', 15, 5)) AS m(codigo, antes, despues)
   WHERE t.codigo = m.codigo AND t.botonera = 'individual';
  UPDATE public.analisis_tipos_accion SET margen_antes = 2, margen_despues = 2 WHERE botonera = 'colectiva';

  -- 6) Playlists.
  CREATE TABLE public.analisis_playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
    nombre text NOT NULL,
    descripcion text,
    filtro jsonb,
    quitados text[] NOT NULL DEFAULT '{}',
    creado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT playlists_nombre_check CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 80),
    CONSTRAINT playlists_descripcion_check CHECK (descripcion IS NULL OR char_length(descripcion) <= 500),
    CONSTRAINT playlists_filtro_check CHECK (filtro IS NULL OR (jsonb_typeof(filtro) = 'object' AND pg_column_size(filtro) <= 8000)),
    CONSTRAINT playlists_quitados_check CHECK (cardinality(quitados) <= 2000)
  );
  COMMENT ON TABLE public.analisis_playlists IS 'Análisis: playlists guardadas (lista fija de clips, más el filtro con que se armó).';
  CREATE INDEX analisis_playlists_categoria_idx ON public.analisis_playlists (categoria_id);

  CREATE TABLE public.analisis_playlist_clips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid NOT NULL REFERENCES public.analisis_playlists(id) ON DELETE CASCADE,
    evento_id uuid NOT NULL REFERENCES public.analisis_eventos(id) ON DELETE CASCADE,
    espejo boolean NOT NULL DEFAULT false,
    orden integer NOT NULL DEFAULT 0,
    nota text,
    ajuste_inicio smallint NOT NULL DEFAULT 0,
    ajuste_fin smallint NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT playlist_clips_unico UNIQUE (playlist_id, evento_id, espejo),
    CONSTRAINT playlist_clips_orden_check CHECK (orden >= 0),
    CONSTRAINT playlist_clips_nota_check CHECK (nota IS NULL OR char_length(nota) <= 300),
    CONSTRAINT playlist_clips_ajuste_check CHECK (ajuste_inicio BETWEEN -120 AND 120 AND ajuste_fin BETWEEN -120 AND 120)
  );
  COMMENT ON TABLE public.analisis_playlist_clips IS 'Análisis: clips de una playlist. El ajuste de inicio y fin es solo de la playlist; la acción original no cambia.';
  COMMENT ON COLUMN public.analisis_playlist_clips.espejo IS 'true: el momento visto desde el otro equipo (su espejo).';
  CREATE INDEX analisis_playlist_clips_playlist_idx ON public.analisis_playlist_clips (playlist_id, orden);
  CREATE INDEX analisis_playlist_clips_evento_idx ON public.analisis_playlist_clips (evento_id);

  -- Sellos: quién la creó y cuándo cambió; un clip no se pasa a otra playlist ni cambia de acción.
  CREATE FUNCTION analisis_privado.sellar_playlist() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      NEW.creado_en := now();
      NEW.creado_por := auth.uid();
    ELSE
      NEW.creado_en := OLD.creado_en;
      NEW.creado_por := OLD.creado_por;
    END IF;
    NEW.actualizado_en := now();
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.sellar_playlist() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER sellar_playlist BEFORE INSERT OR UPDATE ON public.analisis_playlists
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.sellar_playlist();

  CREATE FUNCTION analisis_privado.sellar_clip_playlist() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.playlist_id IS DISTINCT FROM OLD.playlist_id OR NEW.evento_id IS DISTINCT FROM OLD.evento_id
                             OR NEW.espejo IS DISTINCT FROM OLD.espejo) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Un clip no se pasa a otra playlist ni cambia de acción.';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.creado_en := now(); ELSE NEW.creado_en := OLD.creado_en; END IF;
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.sellar_clip_playlist() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER sellar_clip_playlist BEFORE INSERT OR UPDATE ON public.analisis_playlist_clips
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.sellar_clip_playlist();

  -- ¿Puede ver las playlists de esta categoría? Administradoras y coordinación: todas. Técnica: las de su categoría.
  CREATE FUNCTION public.puede_consultar_playlist(p_categoria_id uuid)
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $funcion$
    SELECT coalesce(auth.role() = 'authenticated' AND (
      public.puede_administrar_analisis()
      OR public.mi_rol() = 'coordinacion'
      OR (public.mi_rol() = 'tecnico' AND p_categoria_id = public.mi_categoria())), false);
  $funcion$;
  COMMENT ON FUNCTION public.puede_consultar_playlist(uuid) IS
    'Análisis: true si la cuenta puede VER las playlists de esa categoría (coordinación: todas; técnica: la suya). No da permiso para escribir.';
  REVOKE ALL ON FUNCTION public.puede_consultar_playlist(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.puede_consultar_playlist(uuid) TO authenticated;

  -- 7) Seguridad de las tablas nuevas.
  ALTER TABLE public.analisis_playlists ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_playlists FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_playlist_clips ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.analisis_playlist_clips FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.analisis_playlists, public.analisis_playlist_clips FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analisis_playlists, public.analisis_playlist_clips TO authenticated;
  GRANT ALL ON TABLE public.analisis_playlists, public.analisis_playlist_clips TO service_role;

  CREATE POLICY playlists_lectura ON public.analisis_playlists AS PERMISSIVE FOR SELECT TO authenticated
    USING (public.puede_consultar_playlist(categoria_id));
  CREATE POLICY playlists_alta ON public.analisis_playlists AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY playlists_edicion ON public.analisis_playlists AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY playlists_baja ON public.analisis_playlists AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_playlists AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  -- Un clip se ve si se ve su playlist (la subconsulta respeta la regla de lectura de playlists).
  CREATE POLICY playlist_clips_lectura ON public.analisis_playlist_clips AS PERMISSIVE FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.analisis_playlists p WHERE p.id = analisis_playlist_clips.playlist_id));
  CREATE POLICY playlist_clips_alta ON public.analisis_playlist_clips AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY playlist_clips_edicion ON public.analisis_playlist_clips AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((SELECT public.puede_administrar_analisis())) WITH CHECK ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY playlist_clips_baja ON public.analisis_playlist_clips AS PERMISSIVE FOR DELETE TO authenticated
    USING ((SELECT public.puede_administrar_analisis()));
  CREATE POLICY sin_cuentas_jugadoras ON public.analisis_playlist_clips AS RESTRICTIVE FOR ALL TO authenticated
    USING (NOT (SELECT portal_privado.es_cuenta_jugadora())) WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));

  -- 8) Verificación.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_playlists'::regclass)
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.analisis_playlist_clips'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analisis_playlists', 'analisis_playlist_clips')) <> 10
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analisis_playlists', 'analisis_playlist_clips')
           AND policyname = 'sin_cuentas_jugadoras' AND permissive = 'RESTRICTIVE') <> 2
     OR has_table_privilege('anon', 'public.analisis_playlists', 'SELECT')
     OR has_table_privilege('anon', 'public.analisis_playlist_clips', 'SELECT')
     OR has_function_privilege('anon', 'public.puede_consultar_playlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'La seguridad de las tablas nuevas no quedó como se esperaba. Se deshizo todo.';
  END IF;
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_escritura
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('analisis_playlists', 'analisis_playlist_clips')
     AND permissive = 'PERMISSIVE' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND NOT (coalesce(qual, with_check) LIKE '%puede_administrar_analisis%'
              AND coalesce(with_check, qual) LIKE '%puede_administrar_analisis%');
  IF v_escritura IS NOT NULL THEN
    RAISE EXCEPTION 'Reglas de escritura sin puede_administrar_analisis en las tablas nuevas: %. Se deshizo todo.', v_escritura;
  END IF;
  IF EXISTS (SELECT 1 FROM public.equipos WHERE NOT activo)
     OR EXISTS (SELECT 1 FROM public.analisis_partidos WHERE equipo_local_id IS NOT NULL OR equipo_visitante_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.analisis_tipos_accion WHERE botonera = 'colectiva' AND (margen_antes <> 2 OR margen_despues <> 2)) THEN
    RAISE EXCEPTION 'Los datos no quedaron como se esperaba. Se deshizo todo.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: equipos (% agregados al listado), márgenes de clips y playlists.', v_agregados;
END
$equipos_clips_playlists$;
