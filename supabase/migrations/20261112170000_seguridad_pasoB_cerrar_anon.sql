-- Seguridad, paso B: sin login no se puede leer ni escribir ninguna tabla.
--
-- YA ESTÁ APLICADO EN PRODUCCIÓN (verificado a mano el 2026-11-13). No volver a correrlo: si se corre, se detiene
-- solo porque encuentra el respaldo guardado. Se aplicó con una versión anterior de este archivo que usaba
-- BEGIN/COMMIT y una tabla temporal: el editor SQL de Supabase ejecutó las sentencias por separado, los pasos 1 a 6
-- quedaron aplicados y la verificación falló porque la tabla temporal ya no existía. La verificación se hizo a mano
-- (0 políticas y 0 tablas para anon, exactamente las 5 funciones, authenticated y service_role sin diferencias con
-- el respaldo) y se corrió NOTIFY pgrst. Esta versión corregida es la que queda versionada.
--
-- Todo está dentro de un único bloque DO: es una sola sentencia, así que es atómico aunque el editor separe las
-- sentencias o ignore BEGIN/COMMIT. No usa tablas temporales.
--
-- Después de esto, anon (sin login) solo puede ejecutar 5 funciones:
--   wellness_publico_categoria, wellness_publico_respondio, wellness_publico_guardar, rpe_publico_guardar
--   y planificacion_publica_hoy (entrenamiento del día).
--
-- Qué hace:
--   1. Guarda un respaldo exacto en seguridad_privado.respaldo_paso_b (permisos de tablas, vistas, secuencias,
--      columnas y funciones del esquema public; las 3 políticas de anon; los privilegios por defecto; las opciones
--      de la vista jugadores_publico).
--   2. Borra las 3 políticas de anon (bienestar de hoy, RPE reciente, categorías).
--   3. Le quita a anon todos los permisos sobre tablas, vistas, secuencias y columnas del esquema public.
--   4. Le quita a anon (y a PUBLIC) la ejecución de las demás funciones de public. Si authenticated o service_role
--      las ejecutaban gracias a PUBLIC, se les da el permiso explícito: para ellos no cambia nada.
--   5. Las tablas, secuencias y funciones nuevas que cree postgres en public ya no nacen con permisos para anon.
--   6. La vista jugadores_publico pasa a respetar el RLS de quien la consulta (security_invoker).
--   7. Verifica todo (incluido que authenticated y service_role conserven exactamente sus permisos, comparando con
--      una foto guardada en seguridad_privado.pasob_antes, que se borra al final) y prueba como anon que las tablas
--      dan "permission denied" y que las 5 funciones siguen andando. Las escrituras de prueba se deshacen.
--      Si algo falla, no se aplica nada.
--
-- Reversión: supabase/rollback/20261112170000_seguridad_pasoB_cerrar_anon.sql

