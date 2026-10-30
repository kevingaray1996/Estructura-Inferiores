-- Extensión aditiva. Aplicar sólo con autorización; nunca ejecutar todo el directorio.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.biblioteca') IS NULL OR to_regclass('public.planificacion_sesiones') IS NULL
     OR to_regprocedure('planificacion_privado.item_valido(jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Falta la biblioteca o la migración de planificación';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='biblioteca' AND column_name='pizarra') THEN
    RAISE EXCEPTION 'Pizarra ya instalada: revisar antes de continuar';
  END IF;
END $$;
CREATE SCHEMA pizarra_privado;
REVOKE ALL ON SCHEMA pizarra_privado FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA pizarra_privado TO authenticated;

-- Proyección estricta. Ningún campo desconocido ni nota interna atraviesa esta función.
CREATE FUNCTION pizarra_privado.validar(d jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE e jsonb; p jsonb; pose jsonb; elementos jsonb:='[]'; pasos jsonb:='[]'; poses jsonb;
  ids text[]:=ARRAY[]::text[]; pasos_ids text[]:=ARRAY[]::text[]; id text; k text;
BEGIN
  IF d IS NULL OR d='null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(d)<>'object' OR octet_length(d::text)>1048576 OR d->'version' IS DISTINCT FROM '1'::jsonb
     OR coalesce(d->>'superficie','') NOT IN ('completa','media','cuarto','area','reducida','libre')
     OR coalesce(d->>'orientacion','') NOT IN ('horizontal','vertical') OR coalesce(d->>'ataque','') NOT IN ('derecha','izquierda')
     OR jsonb_typeof(d->'bucle') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'velocidad') IS DISTINCT FROM 'number'
     OR jsonb_typeof(d->'elementos') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'pasos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Documento de pizarra inválido' USING ERRCODE='22023';
  END IF;
  IF (d->>'velocidad')::numeric NOT BETWEEN .25 AND 3 OR jsonb_array_length(d->'elementos')>200 OR jsonb_array_length(d->'pasos') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Límites de pizarra inválidos' USING ERRCODE='22023';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(d->'elementos') LOOP
    id:=e->>'id';
    IF jsonb_typeof(e)<>'object' OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string' OR coalesce(id,'') !~ '^[a-zA-Z0-9_-]{1,80}$' OR id=ANY(ids)
      OR coalesce(e->>'tipo','') NOT IN ('jugadora','cono','tortuga','escalera','valla','aro','pelota','arco','mini','pica','zona','flecha','curva','punteada','conduccion','pase','movimiento','remate','rectangulo','circulo','texto')
      OR coalesce(e->>'color','') !~ '^#[0-9a-fA-F]{6}$' OR coalesce(e->>'tinta','') !~ '^#[0-9a-fA-F]{6}$'
      OR jsonb_typeof(e->'texto') IS DISTINCT FROM 'string' OR length(e->>'texto')>200
      OR jsonb_typeof(e->'numero') IS DISTINCT FROM 'string' OR length(e->>'numero')>4 THEN
      RAISE EXCEPTION 'Elemento inválido' USING ERRCODE='22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['tamano','grosor','dx','dy','curva'] LOOP
      IF jsonb_typeof(e->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Medida inválida' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF (e->>'tamano')::numeric NOT BETWEEN 1 AND 12 OR (e->>'grosor')::numeric NOT BETWEEN .1 AND 2
       OR (e->>'dx')::numeric NOT BETWEEN -80 AND 80 OR (e->>'dy')::numeric NOT BETWEEN -80 AND 80 OR (e->>'curva')::numeric NOT BETWEEN -50 AND 50 THEN
      RAISE EXCEPTION 'Medida fuera de rango' USING ERRCODE='22023';
    END IF;
    ids:=array_append(ids,id);
    elementos:=elementos || jsonb_build_array(jsonb_build_object('id',id,'tipo',e->'tipo','color',e->'color','tinta',e->'tinta','texto',e->'texto','numero',e->'numero','tamano',e->'tamano','grosor',e->'grosor','dx',e->'dx','dy',e->'dy','curva',e->'curva'));
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(d->'pasos') LOOP
    IF jsonb_typeof(p)<>'object' OR jsonb_typeof(p->'id') IS DISTINCT FROM 'string' OR coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' OR (p->>'id')=ANY(pasos_ids)
      OR jsonb_typeof(p->'nombre') IS DISTINCT FROM 'string' OR length(p->>'nombre')>80
      OR jsonb_typeof(p->'duracion') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'poses') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Paso inválido' USING ERRCODE='22023';
    END IF;
    IF (p->>'duracion')::numeric NOT BETWEEN .1 AND 60 OR (SELECT count(*) FROM jsonb_object_keys(p->'poses'))<>cardinality(ids) THEN
      RAISE EXCEPTION 'Paso incompleto' USING ERRCODE='22023';
    END IF;
    pasos_ids:=array_append(pasos_ids,p->>'id'); poses:='{}';
    FOREACH id IN ARRAY ids LOOP
      pose:=p->'poses'->id;
      FOREACH k IN ARRAY ARRAY['x','y','rotacion'] LOOP
        IF jsonb_typeof(pose->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Posición inválida' USING ERRCODE='22023'; END IF;
      END LOOP;
      IF (pose->>'x')::numeric NOT BETWEEN 0 AND 100 OR (pose->>'y')::numeric NOT BETWEEN 0 AND 100 OR (pose->>'rotacion')::numeric NOT BETWEEN -360 AND 360 THEN
        RAISE EXCEPTION 'Posición fuera de cancha' USING ERRCODE='22023';
      END IF;
      poses:=poses || jsonb_build_object(id,jsonb_build_object('x',pose->'x','y',pose->'y','rotacion',pose->'rotacion'));
    END LOOP;
    pasos:=pasos || jsonb_build_array(jsonb_build_object('id',p->'id','nombre',p->'nombre','duracion',p->'duracion','poses',poses));
  END LOOP;
  RETURN jsonb_build_object('version',1,'superficie',d->'superficie','orientacion',d->'orientacion','ataque',d->'ataque','bucle',d->'bucle','velocidad',d->'velocidad','elementos',elementos,'pasos',pasos);
END $$;
REVOKE ALL ON FUNCTION pizarra_privado.validar(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pizarra_privado.validar(jsonb) TO authenticated;

ALTER TABLE public.biblioteca ADD COLUMN pizarra jsonb,
  ADD COLUMN pizarra_miniatura text NOT NULL DEFAULT '',
  ADD COLUMN pizarra_revision integer NOT NULL DEFAULT 0 CHECK (pizarra_revision>=0);

CREATE FUNCTION pizarra_privado.auditar_biblioteca() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  NEW.pizarra:=pizarra_privado.validar(NEW.pizarra);
  IF NEW.pizarra_miniatura<>'' AND (length(NEW.pizarra_miniatura)>600000 OR NEW.pizarra_miniatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') THEN
    RAISE EXCEPTION 'Miniatura inválida' USING ERRCODE='22023';
  END IF;
  NEW.pizarra_revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.pizarra_revision+1 END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pizarra_privado.auditar_biblioteca() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER biblioteca_pizarra BEFORE INSERT OR UPDATE ON public.biblioteca
  FOR EACH ROW EXECUTE FUNCTION pizarra_privado.auditar_biblioteca();

-- INVOKER conserva exactamente las políticas de biblioteca: PF sólo lectura.
CREATE FUNCTION public.guardar_ejercicio_pizarra(p_id uuid,p_revision integer,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actual public.biblioteca; salida public.biblioteca;
BEGIN
  IF auth.uid() IS NULL OR public.mi_rol() NOT IN ('coordinacion','tecnico') THEN RAISE EXCEPTION 'Sin permiso para editar biblioteca' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN
    IF p_revision IS NOT NULL THEN RAISE EXCEPTION 'Revisión inválida' USING ERRCODE='22023'; END IF;
    INSERT INTO public.biblioteca(fecha,contenido,descripcion,cantidad_jugadores,imagen_url,link_video,pizarra,pizarra_miniatura)
    VALUES((p_datos->>'fecha')::date,p_datos->>'contenido',p_datos->>'descripcion',(p_datos->>'cantidad_jugadores')::integer,p_datos->>'imagen_url',p_datos->>'link_video',p_datos->'pizarra',coalesce(p_datos->>'pizarra_miniatura','')) RETURNING * INTO salida;
  ELSE
    SELECT * INTO actual FROM public.biblioteca WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR p_revision IS NULL OR actual.pizarra_revision<>p_revision THEN RAISE EXCEPTION 'El ejercicio cambió; recargar antes de guardar' USING ERRCODE='40001'; END IF;
    UPDATE public.biblioteca SET fecha=(p_datos->>'fecha')::date,contenido=p_datos->>'contenido',descripcion=p_datos->>'descripcion',
      cantidad_jugadores=(p_datos->>'cantidad_jugadores')::integer,imagen_url=p_datos->>'imagen_url',link_video=p_datos->>'link_video',
      pizarra=p_datos->'pizarra',pizarra_miniatura=coalesce(p_datos->>'pizarra_miniatura','') WHERE id=p_id RETURNING * INTO salida;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sin permiso de actualización' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN to_jsonb(salida);
END $$;
REVOKE ALL ON FUNCTION public.guardar_ejercicio_pizarra(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_ejercicio_pizarra(uuid,integer,jsonb) TO authenticated;

-- A continuación: extensiones de validación y proyección de Planificación.

CREATE OR REPLACE FUNCTION planificacion_privado.item_valido(p_item jsonb, p_bloque boolean)
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
    permitidos := ARRAY['objetivo','duracion','indicaciones','series','repeticiones','materiales','imagen_url','link_video','pizarra'];
    FOREACH campo IN ARRAY ARRAY['series','repeticiones','materiales','imagen_url','link_video'] LOOP
      IF jsonb_typeof(p_item->campo) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    END LOOP;
    IF p_item->'pizarra' IS NOT NULL AND p_item->'pizarra' <> 'null'::jsonb THEN
      PERFORM pizarra_privado.validar(p_item->'pizarra');
    END IF;
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


CREATE OR REPLACE FUNCTION planificacion_privado.item_publico(p_item jsonb,p_bloque boolean)
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
  IF NOT p_bloque AND campos ? 'pizarra' AND p_item->'pizarra' IS NOT NULL AND p_item->'pizarra' <> 'null'::jsonb THEN
    salida := salida || jsonb_build_object('pizarra',pizarra_privado.validar(p_item->'pizarra'));
  END IF;
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


COMMIT;
