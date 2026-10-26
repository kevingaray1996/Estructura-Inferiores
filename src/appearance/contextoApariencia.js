import { createContext, useContext } from 'react'

export const ContextoApariencia = createContext(null)

export function useApariencia() {
  const contexto = useContext(ContextoApariencia)
  if (!contexto) throw new Error('useApariencia requiere ProveedorApariencia.')
  return contexto
}
