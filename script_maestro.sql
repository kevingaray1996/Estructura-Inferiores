-- =========================================================
-- ESTRUCTURA INFERIORES — SCRIPT MAESTRO DE BASE DE DATOS
-- =========================================================
-- Esto reemplaza a todos los SQL sueltos (login_permisos, foto_gps,
-- asistencia_v2, mejoras_v3 a v6, etc). Es el estado actual y
-- completo de la base, sacado directamente de la base real con
-- "supabase db dump" y reordenado en un único script.
--
-- Para clonar la app a un club nuevo:
--   1) Creá un proyecto nuevo en Supabase.
--   2) Andá a SQL Editor → New query.
--   3) Pegá TODO este archivo y ejecutalo (Run). Es una sola pasada,
--      no hace falta dividirlo.
--   4) Creá el bucket de Storage "Biblioteca" (paso manual, ver abajo).
--   5) Creá el primer usuario de login (Authentication → Users → Add
--      user) y después corré el INSERT de bootstrap al final de este
--      archivo con su email real.
--   6) Cargá las categorías del club nuevo desde la sección Usuarios/
--      Categorías de la app (o con INSERTs a mano en la tabla
--      "categorias").
-- =========================================================


-- =========================================================
-- 1) FUNCIONES AUXILIARES
--    (se crean antes que las tablas a propósito: son funciones SQL
--    simples, Postgres no valida que las tablas ya existan)
-- =========================================================

create or replace function mi_rol() returns text
language sql stable security definer set search_path to 'public' as $$
  select rol from perfiles where email = auth.jwt() ->> 'email' limit 1
$$;

create or replace function mi_categoria() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select categoria_id from perfiles where email = auth.jwt() ->> 'email' limit 1
$$;

create or replace function categoria_de_jugador(jid uuid) returns uuid
language sql stable as $$
  select categoria_id from jugadores where id = jid
$$;

create or replace function categoria_de_partido(pid uuid) returns uuid
language sql stable as $$
  select categoria_id from partidos where id = pid
$$;

create or replace function mi_categoria_es_reserva() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select es_reserva from categorias where id = mi_categoria()), false)
$$;

create or replace function jugador_tambien_reserva(jid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select tambien_reserva from jugadores where id = jid), false)
$$;


-- =========================================================
-- 2) TABLAS
-- =========================================================

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden integer not null,
  es_reserva boolean default false,
  created_at timestamptz default now()
);

create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  escudo_url text,
  created_at timestamptz default now()
);

create table if not exists perfiles (
  email text primary key,
  nombre text,
  rol text not null check (rol in ('coordinacion', 'medico', 'tecnico')),
  categoria_id uuid references categorias(id),
  created_at timestamptz default now()
);

create table if not exists pensiones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists jugadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  foto_url text,
  categoria_id uuid not null references categorias(id),
  fecha_nacimiento date,
  posicion text,
  estado text not null default 'disponible' check (estado in ('disponible', 'lesionado', 'suspendido')),
  estado_detalle text,
  pie_habil text check (pie_habil in ('derecho', 'izquierdo', 'ambidiestro')),
  contacto_emergencia_nombre text,
  telefono_emergencia text,
  tambien_reserva boolean default false,
  nro_documento text,
  nacionalidad text default 'Argentina',
  lugar_nacimiento text,
  pasaporte_comunitario boolean default false,
  obra_social text,
  nro_afiliado text,
  posicion_secundaria text,
  video_promocional text,
  fecha_inicio_contrato date,
  fecha_fin_contrato date,
  pension_id uuid references pensiones(id),
  costo_pension text check (costo_pension is null or costo_pension in ('club', 'compartido')),
  created_at timestamptz default now()
);

create table if not exists representantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  notas text,
  created_at timestamptz default now()
);

create table if not exists jugador_representantes (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  representante_id uuid not null references representantes(id) on delete cascade,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz default now()
);

create table if not exists convocatorias_seleccion (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  seleccion text not null default 'Selección Nacional',
  fecha_inicio date not null,
  fecha_fin date,
  observaciones text,
  created_at timestamptz default now()
);

