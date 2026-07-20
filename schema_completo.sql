


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."categoria_de_jugador"("jid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select categoria_id from jugadores where id = jid
$$;


ALTER FUNCTION "public"."categoria_de_jugador"("jid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."categoria_de_partido"("pid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select categoria_id from partidos where id = pid
$$;


ALTER FUNCTION "public"."categoria_de_partido"("pid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jugador_tambien_reserva"("jid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select tambien_reserva from jugadores where id = jid), false)
$$;


ALTER FUNCTION "public"."jugador_tambien_reserva"("jid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mi_categoria"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select categoria_id from perfiles where email = auth.jwt() ->> 'email' limit 1
$$;


ALTER FUNCTION "public"."mi_categoria"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mi_categoria_es_reserva"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select es_reserva from categorias where id = mi_categoria()), false)
$$;


ALTER FUNCTION "public"."mi_categoria_es_reserva"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mi_rol"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select rol from perfiles where email = auth.jwt() ->> 'email' limit 1
$$;


ALTER FUNCTION "public"."mi_rol"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."asistencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "estado" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "asistencias_estado_check" CHECK (("estado" = ANY (ARRAY['presente'::"text", 'tarde'::"text", 'ausente'::"text", 'lesionado'::"text", 'enfermo'::"text"])))
);


ALTER TABLE "public"."asistencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."biblioteca" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "contenido" "text",
    "descripcion" "text" NOT NULL,
    "cantidad_jugadores" integer,
    "imagen_url" "text",
    "link_video" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."biblioteca" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bienestar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "fecha" "date" NOT NULL,
    "sueno" smallint,
    "dolor_muscular" smallint,
    "fatiga" smallint,
    "estres" smallint,
    CONSTRAINT "bienestar_dolor_muscular_check" CHECK ((("dolor_muscular" >= 1) AND ("dolor_muscular" <= 5))),
    CONSTRAINT "bienestar_estres_check" CHECK ((("estres" >= 1) AND ("estres" <= 5))),
    CONSTRAINT "bienestar_fatiga_check" CHECK ((("fatiga" >= 1) AND ("fatiga" <= 5))),
    CONSTRAINT "bienestar_sueno_check" CHECK ((("sueno" >= 1) AND ("sueno" <= 5)))
);


ALTER TABLE "public"."bienestar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidatos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text" NOT NULL,
    "fecha_nacimiento" "date",
    "posicion" "text",
    "categoria_probada_id" "uuid",
    "fecha_prueba" "date",
    "contacto_nombre" "text",
    "telefono_contacto" "text",
    "notas" "text",
    "estado" "text" DEFAULT 'en_prueba'::"text" NOT NULL,
    "jugador_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "candidatos_estado_check" CHECK (("estado" = ANY (ARRAY['en_prueba'::"text", 'aceptado'::"text", 'rechazado'::"text"])))
);


ALTER TABLE "public"."candidatos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "orden" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "es_reserva" boolean DEFAULT false
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."citaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partido_id" "uuid" NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "dorsal" integer,
    "titular" boolean DEFAULT false,
    "posicion_cancha" "text"
);


ALTER TABLE "public"."citaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entrenamientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "contenido" "text",
    "descripcion" "text" NOT NULL,
    "cantidad_jugadores" integer,
    "imagen_url" "text",
    "link_video" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."entrenamientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "escudo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estadisticas_jugador" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "partido_id" "uuid" NOT NULL,
    "minutos_jugados" integer DEFAULT 0,
    "goles" integer DEFAULT 0,
    "asistencias" integer DEFAULT 0,
    "tarjetas_amarillas" integer DEFAULT 0,
    "tarjetas_rojas" integer DEFAULT 0,
    "titular" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."estadisticas_jugador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fichas_medicas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "fecha" "date",
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tiempo_recuperacion" "text",
    "recuperado" boolean DEFAULT false,
    "link_informe" "text",
    "fecha_estimada_alta" "date"
);


ALTER TABLE "public"."fichas_medicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fichas_nutricion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "altura" numeric,
    "peso" numeric,
    "alerta_peso" boolean DEFAULT false,
    "detalle" "text",
    "drive_url" "text",
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fecha" "date",
    "descripcion" "text",
    "link_informe" "text"
);


ALTER TABLE "public"."fichas_nutricion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fichas_psicologicas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fecha" "date",
    "descripcion" "text",
    "link_informe" "text"
);


