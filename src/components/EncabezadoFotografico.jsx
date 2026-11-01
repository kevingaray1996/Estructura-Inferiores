import './fotografiasClub.css'

// Solo presentación: las fotografías se sirven completas desde public, sin variantes.
export default function EncabezadoFotografico({ titulo, imagen, descripcionImagen, children, posicion = 'centro' }) {
  return <header className={`club-foto-encabezado club-foto-${posicion}`}>
    <img src={imagen} alt={descripcionImagen} decoding="async" />
    <div className="club-foto-contenido"><p>CLUB COMUNICACIONES</p><h1>{titulo}</h1>
      {children && <div className="club-foto-acciones">{children}</div>}
    </div>
  </header>
}
