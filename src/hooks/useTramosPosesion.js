import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const faltaTabla = (e) => ['42P01', 'PGRST205'].includes(e?.code)

async function leerTramos(partidoId) {
  const { data, error } = await supabase.from('analisis_posesion_tramos').select('id, inicio, fin, estado').eq('partido_id', partidoId).order('inicio')
  if (error) return { tramos: [], aviso: faltaTabla(error) ? 'La posesión a mano todavía no está habilitada: falta correr la migración de la etapa 3.' : 'No se pudieron leer los tramos de posesión.' }
  return { tramos: data || [], aviso: '' }
}

// Tramos de posesión marcados a mano de un análisis (analisis_posesion_tramos). Lo automático no se guarda.
// aplicar(ops): ejecuta { borrar, actualizar, crear } (de insertarTramo / ajustarTramo) en ese orden y vuelve a leer.
export default function useTramosPosesion(partidoId) {
  const [estado, setEstado] = useState({ partidoId: null, tramos: [], aviso: '' })

  useEffect(() => {
    if (!partidoId) return undefined
    let vigente = true
    async function cargar() {
      const r = await leerTramos(partidoId)
      if (vigente) setEstado({ partidoId, ...r })
    }
    cargar()
    return () => { vigente = false }
  }, [partidoId])

  const aplicar = useCallback(async (ops) => {
    if (!partidoId) return { error: 'No hay análisis elegido.' }
    let error = null
    for (const id of ops.borrar || []) {
      const r = await supabase.from('analisis_posesion_tramos').delete().eq('id', id)
      if (r.error) { error = r.error; break }
    }
    if (!error) {
      for (const { id, ...cambios } of ops.actualizar || []) {
        const r = await supabase.from('analisis_posesion_tramos').update(cambios).eq('id', id)
        if (r.error) { error = r.error; break }
      }
    }
    if (!error && (ops.crear || []).length) {
      const r = await supabase.from('analisis_posesion_tramos').insert(ops.crear.map((t) => ({ ...t, partido_id: partidoId })))
      if (r.error) error = r.error
    }
    const releido = await leerTramos(partidoId)
    setEstado({ partidoId, ...releido })
    return error ? { error: 'No se pudo guardar la posesión. Probá de nuevo.' } : {}
  }, [partidoId])

  const tramos = estado.partidoId === partidoId ? estado.tramos : []
  return { tramos, aviso: estado.partidoId === partidoId ? estado.aviso : '', aplicar }
}
