-- Solo lectura. A: antes de aplicar la migración.
SELECT count(*) AS fichas_anteriores FROM public.fichas_medicas;
SELECT policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='fichas_medicas' ORDER BY policyname;
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='fichas_medicas' ORDER BY ordinal_position;

-- B: después de aplicar (no consultar datos privados ni simular escrituras).
SELECT count(*) AS fichas_posteriores, count(*) FILTER (WHERE zona_corporal IS NOT NULL) AS clasificadas
FROM public.fichas_medicas;
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='fichas_medicas' ORDER BY ordinal_position;
SELECT conname, pg_get_constraintdef(oid) AS definicion FROM pg_constraint
WHERE conrelid='public.fichas_medicas'::regclass;
SELECT policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='fichas_medicas' ORDER BY policyname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='fichas_medicas';
SELECT pg_get_triggerdef(oid) AS trigger FROM pg_trigger
WHERE tgrelid='public.fichas_medicas'::regclass AND NOT tgisinternal;
SELECT relrowsecurity FROM pg_class WHERE oid='public.fichas_medicas'::regclass;
SELECT r.rolname,
  has_table_privilege(r.rolname,'public.fichas_medicas','SELECT') AS consulta,
  has_table_privilege(r.rolname,'public.fichas_medicas','TRUNCATE') AS truncado,
  has_schema_privilege(r.rolname,'medicos_privado','USAGE') AS acceso_esquema_privado,
  has_function_privilege(r.rolname,'medicos_privado.validar_ficha_corporal()','EXECUTE') AS ejecutar_trigger
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated');
