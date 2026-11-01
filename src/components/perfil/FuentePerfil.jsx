import EstadoContenido from '../ui/EstadoContenido'

import { estadoErrorPerfil } from './presentacionPerfil'

export default function FuentePerfil({ fuente, permitido = true, titulo, children }) {
  if (!permitido) return <EstadoContenido estado="denegado" titulo={titulo}
    mensaje="Este bloque permanece protegido para tu acceso. No se modificaron permisos." />
  if (fuente?.error) return <EstadoContenido estado={estadoErrorPerfil(fuente.error)} titulo={titulo}
    mensaje={estadoErrorPerfil(fuente.error) === 'denegado' ? 'La sesión no tiene acceso a esta fuente. No equivale a ausencia de registros.' : 'No se pudo consultar esta fuente. Volvé a abrir el perfil para reintentar.'} />
  return children
}