ALTER TABLE "public"."fichas_psicologicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "categoria_anterior_id" "uuid",
    "categoria_nueva_id" "uuid",
    "fecha" "date" DEFAULT CURRENT_DATE,
    "temporada" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historial_categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jugadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text" NOT NULL,
    "foto_url" "text",
    "categoria_id" "uuid" NOT NULL,
    "fecha_nacimiento" "date",
    "posicion" "text",
    "estado" "text" DEFAULT 'disponible'::"text" NOT NULL,
    "estado_detalle" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pie_habil" "text",
    "contacto_emergencia_nombre" "text",
    "telefono_emergencia" "text",
    "tambien_reserva" boolean DEFAULT false,
    CONSTRAINT "jugadores_estado_check" CHECK (("estado" = ANY (ARRAY['disponible'::"text", 'lesionado'::"text", 'suspendido'::"text"]))),
    CONSTRAINT "jugadores_pie_habil_check" CHECK (("pie_habil" = ANY (ARRAY['derecho'::"text", 'izquierdo'::"text", 'ambidiestro'::"text"])))
);


ALTER TABLE "public"."jugadores" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."jugadores_publico" AS
 SELECT "id",
    "nombre",
    "apellido",
    "foto_url",
    "categoria_id"
   FROM "public"."jugadores";


ALTER VIEW "public"."jugadores_publico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "categoria_id" "uuid" NOT NULL,
    "rival" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "hora" time without time zone,
    "lugar" "text",
    "local_visitante" "text",
    "resultado" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "formacion" "text",
    "escudo_url" "text",
    "equipo_id" "uuid",
    "link" "text",
    CONSTRAINT "partidos_local_visitante_check" CHECK (("local_visitante" = ANY (ARRAY['local'::"text", 'visitante'::"text"])))
);


ALTER TABLE "public"."partidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "email" "text" NOT NULL,
    "nombre" "text",
    "rol" "text" NOT NULL,
    "categoria_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "perfiles_rol_check" CHECK (("rol" = ANY (ARRAY['coordinacion'::"text", 'medico'::"text", 'tecnico'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sesiones_fisicas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "jugador_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "partido_id" "uuid",
    "distancia_total_m" numeric,
    "distancia_alta_intensidad_m" numeric,
    "sprints" integer,
    "velocidad_maxima_kmh" numeric,
    "player_load" numeric,
    "minutos" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rpe" smallint,
    CONSTRAINT "sesiones_fisicas_rpe_check" CHECK ((("rpe" >= 1) AND ("rpe" <= 10))),
    CONSTRAINT "sesiones_fisicas_tipo_check" CHECK (("tipo" = ANY (ARRAY['partido'::"text", 'entrenamiento'::"text"])))
);


