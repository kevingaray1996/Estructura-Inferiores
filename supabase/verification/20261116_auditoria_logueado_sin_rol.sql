-- Auditoría: qué puede leer HOY un usuario logueado SIN rol (así quedaría una jugadora con cuenta).
--
-- No modifica datos de la app ni permisos. Lo único que crea es la tabla seguridad_privado.auditoria_sin_rol
-- con el resultado. Nada la borra sola (la migración de cuentas de jugadoras tampoco): cuando ya no haga falta, se
-- borra a mano con DROP TABLE IF EXISTS seguridad_privado.auditoria_sin_rol;
-- Simula un usuario logueado cuyo email no está en perfiles, igual que las pruebas de la etapa C:
-- cada consulta corre como "authenticated" dentro de un bloque que se deshace.
--
-- Correr completo en el editor SQL de Supabase. Al final, el SELECT muestra el resultado.
-- Mandame el resultado (o una captura): solo nombres de tablas, funciones y cantidades, sin datos personales.

DO $auditoria$
DECLARE
  t record;
  n bigint;
  v_resultado text;
  v_detalle text;
  c_claims constant text := json_build_object(
    'email', 'auditoria-sin-rol@prueba.invalid',
    'sub', '00000000-0000-4000-8000-00000000a0d1',
    'role', 'authenticated')::text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  PERFORM set_config('lock_timeout', '5s', true);

  CREATE SCHEMA IF NOT EXISTS seguridad_privado;
  REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated;
  DROP TABLE IF EXISTS seguridad_privado.auditoria_sin_rol;
  CREATE TABLE seguridad_privado.auditoria_sin_rol (
    orden serial,
    tipo text NOT NULL,
    objeto text NOT NULL,
    resultado text NOT NULL,
    detalle text);
  REVOKE ALL ON seguridad_privado.auditoria_sin_rol FROM PUBLIC, anon, authenticated;

  -- 1) Tablas y vistas de public y storage: cuántas filas ve el usuario sin rol.
  FOR t IN
    SELECT n2.nspname AS esquema, c.relname AS nombre,
           CASE c.relkind WHEN 'v' THEN 'vista' WHEN 'm' THEN 'vista materializada' ELSE 'tabla' END AS clase,
           c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n2 ON n2.oid = c.relnamespace
    WHERE n2.nspname IN ('public', 'storage') AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY 1, 2
  LOOP
    n := NULL; v_detalle := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', c_claims, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      EXECUTE format('SELECT count(*) FROM %I.%I', t.esquema, t.nombre) INTO n;
      RAISE EXCEPTION 'DESHACER_PRUEBA';
    EXCEPTION
      WHEN insufficient_privilege THEN v_detalle := 'sin permiso';
      WHEN OTHERS THEN
        IF SQLERRM <> 'DESHACER_PRUEBA' THEN v_detalle := 'error: ' || SQLERRM; END IF;
    END;
    v_resultado := CASE
      WHEN v_detalle IS NOT NULL THEN 'cerrada'
      WHEN n > 0 THEN 'VE ' || n || ' filas'
      ELSE 've 0 filas' END;
    INSERT INTO seguridad_privado.auditoria_sin_rol (tipo, objeto, resultado, detalle)
    VALUES (t.clase, t.esquema || '.' || t.nombre, v_resultado,
            concat_ws(' · ', v_detalle, CASE WHEN t.clase = 'tabla' AND NOT t.rls THEN 'RLS DESACTIVADO' END,
              (SELECT 'políticas SELECT abiertas: ' || string_agg(p.policyname, ', ')
               FROM pg_policies p
               WHERE p.schemaname = t.esquema AND p.tablename = t.nombre
                 AND p.cmd IN ('SELECT', 'ALL') AND p.permissive = 'PERMISSIVE'
                 AND (p.roles && ARRAY['authenticated', 'public']::name[])
                 AND p.qual IS NOT NULL
                 AND p.qual !~ '(mi_rol|auth\.uid|puede_|autorizado|ve_todas|mi_categoria)')));
  END LOOP;

  -- 2) Funciones de public que un usuario logueado puede ejecutar y que corren con permisos del dueño.
  INSERT INTO seguridad_privado.auditoria_sin_rol (tipo, objeto, resultado, detalle)
  SELECT 'función', p.oid::regprocedure::text, 'ejecutable por authenticated',
         'SECURITY DEFINER' || CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN ' · también anon' ELSE '' END
  FROM pg_proc p JOIN pg_namespace n3 ON n3.oid = p.pronamespace
  WHERE n3.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ORDER BY 2;

  -- 3) Buckets públicos (se leen por link sin login).
  INSERT INTO seguridad_privado.auditoria_sin_rol (tipo, objeto, resultado, detalle)
  SELECT 'bucket', b.id, CASE WHEN b.public THEN 'público por link' ELSE 'privado' END, NULL
  FROM storage.buckets b ORDER BY b.id;

  PERFORM set_config('request.jwt.claims', '', true);
END
$auditoria$;

SELECT tipo, objeto, resultado, detalle
FROM seguridad_privado.auditoria_sin_rol
ORDER BY CASE WHEN resultado LIKE 'VE %' THEN 0 WHEN tipo = 'función' THEN 1 ELSE 2 END, orden;
