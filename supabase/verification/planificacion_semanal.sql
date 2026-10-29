-- A. ANTES de la migración. Sólo lectura.
SELECT to_regclass('public.planificacion_sesiones') AS tabla_nueva,
       to_regclass('public.categorias') AS categorias,
       to_regclass('public.perfiles') AS perfiles,
       to_regclass('public.biblioteca') AS biblioteca,
       to_regclass('public.entrenamiento_bloques') AS entrenamientos_reales,
       to_regclass('public.jugadores_publico') AS jugadoras_publicas;

SELECT 'entrenamiento_bloques' AS tabla, count(*) AS registros FROM public.entrenamiento_bloques
UNION ALL SELECT 'biblioteca', count(*) FROM public.biblioteca;

-- B. DESPUÉS de la migración. Sólo lectura; ejecutar cuando exista la tabla.
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forzada,
       pg_get_userbyid(c.relowner) AS propietario
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='planificacion_sesiones';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='planificacion_sesiones'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conrelid='public.planificacion_sesiones'::regclass;

SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='planificacion_sesiones';

SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='planificacion_sesiones'
ORDER BY grantee, privilege_type;

SELECT n.nspname AS esquema, p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS propietario,
       p.proconfig AS configuracion, p.proacl AS permisos
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='planificacion_privado' OR (n.nspname='public' AND p.proname IN
 ('guardar_planificacion_sesion','eliminar_planificacion_sesion','copiar_planificacion_semana','planificacion_publica_hoy'))
ORDER BY n.nspname,p.proname;

SELECT count(*) AS sesiones_iniciales FROM public.planificacion_sesiones;
SELECT 'entrenamiento_bloques' AS tabla, count(*) AS registros FROM public.entrenamiento_bloques
UNION ALL SELECT 'biblioteca', count(*) FROM public.biblioteca;
