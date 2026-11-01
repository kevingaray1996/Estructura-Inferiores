import { puestoPlantel } from './posicionesPlantel'
import './plantel.css'

/** Valores y estado proceden del listado; no consulta ni calcula estadísticas. */
export default function TarjetaJugadora({ jugadora, foto, onAbrir }) {
  return <button type="button" className="plantel-jugadora" data-jugadora-id={jugadora.id}
    onClick={() => onAbrir(jugadora.id)} title={[jugadora.posicion, jugadora.posicion_secundaria].filter(Boolean).join(' · ') || 'Abrir perfil'}>
    <div className="plantel-jugadora-cabecera">
      <div className="plantel-jugadora-foto">{foto}</div>
      <div className="plantel-jugadora-identidad">
        <h3>{jugadora.apellido}{jugadora.apellido && jugadora.nombre ? ', ' : ''}{jugadora.nombre}</h3>
        <span className="plantel-puesto" title={jugadora.posicion || 'Posición sin cargar'}>{puestoPlantel(jugadora.posicion).abreviatura}</span>
        <p>{jugadora.posicion || 'Posición sin cargar'}</p>
        {jugadora.posicion_secundaria && <p className="plantel-jugadora-secundaria">También: {jugadora.posicion_secundaria}</p>}
      </div>
    </div>
  </button>
}
