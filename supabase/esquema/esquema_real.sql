-- =====================================================================================================
-- ESQUEMA REAL DE LA BASE (Supabase) — solo estructura, SIN DATOS
-- Exportado de la base de producción el 2026-11-13 con supabase/esquema/consultas_exportar.sql
-- y armado con supabase/esquema/armar_esquema.mjs. Ver supabase/esquema/README.md.
--
-- Es la referencia de cómo está la base. No es una migración: no correrlo sobre producción.
-- Incluye los esquemas propios (public y los *_privado), las políticas de storage y la configuración de
-- los buckets. No incluye auth, storage (salvo políticas), realtime ni ningún otro esquema de Supabase.
-- Los nombres de public aparecen sin prefijo porque se exportó con el search_path del editor de Supabase.
-- =====================================================================================================

-- Los 2 UUID fijos que aparecen en el código de la base (IDs de cuentas o filas) se reemplazaron por
-- marcadores 00000000-0000-4000-8000-00000000000N. Los valores reales están solo en la base.
SET check_function_bodies = off;
SET search_path = public, extensions;


-- ====================================================================================================
-- Esquemas, extensiones, tipos y secuencias
-- (e1: 13 sentencias. Esquemas de Supabase/sistema omitidos: auth, cron, extensions, graphql, graphql_public, information_schema, net, pgbouncer, realtime, storage, supabase_migrations, vault)
-- ====================================================================================================

CREATE SCHEMA IF NOT EXISTS analisis_privado AUTHORIZATION postgres;
CREATE SCHEMA IF NOT EXISTS medicos_privado AUTHORIZATION postgres;
CREATE SCHEMA IF NOT EXISTS pizarra_privado AUTHORIZATION postgres;
CREATE SCHEMA IF NOT EXISTS planificacion_privado AUTHORIZATION postgres;
CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION pg_database_owner;
CREATE SCHEMA IF NOT EXISTS seguridad_privado AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog; -- versión 1.6.4
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions; -- versión 0.20.4
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions; -- versión 1.11
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; -- versión 1.3
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog; -- versión 1.0
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault; -- versión 0.3.1
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions; -- versión 1.1


-- ====================================================================================================
-- Tablas: columnas, restricciones, RLS activado, secuencias asociadas y comentarios
-- (e2: 210 sentencias)
-- ====================================================================================================

