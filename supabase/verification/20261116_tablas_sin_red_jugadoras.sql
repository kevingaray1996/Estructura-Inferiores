-- Tablas de public con RLS que NO tienen la política RESTRICTIVE sin_cuentas_jugadoras.
-- Solo lectura: se puede correr cuando se quiera en el editor SQL de Supabase. Tiene que devolver 0 filas.
-- Si aparece una tabla, agregarle en su migración:
--   CREATE POLICY sin_cuentas_jugadoras ON public.<tabla> AS RESTRICTIVE FOR ALL TO authenticated
--     USING (NOT (SELECT portal_privado.es_cuenta_jugadora()))
--     WITH CHECK (NOT (SELECT portal_privado.es_cuenta_jugadora()));
SELECT c.relname AS tabla
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
      AND p.policyname = 'sin_cuentas_jugadoras'
      AND p.permissive = 'RESTRICTIVE'
  )
ORDER BY c.relname;
