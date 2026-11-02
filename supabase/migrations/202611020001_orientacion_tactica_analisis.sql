-- Aplicar antes de publicar React. Sin backfill, UPDATE, DELETE ni cambios RLS.
BEGIN;
ALTER TABLE public.analisis_eventos
  ADD COLUMN sistema_coordenadas text,
  ADD COLUMN direccion_captura text,
  ADD COLUMN periodo_captura integer,
  ADD CONSTRAINT analisis_referencia_tactica_valida CHECK (
    (sistema_coordenadas IS NULL AND direccion_captura IS NULL AND periodo_captura IS NULL)
    OR (sistema_coordenadas IS NOT NULL AND sistema_coordenadas = 'visual_v1'
      AND direccion_captura IS NOT NULL AND direccion_captura IN ('derecha','izquierda')
      AND periodo_captura IS NOT NULL AND periodo_captura IN (1,2))
  );

CREATE FUNCTION public.validar_referencia_tactica_analisis()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE inicial text; direccion text; avance double precision; v_carril double precision;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.sistema_coordenadas,NEW.direccion_captura,NEW.periodo_captura)
      IS DISTINCT FROM ROW(OLD.sistema_coordenadas,OLD.direccion_captura,OLD.periodo_captura) THEN
      RAISE EXCEPTION 'La referencia de captura es inmutable; no se convierten registros históricos';
    END IF;
  ELSIF NEW.sistema_coordenadas = 'visual_v1' THEN
    SELECT p.direccion_primer_tiempo INTO inicial FROM public.analisis_partidos p
      WHERE p.id = NEW.partido_id FOR SHARE;
    IF inicial IS NULL OR inicial NOT IN ('derecha','izquierda') OR NEW.periodo IS NULL OR NEW.periodo NOT IN (1,2) THEN
      RAISE EXCEPTION 'Falta orientación explícita y período válido';
    END IF;
    direccion := CASE WHEN NEW.periodo = 1 THEN inicial WHEN inicial = 'derecha' THEN 'izquierda' ELSE 'derecha' END;
    IF NEW.direccion_captura IS DISTINCT FROM direccion OR NEW.periodo_captura IS DISTINCT FROM NEW.periodo THEN
      RAISE EXCEPTION 'La orientación cambió antes de guardar. Revisá la cancha y volvé a confirmar';
    END IF;
  END IF;
  IF NEW.sistema_coordenadas = 'visual_v1' AND ((NEW.coordenada_x IS NULL) <> (NEW.coordenada_y IS NULL)) THEN
    RAISE EXCEPTION 'La ubicación debe contener ambas coordenadas o ninguna';
  END IF;
  IF NEW.sistema_coordenadas = 'visual_v1' AND NEW.coordenada_x IS NOT NULL AND NEW.coordenada_y IS NOT NULL THEN
    IF NOT (NEW.coordenada_x BETWEEN 0 AND 100 AND NEW.coordenada_y BETWEEN 0 AND 100) THEN
      RAISE EXCEPTION 'Coordenadas visuales fuera de rango';
    END IF;
    avance := CASE WHEN NEW.direccion_captura = 'derecha' THEN NEW.coordenada_x ELSE 100 - NEW.coordenada_x END;
    v_carril := CASE WHEN NEW.direccion_captura = 'derecha' THEN NEW.coordenada_y ELSE 100 - NEW.coordenada_y END;
    NEW.zona := (CASE WHEN avance < 33.333 THEN 'Defensa' WHEN avance < 66.666 THEN 'Medio' ELSE 'Ataque' END)
      || ' ' || (CASE WHEN v_carril < 33.333 THEN 'izquierda' WHEN v_carril < 66.666 THEN 'centro' ELSE 'derecha' END);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_referencia_tactica_analisis() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar_referencia_tactica_analisis
  BEFORE INSERT OR UPDATE ON public.analisis_eventos
  FOR EACH ROW EXECUTE FUNCTION public.validar_referencia_tactica_analisis();
COMMENT ON COLUMN public.analisis_eventos.sistema_coordenadas IS 'NULL: referencia histórica no verificada; visual_v1: X/Y fijos en pantalla, referencia táctica capturada por evento';
COMMIT;
