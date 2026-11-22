import { useState } from 'react'
import { useTiempoVideo } from '../../utils/relojVideo'
import { relojPartido, resultadoHasta, siglaEquipo } from '../../utils/analisis/marcador'
import { ESCUDO_URL } from '../../config/club'
import './marcador.css'

const NOMBRE_MARCA = { inicio_1t: 'el inicio', inicio_2t: 'el inicio del 2T' }

// Marcador tipo transmisión arriba a la izquierda del video: escudo + COM | resultado | sigla del rival | tiempo y reloj.
// El reloj y el resultado siguen al video (reloj: crearRelojVideo) y salen de las marcas y los goles del partido.
// Si falta una marca, muestra «Marcá el inicio» con un botón que la carga en el segundo actual (onMarcar(tipo)).
export default function MarcadorVideo({ reloj, marcas, eventos, rival, puedeMarcar, onMarcar }) {
  const segundo = useTiempoVideo(reloj)
  const [escudoRoto, setEscudoRoto] = useState(false)
  const estado = relojPartido(segundo, marcas)
  const { propios, rivales } = resultadoHasta(eventos, segundo)
  const sigla = siglaEquipo(rival) || 'RIV'
  const marcaFaltante = estado.falta && puedeMarcar ? estado.falta : null

  return (
    <div className="mv" data-estado={estado.estado} role="group" aria-label="Marcador del partido">
      <div className="mv-barra">
        <span className="mv-equipo">
          {!escudoRoto && <img className="mv-escudo" src={ESCUDO_URL} alt="" onError={() => setEscudoRoto(true)} />}
          <span>COM</span>
        </span>
        <span className="mv-resultado" aria-label={`Resultado: Comunicaciones ${propios}, ${rival || 'rival'} ${rivales}`}>
          {propios}<span className="mv-guion" aria-hidden="true">-</span>{rivales}
        </span>
        <span className="mv-equipo mv-equipo-rival">
          <span>{sigla}</span>
          <span className="mv-escudo mv-escudo-rival" aria-hidden="true">{sigla.charAt(0)}</span>
        </span>
        <span className="mv-reloj" aria-live="off">
          {estado.estado === 'juego'
            ? <><span className="mv-periodo">{estado.etiqueta}</span> <span className="mv-tiempo" data-descuento={estado.descuento ? 'si' : undefined}>{estado.reloj}</span></>
            : <span className="mv-periodo">{estado.estado === 'sin_inicio' && !puedeMarcar ? 'Sin marcas' : estado.etiqueta}</span>}
        </span>
      </div>
      {marcaFaltante && (
        <button type="button" className="mv-marcar" onClick={() => onMarcar(marcaFaltante)}>
          Marcar {NOMBRE_MARCA[marcaFaltante]} acá
        </button>
      )}
    </div>
  )
}
