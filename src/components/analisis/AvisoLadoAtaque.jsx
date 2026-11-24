import { ladoSinConfirmar } from '../../utils/analisis/mapaAcciones'
import './estadisticasVisuales.css'

// Aviso visible mientras el lado de ataque del 1T de un partido no está confirmado (el mapa puede estar espejado).
// Coordinación lo confirma tocando el lado correcto: guarda ese lado y lo marca como confirmado.
export default function AvisoLadoAtaque({ partido, puedeEditar, onConfirmar }) {
  if (!ladoSinConfirmar(partido)) return null
  const actual = partido.direccion_primer_tiempo
  return (
    <div className="ev-lado" role="alert">
      <p><strong>Lado de ataque del 1T sin confirmar: el mapa puede estar espejado.</strong></p>
      {puedeEditar ? (
        <>
          <p className="ev-nota">¿Hacia dónde atacamos en el primer tiempo? Hoy figura «{actual === 'izquierda' ? 'izquierda' : 'derecha'}» porque nadie lo eligió. En el 2T se invierte solo.</p>
          <div className="ev-lado-botones" role="group" aria-label="Confirmar el lado de ataque del 1T">
            <button type="button" className="et-boton" onClick={() => onConfirmar('izquierda')}>← Atacamos hacia la izquierda</button>
            <button type="button" className="et-boton" onClick={() => onConfirmar('derecha')}>Atacamos hacia la derecha →</button>
          </div>
        </>
      ) : <p className="ev-nota">Lo confirma coordinación.</p>}
    </div>
  )
}

// Aviso para el mapa de varios partidos: cuántos del filtro tienen el lado sin confirmar.
export function AvisoLadosSinConfirmar({ cantidad }) {
  if (!cantidad) return null
  return (
    <div className="ev-lado" role="alert">
      <p><strong>{cantidad === 1 ? '1 partido del filtro tiene' : `${cantidad} partidos del filtro tienen`} el lado de ataque del 1T sin confirmar: el mapa puede estar espejado.</strong></p>
      <p className="ev-nota">Confirmalo en cada partido (Mapa → «Este partido», o en la pestaña Partido).</p>
    </div>
  )
}
