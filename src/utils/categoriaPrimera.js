import { supabase } from '../supabaseClient'

// Devuelve el id de la categoría "Primera División" (única categoría donde
// aplica el sistema de Carga/CMJ/Semáforo).
export async function obtenerCategoriaPrimeraDivision({ exigirLectura = false } = {}) {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre')
    .ilike('nombre', '%primera%')
    .limit(1)
    .maybeSingle()
  if (exigirLectura && error) throw error
  return data || null
}