ALTER TABLE "public"."sesiones_fisicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_id" "uuid",
    "nombre" "text" NOT NULL,
    "email" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "categoria_id" "uuid",
    "area" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "usuarios_rol_check" CHECK (("rol" = ANY (ARRAY['coordinacion'::"text", 'cuerpo_tecnico'::"text", 'area'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha" "date",
    "descripcion" "text",
    "categoria_id" "uuid",
    "jugador_id" "uuid",
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "partido_id" "uuid",
    "contenido" "text",
    "cantidad_jugadores" integer,
    "momento" "text"
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_fecha_jugador_id_key" UNIQUE ("fecha", "jugador_id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."biblioteca"
    ADD CONSTRAINT "biblioteca_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bienestar"
    ADD CONSTRAINT "bienestar_fecha_jugador_id_key" UNIQUE ("fecha", "jugador_id");



ALTER TABLE ONLY "public"."bienestar"
    ADD CONSTRAINT "bienestar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."citaciones"
    ADD CONSTRAINT "citaciones_partido_id_jugador_id_key" UNIQUE ("partido_id", "jugador_id");



ALTER TABLE ONLY "public"."citaciones"
    ADD CONSTRAINT "citaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entrenamientos"
    ADD CONSTRAINT "entrenamientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipos"
    ADD CONSTRAINT "equipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estadisticas_jugador"
    ADD CONSTRAINT "estadisticas_jugador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fichas_nutricion"
    ADD CONSTRAINT "fichas_nutricion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fichas_psicologicas"
    ADD CONSTRAINT "fichas_psicologicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_categorias"
    ADD CONSTRAINT "historial_categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jugadores"
    ADD CONSTRAINT "jugadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partidos"
    ADD CONSTRAINT "partidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."sesiones_fisicas"
    ADD CONSTRAINT "sesiones_fisicas_fecha_jugador_id_tipo_key" UNIQUE ("fecha", "jugador_id", "tipo");



ALTER TABLE ONLY "public"."sesiones_fisicas"
    ADD CONSTRAINT "sesiones_fisicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bienestar"
    ADD CONSTRAINT "bienestar_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_categoria_probada_id_fkey" FOREIGN KEY ("categoria_probada_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."candidatos"
    ADD CONSTRAINT "candidatos_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."citaciones"
    ADD CONSTRAINT "citaciones_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."citaciones"
    ADD CONSTRAINT "citaciones_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id");



ALTER TABLE ONLY "public"."estadisticas_jugador"
    ADD CONSTRAINT "estadisticas_jugador_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."estadisticas_jugador"
    ADD CONSTRAINT "estadisticas_jugador_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id");



ALTER TABLE ONLY "public"."fichas_medicas"
    ADD CONSTRAINT "fichas_medicas_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."fichas_nutricion"
    ADD CONSTRAINT "fichas_nutricion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."fichas_nutricion"
    ADD CONSTRAINT "fichas_nutricion_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."fichas_psicologicas"
    ADD CONSTRAINT "fichas_psicologicas_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."historial_categorias"
    ADD CONSTRAINT "historial_categorias_categoria_anterior_id_fkey" FOREIGN KEY ("categoria_anterior_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."historial_categorias"
    ADD CONSTRAINT "historial_categorias_categoria_nueva_id_fkey" FOREIGN KEY ("categoria_nueva_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."historial_categorias"
    ADD CONSTRAINT "historial_categorias_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jugadores"
    ADD CONSTRAINT "jugadores_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."partidos"
    ADD CONSTRAINT "partidos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."partidos"
    ADD CONSTRAINT "partidos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."sesiones_fisicas"
    ADD CONSTRAINT "sesiones_fisicas_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sesiones_fisicas"
    ADD CONSTRAINT "sesiones_fisicas_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_jugador_id_fkey" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos"("id");



CREATE POLICY "acceso asistencias" ON "public"."asistencias" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"())))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()))));



CREATE POLICY "acceso biblioteca" ON "public"."biblioteca" USING (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'tecnico'::"text"]))) WITH CHECK (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'tecnico'::"text"])));



CREATE POLICY "acceso citaciones" ON "public"."citaciones" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"())))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()))));



CREATE POLICY "acceso equipos" ON "public"."equipos" USING (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'tecnico'::"text"]))) WITH CHECK (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'tecnico'::"text"])));



CREATE POLICY "acceso estadisticas" ON "public"."estadisticas_jugador" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id")))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id"))));



CREATE POLICY "acceso ficha medica" ON "public"."fichas_medicas" USING (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"]))) WITH CHECK (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"])));



CREATE POLICY "acceso ficha nutricion" ON "public"."fichas_nutricion" USING (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"]))) WITH CHECK (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"])));



CREATE POLICY "acceso ficha psicologica" ON "public"."fichas_psicologicas" USING (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"]))) WITH CHECK (("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"])));



CREATE POLICY "acceso sesiones_fisicas" ON "public"."sesiones_fisicas" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id")))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id"))));



ALTER TABLE "public"."asistencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."biblioteca" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bienestar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidatos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."citaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coordinacion borra historial categorias" ON "public"."historial_categorias" FOR DELETE USING (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion borra perfiles" ON "public"."perfiles" FOR DELETE USING (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion edita historial categorias" ON "public"."historial_categorias" FOR UPDATE USING (("public"."mi_rol"() = 'coordinacion'::"text")) WITH CHECK (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion edita perfiles" ON "public"."perfiles" FOR UPDATE USING (("public"."mi_rol"() = 'coordinacion'::"text")) WITH CHECK (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion gestiona categorias" ON "public"."categorias" USING (("public"."mi_rol"() = 'coordinacion'::"text")) WITH CHECK (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion gestiona historial categorias" ON "public"."historial_categorias" FOR INSERT WITH CHECK (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion gestiona perfiles" ON "public"."perfiles" FOR INSERT WITH CHECK (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "coordinacion ve todos los perfiles" ON "public"."perfiles" FOR SELECT USING (("public"."mi_rol"() = 'coordinacion'::"text"));



CREATE POLICY "delete jugadores" ON "public"."jugadores" FOR DELETE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "delete partidos" ON "public"."partidos" FOR DELETE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "delete videos" ON "public"."videos" FOR DELETE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND (("categoria_id" = "public"."mi_categoria"()) OR ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()) OR ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()) OR ("public"."mi_categoria_es_reserva"() AND ("jugador_id" IS NOT NULL) AND "public"."jugador_tambien_reserva"("jugador_id"))))));