create or replace view jugadores_publico as
  select id, nombre, apellido, foto_url, categoria_id
  from jugadores;

create table if not exists partidos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias(id),
  rival text not null,
  fecha date not null,
  hora time,
  lugar text,
  local_visitante text check (local_visitante in ('local', 'visitante')),
  resultado text,
  formacion text,
  escudo_url text,
  equipo_id uuid references equipos(id),
  link text,
  created_at timestamptz default now()
);

create table if not exists asistencias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  estado text not null check (estado in ('presente', 'tarde', 'ausente', 'lesionado', 'enfermo')),
  created_at timestamptz default now(),
  unique (fecha, jugador_id)
);

create table if not exists biblioteca (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  contenido text,
  descripcion text not null,
  cantidad_jugadores integer,
  imagen_url text,
  link_video text,
  created_at timestamptz default now()
);

create table if not exists bienestar (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  fecha date not null,
  sueno smallint check (sueno between 1 and 5),
  dolor_muscular smallint check (dolor_muscular between 1 and 5),
  fatiga smallint check (fatiga between 1 and 5),
  estres smallint check (estres between 1 and 5),
  unique (fecha, jugador_id)
);

create table if not exists candidatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  fecha_nacimiento date,
  posicion text,
  categoria_probada_id uuid references categorias(id),
  fecha_prueba date,
  contacto_nombre text,
  telefono_contacto text,
  notas text,
  estado text not null default 'en_prueba' check (estado in ('en_prueba', 'aceptado', 'rechazado')),
  jugador_id uuid references jugadores(id),
  creado_en timestamptz not null default now()
);

create table if not exists citaciones (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partidos(id),
  jugador_id uuid not null references jugadores(id),
  dorsal integer,
  titular boolean default false,
  posicion_cancha text,
  unique (partido_id, jugador_id)
);

create table if not exists entrenamientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  contenido text,
  descripcion text not null,
  cantidad_jugadores integer,
  imagen_url text,
  link_video text,
  created_at timestamptz default now()
);

create table if not exists estadisticas_jugador (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id),
  partido_id uuid not null references partidos(id),
  minutos_jugados integer default 0,
  goles integer default 0,
  asistencias integer default 0,
  tarjetas_amarillas integer default 0,
  tarjetas_rojas integer default 0,
  titular boolean default false,
  created_at timestamptz default now()
);

create table if not exists fichas_medicas (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id),
  fecha date,
  descripcion text,
  tiempo_recuperacion text,
  recuperado boolean default false,
  link_informe text,
  fecha_estimada_alta date,
  created_at timestamptz default now()
);

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id),
  nombre text not null,
  email text not null,
  rol text not null check (rol in ('coordinacion', 'cuerpo_tecnico', 'area')),
  categoria_id uuid references categorias(id),
  area text,
  created_at timestamptz default now()
);

create table if not exists fichas_nutricion (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id),
  altura numeric,
  peso numeric,
  alerta_peso boolean default false,
  detalle text,
  drive_url text,
  creado_por uuid references usuarios(id),
  fecha date,
  descripcion text,
  link_informe text,
  created_at timestamptz default now()
);

create table if not exists fichas_psicologicas (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id),
  fecha date,
  descripcion text,
  link_informe text,
  created_at timestamptz default now()
);

create table if not exists historial_categorias (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  categoria_anterior_id uuid references categorias(id),
  categoria_nueva_id uuid references categorias(id),
  fecha date default current_date,
  temporada text,
  created_at timestamptz default now()
);

create table if not exists sesiones_fisicas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  tipo text not null check (tipo in ('partido', 'entrenamiento')),
  partido_id uuid references partidos(id) on delete set null,
  distancia_total_m numeric,
  distancia_alta_intensidad_m numeric,
  sprints integer,
  velocidad_maxima_kmh numeric,
  player_load numeric,
  minutos integer,
  rpe smallint check (rpe between 1 and 10),
  created_at timestamptz default now(),
  unique (fecha, jugador_id, tipo)
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  fecha date,
  descripcion text,
  categoria_id uuid references categorias(id),
  jugador_id uuid references jugadores(id),
  url text,
  partido_id uuid references partidos(id),
  contenido text,
  cantidad_jugadores integer,
  momento text,
  created_at timestamptz default now()
);


