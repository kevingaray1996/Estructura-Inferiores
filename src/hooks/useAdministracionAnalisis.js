import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { consultarAdministracionAnalisis, esCuentaAdministradoraAnalisis, faltaRpcAdministracionAnalisis } from '../utils/permisosAnalisis'

// Ven Análisis sin editar. Lo que ve cada cuenta lo decide RLS (puede_consultar_analisis en la base).
const ROLES_CONSULTA = ['coordinacion', 'tecnico']

export default function useAdministracionAnalisis(sesion, rol) {
  const usuarioId = sesion?.user?.id
  const token = sesion?.access_token
  const [lectura, setLectura] = useState(null)
  useEffect(() => {
    let vigente = true, pendiente = false
    async function verificar() {
      if (!vigente || pendiente) return
      pendiente = true
      setLectura(prev => ({ usuarioId, token, rol, estado: 'verificando', conservar: prev?.usuarioId === usuarioId && prev?.rol === rol && (prev?.estado === 'permitido' || prev?.conservar) }))
      try {
        const permitido = usuarioId && rol === 'coordinacion' ? await consultarAdministracionAnalisis(supabase) : false
        if (vigente) setLectura({ usuarioId, token, rol, estado: permitido ? 'permitido' : 'denegado', conservar: Boolean(permitido) })
      } catch (error) {
        if (vigente) setLectura(prev => ({ usuarioId, token, rol, estado: faltaRpcAdministracionAnalisis(error) ? 'pendiente_migracion' : 'error', conservar: prev?.usuarioId === usuarioId && prev?.rol === rol && Boolean(prev.conservar) }))
      } finally { pendiente = false }
    }
    const alVolver = () => { if (document.visibilityState === 'visible') verificar() }
    Promise.resolve().then(() => { if (vigente) verificar() })
    const intervalo = window.setInterval(verificar, 30000)
    window.addEventListener('focus', verificar)
    document.addEventListener('visibilitychange', alVolver)
    return () => { vigente = false; window.clearInterval(intervalo); window.removeEventListener('focus', verificar); document.removeEventListener('visibilitychange', alVolver) }
  }, [usuarioId, token, rol])
  const mismaIdentidad = Boolean(usuarioId && rol === 'coordinacion' && lectura?.usuarioId === usuarioId && lectura?.rol === rol)
  // El acceso a la interfaz no concede escritura. Una denegación real sí retira el editor.
  const candidato = Boolean(esCuentaAdministradoraAnalisis(usuarioId) && rol === 'coordinacion')
  const denegadoActual = mismaIdentidad && lectura.token === token && lectura.estado === 'denegado'
  return {
    puedeConsultar: Boolean(usuarioId) && ROLES_CONSULTA.includes(rol),
    puedeAbrir: candidato && !denegadoActual,
    puedeMontar: mismaIdentidad && (lectura.estado === 'permitido' || lectura.conservar),
    puedeEscribir: mismaIdentidad && lectura.token === token && lectura.estado === 'permitido',
    estado: mismaIdentidad && lectura.token === token ? lectura.estado : 'verificando',
  }
}