ALTER TABLE "public"."equipos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estadisticas_jugador" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fichas_medicas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fichas_nutricion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fichas_psicologicas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gestionar bienestar" ON "public"."bienestar" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id")))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("jugador_id"))));



CREATE POLICY "gestionar candidatos" ON "public"."candidatos" USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_probada_id" = "public"."mi_categoria"())))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_probada_id" = "public"."mi_categoria"()))));



ALTER TABLE "public"."historial_categorias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert jugadores" ON "public"."jugadores" FOR INSERT WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "insert partidos" ON "public"."partidos" FOR INSERT WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "insert videos" ON "public"."videos" FOR INSERT WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND (("categoria_id" = "public"."mi_categoria"()) OR ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()) OR ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()) OR ("public"."mi_categoria_es_reserva"() AND ("jugador_id" IS NOT NULL) AND "public"."jugador_tambien_reserva"("jugador_id"))))));



ALTER TABLE "public"."jugadores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leer categorias" ON "public"."categorias" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "medico ve bienestar" ON "public"."bienestar" FOR SELECT USING (("public"."mi_rol"() = 'medico'::"text"));



ALTER TABLE "public"."partidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "publico bienestar de hoy" ON "public"."bienestar" TO "anon" USING (("fecha" = CURRENT_DATE)) WITH CHECK (("fecha" = CURRENT_DATE));



CREATE POLICY "publico rpe reciente" ON "public"."sesiones_fisicas" TO "anon" USING ((("fecha" >= (CURRENT_DATE - '3 days'::interval)) AND ("fecha" <= CURRENT_DATE))) WITH CHECK ((("fecha" >= (CURRENT_DATE - '3 days'::interval)) AND ("fecha" <= CURRENT_DATE)));



CREATE POLICY "publico ve categorias" ON "public"."categorias" FOR SELECT TO "anon" USING (true);



CREATE POLICY "select historial categorias" ON "public"."historial_categorias" FOR SELECT USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()))));



CREATE POLICY "select jugadores" ON "public"."jugadores" FOR SELECT USING ((("public"."mi_rol"() = ANY (ARRAY['coordinacion'::"text", 'medico'::"text"])) OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"())) OR (("public"."mi_rol"() = 'tecnico'::"text") AND "public"."mi_categoria_es_reserva"() AND "public"."jugador_tambien_reserva"("id"))));



CREATE POLICY "select partidos" ON "public"."partidos" FOR SELECT USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "select videos" ON "public"."videos" FOR SELECT USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND (("categoria_id" = "public"."mi_categoria"()) OR ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()) OR ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()) OR ("public"."mi_categoria_es_reserva"() AND ("jugador_id" IS NOT NULL) AND "public"."jugador_tambien_reserva"("jugador_id"))))));



ALTER TABLE "public"."sesiones_fisicas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update jugadores" ON "public"."jugadores" FOR UPDATE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"())))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "update partidos" ON "public"."partidos" FOR UPDATE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"())))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND ("categoria_id" = "public"."mi_categoria"()))));



CREATE POLICY "update videos" ON "public"."videos" FOR UPDATE USING ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND (("categoria_id" = "public"."mi_categoria"()) OR ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()) OR ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()) OR ("public"."mi_categoria_es_reserva"() AND ("jugador_id" IS NOT NULL) AND "public"."jugador_tambien_reserva"("jugador_id")))))) WITH CHECK ((("public"."mi_rol"() = 'coordinacion'::"text") OR (("public"."mi_rol"() = 'tecnico'::"text") AND (("categoria_id" = "public"."mi_categoria"()) OR ("public"."categoria_de_jugador"("jugador_id") = "public"."mi_categoria"()) OR ("public"."categoria_de_partido"("partido_id") = "public"."mi_categoria"()) OR ("public"."mi_categoria_es_reserva"() AND ("jugador_id" IS NOT NULL) AND "public"."jugador_tambien_reserva"("jugador_id"))))));



