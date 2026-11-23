-- Análisis · Etapa 1: botonera colectiva, equipo analizado y partidos de scouting.
-- Diseño: docs/analisis-etapa1.md
--
-- Qué cambia (NO modifica ni mueve datos existentes: solo agrega columnas con valor por defecto, amplía una regla y
-- agrega botones nuevos al catálogo):
--   a) public.analisis_tipos_accion (catálogo de botones):
--        - botonera: 'individual' (todos los de hoy) o 'colectiva';
--        - duracion_defecto: segundos que dura un momento colectivo si no se cierra a mano (solo colectivos);
--        - espejo: lo que hacía el otro equipo en ese momento (otro tipo colectivo, opcional);
--        - grupos nuevos para la colectiva: con_pelota, sin_pelota, charla (pelota_parada ya existía);
--        - 13 botones colectivos nuevos (Salida, Ataque posicional, Transición ofensiva, Presión alta, Defensa
--          organizada, Transición defensiva, Salida rival, Córner a favor / en contra, Tiro libre a favor / en contra,
--          Error defensivo, Acción destacada).
--   b) public.analisis_eventos (acciones): una acción colectiva es una fila más, sin jugadora y con segundo_fin. Un
--      trigger obliga a esa forma: colectiva → sin jugadora y con fin; individual → sin fin (como todas las de hoy).
--   c) public.analisis_partidos (análisis): tipo_partido ('propio' por defecto | 'scouting'), equipo_local,
--      equipo_visitante y equipo_analizado ('propio' por defecto | 'rival' | 'local' | 'visitante'). Un scouting no
--      se vincula al calendario: no cuenta en convocatorias, minutos ni estadísticas del club.
--      En un scouting solo se aceptan acciones de la botonera colectiva (lo controla el trigger de las acciones), y un
--      análisis con acciones individuales no se puede pasar a scouting (trigger analisis_privado.validar_tipo_partido).
--   d) Permisos: NO cambian. Escribir solo puede_administrar_analisis(); leer, las reglas de la etapa 0
--      (puede_consultar_analisis()). Nada para anon ni para cuentas de jugadoras.
--
-- Si hoy hay botones individuales con nombre parecido a los colectivos (córner, tiro libre, transición, presión),
-- NO se tocan: se listan en un aviso (NOTICE) para decidir a mano.
--
-- Un único bloque DO (todo o nada; correr como postgres en el editor SQL de Supabase). Espera como máximo 5 s por
-- cada tabla; si está ocupada, aborta sin aplicar nada y se vuelve a correr.
-- Reversión: supabase/rollback/20261124120000_botonera_colectiva.sql
-- Verificación posterior (solo lectura): supabase/verification/20261124_botonera_colectiva.sql

