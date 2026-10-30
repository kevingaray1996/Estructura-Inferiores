import { createPortal } from 'react-dom'

export default function ZonaVentanaAnalisis({ tipo, ventana, encabezado, children }) {
  if (ventana.modo !== tipo) return children
  if (!ventana.conectado || !ventana.nodo) return null
  return createPortal(<div className="analisis-auxiliar">
    <header className="analisis-auxiliar-cabecera">{encabezado}</header>
    {children}
  </div>, ventana.nodo)
}
