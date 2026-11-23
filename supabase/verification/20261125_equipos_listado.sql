-- Listado de equipos para revisar (solo lectura). Correr después de 20261125120000_equipos_clips_playlists.sql.
-- Devuelve una tabla con:
--   - «equipo»: cada equipo del listado, si lo agregó la migración y en cuántos partidos / análisis aparece;
--   - «posible duplicado»: pares de nombres muy parecidos (uno contiene al otro, o empiezan con la misma palabra),
--     por ejemplo «Camioneros» y «Camioneros FC»;
--   - «scouting con texto libre»: análisis de scouting que todavía no apuntan al listado (no se vinculan solos);
--   - «partido propio sin equipo»: partidos del calendario con análisis que no tienen equipo elegido, y si hay un
--     equipo con el mismo nombre en el listado (la app los junta al leer; en la base no se guarda nada).
-- No modifica nada.

WITH eq AS (
  SELECT e.id, e.nombre, e.activo, analisis_privado.nombre_equipo_normalizado(e.nombre) AS norma,
         EXISTS (SELECT 1 FROM seguridad_privado.respaldo_equipos_agregados r WHERE r.id = e.id) AS agregado
    FROM public.equipos e
), usos AS (
  SELECT eq.id,
         (SELECT count(*) FROM public.partidos p
           WHERE p.equipo_id = eq.id OR (p.equipo_id IS NULL AND analisis_privado.nombre_equipo_normalizado(p.rival) = eq.norma)) AS partidos,
         (SELECT count(*) FROM public.analisis_partidos a
           WHERE a.tipo_partido = 'scouting' AND (a.equipo_local_id = eq.id OR a.equipo_visitante_id = eq.id
              OR analisis_privado.nombre_equipo_normalizado(a.equipo_local) = eq.norma
              OR analisis_privado.nombre_equipo_normalizado(a.equipo_visitante) = eq.norma)) AS scouting
    FROM eq
)
SELECT 'equipo' AS seccion, eq.nombre AS nombre,
       concat_ws(' · ', CASE WHEN eq.agregado THEN 'agregado ahora' END, CASE WHEN NOT eq.activo THEN 'inactivo' END,
                 u.partidos || ' partidos', u.scouting || ' scouting') AS detalle
  FROM eq JOIN usos u ON u.id = eq.id
UNION ALL
SELECT 'posible duplicado', a.nombre || '  ↔  ' || b.nombre, 'revisar si son el mismo equipo'
  FROM eq a JOIN eq b ON a.id < b.id
 WHERE a.norma <> b.norma
   AND (position(a.norma IN b.norma) > 0 OR position(b.norma IN a.norma) > 0
        OR split_part(a.norma, ' ', 1) = split_part(b.norma, ' ', 1) AND char_length(split_part(a.norma, ' ', 1)) >= 4)
UNION ALL
SELECT 'scouting con texto libre', coalesce(a.equipo_local, '?') || ' vs ' || coalesce(a.equipo_visitante, '?'),
       coalesce(to_char(a.fecha, 'DD/MM/YYYY'), 'sin fecha')
  FROM public.analisis_partidos a
 WHERE a.tipo_partido = 'scouting' AND (a.equipo_local_id IS NULL OR a.equipo_visitante_id IS NULL)
UNION ALL
SELECT 'partido propio sin equipo', p.rival,
       to_char(p.fecha, 'DD/MM/YYYY') || CASE WHEN EXISTS (SELECT 1 FROM eq WHERE eq.norma = analisis_privado.nombre_equipo_normalizado(p.rival))
                                              THEN ' · hay un equipo con ese nombre' ELSE ' · sin equipo parecido' END
  FROM public.partidos p
 WHERE p.equipo_id IS NULL AND EXISTS (SELECT 1 FROM public.analisis_partidos a WHERE a.partido_calendario_id = p.id)
ORDER BY 1, 2;
