import { textoPosesion } from '../../utils/analisis/posesion'
import './estadisticasVisuales.css'

export function MarcaParcial({ visible, texto = 'dato parcial' }) {
  if (!visible) return null
  return <span className="ev-parcial" title="Calculado sobre menos de la mitad del partido">{texto}</span>
}

// Barra de posesión: amarillo el analizado, blanco el otro. % solo sobre tiempo de juego, con la cobertura.
export function BarraPosesion({ resumen, nombreAnalizado, nombreOtro }) {
  if (!resumen || resumen.porcentaje == null) {
    return <p className="ev-nota">Posesión sin datos: marcá momentos colectivos o usá el Modo posesión.</p>
  }
  return (
    <div className="ev-posesion" role="group" aria-label={textoPosesion(resumen, nombreAnalizado)}>
      <div className="ev-posesion-nombres">
        <span><strong>{resumen.porcentaje}%</strong> {nombreAnalizado}</span>
        <span>{nombreOtro} <strong>{resumen.porcentajeOtro}%</strong></span>
      </div>
      <div className="ev-posesion-barra" aria-hidden="true">
        <span data-estado="analizado" style={{ width: `${resumen.porcentaje}%` }} />
        <span data-estado="otro" style={{ width: `${resumen.porcentajeOtro}%` }} />
      </div>
      <p className="ev-nota">
        Calculada sobre el {resumen.cobertura}% del partido (sin contar pelota detenida). <MarcaParcial visible={resumen.parcial} />
      </p>
    </div>
  )
}

// Dominio por bloques de 5 minutos: hacia arriba el analizado, hacia abajo el otro. onBloque(bloque): opcional.
export function DominioBloques({ periodos, nombreAnalizado, nombreOtro, onBloque = null }) {
  if (!periodos?.length) return <p className="ev-nota">Sin datos de posesión para el gráfico de dominio.</p>
  return (
    <div className="ev-dominio">
      <div className="ev-dominio-leyenda">
        <span><i data-estado="analizado" /> {nombreAnalizado} (arriba)</span>
        <span><i data-estado="otro" /> {nombreOtro} (abajo)</span>
      </div>
      <div className="ev-dominio-tiempos">
        {periodos.map((p) => (
          <figure key={p.periodo ?? 'video'} className="ev-dominio-tiempo">
            <figcaption>{p.periodo ? `${p.periodo}T` : 'Video'}</figcaption>
            <div className="ev-dominio-barras" role="list">
              {p.bloques.map((b) => {
                const largo = Math.max(1, b.hasta - b.desde)
                const arriba = Math.round((b.analizado / largo) * 100), abajo = Math.round((b.otro / largo) * 100)
                const etiqueta = `${b.minuto}'–${b.minuto + 5}': ${nombreAnalizado} ${arriba}%, ${nombreOtro} ${abajo}%`
                const contenido = (
                  <>
                    <span className="ev-dominio-mitad" data-lado="arriba"><span data-estado="analizado" style={{ height: `${arriba}%` }} /></span>
                    <span className="ev-dominio-mitad" data-lado="abajo"><span data-estado="otro" style={{ height: `${abajo}%` }} /></span>
                    <span className="ev-dominio-minuto">{b.minuto}'</span>
                  </>
                )
                return onBloque
                  ? <button key={b.desde} type="button" role="listitem" className="ev-dominio-bloque" aria-label={etiqueta} title={etiqueta} onClick={() => onBloque(b)}>{contenido}</button>
                  : <span key={b.desde} role="listitem" className="ev-dominio-bloque" aria-label={etiqueta} title={etiqueta}>{contenido}</span>
              })}
            </div>
          </figure>
        ))}
      </div>
    </div>
  )
}
