-- Pizarra etapa C: el único cambio de base del plan de pizarra y biblioteca.
--
-- Qué hace:
--   1. Pizarra formato v2. El validador acepta v1 (devuelve exactamente lo mismo que antes) y v2, que suma:
--        documento: recorrido (suave/recto) y placa (título y analista);
--        ficha:     vínculo con una jugadora del plantel o con un equipo rival;
--        elemento:  tipo nuevo "sombra" (zona sombreada, polígono de 3 a 16 puntos);
--        paso:      texto (subtítulo), pausa, pase alto/bajo, jugadora en foco y elementos ocultos.
--   2. Biblioteca: la tabla `biblioteca` pasa a tener ámbito (cancha/gimnasio), tipo (ejercicio/jugada), carpeta,
--      duración, objetivo y, para gimnasio, músculos, material, técnica y demostración (YouTube o imagen) con
--      crédito. Tablas nuevas: biblioteca_carpetas (con las carpetas iniciales) y biblioteca_favoritos.
--      Permisos: leen coordinación, técnicos y PF; Cancha la escriben coordinación y técnicos; Gimnasio,
--      coordinación y PF; cada usuario ve y marca solo sus favoritos.
--   3. Equipos: color de camiseta y color de número.
--   4. Planificación y Wellness: los bloques pueden tener ámbito (gimnasio/cancha) y los ejercicios carga,
--      técnica, músculos, material y demostración. Wellness puede mostrar carga, técnica y demostración si se
--      marcan como públicos. anon sigue usando solo funciones.
--   5. Storage: carpeta gimnasio/ (suben coordinación y PF). Sigue sin listar, reemplazar ni borrar.
--   6. cmj y entrenamiento_bloques dejan de estar abiertas a cualquier usuario logueado:
--        leen coordinación, PF y médico (todo el club) y los técnicos (solo su categoría, y en Reserva también
--        las jugadoras marcadas "también Reserva");
--        cargan, editan y borran solo coordinación y PF.
--
-- Compatible con el código que hoy está en producción: se puede correr antes de subir el código de las etapas
-- siguientes. Las pizarras v1 no se tocan.
--
-- Todo está en un único bloque DO: es una sola sentencia, atómica aunque el editor separe las sentencias.
-- Guarda un respaldo en seguridad_privado.respaldo_etapa_c, verifica al final (validador, estructura y una prueba
-- por rol con usuarios reales cuyas escrituras se deshacen) y, si algo falla, no se aplica nada.
--
-- Reversión: supabase/rollback/20261114120000_pizarra_etapa_c.sql

