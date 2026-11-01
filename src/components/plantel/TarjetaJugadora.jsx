import { textoPlantel, fondoEstadoPlantel } from '../../appearance/plantel'
import './plantel.css'

/** Valores y estado proceden del listado; no consulta ni calcula estadísticas. */
export default function TarjetaJugadora({ jugadora, estado, minutos, goles, titularidades, foto, onAbrir }) {
  return <button type="button" className="plantel-jugadora" data-jugadora-id={jugadora.id}
    onClick={() => onAbrir(jugadora.id)} title={jugadora.estado_detalle || 'Abrir perfil'}
    style={{ borderTopColor: estado.color }}>
    <div className="plantel-jugadora-cabecera">
      <div className="plantel-jugadora-foto">{foto}</div>
      <div className="plantel-jugadora-identidad">
        <h3>{jugadora.apellido}{jugadora.apellido && jugadora.nombre ? ', ' : ''}{jugadora.nombre}</h3>
        <p>{jugadora.posicion || 'Posición sin cargar'}</p>
        {jugadora.posicion_secundaria && <p className="plantel-jugadora-secundaria">También: {jugadora.posicion_secundaria}</p>}
      </div>
    </div>
    <div className="plantel-jugadora-estado" style={{ color: textoPlantel(estado.color), backgroundColor: fondoEstadoPlantel(estado.fondo) }}>
      <span aria-hidden="true" style={{ backgroundColor: estado.color }} />{estado.label}
    </div>
    <dl className="plantel-jugadora-estadisticas">
      <div><dt>Minutos</dt><dd>{minutos.toLocaleString('es-AR')}</dd></div>
      <div><dt>Goles</dt><dd>{goles}</dd></div>
      <div><dt>Titularidades</dt><dd>{titularidades}</dd></div>
    </dl>
    <span className="plantel-jugadora-enlace">Abrir perfil <span aria-hidden="true">→</span></span>
  </button>
}
