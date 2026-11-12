-- Reversión del paso 0: devuelve a jugadores_publico exactamente los permisos guardados en el respaldo.
-- OJO: vuelve a abrir la escritura sobre jugadoras sin login. Correr solo si el paso 0 rompió algo.
-- Correr completo en el editor SQL de Supabase (como postgres). Si algo no coincide, no se revierte nada.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $previo$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_acl') IS NULL
     OR NOT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_acl WHERE paso = '0' AND objeto = 'public.jugadores_publico') THEN
    RAISE EXCEPTION 'No hay respaldo del paso 0: no hay nada que revertir.';
  END IF;
END
$previo$;

DO $restaurar$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.privilege_type, a.grantee, a.is_grantable
    FROM seguridad_privado.respaldo_acl b, aclexplode(b.acl) a
    WHERE b.paso = '0' AND b.objeto = 'public.jugadores_publico'
      AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
      AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass)
  LOOP
    EXECUTE format('GRANT %s ON public.jugadores_publico TO %s%s',
      r.privilege_type,
      CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END,
      CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END
$restaurar$;

-- Verificación: los permisos tienen que quedar iguales al respaldo (sin contar quién los otorgó).
DO $verificacion$
BEGIN
  IF EXISTS (
    (SELECT a.grantee, a.privilege_type, a.is_grantable
       FROM seguridad_privado.respaldo_acl b, aclexplode(b.acl) a
      WHERE b.paso = '0' AND b.objeto = 'public.jugadores_publico'
     EXCEPT
     SELECT a.grantee, a.privilege_type, a.is_grantable
       FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.jugadores_publico'::regclass)
    UNION ALL
    (SELECT a.grantee, a.privilege_type, a.is_grantable
       FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.jugadores_publico'::regclass
     EXCEPT
     SELECT a.grantee, a.privilege_type, a.is_grantable
       FROM seguridad_privado.respaldo_acl b, aclexplode(b.acl) a
      WHERE b.paso = '0' AND b.objeto = 'public.jugadores_publico')
  ) THEN
    RAISE EXCEPTION 'Los permisos no quedaron iguales al respaldo. No se revierte nada.';
  END IF;
END
$verificacion$;

-- Se borra el respaldo para poder volver a correr el paso 0 si hace falta.
DELETE FROM seguridad_privado.respaldo_acl WHERE paso = '0' AND objeto = 'public.jugadores_publico';

COMMIT;

SELECT relacl AS permisos_restaurados FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass;
