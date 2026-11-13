-- Consultas para exportar el esquema real de Supabase, SIN DATOS.
--
-- Son 8 consultas de SOLO LECTURA. Correr cada una por separado en el editor SQL de Supabase y exportar el
-- resultado como CSV a supabase/auditoria-seguridad/e1.csv … e8.csv (carpeta fuera de git).
-- Cada una devuelve una sola columna de texto (ddl): la primera fila dice cuántas sentencias hay y la última
-- es "-- fin eN", para comprobar que el CSV no quedó cortado.
--
-- Qué se exporta: estructura de todos los esquemas propios (public y los *_privado), más las políticas de
-- storage y la configuración de los buckets. Qué NO: filas, auth.users, emails ni claves.
-- Los esquemas de Supabase y del sistema se omiten (la primera fila de e1 los lista).


-- ===== e1: esquemas, extensiones, tipos y secuencias =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname, nspowner FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), ext AS (SELECT objid FROM pg_depend WHERE deptype = 'e'),
filas AS (
  SELECT 1 AS orden, nspname AS clave, format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I;', nspname, pg_get_userbyid(nspowner)) AS ddl
  FROM esq
  UNION ALL
  SELECT 2, e.extname::text, format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I; -- versión %s', e.extname, n.nspname, e.extversion)
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  UNION ALL
  SELECT 3, n.nspname || '.' || t.typname, format('CREATE TYPE %I.%I AS ENUM (%s);', n.nspname, t.typname,
    (SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = t.oid))
  FROM pg_type t JOIN esq n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND t.oid NOT IN (SELECT objid FROM ext)
  UNION ALL
  SELECT 4, n.nspname || '.' || t.typname, format('CREATE DOMAIN %I.%I AS %s%s%s%s;', n.nspname, t.typname,
    format_type(t.typbasetype, t.typtypmod),
    CASE WHEN t.typdefault IS NOT NULL THEN ' DEFAULT ' || t.typdefault ELSE '' END,
    CASE WHEN t.typnotnull THEN ' NOT NULL' ELSE '' END,
    coalesce((SELECT string_agg(format(' CONSTRAINT %I %s', conname, pg_get_constraintdef(oid)), '' ORDER BY conname)
              FROM pg_constraint WHERE contypid = t.oid), ''))
  FROM pg_type t JOIN esq n ON n.oid = t.typnamespace WHERE t.typtype = 'd' AND t.oid NOT IN (SELECT objid FROM ext)
  UNION ALL
  SELECT 5, n.nspname || '.' || t.typname, format('CREATE TYPE %I.%I AS (%s);', n.nspname, t.typname,
    (SELECT string_agg(format('%I %s', attname, format_type(atttypid, atttypmod)), ', ' ORDER BY attnum)
     FROM pg_attribute WHERE attrelid = t.typrelid AND attnum > 0 AND NOT attisdropped))
  FROM pg_type t JOIN esq n ON n.oid = t.typnamespace JOIN pg_class c ON c.oid = t.typrelid
  WHERE t.typtype = 'c' AND c.relkind = 'c' AND t.oid NOT IN (SELECT objid FROM ext)
  UNION ALL
  SELECT 6, n.nspname || '.' || c.relname, format('CREATE SEQUENCE IF NOT EXISTS %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s;',
    n.nspname, c.relname, format_type(s.seqtypid, NULL), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcache,
    CASE WHEN s.seqcycle THEN ' CYCLE' ELSE '' END)
  FROM pg_class c JOIN esq n ON n.oid = c.relnamespace JOIN pg_sequence s ON s.seqrelid = c.oid
  WHERE c.relkind = 'S' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'i')
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e1: %s sentencias. Esquemas de Supabase/sistema omitidos: %s', (SELECT count(*) FROM filas),
    (SELECT string_agg(nspname, ', ' ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND oid NOT IN (SELECT oid FROM esq))) AS ddl
  UNION ALL SELECT orden, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e1'
) x ORDER BY orden, clave;