DO $pasob$
DECLARE
  ya_aplicado boolean;
  r record;
  firma text;
  tenia_authenticated boolean;
  tenia_service_role boolean;
  permitidas regprocedure[];
  v_cat uuid;
  v_jug uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_antes text;
  v_despues text;
  v_lista jsonb;
  consulta text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- Controles previos.
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regprocedure('public.wellness_publico_categoria(uuid)') IS NULL
     OR to_regprocedure('public.wellness_publico_respondio(uuid,uuid)') IS NULL
     OR to_regprocedure('public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)') IS NULL
     OR to_regprocedure('public.rpe_publico_guardar(uuid,uuid,date,text,integer)') IS NULL
     OR to_regprocedure('public.planificacion_publica_hoy(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones del paso A o planificacion_publica_hoy. No continuar.';
  END IF;
  permitidas := ARRAY[
    'public.wellness_publico_categoria(uuid)'::regprocedure,
    'public.wellness_publico_respondio(uuid,uuid)'::regprocedure,
    'public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)'::regprocedure,
    'public.rpe_publico_guardar(uuid,uuid,date,text,integer)'::regprocedure,
    'public.planificacion_publica_hoy(uuid,uuid)'::regprocedure];
  IF has_table_privilege('anon', 'public.jugadores_publico', 'UPDATE') THEN
    RAISE EXCEPTION 'Falta aplicar el paso 0.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_paso_b') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_paso_b)' INTO ya_aplicado;
    IF ya_aplicado THEN
      RAISE EXCEPTION 'El paso B ya se aplicó (hay respaldo guardado).';
    END IF;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND 'anon'::name = ANY (roles)) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bienestar' AND policyname = 'publico bienestar de hoy')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sesiones_fisicas' AND policyname = 'publico rpe reciente')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categorias' AND policyname = 'publico ve categorias') THEN
    RAISE EXCEPTION 'Las políticas de anon no son las 3 auditadas. Revisar antes de seguir.';
  END IF;

  -- 1) Respaldo exacto (privado: ni anon ni authenticated lo pueden leer).
  CREATE SCHEMA IF NOT EXISTS seguridad_privado;
  REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated;
  CREATE TABLE IF NOT EXISTS seguridad_privado.respaldo_paso_b (
    orden integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo text NOT NULL CHECK (tipo IN ('relacion', 'columna', 'funcion', 'politica', 'privilegio_defecto', 'opciones_vista')),
    objeto text NOT NULL,
    detalle text,
    acl aclitem[],
    opciones text[],
    guardado_en timestamptz NOT NULL DEFAULT now()
  );
  REVOKE ALL ON seguridad_privado.respaldo_paso_b FROM PUBLIC, anon, authenticated;

  -- Tablas, vistas y secuencias (detalle = tipo de relación).
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, detalle, acl)
  SELECT 'relacion', format('%I.%I', n.nspname, c.relname), c.relkind::text,
         coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  ORDER BY c.relname;

  -- Permisos por columna (detalle = columna).
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, detalle, acl)
  SELECT 'columna', format('%I.%I', n.nspname, c.relname), a.attname, a.attacl
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  ORDER BY c.relname, a.attnum;

  -- Funciones de public que no son de extensiones (objeto = firma con tipos).
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, acl)
  SELECT 'funcion', format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)),
         coalesce(p.proacl, acldefault('f'::"char", p.proowner))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  ORDER BY p.proname, p.oid;

  -- Las 3 políticas de anon, como sentencias para recrearlas (detalle = CREATE POLICY).
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, detalle)
  SELECT 'politica', format('%I.%I', schemaname, tablename),
         format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
           policyname, schemaname, tablename, permissive, cmd,
           (SELECT string_agg(quote_ident(x), ', ') FROM unnest(roles) x),
           CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
           CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END)
  FROM pg_policies
  WHERE schemaname = 'public' AND 'anon'::name = ANY (roles)
  ORDER BY tablename, policyname;

  -- Privilegios por defecto de postgres en public (objeto = tipo de objeto: r, S, f, T).
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, acl)
  SELECT 'privilegio_defecto', d.defaclobjtype::text, d.defaclacl
  FROM pg_default_acl d
  WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace;

  -- Opciones de la vista jugadores_publico.
  INSERT INTO seguridad_privado.respaldo_paso_b (tipo, objeto, opciones)
  SELECT 'opciones_vista', 'public.jugadores_publico', c.reloptions
  FROM pg_class c WHERE c.oid = 'public.jugadores_publico'::regclass;

  -- Foto de lo que pueden hacer authenticated y service_role, para comprobar al final que no cambió.
  -- Tabla normal (no temporal), privada, que se borra al final del bloque.
  DROP TABLE IF EXISTS seguridad_privado.pasob_antes;
  CREATE TABLE seguridad_privado.pasob_antes AS
  SELECT 'relacion' AS tipo, c.oid AS id, pr.permiso, rl.rol, has_table_privilege(rl.rol, c.oid, pr.permiso) AS puede
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr(permiso)
  CROSS JOIN unnest(ARRAY['authenticated','service_role']) rl(rol)
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'secuencia', c.oid, pr.permiso, rl.rol,
         CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(rl.rol, c.oid, pr.permiso) END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) pr(permiso)
  CROSS JOIN unnest(ARRAY['authenticated','service_role']) rl(rol)
  WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'funcion', p.oid, 'EXECUTE', rl.rol, has_function_privilege(rl.rol, p.oid, 'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN unnest(ARRAY['authenticated','service_role']) rl(rol)
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p');
  REVOKE ALL ON seguridad_privado.pasob_antes FROM PUBLIC, anon, authenticated;

  -- 2) Políticas de anon.
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND 'anon'::name = ANY (roles) LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- 3) Tablas, vistas, secuencias y columnas.
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  FOR r IN
    SELECT DISTINCT n.nspname, c.relname, a.attname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace,
    aclexplode(a.attacl) x
    WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND x.grantee = 'anon'::regrole
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON TABLE %I.%I FROM anon', r.attname, r.nspname, r.relname);
  END LOOP;

  -- 4) Funciones: anon solo ejecuta las 5 del formulario público.
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, oidvectortypes(p.proargtypes) AS tipos
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
      AND p.oid <> ALL (permitidas)
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    firma := format('%I.%I(%s)', r.nspname, r.proname, r.tipos);
    tenia_authenticated := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    tenia_service_role := has_function_privilege('service_role', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC, anon', firma);
    IF tenia_authenticated AND NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO authenticated', firma);
    END IF;
    IF tenia_service_role AND NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', firma);
    END IF;
  END LOOP;

  -- 5) Lo nuevo que cree postgres en public ya no nace con permisos para anon.
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

  -- 6) La vista respeta el RLS de quien consulta. planificacion_publica_hoy la usa como postgres: no cambia.
  ALTER VIEW public.jugadores_publico SET (security_invoker = true);

  -- 7a) Verificación de permisos.
  SELECT c.oid::regclass AS objeto INTO r
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
      OR has_table_privilege('anon', c.oid, 'TRUNCATE') OR has_table_privilege('anon', c.oid, 'REFERENCES')
      OR has_table_privilege('anon', c.oid, 'TRIGGER')
      OR has_any_column_privilege('anon', c.oid, 'SELECT') OR has_any_column_privilege('anon', c.oid, 'INSERT')
      OR has_any_column_privilege('anon', c.oid, 'UPDATE') OR has_any_column_privilege('anon', c.oid, 'REFERENCES'))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'anon todavía tiene permisos sobre %. No se aplica nada.', r.objeto;
  END IF;

  SELECT c.oid::regclass AS objeto INTO r
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
    -- CASE: si no, Postgres puede evaluar la función sobre índices antes de filtrar por relkind.
    AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, 'USAGE') OR has_sequence_privilege('anon', c.oid, 'SELECT')
      OR has_sequence_privilege('anon', c.oid, 'UPDATE') ELSE false END
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'anon todavía tiene permisos sobre la secuencia %. No se aplica nada.', r.objeto;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND 'anon'::name = ANY (roles)) THEN
    RAISE EXCEPTION 'Quedó alguna política de anon. No se aplica nada.';
  END IF;

  SELECT p.oid::regprocedure AS funcion INTO r
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.oid <> ALL (permitidas)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'anon todavía puede ejecutar %. No se aplica nada.', r.funcion;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(permitidas) f WHERE NOT has_function_privilege('anon', f, 'EXECUTE')) THEN
    RAISE EXCEPTION 'anon perdió alguna de las 5 funciones del formulario público. No se aplica nada.';
  END IF;

  SELECT a.tipo, a.id, a.permiso, a.rol INTO r
  FROM seguridad_privado.pasob_antes a
  WHERE a.puede IS DISTINCT FROM CASE a.tipo
    WHEN 'relacion' THEN has_table_privilege(a.rol, a.id, a.permiso)
    WHEN 'secuencia' THEN has_sequence_privilege(a.rol, a.id, a.permiso)
    ELSE has_function_privilege(a.rol, a.id, a.permiso) END
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Cambió un permiso de %: % sobre % (oid %). No se aplica nada.', r.rol, r.permiso, r.tipo, r.id;
  END IF;
  DROP TABLE seguridad_privado.pasob_antes;

  IF EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) x
             WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace
               AND x.grantee = 'anon'::regrole) THEN
    RAISE EXCEPTION 'Los privilegios por defecto todavía incluyen a anon. No se aplica nada.';
  END IF;

  IF NOT coalesce((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass), false) THEN
    RAISE EXCEPTION 'jugadores_publico no quedó con security_invoker. No se aplica nada.';
  END IF;

  -- 7b) Prueba como anon: las tablas dan "permission denied" y las 5 funciones andan. Las escrituras se deshacen.
  FOREACH consulta IN ARRAY ARRAY[
    'SELECT 1 FROM public.bienestar LIMIT 1',
    'SELECT 1 FROM public.sesiones_fisicas LIMIT 1',
    'SELECT 1 FROM public.jugadores LIMIT 1',
    'SELECT 1 FROM public.jugadores_publico LIMIT 1',
    'SELECT 1 FROM public.categorias LIMIT 1',
    'SELECT 1 FROM public.partidos LIMIT 1',
    'SELECT 1 FROM public.perfiles LIMIT 1',
    'INSERT INTO public.bienestar (fecha, jugador_id) VALUES (current_date, gen_random_uuid())',
    'UPDATE public.sesiones_fisicas SET rpe = rpe WHERE false',
    'DELETE FROM public.bienestar WHERE false',
    'UPDATE public.jugadores_publico SET nombre = nombre WHERE false']
  LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE consulta;
      RAISE EXCEPTION 'anon pudo ejecutar: %', consulta;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  SELECT j.categoria_id, j.id INTO v_cat, v_jug FROM public.jugadores j ORDER BY j.apellido, j.id LIMIT 1;
  IF v_jug IS NULL THEN
    RAISE EXCEPTION 'No hay jugadoras para probar.';
  END IF;

  SET LOCAL ROLE anon;
  v_lista := public.wellness_publico_categoria(v_cat);
  PERFORM public.wellness_publico_respondio(v_cat, v_jug);
  PERFORM public.planificacion_publica_hoy(v_cat, v_jug);
  RESET ROLE;
  IF v_lista IS NULL OR jsonb_array_length(v_lista -> 'jugadoras') = 0 THEN
    RAISE EXCEPTION 'wellness_publico_categoria dejó de devolver la lista.';
  END IF;

  SELECT coalesce(row_to_json(b)::text, '') INTO v_antes FROM public.bienestar b WHERE b.jugador_id = v_jug AND b.fecha = v_hoy;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 3, 3, 3, 3, 3);
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy, 'entrenamiento', 5);
    IF NOT public.wellness_publico_respondio(v_cat, v_jug) THEN
      RAISE EXCEPTION 'Después de guardar, "respondió" debería ser sí.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DESHACER_PRUEBA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE; END IF;
  END;
  RESET ROLE;
  SELECT coalesce(row_to_json(b)::text, '') INTO v_despues FROM public.bienestar b WHERE b.jugador_id = v_jug AND b.fecha = v_hoy;
  IF v_antes IS DISTINCT FROM v_despues THEN
    RAISE EXCEPTION 'La prueba dejó cambios en bienestar.';
  END IF;

  -- Que la API (PostgREST y GraphQL) tome los permisos nuevos sin esperar (se envía al confirmar).
  PERFORM pg_notify('pgrst', 'reload schema');
END
$pasob$;

-- Resultado: qué puede hacer anon ahora en public (tiene que dar 0 tablas, 0 secuencias, 0 políticas y 5 funciones).
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
      AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'))) AS tablas_con_permiso_anon,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, 'USAGE') ELSE false END) AS secuencias_con_permiso_anon,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND 'anon'::name = ANY (roles)) AS politicas_anon,
  (SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')) AS funciones_anon;