-- =========================================================
-- 3) ROW LEVEL SECURITY — habilitar en todas las tablas
-- =========================================================

alter table categorias enable row level security;
alter table perfiles enable row level security;
alter table jugadores enable row level security;
alter table partidos enable row level security;
alter table asistencias enable row level security;
alter table biblioteca enable row level security;
alter table bienestar enable row level security;
alter table candidatos enable row level security;
alter table citaciones enable row level security;
alter table equipos enable row level security;
alter table estadisticas_jugador enable row level security;
alter table fichas_medicas enable row level security;
alter table fichas_nutricion enable row level security;
alter table fichas_psicologicas enable row level security;
alter table historial_categorias enable row level security;
alter table sesiones_fisicas enable row level security;
alter table videos enable row level security;
alter table pensiones enable row level security;
alter table representantes enable row level security;
alter table jugador_representantes enable row level security;
alter table convocatorias_seleccion enable row level security;


-- =========================================================
-- 4) POLÍTICAS RLS
-- =========================================================

-- perfiles
create policy "ver propio perfil" on perfiles for select
  using (email = auth.jwt() ->> 'email');
create policy "coordinacion ve todos los perfiles" on perfiles for select
  using (mi_rol() = 'coordinacion');
create policy "coordinacion gestiona perfiles" on perfiles for insert
  with check (mi_rol() = 'coordinacion');
create policy "coordinacion edita perfiles" on perfiles for update
  using (mi_rol() = 'coordinacion') with check (mi_rol() = 'coordinacion');
create policy "coordinacion borra perfiles" on perfiles for delete
  using (mi_rol() = 'coordinacion');

-- categorias
create policy "leer categorias" on categorias for select
  using (auth.role() = 'authenticated');
create policy "coordinacion gestiona categorias" on categorias for all
  using (mi_rol() = 'coordinacion') with check (mi_rol() = 'coordinacion');
create policy "publico ve categorias" on categorias for select to anon
  using (true);

-- jugadores
create policy "select jugadores" on jugadores for select
  using (
    mi_rol() in ('coordinacion', 'medico')
    or (mi_rol() = 'tecnico' and categoria_id = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(id))
  );
create policy "insert jugadores" on jugadores for insert
  with check (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));
create policy "update jugadores" on jugadores for update
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()))
  with check (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));
create policy "delete jugadores" on jugadores for delete
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));

-- fichas médicas / nutrición / psicología: coordinación y médico
create policy "acceso ficha medica" on fichas_medicas for all
  using (mi_rol() in ('coordinacion', 'medico')) with check (mi_rol() in ('coordinacion', 'medico'));
create policy "acceso ficha nutricion" on fichas_nutricion for all
  using (mi_rol() in ('coordinacion', 'medico')) with check (mi_rol() in ('coordinacion', 'medico'));
create policy "acceso ficha psicologica" on fichas_psicologicas for all
  using (mi_rol() in ('coordinacion', 'medico')) with check (mi_rol() in ('coordinacion', 'medico'));

-- partidos
create policy "select partidos" on partidos for select
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));
create policy "insert partidos" on partidos for insert
  with check (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));
create policy "update partidos" on partidos for update
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()))
  with check (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));
create policy "delete partidos" on partidos for delete
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_id = mi_categoria()));

-- videos
create policy "select videos" on videos for select
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and (
      categoria_id = mi_categoria()
      or categoria_de_jugador(jugador_id) = mi_categoria()
      or categoria_de_partido(partido_id) = mi_categoria()
      or (mi_categoria_es_reserva() and jugador_id is not null and jugador_tambien_reserva(jugador_id))
    ))
  );
create policy "insert videos" on videos for insert
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and (
      categoria_id = mi_categoria()
      or categoria_de_jugador(jugador_id) = mi_categoria()
      or categoria_de_partido(partido_id) = mi_categoria()
      or (mi_categoria_es_reserva() and jugador_id is not null and jugador_tambien_reserva(jugador_id))
    ))
  );