-- ===== e2: tablas (columnas, restricciones, RLS, dueñas de secuencias, comentarios) =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), tablas AS (
  SELECT c.oid, n.nspname, c.relname::text AS relname, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN esq n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
), filas AS (
  SELECT 1 AS orden, t.nspname || '.' || t.relname AS clave, 0 AS sub,
    format(E'CREATE %sTABLE %I.%I (\n%s\n)%s;', CASE WHEN t.relpersistence = 'u' THEN 'UNLOGGED ' ELSE '' END, t.nspname, t.relname,
      string_agg(format('  %I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        CASE a.attidentity WHEN 'a' THEN ' GENERATED ALWAYS AS IDENTITY' WHEN 'd' THEN ' GENERATED BY DEFAULT AS IDENTITY' ELSE '' END,
        CASE WHEN a.attgenerated = 's' THEN ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED'
             WHEN d.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END,
        CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END), E',\n' ORDER BY a.attnum),
      CASE WHEN p.partrelid IS NOT NULL THEN ' PARTITION BY ' || pg_get_partkeydef(t.oid) ELSE '' END) AS ddl
  FROM tablas t
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
  LEFT JOIN pg_partitioned_table p ON p.partrelid = t.oid
  GROUP BY t.oid, t.nspname, t.relname, t.relpersistence, p.partrelid
  UNION ALL
  -- Restricciones: primero PK/únicas/checks/exclusión de todas las tablas, después las claves foráneas.
  SELECT CASE WHEN co.contype = 'f' THEN 3 ELSE 2 END, t.nspname || '.' || t.relname,
    CASE co.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 ELSE 3 END,
    format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;', t.nspname, t.relname, co.conname, pg_get_constraintdef(co.oid))
  FROM pg_constraint co JOIN tablas t ON t.oid = co.conrelid
  WHERE co.contype IN ('p', 'u', 'c', 'f', 'x') AND co.conislocal
  UNION ALL
  SELECT 4, t.nspname || '.' || t.relname, 0, format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', t.nspname, t.relname)
  FROM tablas t WHERE t.relrowsecurity
  UNION ALL
  SELECT 4, t.nspname || '.' || t.relname, 1, format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', t.nspname, t.relname)
  FROM tablas t WHERE t.relforcerowsecurity
  UNION ALL
  SELECT 5, n.nspname || '.' || s.relname, 0, format('ALTER SEQUENCE %I.%I OWNED BY %I.%I.%I;', n.nspname, s.relname, tn.nspname, tc.relname, a.attname)
  FROM pg_depend d
  JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
  JOIN esq n ON n.oid = s.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
  WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.deptype = 'a'
  UNION ALL
  SELECT 6, t.nspname || '.' || t.relname, coalesce(ds.objsubid, 0),
    CASE WHEN ds.objsubid = 0 THEN format('COMMENT ON TABLE %I.%I IS %L;', t.nspname, t.relname, ds.description)
         ELSE format('COMMENT ON COLUMN %I.%I.%I IS %L;', t.nspname, t.relname,
                     (SELECT attname FROM pg_attribute WHERE attrelid = t.oid AND attnum = ds.objsubid), ds.description) END
  FROM tablas t JOIN pg_description ds ON ds.objoid = t.oid AND ds.classoid = 'pg_class'::regclass
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, 0 AS sub, format('-- e2: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT orden, clave, sub, ddl FROM filas
  UNION ALL SELECT 99, '', 0, '-- fin e2'
) x ORDER BY orden, clave, sub, ddl;


-- ===== e3: índices (los que no vienen de una PK o UNIQUE) =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), filas AS (
  SELECT n.nspname || '.' || t.relname || '.' || ic.relname AS clave, pg_get_indexdef(i.indexrelid) || ';' AS ddl
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN esq n ON n.oid = t.relnamespace
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.indexrelid AND co.conrelid = i.indrelid AND co.contype IN ('p', 'u', 'x'))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e3: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT 1, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e3'
) x ORDER BY orden, clave;


-- ===== e4: vistas y vistas materializadas (en orden de creación, por dependencias) =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), filas AS (
  SELECT c.oid::bigint AS clave,
    CASE WHEN c.relkind = 'v'
      THEN format(E'CREATE OR REPLACE VIEW %I.%I%s AS\n%s', n.nspname, c.relname,
             CASE WHEN c.reloptions IS NOT NULL THEN ' WITH (' || array_to_string(c.reloptions, ', ') || ')' ELSE '' END,
             pg_get_viewdef(c.oid, true))
      ELSE format(E'CREATE MATERIALIZED VIEW IF NOT EXISTS %I.%I AS\n%s\nWITH NO DATA;', n.nspname, c.relname,
             rtrim(pg_get_viewdef(c.oid, true), ';')) END AS ddl
  FROM pg_class c JOIN esq n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
)
SELECT ddl FROM (
  SELECT 0 AS orden, 0::bigint AS clave, format('-- e4: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT 1, clave, ddl FROM filas
  UNION ALL SELECT 99, 0, '-- fin e4'
) x ORDER BY orden, clave;


-- ===== e5: funciones y procedimientos =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), filas AS (
  SELECT format('%s.%s(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) AS clave,
    rtrim(pg_get_functiondef(p.oid), E'\n') || ';' AS ddl
  FROM pg_proc p JOIN esq n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p', 'w')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e5: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT 1, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e5'
) x ORDER BY orden, clave;


-- ===== e6: triggers =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), filas AS (
  SELECT n.nspname || '.' || c.relname || '.' || tg.tgname AS clave, pg_get_triggerdef(tg.oid, true) || ';' AS ddl
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN esq n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e6: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT 1, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e6'
) x ORDER BY orden, clave;


