import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CLAVE_ESTILO, normalizarEstilo } from '../utils/analisis/dibujos/estilo'

// «Mi estilo» de los dibujos de Análisis (docs/analisis-dibujos-pro.md §Mi estilo). Se guarda en los datos de la cuenta
// (user_metadata.analisis_estilo, así vale en cualquier compu; no se usa para permisos) y una copia en este navegador,
// por usuario. Si no se puede guardar en la cuenta (sin conexión), queda en el navegador y se avisa.
const claveDe = (uid) => `${CLAVE_ESTILO}:${uid || 'sin-usuario'}`
function leerLocal(uid) {
  try { return normalizarEstilo(JSON.parse(window.localStorage.getItem(claveDe(uid)) || '{}')) } catch { return {} }
}
function guardarLocal(uid, estilo) {
  try { window.localStorage.setItem(claveDe(uid), JSON.stringify(estilo)) } catch { /* Sin almacenamiento en este navegador. */ }
}

export function useMiEstilo() {
  const [estilo, setEstilo] = useState({})
  const uidRef = useRef(null)

  useEffect(() => {
    let vigente = true
    const sesion = (() => { try { return supabase?.auth?.getSession?.() } catch { return null } })()
    if (!sesion?.then) { setEstilo(leerLocal(null)); return undefined } // eslint-disable-line react-hooks/set-state-in-effect
    sesion.then(({ data }) => {
      if (!vigente) return
      const usuario = data?.session?.user
      uidRef.current = usuario?.id || null
      const remoto = usuario?.user_metadata?.analisis_estilo
      const leido = remoto && typeof remoto === 'object' ? normalizarEstilo(remoto) : leerLocal(uidRef.current)
      if (remoto) guardarLocal(uidRef.current, leido)
      setEstilo(leido)
    }).catch(() => { /* Sin sesión: queda el estilo vacío. */ })
    return () => { vigente = false }
  }, [])

  // Devuelve {} si quedó en la cuenta, o { soloNavegador: true } si solo se pudo guardar en este navegador.
  const guardar = useCallback(async (nuevo) => {
    const limpio = normalizarEstilo(nuevo)
    setEstilo(limpio)
    guardarLocal(uidRef.current, limpio)
    try {
      if (!supabase?.auth?.updateUser) return { soloNavegador: true }
      const { error } = await supabase.auth.updateUser({ data: { analisis_estilo: limpio } })
      return error ? { soloNavegador: true } : {}
    } catch {
      return { soloNavegador: true }
    }
  }, [])

  return { estilo, guardar }
}
