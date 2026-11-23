import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { leerPaginas } from '../utils/rendimiento/lecturas'
import { filaDeClip } from '../utils/analisis/filtroPlaylist'

const faltaTabla = (e) => ['42P01', 'PGRST205'].includes(e?.code)

// Lee playlists y clips. Devuelve { playlists, clips } o { aviso } si no se pudo.
async function leerTodo() {
  const { data, error } = await supabase.from('analisis_playlists').select('*').order('actualizado_en', { ascending: false })
  if (error) {
    return { aviso: faltaTabla(error) ? 'Las playlists todavía no están habilitadas: falta correr la migración de la etapa 2.' : 'No se pudieron leer las playlists.' }
  }
  try {
    const filas = await leerPaginas(() => supabase.from('analisis_playlist_clips').select('*').order('orden'))
    const clips = new Map()
    for (const f of filas) {
      if (!clips.has(f.playlist_id)) clips.set(f.playlist_id, [])
      clips.get(f.playlist_id).push(f)
    }
    return { playlists: data || [], clips }
  } catch {
    return { aviso: 'No se pudieron leer los clips de las playlists.' }
  }
}

// Playlists de Análisis (analisis_playlists + analisis_playlist_clips). Lee las que la base deja ver (coordinación
// todas, cuerpo técnico las de su categoría). Las escrituras las rechaza la base si no es coordinación.
// Cada función devuelve { error } con un mensaje en castellano si algo falla.
export default function usePlaylists(activo = true) {
  const [playlists, setPlaylists] = useState([])
  const [clipsPorPlaylist, setClipsPorPlaylist] = useState(() => new Map())
  const [estado, setEstado] = useState({ cargando: true, aviso: '' })

  const aplicar = useCallback((r) => {
    if (r.aviso) { setEstado({ cargando: false, aviso: r.aviso }); return }
    setPlaylists(r.playlists)
    setClipsPorPlaylist(r.clips)
    setEstado({ cargando: false, aviso: '' })
  }, [])

  const recargar = useCallback(async () => aplicar(await leerTodo()), [aplicar])

  useEffect(() => {
    if (!activo) return undefined
    let vigente = true
    async function cargar() {
      const r = await leerTodo()
      if (vigente) aplicar(r)
    }
    cargar()
    return () => { vigente = false }
  }, [activo, aplicar])

  // Crea la playlist con sus clips (en el orden dado). filtro: null si se armó a mano.
  const crear = useCallback(async ({ nombre, categoriaId, filtro, descripcion = null, clips }) => {
    const { data, error } = await supabase.from('analisis_playlists')
      .insert({ nombre: nombre.trim(), categoria_id: categoriaId, filtro, descripcion }).select().single()
    if (error) return { error: 'No se pudo guardar la playlist.' }
    if (clips.length) {
      const { error: e } = await supabase.from('analisis_playlist_clips').insert(clips.map((c, i) => filaDeClip(data.id, c, i)))
      if (e) {
        await supabase.from('analisis_playlists').delete().eq('id', data.id)
        return { error: 'No se pudieron guardar los clips. La playlist no se creó.' }
      }
    }
    await recargar()
    return { playlist: data }
  }, [recargar])

  const actualizar = useCallback(async (id, cambios) => {
    const { error } = await supabase.from('analisis_playlists').update(cambios).eq('id', id)
    if (error) return { error: 'No se pudo guardar el cambio.' }
    setPlaylists((lista) => lista.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
    return {}
  }, [])

  const borrar = useCallback(async (id) => {
    const { error } = await supabase.from('analisis_playlists').delete().eq('id', id)
    if (error) return { error: 'No se pudo borrar la playlist.' }
    setPlaylists((lista) => lista.filter((p) => p.id !== id))
    return {}
  }, [])

  // Suma clips al final (desde el filtro, la línea de tiempo o la lista de Acciones).
  const sumarClips = useCallback(async (playlistId, clips) => {
    const actuales = clipsPorPlaylist.get(playlistId) || []
    const ya = new Set(actuales.map((f) => `${f.evento_id}:${f.espejo}`))
    const nuevos = clips.filter((c) => !ya.has(`${c.eventoId}:${c.espejo}`))
    if (!nuevos.length) return { sumados: 0 }
    const desde = actuales.reduce((m, f) => Math.max(m, f.orden + 1), 0)
    const { error } = await supabase.from('analisis_playlist_clips').insert(nuevos.map((c, i) => filaDeClip(playlistId, c, desde + i)))
    if (error) return { error: 'No se pudieron agregar los clips.' }
    await supabase.from('analisis_playlists').update({ actualizado_en: new Date().toISOString() }).eq('id', playlistId)
    await recargar()
    return { sumados: nuevos.length }
  }, [clipsPorPlaylist, recargar])

  // Cambia nota o ajuste de un clip (solo de la playlist; la acción original no se toca).
  const editarClip = useCallback(async (filaId, playlistId, cambios) => {
    const { error } = await supabase.from('analisis_playlist_clips').update(cambios).eq('id', filaId)
    if (error) return { error: 'No se pudo guardar el clip.' }
    setClipsPorPlaylist((mapa) => new Map(mapa).set(playlistId, (mapa.get(playlistId) || []).map((f) => (f.id === filaId ? { ...f, ...cambios } : f))))
    return {}
  }, [])

  // Quita un clip y lo anota en «quitados», así «Actualizar con el filtro» no lo vuelve a sumar.
  const quitarClip = useCallback(async (playlist, fila, clave) => {
    const { error } = await supabase.from('analisis_playlist_clips').delete().eq('id', fila.id)
    if (error) return { error: 'No se pudo quitar el clip.' }
    const quitados = [...new Set([...(playlist.quitados || []), clave])].slice(-2000)
    await supabase.from('analisis_playlists').update({ quitados }).eq('id', playlist.id)
    setPlaylists((lista) => lista.map((p) => (p.id === playlist.id ? { ...p, quitados } : p)))
    setClipsPorPlaylist((mapa) => new Map(mapa).set(playlist.id, (mapa.get(playlist.id) || []).filter((f) => f.id !== fila.id)))
    return {}
  }, [])

  // Nuevo orden (lista de ids de filas). Solo se escriben las que cambian de lugar.
  const reordenar = useCallback(async (playlistId, idsEnOrden) => {
    const filas = clipsPorPlaylist.get(playlistId) || []
    const porId = new Map(filas.map((f) => [f.id, f]))
    const cambios = idsEnOrden.map((id, orden) => ({ id, orden })).filter(({ id, orden }) => porId.get(id)?.orden !== orden)
    setClipsPorPlaylist((mapa) => new Map(mapa).set(playlistId, idsEnOrden.map((id, orden) => ({ ...porId.get(id), orden }))))
    const resultados = await Promise.all(cambios.map(({ id, orden }) => supabase.from('analisis_playlist_clips').update({ orden }).eq('id', id)))
    if (resultados.some((r) => r.error)) { await recargar(); return { error: 'No se pudo guardar el orden nuevo.' } }
    return {}
  }, [clipsPorPlaylist, recargar])

  return { playlists, clipsPorPlaylist, estado, recargar, crear, actualizar, borrar, sumarClips, editarClip, quitarClip, reordenar }
}
