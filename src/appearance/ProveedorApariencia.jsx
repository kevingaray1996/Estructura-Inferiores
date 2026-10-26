import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ContextoApariencia } from './contextoApariencia'
import { crearGestorApariencia } from './gestorApariencia'

export default function ProveedorApariencia({ auth, children }) {
  const [gestor] = useState(() => crearGestorApariencia({
    obtenerAlmacen: () => window.localStorage,
    sistemaOscuro: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  }))
  const estado = useSyncExternalStore(gestor.subscribe, gestor.getSnapshot, gestor.getSnapshot)

  useLayoutEffect(() => {
    document.documentElement.dataset.apariencia = estado.temaEfectivo
  }, [estado.temaEfectivo])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const actualizar = () => gestor.cambiarSistema(consulta.matches)
    actualizar()
    if (consulta.addEventListener) consulta.addEventListener('change', actualizar)
    else consulta.addListener(actualizar)
    return () => {
      if (consulta.removeEventListener) consulta.removeEventListener('change', actualizar)
      else consulta.removeListener(actualizar)
    }
  }, [gestor])

  useEffect(() => {
    if (!auth) return
    let activo = true
    let recibioEvento = false
    const { data } = auth.onAuthStateChange((_evento, sesion) => {
      recibioEvento = true
      if (activo) gestor.cambiarUsuario(sesion?.user?.id ?? null)
    })
    // El resultado inicial no debe sobreescribir un cambio de cuenta posterior.
    auth.getSession().then(({ data: sesion, error }) => {
      if (activo && !recibioEvento && !error) gestor.cambiarUsuario(sesion?.session?.user?.id ?? null)
    }).catch(() => { /* El listener conserva la identidad cuando se restablece la sesion. */ })
    return () => { activo = false; data.subscription.unsubscribe() }
  }, [auth, gestor])

  const valor = useMemo(() => ({ ...estado, establecerPreferencia: gestor.cambiarPreferencia }), [estado, gestor])
  return <ContextoApariencia.Provider value={valor}>{children}</ContextoApariencia.Provider>
}
