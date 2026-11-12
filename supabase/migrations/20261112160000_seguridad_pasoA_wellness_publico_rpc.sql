-- Seguridad, paso A (solo agrega): funciones para el formulario público de Wellness.
--
-- Crea 4 funciones que el formulario va a usar en lugar de tocar tablas. No cambia ningún permiso
-- existente: el formulario actual sigue funcionando igual hasta que se publique el código nuevo.
--   wellness_publico_categoria(categoria)          nombre de la categoría y sus jugadoras (id, nombre, apellido, foto)
--   wellness_publico_respondio(categoria, jugadora) solo sí/no: si completó el wellness de hoy
--   wellness_publico_guardar(...)                   crea o corrige la respuesta de hoy; no devuelve nada
--   rpe_publico_guardar(...)                        crea o corrige solo el RPE (hoy y 3 días antes); no devuelve nada
-- "Hoy" es siempre la fecha de Argentina calculada en la base, no la del celular.
--
-- Correr completo en el editor SQL de Supabase (como postgres). Al final prueba las funciones como anon
-- dentro de bloques que se deshacen: no queda ningún dato de prueba. Si algo falla, no se aplica nada.
-- Reversión: supabase/rollback/20261112160000_seguridad_pasoA_wellness_publico_rpc.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $previo$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Correr como postgres (editor SQL de Supabase).';
  END IF;
  IF to_regprocedure('public.wellness_publico_categoria(uuid)') IS NOT NULL
     OR to_regprocedure('public.wellness_publico_respondio(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)') IS NOT NULL
     OR to_regprocedure('public.rpe_publico_guardar(uuid,uuid,date,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'El paso A ya se aplicó: las funciones existen.';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.bienestar'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname IN ('jugador_id','fecha','sueno','dolor_muscular','fatiga','estres','animo_entrenar','zona_dolor','fase_ciclo')) <> 9
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.sesiones_fisicas'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname IN ('jugador_id','fecha','tipo','rpe')) <> 4
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.jugadores'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname IN ('id','nombre','apellido','foto_url','categoria_id')) <> 5
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.categorias'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname IN ('id','nombre')) <> 2 THEN
    RAISE EXCEPTION 'Las columnas no coinciden con las auditadas.';
  END IF;
  -- "Crear o corregir" necesita estos índices únicos (están en la auditoría, consulta 15).
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.bienestar'::regclass AND i.indisunique AND i.indpred IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = ARRAY['fecha','jugador_id'])
     OR NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.sesiones_fisicas'::regclass AND i.indisunique AND i.indpred IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = ARRAY['fecha','jugador_id','tipo']) THEN
    RAISE EXCEPTION 'Faltan los índices únicos (fecha, jugador_id) o (fecha, jugador_id, tipo).';
  END IF;
END
$previo$;

-- 1) Lista de la categoría del link. Devuelve NULL si la categoría no existe.
CREATE FUNCTION public.wellness_publico_categoria(p_categoria_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_nombre text;
BEGIN
  SELECT c.nombre INTO v_nombre FROM public.categorias c WHERE c.id = p_categoria_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'nombre', v_nombre,
    'jugadoras', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.nombre, 'apellido', j.apellido, 'foto_url', j.foto_url)
                       ORDER BY j.apellido, j.nombre, j.id)
      FROM public.jugadores j
      WHERE j.categoria_id = p_categoria_id), '[]'::jsonb));
END
$$;

-- 2) Solo sí/no: completó las 5 preguntas de hoy. Ningún valor de la respuesta.
CREATE FUNCTION public.wellness_publico_respondio(p_categoria_id uuid, p_jugadora_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bienestar b
    JOIN public.jugadores j ON j.id = b.jugador_id
    WHERE j.id = p_jugadora_id
      AND j.categoria_id = p_categoria_id
      AND b.fecha = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      AND b.sueno IS NOT NULL AND b.dolor_muscular IS NOT NULL AND b.fatiga IS NOT NULL
      AND b.estres IS NOT NULL AND b.animo_entrenar IS NOT NULL);
$$;

