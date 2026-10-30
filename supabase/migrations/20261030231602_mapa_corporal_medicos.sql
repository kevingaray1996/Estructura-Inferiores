-- Pendiente de autorización. Ejecutar una sola vez, en una transacción.
-- Reutiliza fichas_medicas; no modifica filas ni políticas anteriores.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.fichas_medicas') IS NULL OR to_regprocedure('public.mi_rol()') IS NULL THEN
    RAISE EXCEPTION 'Faltan fichas_medicas o mi_rol(); detener y revisar el esquema';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fichas_medicas' AND column_name='zona_corporal') THEN
    RAISE EXCEPTION 'El mapa corporal ya existe o fue aplicado parcialmente; no reejecutar';
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='fichas_medicas' AND column_name='jugador_id') IS DISTINCT FROM 'uuid'
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fichas_medicas'::regclass AND confrelid='public.jugadores'::regclass AND contype='f') THEN
    RAISE EXCEPTION 'La relación con jugadores no coincide con el esquema revisado';
  END IF;
END $$;

ALTER TABLE public.fichas_medicas
  ADD COLUMN zona_corporal text,
  ADD COLUMN lateralidad text,
  ADD COLUMN tipo_incidencia text,
  ADD COLUMN estado_seguimiento text,
  ADD COLUMN fecha_resolucion date,
  ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN modificado_en timestamptz,
  ADD COLUMN modificado_por uuid;

ALTER TABLE public.fichas_medicas ADD CONSTRAINT ficha_mapa_coherente CHECK (
  (zona_corporal IS NULL AND lateralidad IS NULL AND tipo_incidencia IS NULL AND estado_seguimiento IS NULL AND fecha_resolucion IS NULL)
  OR
  (zona_corporal IS NOT NULL AND lateralidad IS NOT NULL AND tipo_incidencia IS NOT NULL AND estado_seguimiento IS NOT NULL
   AND zona_corporal IN ('cuello','hombro','brazo','codo','antebrazo','mano','pecho','abdomen','espalda_alta','lumbar','gluteo','cadera','aductor','cuadriceps','isquiotibial','rodilla','pantorrilla','tobillo','pie')
   AND ((zona_corporal IN ('cuello','pecho','abdomen','espalda_alta','lumbar') AND lateralidad='central')
     OR (zona_corporal NOT IN ('cuello','pecho','abdomen','espalda_alta','lumbar') AND lateralidad IN ('derecha','izquierda','ambos')))
   AND tipo_incidencia IN ('molestia','lesion_informada')
   AND estado_seguimiento IN ('seguimiento','derivada','resuelta')
   AND fecha IS NOT NULL AND recuperado IS NOT NULL
   AND ((estado_seguimiento='resuelta' AND recuperado AND fecha_resolucion IS NOT NULL AND fecha_resolucion >= fecha)
     OR (estado_seguimiento <> 'resuelta' AND NOT recuperado AND fecha_resolucion IS NULL)))
);
ALTER TABLE public.fichas_medicas ADD CONSTRAINT ficha_revision_valida CHECK (revision >= 0);
CREATE INDEX fichas_medicas_jugadora_zona_fecha ON public.fichas_medicas (jugador_id, zona_corporal, fecha DESC);

ALTER TABLE public.fichas_medicas ENABLE ROW LEVEL SECURITY;
-- Las políticas permisivas existentes se conservan. Esta barrera restrictiva
-- limita su combinación OR a los tres roles autorizados, también para llamadas REST.
CREATE POLICY mapa_corporal_solo_personal_autorizado ON public.fichas_medicas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND public.mi_rol() IN ('coordinacion','medico','preparador_fisico'))
  WITH CHECK (auth.uid() IS NOT NULL AND public.mi_rol() IN ('coordinacion','medico','preparador_fisico'));
CREATE POLICY mapa_corporal_pf_registra ON public.fichas_medicas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.mi_rol()='preparador_fisico' AND zona_corporal IS NOT NULL);
CREATE POLICY mapa_corporal_pf_actualiza ON public.fichas_medicas
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND public.mi_rol()='preparador_fisico')
  WITH CHECK (auth.uid() IS NOT NULL AND public.mi_rol()='preparador_fisico' AND zona_corporal IS NOT NULL);
-- Preparación Física conserva su política SELECT actual. No recibe DELETE.
REVOKE ALL ON TABLE public.fichas_medicas FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.fichas_medicas FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fichas_medicas TO authenticated;

CREATE SCHEMA IF NOT EXISTS medicos_privado;
REVOKE ALL ON SCHEMA medicos_privado FROM PUBLIC, anon, authenticated;
CREATE FUNCTION medicos_privado.validar_ficha_corporal()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.zona_corporal IS NOT NULL AND NEW.zona_corporal IS NULL THEN
      RAISE EXCEPTION 'No se puede quitar la clasificación de un antecedente' USING ERRCODE='23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.jugador_id IS DISTINCT FROM OLD.jugador_id THEN
      RAISE EXCEPTION 'No se puede trasladar una ficha a otra jugadora' USING ERRCODE='23514';
    END IF;
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := 0;
  END IF;
  NEW.modificado_por := auth.uid();
  NEW.modificado_en := statement_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION medicos_privado.validar_ficha_corporal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_ficha_corporal BEFORE INSERT OR UPDATE ON public.fichas_medicas
  FOR EACH ROW EXECUTE FUNCTION medicos_privado.validar_ficha_corporal();

COMMENT ON COLUMN public.fichas_medicas.zona_corporal IS 'NULL conserva registros anteriores sin inferir anatomía. Lateralidad anatómica de la jugadora.';
COMMENT ON COLUMN public.fichas_medicas.tipo_incidencia IS 'Molestia o lesión informada: no es un diagnóstico ni una autorización deportiva.';
COMMENT ON COLUMN public.fichas_medicas.revision IS 'Actualizar filtrando por id y revisión leída. Cero filas indica conflicto o falta de permisos.';
COMMIT;