CREATE TABLE analisis_privado.manifiesto_permisos_20261101 (
  huella text NOT NULL,
  respaldo text NOT NULL
);
CREATE TABLE analisis_privado.respaldo_permisos_20261101 (
  orden integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  sentencia text NOT NULL
);
CREATE TABLE public.analisis_eventos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partido_id uuid NOT NULL,
  jugador_id uuid,
  segundo integer DEFAULT 0 NOT NULL,
  tipo text NOT NULL,
  zona text,
  resultado text,
  observaciones text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  coordenada_x double precision,
  coordenada_y double precision,
  periodo smallint DEFAULT 1 NOT NULL,
  sistema_coordenadas text,
  direccion_captura text,
  periodo_captura integer
);
CREATE TABLE public.analisis_partidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  categoria_id uuid NOT NULL,
  rival text NOT NULL,
  fecha date,
  video_url text,
  notas text,
  creado_por text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  partido_calendario_id uuid,
  direccion_primer_tiempo text DEFAULT 'derecha'::text NOT NULL
);
CREATE TABLE public.analisis_pases_detalle (
  evento_id uuid NOT NULL,
  destinataria_id uuid,
  destinataria_estado text DEFAULT 'pendiente'::text NOT NULL,
  version_formato smallint DEFAULT 1 NOT NULL,
  revision bigint DEFAULT 1 NOT NULL,
  creado_en timestamp with time zone NOT NULL,
  actualizado_en timestamp with time zone NOT NULL,
  creado_por uuid NOT NULL,
  actualizado_por uuid NOT NULL,
  destino_x double precision,
  destino_y double precision
);
CREATE TABLE public.analisis_tipos_accion (
  codigo text NOT NULL,
  etiqueta text NOT NULL,
  etiqueta_boton text NOT NULL,
  icono text,
  color text DEFAULT 'acento'::text NOT NULL,
  ubicacion text NOT NULL,
  resultados text[] DEFAULT '{}'::text[] NOT NULL,
  resultado_implicito text,
  es_pase boolean DEFAULT false NOT NULL,
  grupo text NOT NULL,
  orden integer DEFAULT 0 NOT NULL,
  visible boolean DEFAULT true NOT NULL,
  atajo text,
  actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
  actualizado_por uuid DEFAULT auth.uid()
);
CREATE TABLE public.asistencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  jugador_id uuid NOT NULL,
  estado text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.biblioteca (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  contenido text,
  descripcion text NOT NULL,
  cantidad_jugadores integer,
  imagen_url text,
  link_video text,
  created_at timestamp with time zone DEFAULT now(),
  pizarra jsonb,
  pizarra_miniatura text DEFAULT ''::text NOT NULL,
  pizarra_revision integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.bienestar (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  fecha date NOT NULL,
  sueno smallint,
  dolor_muscular smallint,
  fatiga smallint,
  estres smallint,
  animo_entrenar smallint,
  zona_dolor text,
  fase_ciclo text
);
CREATE TABLE public.candidatos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  apellido text NOT NULL,
  fecha_nacimiento date,
  posicion text,
  categoria_probada_id uuid,
  fecha_prueba date,
  contacto_nombre text,
  telefono_contacto text,
  notas text,
  estado text DEFAULT 'en_prueba'::text NOT NULL,
  jugador_id uuid,
  creado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.categorias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL,
  es_reserva boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.citaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  partido_id uuid NOT NULL,
  jugador_id uuid NOT NULL,
  dorsal integer,
  titular boolean DEFAULT false,
  posicion_cancha text
);
CREATE TABLE public.cmj (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  jugador_id uuid NOT NULL,
  valor_cm numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.convocatorias_seleccion (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  seleccion text DEFAULT 'Selección Nacional'::text NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  observaciones text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.datafem_tablas (
  id smallint DEFAULT 1 NOT NULL,
  zona_a jsonb DEFAULT '[]'::jsonb NOT NULL,
  zona_b jsonb DEFAULT '[]'::jsonb NOT NULL,
  general jsonb DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamp with time zone,
  source_url text DEFAULT 'https://datafem.com.ar/primera-b'::text NOT NULL
);
CREATE TABLE public.entrenamiento_bloques (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  categoria_id uuid NOT NULL,
  descripcion text NOT NULL,
  duracion_minutos integer NOT NULL,
  posiciones text[],
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.entrenamientos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  contenido text,
  descripcion text NOT NULL,
  cantidad_jugadores integer,
  imagen_url text,
  link_video text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.equipos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  escudo_url text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.estadisticas_jugador (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  partido_id uuid NOT NULL,
  minutos_jugados integer DEFAULT 0,
  goles integer DEFAULT 0,
  asistencias integer DEFAULT 0,
  tarjetas_amarillas integer DEFAULT 0,
  tarjetas_rojas integer DEFAULT 0,
  titular boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  observaciones text,
  link text,
  pdf_url text,
  capitan boolean DEFAULT false
);
CREATE TABLE public.evaluacion_criterios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  area text,
  orden integer DEFAULT 0 NOT NULL,
  activo boolean DEFAULT true NOT NULL
);
CREATE TABLE public.evaluaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  evaluador_id uuid DEFAULT auth.uid() NOT NULL,
  evaluador_nombre text,
  periodo text NOT NULL,
  tipo text DEFAULT 'periodica'::text NOT NULL,
  puntajes jsonb DEFAULT '{}'::jsonb NOT NULL,
  fortalezas text,
  a_mejorar text,
  comentario text,
  recomendacion text,
  proyeccion text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.fichas_medicas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  fecha date,
  descripcion text,
  tiempo_recuperacion text,
  recuperado boolean DEFAULT false,
  link_informe text,
  fecha_estimada_alta date,
  created_at timestamp with time zone DEFAULT now(),
  zona_corporal text,
  lateralidad text,
  tipo_incidencia text,
  estado_seguimiento text,
  fecha_resolucion date,
  revision integer DEFAULT 0 NOT NULL,
  modificado_en timestamp with time zone,
  modificado_por uuid
);
CREATE TABLE public.fichas_nutricion (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  altura numeric,
  peso numeric,
  alerta_peso boolean DEFAULT false,
  detalle text,
  drive_url text,
  creado_por uuid,
  fecha date,
  descripcion text,
  link_informe text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.fichas_psicologicas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  fecha date,
  descripcion text,
  link_informe text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.historial_categorias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  categoria_anterior_id uuid,
  categoria_nueva_id uuid,
  fecha date DEFAULT CURRENT_DATE,
  temporada text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.jugador_representantes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jugador_id uuid NOT NULL,
  representante_id uuid NOT NULL,
  fecha_inicio date DEFAULT CURRENT_DATE NOT NULL,
  fecha_fin date,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.jugadores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  apellido text NOT NULL,
  foto_url text,
  categoria_id uuid NOT NULL,
  fecha_nacimiento date,
  posicion text,
  estado text DEFAULT 'disponible'::text NOT NULL,
  estado_detalle text,
  pie_habil text,
  contacto_emergencia_nombre text,
  telefono_emergencia text,
  tambien_reserva boolean DEFAULT false,
  nro_documento text,
  nacionalidad text DEFAULT 'Argentina'::text,
  lugar_nacimiento text,
  pasaporte_comunitario boolean DEFAULT false,
  obra_social text,
  nro_afiliado text,
  posicion_secundaria text,
  video_promocional text,
  fecha_inicio_contrato date,
  fecha_fin_contrato date,
  pension_id uuid,
  costo_pension text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.partidos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  categoria_id uuid NOT NULL,
  rival text NOT NULL,
  fecha date NOT NULL,
  hora time without time zone,
  lugar text,
  local_visitante text,
  resultado text,
  formacion text,
  escudo_url text,
  equipo_id uuid,
  link text,
  created_at timestamp with time zone DEFAULT now(),
  numero_fecha text,
  goles_local integer,
  goles_visitante integer,
  penales_favor integer,
  penales_contra integer,
  video_partido_completo text,
  video_resumen text,
  video_analisis_propio text,
  video_analisis_rival text,
  informe_pdf_url text,
  video_pelota_parada text,
  video_gps text,
  video_charla_dt text,
  video_arenga text,
  video_resumen_vigilancias text,
  descripcion_post text,
  destacados_rival text
);
CREATE TABLE public.pensiones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.perfiles (
  email text NOT NULL,
  nombre text,
  rol text NOT NULL,
  categoria_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  foto_url text,
  cargo_pdf text,
  aparece_en_pdf boolean DEFAULT false,
  orden_pdf bigint
);
CREATE TABLE public.planificacion_sesiones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  categoria_id uuid NOT NULL,
  fecha date NOT NULL,
  hora time without time zone,
  tipo text DEFAULT 'entrenamiento'::text NOT NULL,
  estado text DEFAULT 'borrador'::text NOT NULL,
  lugar text DEFAULT ''::text NOT NULL,
  objetivo text DEFAULT ''::text NOT NULL,
  responsable text DEFAULT ''::text NOT NULL,
  observaciones_internas text DEFAULT ''::text NOT NULL,
  bloques jsonb DEFAULT '[]'::jsonb NOT NULL,
  entrenamiento_real_id uuid,
  revision integer DEFAULT 1 NOT NULL,
  creado_por uuid,
  actualizado_por uuid,
  creado_at timestamp with time zone DEFAULT now() NOT NULL,
  actualizado_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.representantes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  telefono text,
  email text,
  notas text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.sesiones_fisicas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha date NOT NULL,
  jugador_id uuid NOT NULL,
  tipo text NOT NULL,
  partido_id uuid,
  distancia_total_m numeric,
  distancia_alta_intensidad_m numeric,
  sprints integer,
  velocidad_maxima_kmh numeric,
  player_load numeric,
  minutos integer,
  rpe smallint,
  created_at timestamp with time zone DEFAULT now(),
  observaciones text
);
CREATE TABLE public.usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_id uuid,
  nombre text NOT NULL,
  email text NOT NULL,
  rol text NOT NULL,
  categoria_id uuid,
  area text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.videos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tipo text NOT NULL,
  fecha date,
  descripcion text,
  categoria_id uuid,
  jugador_id uuid,
  url text,
  partido_id uuid,
  contenido text,
  cantidad_jugadores integer,
  momento text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE seguridad_privado.respaldo_acl (
  paso text NOT NULL,
  objeto text NOT NULL,
  tipo text NOT NULL,
  acl aclitem[],
  guardado_en timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE seguridad_privado.respaldo_paso_b (
  orden integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tipo text NOT NULL,
  objeto text NOT NULL,
  detalle text,
  acl aclitem[],
  opciones text[],
  guardado_en timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE analisis_privado.respaldo_permisos_20261101 ADD CONSTRAINT respaldo_permisos_20261101_pkey PRIMARY KEY (orden);
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_periodo_check CHECK ((periodo = ANY (ARRAY[1, 2])));
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_referencia_tactica_valida CHECK ((((sistema_coordenadas IS NULL) AND (direccion_captura IS NULL) AND (periodo_captura IS NULL)) OR ((sistema_coordenadas IS NOT NULL) AND (sistema_coordenadas = 'visual_v1'::text) AND (direccion_captura IS NOT NULL) AND (direccion_captura = ANY (ARRAY['derecha'::text, 'izquierda'::text])) AND (periodo_captura IS NOT NULL) AND (periodo_captura = ANY (ARRAY[1, 2])))));
ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_pkey PRIMARY KEY (id);
ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_direccion_primer_tiempo_check CHECK ((direccion_primer_tiempo = ANY (ARRAY['derecha'::text, 'izquierda'::text])));
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT analisis_pases_detalle_pkey PRIMARY KEY (evento_id);
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_destinataria_check CHECK ((((destinataria_estado = 'identificada'::text) AND (destinataria_id IS NOT NULL)) OR ((destinataria_estado <> 'identificada'::text) AND (destinataria_id IS NULL))));
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_destino_check CHECK ((((destino_x IS NULL) AND (destino_y IS NULL)) OR ((destino_x IS NOT NULL) AND (destino_y IS NOT NULL) AND ((destino_x >= (0)::double precision) AND (destino_x <= (100)::double precision)) AND ((destino_y >= (0)::double precision) AND (destino_y <= (100)::double precision)))));
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_estado_check CHECK ((destinataria_estado = ANY (ARRAY['pendiente'::text, 'identificada'::text, 'desconocida'::text, 'no_observable'::text])));
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_revision_check CHECK ((revision >= 1));
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_version_check CHECK ((version_formato = 1));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_pkey PRIMARY KEY (codigo);
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_atajo_check CHECK ((atajo ~ '^[a-y]$'::text));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_codigo_check CHECK (((char_length(codigo) >= 1) AND (char_length(codigo) <= 60)));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_color_check CHECK ((color = ANY (ARRAY['acento'::text, 'exito'::text, 'peligro'::text, 'alerta'::text, 'info'::text, 'neutro'::text])));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_etiqueta_boton_check CHECK (((char_length(btrim(etiqueta_boton)) >= 1) AND (char_length(btrim(etiqueta_boton)) <= 16)));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_etiqueta_check CHECK (((char_length(btrim(etiqueta)) >= 1) AND (char_length(btrim(etiqueta)) <= 40)));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_grupo_check CHECK ((grupo = ANY (ARRAY['ofensiva'::text, 'defensiva'::text, 'arquera'::text, 'pelota_parada'::text, 'otras'::text])));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_icono_check CHECK (((icono IS NULL) OR (char_length(icono) <= 2)));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_resultado_implicito_check CHECK ((resultado_implicito = ANY (ARRAY['Exitoso'::text, 'Fallido'::text, 'Neutro'::text, 'Gol'::text, 'Atajada'::text, 'Fuera'::text, 'Bloqueado'::text])));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_resultados_check CHECK ((resultados <@ ARRAY['Exitoso'::text, 'Fallido'::text, 'Neutro'::text, 'Gol'::text, 'Atajada'::text, 'Fuera'::text, 'Bloqueado'::text]));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT analisis_tipos_accion_ubicacion_check CHECK ((ubicacion = ANY (ARRAY['obligatoria'::text, 'opcional'::text])));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_pase_v1 CHECK ((es_pase = (codigo = ANY (ARRAY['Pase correcto'::text, 'Pase incorrecto'::text]))));
ALTER TABLE public.analisis_tipos_accion ADD CONSTRAINT tipos_resultado_fijo_o_opciones CHECK (((resultado_implicito IS NULL) OR (cardinality(resultados) = 0)));
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_pkey PRIMARY KEY (id);
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_fecha_jugador_id_key UNIQUE (fecha, jugador_id);
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_estado_check CHECK ((estado = ANY (ARRAY['presente'::text, 'tarde'::text, 'ausente'::text, 'lesionado'::text, 'enfermo'::text])));
ALTER TABLE public.biblioteca ADD CONSTRAINT biblioteca_pkey PRIMARY KEY (id);
ALTER TABLE public.biblioteca ADD CONSTRAINT biblioteca_pizarra_revision_check CHECK ((pizarra_revision >= 0));
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_pkey PRIMARY KEY (id);
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_fecha_jugador_id_key UNIQUE (fecha, jugador_id);
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_dolor_muscular_check CHECK (((dolor_muscular >= 1) AND (dolor_muscular <= 5)));
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_estres_check CHECK (((estres >= 1) AND (estres <= 5)));
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_fatiga_check CHECK (((fatiga >= 1) AND (fatiga <= 5)));
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_sueno_check CHECK (((sueno >= 1) AND (sueno <= 5)));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_pkey PRIMARY KEY (id);
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_estado_check CHECK ((estado = ANY (ARRAY['en_prueba'::text, 'aceptado'::text, 'rechazado'::text])));
ALTER TABLE public.categorias ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.citaciones ADD CONSTRAINT citaciones_pkey PRIMARY KEY (id);
ALTER TABLE public.citaciones ADD CONSTRAINT citaciones_partido_id_jugador_id_key UNIQUE (partido_id, jugador_id);
ALTER TABLE public.cmj ADD CONSTRAINT cmj_pkey PRIMARY KEY (id);
ALTER TABLE public.cmj ADD CONSTRAINT cmj_fecha_jugador_id_key UNIQUE (fecha, jugador_id);
ALTER TABLE public.convocatorias_seleccion ADD CONSTRAINT convocatorias_seleccion_pkey PRIMARY KEY (id);
ALTER TABLE public.datafem_tablas ADD CONSTRAINT datafem_tablas_pkey PRIMARY KEY (id);
ALTER TABLE public.datafem_tablas ADD CONSTRAINT datafem_tablas_id_check CHECK ((id = 1));
ALTER TABLE public.entrenamiento_bloques ADD CONSTRAINT entrenamiento_bloques_pkey PRIMARY KEY (id);
ALTER TABLE public.entrenamientos ADD CONSTRAINT entrenamientos_pkey PRIMARY KEY (id);
ALTER TABLE public.equipos ADD CONSTRAINT equipos_pkey PRIMARY KEY (id);
ALTER TABLE public.estadisticas_jugador ADD CONSTRAINT estadisticas_jugador_pkey PRIMARY KEY (id);
ALTER TABLE public.evaluacion_criterios ADD CONSTRAINT evaluacion_criterios_pkey PRIMARY KEY (id);
ALTER TABLE public.evaluaciones ADD CONSTRAINT evaluaciones_pkey PRIMARY KEY (id);
ALTER TABLE public.evaluaciones ADD CONSTRAINT evaluaciones_jugador_id_evaluador_id_periodo_key UNIQUE (jugador_id, evaluador_id, periodo);
ALTER TABLE public.evaluaciones ADD CONSTRAINT evaluaciones_tipo_check CHECK ((tipo = ANY (ARRAY['periodica'::text, 'final'::text])));
ALTER TABLE public.fichas_medicas ADD CONSTRAINT fichas_medicas_pkey PRIMARY KEY (id);
ALTER TABLE public.fichas_medicas ADD CONSTRAINT ficha_mapa_coherente CHECK ((((zona_corporal IS NULL) AND (lateralidad IS NULL) AND (tipo_incidencia IS NULL) AND (estado_seguimiento IS NULL) AND (fecha_resolucion IS NULL)) OR ((zona_corporal IS NOT NULL) AND (lateralidad IS NOT NULL) AND (tipo_incidencia IS NOT NULL) AND (estado_seguimiento IS NOT NULL) AND (zona_corporal = ANY (ARRAY['cuello'::text, 'hombro'::text, 'brazo'::text, 'codo'::text, 'antebrazo'::text, 'mano'::text, 'pecho'::text, 'abdomen'::text, 'espalda_alta'::text, 'lumbar'::text, 'gluteo'::text, 'cadera'::text, 'aductor'::text, 'cuadriceps'::text, 'isquiotibial'::text, 'rodilla'::text, 'pantorrilla'::text, 'tobillo'::text, 'pie'::text])) AND (((zona_corporal = ANY (ARRAY['cuello'::text, 'pecho'::text, 'abdomen'::text, 'espalda_alta'::text, 'lumbar'::text])) AND (lateralidad = 'central'::text)) OR ((zona_corporal <> ALL (ARRAY['cuello'::text, 'pecho'::text, 'abdomen'::text, 'espalda_alta'::text, 'lumbar'::text])) AND (lateralidad = ANY (ARRAY['derecha'::text, 'izquierda'::text, 'ambos'::text])))) AND (tipo_incidencia = ANY (ARRAY['molestia'::text, 'lesion_informada'::text])) AND (estado_seguimiento = ANY (ARRAY['seguimiento'::text, 'derivada'::text, 'resuelta'::text])) AND (fecha IS NOT NULL) AND (recuperado IS NOT NULL) AND (((estado_seguimiento = 'resuelta'::text) AND recuperado AND (fecha_resolucion IS NOT NULL) AND (fecha_resolucion >= fecha)) OR ((estado_seguimiento <> 'resuelta'::text) AND (NOT recuperado) AND (fecha_resolucion IS NULL))))));
ALTER TABLE public.fichas_medicas ADD CONSTRAINT ficha_revision_valida CHECK ((revision >= 0));
ALTER TABLE public.fichas_nutricion ADD CONSTRAINT fichas_nutricion_pkey PRIMARY KEY (id);
ALTER TABLE public.fichas_psicologicas ADD CONSTRAINT fichas_psicologicas_pkey PRIMARY KEY (id);
ALTER TABLE public.historial_categorias ADD CONSTRAINT historial_categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.jugador_representantes ADD CONSTRAINT jugador_representantes_pkey PRIMARY KEY (id);
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_pkey PRIMARY KEY (id);
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_costo_pension_check CHECK (((costo_pension IS NULL) OR (costo_pension = ANY (ARRAY['club'::text, 'compartido'::text]))));
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_estado_check CHECK ((estado = ANY (ARRAY['disponible'::text, 'lesionado'::text, 'suspendido'::text, 'no_disponible'::text])));
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_pie_habil_check CHECK ((pie_habil = ANY (ARRAY['derecho'::text, 'izquierdo'::text, 'ambidiestro'::text])));
ALTER TABLE public.partidos ADD CONSTRAINT partidos_pkey PRIMARY KEY (id);
ALTER TABLE public.partidos ADD CONSTRAINT partidos_local_visitante_check CHECK ((local_visitante = ANY (ARRAY['local'::text, 'visitante'::text])));
ALTER TABLE public.pensiones ADD CONSTRAINT pensiones_pkey PRIMARY KEY (id);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_pkey PRIMARY KEY (email);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_rol_check CHECK ((rol = ANY (ARRAY['coordinacion'::text, 'medico'::text, 'tecnico'::text, 'preparador_fisico'::text])));
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_pkey PRIMARY KEY (id);
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_bloques_check CHECK ((jsonb_typeof(bloques) = 'array'::text));
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicado'::text])));
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_revision_check CHECK ((revision > 0));
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_tipo_check CHECK ((tipo = ANY (ARRAY['entrenamiento'::text, 'descanso'::text, 'partido'::text])));
ALTER TABLE public.representantes ADD CONSTRAINT representantes_pkey PRIMARY KEY (id);
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_pkey PRIMARY KEY (id);
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_fecha_jugador_id_tipo_key UNIQUE (fecha, jugador_id, tipo);
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_rpe_check CHECK (((rpe >= 1) AND (rpe <= 10)));
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_tipo_check CHECK ((tipo = ANY (ARRAY['partido'::text, 'entrenamiento'::text])));
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check CHECK ((rol = ANY (ARRAY['coordinacion'::text, 'cuerpo_tecnico'::text, 'area'::text])));
ALTER TABLE public.videos ADD CONSTRAINT videos_pkey PRIMARY KEY (id);
ALTER TABLE seguridad_privado.respaldo_acl ADD CONSTRAINT respaldo_acl_pkey PRIMARY KEY (paso, objeto);
ALTER TABLE seguridad_privado.respaldo_paso_b ADD CONSTRAINT respaldo_paso_b_pkey PRIMARY KEY (orden);
ALTER TABLE seguridad_privado.respaldo_paso_b ADD CONSTRAINT respaldo_paso_b_tipo_check CHECK ((tipo = ANY (ARRAY['relacion'::text, 'columna'::text, 'funcion'::text, 'politica'::text, 'privilegio_defecto'::text, 'opciones_vista'::text])));
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES analisis_partidos(id) ON DELETE CASCADE;
ALTER TABLE public.analisis_eventos ADD CONSTRAINT analisis_eventos_tipo_fk FOREIGN KEY (tipo) REFERENCES analisis_tipos_accion(codigo) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.analisis_partidos ADD CONSTRAINT analisis_partidos_partido_calendario_id_fkey FOREIGN KEY (partido_calendario_id) REFERENCES partidos(id) ON DELETE SET NULL;
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_destinataria_fk FOREIGN KEY (destinataria_id) REFERENCES jugadores(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.analisis_pases_detalle ADD CONSTRAINT pases_detalle_evento_fk FOREIGN KEY (evento_id) REFERENCES analisis_eventos(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.bienestar ADD CONSTRAINT bienestar_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_categoria_probada_id_fkey FOREIGN KEY (categoria_probada_id) REFERENCES categorias(id);
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.citaciones ADD CONSTRAINT citaciones_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.citaciones ADD CONSTRAINT citaciones_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES partidos(id);
ALTER TABLE public.cmj ADD CONSTRAINT cmj_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.convocatorias_seleccion ADD CONSTRAINT convocatorias_seleccion_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.entrenamiento_bloques ADD CONSTRAINT entrenamiento_bloques_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.estadisticas_jugador ADD CONSTRAINT estadisticas_jugador_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.estadisticas_jugador ADD CONSTRAINT estadisticas_jugador_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES partidos(id);
ALTER TABLE public.evaluaciones ADD CONSTRAINT evaluaciones_evaluador_id_fkey FOREIGN KEY (evaluador_id) REFERENCES auth.users(id);
ALTER TABLE public.evaluaciones ADD CONSTRAINT evaluaciones_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.fichas_medicas ADD CONSTRAINT fichas_medicas_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.fichas_nutricion ADD CONSTRAINT fichas_nutricion_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuarios(id);
ALTER TABLE public.fichas_nutricion ADD CONSTRAINT fichas_nutricion_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.fichas_psicologicas ADD CONSTRAINT fichas_psicologicas_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.historial_categorias ADD CONSTRAINT historial_categorias_categoria_anterior_id_fkey FOREIGN KEY (categoria_anterior_id) REFERENCES categorias(id);
ALTER TABLE public.historial_categorias ADD CONSTRAINT historial_categorias_categoria_nueva_id_fkey FOREIGN KEY (categoria_nueva_id) REFERENCES categorias(id);
ALTER TABLE public.historial_categorias ADD CONSTRAINT historial_categorias_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.jugador_representantes ADD CONSTRAINT jugador_representantes_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.jugador_representantes ADD CONSTRAINT jugador_representantes_representante_id_fkey FOREIGN KEY (representante_id) REFERENCES representantes(id) ON DELETE CASCADE;
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.jugadores ADD CONSTRAINT jugadores_pension_id_fkey FOREIGN KEY (pension_id) REFERENCES pensiones(id);
ALTER TABLE public.partidos ADD CONSTRAINT partidos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.partidos ADD CONSTRAINT partidos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES equipos(id);
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT;
ALTER TABLE public.planificacion_sesiones ADD CONSTRAINT planificacion_sesiones_entrenamiento_real_id_fkey FOREIGN KEY (entrenamiento_real_id) REFERENCES entrenamiento_bloques(id) ON DELETE SET NULL;
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id) ON DELETE CASCADE;
ALTER TABLE public.sesiones_fisicas ADD CONSTRAINT sesiones_fisicas_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE SET NULL;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id);
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.videos ADD CONSTRAINT videos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
ALTER TABLE public.videos ADD CONSTRAINT videos_jugador_id_fkey FOREIGN KEY (jugador_id) REFERENCES jugadores(id);
ALTER TABLE public.videos ADD CONSTRAINT videos_partido_id_fkey FOREIGN KEY (partido_id) REFERENCES partidos(id);
ALTER TABLE public.analisis_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_pases_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_pases_detalle FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_tipos_accion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analisis_tipos_accion FORCE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biblioteca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bienestar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cmj ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convocatorias_seleccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datafem_tablas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrenamiento_bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrenamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estadisticas_jugador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluacion_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_medicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_nutricion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_psicologicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugador_representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pensiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planificacion_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planificacion_sesiones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_fisicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguridad_privado.respaldo_acl ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN public.analisis_eventos.sistema_coordenadas IS 'NULL: referencia histórica no verificada; visual_v1: X/Y fijos en pantalla, referencia táctica capturada por evento';
COMMENT ON COLUMN public.analisis_pases_detalle.destino_x IS 'Final observado, X porcentual [0,100], misma referencia que el origen. No invertir por periodo.';
COMMENT ON COLUMN public.analisis_pases_detalle.destino_y IS 'Final observado, Y porcentual [0,100], misma referencia que el origen. NULL junto con destino_x.';
COMMENT ON COLUMN public.fichas_medicas.zona_corporal IS 'NULL conserva registros anteriores sin inferir anatomía. Lateralidad anatómica de la jugadora.';
COMMENT ON COLUMN public.fichas_medicas.tipo_incidencia IS 'Molestia o lesión informada: no es un diagnóstico ni una autorización deportiva.';
COMMENT ON COLUMN public.fichas_medicas.revision IS 'Actualizar filtrando por id y revisión leída. Cero filas indica conflicto o falta de permisos.';
COMMENT ON TABLE public.planificacion_sesiones IS 'Plan previsto flexible. JSON ordenado de bloques/tareas; privado para staff autorizado. No crea datos de asistencia, RPE ni carga real.';


-- ====================================================================================================
-- Índices (los que no salen de una clave primaria o única)
-- (e3: 11 sentencias)
-- ====================================================================================================

CREATE INDEX idx_analisis_eventos_partido ON public.analisis_eventos USING btree (partido_id);
CREATE INDEX idx_analisis_partidos_categoria ON public.analisis_partidos USING btree (categoria_id);
CREATE INDEX pases_detalle_destinataria_idx ON public.analisis_pases_detalle USING btree (destinataria_id) WHERE (destinataria_id IS NOT NULL);
CREATE UNIQUE INDEX analisis_tipos_accion_atajo_unico ON public.analisis_tipos_accion USING btree (atajo) WHERE (atajo IS NOT NULL);
CREATE INDEX idx_cmj_jugador ON public.cmj USING btree (jugador_id);
CREATE INDEX idx_entrenamiento_bloques_fecha_categoria ON public.entrenamiento_bloques USING btree (categoria_id, fecha);
CREATE INDEX evaluaciones_jugador_idx ON public.evaluaciones USING btree (jugador_id);
CREATE INDEX evaluaciones_periodo_idx ON public.evaluaciones USING btree (periodo);
CREATE INDEX fichas_medicas_jugadora_zona_fecha ON public.fichas_medicas USING btree (jugador_id, zona_corporal, fecha DESC);
CREATE INDEX planificacion_categoria_fecha_idx ON public.planificacion_sesiones USING btree (categoria_id, fecha);
CREATE INDEX planificacion_entrenamiento_real_idx ON public.planificacion_sesiones USING btree (entrenamiento_real_id) WHERE (entrenamiento_real_id IS NOT NULL);


-- ====================================================================================================
-- Funciones y procedimientos
-- (e5: 36 sentencias)
-- ====================================================================================================

CREATE OR REPLACE FUNCTION analisis_privado.proteger_borrado_partido_vinculado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF EXISTS (SELECT 1 FROM public.analisis_partidos a WHERE a.partido_calendario_id=OLD.id)
    AND NOT public.puede_administrar_analisis() THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Solo los dos administradores de Análisis pueden eliminar un partido vinculado.';
 END IF;
 RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION analisis_privado.proteger_cliente_antiguo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND NEW.partido_id IS NOT DISTINCT FROM OLD.partido_id THEN RETURN NEW; END IF;
 -- Barrera global de protocolo en operaciones destructivas: no depende de un
 -- análisis que pudiera crearse entre requests de un cliente antiguo.
 IF OLD.partido_id IS NOT NULL
    AND coalesce(current_setting('club.borrado_partido',true),'') <> OLD.partido_id::text
    AND coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-client-info' IS DISTINCT FROM 'club-comunicaciones/permisos-analisis-v2' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Versión antigua: operación rechazada antes de modificar datos vinculados. Actualizá la aplicación.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION analisis_privado.proteger_evento_con_detalle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_destinataria uuid;
BEGIN
    IF NEW.tipo IS NOT DISTINCT FROM OLD.tipo
       AND NEW.jugador_id IS NOT DISTINCT FROM OLD.jugador_id THEN
        RETURN NEW;
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '0A000',
            MESSAGE = 'Corregir tipo o autora requiere aislamiento READ COMMITTED.';
    END IF;
    SELECT d.destinataria_id INTO v_destinataria
    FROM public.analisis_pases_detalle d WHERE d.evento_id = OLD.id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF NEW.tipo IS NULL OR NEW.tipo NOT IN ('Pase correcto', 'Pase incorrecto') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'La accion tiene detalle de pase y no puede cambiar a otro tipo.',
            HINT = 'La reclasificacion requiere resolver explicitamente el detalle.';
    END IF;
    IF v_destinataria IS NOT NULL AND NEW.jugador_id = v_destinataria THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'La nueva autora coincide con la destinataria del pase.',
            HINT = 'Corregi primero la destinataria y despues la autora.';
    END IF;
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION medicos_privado.validar_ficha_corporal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION pizarra_privado.auditar_biblioteca()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN
  NEW.pizarra:=pizarra_privado.validar(NEW.pizarra);
  IF NEW.pizarra_miniatura<>'' AND (length(NEW.pizarra_miniatura)>600000 OR NEW.pizarra_miniatura !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') THEN
    RAISE EXCEPTION 'Miniatura inválida' USING ERRCODE='22023';
  END IF;
  NEW.pizarra_revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.pizarra_revision+1 END;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION pizarra_privado.validar(d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION planificacion_privado.auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION planificacion_privado.autorizado(p_categoria uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.perfiles p JOIN auth.users u ON lower(p.email) = lower(u.email)
    WHERE u.id = auth.uid() AND (
      p.rol = 'coordinacion' OR
      (p.rol IN ('tecnico', 'preparador_fisico') AND p.categoria_id = p_categoria)
    )
  );
$function$;
CREATE OR REPLACE FUNCTION planificacion_privado.bloques_publicos(p_bloques jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(proyectado ORDER BY posicion) FILTER (WHERE proyectado IS NOT NULL),'[]'::jsonb)
  FROM (SELECT planificacion_privado.item_publico(value,true) proyectado,ordinality posicion
    FROM jsonb_array_elements(p_bloques) WITH ORDINALITY) b;
$function$;
CREATE OR REPLACE FUNCTION planificacion_privado.item_publico(p_item jsonb, p_bloque boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION planificacion_privado.item_valido(p_item jsonb, p_bloque boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.categoria_de_jugador(jid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select categoria_id from jugadores where id = jid
$function$;
CREATE OR REPLACE FUNCTION public.categoria_de_partido(pid uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select categoria_id from partidos where id = pid
$function$;
CREATE OR REPLACE FUNCTION public.copiar_planificacion_semana(p_categoria_id uuid, p_origen date, p_destino date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.eliminar_partido_deportivo_seguro(p_partido_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Se requiere una sesión autenticada.';
 END IF;
 SELECT p.id INTO v_id FROM public.partidos p WHERE p.id=p_partido_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Partido no disponible para eliminar.'; END IF;
 PERFORM set_config('club.borrado_partido',p_partido_id::text,true);
 DELETE FROM public.citaciones WHERE partido_id=p_partido_id;
 DELETE FROM public.estadisticas_jugador WHERE partido_id=p_partido_id;
 UPDATE public.videos SET partido_id=NULL WHERE partido_id=p_partido_id;
 DELETE FROM public.partidos WHERE id=p_partido_id RETURNING id INTO v_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='El permiso de eliminación no está disponible.'; END IF;
 RETURN v_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.eliminar_planificacion_sesion(p_id uuid, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE anterior public.planificacion_sesiones;
BEGIN
  SELECT * INTO anterior FROM public.planificacion_sesiones WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La sesión ya no existe' USING ERRCODE = '40001'; END IF;
  IF NOT planificacion_privado.autorizado(anterior.categoria_id) THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501'; END IF;
  IF p_revision IS NULL OR p_revision <> anterior.revision THEN RAISE EXCEPTION 'La sesión cambió' USING ERRCODE = '40001'; END IF;
  DELETE FROM public.planificacion_sesiones WHERE id=p_id;
END $function$;
CREATE OR REPLACE FUNCTION public.evaluaciones_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.guardar_destino_pase(p_evento_id uuid, p_destino_x double precision, p_destino_y double precision, p_revision_esperada bigint)
 RETURNS analisis_pases_detalle
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_usuario uuid := auth.uid();
    v_tipo text;
    v_detalle public.analisis_pases_detalle%ROWTYPE;
    v_existe boolean;
    v_ahora timestamptz;
BEGIN
    IF NOT public.puede_administrar_analisis() THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'No tenes autorizacion para guardar destinos de pases.';
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '0A000',
            MESSAGE = 'Guardar destinos requiere aislamiento READ COMMITTED.';
    END IF;
    IF p_evento_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Debes indicar una accion.';
    END IF;
    IF (p_destino_x IS NULL) <> (p_destino_y IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'El destino requiere ambas coordenadas o ambas NULL.';
    END IF;
    -- BETWEEN rechaza tambien NaN e infinitos en PostgreSQL.
    IF p_destino_x IS NOT NULL AND (
        NOT (p_destino_x BETWEEN 0 AND 100)
        OR NOT (p_destino_y BETWEEN 0 AND 100)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Las coordenadas de destino deben estar entre 0 y 100.';
    END IF;
    IF p_revision_esperada IS NOT NULL AND p_revision_esperada < 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Revision esperada invalida.';
    END IF;

    -- Mismo orden que guardar_detalle_pase y borrado en cascada: evento -> detalle.
    SELECT e.tipo INTO v_tipo FROM public.analisis_eventos e
    WHERE e.id = p_evento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'La accion ya no existe.';
    END IF;
    IF v_tipo IS NULL OR v_tipo NOT IN ('Pase correcto', 'Pase incorrecto') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La accion debe ser un pase.';
    END IF;

    SELECT d.* INTO v_detalle FROM public.analisis_pases_detalle d
    WHERE d.evento_id = p_evento_id FOR UPDATE;
    v_existe := FOUND;
    IF p_revision_esperada IS NULL THEN
        IF v_existe THEN
            RAISE EXCEPTION USING ERRCODE = '40001',
                MESSAGE = 'El detalle ya existe. Recarga su revision antes de guardar.';
        END IF;
        IF p_destino_x IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'No existe un detalle con destino para quitar.';
        END IF;
    ELSE
        IF NOT v_existe OR v_detalle.revision <> p_revision_esperada THEN
            RAISE EXCEPTION USING ERRCODE = '40001',
                MESSAGE = 'El detalle cambio o ya no existe. Recarga antes de guardar.';
        END IF;
    END IF;
    v_ahora := clock_timestamp();
    IF NOT v_existe THEN
        INSERT INTO public.analisis_pases_detalle (
            evento_id, destinataria_estado, destinataria_id, version_formato, revision,
            destino_x, destino_y, creado_en, actualizado_en, creado_por, actualizado_por
        ) VALUES (
            p_evento_id, 'pendiente', NULL, 1, 1,
            p_destino_x, p_destino_y, v_ahora, v_ahora, v_usuario, v_usuario
        ) RETURNING * INTO v_detalle;
    ELSE
        -- No se toca destinataria, origen, tipo, periodo, segundo ni version.
        UPDATE public.analisis_pases_detalle d SET
            destino_x = p_destino_x,
            destino_y = p_destino_y,
            revision = d.revision + 1,
            actualizado_en = v_ahora,
            actualizado_por = v_usuario
        WHERE d.evento_id = p_evento_id RETURNING d.* INTO v_detalle;
    END IF;
    RETURN v_detalle;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guardar_detalle_pase(p_evento_id uuid, p_destinataria_estado text, p_destinataria_id uuid, p_revision_esperada bigint)
 RETURNS analisis_pases_detalle
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_usuario uuid := auth.uid();
    v_evento public.analisis_eventos%ROWTYPE;
    v_detalle public.analisis_pases_detalle%ROWTYPE;
    v_existe boolean;
    v_ahora timestamptz;
BEGIN
    IF NOT public.puede_administrar_analisis() THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'No tenes autorizacion para editar detalles de pases.';
    END IF;
    -- Las lecturas internas del trigger dependen de snapshots frescos.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE = '0A000',
            MESSAGE = 'Guardar detalles requiere aislamiento READ COMMITTED.';
    END IF;
    IF p_evento_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Debes indicar una accion.';
    END IF;
    IF p_destinataria_estado IS NULL OR p_destinataria_estado NOT IN (
        'pendiente', 'identificada', 'desconocida', 'no_observable'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estado de destinataria invalido.';
    END IF;
    IF (p_destinataria_estado = 'identificada' AND p_destinataria_id IS NULL)
       OR (p_destinataria_estado <> 'identificada' AND p_destinataria_id IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'La destinataria y su estado son incompatibles.';
    END IF;
    IF p_revision_esperada IS NOT NULL AND p_revision_esperada < 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Revision esperada invalida.';
    END IF;

    -- Siempre evento -> detalle. Nunca detalle -> evento.
    SELECT e.* INTO v_evento FROM public.analisis_eventos e
    WHERE e.id = p_evento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'La accion ya no existe.';
    END IF;
    IF v_evento.tipo IS NULL OR v_evento.tipo NOT IN ('Pase correcto', 'Pase incorrecto') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Solo los pases pueden tener este detalle.';
    END IF;
    IF p_destinataria_id IS NOT NULL THEN
        IF p_destinataria_id = v_evento.jugador_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'La destinataria no puede ser la autora.';
        END IF;
        PERFORM 1 FROM public.jugadores j WHERE j.id = p_destinataria_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'La destinataria no existe.';
        END IF;
    END IF;

    SELECT d.* INTO v_detalle FROM public.analisis_pases_detalle d
    WHERE d.evento_id = p_evento_id FOR UPDATE;
    v_existe := FOUND;
    IF p_revision_esperada IS NULL THEN
        IF v_existe THEN
            RAISE EXCEPTION USING ERRCODE = '40001',
                MESSAGE = 'El detalle ya fue creado. Recargalo antes de guardar.';
        END IF;
    ELSE
        IF NOT v_existe OR v_detalle.revision <> p_revision_esperada THEN
            RAISE EXCEPTION USING ERRCODE = '40001',
                MESSAGE = 'El detalle cambio o ya no existe. Recargalo antes de guardar.';
        END IF;
    END IF;
    v_ahora := clock_timestamp();
    IF NOT v_existe THEN
        INSERT INTO public.analisis_pases_detalle (
            evento_id, destinataria_id, destinataria_estado, version_formato,
            revision, creado_en, actualizado_en, creado_por, actualizado_por
        ) VALUES (
            p_evento_id, p_destinataria_id, p_destinataria_estado, 1,
            1, v_ahora, v_ahora, v_usuario, v_usuario
        ) RETURNING * INTO v_detalle;
    ELSE
        UPDATE public.analisis_pases_detalle d SET
            destinataria_id = p_destinataria_id,
            destinataria_estado = p_destinataria_estado,
            revision = d.revision + 1,
            actualizado_en = v_ahora,
            actualizado_por = v_usuario
        WHERE d.evento_id = p_evento_id RETURNING d.* INTO v_detalle;
    END IF;
    RETURN v_detalle;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guardar_ejercicio_pizarra(p_id uuid, p_revision integer, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.guardar_planificacion_sesion(p_sesion jsonb, p_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.jugador_tambien_reserva(jid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select tambien_reserva from jugadores where id = jid), false)
$function$;
CREATE OR REPLACE FUNCTION public.mi_categoria()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select categoria_id from perfiles where email = auth.jwt() ->> 'email' limit 1
$function$;
CREATE OR REPLACE FUNCTION public.mi_categoria_es_reserva()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select es_reserva from categorias where id = mi_categoria()), false)
$function$;
CREATE OR REPLACE FUNCTION public.mi_rol()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rol::text from perfiles
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.planificacion_publica_hoy(p_categoria_id uuid, p_jugadora_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.puede_administrar_analisis()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(auth.role()='authenticated' AND auth.uid() IN
  ('00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid)
  AND (SELECT count(*) FROM public.perfiles p JOIN auth.users u ON lower(p.email)=lower(u.email) WHERE u.id=auth.uid())=1
  AND EXISTS (SELECT 1 FROM auth.users u JOIN public.perfiles p ON lower(p.email)=lower(u.email)
    WHERE u.id=auth.uid() AND lower(p.rol)='coordinacion'
      AND (u.banned_until IS NULL OR u.banned_until<=now())),false);
$function$;
CREATE OR REPLACE FUNCTION public.puede_evaluar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.mi_rol() = any (array['tecnico','coordinacion','preparador_fisico','medico']),
    false
  );
$function$;
CREATE OR REPLACE FUNCTION public.puede_ver_evaluaciones()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.mi_rol() = any (array['tecnico','coordinacion','preparador_fisico','medico']),
    false
  );
$function$;
CREATE OR REPLACE FUNCTION public.rpe_publico_guardar(p_categoria_id uuid, p_jugadora_id uuid, p_fecha date, p_tipo text, p_rpe integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.sellar_tipo_accion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.validar_referencia_tactica_analisis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.ve_todas_evaluaciones()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.mi_rol() = any (array['coordinacion']), false);
$function$;
CREATE OR REPLACE FUNCTION public.wellness_publico_categoria(p_categoria_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.wellness_publico_guardar(p_categoria_id uuid, p_jugadora_id uuid, p_sueno integer, p_dolor_muscular integer, p_fatiga integer, p_estres integer, p_animo_entrenar integer, p_zona_dolor text DEFAULT NULL::text, p_fase_ciclo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.wellness_publico_respondio(p_categoria_id uuid, p_jugadora_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.bienestar b
    JOIN public.jugadores j ON j.id = b.jugador_id
    WHERE j.id = p_jugadora_id
      AND j.categoria_id = p_categoria_id
      AND b.fecha = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      AND b.sueno IS NOT NULL AND b.dolor_muscular IS NOT NULL AND b.fatiga IS NOT NULL
      AND b.estres IS NOT NULL AND b.animo_entrenar IS NOT NULL);
$function$;


-- ====================================================================================================
-- Vistas
-- (e4: 1 sentencias)
-- ====================================================================================================

CREATE OR REPLACE VIEW public.jugadores_publico WITH (security_invoker=true) AS
 SELECT id,
    nombre,
    apellido,
    foto_url,
    categoria_id
   FROM jugadores;


-- ====================================================================================================
-- Triggers
-- (e6: 11 sentencias)
-- ====================================================================================================

CREATE TRIGGER proteger_evento_con_detalle BEFORE UPDATE OF tipo, jugador_id ON analisis_eventos FOR EACH ROW EXECUTE FUNCTION analisis_privado.proteger_evento_con_detalle();
CREATE TRIGGER validar_referencia_tactica_analisis BEFORE INSERT OR UPDATE ON analisis_eventos FOR EACH ROW EXECUTE FUNCTION validar_referencia_tactica_analisis();
CREATE TRIGGER sellar_tipo_accion BEFORE UPDATE ON analisis_tipos_accion FOR EACH ROW EXECUTE FUNCTION sellar_tipo_accion();
CREATE TRIGGER biblioteca_pizarra BEFORE INSERT OR UPDATE ON biblioteca FOR EACH ROW EXECUTE FUNCTION pizarra_privado.auditar_biblioteca();
CREATE TRIGGER proteger_cliente_antiguo BEFORE DELETE ON citaciones FOR EACH ROW EXECUTE FUNCTION analisis_privado.proteger_cliente_antiguo();
CREATE TRIGGER proteger_cliente_antiguo BEFORE DELETE ON estadisticas_jugador FOR EACH ROW EXECUTE FUNCTION analisis_privado.proteger_cliente_antiguo();
CREATE TRIGGER evaluaciones_updated_at BEFORE UPDATE ON evaluaciones FOR EACH ROW EXECUTE FUNCTION evaluaciones_set_updated_at();
CREATE TRIGGER validar_ficha_corporal BEFORE INSERT OR UPDATE ON fichas_medicas FOR EACH ROW EXECUTE FUNCTION medicos_privado.validar_ficha_corporal();
CREATE TRIGGER proteger_borrado_partido_vinculado BEFORE DELETE ON partidos FOR EACH ROW EXECUTE FUNCTION analisis_privado.proteger_borrado_partido_vinculado();
CREATE TRIGGER planificacion_auditar BEFORE INSERT OR UPDATE ON planificacion_sesiones FOR EACH ROW EXECUTE FUNCTION planificacion_privado.auditar();
CREATE TRIGGER proteger_cliente_antiguo BEFORE DELETE OR UPDATE OF partido_id ON videos FOR EACH ROW EXECUTE FUNCTION analisis_privado.proteger_cliente_antiguo();


-- ====================================================================================================
-- Políticas RLS (esquemas propios y storage)
-- (e7a: 82 sentencias)
-- ====================================================================================================

CREATE POLICY analisis_eventos_delete_admin ON public.analisis_eventos AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY analisis_eventos_insert_admin ON public.analisis_eventos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY analisis_eventos_read ON public.analisis_eventos AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT puede_administrar_analisis() AS puede_administrar_analisis) OR (EXISTS ( SELECT 1
   FROM jugadores j
  WHERE (j.id = analisis_eventos.jugador_id)))));
CREATE POLICY analisis_eventos_update_admin ON public.analisis_eventos AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis)) WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY analisis_partidos_delete_admin ON public.analisis_partidos AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY analisis_partidos_insert_admin ON public.analisis_partidos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY analisis_partidos_read ON public.analisis_partidos AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT puede_administrar_analisis() AS puede_administrar_analisis) OR (EXISTS ( SELECT 1
   FROM analisis_eventos e
  WHERE (e.partido_id = analisis_partidos.id)))));
CREATE POLICY analisis_partidos_update_admin ON public.analisis_partidos AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis)) WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY pases_detalle_lectura ON public.analisis_pases_detalle AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM analisis_eventos e
  WHERE (e.id = analisis_pases_detalle.evento_id))));
CREATE POLICY tipos_accion_alta ON public.analisis_tipos_accion AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY tipos_accion_baja ON public.analisis_tipos_accion AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY tipos_accion_edicion ON public.analisis_tipos_accion AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT puede_administrar_analisis() AS puede_administrar_analisis)) WITH CHECK (( SELECT puede_administrar_analisis() AS puede_administrar_analisis));
CREATE POLICY tipos_accion_lectura ON public.analisis_tipos_accion AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "acceso asistencias" ON public.asistencias AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR (mi_rol() = 'preparador_fisico'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR (mi_rol() = 'preparador_fisico'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria()))));
CREATE POLICY "acceso biblioteca" ON public.biblioteca AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text])));
CREATE POLICY "preparador_fisico ve biblioteca" ON public.biblioteca AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "gestionar bienestar" ON public.bienestar AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id)))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id))));
CREATE POLICY "medico ve bienestar" ON public.bienestar AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'medico'::text));
CREATE POLICY "preparador_fisico gestiona bienestar" ON public.bienestar AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text)) WITH CHECK ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "preparador_fisico ve bienestar" ON public.bienestar AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "gestionar candidatos" ON public.candidatos AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_probada_id = mi_categoria())))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_probada_id = mi_categoria()))));
CREATE POLICY "coordinacion gestiona categorias" ON public.categorias AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = 'coordinacion'::text)) WITH CHECK ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "leer categorias" ON public.categorias AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "acceso citaciones" ON public.citaciones AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_partido(partido_id) = mi_categoria())))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_partido(partido_id) = mi_categoria()))));
CREATE POLICY "preparador_fisico ve citaciones" ON public.citaciones AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "Acceso total usuarios logueados" ON public.cmj AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "acceso convocatorias_seleccion" ON public.convocatorias_seleccion AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id)))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id))));
CREATE POLICY "Usuarios autenticados pueden leer DataFem" ON public.datafem_tablas AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Acceso total usuarios logueados" ON public.entrenamiento_bloques AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "acceso equipos" ON public.equipos AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text])));
CREATE POLICY "preparador_fisico ve equipos" ON public.equipos AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "acceso estadisticas" ON public.estadisticas_jugador AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_partido(partido_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id)))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_partido(partido_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id))));
CREATE POLICY "preparador_fisico ve estadisticas" ON public.estadisticas_jugador AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY criterios_select ON public.evaluacion_criterios AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY criterios_write ON public.evaluacion_criterios AS PERMISSIVE FOR ALL TO authenticated USING (ve_todas_evaluaciones()) WITH CHECK (ve_todas_evaluaciones());
CREATE POLICY evaluaciones_delete ON public.evaluaciones AS PERMISSIVE FOR DELETE TO authenticated USING (((evaluador_id = auth.uid()) OR ve_todas_evaluaciones()));
CREATE POLICY evaluaciones_insert ON public.evaluaciones AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((evaluador_id = auth.uid()) AND puede_evaluar()));
CREATE POLICY evaluaciones_select ON public.evaluaciones AS PERMISSIVE FOR SELECT TO authenticated USING (((evaluador_id = auth.uid()) OR puede_ver_evaluaciones()));
CREATE POLICY evaluaciones_update ON public.evaluaciones AS PERMISSIVE FOR UPDATE TO authenticated USING ((evaluador_id = auth.uid())) WITH CHECK ((evaluador_id = auth.uid()));
CREATE POLICY "acceso ficha medica" ON public.fichas_medicas AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text])));
CREATE POLICY mapa_corporal_pf_actualiza ON public.fichas_medicas AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (mi_rol() = 'preparador_fisico'::text))) WITH CHECK (((auth.uid() IS NOT NULL) AND (mi_rol() = 'preparador_fisico'::text) AND (zona_corporal IS NOT NULL)));
CREATE POLICY mapa_corporal_pf_registra ON public.fichas_medicas AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (mi_rol() = 'preparador_fisico'::text) AND (zona_corporal IS NOT NULL)));
CREATE POLICY mapa_corporal_solo_personal_autorizado ON public.fichas_medicas AS RESTRICTIVE FOR ALL TO authenticated USING (((auth.uid() IS NOT NULL) AND (mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text, 'preparador_fisico'::text])))) WITH CHECK (((auth.uid() IS NOT NULL) AND (mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text, 'preparador_fisico'::text]))));
CREATE POLICY "preparador_fisico ve fichas medicas" ON public.fichas_medicas AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "acceso ficha nutricion" ON public.fichas_nutricion AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text])));
CREATE POLICY "preparador_fisico ve fichas nutricion" ON public.fichas_nutricion AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "acceso ficha psicologica" ON public.fichas_psicologicas AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text])));
CREATE POLICY "coordinacion borra historial categorias" ON public.historial_categorias AS PERMISSIVE FOR DELETE TO PUBLIC USING ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "coordinacion edita historial categorias" ON public.historial_categorias AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((mi_rol() = 'coordinacion'::text)) WITH CHECK ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "coordinacion gestiona historial categorias" ON public.historial_categorias AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "preparador_fisico ve historial categorias" ON public.historial_categorias AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "select historial categorias" ON public.historial_categorias AS PERMISSIVE FOR SELECT TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria()))));
CREATE POLICY "acceso jugador_representantes" ON public.jugador_representantes AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id)))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id))));
CREATE POLICY "delete jugadores" ON public.jugadores AS PERMISSIVE FOR DELETE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "insert jugadores" ON public.jugadores AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "preparador_fisico ve jugadores" ON public.jugadores AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "select jugadores" ON public.jugadores AS PERMISSIVE FOR SELECT TO PUBLIC USING (((mi_rol() = ANY (ARRAY['coordinacion'::text, 'medico'::text])) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(id))));
CREATE POLICY "update jugadores" ON public.jugadores AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria())))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "delete partidos" ON public.partidos AS PERMISSIVE FOR DELETE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "insert partidos" ON public.partidos AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "preparador_fisico ve partidos" ON public.partidos AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "select partidos" ON public.partidos AS PERMISSIVE FOR SELECT TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "update partidos" ON public.partidos AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria())))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_id = mi_categoria()))));
CREATE POLICY "acceso pensiones" ON public.pensiones AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text])));
CREATE POLICY "coordinacion borra perfiles" ON public.perfiles AS PERMISSIVE FOR DELETE TO PUBLIC USING ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "coordinacion edita perfiles" ON public.perfiles AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((mi_rol() = 'coordinacion'::text)) WITH CHECK ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "coordinacion gestiona perfiles" ON public.perfiles AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "coordinacion ve todos los perfiles" ON public.perfiles AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'coordinacion'::text));
CREATE POLICY "ver propio perfil" ON public.perfiles AS PERMISSIVE FOR SELECT TO PUBLIC USING ((email = (auth.jwt() ->> 'email'::text)));
CREATE POLICY planificacion_lectura_staff ON public.planificacion_sesiones AS PERMISSIVE FOR SELECT TO authenticated USING (planificacion_privado.autorizado(categoria_id));
CREATE POLICY "acceso representantes" ON public.representantes AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text]))) WITH CHECK ((mi_rol() = ANY (ARRAY['coordinacion'::text, 'tecnico'::text])));
CREATE POLICY "acceso sesiones_fisicas" ON public.sesiones_fisicas AS PERMISSIVE FOR ALL TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id)))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND (categoria_de_jugador(jugador_id) = mi_categoria())) OR ((mi_rol() = 'tecnico'::text) AND mi_categoria_es_reserva() AND jugador_tambien_reserva(jugador_id))));
CREATE POLICY "preparador_fisico gestiona sesiones fisicas" ON public.sesiones_fisicas AS PERMISSIVE FOR ALL TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text)) WITH CHECK ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "delete videos" ON public.videos AS PERMISSIVE FOR DELETE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND ((categoria_id = mi_categoria()) OR (categoria_de_jugador(jugador_id) = mi_categoria()) OR (categoria_de_partido(partido_id) = mi_categoria()) OR (mi_categoria_es_reserva() AND (jugador_id IS NOT NULL) AND jugador_tambien_reserva(jugador_id))))));
CREATE POLICY "insert videos" ON public.videos AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND ((categoria_id = mi_categoria()) OR (categoria_de_jugador(jugador_id) = mi_categoria()) OR (categoria_de_partido(partido_id) = mi_categoria()) OR (mi_categoria_es_reserva() AND (jugador_id IS NOT NULL) AND jugador_tambien_reserva(jugador_id))))));
CREATE POLICY "preparador_fisico ve videos" ON public.videos AS PERMISSIVE FOR SELECT TO PUBLIC USING ((mi_rol() = 'preparador_fisico'::text));
CREATE POLICY "select videos" ON public.videos AS PERMISSIVE FOR SELECT TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND ((categoria_id = mi_categoria()) OR (categoria_de_jugador(jugador_id) = mi_categoria()) OR (categoria_de_partido(partido_id) = mi_categoria()) OR (mi_categoria_es_reserva() AND (jugador_id IS NOT NULL) AND jugador_tambien_reserva(jugador_id))))));
CREATE POLICY "update videos" ON public.videos AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND ((categoria_id = mi_categoria()) OR (categoria_de_jugador(jugador_id) = mi_categoria()) OR (categoria_de_partido(partido_id) = mi_categoria()) OR (mi_categoria_es_reserva() AND (jugador_id IS NOT NULL) AND jugador_tambien_reserva(jugador_id)))))) WITH CHECK (((mi_rol() = 'coordinacion'::text) OR ((mi_rol() = 'tecnico'::text) AND ((categoria_id = mi_categoria()) OR (categoria_de_jugador(jugador_id) = mi_categoria()) OR (categoria_de_partido(partido_id) = mi_categoria()) OR (mi_categoria_es_reserva() AND (jugador_id IS NOT NULL) AND jugador_tambien_reserva(jugador_id))))));
CREATE POLICY "Biblioteca delete autenticados" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = 'Biblioteca'::text));
CREATE POLICY "Biblioteca insert autenticados" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'Biblioteca'::text));
CREATE POLICY "Biblioteca select autenticados" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'Biblioteca'::text));
CREATE POLICY "Biblioteca update autenticados" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((bucket_id = 'Biblioteca'::text));


