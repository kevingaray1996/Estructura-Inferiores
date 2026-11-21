import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { cambiosDe, marcasDe } from '../utils/analisis/eventosPartido'
import { mensajeErrorOPropio } from '../utils/mensajesError'

const faltaTabla = (error) => ['42P01', 'PGRST205'].includes(error?.code)
const ordenar = (lista) => [...lista].sort((a, b) => Number(a.segundo) - Number(b.segundo))

// Eventos del partido de un análisis (analisis_partido_eventos): se leen al cambiar de análisis y se guardan uno por uno.
export default function useEventosPartido(partidoId) {
  const [estado, setEstado] = useState({ partidoId: null, eventos: [], cargando: false, error: '' })
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!partidoId) return undefined
    let cancelado = false
    async function cargar() {
      setEstado({ partidoId, eventos: [], cargando: true, error: '' })
      const { data, error } = await supabase.from('analisis_partido_eventos').select('*').eq('partido_id', partidoId).order('segundo')
      if (cancelado) return
      if (error) {
        setEstado({ partidoId, eventos: [], cargando: false,
          error: faltaTabla(error) ? 'Falta aplicar en la base la migración de eventos del partido.' : mensajeErrorOPropio(error, 'leer los eventos del partido') })
        return
      }
      setEstado({ partidoId, eventos: ordenar(data || []), cargando: false, error: '' })
    }
    cargar()
    return () => { cancelado = true }
  }, [partidoId, recarga])

  // Del análisis actual solamente (mientras carga otro, no se mezclan).
  const eventos = useMemo(() => (estado.partidoId === partidoId ? estado.eventos : []), [estado, partidoId])
  const marcas = useMemo(() => marcasDe(eventos), [eventos])
  const cambios = useMemo(() => cambiosDe(eventos), [eventos])

  // Crea o edita un evento (con id: edita). Devuelve la fila guardada; si falla, lanza el error.
  const guardar = useCallback(async (evento) => {
    const { id, ...datos } = evento
    const consulta = id
      ? supabase.from('analisis_partido_eventos').update(datos).eq('id', id).select().single()
      : supabase.from('analisis_partido_eventos').insert({ ...datos, partido_id: partidoId }).select().single()
    const { data, error } = await consulta
    if (error) throw error
    setEstado((e) => (e.partidoId !== partidoId ? e
      : { ...e, eventos: ordenar([...e.eventos.filter((x) => x.id !== data.id), data]) }))
    return data
  }, [partidoId])

  const borrar = useCallback(async (id) => {
    const { error } = await supabase.from('analisis_partido_eventos').delete().eq('id', id)
    if (error) throw error
    setEstado((e) => ({ ...e, eventos: e.eventos.filter((x) => x.id !== id) }))
  }, [])

  return {
    eventos, marcas, cambios,
    cargando: estado.partidoId !== partidoId || estado.cargando,
    error: estado.partidoId === partidoId ? estado.error : '',
    recargar: () => setRecarga((n) => n + 1),
    guardar, borrar,
  }
}
