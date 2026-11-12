-- Corrección de datos de una sola vez. NO es una migración.
-- Orden: 1a y etapa 1 en main → migración de tipos → revisar sección 1 → vista previa (3) → corrección (4).

-- 1. Pases correctos con resultado Fallido: revisarlos en el video y corregir el tipo si hace falta.
select p.rival, p.fecha, e.periodo,
       to_char(make_interval(secs => e.segundo), 'MI:SS') as tiempo_video,
       coalesce(j.nombre || ' ' || j.apellido, 'Sin jugadora') as jugadora,
       e.id
from public.analisis_eventos e
join public.analisis_partidos p on p.id = e.partido_id
left join public.jugadores j on j.id = e.jugador_id
where e.tipo = 'Pase correcto' and e.resultado = 'Fallido'
order by p.fecha, e.periodo, e.segundo;

-- 2. Conteos informativos.
select count(*) as pases_incorrectos_bloqueados
from public.analisis_eventos
where tipo = 'Pase incorrecto' and resultado = 'Bloqueado';

select tipo, resultado, count(*)
from public.analisis_eventos
where tipo in ('Pérdida', 'Recuperación', 'Intercepción', 'Falta cometida',
               'Falta recibida', 'Atajada', 'Gol', 'Salida de arquera')
  and resultado is not null
group by tipo, resultado order by tipo, resultado;

-- 3. Vista previa: qué cambiaría.
with propuesta as (
  select e.id, e.tipo, e.resultado as actual,
         case when t.resultado_implicito is not null then t.resultado_implicito
              when cardinality(t.resultados) = 0 then null
              else e.resultado end as nuevo
  from public.analisis_eventos e
  join public.analisis_tipos_accion t on t.codigo = e.tipo
)
select tipo, coalesce(actual, '(vacío)') as actual, coalesce(nuevo, '(vacío)') as nuevo, count(*)
from propuesta
where actual is distinct from nuevo
group by 1, 2, 3 order by 1, 2;

-- 4. Corrección. Reemplazar TOTAL_ESPERADO por la suma de "count" de la vista previa.
-- Si falla con "Se iban a cambiar 0 filas", primero volvé a correr la vista previa (3):
-- si da 0 filas, la normalización ya estaba aplicada (por ejemplo, el script se corrió dos veces)
-- y no hay nada más que hacer. Buscá otra causa solo si la vista previa sigue mostrando filas.
do $$
declare cambiadas integer;
begin
  if exists (select 1 from public.analisis_eventos
             where tipo = 'Pase correcto' and resultado = 'Fallido') then
    raise exception 'Quedan pases correctos con resultado Fallido: revisalos antes de normalizar.';
  end if;

  update public.analisis_eventos e
  set resultado = case when t.resultado_implicito is not null then t.resultado_implicito
                       when cardinality(t.resultados) = 0 then null
                       else e.resultado end
  from public.analisis_tipos_accion t
  where t.codigo = e.tipo
    and e.resultado is distinct from
        (case when t.resultado_implicito is not null then t.resultado_implicito
              when cardinality(t.resultados) = 0 then null
              else e.resultado end);
  get diagnostics cambiadas = row_count;

  if cambiadas <> TOTAL_ESPERADO then
    raise exception 'Se iban a cambiar % filas y se esperaban TOTAL_ESPERADO. No se guardó nada.', cambiadas;
  end if;
end $$;
