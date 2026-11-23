import { useState } from 'react'
import { resumenCola } from '../../utils/analisis/colaEtiquetado'
import './etiquetado.css'

// Indicador discreto del guardado de fondo de la botonera: «Guardando…», «Todo guardado» o el error.
// Antes de la primera acción de la sesión no muestra nada (no hay nada que avisar).
export default function EstadoGuardado({ items }) {
  const [huboActividad, setHuboActividad] = useState(false)
  if (!huboActividad && items.length > 0) setHuboActividad(true)
  const { estado, texto } = resumenCola(items)
  if (!huboActividad && estado === 'guardado') return null
  return (
    <p className="et-estado-cola" data-estado={estado} role="status" aria-live="polite">
      <span className="et-estado-cola-punto" aria-hidden="true" />
      {texto}
    </p>
  )
}