create policy "update videos" on videos for update
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and (
      categoria_id = mi_categoria()
      or categoria_de_jugador(jugador_id) = mi_categoria()
      or categoria_de_partido(partido_id) = mi_categoria()
      or (mi_categoria_es_reserva() and jugador_id is not null and jugador_tambien_reserva(jugador_id))
    ))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and (
      categoria_id = mi_categoria()
      or categoria_de_jugador(jugador_id) = mi_categoria()
      or categoria_de_partido(partido_id) = mi_categoria()
      or (mi_categoria_es_reserva() and jugador_id is not null and jugador_tambien_reserva(jugador_id))
    ))
  );
create policy "delete videos" on videos for delete
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and (
      categoria_id = mi_categoria()
      or categoria_de_jugador(jugador_id) = mi_categoria()
      or categoria_de_partido(partido_id) = mi_categoria()
      or (mi_categoria_es_reserva() and jugador_id is not null and jugador_tambien_reserva(jugador_id))
    ))
  );

-- citaciones y estadísticas: filtradas por categoría del partido
-- (incluye cruce Reserva/Inferiores)
create policy "acceso citaciones" on citaciones for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_partido(partido_id) = mi_categoria())
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_partido(partido_id) = mi_categoria())
  );

create policy "acceso estadisticas" on estadisticas_jugador for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_partido(partido_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_partido(partido_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  );

-- equipos y biblioteca: compartidos coordinación + técnicos
create policy "acceso equipos" on equipos for all
  using (mi_rol() in ('coordinacion', 'tecnico')) with check (mi_rol() in ('coordinacion', 'tecnico'));
create policy "acceso biblioteca" on biblioteca for all
  using (mi_rol() in ('coordinacion', 'tecnico')) with check (mi_rol() in ('coordinacion', 'tecnico'));

-- asistencias
create policy "acceso asistencias" on asistencias for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
  );

-- historial de categorías
create policy "select historial categorias" on historial_categorias for select
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
  );
create policy "coordinacion gestiona historial categorias" on historial_categorias for insert
  with check (mi_rol() = 'coordinacion');
create policy "coordinacion edita historial categorias" on historial_categorias for update
  using (mi_rol() = 'coordinacion') with check (mi_rol() = 'coordinacion');
create policy "coordinacion borra historial categorias" on historial_categorias for delete
  using (mi_rol() = 'coordinacion');

-- sesiones físicas (GPS + RPE): cuerpo técnico/coordinación, incluye
-- cruce Reserva/Inferiores
create policy "acceso sesiones_fisicas" on sesiones_fisicas for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  );

-- bienestar (wellness): cuerpo técnico/coordinación gestionan,
-- médico solo lectura
create policy "gestionar bienestar" on bienestar for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  );
create policy "medico ve bienestar" on bienestar for select
  using (mi_rol() = 'medico');

-- captación (pipeline de pruebas)
create policy "gestionar candidatos" on candidatos for all
  using (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_probada_id = mi_categoria()))
  with check (mi_rol() = 'coordinacion' or (mi_rol() = 'tecnico' and categoria_probada_id = mi_categoria()));

-- pensiones y representantes: catálogos compartidos coordinación + técnicos
create policy "acceso pensiones" on pensiones for all
  using (mi_rol() in ('coordinacion', 'tecnico')) with check (mi_rol() in ('coordinacion', 'tecnico'));
create policy "acceso representantes" on representantes for all
  using (mi_rol() in ('coordinacion', 'tecnico')) with check (mi_rol() in ('coordinacion', 'tecnico'));

-- vínculo jugador-representante y convocatorias a selección: filtrados
-- por categoría del jugador (incluye cruce Reserva/Inferiores)
create policy "acceso jugador_representantes" on jugador_representantes for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  );

create policy "acceso convocatorias_seleccion" on convocatorias_seleccion for all
  using (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  )
  with check (
    mi_rol() = 'coordinacion'
    or (mi_rol() = 'tecnico' and categoria_de_jugador(jugador_id) = mi_categoria())
    or (mi_rol() = 'tecnico' and mi_categoria_es_reserva() and jugador_tambien_reserva(jugador_id))
  );