DO $botonera_colectiva$
DECLARE
  v_grupo_antes text;
  v_escritura text;
  v_parecidos text;
  v_reglas_antes text;
  v_n integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).'; END IF;

  -- 1) Requisitos.
  IF to_regclass('public.analisis_tipos_accion') IS NULL OR to_regclass('public.analisis_eventos') IS NULL
     OR to_regclass('public.analisis_partidos') IS NULL OR to_regnamespace('seguridad_privado') IS NULL
     OR to_regnamespace('analisis_privado') IS NULL
     OR to_regprocedure('public.puede_administrar_analisis()') IS NULL
     OR to_regprocedure('public.puede_consultar_analisis(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan requisitos (tablas de Análisis, esquemas privados o la etapa 0: puede_consultar_analisis). No se tocó nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                  AND table_name = 'analisis_eventos' AND column_name = 'segundo_fin') THEN
    RAISE EXCEPTION 'Falta analisis_eventos.segundo_fin (etapa 0). No se tocó nada.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_botonera_colectiva') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND ((table_name = 'analisis_tipos_accion' AND column_name IN ('botonera', 'duracion_defecto', 'espejo'))
                   OR (table_name = 'analisis_partidos' AND column_name IN ('tipo_partido', 'equipo_local', 'equipo_visitante', 'equipo_analizado')))) THEN
    RAISE EXCEPTION 'Ya está aplicada (existe el respaldo o alguna columna nueva). No se tocó nada.';
  END IF;
  -- Datos que habría que mover o cambiar: no se aplica nada y se decide a mano.
  SELECT count(*) INTO v_n FROM public.analisis_eventos WHERE segundo_fin IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Hay % acciones con segundo_fin cargado y todavía no existen acciones colectivas. Revisarlas antes. No se tocó nada.', v_n;
  END IF;
  SELECT string_agg(codigo, ', ' ORDER BY codigo) INTO v_parecidos FROM public.analisis_tipos_accion
   WHERE codigo IN ('Salida', 'Ataque posicional', 'Transición ofensiva', 'Presión alta', 'Defensa organizada',
                    'Transición defensiva', 'Salida rival', 'Córner a favor', 'Córner en contra', 'Tiro libre a favor',
                    'Tiro libre en contra', 'Error defensivo', 'Acción destacada');
  IF v_parecidos IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existen botones con el mismo código que los colectivos nuevos: %. No se tocó nada (decidir qué hacer con ellos).', v_parecidos;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_grupo_antes FROM pg_constraint
   WHERE conrelid = 'public.analisis_tipos_accion'::regclass AND conname = 'analisis_tipos_accion_grupo_check';
  IF v_grupo_antes IS NULL THEN
    RAISE EXCEPTION 'No está la regla analisis_tipos_accion_grupo_check. No se tocó nada.';
  END IF;

  -- Escribir en Análisis: solo las administradoras (igual que en la etapa 0).
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
  SELECT string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname)
    INTO v_reglas_antes FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_tipos_accion');

  -- 2) Respaldo: la regla de grupos de antes y la lista de lo que se crea.
  CREATE TABLE seguridad_privado.respaldo_botonera_colectiva (
    tipo text NOT NULL, nombre text NOT NULL, definicion text, PRIMARY KEY (tipo, nombre));
  REVOKE ALL ON seguridad_privado.respaldo_botonera_colectiva FROM PUBLIC, anon, authenticated;
  INSERT INTO seguridad_privado.respaldo_botonera_colectiva VALUES
    ('regla_anterior', 'analisis_tipos_accion_grupo_check', v_grupo_antes),
    ('columnas', 'public.analisis_tipos_accion', 'botonera, duracion_defecto, espejo'),
    ('columnas', 'public.analisis_partidos', 'tipo_partido, equipo_local, equipo_visitante, equipo_analizado'),
    ('funcion', 'analisis_privado.validar_tipo_colectivo()', NULL),
    ('funcion', 'analisis_privado.validar_forma_accion()', NULL),
    ('funcion', 'analisis_privado.validar_tipo_partido()', NULL);

  -- 3) Catálogo: columnas y reglas.
  ALTER TABLE public.analisis_tipos_accion ADD COLUMN botonera text NOT NULL DEFAULT 'individual';
  ALTER TABLE public.analisis_tipos_accion ADD COLUMN duracion_defecto smallint;
  ALTER TABLE public.analisis_tipos_accion ADD COLUMN espejo text
    REFERENCES public.analisis_tipos_accion(codigo) ON UPDATE CASCADE ON DELETE SET NULL;
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_botonera_check CHECK (botonera IN ('individual', 'colectiva'));
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_duracion_check
    CHECK ((botonera = 'colectiva') = (duracion_defecto IS NOT NULL) AND (duracion_defecto IS NULL OR duracion_defecto BETWEEN 1 AND 600));
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_espejo_check
    CHECK (espejo IS NULL OR (botonera = 'colectiva' AND espejo <> codigo));
  -- La colectiva no tiene resultado ni pases.
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_colectiva_sin_resultado
    CHECK (botonera = 'individual' OR (cardinality(resultados) = 0 AND resultado_implicito IS NULL AND NOT es_pase));
  ALTER TABLE public.analisis_tipos_accion DROP CONSTRAINT analisis_tipos_accion_grupo_check;
  ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_grupo_check CHECK (
    (botonera = 'individual' AND grupo IN ('ofensiva', 'defensiva', 'arquera', 'pelota_parada', 'otras'))
    OR (botonera = 'colectiva' AND grupo IN ('con_pelota', 'sin_pelota', 'pelota_parada', 'charla')));
  COMMENT ON COLUMN public.analisis_tipos_accion.botonera IS 'individual (con jugadora) o colectiva (momentos que duran, sin jugadora).';
  COMMENT ON COLUMN public.analisis_tipos_accion.duracion_defecto IS 'Colectiva: segundos que dura el momento si no se cierra a mano.';
  COMMENT ON COLUMN public.analisis_tipos_accion.espejo IS 'Colectiva: lo que hacía el otro equipo en ese momento. Se calcula al consultar; nunca se guarda doble.';

  -- El espejo apunta a otro colectivo; un botón que ya tiene acciones no cambia de botonera.
  CREATE FUNCTION analisis_privado.validar_tipo_colectivo() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  BEGIN
    IF NEW.espejo IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.analisis_tipos_accion t WHERE t.codigo = NEW.espejo AND t.botonera = 'colectiva') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El espejo tiene que ser un botón de la botonera colectiva.';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.botonera IS DISTINCT FROM OLD.botonera THEN
      IF EXISTS (SELECT 1 FROM public.analisis_eventos e WHERE e.tipo = OLD.codigo) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Este botón ya tiene acciones: no se puede pasar a la otra botonera.';
      END IF;
      IF NEW.botonera = 'individual' AND EXISTS (SELECT 1 FROM public.analisis_tipos_accion t WHERE t.espejo = OLD.codigo) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Otro botón lo usa como espejo: sacale ese espejo primero.';
      END IF;
    END IF;
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.validar_tipo_colectivo() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER validar_tipo_colectivo BEFORE INSERT OR UPDATE OF espejo, botonera ON public.analisis_tipos_accion
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.validar_tipo_colectivo();

  -- 4) Botones colectivos. Primero sin espejo (el espejo apunta a filas que tienen que existir).
  INSERT INTO public.analisis_tipos_accion
    (codigo, etiqueta, etiqueta_boton, icono, color, ubicacion, resultados, resultado_implicito, es_pase, grupo, orden, visible, botonera, duracion_defecto) VALUES
    ('Salida',               'Salida',               'Salida',          '⇡', 'acento',  'opcional', '{}', NULL, false, 'con_pelota',    101, true, 'colectiva', 15),
    ('Ataque posicional',    'Ataque posicional',    'Ataque posic.',   '▤', 'acento',  'opcional', '{}', NULL, false, 'con_pelota',    102, true, 'colectiva', 30),
    ('Transición ofensiva',  'Transición ofensiva',  'Transición of.',  '»', 'acento',  'opcional', '{}', NULL, false, 'con_pelota',    103, true, 'colectiva', 10),
    ('Presión alta',         'Presión alta',         'Presión alta',    '⤒', 'info',    'opcional', '{}', NULL, false, 'sin_pelota',    104, true, 'colectiva', 10),
    ('Defensa organizada',   'Defensa organizada',   'Defensa org.',    '▦', 'info',    'opcional', '{}', NULL, false, 'sin_pelota',    105, true, 'colectiva', 30),
    ('Transición defensiva', 'Transición defensiva', 'Transición def.', '«', 'info',    'opcional', '{}', NULL, false, 'sin_pelota',    106, true, 'colectiva', 10),
    ('Salida rival',         'Salida rival',         'Salida rival',    '⇣', 'info',    'opcional', '{}', NULL, false, 'sin_pelota',    107, true, 'colectiva', 15),
    ('Córner a favor',       'Córner a favor',       'Córner a favor',  '◥', 'alerta',  'opcional', '{}', NULL, false, 'pelota_parada', 108, true, 'colectiva', 15),
    ('Córner en contra',     'Córner en contra',     'Córner en contra','◣', 'alerta',  'opcional', '{}', NULL, false, 'pelota_parada', 109, true, 'colectiva', 15),
    ('Tiro libre a favor',   'Tiro libre a favor',   'T. libre a favor','◉', 'alerta',  'opcional', '{}', NULL, false, 'pelota_parada', 110, true, 'colectiva', 15),
    ('Tiro libre en contra', 'Tiro libre en contra', 'T. libre contra', '○', 'alerta',  'opcional', '{}', NULL, false, 'pelota_parada', 111, true, 'colectiva', 15),
    ('Error defensivo',      'Error defensivo',      'Error def.',      '!', 'peligro', 'opcional', '{}', NULL, false, 'charla',        112, true, 'colectiva', 6),
    ('Acción destacada',     'Acción destacada',     'Destacada',       '★', 'neutro',  'opcional', '{}', NULL, false, 'charla',        113, true, 'colectiva', 6);
  UPDATE public.analisis_tipos_accion SET espejo = m.espejo
    FROM (VALUES ('Transición ofensiva', 'Transición defensiva'), ('Transición defensiva', 'Transición ofensiva'),
                 ('Ataque posicional', 'Defensa organizada'), ('Defensa organizada', 'Ataque posicional'),
                 ('Córner a favor', 'Córner en contra'), ('Córner en contra', 'Córner a favor'),
                 ('Tiro libre a favor', 'Tiro libre en contra'), ('Tiro libre en contra', 'Tiro libre a favor'),
                 ('Presión alta', 'Salida'), ('Salida rival', 'Salida')) AS m(codigo, espejo)
   WHERE analisis_tipos_accion.codigo = m.codigo;

  -- 5) Acciones: forma según la botonera.
  CREATE FUNCTION analisis_privado.validar_forma_accion() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  DECLARE v_botonera text;
  BEGIN
    SELECT t.botonera INTO v_botonera FROM public.analisis_tipos_accion t WHERE t.codigo = NEW.tipo;
    IF v_botonera = 'colectiva' THEN
      IF NEW.jugador_id IS NOT NULL OR NEW.segundo_fin IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Una acción colectiva va sin jugadora y con inicio y fin.';
      END IF;
    ELSE
      IF NEW.segundo_fin IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Una acción individual es de un instante: va sin fin.';
      END IF;
      -- Scouting (no juega Comunicaciones): solo la botonera colectiva.
      IF EXISTS (SELECT 1 FROM public.analisis_partidos p WHERE p.id = NEW.partido_id AND p.tipo_partido = 'scouting') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'En un partido de scouting solo se cargan acciones de la botonera colectiva.';
      END IF;
    END IF;
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.validar_forma_accion() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER validar_forma_accion BEFORE INSERT OR UPDATE OF tipo, jugador_id, segundo_fin, partido_id ON public.analisis_eventos
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.validar_forma_accion();

  -- 6) Análisis: propio o scouting y equipo analizado.
  ALTER TABLE public.analisis_partidos ADD COLUMN tipo_partido text NOT NULL DEFAULT 'propio';
  ALTER TABLE public.analisis_partidos ADD COLUMN equipo_local text;
  ALTER TABLE public.analisis_partidos ADD COLUMN equipo_visitante text;
  ALTER TABLE public.analisis_partidos ADD COLUMN equipo_analizado text NOT NULL DEFAULT 'propio';
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_tipo_partido_check CHECK (tipo_partido IN ('propio', 'scouting'));
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_equipos_check CHECK (
    (equipo_local IS NULL OR char_length(btrim(equipo_local)) BETWEEN 1 AND 60)
    AND (equipo_visitante IS NULL OR char_length(btrim(equipo_visitante)) BETWEEN 1 AND 60));
  ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_equipo_analizado_check CHECK (CASE tipo_partido
    WHEN 'propio' THEN equipo_analizado IN ('propio', 'rival')
    ELSE equipo_analizado IN ('local', 'visitante') AND equipo_local IS NOT NULL AND equipo_visitante IS NOT NULL
         AND partido_calendario_id IS NULL END);
  COMMENT ON COLUMN public.analisis_partidos.tipo_partido IS 'propio (juega Comunicaciones) o scouting (rival contra otro club; no cuenta en estadísticas, convocatoria ni minutos).';
  -- Un análisis con acciones individuales no pasa a scouting (quedarían acciones que el scouting no acepta).
  CREATE FUNCTION analisis_privado.validar_tipo_partido() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO '' AS $f$
  BEGIN
    IF NEW.tipo_partido = 'scouting' AND EXISTS (
         SELECT 1 FROM public.analisis_eventos e JOIN public.analisis_tipos_accion t ON t.codigo = e.tipo
          WHERE e.partido_id = NEW.id AND t.botonera <> 'colectiva') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Este análisis tiene acciones individuales: no se puede pasar a scouting.';
    END IF;
    RETURN NEW;
  END
  $f$;
  REVOKE ALL ON FUNCTION analisis_privado.validar_tipo_partido() FROM PUBLIC, anon, authenticated, service_role;
  CREATE TRIGGER validar_tipo_partido BEFORE UPDATE OF tipo_partido ON public.analisis_partidos
    FOR EACH ROW EXECUTE FUNCTION analisis_privado.validar_tipo_partido();
  COMMENT ON COLUMN public.analisis_partidos.equipo_analizado IS 'Desde qué equipo se marca la botonera colectiva: propio | rival (propios), local | visitante (scouting).';

  -- 7) Verificación.
  IF (SELECT count(*) FROM public.analisis_tipos_accion WHERE botonera = 'colectiva') <> 13 THEN
    RAISE EXCEPTION 'No quedaron los 13 botones colectivos. Se deshizo todo.';
  END IF;
  IF (SELECT count(*) FROM public.analisis_tipos_accion WHERE espejo IS NOT NULL) <> 10 THEN
    RAISE EXCEPTION 'No quedaron los 10 espejos. Se deshizo todo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.analisis_tipos_accion WHERE botonera = 'individual' AND duracion_defecto IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.analisis_partidos WHERE tipo_partido <> 'propio' OR equipo_analizado <> 'propio') THEN
    RAISE EXCEPTION 'Los datos existentes no quedaron como estaban. Se deshizo todo.';
  END IF;
  IF (SELECT string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analisis_partidos', 'analisis_eventos', 'analisis_tipos_accion'))
     IS DISTINCT FROM v_reglas_antes THEN
    RAISE EXCEPTION 'Las reglas de acceso cambiaron. Se deshizo todo.';
  END IF;

  -- Aviso (no cambia nada): botones individuales con nombre parecido a los colectivos.
  SELECT string_agg(codigo || ' (' || grupo || ')', ', ' ORDER BY codigo) INTO v_parecidos FROM public.analisis_tipos_accion
   WHERE botonera = 'individual'
     AND (codigo ~* '(c[oó]rner|tiro libre|transici|presi[oó]n|salida|ataque posicional|defensa organizada)'
          OR etiqueta ~* '(c[oó]rner|tiro libre|transici|presi[oó]n|salida|ataque posicional|defensa organizada)');
  IF v_parecidos IS NOT NULL THEN
    RAISE NOTICE 'Para revisar (no se tocaron): botones individuales con nombre parecido a los colectivos: %', v_parecidos;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'Listo: botonera colectiva (13 botones), equipo analizado y partidos de scouting.';
END
$botonera_colectiva$;
