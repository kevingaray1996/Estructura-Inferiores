import { eventosEnClip, resumenEventosClip } from '../../utils/analisis/colectiva'
import { formatearTiempo } from '../../utils/analisis/formato'
import './colectiva.css'

// Momento colectivo elegido en la línea de tiempo: qué eventos individuales caen adentro y acciones rápidas.
// onDibujar (etapa 4): abre la ventana de dibujo del clip (solo coordinación en la compu). conDibujos: ya tiene dibujos.
export default function ClipSeleccionado({ momento, individuales, etiquetaDe, dorsalDe, minutoDe, equipo, puedeBorrar, onReproducir, onBorrar, onCerrar, onAgregarAPlaylist = null, onDibujar = null, conDibujos = false }) {
  if (!momento) return null
  const adentro = eventosEnClip(momento, individuales)
  const fin = Number(momento.segundo_fin ?? momento.segundo)
  const minuto = minutoDe(momento.segundo)
  return (
    <div className="clip" role="region" aria-label="Momento elegido">
      <h4>{etiquetaDe(momento.tipo)}{equipo ? ` · ${equipo}` : ''}{conDibujos && <span className="dib-icono" title="Tiene dibujos"> ✎</span>}</h4>
      <p className="clip-datos">
        {formatearTiempo(momento.segundo)} a {formatearTiempo(fin)} ({Math.max(0, fin - Number(momento.segundo))} s)
        {minuto ? ` · ${minuto}` : ''}
        {momento.origen ? ` · espejo de «${etiquetaDe(momento.origen)}»` : ''}
      </p>
      <p className="clip-eventos">
        {adentro.length
          ? resumenEventosClip(adentro, { etiqueta: etiquetaDe, dorsal: dorsalDe })
          : 'No hay eventos individuales dentro de este momento.'}
      </p>
      <div className="clip-acciones">
        <button type="button" className="et-boton" onClick={() => onReproducir(momento)}>▶ Reproducir</button>
        {onAgregarAPlaylist && !momento._cola && (
          <button type="button" className="et-boton" onClick={() => onAgregarAPlaylist(momento)}>+ Agregar a playlist</button>
        )}
        {onDibujar && !momento._cola && (
          <button type="button" className="et-boton" onClick={() => onDibujar(momento)}>✎ Dibujar</button>
        )}
        {puedeBorrar && !momento._cola && !momento.origen && (
          <button type="button" className="et-boton" onClick={() => onBorrar(momento)}>Borrar</button>
        )}
        <button type="button" className="et-boton" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  )
}