-- 3) Crea o corrige la respuesta de hoy. La corrección reemplaza la respuesta completa.
CREATE FUNCTION public.wellness_publico_guardar(
  p_categoria_id uuid, p_jugadora_id uuid,
  p_sueno integer, p_dolor_muscular integer, p_fatiga integer, p_estres integer, p_animo_entrenar integer,
  p_zona_dolor text DEFAULT NULL, p_fase_ciclo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_zona text := nullif(btrim(p_zona_dolor), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = p_jugadora_id AND j.categoria_id = p_categoria_id) THEN
    RAISE EXCEPTION 'La jugadora no corresponde a este link.' USING ERRCODE = '22023';
  END IF;
  IF p_sueno IS NULL OR p_dolor_muscular IS NULL OR p_fatiga IS NULL OR p_estres IS NULL OR p_animo_entrenar IS NULL
     OR p_sueno NOT BETWEEN 1 AND 5 OR p_dolor_muscular NOT BETWEEN 1 AND 5 OR p_fatiga NOT BETWEEN 1 AND 5
     OR p_estres NOT BETWEEN 1 AND 5 OR p_animo_entrenar NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Completá todas las preguntas con un valor del 1 al 5.' USING ERRCODE = '22023';
  END IF;
  IF p_fase_ciclo IS NOT NULL AND p_fase_ciclo NOT IN ('menstrual', 'folicular', 'ovulacion', 'lutea', 'no_responde') THEN
    RAISE EXCEPTION 'Fase del ciclo no válida.' USING ERRCODE = '22023';
  END IF;
  IF length(v_zona) > 300 THEN
    RAISE EXCEPTION 'La zona de dolor es demasiado larga (máximo 300 caracteres).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bienestar (fecha, jugador_id, sueno, dolor_muscular, fatiga, estres, animo_entrenar, zona_dolor, fase_ciclo)
  VALUES (v_hoy, p_jugadora_id, p_sueno, p_dolor_muscular, p_fatiga, p_estres, p_animo_entrenar, v_zona, p_fase_ciclo)
  ON CONFLICT (fecha, jugador_id) DO UPDATE SET
    sueno = EXCLUDED.sueno,
    dolor_muscular = EXCLUDED.dolor_muscular,
    fatiga = EXCLUDED.fatiga,
    estres = EXCLUDED.estres,
    animo_entrenar = EXCLUDED.animo_entrenar,
    zona_dolor = EXCLUDED.zona_dolor,
    fase_ciclo = EXCLUDED.fase_ciclo;
END
$$;

-- 4) Crea o corrige solo el RPE. Nunca toca minutos, GPS, partido ni observaciones.
CREATE FUNCTION public.rpe_publico_guardar(
  p_categoria_id uuid, p_jugadora_id uuid, p_fecha date, p_tipo text, p_rpe integer)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = p_jugadora_id AND j.categoria_id = p_categoria_id) THEN
    RAISE EXCEPTION 'La jugadora no corresponde a este link.' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > v_hoy OR p_fecha < v_hoy - 3 THEN
    RAISE EXCEPTION 'Solo se puede cargar el RPE de hoy y de los 3 días anteriores.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrenamiento', 'partido') THEN
    RAISE EXCEPTION 'Tipo de sesión no válido.' USING ERRCODE = '22023';
  END IF;
  IF p_rpe IS NULL OR p_rpe NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Elegí un valor del 1 al 10.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sesiones_fisicas (fecha, jugador_id, tipo, rpe)
  VALUES (p_fecha, p_jugadora_id, p_tipo, p_rpe)
  ON CONFLICT (fecha, jugador_id, tipo) DO UPDATE SET rpe = EXCLUDED.rpe;
END
$$;

