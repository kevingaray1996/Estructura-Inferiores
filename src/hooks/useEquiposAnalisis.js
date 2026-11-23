import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { validarEquipoNuevo } from '../utils/analisis/equipos'

// Listado de equipos (public.equipos) para Análisis: scouting, filtros y tablero por equipo. Lee todos (también los
// inactivos, que siguen en los filtros). agregar(nombre) crea uno nuevo y lo devuelve.
const leerEquipos = () => supabase.from('equipos').select('*').order('nombre')

export default function useEquiposAnalisis() {
  const [equipos, setEquipos] = useState([])
  const [error, setError] = useState('')

  const aplicar = useCallback(({ data, error: e }) => {
    if (e) { setError('No se pudo leer el listado de equipos.'); return }
    setError('')
    setEquipos(data || [])
  }, [])

  const recargar = useCallback(async () => aplicar(await leerEquipos()), [aplicar])

  useEffect(() => {
    let vigente = true
    async function cargar() {
      const r = await leerEquipos()
      if (vigente) aplicar(r)
    }
    cargar()
    return () => { vigente = false }
  }, [aplicar])

  const agregar = useCallback(async (nombre) => {
    const v = validarEquipoNuevo(nombre, equipos)
    if (!v.ok) {
      if (v.existente) return { equipo: v.existente }
      return { error: v.motivo }
    }
    const { data, error: e } = await supabase.from('equipos').insert({ nombre: v.nombre }).select().single()
    if (e) return { error: 'No se pudo agregar el equipo. Probá de nuevo.' }
    setEquipos((lista) => [...lista, data].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')))
    return { equipo: data }
  }, [equipos])

  return { equipos, error, recargar, agregar }
}
