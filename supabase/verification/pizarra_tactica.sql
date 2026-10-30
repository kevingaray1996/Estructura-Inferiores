-- Sólo lectura. A: antes de aplicar la nueva migración.
SELECT to_regclass('public.biblioteca') AS biblioteca,
       to_regclass('public.planificacion_sesiones') AS planificacion,
       to_regnamespace('pizarra_privado') AS esquema_nuevo;
SELECT 'biblioteca' AS tabla,count(*) AS registros FROM public.biblioteca
UNION ALL SELECT 'planificacion_sesiones',count(*) FROM public.planificacion_sesiones;
SELECT policyname,tablename,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('biblioteca','planificacion_sesiones');

-- B: después de aplicar exclusivamente la migración autorizada.
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='biblioteca' AND column_name LIKE 'pizarra%';
SELECT n.nspname,p.proname,p.prosecdef AS security_definer,p.proconfig,p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='pizarra_privado' OR (n.nspname='public' AND p.proname='guardar_ejercicio_pizarra');
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.biblioteca'::regclass AND NOT tgisinternal;
SELECT policyname,tablename,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('biblioteca','planificacion_sesiones');
