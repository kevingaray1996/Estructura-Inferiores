import './panelDeportivo.css'

/** Los controles y sus etiquetas pertenecen al padre; no se altera su lógica. */
export default function BarraFiltros({ children, acciones, etiqueta = 'Filtros' }) {
  return <div className="dp-filtros" role="group" aria-label={etiqueta}>
    <div className="dp-filtros-controles">{children}</div>
    {acciones && <div className="dp-acciones dp-filtros-acciones">{acciones}</div>}
  </div>
}