-- ====================================================================================================
-- Configuración de los buckets de Storage
-- (e7b: 1 buckets)
-- ====================================================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('Biblioteca', 'Biblioteca', true, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ====================================================================================================
-- Dueños, permisos (GRANT) y privilegios por defecto
-- (e8: 243 sentencias)
-- ====================================================================================================

ALTER SCHEMA public OWNER TO pg_database_owner;
GRANT USAGE ON SCHEMA pizarra_privado TO authenticated;
GRANT USAGE ON SCHEMA planificacion_privado TO authenticated;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL ON TABLE analisis_privado.manifiesto_permisos_20261101 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE analisis_privado.respaldo_permisos_20261101 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE analisis_privado.respaldo_permisos_20261101_orden_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.analisis_eventos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analisis_eventos TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.analisis_eventos TO authenticated;
REVOKE ALL ON TABLE public.analisis_partidos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analisis_partidos TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.analisis_partidos TO authenticated;
REVOKE ALL ON TABLE public.analisis_pases_detalle FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analisis_pases_detalle TO service_role;
GRANT SELECT ON TABLE public.analisis_pases_detalle TO authenticated;
REVOKE ALL ON TABLE public.analisis_tipos_accion FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.analisis_tipos_accion TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.analisis_tipos_accion TO authenticated;
REVOKE ALL ON TABLE public.asistencias FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asistencias TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asistencias TO service_role;
REVOKE ALL ON TABLE public.biblioteca FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.biblioteca TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.biblioteca TO service_role;
REVOKE ALL ON TABLE public.bienestar FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bienestar TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bienestar TO service_role;
REVOKE ALL ON TABLE public.candidatos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.candidatos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.candidatos TO service_role;
REVOKE ALL ON TABLE public.categorias FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categorias TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categorias TO service_role;
REVOKE ALL ON TABLE public.citaciones FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.citaciones TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.citaciones TO service_role;
REVOKE ALL ON TABLE public.cmj FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cmj TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cmj TO service_role;
REVOKE ALL ON TABLE public.convocatorias_seleccion FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.convocatorias_seleccion TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.convocatorias_seleccion TO service_role;
REVOKE ALL ON TABLE public.datafem_tablas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.datafem_tablas TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.datafem_tablas TO service_role;
REVOKE ALL ON TABLE public.entrenamiento_bloques FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entrenamiento_bloques TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entrenamiento_bloques TO service_role;
REVOKE ALL ON TABLE public.entrenamientos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entrenamientos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.entrenamientos TO service_role;
REVOKE ALL ON TABLE public.equipos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.equipos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.equipos TO service_role;
REVOKE ALL ON TABLE public.estadisticas_jugador FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.estadisticas_jugador TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.estadisticas_jugador TO service_role;
REVOKE ALL ON TABLE public.evaluacion_criterios FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evaluacion_criterios TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evaluacion_criterios TO service_role;
REVOKE ALL ON TABLE public.evaluaciones FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evaluaciones TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.evaluaciones TO service_role;
REVOKE ALL ON TABLE public.fichas_medicas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fichas_medicas TO service_role;
GRANT DELETE, INSERT, MAINTAIN, SELECT, UPDATE ON TABLE public.fichas_medicas TO authenticated;
REVOKE ALL ON TABLE public.fichas_nutricion FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fichas_nutricion TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fichas_nutricion TO service_role;
REVOKE ALL ON TABLE public.fichas_psicologicas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fichas_psicologicas TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fichas_psicologicas TO service_role;
REVOKE ALL ON TABLE public.historial_categorias FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.historial_categorias TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.historial_categorias TO service_role;
REVOKE ALL ON TABLE public.jugador_representantes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.jugador_representantes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.jugador_representantes TO service_role;
REVOKE ALL ON TABLE public.jugadores FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.jugadores TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.jugadores TO service_role;
REVOKE ALL ON TABLE public.jugadores_publico FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.jugadores_publico TO service_role;
GRANT MAINTAIN, SELECT ON TABLE public.jugadores_publico TO authenticated;
REVOKE ALL ON TABLE public.partidos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partidos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.partidos TO service_role;
REVOKE ALL ON TABLE public.pensiones FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pensiones TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pensiones TO service_role;
REVOKE ALL ON TABLE public.perfiles FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.perfiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.perfiles TO service_role;
REVOKE ALL ON TABLE public.planificacion_sesiones FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.planificacion_sesiones TO service_role;
GRANT SELECT ON TABLE public.planificacion_sesiones TO authenticated;
REVOKE ALL ON TABLE public.representantes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.representantes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.representantes TO service_role;
REVOKE ALL ON TABLE public.sesiones_fisicas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sesiones_fisicas TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sesiones_fisicas TO service_role;
REVOKE ALL ON TABLE public.usuarios FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.usuarios TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.usuarios TO service_role;
REVOKE ALL ON TABLE public.videos FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.videos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.videos TO service_role;
REVOKE ALL ON TABLE seguridad_privado.respaldo_acl FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE seguridad_privado.respaldo_paso_b FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE seguridad_privado.respaldo_paso_b_orden_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT UPDATE (atajo) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (color) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (etiqueta) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (etiqueta_boton) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (grupo) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (icono) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (orden) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (resultado_implicito) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (resultados) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (ubicacion) ON TABLE public.analisis_tipos_accion TO authenticated;
GRANT UPDATE (visible) ON TABLE public.analisis_tipos_accion TO authenticated;
REVOKE ALL ON ROUTINE analisis_privado.proteger_borrado_partido_vinculado() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE analisis_privado.proteger_cliente_antiguo() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE analisis_privado.proteger_evento_con_detalle() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE medicos_privado.validar_ficha_corporal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE pizarra_privado.auditar_biblioteca() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE pizarra_privado.validar(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE pizarra_privado.validar(jsonb) TO authenticated;
REVOKE ALL ON ROUTINE planificacion_privado.auditar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE planificacion_privado.autorizado(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE planificacion_privado.autorizado(uuid) TO authenticated;
REVOKE ALL ON ROUTINE planificacion_privado.bloques_publicos(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE planificacion_privado.item_publico(jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE planificacion_privado.item_valido(jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ROUTINE public.categoria_de_jugador(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.categoria_de_jugador(uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.categoria_de_jugador(uuid) TO service_role;
REVOKE ALL ON ROUTINE public.categoria_de_partido(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.categoria_de_partido(uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.categoria_de_partido(uuid) TO service_role;
REVOKE ALL ON ROUTINE public.copiar_planificacion_semana(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.copiar_planificacion_semana(uuid, date, date) TO authenticated;
GRANT EXECUTE ON ROUTINE public.copiar_planificacion_semana(uuid, date, date) TO service_role;
REVOKE ALL ON ROUTINE public.eliminar_partido_deportivo_seguro(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.eliminar_partido_deportivo_seguro(uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.eliminar_partido_deportivo_seguro(uuid) TO service_role;
REVOKE ALL ON ROUTINE public.eliminar_planificacion_sesion(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.eliminar_planificacion_sesion(uuid, integer) TO authenticated;
GRANT EXECUTE ON ROUTINE public.eliminar_planificacion_sesion(uuid, integer) TO service_role;
REVOKE ALL ON ROUTINE public.evaluaciones_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.evaluaciones_set_updated_at() TO authenticated;
GRANT EXECUTE ON ROUTINE public.evaluaciones_set_updated_at() TO service_role;
REVOKE ALL ON ROUTINE public.guardar_destino_pase(uuid, double precision, double precision, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.guardar_destino_pase(uuid, double precision, double precision, bigint) TO authenticated;
GRANT EXECUTE ON ROUTINE public.guardar_destino_pase(uuid, double precision, double precision, bigint) TO service_role;
REVOKE ALL ON ROUTINE public.guardar_detalle_pase(uuid, text, uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.guardar_detalle_pase(uuid, text, uuid, bigint) TO authenticated;
GRANT EXECUTE ON ROUTINE public.guardar_detalle_pase(uuid, text, uuid, bigint) TO service_role;
REVOKE ALL ON ROUTINE public.guardar_ejercicio_pizarra(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.guardar_ejercicio_pizarra(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON ROUTINE public.guardar_ejercicio_pizarra(uuid, integer, jsonb) TO service_role;
REVOKE ALL ON ROUTINE public.guardar_planificacion_sesion(jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.guardar_planificacion_sesion(jsonb, integer) TO authenticated;
GRANT EXECUTE ON ROUTINE public.guardar_planificacion_sesion(jsonb, integer) TO service_role;
REVOKE ALL ON ROUTINE public.jugador_tambien_reserva(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.jugador_tambien_reserva(uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.jugador_tambien_reserva(uuid) TO service_role;
REVOKE ALL ON ROUTINE public.mi_categoria() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.mi_categoria() TO authenticated;
GRANT EXECUTE ON ROUTINE public.mi_categoria() TO service_role;
REVOKE ALL ON ROUTINE public.mi_categoria_es_reserva() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.mi_categoria_es_reserva() TO authenticated;
GRANT EXECUTE ON ROUTINE public.mi_categoria_es_reserva() TO service_role;
REVOKE ALL ON ROUTINE public.mi_rol() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.mi_rol() TO authenticated;
GRANT EXECUTE ON ROUTINE public.mi_rol() TO service_role;
REVOKE ALL ON ROUTINE public.planificacion_publica_hoy(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.planificacion_publica_hoy(uuid, uuid) TO anon;
GRANT EXECUTE ON ROUTINE public.planificacion_publica_hoy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.planificacion_publica_hoy(uuid, uuid) TO service_role;
REVOKE ALL ON ROUTINE public.puede_administrar_analisis() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.puede_administrar_analisis() TO authenticated;
GRANT EXECUTE ON ROUTINE public.puede_administrar_analisis() TO service_role;
REVOKE ALL ON ROUTINE public.puede_evaluar() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.puede_evaluar() TO authenticated;
GRANT EXECUTE ON ROUTINE public.puede_evaluar() TO service_role;
REVOKE ALL ON ROUTINE public.puede_ver_evaluaciones() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.puede_ver_evaluaciones() TO authenticated;
GRANT EXECUTE ON ROUTINE public.puede_ver_evaluaciones() TO service_role;
REVOKE ALL ON ROUTINE public.rpe_publico_guardar(uuid, uuid, date, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.rpe_publico_guardar(uuid, uuid, date, text, integer) TO anon;
GRANT EXECUTE ON ROUTINE public.rpe_publico_guardar(uuid, uuid, date, text, integer) TO authenticated;
GRANT EXECUTE ON ROUTINE public.rpe_publico_guardar(uuid, uuid, date, text, integer) TO service_role;
REVOKE ALL ON ROUTINE public.sellar_tipo_accion() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.sellar_tipo_accion() TO authenticated;
GRANT EXECUTE ON ROUTINE public.sellar_tipo_accion() TO service_role;
REVOKE ALL ON ROUTINE public.validar_referencia_tactica_analisis() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.validar_referencia_tactica_analisis() TO service_role;
REVOKE ALL ON ROUTINE public.ve_todas_evaluaciones() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.ve_todas_evaluaciones() TO authenticated;
GRANT EXECUTE ON ROUTINE public.ve_todas_evaluaciones() TO service_role;
REVOKE ALL ON ROUTINE public.wellness_publico_categoria(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.wellness_publico_categoria(uuid) TO anon;
GRANT EXECUTE ON ROUTINE public.wellness_publico_categoria(uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.wellness_publico_categoria(uuid) TO service_role;
REVOKE ALL ON ROUTINE public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) TO anon;
GRANT EXECUTE ON ROUTINE public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON ROUTINE public.wellness_publico_guardar(uuid, uuid, integer, integer, integer, integer, integer, text, text) TO service_role;
REVOKE ALL ON ROUTINE public.wellness_publico_respondio(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ROUTINE public.wellness_publico_respondio(uuid, uuid) TO anon;
GRANT EXECUTE ON ROUTINE public.wellness_publico_respondio(uuid, uuid) TO authenticated;
GRANT EXECUTE ON ROUTINE public.wellness_publico_respondio(uuid, uuid) TO service_role;
-- privilegios por defecto de postgres en public para S: {postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
-- privilegios por defecto de postgres en public para f: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
-- privilegios por defecto de postgres en public para r: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
-- privilegios por defecto de supabase_admin en public para S: {postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
-- privilegios por defecto de supabase_admin en public para f: {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
-- privilegios por defecto de supabase_admin en public para r: {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
