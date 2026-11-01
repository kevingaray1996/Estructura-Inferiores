import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { leerDatosRendimiento } from '../../utils/rendimiento/lecturas.js'

// Una carga por usuario/categoría compartida por las pestañas del centro.
export default function useDatosRendimiento(activo, categoriaId) {
  const [usuario, setUsuario] = useState(null)
  const [lectura, setLectura] = useState(null)
  const [revisionSesion, setRevisionSesion] = useState(0)
  const version = useRef(0)
  const pendiente = useRef(null)
  const sesion = useRef(null)
  const invalidar = useCallback(() => { version.current++; pendiente.current = null }, [])
  useEffect(() => {
    let vigente = true, cambio = false
    function aplicar(id, reiniciar = false) {
      if (!vigente) return
      if (sesion.current !== id || reiniciar) {
        invalidar(); setLectura(null)
        setRevisionSesion(n => n + 1)
      }
      sesion.current = id; setUsuario(id)
    }
    supabase.auth?.getSession?.().then(({ data, error }) => {
      if (!cambio) aplicar(!error ? data?.session?.user?.id || null : null)
    }).catch(() => { if (!cambio) aplicar(null) })
    const listener = supabase.auth?.onAuthStateChange?.((evento, session) => {
      cambio = true
      aplicar(session?.user?.id || null, evento === 'SIGNED_OUT' || evento === 'USER_UPDATED')
    })
    return () => { vigente = false; invalidar(); listener?.data?.subscription?.unsubscribe() }
  }, [invalidar])
  const clave = `${usuario || ''}:${categoriaId || ''}:${revisionSesion}`
  const datos = lectura?.clave === clave ? lectura.datos : null
  const cargando = lectura?.clave === clave && lectura.cargando
  const actualizar = useCallback(() => {
    if (!usuario || !categoriaId) return Promise.resolve()
    if (pendiente.current?.clave === clave) return pendiente.current.promesa
    const ticket = ++version.current
    setLectura({ clave, datos: null, cargando: true })
    const promesa = leerDatosRendimiento(supabase, categoriaId).then(resultado => {
      if (version.current === ticket) setLectura({ clave, datos: resultado, cargando: false })
    }).finally(() => { if (pendiente.current?.ticket === ticket) pendiente.current = null })
    pendiente.current = { clave, ticket, promesa }
    return promesa
  }, [usuario, categoriaId, clave])
  useEffect(() => invalidar, [clave, invalidar])
  useEffect(() => {
    let vigente = true
    if (activo && usuario && categoriaId && !datos) {
      Promise.resolve().then(() => { if (vigente) return actualizar() })
    }
    return () => { vigente = false }
  }, [activo, usuario, categoriaId, datos, actualizar])
  return { usuario, datos, cargando: Boolean(cargando), actualizar, reintentar: actualizar }
}
