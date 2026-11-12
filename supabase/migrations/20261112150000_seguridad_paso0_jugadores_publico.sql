-- Seguridad, paso 0 (urgente e independiente): nadie puede escribir a través de la vista jugadores_publico.
--
-- Problema: la vista es de postgres y no tiene security_invoker, así que un INSERT/UPDATE/DELETE sobre ella
-- llega a public.jugadores sin pasar por el RLS. anon y authenticated tenían esos permisos.
-- Este paso les quita todo menos SELECT. El formulario público de Wellness solo lee la vista: sigue igual.
-- planificacion_publica_hoy usa la vista como postgres (SECURITY DEFINER): no se ve afectada.
--
-- Correr completo en el editor SQL de Supabase (como postgres). Si algo no coincide, no se aplica nada.
-- Reversión: supabase/rollback/20261112150000_seguridad_paso0_jugadores_publico.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $previo$
DECLARE ya_aplicado boolean;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('public.jugadores_publico') IS NULL
     OR (SELECT relkind FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass) <> 'v' THEN
    RAISE EXCEPTION 'public.jugadores_publico no existe o no es una vista.';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_acl') IS NOT NULL THEN
    -- Consulta dinámica: si la tabla de respaldo todavía no existe, esto no se analiza.
    EXECUTE $q$SELECT EXISTS (SELECT 1 FROM seguridad_privado.respaldo_acl WHERE paso = '0' AND objeto = 'public.jugadores_publico')$q$
      INTO ya_aplicado;
    IF ya_aplicado THEN
      RAISE EXCEPTION 'El paso 0 ya se aplicó.';
    END IF;
  END IF;
  IF NOT has_table_privilege('anon', 'public.jugadores_publico', 'SELECT') THEN
    RAISE EXCEPTION 'anon no tiene SELECT sobre la vista: el estado no es el auditado.';
  END IF;
END
$previo$;

-- Respaldo privado de los permisos actuales, para revertir exactamente.
CREATE SCHEMA IF NOT EXISTS seguridad_privado;
REVOKE ALL ON SCHEMA seguridad_privado FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS seguridad_privado.respaldo_acl (
  paso text NOT NULL,
  objeto text NOT NULL,
  tipo text NOT NULL,
  acl aclitem[],
  guardado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (paso, objeto)
);
REVOKE ALL ON seguridad_privado.respaldo_acl FROM PUBLIC, anon, authenticated;

INSERT INTO seguridad_privado.respaldo_acl (paso, objeto, tipo, acl)
SELECT '0', 'public.jugadores_publico', 'vista', relacl
FROM pg_class WHERE oid = 'public.jugadores_publico'::regclass;

-- El cambio.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.jugadores_publico FROM PUBLIC, anon, authenticated;

-- Verificación: si falla, se cancela todo.
DO $verificacion$
DECLARE rol text; permiso text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_table_privilege(rol, 'public.jugadores_publico', 'SELECT') THEN
      RAISE EXCEPTION '% perdió SELECT: el formulario dejaría de funcionar. No se aplica nada.', rol;
    END IF;
    FOREACH permiso IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
      IF has_table_privilege(rol, 'public.jugadores_publico', permiso) THEN
        RAISE EXCEPTION '% todavía tiene % sobre jugadores_publico. No se aplica nada.', rol, permiso;
      END IF;
    END LOOP;
  END LOOP;
END
$verificacion$;

COMMIT;

-- Resultado: debería decir SELECT en las dos columnas.
SELECT
  concat_ws(',',
    CASE WHEN has_table_privilege('anon', 'public.jugadores_publico', 'SELECT') THEN 'SELECT' END,
    CASE WHEN has_table_privilege('anon', 'public.jugadores_publico', 'INSERT') THEN 'INSERT' END,
    CASE WHEN has_table_privilege('anon', 'public.jugadores_publico', 'UPDATE') THEN 'UPDATE' END,
    CASE WHEN has_table_privilege('anon', 'public.jugadores_publico', 'DELETE') THEN 'DELETE' END,
    CASE WHEN has_table_privilege('anon', 'public.jugadores_publico', 'TRUNCATE') THEN 'TRUNCATE' END) AS permisos_anon,
  concat_ws(',',
    CASE WHEN has_table_privilege('authenticated', 'public.jugadores_publico', 'SELECT') THEN 'SELECT' END,
    CASE WHEN has_table_privilege('authenticated', 'public.jugadores_publico', 'INSERT') THEN 'INSERT' END,
    CASE WHEN has_table_privilege('authenticated', 'public.jugadores_publico', 'UPDATE') THEN 'UPDATE' END,
    CASE WHEN has_table_privilege('authenticated', 'public.jugadores_publico', 'DELETE') THEN 'DELETE' END,
    CASE WHEN has_table_privilege('authenticated', 'public.jugadores_publico', 'TRUNCATE') THEN 'TRUNCATE' END) AS permisos_authenticated;
