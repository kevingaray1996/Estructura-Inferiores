-- Reversión del paso B: devuelve exactamente los permisos, políticas, privilegios por defecto y opciones de vista
-- guardados en seguridad_privado.respaldo_paso_b.
-- OJO: vuelve a abrir a anon (sin login) el wellness de hoy, el RPE reciente, las categorías y los permisos
-- amplios sobre tablas. Correr solo si el paso B rompió algo, y avisar para revisar.
-- El formulario nuevo sigue funcionando igual después de revertir (usa las funciones del paso A).
-- Correr completo en el editor SQL de Supabase (como postgres). Si algo no coincide, no se revierte nada.
--
-- Todo está dentro de un único bloque DO: es una sola sentencia, así que es atómico aunque el editor SQL de
-- Supabase ejecute las sentencias por separado o ignore BEGIN/COMMIT (eso pasó al aplicar el paso B).

DO $reversion$
DECLARE
  hay boolean;
  r record;
  quien text;
  clase text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_paso_b') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo del paso B: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_paso_b)' INTO hay;
  IF NOT hay THEN
    RAISE EXCEPTION 'El respaldo del paso B está vacío: no hay nada que revertir.';
  END IF;

  -- Políticas de anon.
  FOR r IN SELECT objeto, detalle FROM seguridad_privado.respaldo_paso_b WHERE tipo = 'politica' ORDER BY orden LOOP
    EXECUTE r.detalle;
  END LOOP;

  -- Tablas, vistas y secuencias: se devuelve lo que tenían anon y PUBLIC.
  FOR r IN
    SELECT b.objeto, b.detalle AS relkind, x.privilege_type, x.grantee, x.is_grantable
    FROM seguridad_privado.respaldo_paso_b b, aclexplode(b.acl) x
    WHERE b.tipo = 'relacion' AND x.grantee IN (0, 'anon'::regrole) AND to_regclass(b.objeto) IS NOT NULL
  LOOP
    quien := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE 'anon' END;
    clase := CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END;
    EXECUTE format('GRANT %s ON %s %s TO %s%s', r.privilege_type, clase, r.objeto, quien,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- Columnas.
  FOR r IN
    SELECT b.objeto, b.detalle AS columna, x.privilege_type, x.grantee, x.is_grantable
    FROM seguridad_privado.respaldo_paso_b b, aclexplode(b.acl) x
    WHERE b.tipo = 'columna' AND x.grantee IN (0, 'anon'::regrole) AND to_regclass(b.objeto) IS NOT NULL
  LOOP
    quien := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE 'anon' END;
    EXECUTE format('GRANT %s (%I) ON TABLE %s TO %s%s', r.privilege_type, r.columna, r.objeto, quien,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- Funciones: se devuelve EXECUTE a anon y PUBLIC, y se quitan los permisos explícitos que el paso B
  -- agregó a authenticated o service_role (antes los tenían por PUBLIC).
  FOR r IN
    SELECT b.objeto, x.privilege_type, x.grantee, x.is_grantable
    FROM seguridad_privado.respaldo_paso_b b, aclexplode(b.acl) x
    WHERE b.tipo = 'funcion' AND x.grantee IN (0, 'anon'::regrole) AND to_regprocedure(b.objeto) IS NOT NULL
  LOOP
    quien := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE 'anon' END;
    EXECUTE format('GRANT %s ON ROUTINE %s TO %s%s', r.privilege_type, r.objeto, quien,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
  FOR r IN
    SELECT b.objeto, x.grantee
    FROM seguridad_privado.respaldo_paso_b b
    JOIN pg_proc p ON p.oid = to_regprocedure(b.objeto)
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
    WHERE b.tipo = 'funcion' AND x.privilege_type = 'EXECUTE'
      AND x.grantee IN ('authenticated'::regrole, 'service_role'::regrole)
      AND NOT EXISTS (SELECT 1 FROM aclexplode(b.acl) y WHERE y.grantee = x.grantee AND y.privilege_type = 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM %I', r.objeto, pg_get_userbyid(r.grantee));
  END LOOP;

  -- Privilegios por defecto de postgres en public.
  FOR r IN
    SELECT b.objeto AS tipo_objeto, x.privilege_type, x.is_grantable
    FROM seguridad_privado.respaldo_paso_b b, aclexplode(b.acl) x
    WHERE b.tipo = 'privilegio_defecto' AND x.grantee = 'anon'::regrole
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT %s ON %s TO anon%s',
      r.privilege_type,
      CASE r.tipo_objeto WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;

  -- Opciones de la vista.
  EXECUTE 'ALTER VIEW public.jugadores_publico RESET (security_invoker)';
  FOR r IN SELECT opciones FROM seguridad_privado.respaldo_paso_b WHERE tipo = 'opciones_vista' AND opciones IS NOT NULL LOOP
    EXECUTE format('ALTER VIEW public.jugadores_publico SET (%s)', array_to_string(r.opciones, ', '));
  END LOOP;

  -- Verificación: todo igual al respaldo (sin contar quién otorgó cada permiso).
  SELECT b.tipo, b.objeto, b.detalle INTO r
  FROM seguridad_privado.respaldo_paso_b b
  WHERE b.tipo IN ('relacion', 'columna', 'funcion')
    AND CASE b.tipo WHEN 'funcion' THEN to_regprocedure(b.objeto) IS NOT NULL ELSE to_regclass(b.objeto) IS NOT NULL END
    AND EXISTS (
      WITH actual AS (
        SELECT CASE b.tipo
          WHEN 'relacion' THEN (SELECT coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))
                                FROM pg_class c WHERE c.oid = to_regclass(b.objeto))
          WHEN 'columna' THEN (SELECT a.attacl FROM pg_attribute a WHERE a.attrelid = to_regclass(b.objeto) AND a.attname = b.detalle)
          ELSE (SELECT coalesce(p.proacl, acldefault('f'::"char", p.proowner)) FROM pg_proc p WHERE p.oid = to_regprocedure(b.objeto))
        END AS acl)
      (SELECT x.grantee, x.privilege_type, x.is_grantable FROM aclexplode(b.acl) x
       EXCEPT SELECT x.grantee, x.privilege_type, x.is_grantable FROM actual, aclexplode(actual.acl) x)
      UNION ALL
      (SELECT x.grantee, x.privilege_type, x.is_grantable FROM actual, aclexplode(actual.acl) x
       EXCEPT SELECT x.grantee, x.privilege_type, x.is_grantable FROM aclexplode(b.acl) x))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Los permisos de % % % no quedaron iguales al respaldo. No se revierte nada.', r.tipo, r.objeto, coalesce(r.detalle, '');
  END IF;

  SELECT b.objeto, b.detalle INTO r
  FROM seguridad_privado.respaldo_paso_b b
  WHERE b.tipo = 'politica'
    AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE format('%I.%I', p.schemaname, p.tablename) = b.objeto
                      AND b.detalle LIKE format('CREATE POLICY %I ON %%', p.policyname))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'No se recreó una política de %. No se revierte nada.', r.objeto;
  END IF;

  IF EXISTS (
    SELECT 1 FROM seguridad_privado.respaldo_paso_b b
    WHERE b.tipo = 'privilegio_defecto' AND EXISTS (
      (SELECT x.grantee, x.privilege_type, x.is_grantable FROM aclexplode(b.acl) x
       EXCEPT SELECT x.grantee, x.privilege_type, x.is_grantable FROM pg_default_acl d, aclexplode(d.defaclacl) x
              WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype::text = b.objeto)
      UNION ALL
      (SELECT x.grantee, x.privilege_type, x.is_grantable FROM pg_default_acl d, aclexplode(d.defaclacl) x
              WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype::text = b.objeto
       EXCEPT SELECT x.grantee, x.privilege_type, x.is_grantable FROM aclexplode(b.acl) x))) THEN
    RAISE EXCEPTION 'Los privilegios por defecto no quedaron iguales al respaldo. No se revierte nada.';
  END IF;

  IF (SELECT reloptions FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass)
     IS DISTINCT FROM (SELECT opciones FROM seguridad_privado.respaldo_paso_b WHERE tipo = 'opciones_vista') THEN
    RAISE EXCEPTION 'Las opciones de jugadores_publico no quedaron iguales al respaldo. No se revierte nada.';
  END IF;

  -- Se vacía el respaldo para poder volver a correr el paso B si hace falta.
  DELETE FROM seguridad_privado.respaldo_paso_b;

  -- Que la API tome los permisos sin esperar (se envía al confirmar).
  PERFORM pg_notify('pgrst', 'reload schema');
END
$reversion$;

SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND 'anon'::name = ANY (roles)) AS politicas_anon_restauradas,
  has_table_privilege('anon', 'public.bienestar', 'SELECT') AS anon_lee_bienestar_otra_vez;
