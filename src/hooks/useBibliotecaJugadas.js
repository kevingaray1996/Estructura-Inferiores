import { useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { datosParaGuardar } from '../utils/biblioteca'

// Biblioteca de jugadas desde Análisis (etapa 5): leer las carpetas de Cancha y guardar una jugada nueva con la RPC de
// siempre (guardar_ejercicio_pizarra, que valida la pizarra y aplica los permisos de la Biblioteca).
export default function useBibliotecaJugadas() {
  return useMemo(() => ({
    async cargarCarpetas() {
      const { data, error } = await supabase.from('biblioteca_carpetas').select('id, ambito, nombre, orden, sistema').eq('ambito', 'cancha').order('orden')
      return { carpetas: data || [], error: error ? 'No se pudieron leer las carpetas de la Biblioteca.' : '' }
    },
    async guardar(form) {
      const { data, error } = await supabase.rpc('guardar_ejercicio_pizarra', { p_id: null, p_revision: null, p_datos: datosParaGuardar(form) })
      if (!error) return { id: data?.id || null }
      if (error.code === '42501') return { error: 'No tenés permiso para guardar en la Biblioteca de Cancha.' }
      if (error.code === '22023') return { error: 'La Biblioteca no aceptó la jugada (formato inválido). Avisá al administrador.' }
      return { error: 'No se pudo guardar en la Biblioteca. Probá de nuevo.' }
    },
  }), [])
}