-- Dueño y permisos: solo anon y authenticated pueden ejecutarlas (authenticated por si alguien del
-- staff abre el link con la sesión iniciada).
ALTER FUNCTION public.wellness_publico_categoria(uuid) OWNER TO postgres;
ALTER FUNCTION public.wellness_publico_respondio(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) OWNER TO postgres;
ALTER FUNCTION public.rpe_publico_guardar(uuid, uuid, date, text, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.wellness_publico_categoria(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wellness_publico_respondio(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpe_publico_guardar(uuid, uuid, date, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.wellness_publico_categoria(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wellness_publico_respondio(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpe_publico_guardar(uuid, uuid, date, text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.wellness_publico_categoria(uuid) IS 'Formulario público de Wellness: nombre de la categoría del link y sus jugadoras (id, nombre, apellido, foto). Nada más.';
COMMENT ON FUNCTION public.wellness_publico_respondio(uuid, uuid) IS 'Formulario público de Wellness: solo sí/no, si la jugadora completó el wellness de hoy (Argentina). No devuelve valores.';
COMMENT ON FUNCTION public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) IS 'Formulario público de Wellness: crea o corrige la respuesta de hoy (Argentina) de una jugadora de la categoría del link. No devuelve nada.';
COMMENT ON FUNCTION public.rpe_publico_guardar(uuid, uuid, date, text, integer) IS 'Formulario público de Wellness: crea o corrige solo el RPE de hoy o de los 3 días anteriores. No toca otras columnas ni devuelve nada.';

-- Verificación 1: configuración de las funciones.
DO $verificacion_config$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.wellness_publico_categoria(uuid)'::regprocedure,
    'public.wellness_publico_respondio(uuid,uuid)'::regprocedure,
    'public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)'::regprocedure,
    'public.rpe_publico_guardar(uuid,uuid,date,text,integer)'::regprocedure]
  LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f)
       OR (SELECT proconfig FROM pg_proc WHERE oid = f) IS DISTINCT FROM ARRAY['search_path=""']
       OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = f) <> 'postgres' THEN
      RAISE EXCEPTION '% no quedó como SECURITY DEFINER de postgres con search_path vacío.', f;
    END IF;
    IF NOT has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '% no se puede ejecutar como anon o authenticated.', f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f AND a.grantee = 0) THEN
      RAISE EXCEPTION '% quedó ejecutable por PUBLIC.', f;
    END IF;
  END LOOP;
END
$verificacion_config$;

-- Verificación 2: pruebas como anon. Cada bloque se deshace al terminar (la escritura de prueba no queda).
DO $verificacion_anon$
DECLARE
  v_cat uuid;
  v_jug uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_lista jsonb;
  v_antes text;
  v_despues text;
  v_respondio boolean;
BEGIN
  SELECT j.categoria_id, j.id INTO v_cat, v_jug FROM public.jugadores j ORDER BY j.apellido, j.id LIMIT 1;
  IF v_jug IS NULL THEN
    RAISE EXCEPTION 'No hay jugadoras para probar.';
  END IF;

  -- Lista: solo la categoría pedida y solo 4 campos por jugadora.
  SET LOCAL ROLE anon;
  v_lista := public.wellness_publico_categoria(v_cat);
  RESET ROLE;
  IF v_lista IS NULL OR jsonb_array_length(v_lista -> 'jugadoras')
       <> (SELECT count(*) FROM public.jugadores WHERE categoria_id = v_cat) THEN
    RAISE EXCEPTION 'La lista no trae las jugadoras de la categoría.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_lista -> 'jugadoras') e
             WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) <> ARRAY['apellido','foto_url','id','nombre']) THEN
    RAISE EXCEPTION 'La lista devuelve campos de más.';
  END IF;
  SET LOCAL ROLE anon;
  v_lista := public.wellness_publico_categoria(gen_random_uuid());
  RESET ROLE;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Una categoría inexistente debería devolver NULL.';
  END IF;

  -- Wellness: guardar, ver "respondió" y que la respuesta real de hoy (si había) no cambie al deshacer.
  SELECT coalesce(row_to_json(b)::text, '') INTO v_antes FROM public.bienestar b WHERE b.jugador_id = v_jug AND b.fecha = v_hoy;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 3, 2, 4, 1, 5, '  prueba  ', 'folicular');
    v_respondio := public.wellness_publico_respondio(v_cat, v_jug);
    RESET ROLE;
    IF NOT v_respondio THEN
      RAISE EXCEPTION 'Después de guardar, "respondió" debería ser sí.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bienestar WHERE jugador_id = v_jug AND fecha = v_hoy
                   AND sueno = 3 AND dolor_muscular = 2 AND fatiga = 4 AND estres = 1 AND animo_entrenar = 5
                   AND zona_dolor = 'prueba' AND fase_ciclo = 'folicular') THEN
      RAISE EXCEPTION 'La respuesta de prueba no se guardó como se esperaba.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DESHACER_PRUEBA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE; END IF;
  END;
  SELECT coalesce(row_to_json(b)::text, '') INTO v_despues FROM public.bienestar b WHERE b.jugador_id = v_jug AND b.fecha = v_hoy;
  IF v_antes IS DISTINCT FROM v_despues THEN
    RAISE EXCEPTION 'La prueba de wellness dejó cambios.';
  END IF;

  -- Wellness: rechazos.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 6, 2, 4, 1, 5);
    RAISE EXCEPTION 'Aceptó un valor 6.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 3, 2, NULL, 1, 5);
    RAISE EXCEPTION 'Aceptó una respuesta incompleta.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(gen_random_uuid(), v_jug, 3, 2, 4, 1, 5);
    RAISE EXCEPTION 'Aceptó una jugadora con otra categoría.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 3, 2, 4, 1, 5, NULL, 'otra');
    RAISE EXCEPTION 'Aceptó una fase del ciclo inválida.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.wellness_publico_guardar(v_cat, v_jug, 3, 2, 4, 1, 5, repeat('x', 301));
    RAISE EXCEPTION 'Aceptó una zona de dolor demasiado larga.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- RPE: guardar solo cambia rpe; el resto de la fila (minutos, GPS, partido) queda igual; y se deshace.
  SELECT coalesce(row_to_json(s)::text, '') INTO v_antes FROM public.sesiones_fisicas s
   WHERE s.jugador_id = v_jug AND s.fecha = v_hoy - 1 AND s.tipo = 'entrenamiento';
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy - 1, 'entrenamiento', 7);
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.sesiones_fisicas WHERE jugador_id = v_jug AND fecha = v_hoy - 1 AND tipo = 'entrenamiento' AND rpe = 7) THEN
      RAISE EXCEPTION 'El RPE de prueba no se guardó.';
    END IF;
    IF v_antes <> '' AND EXISTS (
         SELECT 1 FROM public.sesiones_fisicas s
         WHERE s.jugador_id = v_jug AND s.fecha = v_hoy - 1 AND s.tipo = 'entrenamiento'
           AND (to_jsonb(s) - 'rpe') IS DISTINCT FROM (v_antes::jsonb - 'rpe')) THEN
      RAISE EXCEPTION 'Guardar el RPE cambió otras columnas.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DESHACER_PRUEBA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DESHACER_PRUEBA' THEN RAISE; END IF;
  END;
  SELECT coalesce(row_to_json(s)::text, '') INTO v_despues FROM public.sesiones_fisicas s
   WHERE s.jugador_id = v_jug AND s.fecha = v_hoy - 1 AND s.tipo = 'entrenamiento';
  IF v_antes IS DISTINCT FROM v_despues THEN
    RAISE EXCEPTION 'La prueba de RPE dejó cambios.';
  END IF;

  -- RPE: rechazos.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy - 4, 'entrenamiento', 5);
    RAISE EXCEPTION 'Aceptó un RPE de hace 4 días.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy + 1, 'entrenamiento', 5);
    RAISE EXCEPTION 'Aceptó un RPE de mañana.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy, 'gimnasio', 5);
    RAISE EXCEPTION 'Aceptó un tipo de sesión inválido.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(v_cat, v_jug, v_hoy, 'entrenamiento', 11);
    RAISE EXCEPTION 'Aceptó un RPE 11.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpe_publico_guardar(gen_random_uuid(), v_jug, v_hoy, 'entrenamiento', 5);
    RAISE EXCEPTION 'Aceptó un RPE con otra categoría.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  RESET ROLE;
END
$verificacion_anon$;

-- Que la API (PostgREST) vea las funciones nuevas sin esperar.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Resultado: las 4 funciones, ejecutables por anon y authenticated, no por PUBLIC.
SELECT p.oid::regprocedure AS funcion,
       p.prosecdef AS security_definer,
       p.proconfig AS configuracion,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ejecuta,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_ejecuta
FROM pg_proc p
WHERE p.oid IN (
  'public.wellness_publico_categoria(uuid)'::regprocedure,
  'public.wellness_publico_respondio(uuid,uuid)'::regprocedure,
  'public.wellness_publico_guardar(uuid,uuid,integer,integer,integer,integer,integer,text,text)'::regprocedure,
  'public.rpe_publico_guardar(uuid,uuid,date,text,integer)'::regprocedure)
ORDER BY 1::text;
