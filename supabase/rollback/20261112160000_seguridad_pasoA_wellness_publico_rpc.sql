-- Reversión del paso A: borra las 4 funciones del formulario público de Wellness.
-- Correr SOLO si el formulario publicado todavía NO las usa (antes de publicar el código nuevo, o después de
-- volver atrás ese código). Si el formulario nuevo está publicado, dejaría de poder cargar respuestas.
-- No toca datos ni otros permisos. Si algo no coincide, no se revierte nada.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $previo$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
END
$previo$;

DROP FUNCTION IF EXISTS public.wellness_publico_categoria(uuid);
DROP FUNCTION IF EXISTS public.wellness_publico_respondio(uuid, uuid);
DROP FUNCTION IF EXISTS public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.rpe_publico_guardar(uuid, uuid, date, text, integer);

DO $verificacion$
BEGIN
  IF to_regprocedure('public.wellness_publico_categoria(uuid)') IS NOT NULL
     OR to_regprocedure('public.wellness_publico_respondio(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)') IS NOT NULL
     OR to_regprocedure('public.rpe_publico_guardar(uuid,uuid,date,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Quedó alguna función sin borrar. No se revierte nada.';
  END IF;
END
$verificacion$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT count(*) AS funciones_que_quedan
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('wellness_publico_categoria', 'wellness_publico_respondio', 'wellness_publico_guardar', 'rpe_publico_guardar');
