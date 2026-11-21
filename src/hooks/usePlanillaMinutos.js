import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { mensajeErrorOPropio } from '../utils/mensajesError'

// Minutos de la planilla del partido del calendario (estadisticas_jugador, la que se completa en Convocados).
// La tabla no tiene una clave única por jugadora y partido: se busca la fila y se actualiza, o se crea.
export default function usePlanillaMinutos(partidoCalendarioId, activo) {
  const [estado, setEstado] = useState({ id: null, filas: [], cargando: false, error: '' })
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!partidoCalendarioId || !activo) return undefined
    let cancelado = false
    async function cargar() {
      setEstado((e) => ({ ...e, id: partidoCalendarioId, cargando: true, error: '' }))
      const { data, error } = await supabase.from('estadisticas_jugador').select('id, jugador_id, minutos_jugados, titular').eq('partido_id', partidoCalendarioId)
      if (cancelado) return
      setEstado({ id: partidoCalendarioId, filas: data || [], cargando: false, error: error ? mensajeErrorOPropio(error, 'leer la planilla del partido') : '' })
    }
    cargar()
    return () => { cancelado = true }
  }, [partidoCalendarioId, activo, recarga])

  const filas = estado.id === partidoCalendarioId ? estado.filas : []
  // Minutos en la planilla por jugadora (si hay más de una fila, la primera).
  const minutosPlanilla = Object.fromEntries([...filas].reverse().map((f) => [f.jugador_id, f.minutos_jugados]))

  // lista: [{ jugador_id, minutos, titular }]. Devuelve cuántas filas se guardaron; si algo falla, lanza el error.
  const guardar = useCallback(async (lista) => {
    let guardadas = 0
    try {
      for (const { jugador_id, minutos, titular } of lista) {
        const existentes = filas.filter((f) => f.jugador_id === jugador_id)
        if (existentes.length) {
          const { error } = await supabase.from('estadisticas_jugador').update({ minutos_jugados: minutos }).in('id', existentes.map((f) => f.id))
          if (error) throw error
        } else {
          const { error } = await supabase.from('estadisticas_jugador')
            .insert({ jugador_id, partido_id: partidoCalendarioId, minutos_jugados: minutos, titular: Boolean(titular) })
          if (error) throw error
        }
        guardadas += 1
      }
    } finally {
      // Siempre se vuelve a leer: si se cortó a mitad de camino, un nuevo intento actualiza (no duplica) lo ya guardado.
      setRecarga((n) => n + 1)
    }
    return guardadas
  }, [filas, partidoCalendarioId])

  return { minutosPlanilla, cargando: estado.cargando, error: estado.error, guardar }
}
