// Entrada HTTP real, compilada por Vite. No contiene tokens ni identidad de sesión.
export const RUTA_VENTANA_ANALISIS = '/analisis-ventana.html'
export const CANAL_VENTANA_ANALISIS = 'comunicaciones:analisis-auxiliar:v1'
export const ID_CONTENIDO_ANALISIS = 'analisis-auxiliar-contenido'

export function esVentanaAnalisis(url, origen) {
  try {
    const u = new URL(url)
    return u.origin === origen && u.pathname === RUTA_VENTANA_ANALISIS && !u.search && !u.hash
  } catch { return false }
}
