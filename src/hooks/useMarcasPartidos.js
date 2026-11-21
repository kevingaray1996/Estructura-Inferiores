import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MARCAS } from '../utils/analisis/eventosPartido'

const TIPOS = MARCAS.map((m) => m.tipo)

// Marcas de tiempo de todos los análisis (para el mapa con «Todos los partidos»). Solo lectura.
// Devuelve un Map partido_id -> { inicio_1t, fin_1t, inicio_2t, fin_partido }. Si falla, el mapa avisa que faltan.
export default function useMarcasPartidos(activo) {
  const [marcas, setMarcas] = useState(() => new Map())
  useEffect(() => {
    if (!activo) return undefined
    let cancelado = false
    supabase.from('analisis_partido_eventos').select('partido_id, tipo, segundo').in('tipo', TIPOS)
      .then(({ data, error }) => {
        if (cancelado || error) return
        const mapa = new Map()
        for (const fila of data || []) {
          if (!mapa.has(fila.partido_id)) mapa.set(fila.partido_id, Object.fromEntries(TIPOS.map((t) => [t, null])))
          mapa.get(fila.partido_id)[fila.tipo] = Number(fila.segundo)
        }
        setMarcas(mapa)
      }, () => {})
    return () => { cancelado = true }
  }, [activo])
  return marcas
}
