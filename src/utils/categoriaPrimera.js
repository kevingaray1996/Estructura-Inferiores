import { supabase } from '../supabaseClient'

// Devuelve el id de la categoría "Primera División" (única categoría donde
// aplica el sistema de Carga/CMJ/Semáforo).
export async function obtenerCategoriaPrimeraDivision() {
  const { data } = await supabase
    .from('categorias')
    .select('id, nombre')
    .ilike('nombre', '%primera%')
    .limit(1)
    .maybeSingle()
  return data || null
}