DO $etapa_c$
DECLARE
  r record;
  t record;
  n bigint;
  ya boolean;
  v_coord text; v_tecnico text; v_pf text; v_medico text;
  sub_coord uuid; sub_tecnico uuid; sub_pf uuid; sub_medico uuid;
  v_jugadora uuid; v_cat uuid;
  c_salida uuid; c_tren uuid;
  fx_cancha uuid; fx_gimnasio uuid;
  antes_biblioteca bigint; antes_cmj bigint; antes_bloques bigint; antes_carpetas bigint;
  doc_v1 jsonb; doc_v2 jsonb; salida_v1_antes jsonb; salida jsonb; malo jsonb;
  sentencia text; v_email text; v_sub uuid;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===================================================================================================
  -- 0) Controles previos: que la base esté como la auditamos y que esto no se haya aplicado.
  -- ===================================================================================================
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_etapa_c') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_etapa_c)' INTO ya;
    IF ya THEN RAISE EXCEPTION 'La etapa C ya se aplicó (hay respaldo guardado).'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'biblioteca' AND column_name = 'ambito')
     OR to_regclass('public.biblioteca_carpetas') IS NOT NULL OR to_regclass('public.biblioteca_favoritos') IS NOT NULL THEN
    RAISE EXCEPTION 'La biblioteca ya tiene columnas o tablas de la etapa C. Revisar antes de seguir.';
  END IF;
  IF to_regprocedure('public.mi_rol()') IS NULL OR to_regprocedure('public.mi_categoria()') IS NULL
     OR to_regprocedure('public.mi_categoria_es_reserva()') IS NULL OR to_regprocedure('public.categoria_de_jugador(uuid)') IS NULL
     OR to_regprocedure('public.jugador_tambien_reserva(uuid)') IS NULL OR to_regprocedure('pizarra_privado.validar(jsonb)') IS NULL
     OR to_regprocedure('pizarra_privado.auditar_biblioteca()') IS NULL
     OR to_regprocedure('public.guardar_ejercicio_pizarra(uuid,integer,jsonb)') IS NULL
     OR to_regprocedure('planificacion_privado.item_valido(jsonb,boolean)') IS NULL
     OR to_regprocedure('planificacion_privado.item_publico(jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Falta alguna función que la etapa C reemplaza o usa. No continuar.';
  END IF;
  IF (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'biblioteca')
       IS DISTINCT FROM ARRAY['acceso biblioteca', 'preparador_fisico ve biblioteca']
     OR (SELECT array_agg(policyname::text) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cmj')
       IS DISTINCT FROM ARRAY['Acceso total usuarios logueados']
     OR (SELECT array_agg(policyname::text) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entrenamiento_bloques')
       IS DISTINCT FROM ARRAY['Acceso total usuarios logueados']
     OR (SELECT array_agg(policyname::text) FROM pg_policies WHERE schemaname = 'storage')
       IS DISTINCT FROM ARRAY['Biblioteca subir segun rol'] THEN
    RAISE EXCEPTION 'Las políticas de biblioteca, cmj, entrenamiento_bloques o Storage no son las auditadas (c4). Revisar antes de seguir.';
  END IF;

  -- Usuarios reales para la prueba final (uno por rol; coordinación es obligatorio).
  SELECT p.email, u.id INTO v_coord, sub_coord FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'coordinacion' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_tecnico, sub_tecnico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'tecnico' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_pf, sub_pf FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'preparador_fisico' ORDER BY p.email LIMIT 1;
  SELECT p.email, u.id INTO v_medico, sub_medico FROM public.perfiles p JOIN auth.users u ON lower(u.email) = lower(p.email)
    WHERE p.rol::text = 'medico' ORDER BY p.email LIMIT 1;
  IF v_coord IS NULL THEN RAISE EXCEPTION 'No hay ningún perfil de coordinación con usuario para probar.'; END IF;
  -- Una jugadora de la categoría del técnico (o cualquiera) para probar cmj y entrenamiento_bloques.
  SELECT j.id, j.categoria_id INTO v_jugadora, v_cat FROM public.jugadores j
    ORDER BY (j.categoria_id = (SELECT categoria_id FROM public.perfiles WHERE email = v_tecnico)) DESC NULLS LAST, j.id LIMIT 1;
  IF v_jugadora IS NULL THEN RAISE EXCEPTION 'No hay jugadoras para probar cmj.'; END IF;

  SELECT count(*) INTO antes_biblioteca FROM public.biblioteca;
  SELECT count(*) INTO antes_cmj FROM public.cmj;
  SELECT count(*) INTO antes_bloques FROM public.entrenamiento_bloques;

  -- Documentos de prueba del validador.
  doc_v1 := '{"version":1,"superficie":"completa","orientacion":"horizontal","ataque":"derecha","bucle":false,"velocidad":1,
    "elementos":[{"id":"j1","tipo":"jugadora","color":"#F2C230","tinta":"#111111","texto":"","numero":"9","tamano":4,"grosor":1,"dx":0,"dy":0,"curva":0},
                 {"id":"b1","tipo":"pelota","color":"#FFFFFF","tinta":"#111111","texto":"","numero":"","tamano":2,"grosor":1,"dx":0,"dy":0,"curva":0}],
    "pasos":[{"id":"s1","nombre":"Inicio","duracion":2,"poses":{"j1":{"x":40,"y":50,"rotacion":0},"b1":{"x":41,"y":50,"rotacion":0}}},
             {"id":"s2","nombre":"Pase","duracion":1.5,"poses":{"j1":{"x":45,"y":50,"rotacion":0},"b1":{"x":60,"y":30,"rotacion":0}}}]}';
  salida_v1_antes := pizarra_privado.validar(doc_v1);

  -- ===================================================================================================
  -- 1) Respaldo (privado): definiciones de las funciones que se reemplazan y de las políticas que se tocan.
  -- ===================================================================================================
  CREATE SCHEMA IF NOT EXISTS seguridad_privado;
  REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated;
  CREATE TABLE IF NOT EXISTS seguridad_privado.respaldo_etapa_c (
    orden integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('funcion', 'politica')),
    objeto text NOT NULL,
    detalle text NOT NULL,
    guardado_en timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_etapa_c FROM PUBLIC, anon, authenticated;

  INSERT INTO seguridad_privado.respaldo_etapa_c (tipo, objeto, detalle)
  SELECT 'funcion', f::text, pg_get_functiondef(f::regprocedure)
  FROM unnest(ARRAY['pizarra_privado.validar(jsonb)', 'pizarra_privado.auditar_biblioteca()',
                    'public.guardar_ejercicio_pizarra(uuid,integer,jsonb)',
                    'planificacion_privado.item_valido(jsonb,boolean)', 'planificacion_privado.item_publico(jsonb,boolean)']) f;

  INSERT INTO seguridad_privado.respaldo_etapa_c (tipo, objeto, detalle)
  SELECT 'politica', format('%I.%I', schemaname, tablename),
         format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
           policyname, schemaname, tablename, permissive, cmd,
           (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
           CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
           CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
  FROM pg_policies
  WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'cmj', 'entrenamiento_bloques')) OR schemaname = 'storage'
  ORDER BY schemaname, tablename, policyname;

  -- ===================================================================================================
  -- 2) Ayudantes privados.
  -- ===================================================================================================
  -- Quién escribe en cada ámbito de la biblioteca.
  CREATE FUNCTION pizarra_privado.puede_editar_biblioteca(p_ambito text)
   RETURNS boolean
   LANGUAGE sql
   STABLE
   SET search_path TO ''
  AS $f$
    SELECT coalesce(public.mi_rol() = 'coordinacion'
      OR (p_ambito = 'cancha' AND public.mi_rol() = 'tecnico')
      OR (p_ambito = 'gimnasio' AND public.mi_rol() = 'preparador_fisico'), false);
  $f$;

  -- Demostración de gimnasio: YouTube o imagen subida a Biblioteca/gimnasio/.
  CREATE FUNCTION pizarra_privado.demo_url_valida(p_tipo text, p_url text)
   RETURNS boolean
   LANGUAGE sql
   IMMUTABLE
   SET search_path TO ''
  AS $f$
    SELECT coalesce(length(p_url) <= 500 AND CASE p_tipo
      WHEN 'youtube' THEN p_url ~ '^https://((www|m)\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtube-nocookie\.com/embed/|youtu\.be/)[A-Za-z0-9_-]{11}([?&#][^[:space:]]*)?$'
      WHEN 'imagen' THEN p_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/Biblioteca/gimnasio/[^/?#[:space:]]+$'
      ELSE false END, false);
  $f$;

  -- La misma demostración, como objeto dentro de un ejercicio de la planificación.
  CREATE FUNCTION pizarra_privado.demostracion_valida(d jsonb)
   RETURNS boolean
   LANGUAGE sql
   IMMUTABLE
   SET search_path TO ''
  AS $f$
    SELECT coalesce(jsonb_typeof(d) = 'object'
      AND jsonb_typeof(d->'tipo') = 'string' AND jsonb_typeof(d->'url') = 'string'
      AND jsonb_typeof(d->'credito') = 'string' AND length(d->>'credito') <= 200
      AND pizarra_privado.demo_url_valida(d->>'tipo', d->>'url'), false);
  $f$;

  REVOKE ALL ON FUNCTION pizarra_privado.puede_editar_biblioteca(text), pizarra_privado.demo_url_valida(text, text),
    pizarra_privado.demostracion_valida(jsonb) FROM PUBLIC, anon, authenticated, service_role;
  -- authenticated las necesita: las usan las políticas y el CHECK de la tabla, que corren como el usuario.
  GRANT EXECUTE ON FUNCTION pizarra_privado.puede_editar_biblioteca(text), pizarra_privado.demo_url_valida(text, text),
    pizarra_privado.demostracion_valida(jsonb) TO authenticated, service_role;

  -- ===================================================================================================
  -- 3) Validador de pizarra v1 + v2.
  -- ===================================================================================================
  CREATE OR REPLACE FUNCTION pizarra_privado.validar(d jsonb)
   RETURNS jsonb
   LANGUAGE plpgsql
   IMMUTABLE
   SET search_path TO ''
  AS $function$
  DECLARE e jsonb; p jsonb; pose jsonb; pt jsonb; elementos jsonb:='[]'; pasos jsonb:='[]'; poses jsonb; puntos jsonb; extra jsonb;
    ids text[]:=ARRAY[]::text[]; jugadoras text[]:=ARRAY[]::text[]; pasos_ids text[]:=ARRAY[]::text[]; ocultos text[];
    id text; k text; v integer; tipos text[];
  BEGIN
    IF d IS NULL OR d='null'::jsonb THEN RETURN NULL; END IF;
    IF jsonb_typeof(d)<>'object' OR octet_length(d::text)>1048576 OR NOT coalesce(d->'version' IN ('1'::jsonb,'2'::jsonb),false)
       OR coalesce(d->>'superficie','') NOT IN ('completa','media','cuarto','area','reducida','libre')
       OR coalesce(d->>'orientacion','') NOT IN ('horizontal','vertical') OR coalesce(d->>'ataque','') NOT IN ('derecha','izquierda')
       OR jsonb_typeof(d->'bucle') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'velocidad') IS DISTINCT FROM 'number'
       OR jsonb_typeof(d->'elementos') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'pasos') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Documento de pizarra inválido' USING ERRCODE='22023';
    END IF;
    v:=(d->>'version')::numeric::integer;
    IF v=2 AND (coalesce(d->>'recorrido','') NOT IN ('suave','recto') OR jsonb_typeof(d->'placa') IS DISTINCT FROM 'object'
       OR jsonb_typeof(d->'placa'->'titulo') IS DISTINCT FROM 'string' OR length(d->'placa'->>'titulo')>80
       OR jsonb_typeof(d->'placa'->'analista') IS DISTINCT FROM 'string' OR length(d->'placa'->>'analista')>80) THEN
      RAISE EXCEPTION 'Documento de pizarra inválido' USING ERRCODE='22023';
    END IF;
    IF (d->>'velocidad')::numeric NOT BETWEEN .25 AND 3 OR jsonb_array_length(d->'elementos')>200 OR jsonb_array_length(d->'pasos') NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'Límites de pizarra inválidos' USING ERRCODE='22023';
    END IF;
    tipos:=ARRAY['jugadora','cono','tortuga','escalera','valla','aro','pelota','arco','mini','pica','zona','flecha','curva','punteada','conduccion','pase','movimiento','remate','rectangulo','circulo','texto'];
    IF v=2 THEN tipos:=tipos || ARRAY['sombra']; END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(d->'elementos') LOOP
      id:=e->>'id';
      IF jsonb_typeof(e)<>'object' OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string' OR coalesce(id,'') !~ '^[a-zA-Z0-9_-]{1,80}$' OR id=ANY(ids)
        OR NOT (coalesce(e->>'tipo','') = ANY(tipos))
        OR coalesce(e->>'color','') !~ '^#[0-9a-fA-F]{6}$' OR coalesce(e->>'tinta','') !~ '^#[0-9a-fA-F]{6}$'
        OR jsonb_typeof(e->'texto') IS DISTINCT FROM 'string' OR length(e->>'texto')>200
        OR jsonb_typeof(e->'numero') IS DISTINCT FROM 'string' OR length(e->>'numero')>4 THEN
        RAISE EXCEPTION 'Elemento inválido' USING ERRCODE='22023';
      END IF;
      FOREACH k IN ARRAY ARRAY['tamano','grosor','dx','dy','curva'] LOOP
        IF jsonb_typeof(e->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Medida inválida' USING ERRCODE='22023'; END IF;
      END LOOP;
      IF (e->>'tamano')::numeric NOT BETWEEN 1 AND 12 OR (e->>'grosor')::numeric NOT BETWEEN .1 AND 2
         OR (e->>'dx')::numeric NOT BETWEEN -80 AND 80 OR (e->>'dy')::numeric NOT BETWEEN -80 AND 80 OR (e->>'curva')::numeric NOT BETWEEN -50 AND 50 THEN
        RAISE EXCEPTION 'Medida fuera de rango' USING ERRCODE='22023';
      END IF;
      extra:='{}';
      IF v=2 THEN
        -- Vínculo: solo fichas de jugadora; null o {tipo: jugadora|rival, id: uuid}.
        IF e->>'tipo'='jugadora' THEN
          IF e->'vinculo' IS NULL OR e->'vinculo'='null'::jsonb THEN
            extra:=jsonb_build_object('vinculo',NULL::jsonb);
          ELSIF jsonb_typeof(e->'vinculo')<>'object' OR coalesce(e->'vinculo'->>'tipo','') NOT IN ('jugadora','rival')
                OR jsonb_typeof(e->'vinculo'->'id') IS DISTINCT FROM 'string'
                OR (e->'vinculo'->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'Vínculo inválido' USING ERRCODE='22023';
          ELSE
            extra:=jsonb_build_object('vinculo',jsonb_build_object('tipo',e->'vinculo'->'tipo','id',lower(e->'vinculo'->>'id')));
          END IF;
        ELSIF e->'vinculo' IS NOT NULL AND e->'vinculo'<>'null'::jsonb THEN
          RAISE EXCEPTION 'Vínculo inválido' USING ERRCODE='22023';
        END IF;
        -- Zona sombreada: puntos relativos a la posición del elemento, en % de la superficie.
        IF e->>'tipo'='sombra' THEN
          IF jsonb_typeof(e->'puntos') IS DISTINCT FROM 'array' OR jsonb_array_length(e->'puntos') NOT BETWEEN 3 AND 16 THEN
            RAISE EXCEPTION 'Zona inválida' USING ERRCODE='22023';
          END IF;
          puntos:='[]';
          FOR pt IN SELECT value FROM jsonb_array_elements(e->'puntos') LOOP
            IF jsonb_typeof(pt) IS DISTINCT FROM 'object' OR jsonb_typeof(pt->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(pt->'y') IS DISTINCT FROM 'number'
               OR (pt->>'x')::numeric NOT BETWEEN -100 AND 100 OR (pt->>'y')::numeric NOT BETWEEN -100 AND 100 THEN
              RAISE EXCEPTION 'Zona inválida' USING ERRCODE='22023';
            END IF;
            puntos:=puntos || jsonb_build_array(jsonb_build_object('x',pt->'x','y',pt->'y'));
          END LOOP;
          extra:=extra || jsonb_build_object('puntos',puntos);
        END IF;
      END IF;
      ids:=array_append(ids,id);
      IF e->>'tipo'='jugadora' THEN jugadoras:=array_append(jugadoras,id); END IF;
      elementos:=elementos || jsonb_build_array(jsonb_build_object('id',id,'tipo',e->'tipo','color',e->'color','tinta',e->'tinta','texto',e->'texto','numero',e->'numero','tamano',e->'tamano','grosor',e->'grosor','dx',e->'dx','dy',e->'dy','curva',e->'curva') || extra);
    END LOOP;
    FOR p IN SELECT value FROM jsonb_array_elements(d->'pasos') LOOP
      IF jsonb_typeof(p)<>'object' OR jsonb_typeof(p->'id') IS DISTINCT FROM 'string' OR coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' OR (p->>'id')=ANY(pasos_ids)
        OR jsonb_typeof(p->'nombre') IS DISTINCT FROM 'string' OR length(p->>'nombre')>80
        OR jsonb_typeof(p->'duracion') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'poses') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
      END IF;
      IF (p->>'duracion')::numeric NOT BETWEEN .1 AND 60 OR (SELECT count(*) FROM jsonb_object_keys(p->'poses'))<>cardinality(ids) THEN
        RAISE EXCEPTION 'Paso incompleto' USING ERRCODE='22023';
      END IF;
      extra:='{}';
      IF v=2 THEN
        IF jsonb_typeof(p->'texto') IS DISTINCT FROM 'string' OR length(p->>'texto')>200
           OR jsonb_typeof(p->'pausa') IS DISTINCT FROM 'number' OR coalesce(p->>'pase','') NOT IN ('bajo','alto')
           OR jsonb_typeof(p->'ocultos') IS DISTINCT FROM 'array'
           OR (p->'foco' IS DISTINCT FROM 'null'::jsonb AND jsonb_typeof(p->'foco') IS DISTINCT FROM 'string') THEN
          RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
        END IF;
        IF (p->>'pausa')::numeric NOT BETWEEN 0 AND 30 OR (p->'foco'<>'null'::jsonb AND NOT ((p->>'foco')=ANY(jugadoras))) THEN
          RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'ocultos') x WHERE jsonb_typeof(x.value)<>'string') THEN
          RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
        END IF;
        SELECT coalesce(array_agg(x.value #>> '{}' ORDER BY x.n),ARRAY[]::text[]) INTO ocultos FROM jsonb_array_elements(p->'ocultos') WITH ORDINALITY x(value,n);
        IF NOT (ocultos <@ ids) OR cardinality(ocultos)<>(SELECT count(DISTINCT o) FROM unnest(ocultos) o) THEN
          RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
        END IF;
        extra:=jsonb_build_object('texto',p->'texto','pausa',p->'pausa','pase',p->'pase','foco',p->'foco','ocultos',to_jsonb(ocultos));
      END IF;
      pasos_ids:=array_append(pasos_ids,p->>'id'); poses:='{}';
      FOREACH id IN ARRAY ids LOOP
        pose:=p->'poses'->id;
        FOREACH k IN ARRAY ARRAY['x','y','rotacion'] LOOP
          IF jsonb_typeof(pose->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Posición inválida' USING ERRCODE='22023'; END IF;
        END LOOP;
        IF (pose->>'x')::numeric NOT BETWEEN 0 AND 100 OR (pose->>'y')::numeric NOT BETWEEN 0 AND 100 OR (pose->>'rotacion')::numeric NOT BETWEEN -360 AND 360 THEN
          RAISE EXCEPTION 'Posición fuera de cancha' USING ERRCODE='22023';
        END IF;
        poses:=poses || jsonb_build_object(id,jsonb_build_object('x',pose->'x','y',pose->'y','rotacion',pose->'rotacion'));
      END LOOP;
      pasos:=pasos || jsonb_build_array(jsonb_build_object('id',p->'id','nombre',p->'nombre','duracion',p->'duracion','poses',poses) || extra);
    END LOOP;
    IF v=1 THEN
      RETURN jsonb_build_object('version',1,'superficie',d->'superficie','orientacion',d->'orientacion','ataque',d->'ataque','bucle',d->'bucle','velocidad',d->'velocidad','elementos',elementos,'pasos',pasos);
    END IF;
    RETURN jsonb_build_object('version',2,'superficie',d->'superficie','orientacion',d->'orientacion','ataque',d->'ataque','bucle',d->'bucle','velocidad',d->'velocidad',
      'recorrido',d->'recorrido','placa',jsonb_build_object('titulo',d->'placa'->'titulo','analista',d->'placa'->'analista'),'elementos',elementos,'pasos',pasos);
  END $function$;

  -- ===================================================================================================
  -- 4) Biblioteca: carpetas, columnas nuevas, favoritos, trigger, RPC y políticas.
  -- ===================================================================================================
  CREATE TABLE public.biblioteca_carpetas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambito text NOT NULL CHECK (ambito IN ('cancha', 'gimnasio')),
    nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
    orden integer NOT NULL DEFAULT 0 CHECK (orden BETWEEN 0 AND 100000),
    sistema boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, ambito)
  );
  CREATE UNIQUE INDEX biblioteca_carpetas_nombre ON public.biblioteca_carpetas (ambito, lower(btrim(nombre)));
  -- "Sin clasificar" es fija (no se renombra ni se borra): ahí caen lo migrado y lo que agrega Videoanálisis.
  INSERT INTO public.biblioteca_carpetas (ambito, nombre, orden, sistema) VALUES
    ('cancha', 'Sin clasificar', 0, true),
    ('cancha', 'Salida', 10, false), ('cancha', 'Presión', 20, false), ('cancha', 'Transiciones', 30, false),
    ('cancha', 'ABP ofensiva', 40, false), ('cancha', 'ABP defensiva', 50, false), ('cancha', 'Reducidos', 60, false),
    ('cancha', 'Rondos', 70, false),
    ('gimnasio', 'Tren inferior', 10, false), ('gimnasio', 'Tren superior', 20, false), ('gimnasio', 'Core', 30, false),
    ('gimnasio', 'Movilidad', 40, false), ('gimnasio', 'Prevención', 50, false), ('gimnasio', 'Potencia', 60, false);
  SELECT count(*) INTO antes_carpetas FROM public.biblioteca_carpetas;

  ALTER TABLE public.biblioteca
    ALTER COLUMN fecha SET DEFAULT CURRENT_DATE,
    ADD COLUMN ambito text NOT NULL DEFAULT 'cancha',
    ADD COLUMN tipo text NOT NULL DEFAULT 'ejercicio',
    ADD COLUMN carpeta_id uuid,
    ADD COLUMN duracion_minutos integer,
    ADD COLUMN objetivo text NOT NULL DEFAULT '',
    ADD COLUMN musculos text[] NOT NULL DEFAULT '{}',
    ADD COLUMN material text[] NOT NULL DEFAULT '{}',
    ADD COLUMN tecnica text NOT NULL DEFAULT '',
    ADD COLUMN demo_tipo text,
    ADD COLUMN demo_url text,
    ADD COLUMN demo_credito text NOT NULL DEFAULT '',
    ADD COLUMN creado_por uuid,
    ADD COLUMN actualizado_por uuid,
    ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT biblioteca_ambito_check CHECK (ambito IN ('cancha', 'gimnasio')),
    ADD CONSTRAINT biblioteca_tipo_check CHECK (tipo IN ('ejercicio', 'jugada') AND (ambito = 'cancha' OR tipo = 'ejercicio')),
    ADD CONSTRAINT biblioteca_carpeta_fkey FOREIGN KEY (carpeta_id, ambito) REFERENCES public.biblioteca_carpetas (id, ambito) ON DELETE RESTRICT,
    ADD CONSTRAINT biblioteca_duracion_check CHECK (duracion_minutos BETWEEN 1 AND 600),
    ADD CONSTRAINT biblioteca_textos_check CHECK (length(objetivo) <= 500 AND length(tecnica) <= 2000 AND length(demo_credito) <= 200),
    ADD CONSTRAINT biblioteca_listas_check CHECK (cardinality(musculos) <= 20 AND cardinality(material) <= 20),
    ADD CONSTRAINT biblioteca_demo_check CHECK ((demo_tipo IS NULL AND demo_url IS NULL)
      OR (demo_tipo IN ('youtube', 'imagen') AND pizarra_privado.demo_url_valida(demo_tipo, demo_url))),
    -- La pizarra es de Cancha; músculos, material, técnica y demostración son de Gimnasio.
    ADD CONSTRAINT biblioteca_ambito_campos_check CHECK (
      (ambito = 'cancha' AND cardinality(musculos) = 0 AND cardinality(material) = 0 AND tecnica = '' AND demo_tipo IS NULL AND demo_credito = '')
      OR (ambito = 'gimnasio' AND pizarra IS NULL AND pizarra_miniatura = ''));
  CREATE INDEX biblioteca_ambito_carpeta ON public.biblioteca (ambito, carpeta_id);

  CREATE TABLE public.biblioteca_favoritos (
    usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    biblioteca_id uuid NOT NULL REFERENCES public.biblioteca (id) ON DELETE CASCADE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, biblioteca_id)
  );
  CREATE INDEX biblioteca_favoritos_ejercicio ON public.biblioteca_favoritos (biblioteca_id);

  ALTER TABLE public.biblioteca_carpetas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.biblioteca_favoritos ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.biblioteca_carpetas, public.biblioteca_favoritos FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.biblioteca_carpetas TO authenticated;
  GRANT SELECT, INSERT, DELETE ON public.biblioteca_favoritos TO authenticated;
  GRANT ALL ON public.biblioteca_carpetas, public.biblioteca_favoritos TO service_role;

  -- Trigger: además de validar la pizarra, registra quién crea y modifica, y no deja cambiar el ámbito.
  CREATE OR REPLACE FUNCTION pizarra_privado.auditar_biblioteca()
   RETURNS trigger
   LANGUAGE plpgsql
   SET search_path TO ''
  AS $function$ BEGIN
    NEW.pizarra:=pizarra_privado.validar(NEW.pizarra);
    IF NEW.pizarra_miniatura<>'' AND (length(NEW.pizarra_miniatura)>600000 OR NEW.pizarra_miniatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') THEN
      RAISE EXCEPTION 'Miniatura inválida' USING ERRCODE='22023';
    END IF;
    NEW.pizarra_revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.pizarra_revision+1 END;
    IF TG_OP='INSERT' THEN
      NEW.creado_por:=auth.uid();
    ELSE
      IF NEW.ambito IS DISTINCT FROM OLD.ambito THEN
        RAISE EXCEPTION 'Un ejercicio no puede pasar de Cancha a Gimnasio ni al revés' USING ERRCODE='22023';
      END IF;
      NEW.creado_por:=OLD.creado_por;
    END IF;
    NEW.actualizado_por:=auth.uid();
    NEW.actualizado_en:=statement_timestamp();
    RETURN NEW;
  END $function$;

  -- RPC de guardado con control de revisión. Los campos nuevos solo cambian si vienen en p_datos, así el editor
  -- de pizarra actual (que no los manda) no borra carpeta, tipo ni datos de gimnasio.
  CREATE OR REPLACE FUNCTION public.guardar_ejercicio_pizarra(p_id uuid, p_revision integer, p_datos jsonb)
   RETURNS jsonb
   LANGUAGE plpgsql
   SET search_path TO ''
  AS $function$
  DECLARE actual public.biblioteca; salida public.biblioteca; v_ambito text;
  BEGIN
    IF auth.uid() IS NULL OR coalesce(public.mi_rol(),'') NOT IN ('coordinacion','tecnico','preparador_fisico') THEN
      RAISE EXCEPTION 'Sin permiso para editar biblioteca' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='22023'; END IF;
    IF p_id IS NULL THEN
      IF p_revision IS NOT NULL THEN RAISE EXCEPTION 'Revisión inválida' USING ERRCODE='22023'; END IF;
      v_ambito:=coalesce(nullif(p_datos->>'ambito',''),'cancha');
      IF NOT pizarra_privado.puede_editar_biblioteca(v_ambito) THEN RAISE EXCEPTION 'Sin permiso para editar biblioteca' USING ERRCODE='42501'; END IF;
      INSERT INTO public.biblioteca(fecha,contenido,descripcion,cantidad_jugadores,imagen_url,link_video,pizarra,pizarra_miniatura,
        ambito,tipo,carpeta_id,duracion_minutos,objetivo,musculos,material,tecnica,demo_tipo,demo_url,demo_credito)
      VALUES(coalesce((p_datos->>'fecha')::date,CURRENT_DATE),p_datos->>'contenido',coalesce(p_datos->>'descripcion',''),(p_datos->>'cantidad_jugadores')::integer,
        p_datos->>'imagen_url',p_datos->>'link_video',p_datos->'pizarra',coalesce(p_datos->>'pizarra_miniatura',''),
        v_ambito,coalesce(nullif(p_datos->>'tipo',''),'ejercicio'),nullif(p_datos->>'carpeta_id','')::uuid,(p_datos->>'duracion_minutos')::integer,
        coalesce(p_datos->>'objetivo',''),ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'musculos','[]'))),
        ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'material','[]'))),coalesce(p_datos->>'tecnica',''),
        nullif(p_datos->>'demo_tipo',''),nullif(p_datos->>'demo_url',''),coalesce(p_datos->>'demo_credito',''))
      RETURNING * INTO salida;
    ELSE
      SELECT b.ambito INTO v_ambito FROM public.biblioteca b WHERE b.id=p_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'El ejercicio cambió; recargar antes de guardar' USING ERRCODE='40001'; END IF;
      IF NOT pizarra_privado.puede_editar_biblioteca(v_ambito) THEN RAISE EXCEPTION 'Sin permiso para editar biblioteca' USING ERRCODE='42501'; END IF;
      IF nullif(p_datos->>'ambito','') IS NOT NULL AND p_datos->>'ambito'<>v_ambito THEN
        RAISE EXCEPTION 'Un ejercicio no puede pasar de Cancha a Gimnasio ni al revés' USING ERRCODE='22023';
      END IF;
      SELECT * INTO actual FROM public.biblioteca WHERE id=p_id FOR UPDATE;
      IF NOT FOUND OR p_revision IS NULL OR actual.pizarra_revision<>p_revision THEN RAISE EXCEPTION 'El ejercicio cambió; recargar antes de guardar' USING ERRCODE='40001'; END IF;
      UPDATE public.biblioteca SET fecha=coalesce((p_datos->>'fecha')::date,actual.fecha),contenido=p_datos->>'contenido',descripcion=coalesce(p_datos->>'descripcion',''),
        cantidad_jugadores=(p_datos->>'cantidad_jugadores')::integer,imagen_url=p_datos->>'imagen_url',link_video=p_datos->>'link_video',
        pizarra=p_datos->'pizarra',pizarra_miniatura=coalesce(p_datos->>'pizarra_miniatura',''),
        tipo=CASE WHEN p_datos ? 'tipo' THEN coalesce(nullif(p_datos->>'tipo',''),'ejercicio') ELSE actual.tipo END,
        carpeta_id=CASE WHEN p_datos ? 'carpeta_id' THEN nullif(p_datos->>'carpeta_id','')::uuid ELSE actual.carpeta_id END,
        duracion_minutos=CASE WHEN p_datos ? 'duracion_minutos' THEN (p_datos->>'duracion_minutos')::integer ELSE actual.duracion_minutos END,
        objetivo=CASE WHEN p_datos ? 'objetivo' THEN coalesce(p_datos->>'objetivo','') ELSE actual.objetivo END,
        musculos=CASE WHEN p_datos ? 'musculos' THEN ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'musculos','[]'))) ELSE actual.musculos END,
        material=CASE WHEN p_datos ? 'material' THEN ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'material','[]'))) ELSE actual.material END,
        tecnica=CASE WHEN p_datos ? 'tecnica' THEN coalesce(p_datos->>'tecnica','') ELSE actual.tecnica END,
        demo_tipo=CASE WHEN p_datos ? 'demo_tipo' THEN nullif(p_datos->>'demo_tipo','') ELSE actual.demo_tipo END,
        demo_url=CASE WHEN p_datos ? 'demo_url' THEN nullif(p_datos->>'demo_url','') ELSE actual.demo_url END,
        demo_credito=CASE WHEN p_datos ? 'demo_credito' THEN coalesce(p_datos->>'demo_credito','') ELSE actual.demo_credito END
      WHERE id=p_id RETURNING * INTO salida;
      IF NOT FOUND THEN RAISE EXCEPTION 'Sin permiso de actualización' USING ERRCODE='42501'; END IF;
    END IF;
    RETURN to_jsonb(salida);
  END $function$;

  -- Políticas de la biblioteca.
  DROP POLICY "acceso biblioteca" ON public.biblioteca;
  DROP POLICY "preparador_fisico ve biblioteca" ON public.biblioteca;
  CREATE POLICY biblioteca_leer ON public.biblioteca FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'tecnico', 'preparador_fisico'));
  CREATE POLICY biblioteca_crear ON public.biblioteca FOR INSERT TO authenticated
    WITH CHECK (pizarra_privado.puede_editar_biblioteca(ambito));
  CREATE POLICY biblioteca_editar ON public.biblioteca FOR UPDATE TO authenticated
    USING (pizarra_privado.puede_editar_biblioteca(ambito)) WITH CHECK (pizarra_privado.puede_editar_biblioteca(ambito));
  CREATE POLICY biblioteca_borrar ON public.biblioteca FOR DELETE TO authenticated
    USING (pizarra_privado.puede_editar_biblioteca(ambito));

  CREATE POLICY carpetas_leer ON public.biblioteca_carpetas FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'tecnico', 'preparador_fisico'));
  CREATE POLICY carpetas_crear ON public.biblioteca_carpetas FOR INSERT TO authenticated
    WITH CHECK (NOT sistema AND pizarra_privado.puede_editar_biblioteca(ambito));
  CREATE POLICY carpetas_editar ON public.biblioteca_carpetas FOR UPDATE TO authenticated
    USING (NOT sistema AND pizarra_privado.puede_editar_biblioteca(ambito))
    WITH CHECK (NOT sistema AND pizarra_privado.puede_editar_biblioteca(ambito));
  CREATE POLICY carpetas_borrar ON public.biblioteca_carpetas FOR DELETE TO authenticated
    USING (NOT sistema AND pizarra_privado.puede_editar_biblioteca(ambito));

  CREATE POLICY favoritos_leer ON public.biblioteca_favoritos FOR SELECT TO authenticated
    USING (usuario_id = auth.uid());
  CREATE POLICY favoritos_marcar ON public.biblioteca_favoritos FOR INSERT TO authenticated
    WITH CHECK (usuario_id = auth.uid() AND public.mi_rol() IN ('coordinacion', 'tecnico', 'preparador_fisico'));
  CREATE POLICY favoritos_quitar ON public.biblioteca_favoritos FOR DELETE TO authenticated
    USING (usuario_id = auth.uid());

  -- ===================================================================================================
  -- 5) Equipos: colores de camiseta y número para los rivales de la pizarra.
  -- ===================================================================================================
  ALTER TABLE public.equipos
    ADD COLUMN color_camiseta text,
    ADD COLUMN color_numero text,
    ADD CONSTRAINT equipos_colores_check CHECK (
      (color_camiseta IS NULL OR color_camiseta ~ '^#[0-9a-fA-F]{6}$') AND (color_numero IS NULL OR color_numero ~ '^#[0-9a-fA-F]{6}$'));

  -- ===================================================================================================
  -- 6) Planificación y Wellness: ámbito del bloque y datos de gimnasio en cada ejercicio.
  -- ===================================================================================================
  CREATE OR REPLACE FUNCTION planificacion_privado.item_valido(p_item jsonb, p_bloque boolean)
   RETURNS boolean
   LANGUAGE plpgsql
   STABLE
   SET search_path TO ''
  AS $function$
  DECLARE campo text; hijo jsonb; permitidos text[];
  BEGIN
    IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF jsonb_typeof(p_item->'nombre') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_item->'visible') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_item->'campos_publicos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    FOREACH campo IN ARRAY ARRAY['id','objetivo','indicaciones','notas_internas'] LOOP
      IF jsonb_typeof(p_item->campo) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    IF p_item->'duracion' IS NOT NULL AND p_item->'duracion' <> 'null'::jsonb THEN
      IF jsonb_typeof(p_item->'duracion') <> 'number' THEN RETURN false; END IF;
      IF (p_item->>'duracion')::numeric <= 0 OR (p_item->>'duracion')::numeric > 1440 THEN RETURN false; END IF;
    END IF;
    IF p_bloque THEN
      permitidos := ARRAY['objetivo','duracion','indicaciones'];
      IF p_item->'ambito' IS NOT NULL AND p_item->'ambito' <> 'null'::jsonb
         AND (jsonb_typeof(p_item->'ambito') <> 'string' OR p_item->>'ambito' NOT IN ('gimnasio','cancha')) THEN RETURN false; END IF;
      IF jsonb_typeof(p_item->'ejercicios') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      FOR hijo IN SELECT value FROM jsonb_array_elements(p_item->'ejercicios') LOOP
        IF NOT planificacion_privado.item_valido(hijo, false) THEN RETURN false; END IF;
      END LOOP;
    ELSE
      permitidos := ARRAY['objetivo','duracion','indicaciones','series','repeticiones','materiales','imagen_url','link_video','pizarra','carga','tecnica','demostracion'];
      FOREACH campo IN ARRAY ARRAY['series','repeticiones','materiales','imagen_url','link_video'] LOOP
        IF jsonb_typeof(p_item->campo) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      END LOOP;
      -- Opcionales nuevos (etapa C): si vienen, tienen que tener el tipo y largo correctos.
      IF p_item->'carga' IS NOT NULL AND p_item->'carga' <> 'null'::jsonb
         AND (jsonb_typeof(p_item->'carga') <> 'string' OR length(p_item->>'carga') > 80) THEN RETURN false; END IF;
      IF p_item->'tecnica' IS NOT NULL AND p_item->'tecnica' <> 'null'::jsonb
         AND (jsonb_typeof(p_item->'tecnica') <> 'string' OR length(p_item->>'tecnica') > 2000) THEN RETURN false; END IF;
      FOREACH campo IN ARRAY ARRAY['musculos','material'] LOOP
        IF p_item->campo IS NOT NULL AND p_item->campo <> 'null'::jsonb AND (jsonb_typeof(p_item->campo) <> 'array'
           OR jsonb_array_length(p_item->campo) > 20
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_item->campo) x WHERE jsonb_typeof(x.value) <> 'string' OR length(x.value #>> '{}') > 60)) THEN
          RETURN false;
        END IF;
      END LOOP;
      IF p_item->'demostracion' IS NOT NULL AND p_item->'demostracion' <> 'null'::jsonb
         AND NOT pizarra_privado.demostracion_valida(p_item->'demostracion') THEN RETURN false; END IF;
      IF p_item->'pizarra' IS NOT NULL AND p_item->'pizarra' <> 'null'::jsonb THEN
        PERFORM pizarra_privado.validar(p_item->'pizarra');
      END IF;
      IF nullif(p_item->>'biblioteca_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.biblioteca b WHERE b.id = (p_item->>'biblioteca_id')::uuid
      ) THEN RAISE EXCEPTION 'El ejercicio de biblioteca ya no existe. Desvinculalo para conservar la tarea libre.' USING ERRCODE = '23503'; END IF;
    END IF;
    FOR hijo IN SELECT value FROM jsonb_array_elements(p_item->'campos_publicos') LOOP
      IF jsonb_typeof(hijo) <> 'string' OR NOT ((hijo #>> '{}') = ANY(permitidos)) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END $function$;

  CREATE OR REPLACE FUNCTION planificacion_privado.item_publico(p_item jsonb, p_bloque boolean)
   RETURNS jsonb
   LANGUAGE plpgsql
   IMMUTABLE
   SET search_path TO ''
  AS $function$
  DECLARE salida jsonb; campos jsonb; hijos jsonb := '[]'::jsonb; hijo jsonb; proyectado jsonb; campo text;
  BEGIN
    IF p_item->'visible' IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
    campos := coalesce(p_item->'campos_publicos','[]'::jsonb);
    salida := jsonb_build_object('nombre',coalesce(p_item->>'nombre',''));
    FOREACH campo IN ARRAY (CASE WHEN p_bloque THEN ARRAY['objetivo','duracion','indicaciones']
      ELSE ARRAY['objetivo','duracion','indicaciones','series','repeticiones','materiales','imagen_url','link_video','carga','tecnica'] END) LOOP
      IF campos ? campo AND p_item ? campo THEN salida := salida || jsonb_build_object(campo,p_item->campo); END IF;
    END LOOP;
    IF NOT p_bloque AND campos ? 'demostracion' AND pizarra_privado.demostracion_valida(p_item->'demostracion') THEN
      salida := salida || jsonb_build_object('demostracion',jsonb_build_object('tipo',p_item->'demostracion'->'tipo',
        'url',p_item->'demostracion'->'url','credito',p_item->'demostracion'->'credito'));
    END IF;
    IF NOT p_bloque AND campos ? 'pizarra' AND p_item->'pizarra' IS NOT NULL AND p_item->'pizarra' <> 'null'::jsonb THEN
      salida := salida || jsonb_build_object('pizarra',pizarra_privado.validar(p_item->'pizarra'));
    END IF;
    IF p_bloque THEN
      FOR hijo IN SELECT value FROM jsonb_array_elements(coalesce(p_item->'ejercicios','[]'::jsonb)) LOOP
        proyectado := planificacion_privado.item_publico(hijo,false);
        IF proyectado IS NOT NULL THEN hijos := hijos || jsonb_build_array(proyectado); END IF;
      END LOOP;
      salida := salida || jsonb_build_object('ejercicios',hijos);
    END IF;
    IF jsonb_array_length(hijos) = 0 AND NOT EXISTS (SELECT 1 FROM jsonb_each(salida) e
      WHERE e.key <> 'ejercicios' AND e.value <> 'null'::jsonb AND (e.value #>> '{}') ~ '[^[:space:]]') THEN RETURN NULL; END IF;
    -- El ámbito ordena el bloque en Wellness; no es contenido, por eso va después del control de "vacío".
    IF p_bloque AND p_item->>'ambito' IN ('gimnasio','cancha') THEN salida := salida || jsonb_build_object('ambito',p_item->'ambito'); END IF;
    RETURN jsonb_strip_nulls(salida);
  END $function$;

  -- ===================================================================================================
  -- 7) Storage: carpeta gimnasio/ para coordinación y PF. El resto queda igual.
  -- ===================================================================================================
  DROP POLICY "Biblioteca subir segun rol" ON storage.objects;
  CREATE POLICY "Biblioteca subir segun rol" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'Biblioteca' AND (
        (name ~ '^(jugadores|escudos|entrenamientos|videos)/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'tecnico'))
        OR (name ~ '^staff/[^/]+$' AND public.mi_rol() = 'coordinacion')
        OR (name ~ '^gimnasio/[^/]+$' AND public.mi_rol() IN ('coordinacion', 'preparador_fisico'))));

  -- ===================================================================================================
  -- 8) cmj y entrenamiento_bloques: lectura por rol y categoría, escritura solo coordinación y PF.
  -- ===================================================================================================
  DROP POLICY "Acceso total usuarios logueados" ON public.cmj;
  CREATE POLICY cmj_leer ON public.cmj FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico', 'medico')
      OR (public.mi_rol() = 'tecnico' AND (public.categoria_de_jugador(jugador_id) = public.mi_categoria()
          OR (public.mi_categoria_es_reserva() AND public.jugador_tambien_reserva(jugador_id)))));
  CREATE POLICY cmj_cargar ON public.cmj FOR INSERT TO authenticated
    WITH CHECK (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));
  CREATE POLICY cmj_editar ON public.cmj FOR UPDATE TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico')) WITH CHECK (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));
  CREATE POLICY cmj_borrar ON public.cmj FOR DELETE TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));

  DROP POLICY "Acceso total usuarios logueados" ON public.entrenamiento_bloques;
  CREATE POLICY bloques_leer ON public.entrenamiento_bloques FOR SELECT TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico', 'medico')
      OR (public.mi_rol() = 'tecnico' AND (categoria_id = public.mi_categoria()
          OR (public.mi_categoria_es_reserva() AND EXISTS (
            SELECT 1 FROM public.jugadores j WHERE j.categoria_id = entrenamiento_bloques.categoria_id AND j.tambien_reserva)))));
  CREATE POLICY bloques_cargar ON public.entrenamiento_bloques FOR INSERT TO authenticated
    WITH CHECK (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));
  CREATE POLICY bloques_editar ON public.entrenamiento_bloques FOR UPDATE TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico')) WITH CHECK (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));
  CREATE POLICY bloques_borrar ON public.entrenamiento_bloques FOR DELETE TO authenticated
    USING (public.mi_rol() IN ('coordinacion', 'preparador_fisico'));

  -- ===================================================================================================
  -- 9a) Verificación del validador.
  -- ===================================================================================================
  IF pizarra_privado.validar(doc_v1) IS DISTINCT FROM salida_v1_antes THEN
    RAISE EXCEPTION 'El validador cambió el resultado de una pizarra v1. No se aplica nada.';
  END IF;
  doc_v2 := '{"version":2,"superficie":"media","orientacion":"vertical","ataque":"izquierda","bucle":true,"velocidad":1.5,
    "recorrido":"recto","placa":{"titulo":"Córner a favor","analista":"Cuerpo técnico"},
    "elementos":[{"id":"j1","tipo":"jugadora","color":"#F2C230","tinta":"#111111","texto":"","numero":"9","tamano":4,"grosor":1,"dx":0,"dy":0,"curva":0,
                  "vinculo":{"tipo":"jugadora","id":"10000000-0000-4000-8000-000000000001"}},
                 {"id":"r1","tipo":"jugadora","color":"#2563EB","tinta":"#FFFFFF","texto":"","numero":"4","tamano":4,"grosor":1,"dx":0,"dy":0,"curva":0,
                  "vinculo":{"tipo":"rival","id":"20000000-0000-4000-8000-000000000002"}},
                 {"id":"j2","tipo":"jugadora","color":"#F2C230","tinta":"#111111","texto":"","numero":"","tamano":4,"grosor":1,"dx":0,"dy":0,"curva":0,"vinculo":null},
                 {"id":"z1","tipo":"sombra","color":"#EF4444","tinta":"#111111","texto":"Zona de remate","numero":"","tamano":4,"grosor":1,"dx":0,"dy":0,"curva":0,
                  "puntos":[{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":8},{"x":-2.5,"y":8}]}],
    "pasos":[{"id":"s1","nombre":"Inicio","duracion":2,"texto":"Arranca el córner","pausa":1,"pase":"bajo","foco":null,"ocultos":["z1"],
              "poses":{"j1":{"x":10,"y":10,"rotacion":0},"r1":{"x":20,"y":20,"rotacion":0},"j2":{"x":30,"y":30,"rotacion":0},"z1":{"x":50,"y":50,"rotacion":0}}},
             {"id":"s2","nombre":"Centro","duracion":1.5,"texto":"Centro al segundo palo","pausa":0,"pase":"alto","foco":"j1","ocultos":[],
              "poses":{"j1":{"x":12,"y":10,"rotacion":0},"r1":{"x":20,"y":22,"rotacion":0},"j2":{"x":30,"y":30,"rotacion":0},"z1":{"x":50,"y":50,"rotacion":0}}}]}';
  IF pizarra_privado.validar(doc_v2) IS DISTINCT FROM doc_v2 THEN
    RAISE EXCEPTION 'El validador no devolvió igual una pizarra v2 válida: %', pizarra_privado.validar(doc_v2);
  END IF;
  IF pizarra_privado.validar(jsonb_set(doc_v2, '{pasos,0,secreto}', '"x"')) IS DISTINCT FROM doc_v2 THEN
    RAISE EXCEPTION 'El validador no descartó un campo desconocido.';
  END IF;
  -- Cada una de estas tiene que ser rechazada.
  FOREACH malo IN ARRAY ARRAY[
    jsonb_set(doc_v1, '{version}', '3'),
    jsonb_set(doc_v1, '{version}', '"1"'),
    doc_v1 - 'version',
    doc_v2 - 'recorrido',
    jsonb_set(doc_v2, '{placa,titulo}', to_jsonb(repeat('x', 81))),
    jsonb_set(doc_v2, '{pasos,0}', (doc_v2->'pasos'->0) - 'texto'),
    jsonb_set(doc_v2, '{pasos,0,pausa}', '31'),
    jsonb_set(doc_v2, '{pasos,0,pase}', '"medio"'),
    jsonb_set(doc_v2, '{pasos,1,foco}', '"z1"'),
    jsonb_set(doc_v2, '{pasos,1,foco}', '"no-existe"'),
    jsonb_set(doc_v2, '{pasos,0,ocultos}', '["z1","z1"]'),
    jsonb_set(doc_v2, '{pasos,0,ocultos}', '["no-existe"]'),
    jsonb_set(doc_v2, '{elementos,0,vinculo,id}', '"no-es-uuid"'),
    jsonb_set(doc_v2, '{elementos,0,vinculo,tipo}', '"tecnico"'),
    jsonb_set(doc_v2, '{elementos,3,vinculo}', '{"tipo":"jugadora","id":"10000000-0000-4000-8000-000000000001"}'),
    jsonb_set(doc_v2, '{elementos,3,puntos}', '[{"x":0,"y":0},{"x":1,"y":1}]'),
    jsonb_set(doc_v2, '{elementos,3,puntos,0,x}', '101'),
    jsonb_set(doc_v1, '{elementos,0,tipo}', '"sombra"')
  ] LOOP
    BEGIN
      PERFORM pizarra_privado.validar(malo);
      RAISE EXCEPTION 'PRUEBA_FALLIDA: el validador aceptó una pizarra inválida: %', left(malo::text, 300);
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;

  -- Planificación: un bloque nuevo y uno viejo son válidos; la proyección pública solo muestra lo marcado.
  salida := '{"id":"b1","nombre":"Gimnasio","visible":true,"campos_publicos":["objetivo"],"objetivo":"Fuerza","indicaciones":"","notas_internas":"NO",
    "ambito":"gimnasio","ejercicios":[{"id":"e1","nombre":"Sentadilla","visible":true,"campos_publicos":["series","carga","tecnica","demostracion"],
    "objetivo":"","indicaciones":"","notas_internas":"NO_PUBLICAR","series":"4","repeticiones":"6","materiales":"","imagen_url":"","link_video":"",
    "carga":"70% 1RM","tecnica":"Rodillas afuera","musculos":["Cuádriceps"],"material":["Barra"],
    "demostracion":{"tipo":"youtube","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","credito":"Canal X"}}]}';
  IF NOT planificacion_privado.item_valido(salida, true)
     OR NOT planificacion_privado.item_valido(salida - 'ambito', true)
     OR planificacion_privado.item_valido(jsonb_set(salida, '{ambito}', '"pileta"'), true)
     OR planificacion_privado.item_valido(jsonb_set(salida, '{ejercicios,0,demostracion,url}', '"https://evil.example/x.jpg"'), true)
     OR planificacion_privado.item_valido(jsonb_set(salida, '{ejercicios,0,carga}', '5'), true)
     OR planificacion_privado.item_valido(jsonb_set(salida, '{ejercicios,0,campos_publicos}', '["notas_internas"]'), true) THEN
    RAISE EXCEPTION 'La validación de bloques de planificación no quedó como se esperaba.';
  END IF;
  IF planificacion_privado.item_publico(salida, true) IS DISTINCT FROM
     '{"nombre":"Gimnasio","objetivo":"Fuerza","ambito":"gimnasio","ejercicios":[{"nombre":"Sentadilla","series":"4","carga":"70% 1RM","tecnica":"Rodillas afuera",
       "demostracion":{"tipo":"youtube","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","credito":"Canal X"}}]}'::jsonb THEN
    RAISE EXCEPTION 'La proyección pública de Wellness no quedó como se esperaba: %', planificacion_privado.item_publico(salida, true);
  END IF;

  -- ===================================================================================================
  -- 9b) Verificación de la estructura.
  -- ===================================================================================================
  IF (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'biblioteca')
       IS DISTINCT FROM ARRAY['biblioteca_borrar', 'biblioteca_crear', 'biblioteca_editar', 'biblioteca_leer']
     OR (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'biblioteca_carpetas')
       IS DISTINCT FROM ARRAY['carpetas_borrar', 'carpetas_crear', 'carpetas_editar', 'carpetas_leer']
     OR (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'biblioteca_favoritos')
       IS DISTINCT FROM ARRAY['favoritos_leer', 'favoritos_marcar', 'favoritos_quitar']
     OR (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cmj')
       IS DISTINCT FROM ARRAY['cmj_borrar', 'cmj_cargar', 'cmj_editar', 'cmj_leer']
     OR (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entrenamiento_bloques')
       IS DISTINCT FROM ARRAY['bloques_borrar', 'bloques_cargar', 'bloques_editar', 'bloques_leer']
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage') <> 1 THEN
    RAISE EXCEPTION 'Las políticas no quedaron como se esperaba. No se aplica nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
             WHERE s.nspname = 'public' AND c.relname IN ('biblioteca_carpetas', 'biblioteca_favoritos') AND NOT c.relrowsecurity)
     OR EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE table_schema = 'public' AND table_name IN ('biblioteca_carpetas', 'biblioteca_favoritos', 'biblioteca', 'cmj', 'entrenamiento_bloques')
                  AND grantee = 'anon') THEN
    RAISE EXCEPTION 'Las tablas nuevas no tienen RLS o anon tiene permisos. No se aplica nada.';
  END IF;
  IF (SELECT count(*) FROM public.biblioteca_carpetas WHERE ambito = 'cancha') <> 8
     OR (SELECT count(*) FROM public.biblioteca_carpetas WHERE ambito = 'gimnasio') <> 6
     OR (SELECT count(*) FROM public.biblioteca_carpetas WHERE sistema) <> 1 THEN
    RAISE EXCEPTION 'Las carpetas iniciales no quedaron como se esperaba.';
  END IF;
  -- Restricciones de la tabla (como postgres, sin RLS): cada una tiene que fallar.
  SELECT id INTO c_salida FROM public.biblioteca_carpetas WHERE ambito = 'cancha' AND nombre = 'Salida';
  SELECT id INTO c_tren FROM public.biblioteca_carpetas WHERE ambito = 'gimnasio' AND nombre = 'Tren inferior';
  FOREACH sentencia IN ARRAY ARRAY[
    format('INSERT INTO public.biblioteca (descripcion, ambito, carpeta_id) VALUES (''prueba-etapa-c'', ''gimnasio'', %L)', c_salida),
    'INSERT INTO public.biblioteca (descripcion, ambito, tipo) VALUES (''prueba-etapa-c'', ''gimnasio'', ''jugada'')',
    'INSERT INTO public.biblioteca (descripcion, ambito, tecnica) VALUES (''prueba-etapa-c'', ''cancha'', ''x'')',
    'INSERT INTO public.biblioteca (descripcion, ambito, pizarra_miniatura) VALUES (''prueba-etapa-c'', ''gimnasio'', ''data:image/png;base64,AA=='')',
    'INSERT INTO public.biblioteca (descripcion, ambito, demo_tipo, demo_url) VALUES (''prueba-etapa-c'', ''gimnasio'', ''youtube'', ''https://evil.example/watch?v=dQw4w9WgXcQ'')',
    'INSERT INTO public.biblioteca (descripcion, ambito, demo_tipo, demo_url) VALUES (''prueba-etapa-c'', ''gimnasio'', ''imagen'', ''https://abc.supabase.co/storage/v1/object/public/Biblioteca/jugadores/x.jpg'')',
    'INSERT INTO public.biblioteca (descripcion, ambito, demo_tipo) VALUES (''prueba-etapa-c'', ''gimnasio'', ''youtube'')',
    'INSERT INTO public.biblioteca (descripcion, duracion_minutos) VALUES (''prueba-etapa-c'', 0)',
    'INSERT INTO public.biblioteca_carpetas (ambito, nombre) VALUES (''cancha'', '' salida '')',
    'UPDATE public.equipos SET color_camiseta = ''rojo'''
  ] LOOP
    BEGIN
      EXECUTE sentencia;
      GET DIAGNOSTICS n = ROW_COUNT;
      -- Si no hay equipos cargados, el UPDATE no toca filas: se prueba con un equipo temporal.
      IF n = 0 AND sentencia LIKE 'UPDATE public.equipos%' THEN
        INSERT INTO public.equipos (nombre, color_camiseta) VALUES ('prueba-etapa-c', 'rojo');
      END IF;
      RAISE EXCEPTION 'PRUEBA_FALLIDA: la base aceptó: %', sentencia;
    EXCEPTION WHEN check_violation OR foreign_key_violation OR unique_violation THEN NULL;
    END;
  END LOOP;
  -- Un ejercicio de gimnasio válido sí entra (y se deshace).
  BEGIN
    INSERT INTO public.biblioteca (descripcion, contenido, ambito, carpeta_id, musculos, material, tecnica, demo_tipo, demo_url, demo_credito)
    VALUES ('prueba-etapa-c', 'Sentadilla', 'gimnasio', c_tren, '{Cuádriceps,Glúteos}', '{Barra}', 'Rodillas afuera', 'imagen',
            'https://abcdefgh.supabase.co/storage/v1/object/public/Biblioteca/gimnasio/sentadilla.jpg', 'Foto propia');
    RAISE EXCEPTION 'DESHACER_PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE EXCEPTION 'Un ejercicio de gimnasio válido fue rechazado: %', SQLERRM; END IF;
  END;

  -- ===================================================================================================
  -- 9c) Prueba con usuarios reales de cada rol. Todo lo que se escribe acá se deshace.
  --     espera: 'ok' (puede), 've' (puede y alcanza al menos una fila), 'cero' (no alcanza ninguna fila),
  --             'rechazo' (permiso denegado, 42501) o 'fk' (lo frena una clave foránea).
  -- ===================================================================================================
  -- Datos de prueba, como postgres: un ejercicio por ámbito y un favorito de coordinación.
  INSERT INTO public.biblioteca (descripcion, contenido, ambito, carpeta_id) VALUES ('prueba-etapa-c', 'prueba-etapa-c cancha', 'cancha', c_salida)
    RETURNING id INTO fx_cancha;
  INSERT INTO public.biblioteca (descripcion, contenido, ambito, carpeta_id) VALUES ('prueba-etapa-c', 'prueba-etapa-c gimnasio', 'gimnasio', c_tren)
    RETURNING id INTO fx_gimnasio;
  INSERT INTO public.biblioteca_favoritos (usuario_id, biblioteca_id) VALUES (sub_coord, fx_cancha);

  FOR t IN
    SELECT * FROM (VALUES
      -- Biblioteca: Cancha la escriben coordinación y técnicos; Gimnasio, coordinación y PF.
      ('coordinación', 'coord',   'ok',      'INSERT INTO public.biblioteca (descripcion, ambito) VALUES (''prueba-etapa-c'', ''gimnasio'')'),
      ('coordinación', 'coord',   'ok',      'INSERT INTO public.biblioteca (descripcion, ambito, tipo, carpeta_id) VALUES (''prueba-etapa-c'', ''cancha'', ''jugada'', '':salida'')'),
      ('técnico',      'tecnico', 'ok',      'INSERT INTO public.biblioteca (descripcion) VALUES (''prueba-etapa-c'')'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.biblioteca (descripcion, ambito) VALUES (''prueba-etapa-c'', ''gimnasio'')'),
      ('técnico',      'tecnico', 've',      'UPDATE public.biblioteca SET objetivo = ''x'' WHERE id = '':cancha'''),
      ('técnico',      'tecnico', 'cero',    'UPDATE public.biblioteca SET objetivo = ''x'' WHERE id = '':gimnasio'''),
      ('técnico',      'tecnico', 'cero',    'DELETE FROM public.biblioteca WHERE id = '':gimnasio'''),
      ('técnico',      'tecnico', 've',      'DELETE FROM public.biblioteca WHERE id = '':cancha'''),
      ('técnico',      'tecnico', 've',      'SELECT 1 FROM public.biblioteca WHERE id = '':gimnasio'''),
      ('PF',           'pf',      'ok',      'INSERT INTO public.biblioteca (descripcion, ambito, carpeta_id, musculos) VALUES (''prueba-etapa-c'', ''gimnasio'', '':tren'', ''{Core}'')'),
      ('PF',           'pf',      'rechazo', 'INSERT INTO public.biblioteca (descripcion) VALUES (''prueba-etapa-c'')'),
      ('PF',           'pf',      'cero',    'UPDATE public.biblioteca SET objetivo = ''x'' WHERE id = '':cancha'''),
      ('PF',           'pf',      've',      'UPDATE public.biblioteca SET tecnica = ''x'' WHERE id = '':gimnasio'''),
      ('PF',           'pf',      've',      'SELECT 1 FROM public.biblioteca WHERE id = '':cancha'''),
      ('médico',       'medico',  'cero',    'SELECT 1 FROM public.biblioteca'),
      ('médico',       'medico',  'rechazo', 'INSERT INTO public.biblioteca (descripcion) VALUES (''prueba-etapa-c'')'),
      -- RPC de guardado.
      ('técnico',      'tecnico', 've',      'SELECT public.guardar_ejercicio_pizarra(NULL, NULL, ''{"descripcion":"prueba-etapa-c","pizarra":null}'')'),
      ('técnico',      'tecnico', 'rechazo', 'SELECT public.guardar_ejercicio_pizarra(NULL, NULL, ''{"descripcion":"prueba-etapa-c","ambito":"gimnasio"}'')'),
      ('técnico',      'tecnico', 'rechazo', 'SELECT public.guardar_ejercicio_pizarra('':gimnasio'', 1, ''{"descripcion":"prueba-etapa-c"}'')'),
      ('PF',           'pf',      've',      'SELECT public.guardar_ejercicio_pizarra(NULL, NULL, ''{"descripcion":"prueba-etapa-c","ambito":"gimnasio","musculos":["Core"],"material":["Fitball"]}'')'),
      ('PF',           'pf',      've',      'SELECT public.guardar_ejercicio_pizarra('':gimnasio'', 1, ''{"descripcion":"prueba-etapa-c","tecnica":"Espalda neutra"}'')'),
      ('PF',           'pf',      'rechazo', 'SELECT public.guardar_ejercicio_pizarra(NULL, NULL, ''{"descripcion":"prueba-etapa-c"}'')'),
      -- Carpetas: "Sin clasificar" no se toca; una carpeta con ejercicios no se borra.
      ('técnico',      'tecnico', 'ok',      'INSERT INTO public.biblioteca_carpetas (ambito, nombre, orden) VALUES (''cancha'', ''prueba-etapa-c'', 99)'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.biblioteca_carpetas (ambito, nombre, orden) VALUES (''gimnasio'', ''prueba-etapa-c'', 99)'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.biblioteca_carpetas (ambito, nombre, sistema) VALUES (''cancha'', ''prueba-etapa-c'', true)'),
      ('PF',           'pf',      'ok',      'INSERT INTO public.biblioteca_carpetas (ambito, nombre, orden) VALUES (''gimnasio'', ''prueba-etapa-c'', 99)'),
      ('técnico',      'tecnico', 've',      'UPDATE public.biblioteca_carpetas SET orden = 15 WHERE id = '':salida'''),
      ('técnico',      'tecnico', 'cero',    'UPDATE public.biblioteca_carpetas SET orden = 15 WHERE id = '':tren'''),
      ('coordinación', 'coord',   'cero',    'UPDATE public.biblioteca_carpetas SET nombre = ''prueba-etapa-c'' WHERE sistema'),
      ('coordinación', 'coord',   'cero',    'DELETE FROM public.biblioteca_carpetas WHERE sistema'),
      ('coordinación', 'coord',   'fk',      'DELETE FROM public.biblioteca_carpetas WHERE id = '':salida'''),
      ('médico',       'medico',  'cero',    'SELECT 1 FROM public.biblioteca_carpetas'),
      -- Favoritos: cada uno los suyos.
      ('técnico',      'tecnico', 'ok',      'INSERT INTO public.biblioteca_favoritos (biblioteca_id) VALUES ('':cancha'')'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.biblioteca_favoritos (usuario_id, biblioteca_id) VALUES ('':sub_coord'', '':gimnasio'')'),
      ('técnico',      'tecnico', 'cero',    'SELECT 1 FROM public.biblioteca_favoritos'),
      ('técnico',      'tecnico', 'cero',    'DELETE FROM public.biblioteca_favoritos'),
      ('coordinación', 'coord',   've',      'SELECT 1 FROM public.biblioteca_favoritos'),
      ('médico',       'medico',  'rechazo', 'INSERT INTO public.biblioteca_favoritos (biblioteca_id) VALUES ('':cancha'')'),
      -- cmj: cargan coordinación y PF; el técnico solo lee.
      ('coordinación', 'coord',   'ok',      'INSERT INTO public.cmj (fecha, jugador_id, valor_cm) VALUES (current_date, '':jugadora'', 30)'),
      ('PF',           'pf',      'ok',      'INSERT INTO public.cmj (fecha, jugador_id, valor_cm) VALUES (current_date, '':jugadora'', 30)'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.cmj (fecha, jugador_id, valor_cm) VALUES (current_date, '':jugadora'', 30)'),
      ('técnico',      'tecnico', 'cero',    'UPDATE public.cmj SET valor_cm = valor_cm'),
      ('técnico',      'tecnico', 'cero',    'DELETE FROM public.cmj'),
      ('médico',       'medico',  'rechazo', 'INSERT INTO public.cmj (fecha, jugador_id, valor_cm) VALUES (current_date, '':jugadora'', 30)'),
      ('médico',       'medico',  'cero',    'DELETE FROM public.cmj'),
      ('sin perfil',   'nadie',   'rechazo', 'INSERT INTO public.cmj (fecha, jugador_id, valor_cm) VALUES (current_date, '':jugadora'', 30)'),
      ('sin perfil',   'nadie',   'cero',    'SELECT 1 FROM public.cmj'),
      -- entrenamiento_bloques: igual que cmj.
      ('coordinación', 'coord',   'ok',      'INSERT INTO public.entrenamiento_bloques (fecha, categoria_id, descripcion, duracion_minutos) VALUES (current_date, '':cat'', ''prueba-etapa-c'', 60)'),
      ('PF',           'pf',      'ok',      'INSERT INTO public.entrenamiento_bloques (fecha, categoria_id, descripcion, duracion_minutos) VALUES (current_date, '':cat'', ''prueba-etapa-c'', 60)'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO public.entrenamiento_bloques (fecha, categoria_id, descripcion, duracion_minutos) VALUES (current_date, '':cat'', ''prueba-etapa-c'', 60)'),
      ('técnico',      'tecnico', 'cero',    'UPDATE public.entrenamiento_bloques SET duracion_minutos = duracion_minutos'),
      ('técnico',      'tecnico', 'cero',    'DELETE FROM public.entrenamiento_bloques'),
      ('sin perfil',   'nadie',   'cero',    'SELECT 1 FROM public.entrenamiento_bloques'),
      -- Storage: gimnasio/ para coordinación y PF; lo demás igual que antes.
      ('coordinación', 'coord',   'ok',      'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''gimnasio/prueba-etapa-c.jpg'')'),
      ('PF',           'pf',      'ok',      'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''gimnasio/prueba-etapa-c.jpg'')'),
      ('PF',           'pf',      'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''gimnasio/sub/prueba-etapa-c.jpg'')'),
      ('PF',           'pf',      'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''entrenamientos/prueba-etapa-c.jpg'')'),
      ('técnico',      'tecnico', 'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''gimnasio/prueba-etapa-c.jpg'')'),
      ('técnico',      'tecnico', 'ok',      'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''entrenamientos/prueba-etapa-c.jpg'')'),
      ('médico',       'medico',  'rechazo', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''Biblioteca'', ''gimnasio/prueba-etapa-c.jpg'')'),
      -- Sin login: nada.
      ('sin login',    'anon',    'rechazo', 'SELECT 1 FROM public.biblioteca_carpetas'),
      ('sin login',    'anon',    'rechazo', 'SELECT 1 FROM public.biblioteca_favoritos'),
      ('sin login',    'anon',    'rechazo', 'SELECT 1 FROM public.cmj')
    ) AS v(quien, cuenta, espera, plantilla)
  LOOP
    v_email := CASE t.cuenta WHEN 'coord' THEN v_coord WHEN 'tecnico' THEN v_tecnico WHEN 'pf' THEN v_pf WHEN 'medico' THEN v_medico
                           WHEN 'nadie' THEN 'sin-perfil@prueba.invalid' ELSE '' END;
    v_sub := CASE t.cuenta WHEN 'coord' THEN sub_coord WHEN 'tecnico' THEN sub_tecnico WHEN 'pf' THEN sub_pf WHEN 'medico' THEN sub_medico
                         WHEN 'nadie' THEN '00000000-0000-4000-8000-0000000000ff'::uuid END;
    IF v_email IS NULL THEN
      RAISE NOTICE 'Sin usuario de % para probar: se saltea "%".', t.quien, t.plantilla;
      CONTINUE;
    END IF;
    sentencia := replace(replace(replace(replace(replace(replace(replace(t.plantilla,
      ':salida', c_salida::text), ':tren', c_tren::text), ':cancha', fx_cancha::text), ':gimnasio', fx_gimnasio::text),
      ':jugadora', v_jugadora::text), ':cat', v_cat::text), ':sub_coord', sub_coord::text);
    BEGIN
      PERFORM set_config('request.jwt.claims',
        CASE WHEN t.cuenta = 'anon' THEN '{"role":"anon"}'
             ELSE json_build_object('email', v_email, 'sub', v_sub, 'role', 'authenticated')::text END, true);
      EXECUTE format('SET LOCAL ROLE %I', CASE WHEN t.cuenta = 'anon' THEN 'anon' ELSE 'authenticated' END);
      EXECUTE sentencia;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF t.espera IN ('rechazo', 'fk') THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % pudo hacer: %', t.quien, sentencia;
      ELSIF t.espera = 'cero' AND n <> 0 THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % alcanzó % filas con: %', t.quien, n, sentencia;
      ELSIF t.espera = 've' AND n = 0 THEN
        RAISE EXCEPTION 'PRUEBA_FALLIDA: % no alcanzó ninguna fila con: %', t.quien, sentencia;
      END IF;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION
      WHEN insufficient_privilege THEN
        IF t.espera <> 'rechazo' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: % no pudo hacer: % (%)', t.quien, sentencia, SQLERRM; END IF;
      WHEN foreign_key_violation OR restrict_violation THEN
        IF t.espera <> 'fk' THEN RAISE EXCEPTION 'PRUEBA_FALLIDA: % chocó con una clave foránea en: % (%)', t.quien, sentencia, SQLERRM; END IF;
      WHEN OTHERS THEN
        IF SQLERRM = 'DESHACER_PRUEBA' THEN NULL;
        ELSIF SQLERRM LIKE 'PRUEBA_FALLIDA%' THEN RAISE;
        ELSE RAISE EXCEPTION 'Prueba de % con "%": error inesperado: %', t.quien, sentencia, SQLERRM;
        END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Se borran los datos de prueba y se controla que no quede nada.
  DELETE FROM public.biblioteca WHERE id IN (fx_cancha, fx_gimnasio);
  IF (SELECT count(*) FROM public.biblioteca) <> antes_biblioteca OR (SELECT count(*) FROM public.cmj) <> antes_cmj
     OR (SELECT count(*) FROM public.entrenamiento_bloques) <> antes_bloques
     OR (SELECT count(*) FROM public.biblioteca_carpetas) <> antes_carpetas
     OR EXISTS (SELECT 1 FROM public.biblioteca_favoritos)
     OR EXISTS (SELECT 1 FROM public.equipos WHERE nombre = 'prueba-etapa-c')
     OR EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%prueba-etapa-c%') THEN
    RAISE EXCEPTION 'Quedaron datos de prueba. No se aplica nada.';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END
$etapa_c$;

-- Resultado: políticas de las tablas tocadas, carpetas iniciales y columnas nuevas.
SELECT 'politica' AS que, tablename AS tabla, policyname AS detalle FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('biblioteca', 'biblioteca_carpetas', 'biblioteca_favoritos', 'cmj', 'entrenamiento_bloques'))
   OR schemaname = 'storage'
UNION ALL
SELECT 'carpeta', ambito, nombre || CASE WHEN sistema THEN ' (fija)' ELSE '' END FROM public.biblioteca_carpetas
UNION ALL
SELECT 'columna', table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND ((table_name = 'biblioteca' AND column_name IN ('ambito', 'tipo', 'carpeta_id', 'duracion_minutos', 'objetivo',
  'musculos', 'material', 'tecnica', 'demo_tipo', 'demo_url', 'demo_credito', 'creado_por', 'actualizado_por', 'actualizado_en'))
  OR (table_name = 'equipos' AND column_name IN ('color_camiseta', 'color_numero')))
ORDER BY 1, 2, 3;