-- ===== e7a: políticas RLS (esquemas propios y storage) =====
WITH esq AS (
  SELECT oid, nspname::text AS nspname FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), filas AS (
  SELECT 1 AS orden, schemaname || '.' || tablename || '.' || policyname AS clave,
    format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
      (SELECT string_agg(CASE WHEN r = 'public' THEN 'PUBLIC' ELSE quote_ident(r) END, ', ') FROM unnest(roles) r),
      CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
      CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END) AS ddl
  FROM pg_policies WHERE schemaname IN (SELECT nspname FROM esq) OR schemaname = 'storage'
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e7a: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT orden, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e7a'
) x ORDER BY orden, clave;


-- ===== e7b: configuración de los buckets (solo lectura simple; el INSERT equivalente se arma al generar el archivo) =====
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e7b: %s buckets', count(*)) AS ddl FROM storage.buckets
  UNION ALL
  SELECT 1, id, json_build_object('id', id, 'name', name, 'public', public, 'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types)::text
  FROM storage.buckets
  UNION ALL SELECT 99, '', '-- fin e7b'
) x ORDER BY orden, clave;


-- ===== e8: dueños, permisos (GRANT) y privilegios por defecto =====
-- Para cada tabla, vista, secuencia y función primero se quita todo a PUBLIC, anon, authenticated y service_role
-- y después se otorga exactamente lo que tiene hoy. El dueño no aparece en los GRANT (siempre tiene todo).
WITH esq AS (
  SELECT oid, nspname::text AS nspname, nspowner, nspacl FROM pg_namespace
  WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'auth', 'storage', 'extensions', 'graphql',
    'graphql_public', 'realtime', '_realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'pgsodium',
    'pgsodium_masks', 'net', 'cron', 'pgbouncer', '_analytics', 'pgtle', 'topology', 'tiger', 'tiger_data', 'repack')
), ext AS (SELECT objid FROM pg_depend WHERE deptype = 'e'),
rel AS (
  SELECT c.oid, format('%I.%I', n.nspname, c.relname) AS nombre, CASE WHEN c.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END AS clase,
    c.relowner AS duenio, coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner)) AS acl
  FROM pg_class c JOIN esq n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.oid NOT IN (SELECT objid FROM ext)
), fun AS (
  SELECT p.oid, format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) AS nombre, p.proowner AS duenio,
    coalesce(p.proacl, acldefault('f'::"char", p.proowner)) AS acl
  FROM pg_proc p JOIN esq n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p', 'w') AND p.oid NOT IN (SELECT objid FROM ext)
), quien AS (SELECT 0::oid AS id, 'PUBLIC' AS nombre UNION ALL SELECT oid, quote_ident(rolname) FROM pg_roles),
filas AS (
  -- Dueños distintos de postgres.
  SELECT 1 AS orden, nspname AS clave, format('ALTER SCHEMA %I OWNER TO %I;', nspname, pg_get_userbyid(nspowner)) AS ddl
  FROM esq WHERE pg_get_userbyid(nspowner) <> 'postgres'
  UNION ALL
  SELECT 1, r.nombre, format('ALTER %s %s OWNER TO %I;', CASE WHEN r.clase = 'SEQUENCE' THEN 'SEQUENCE' ELSE 'TABLE' END, r.nombre, pg_get_userbyid(r.duenio))
  FROM rel r WHERE pg_get_userbyid(r.duenio) <> 'postgres'
  UNION ALL
  SELECT 1, f.nombre, format('ALTER ROUTINE %s OWNER TO %I;', f.nombre, pg_get_userbyid(f.duenio))
  FROM fun f WHERE pg_get_userbyid(f.duenio) <> 'postgres'
  UNION ALL
  -- Esquemas.
  SELECT 2, e.nspname, format('GRANT %s ON SCHEMA %I TO %s%s;', string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type), e.nspname, q.nombre,
    CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
  FROM esq e CROSS JOIN LATERAL aclexplode(coalesce(e.nspacl, acldefault('n'::"char", e.nspowner))) x JOIN quien q ON q.id = x.grantee
  WHERE x.grantee <> e.nspowner
  GROUP BY e.nspname, q.nombre, x.is_grantable
  UNION ALL
  -- Tablas, vistas y secuencias.
  SELECT 3, r.nombre || ' 0', format('REVOKE ALL ON %s %s FROM PUBLIC, anon, authenticated, service_role;', r.clase, r.nombre)
  FROM rel r
  UNION ALL
  SELECT 3, r.nombre || ' 1', format('GRANT %s ON %s %s TO %s%s;', string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type), r.clase, r.nombre, q.nombre,
    CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
  FROM rel r CROSS JOIN LATERAL aclexplode(r.acl) x JOIN quien q ON q.id = x.grantee
  WHERE x.grantee <> r.duenio
  GROUP BY r.nombre, r.clase, q.nombre, x.is_grantable
  UNION ALL
  -- Columnas.
  SELECT 4, r.nombre || '.' || a.attname, format('GRANT %s (%I) ON TABLE %s TO %s%s;', string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type), a.attname, r.nombre, q.nombre,
    CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
  FROM rel r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN quien q ON q.id = x.grantee
  GROUP BY r.nombre, a.attname, q.nombre, x.is_grantable
  UNION ALL
  -- Funciones.
  SELECT 5, f.nombre || ' 0', format('REVOKE ALL ON ROUTINE %s FROM PUBLIC, anon, authenticated, service_role;', f.nombre)
  FROM fun f
  UNION ALL
  SELECT 5, f.nombre || ' 1', format('GRANT %s ON ROUTINE %s TO %s%s;', string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type), f.nombre, q.nombre,
    CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
  FROM fun f CROSS JOIN LATERAL aclexplode(f.acl) x JOIN quien q ON q.id = x.grantee
  WHERE x.grantee <> f.duenio
  GROUP BY f.nombre, q.nombre, x.is_grantable
  UNION ALL
  -- Privilegios por defecto (con el ACL crudo como comentario, para no perder lo que se quitó).
  SELECT 6, pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '') || ' ' || d.defaclobjtype::text || ' ' || coalesce(q.nombre, ''),
    CASE WHEN q.nombre IS NULL THEN format('-- privilegios por defecto de %s%s para %s: %s', pg_get_userbyid(d.defaclrole),
           CASE WHEN n.nspname IS NULL THEN ' (todos los esquemas)' ELSE ' en ' || n.nspname END, d.defaclobjtype, d.defaclacl::text)
    ELSE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s;', pg_get_userbyid(d.defaclrole),
      CASE WHEN n.nspname IS NULL THEN '' ELSE format(' IN SCHEMA %I', n.nspname) END,
      string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type),
      CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END,
      q.nombre, CASE WHEN bool_or(x.is_grantable) THEN ' WITH GRANT OPTION' ELSE '' END) END
  FROM pg_default_acl d
  LEFT JOIN esq n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL (SELECT * FROM aclexplode(d.defaclacl) UNION ALL SELECT NULL, NULL, NULL, NULL) x
  LEFT JOIN quien q ON q.id = x.grantee
  WHERE (d.defaclnamespace = 0 OR n.oid IS NOT NULL) AND x.grantee IS DISTINCT FROM d.defaclrole
  GROUP BY d.oid, d.defaclrole, n.nspname, d.defaclobjtype, d.defaclacl::text, q.nombre
  UNION ALL
  -- Globales que le quitan a PUBLIC lo que tendría por omisión (EXECUTE en funciones, USAGE en tipos).
  SELECT 6, pg_get_userbyid(d.defaclrole) || '  ' || d.defaclobjtype::text || ' 0',
    format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE %s ON %s FROM PUBLIC;', pg_get_userbyid(d.defaclrole),
      CASE d.defaclobjtype WHEN 'f' THEN 'EXECUTE' ELSE 'USAGE' END, CASE d.defaclobjtype WHEN 'f' THEN 'FUNCTIONS' ELSE 'TYPES' END)
  FROM pg_default_acl d
  WHERE d.defaclnamespace = 0 AND d.defaclobjtype IN ('f', 'T') AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x WHERE x.grantee = 0)
)
SELECT ddl FROM (
  SELECT 0 AS orden, '' AS clave, format('-- e8: %s sentencias', (SELECT count(*) FROM filas)) AS ddl
  UNION ALL SELECT orden, clave, ddl FROM filas
  UNION ALL SELECT 99, '', '-- fin e8'
) x ORDER BY orden, clave, ddl;
