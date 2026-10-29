-- Planificación prevista, independiente de asistencia, RPE y carga real.
-- REVISAR Y APLICAR MANUALMENTE. No modifica políticas ni registros existentes.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.planificacion_sesiones') IS NOT NULL THEN
    RAISE EXCEPTION 'planificacion_sesiones ya existe: revisar antes de continuar';
  END IF;
  IF to_regclass('public.categorias') IS NULL OR to_regclass('public.biblioteca') IS NULL
     OR to_regclass('public.entrenamiento_bloques') IS NULL OR to_regclass('public.jugadores_publico') IS NULL THEN
    RAISE EXCEPTION 'Faltan relaciones existentes requeridas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Revisar el propietario de las funciones de acceso controlado';
  END IF;
END $$;

CREATE SCHEMA planificacion_privado;
REVOKE ALL ON SCHEMA planificacion_privado FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA planificacion_privado TO authenticated;

CREATE FUNCTION planificacion_privado.autorizado(p_categoria uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.perfiles p JOIN auth.users u ON lower(p.email) = lower(u.email)
    WHERE u.id = auth.uid() AND (
      p.rol = 'coordinacion' OR
      (p.rol IN ('tecnico', 'preparador_fisico') AND p.categoria_id = p_categoria)
    )
  );
$$;
ALTER FUNCTION planificacion_privado.autorizado(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION planificacion_privado.autorizado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION planificacion_privado.autorizado(uuid) TO authenticated;

CREATE TABLE public.planificacion_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  hora time without time zone,
  tipo text NOT NULL DEFAULT 'entrenamiento' CHECK (tipo IN ('entrenamiento','descanso','partido')),
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado')),
  lugar text NOT NULL DEFAULT '',
  objetivo text NOT NULL DEFAULT '',
  responsable text NOT NULL DEFAULT '',
  observaciones_internas text NOT NULL DEFAULT '',
  bloques jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bloques) = 'array'),
  entrenamiento_real_id uuid REFERENCES public.entrenamiento_bloques(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  creado_por uuid,
  actualizado_por uuid,
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planificacion_sesiones OWNER TO postgres;
CREATE INDEX planificacion_categoria_fecha_idx ON public.planificacion_sesiones(categoria_id, fecha);
CREATE INDEX planificacion_entrenamiento_real_idx ON public.planificacion_sesiones(entrenamiento_real_id) WHERE entrenamiento_real_id IS NOT NULL;
ALTER TABLE public.planificacion_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planificacion_sesiones FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.planificacion_sesiones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.planificacion_sesiones TO authenticated;
CREATE POLICY planificacion_lectura_staff ON public.planificacion_sesiones FOR SELECT TO authenticated
  USING (planificacion_privado.autorizado(categoria_id));
-- Sin políticas ni privilegios DML para clientes: todas las escrituras pasan por RPC con revisión.

CREATE FUNCTION planificacion_privado.auditar()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    NEW.creado_at := now();
    NEW.creado_por := auth.uid();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
      RAISE EXCEPTION 'No se puede trasladar una sesión a otra categoría' USING ERRCODE = '23514';
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.creado_at := OLD.creado_at;
    NEW.creado_por := OLD.creado_por;
  END IF;
  NEW.actualizado_at := now();
  NEW.actualizado_por := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION planificacion_privado.auditar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER planificacion_auditar BEFORE INSERT OR UPDATE ON public.planificacion_sesiones
  FOR EACH ROW EXECUTE FUNCTION planificacion_privado.auditar();

-- Valida también tareas libres; la posición en el array define su orden, sin horarios rígidos.
CREATE FUNCTION planificacion_privado.item_valido(p_item jsonb, p_bloque boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE campo text; hijo jsonb; permitidos text[];
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF jsonb_typeof(p_item->'nombre') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_item->'visible') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_item->'campos_publicos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOREACH campo IN ARRAY ARRAY['id','objetivo','indicaciones','notas_internas'] LOOP
    IF jsonb_typeof(p_item->campo) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  END LOOP;
  IF p_item->'duracion' IS NOT NULL AND p_item->'duracion' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_item->'duracion') <> 'number' THEN RETURN false; END IF;
    IF (p_item->>'duracion')::numeric <= 0 OR (p_item->>'duracion')::numeric > 1440 THEN RETURN false; END IF;
  END IF;
  IF p_bloque THEN
    permitidos := ARRAY['objetivo','duracion','indicaciones'];
    IF jsonb_typeof(p_item->'ejercicios') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    FOR hijo IN SELECT value FROM jsonb_array_elements(p_item->'ejercicios') LOOP
      IF NOT planificacion_privado.item_valido(hijo, false) THEN RETURN false; END IF;
    END LOOP;
  ELSE
    permitidos := ARRAY['objetivo','duracion','indicaciones','series','repeticiones','materiales','imagen_url','link_video'];
    FOREACH campo IN ARRAY ARRAY['series','repeticiones','materiales','imagen_url','link_video'] LOOP
      IF jsonb_typeof(p_item->campo) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    IF nullif(p_item->>'biblioteca_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.biblioteca b WHERE b.id = (p_item->>'biblioteca_id')::uuid
    ) THEN RAISE EXCEPTION 'El ejercicio de biblioteca ya no existe. Desvinculalo para conservar la tarea libre.' USING ERRCODE = '23503'; END IF;
  END IF;
  FOR hijo IN SELECT value FROM jsonb_array_elements(p_item->'campos_publicos') LOOP
    IF jsonb_typeof(hijo) <> 'string' OR NOT ((hijo #>> '{}') = ANY(permitidos)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION planificacion_privado.item_valido(jsonb,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guardar_planificacion_sesion(p_sesion jsonb, p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_categoria uuid; v_fecha date; v_real uuid; anterior public.planificacion_sesiones; guardada public.planificacion_sesiones; bloque jsonb;
BEGIN
  IF jsonb_typeof(p_sesion) IS DISTINCT FROM 'object' OR octet_length(p_sesion::text) > 1048576 THEN
    RAISE EXCEPTION 'Sesión inválida o demasiado grande' USING ERRCODE = '22023';
  END IF;
  v_categoria := (p_sesion->>'categoria_id')::uuid;
  IF NOT planificacion_privado.autorizado(v_categoria) THEN RAISE EXCEPTION 'Sin permiso para esta categoría' USING ERRCODE = '42501'; END IF;
  v_id := nullif(p_sesion->>'id','')::uuid;
  v_fecha := (p_sesion->>'fecha')::date;
  v_real := nullif(p_sesion->>'entrenamiento_real_id','')::uuid;
  IF v_fecha IS NULL OR v_categoria IS NULL OR coalesce(p_sesion->>'estado','') NOT IN ('borrador','publicado')
     OR coalesce(p_sesion->>'tipo','') NOT IN ('entrenamiento','descanso','partido')
     OR jsonb_typeof(p_sesion->'bloques') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Fecha, categoría, jornada o bloques inválidos' USING ERRCODE = '22023';
  END IF;
  IF v_real IS NOT NULL THEN
    -- Padre antes que sesión: también respeta el orden del borrado con SET NULL.
    PERFORM 1 FROM public.entrenamiento_bloques r
      WHERE r.id=v_real AND r.categoria_id=v_categoria AND r.fecha=v_fecha FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El entrenamiento registrado debe corresponder a la categoría y fecha de la sesión' USING ERRCODE = '23514';
    END IF;
  END IF;
  FOR bloque IN SELECT value FROM jsonb_array_elements(p_sesion->'bloques') LOOP
    IF NOT planificacion_privado.item_valido(bloque,true) THEN RAISE EXCEPTION 'Contenido de bloque inválido' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF v_id IS NULL THEN
    IF p_revision IS NOT NULL THEN RAISE EXCEPTION 'Una sesión nueva no debe enviar revisión' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.planificacion_sesiones(categoria_id,fecha,hora,tipo,estado,lugar,objetivo,responsable,observaciones_internas,bloques,entrenamiento_real_id)
    VALUES(v_categoria,v_fecha,nullif(p_sesion->>'hora','')::time,p_sesion->>'tipo',p_sesion->>'estado',coalesce(p_sesion->>'lugar',''),coalesce(p_sesion->>'objetivo',''),coalesce(p_sesion->>'responsable',''),coalesce(p_sesion->>'observaciones_internas',''),p_sesion->'bloques',v_real)
    RETURNING * INTO guardada;
  ELSE
    SELECT * INTO anterior FROM public.planificacion_sesiones WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La sesión ya no existe' USING ERRCODE = '40001'; END IF;
    IF anterior.categoria_id <> v_categoria OR NOT planificacion_privado.autorizado(anterior.categoria_id) THEN
      RAISE EXCEPTION 'No se puede modificar otra categoría' USING ERRCODE = '42501';
    END IF;
    IF p_revision IS NULL OR anterior.revision <> p_revision THEN RAISE EXCEPTION 'La sesión fue modificada por otra persona' USING ERRCODE = '40001'; END IF;
    UPDATE public.planificacion_sesiones SET fecha=v_fecha,hora=nullif(p_sesion->>'hora','')::time,tipo=p_sesion->>'tipo',estado=p_sesion->>'estado',
      lugar=coalesce(p_sesion->>'lugar',''),objetivo=coalesce(p_sesion->>'objetivo',''),responsable=coalesce(p_sesion->>'responsable',''),
      observaciones_internas=coalesce(p_sesion->>'observaciones_internas',''),bloques=p_sesion->'bloques',entrenamiento_real_id=v_real
    WHERE id=v_id RETURNING * INTO guardada;
  END IF;
  RETURN to_jsonb(guardada);
END $$;
ALTER FUNCTION public.guardar_planificacion_sesion(jsonb,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guardar_planificacion_sesion(jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_planificacion_sesion(jsonb,integer) TO authenticated;

CREATE FUNCTION public.eliminar_planificacion_sesion(p_id uuid, p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE anterior public.planificacion_sesiones;
BEGIN
  SELECT * INTO anterior FROM public.planificacion_sesiones WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La sesión ya no existe' USING ERRCODE = '40001'; END IF;
  IF NOT planificacion_privado.autorizado(anterior.categoria_id) THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501'; END IF;
  IF p_revision IS NULL OR p_revision <> anterior.revision THEN RAISE EXCEPTION 'La sesión cambió' USING ERRCODE = '40001'; END IF;
  DELETE FROM public.planificacion_sesiones WHERE id=p_id;
END $$;
ALTER FUNCTION public.eliminar_planificacion_sesion(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eliminar_planificacion_sesion(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_planificacion_sesion(uuid,integer) TO authenticated;

CREATE FUNCTION public.copiar_planificacion_semana(p_categoria_id uuid,p_origen date,p_destino date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cantidad integer;
BEGIN
  IF NOT planificacion_privado.autorizado(p_categoria_id) THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501'; END IF;
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen=p_destino OR extract(isodow FROM p_origen) <> 1 OR extract(isodow FROM p_destino) <> 1 THEN
    RAISE EXCEPTION 'Indicar dos semanas diferentes desde el lunes' USING ERRCODE = '22023';
  END IF;
  -- Una única sentencia usa una instantánea consistente; nunca sobrescribe sesiones destino.
  INSERT INTO public.planificacion_sesiones(categoria_id,fecha,hora,tipo,estado,lugar,objetivo,responsable,observaciones_internas,bloques)
  SELECT categoria_id,fecha+(p_destino-p_origen),hora,tipo,'borrador',lugar,objetivo,responsable,observaciones_internas,bloques
  FROM public.planificacion_sesiones WHERE categoria_id=p_categoria_id AND fecha BETWEEN p_origen AND p_origen+6;
  GET DIAGNOSTICS cantidad = ROW_COUNT;
  RETURN cantidad;
END $$;
ALTER FUNCTION public.copiar_planificacion_semana(uuid,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.copiar_planificacion_semana(uuid,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copiar_planificacion_semana(uuid,date,date) TO authenticated;

-- Proyección por lista permitida: nunca devolver el JSON privado ni columnas internas.
CREATE FUNCTION planificacion_privado.item_publico(p_item jsonb,p_bloque boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE salida jsonb; campos jsonb; hijos jsonb := '[]'::jsonb; hijo jsonb; proyectado jsonb; campo text;
BEGIN
  IF p_item->'visible' IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
  campos := coalesce(p_item->'campos_publicos','[]'::jsonb);
  salida := jsonb_build_object('nombre',coalesce(p_item->>'nombre',''));
  FOREACH campo IN ARRAY (CASE WHEN p_bloque THEN ARRAY['objetivo','duracion','indicaciones']
    ELSE ARRAY['objetivo','duracion','indicaciones','series','repeticiones','materiales','imagen_url','link_video'] END) LOOP
    IF campos ? campo AND p_item ? campo THEN salida := salida || jsonb_build_object(campo,p_item->campo); END IF;
  END LOOP;
  IF p_bloque THEN
    FOR hijo IN SELECT value FROM jsonb_array_elements(coalesce(p_item->'ejercicios','[]'::jsonb)) LOOP
      proyectado := planificacion_privado.item_publico(hijo,false);
      IF proyectado IS NOT NULL THEN hijos := hijos || jsonb_build_array(proyectado); END IF;
    END LOOP;
    salida := salida || jsonb_build_object('ejercicios',hijos);
  END IF;
  IF jsonb_array_length(hijos) = 0 AND NOT EXISTS (SELECT 1 FROM jsonb_each(salida) e
    WHERE e.key <> 'ejercicios' AND e.value <> 'null'::jsonb AND (e.value #>> '{}') ~ '[^[:space:]]') THEN RETURN NULL; END IF;
  RETURN jsonb_strip_nulls(salida);
END $$;
REVOKE ALL ON FUNCTION planificacion_privado.item_publico(jsonb,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION planificacion_privado.bloques_publicos(p_bloques jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(proyectado ORDER BY posicion) FILTER (WHERE proyectado IS NOT NULL),'[]'::jsonb)
  FROM (SELECT planificacion_privado.item_publico(value,true) proyectado,ordinality posicion
    FROM jsonb_array_elements(p_bloques) WITH ORDINALITY) b;
$$;
REVOKE ALL ON FUNCTION planificacion_privado.bloques_publicos(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.planificacion_publica_hoy(p_categoria_id uuid,p_jugadora_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE salida jsonb;
BEGIN
  -- El Wellness existente es público por enlace de categoría y selección de jugadora, sin login.
  -- Esto NO acredita identidad personal: mantiene ese modelo y sólo expone contenido publicado.
  IF NOT EXISTS (SELECT 1 FROM public.jugadores_publico j WHERE j.id=p_jugadora_id AND j.categoria_id=p_categoria_id) THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'categoria_id',s.categoria_id,'fecha',s.fecha,'hora',s.hora,
    'tipo',s.tipo,'lugar',s.lugar,'objetivo',s.objetivo,'bloques',planificacion_privado.bloques_publicos(s.bloques)) ORDER BY s.hora NULLS FIRST,s.id),'[]'::jsonb)
  INTO salida FROM public.planificacion_sesiones s
  WHERE s.categoria_id=p_categoria_id AND s.estado='publicado'
    AND s.fecha=(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    AND jsonb_array_length(planificacion_privado.bloques_publicos(s.bloques)) > 0;
  RETURN salida;
END $$;
ALTER FUNCTION public.planificacion_publica_hoy(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.planificacion_publica_hoy(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.planificacion_publica_hoy(uuid,uuid) TO anon, authenticated;

COMMENT ON TABLE public.planificacion_sesiones IS 'Plan previsto flexible. JSON ordenado de bloques/tareas; privado para staff autorizado. No crea datos de asistencia, RPE ni carga real.';
COMMENT ON FUNCTION public.planificacion_publica_hoy(uuid,uuid) IS 'Sólo contenido compartido de hoy en Argentina, conforme al acceso público por enlace ya usado por Wellness. Nunca devuelve notas internas.';
COMMIT;