-- ==== ACCESO PÚBLICO (sin login) para el link de bienestar/RPE ====

-- Vista pública de jugadores: solo nombre/apellido/foto/categoría,
-- nada sensible. Las vistas corren con privilegios del dueño, así
-- que esto evita exponer el resto de la tabla "jugadores" a anon.
grant all on jugadores_publico to anon, authenticated, service_role;

-- Bienestar: el público solo puede cargar/editar el registro DE HOY.
create policy "publico bienestar de hoy" on bienestar for all to anon
  using (fecha = current_date) with check (fecha = current_date);

-- RPE dentro de sesiones_fisicas: el público solo puede tocar filas
-- de los últimos 3 días, y SOLO estas columnas (fecha, jugador_id,
-- tipo, rpe). El resto (distancia, sprints, velocidad, player_load,
-- etc.) queda fuera de su alcance por permiso de columna, aunque la
-- fila sea visible por la política de arriba.
create policy "publico rpe reciente" on sesiones_fisicas for all to anon
  using (fecha between current_date - interval '3 days' and current_date)
  with check (fecha between current_date - interval '3 days' and current_date);

grant select (id, fecha, jugador_id, tipo, rpe) on sesiones_fisicas to anon;
grant insert (fecha, jugador_id, tipo, rpe) on sesiones_fisicas to anon;
grant update (fecha, jugador_id, tipo, rpe) on sesiones_fisicas to anon;


-- =========================================================
-- 5) GRANTS GENERALES (igual que un proyecto Supabase estándar)
-- =========================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on function mi_rol() to anon, authenticated, service_role;
grant all on function mi_categoria() to anon, authenticated, service_role;
grant all on function categoria_de_jugador(uuid) to anon, authenticated, service_role;
grant all on function categoria_de_partido(uuid) to anon, authenticated, service_role;
grant all on function mi_categoria_es_reserva() to anon, authenticated, service_role;
grant all on function jugador_tambien_reserva(uuid) to anon, authenticated, service_role;

grant all on table
  categorias, equipos, perfiles, jugadores, partidos, asistencias,
  biblioteca, bienestar, candidatos, citaciones, entrenamientos,
  estadisticas_jugador, fichas_medicas, usuarios, fichas_nutricion,
  fichas_psicologicas, historial_categorias, sesiones_fisicas, videos,
  pensiones, representantes, jugador_representantes, convocatorias_seleccion
  to anon, authenticated, service_role;


-- =========================================================
-- 6) STORAGE — bucket "Biblioteca" (fotos, escudos, informes, videos)
-- =========================================================
-- Paso manual recomendado (más simple que hacerlo por SQL):
--   Dashboard → Storage → New bucket → nombre "Biblioteca" → Public bucket: ON
--
-- Si preferís crearlo por SQL, descomentá esta línea:
-- insert into storage.buckets (id, name, public) values ('Biblioteca', 'Biblioteca', true)
--   on conflict (id) do nothing;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%Biblioteca%' or with_check ilike '%Biblioteca%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "Biblioteca select autenticados" on storage.objects for select
  to authenticated using (bucket_id = 'Biblioteca');
create policy "Biblioteca insert autenticados" on storage.objects for insert
  to authenticated with check (bucket_id = 'Biblioteca');
create policy "Biblioteca update autenticados" on storage.objects for update
  to authenticated using (bucket_id = 'Biblioteca');
create policy "Biblioteca delete autenticados" on storage.objects for delete
  to authenticated using (bucket_id = 'Biblioteca');


-- =========================================================
-- 7) BOOTSTRAP — tu primer usuario (coordinación)
-- =========================================================
-- ANTES de correr esta línea: Authentication → Users → Add user,
-- con el email real de la persona que va a entrar como coordinación,
-- y con una contraseña. Después reemplazá el email/nombre de abajo
-- por los reales y corré solo este INSERT.

-- insert into perfiles (email, nombre, rol)
-- values ('email-de-coordinacion@ejemplo.com', 'Nombre Apellido', 'coordinacion')
-- on conflict (email) do update set rol = 'coordinacion';
