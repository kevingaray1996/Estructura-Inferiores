import { useEffect, useState } from 'react'
import { ContenidoEntrenamientoHoy } from '../components/EntrenamientoDeHoy'
import { entrenamientoHoy, wellnessRespondio } from './portal'
import Icono from './iconos'

// Solo para mostrar la fecha de hoy arriba de todo (hora de Argentina, como el resto del club).
const ZONA = 'America/Argentina/Buenos_Aires'
const DIA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: ZONA })
const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: ZONA })

// Inicio de la jugadora: si ya completó el Wellness de hoy y el entrenamiento publicado de hoy.
function InicioJugadora({ onIrAWellness }) {
  const [respondio, setRespondio] = useState(null)
  const [sesiones, setSesiones] = useState([])

  useEffect(() => {
    let activo = true
    wellnessRespondio().then(({ data, error }) => { if (activo) setRespondio(error ? 'error' : data === true) })
    // El entrenamiento es opcional: si falla, simplemente no se muestra.
    entrenamientoHoy().then(({ data }) => { if (activo && Array.isArray(data)) setSesiones(data) })
    return () => { activo = false }
  }, [])

  const hoy = new Date()
  return (
    <div className="jg-pila">
      <p className="jg-hoy">
        <span className="jg-hoy-dia">{DIA.format(hoy)}</span>
        <span className="jg-hoy-fecha">{FECHA.format(hoy)}</span>
      </p>

      <section className={`jg-tarjeta${respondio === false ? ' jg-tarjeta-pendiente' : ''}`} aria-labelledby="jg-wellness-hoy">
        <h2 id="jg-wellness-hoy" className="jg-subtitulo">Wellness de hoy</h2>
        {respondio === null && <p className="jg-texto" role="status">Consultando…</p>}
        {respondio === true && <p className="jg-texto jg-ok jg-estado"><Icono nombre="listo" className="jg-estado-icono" />Ya completaste el Wellness de hoy.</p>}
        {respondio === false && (
          <>
            <p className="jg-texto">Te lleva un minuto y ayuda al cuerpo técnico a planificar.</p>
            <button type="button" className="jg-boton jg-boton-principal" onClick={onIrAWellness}>Completar Wellness</button>
          </>
        )}
        {respondio === 'error' && (
          <>
            <p className="jg-texto">No se pudo consultar si ya lo completaste. Podés abrirlo igual.</p>
            <button type="button" className="jg-boton" onClick={onIrAWellness}>Abrir Wellness</button>
          </>
        )}
      </section>

      <ContenidoEntrenamientoHoy sesiones={sesiones} />
    </div>
  )
}

export default InicioJugadora
