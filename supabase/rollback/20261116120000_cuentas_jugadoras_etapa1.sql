-- Reversión de las cuentas de jugadoras, etapa 1: deja la base como antes de
-- supabase/migrations/20261116120000_cuentas_jugadoras_etapa1.sql, usando el respaldo de
-- seguridad_privado.respaldo_cuentas_jugadoras.
--
-- Devuelve las 4 políticas de lectura (analisis_tipos_accion, categorias, datafem_tablas y evaluacion_criterios)
-- exactamente como estaban. Saca la red RESTRICTIVE "sin_cuentas_jugadoras" de las tablas donde se agregó, y borra
-- el trigger de perfiles, las funciones del portal y de administración, la tabla cuentas_jugadoras, el esquema
-- portal_privado y el respaldo.
-- OJO: las 4 tablas vuelven a quedar abiertas a lectura para cualquier usuario logueado.
--
-- Para no dejar usuarios de Auth sueltos, NO revierte si hay cuentas de jugadoras: primero hay que borrarlas
-- (con la Edge Function o desde Auth, que borra la fila de cuentas_jugadoras en cascada).
--
-- Todo está en un único bloque DO: es una sola sentencia, atómico aunque el editor SQL de Supabase ejecute
-- las sentencias por separado. Correr como postgres. Si algo no coincide, no se revierte nada.

DO $reversion_cuentas_jugadoras$
DECLARE
  hay boolean;
  n bigint;
  r record;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regclass('seguridad_privado.respaldo_cuentas_jugadoras') IS NULL THEN
    RAISE EXCEPTION 'No hay respaldo de las cuentas de jugadoras: no hay nada que revertir.';
  END IF;
  EXECUTE 'SELECT count(*) = 4 FROM seguridad_privado.respaldo_cuentas_jugadoras WHERE tipo = ''politica''' INTO hay;
  IF NOT hay THEN
    RAISE EXCEPTION 'El respaldo no tiene las 4 políticas de lectura. Revisar antes de revertir.';
  END IF;
  IF to_regclass('public.cuentas_jugadoras') IS NULL OR to_regnamespace('portal_privado') IS NULL THEN
    RAISE EXCEPTION 'La base no tiene lo que agrega la migración de cuentas de jugadoras. Revisar antes de revertir.';
  END IF;
  EXECUTE 'SELECT count(*) FROM public.cuentas_jugadoras' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay cuentas de jugadoras (%). Borrarlas antes de revertir (también su usuario en Auth).', n;
  END IF;
  -- Si una migración posterior agregó la red en otra tabla, esta reversión no sabe deshacerla.
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.policyname = 'sin_cuentas_jugadoras'
             AND NOT (p.schemaname = 'public' AND EXISTS (SELECT 1 FROM seguridad_privado.respaldo_cuentas_jugadoras b
                                                         WHERE b.tipo = 'restrictiva' AND b.tabla = p.tablename))) THEN
    RAISE EXCEPTION 'Hay políticas sin_cuentas_jugadoras que no están en el respaldo. Revisar antes de revertir.';
  END IF;

  -- 1) Red RESTRICTIVE: solo en las tablas donde se agregó (si la tabla ya no existe, no hay nada que sacar).
  FOR r IN SELECT tabla FROM seguridad_privado.respaldo_cuentas_jugadoras WHERE tipo = 'restrictiva' ORDER BY orden LOOP
    IF to_regclass(format('public.%I', r.tabla)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS sin_cuentas_jugadoras ON public.%I', r.tabla);
    END IF;
  END LOOP;

  -- 2) Las 4 políticas de lectura vuelven tal como estaban.
  FOR r IN SELECT tabla, politica, detalle FROM seguridad_privado.respaldo_cuentas_jugadoras WHERE tipo = 'politica' ORDER BY orden LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.politica, r.tabla);
    EXECUTE r.detalle;
  END LOOP;

  -- 3) Trigger, funciones, tabla y esquema.
  DROP TRIGGER perfil_no_es_jugadora ON public.perfiles;
  DROP FUNCTION public.portal_mi_perfil();
  DROP FUNCTION public.portal_mis_numeros(integer);
  DROP FUNCTION public.portal_wellness_respondio();
  DROP FUNCTION public.portal_wellness_guardar(integer, integer, integer, integer, integer, text, text);
  DROP FUNCTION public.portal_rpe_guardar(date, text, integer);
  DROP FUNCTION public.portal_entrenamiento_hoy();
  DROP FUNCTION public.cuentas_jugadoras_listar(uuid);
  DROP FUNCTION public.cuentas_jugadoras_registrar(uuid, uuid, text, uuid);
  DROP FUNCTION public.cuentas_jugadoras_estado(uuid, boolean);
  DROP FUNCTION portal_privado.perfil_no_es_jugadora();
  DROP FUNCTION portal_privado.jugadora_activa();
  DROP FUNCTION portal_privado.es_cuenta_jugadora();
  DROP FUNCTION portal_privado.mi_jugadora_id();
  DROP TABLE public.cuentas_jugadoras;
  -- Sin CASCADE: si una etapa posterior dejó algo en portal_privado, la reversión se detiene acá.
  DROP SCHEMA portal_privado;

  -- 4) Verificación: las 4 políticas iguales al respaldo y nada de la migración en pie.
  IF EXISTS (
    SELECT 1 FROM seguridad_privado.respaldo_cuentas_jugadoras b
    WHERE b.tipo = 'politica' AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = b.tabla AND p.policyname = b.politica
        AND p.permissive = b.permisiva AND p.cmd = b.cmd AND p.roles::text[] = b.roles
        AND p.qual IS NOT DISTINCT FROM b.qual AND p.with_check IS NOT DISTINCT FROM b.with_check)) THEN
    RAISE EXCEPTION 'Las políticas de lectura no quedaron iguales al respaldo. No se revierte nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sin_cuentas_jugadoras')
     OR to_regclass('public.cuentas_jugadoras') IS NOT NULL OR to_regnamespace('portal_privado') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                AND (proname LIKE 'portal\_%' OR proname LIKE 'cuentas\_jugadoras\_%'))
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'perfil_no_es_jugadora')
     OR to_regprocedure('seguridad_privado.cuentas_jugadoras_contar(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Quedaron políticas, tablas o funciones de las cuentas de jugadoras. No se revierte nada.';
  END IF;

  -- 5) Sin respaldo, la migración se puede volver a aplicar más adelante.
  DROP TABLE seguridad_privado.respaldo_cuentas_jugadoras;

  PERFORM pg_notify('pgrst', 'reload schema');
END
$reversion_cuentas_jugadoras$;

-- Resultado: las 4 políticas de lectura como estaban y ninguna red "sin_cuentas_jugadoras".
SELECT tablename AS tabla, policyname AS politica, roles::text AS roles, qual FROM pg_policies
WHERE schemaname = 'public' AND (policyname = 'sin_cuentas_jugadoras' OR (tablename, policyname) IN (
  ('analisis_tipos_accion', 'tipos_accion_lectura'), ('categorias', 'leer categorias'),
  ('datafem_tablas', 'Usuarios autenticados pueden leer DataFem'), ('evaluacion_criterios', 'criterios_select')))
ORDER BY 1, 2;
