import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { leerPaginas } from '../utils/rendimiento/lecturas'
import { claveClip } from '../utils/analisis/clips'
import { estaVacio, excedeTamano, normalizarDibujo } from '../utils/analisis/dibujos/formato'

const faltaTabla = (e) => ['42P01', 'PGRST205'].includes(e?.code)
const COLUMNAS = 'id, evento_id, espejo, partido_id, actualizado_en'

// Dibujos de los clips (etapa 4). Para que Análisis no se vuelva pesado, primero se lee solo QUÉ clips tienen dibujos
// (sin el JSON); el JSON de un clip se pide cuando se lo va a reproducir o editar, y queda guardado en memoria.
//   tiene(eventoId, espejo) · cargar(eventoId, espejo) → Promise<{ dibujo, aviso } | null>
//   guardar(clip, dibujo) → { error? } (si el dibujo queda vacío, se borra el registro)
export default function useDibujos(activo) {
  const [estado, setEstado] = useState({ cargado: false, filas: [], aviso: '', sinTabla: false })
  const cache = useRef(new Map()) // clave → { actualizado_en, valor }

  useEffect(() => {
    if (!activo) return undefined
    let vigente = true
    leerPaginas(() => supabase.from('analisis_dibujos').select(COLUMNAS))
      .then((filas) => { if (vigente) setEstado({ cargado: true, filas, aviso: '', sinTabla: false }) })
      .catch((e) => {
        if (!vigente) return
        setEstado({
          cargado: true, filas: [], sinTabla: faltaTabla(e),
          aviso: faltaTabla(e) ? 'Los dibujos todavía no están habilitados: falta correr la migración de la etapa 4.' : 'No se pudieron leer los dibujos de los clips.',
        })
      })
    return () => { vigente = false }
  }, [activo])

  const indice = useMemo(() => new Map(estado.filas.map((f) => [claveClip(f.evento_id, f.espejo), f])), [estado.filas])
  const tiene = useCallback((eventoId, espejo = false) => indice.has(claveClip(eventoId, espejo)), [indice])

  const cargar = useCallback(async (eventoId, espejo = false) => {
    const clave = claveClip(eventoId, espejo)
    const fila = indice.get(clave)
    if (!fila) return null
    const guardado = cache.current.get(clave)
    if (guardado && guardado.actualizado_en === fila.actualizado_en) return guardado.valor
    const { data, error } = await supabase.from('analisis_dibujos').select('datos').eq('id', fila.id).maybeSingle()
    if (error || !data) return { dibujo: null, aviso: 'No se pudieron leer los dibujos de este clip.' }
    const r = normalizarDibujo(data.datos)
    const valor = { dibujo: r.ok ? r.dibujo : null, aviso: r.aviso }
    cache.current.set(clave, { actualizado_en: fila.actualizado_en, valor })
    return valor
  }, [indice])

  const guardar = useCallback(async ({ eventoId, espejo = false, partidoId }, dibujoCrudo) => {
    const clave = claveClip(eventoId, espejo)
    const { dibujo } = normalizarDibujo(dibujoCrudo)
    if (excedeTamano(dibujo)) return { error: 'Los dibujos de este clip son demasiados (máximo 200 KB). Borrá algunos puntos clave u objetos.' }
    if (estaVacio(dibujo)) {
      const fila = indice.get(clave)
      if (fila) {
        const { error } = await supabase.from('analisis_dibujos').delete().eq('id', fila.id)
        if (error) return { error: 'No se pudieron borrar los dibujos. Probá de nuevo.' }
      }
      cache.current.delete(clave)
      setEstado((e) => ({ ...e, filas: e.filas.filter((f) => claveClip(f.evento_id, f.espejo) !== clave) }))
      return {}
    }
    const { data, error } = await supabase.from('analisis_dibujos')
      .upsert({ evento_id: eventoId, espejo: Boolean(espejo), partido_id: partidoId, datos: dibujo }, { onConflict: 'evento_id,espejo' })
      .select(COLUMNAS).single()
    if (error) {
      if (faltaTabla(error)) return { error: 'Falta correr la migración de la etapa 4 en Supabase.' }
      if (error.code === '42501') return { error: 'No tenés permiso para guardar dibujos (solo coordinación).' }
      return { error: 'No se pudieron guardar los dibujos. Probá de nuevo.' }
    }
    cache.current.set(clave, { actualizado_en: data.actualizado_en, valor: { dibujo, aviso: '' } })
    setEstado((e) => ({ ...e, filas: [...e.filas.filter((f) => f.id !== data.id && claveClip(f.evento_id, f.espejo) !== clave), data] }))
    return {}
  }, [indice])

  return useMemo(() => ({
    listo: estado.cargado && !estado.aviso,
    aviso: estado.aviso,
    sinTabla: estado.sinTabla,
    filas: estado.filas,
    tiene, cargar, guardar,
  }), [estado, tiene, cargar, guardar])
}
