import { useMemo, useState } from 'react'
import { UMBRALES_TRAMO, tramosSinAcciones } from '../../utils/analisis/tramos'
import { formatearTiempo } from '../../utils/analisis/formato'
import './etiquetado.css'

const minutos = (s) => `${Math.round(s / 60)} min`

// Huecos largos sin acciones en un partido ya etiquetado, con «Ir» para revisarlos en el video.
export default function TramosSinAcciones({ eventos, onIr, puedeIr }) {
  const [umbral, setUmbral] = useState(180)
  const tramos = useMemo(() => tramosSinAcciones(eventos, umbral), [eventos, umbral])
  if (!eventos?.length) return null

  return (
    <details className="et-tramos">
      <summary>Tramos sin acciones ({tramos.length})</summary>
      <label className="et-tramos-umbral">
        <span>Mostrar huecos de más de</span>
        <select value={umbral} onChange={(e) => setUmbral(Number(e.target.value))}>
          {UMBRALES_TRAMO.map((u) => <option key={u} value={u}>{minutos(u)}</option>)}
        </select>
      </label>
      {tramos.length === 0 ? (
        <p className="et-tramos-vacio">No hay huecos de más de {minutos(umbral)} entre acciones.</p>
      ) : (
        <ul className="et-tramos-lista">
          {tramos.map((t) => (
            <li key={`${t.periodo}-${t.desde}`}>
              <span>{t.periodo === 2 ? '2.º tiempo' : '1.er tiempo'} · {formatearTiempo(t.desde)} a {formatearTiempo(t.hasta)} ({minutos(t.duracion)})</span>
              <button type="button" className="et-boton" disabled={!puedeIr} onClick={() => onIr(t.desde)}>Ir</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
