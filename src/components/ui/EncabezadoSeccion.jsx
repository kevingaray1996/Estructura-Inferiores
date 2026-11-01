import './panelDeportivo.css'

/** Solo presentación. El padre proporciona las acciones ya autorizadas. */
export default function EncabezadoSeccion({ titulo, descripcion, acciones, children, nivel = 1, id }) {
  const Titulo = `h${[1, 2, 3, 4, 5, 6].includes(nivel) ? nivel : 1}`
  return <header className="dp-encabezado">
    <div className="dp-encabezado-fila">
      <div className="dp-encabezado-textos">
        <Titulo id={id} className="dp-titulo">{titulo}</Titulo>
        {descripcion && <p className="dp-descripcion">{descripcion}</p>}
      </div>
      {acciones && <div className="dp-acciones" role="group" aria-label="Acciones de la sección">{acciones}</div>}
    </div>
    {children && <div className="dp-encabezado-extra">{children}</div>}
  </header>
}
