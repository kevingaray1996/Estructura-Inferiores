-- Revisión de SOLO LECTURA (no cambia nada): qué apunta a public.partidos en producción, cómo está
-- la función de borrado de la app y qué tiene vinculado el partido de prueba vs Newell's (18/11).
-- Pegar entero en el editor SQL de Supabase; devuelve una sola tabla con todo.

WITH objetivo AS (SELECT 'fbb190b6-b124-4c6b-838a-98ecb19812c8'::uuid AS id)
-- 1) Todas las claves foráneas que apuntan a partidos y qué hacen al borrar.
SELECT 'fk' AS que,
       c.conrelid::regclass::text AS tabla,
       c.conname::text AS detalle,
       CASE c.confdeltype WHEN 'a' THEN 'sin acción (bloquea)' WHEN 'r' THEN 'restrict (bloquea)'
         WHEN 'c' THEN 'cascade (borra)' WHEN 'n' THEN 'set null (desvincula)' WHEN 'd' THEN 'set default' END AS valor
  FROM pg_constraint c
 WHERE c.contype = 'f' AND c.confrelid = 'public.partidos'::regclass
UNION ALL
-- 2) Disparadores de borrado en partidos y en las tablas vinculadas.
SELECT 'disparador', t.tgrelid::regclass::text, t.tgname::text, p.pronamespace::regnamespace::text || '.' || p.proname
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE NOT t.tgisinternal
   AND t.tgrelid IN ('public.partidos'::regclass, 'public.citaciones'::regclass,
                     'public.estadisticas_jugador'::regclass, 'public.videos'::regclass)
UNION ALL
-- 3) La función que usa la app para borrar: ¿borra citaciones y estadísticas y desvincula videos?
SELECT 'rpc', 'eliminar_partido_deportivo_seguro',
       CASE WHEN p.prosecdef THEN 'security definer' ELSE 'security invoker' END,
       concat_ws(' | ',
         CASE WHEN p.prosrc ILIKE '%DELETE FROM public.citaciones%' THEN 'borra citaciones' ELSE 'NO borra citaciones' END,
         CASE WHEN p.prosrc ILIKE '%DELETE FROM public.estadisticas_jugador%' THEN 'borra estadísticas' ELSE 'NO borra estadísticas' END,
         CASE WHEN p.prosrc ILIKE '%UPDATE public.videos SET partido_id=NULL%' THEN 'desvincula videos' ELSE 'NO desvincula videos' END,
         CASE WHEN p.prosrc ILIKE '%club.borrado_partido%' THEN 'marca el borrado' ELSE 'NO marca el borrado' END)
  FROM pg_proc p WHERE p.oid = 'public.eliminar_partido_deportivo_seguro(uuid)'::regprocedure
UNION ALL
-- 4) El partido de prueba y lo que tiene vinculado.
SELECT 'partido', 'partidos', p.rival, p.fecha::text || ' ' || coalesce(p.hora::text, 'sin hora')
  FROM public.partidos p, objetivo o WHERE p.id = o.id
UNION ALL
SELECT 'vinculado', 'citaciones', coalesce(j.nombre || ' ' || j.apellido, '(sin jugadora)'), c.id::text
  FROM public.citaciones c LEFT JOIN public.jugadores j ON j.id = c.jugador_id, objetivo o WHERE c.partido_id = o.id
UNION ALL
SELECT 'vinculado', 'estadisticas_jugador', coalesce(j.nombre || ' ' || j.apellido, '(sin jugadora)'), e.id::text
  FROM public.estadisticas_jugador e LEFT JOIN public.jugadores j ON j.id = e.jugador_id, objetivo o WHERE e.partido_id = o.id
UNION ALL
SELECT 'vinculado', 'videos', count(*)::text, 'se desvinculan (no se borran)'
  FROM public.videos v, objetivo o WHERE v.partido_id = o.id
UNION ALL
SELECT 'vinculado', 'avisos_envios', a.tipo || ' · ' || a.estado, a.id::text
  FROM public.avisos_envios a, objetivo o WHERE a.partido_id = o.id
UNION ALL
SELECT 'vinculado', 'sesiones_fisicas', count(*)::text, 'se desvinculan solas (set null)'
  FROM public.sesiones_fisicas s, objetivo o WHERE s.partido_id = o.id
UNION ALL
SELECT 'vinculado', 'analisis_partidos', count(*)::text, 'si es más de 0, el borrado se frena'
  FROM public.analisis_partidos a, objetivo o WHERE a.partido_calendario_id = o.id
ORDER BY 1, 2, 3;