CREATE POLICY "ver propio perfil" ON "public"."perfiles" FOR SELECT USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."categoria_de_jugador"("jid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."categoria_de_jugador"("jid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."categoria_de_jugador"("jid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."categoria_de_partido"("pid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."categoria_de_partido"("pid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."categoria_de_partido"("pid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."jugador_tambien_reserva"("jid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."jugador_tambien_reserva"("jid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jugador_tambien_reserva"("jid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mi_categoria"() TO "anon";
GRANT ALL ON FUNCTION "public"."mi_categoria"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mi_categoria"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mi_categoria_es_reserva"() TO "anon";
GRANT ALL ON FUNCTION "public"."mi_categoria_es_reserva"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mi_categoria_es_reserva"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mi_rol"() TO "anon";
GRANT ALL ON FUNCTION "public"."mi_rol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mi_rol"() TO "service_role";



GRANT ALL ON TABLE "public"."asistencias" TO "anon";
GRANT ALL ON TABLE "public"."asistencias" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencias" TO "service_role";



GRANT ALL ON TABLE "public"."biblioteca" TO "anon";
GRANT ALL ON TABLE "public"."biblioteca" TO "authenticated";
GRANT ALL ON TABLE "public"."biblioteca" TO "service_role";



GRANT ALL ON TABLE "public"."bienestar" TO "anon";
GRANT ALL ON TABLE "public"."bienestar" TO "authenticated";
GRANT ALL ON TABLE "public"."bienestar" TO "service_role";



GRANT ALL ON TABLE "public"."candidatos" TO "anon";
GRANT ALL ON TABLE "public"."candidatos" TO "authenticated";
GRANT ALL ON TABLE "public"."candidatos" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON TABLE "public"."citaciones" TO "anon";
GRANT ALL ON TABLE "public"."citaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."citaciones" TO "service_role";



GRANT ALL ON TABLE "public"."entrenamientos" TO "anon";
GRANT ALL ON TABLE "public"."entrenamientos" TO "authenticated";
GRANT ALL ON TABLE "public"."entrenamientos" TO "service_role";



GRANT ALL ON TABLE "public"."equipos" TO "anon";
GRANT ALL ON TABLE "public"."equipos" TO "authenticated";
GRANT ALL ON TABLE "public"."equipos" TO "service_role";



GRANT ALL ON TABLE "public"."estadisticas_jugador" TO "anon";
GRANT ALL ON TABLE "public"."estadisticas_jugador" TO "authenticated";
GRANT ALL ON TABLE "public"."estadisticas_jugador" TO "service_role";



GRANT ALL ON TABLE "public"."fichas_medicas" TO "anon";
GRANT ALL ON TABLE "public"."fichas_medicas" TO "authenticated";
GRANT ALL ON TABLE "public"."fichas_medicas" TO "service_role";



GRANT ALL ON TABLE "public"."fichas_nutricion" TO "anon";
GRANT ALL ON TABLE "public"."fichas_nutricion" TO "authenticated";
GRANT ALL ON TABLE "public"."fichas_nutricion" TO "service_role";



GRANT ALL ON TABLE "public"."fichas_psicologicas" TO "anon";
GRANT ALL ON TABLE "public"."fichas_psicologicas" TO "authenticated";
GRANT ALL ON TABLE "public"."fichas_psicologicas" TO "service_role";



GRANT ALL ON TABLE "public"."historial_categorias" TO "anon";
GRANT ALL ON TABLE "public"."historial_categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_categorias" TO "service_role";



GRANT ALL ON TABLE "public"."jugadores" TO "anon";
GRANT ALL ON TABLE "public"."jugadores" TO "authenticated";
GRANT ALL ON TABLE "public"."jugadores" TO "service_role";



GRANT ALL ON TABLE "public"."jugadores_publico" TO "anon";
GRANT ALL ON TABLE "public"."jugadores_publico" TO "authenticated";
GRANT ALL ON TABLE "public"."jugadores_publico" TO "service_role";



GRANT ALL ON TABLE "public"."partidos" TO "anon";
GRANT ALL ON TABLE "public"."partidos" TO "authenticated";
GRANT ALL ON TABLE "public"."partidos" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON TABLE "public"."sesiones_fisicas" TO "anon";
GRANT ALL ON TABLE "public"."sesiones_fisicas" TO "authenticated";
GRANT ALL ON TABLE "public"."sesiones_fisicas" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."sesiones_fisicas" TO "anon";



GRANT SELECT("fecha"),INSERT("fecha"),UPDATE("fecha") ON TABLE "public"."sesiones_fisicas" TO "anon";



GRANT SELECT("jugador_id"),INSERT("jugador_id"),UPDATE("jugador_id") ON TABLE "public"."sesiones_fisicas" TO "anon";



GRANT SELECT("tipo"),INSERT("tipo"),UPDATE("tipo") ON TABLE "public"."sesiones_fisicas" TO "anon";



GRANT SELECT("rpe"),INSERT("rpe"),UPDATE("rpe") ON TABLE "public"."sesiones_fisicas" TO "anon";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."videos" TO "anon";
GRANT ALL ON TABLE "public"."videos" TO "authenticated";
GRANT ALL ON TABLE "public"."videos" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







