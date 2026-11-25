import { useMemo } from 'react'
import {
  ERROR_REVISAR, LIMITES_CANCHA, MINIMO_PUNTOS, estadoCalibracion, ladoDe, lineasCancha, lineasEnVideo, medidasCancha, puntosConocidos, resolverCalibracion,
} from '../../../utils/analisis/dibujos/calibracion'
import { tiempoPreciso } from '../../../utils/analisis/dibujos/editor'
import './dibujo.css'

// Panel de calibración de la cancha (etapa 5), al costado del video en el editor. Elegir un punto en la cancha chica y
// después hacer clic en el video (eso lo maneja el editor con onMarcar). cal: la calibración que se edita.
export default function CalibrarCancha({
  dibujo, cal, elegido, tiempo, onElegir, onMedidas, onQuitar, onRecalibrar, onIr, onBorrar, onListo, onGuia,
}) {
  const cancha = useMemo(() => medidasCancha(dibujo.cancha), [dibujo.cancha])
  const conocidos = useMemo(() => puntosConocidos(cancha), [cancha])
  const lineas = useMemo(() => lineasCancha(cancha), [cancha])
  const r = useMemo(() => resolverCalibracion(cal, cancha), [cal, cancha])
  const marcados = new Set(cal.puntos.map((p) => p.ref))
  const porRef = new Map(conocidos.map((p) => [p.ref, p]))
  const errorDe = new Map(r.errores.map((e) => [e.ref, e.error]))
  const conError = cal.puntos.length > MINIMO_PUNTOS
  const nombreElegido = elegido ? porRef.get(elegido)?.nombre : ''
  const lado = elegido ? ladoDe(elegido, cancha) : null
  const estado = estadoCalibracion(r, cal.puntos.length)
  const otras = (dibujo.calibraciones || []).filter((c) => c.id !== cal.id)

  return (
    <section className="dib-calibrar" aria-label="Calibrar la cancha">
      <div className="dib-fila" style={{ justifyContent: 'space-between' }}>
        <h3>Calibrar la cancha · cuadro {tiempoPreciso(cal.t)}</h3>
        <button type="button" className="dib-boton" onClick={onGuia} aria-label="Ver la guía de calibración" title="Ver la guía de calibración">?</button>
      </div>

      <div className="dib-fila" data-guia="cal-medidas">
        {[['largo', 'Largo (m)'], ['ancho', 'Ancho (m)']].map(([k, texto]) => (
          <label key={k} className="dib-campo" style={{ flex: '1 1 6rem' }}><span>{texto}</span>
            <input type="number" min={LIMITES_CANCHA[k][0]} max={LIMITES_CANCHA[k][1]} step={0.5} defaultValue={cancha[k]} key={`${k}-${cancha[k]}`}
              onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== cancha[k]) onMedidas({ ...cancha, [k]: v }) }} />
          </label>
        ))}
      </div>

      <div data-guia="cal-cancha">
        <svg className="dib-mini-cancha" viewBox={`-5 -5 ${cancha.largo + 10} ${cancha.ancho + 10}`} role="group" aria-label="Puntos conocidos de la cancha">
          <rect x={-5} y={-5} width={cancha.largo + 10} height={cancha.ancho + 10} className="dib-mini-cesped" />
          {/* Mientras se elige, la mitad de ese punto queda resaltada (para no confundir izquierda con derecha). */}
          {lado && lado.lado !== 'centro' && (
            <rect data-lado-resaltado={lado.lado} x={lado.lado === 'izquierda' ? 0 : cancha.largo / 2} y={0} width={cancha.largo / 2} height={cancha.ancho} className="dib-mini-lado" />
          )}
          {lineas.map((l, i) => <polyline key={i} points={l.map((p) => `${p.x},${p.y}`).join(' ')} className="dib-mini-linea" />)}
          <text x={-2.2} y={cancha.ancho / 2} className="dib-mini-rotulo" textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${-2.2} ${cancha.ancho / 2})`}>IZQ.</text>
          <text x={cancha.largo + 2.2} y={cancha.ancho / 2} className="dib-mini-rotulo" textAnchor="middle" dominantBaseline="middle" transform={`rotate(90 ${cancha.largo + 2.2} ${cancha.ancho / 2})`}>DER.</text>
          <text x={cancha.largo / 2} y={-1.8} className="dib-mini-rotulo" textAnchor="middle">LEJOS DE LA CÁMARA</text>
          <text x={cancha.largo / 2} y={cancha.ancho + 3.6} className="dib-mini-rotulo" textAnchor="middle">CERCA DE LA CÁMARA</text>
          {conocidos.map((p) => (
            <g key={p.ref} role="button" tabIndex={0} aria-label={`${p.nombre}${marcados.has(p.ref) ? ' (marcado)' : ''}`} aria-pressed={elegido === p.ref}
              className="dib-mini-punto" data-marcado={marcados.has(p.ref) ? 'si' : undefined} data-elegido={elegido === p.ref ? 'si' : undefined}
              onClick={() => onElegir(p.ref)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(p.ref) } }}>
              <title>{p.nombre}</title>
              <circle cx={p.x} cy={p.y} r={3.2} className="dib-mini-toque" />
              <circle cx={p.x} cy={p.y} r={1.5} className="dib-mini-marca" />
            </g>
          ))}
        </svg>
        <p className="dib-ayuda">Arriba = el lateral más lejos de la cámara. Izquierda = el arco que se ve a la izquierda.</p>
      </div>

      <p className="dib-instruccion" aria-live="polite">
        {elegido ? `Ahora hacé clic en el video donde está: ${nombreElegido}.` : 'Tocá en la cancha chica un punto que se vea en el video.'}
      </p>
      {lado && <p className="dib-ayuda" data-lado={lado.lado}>{lado.texto}</p>}

      <div data-guia="cal-lista">
        <p className="dib-ayuda">Puntos marcados: {cal.puntos.length} (mínimo {MINIMO_PUNTOS}).</p>
        <ol className="dib-pasos">
          {cal.puntos.map((p) => {
            const error = errorDe.get(p.ref)
            const revisar = conError && error > ERROR_REVISAR
            return (
              <li key={p.ref} className="dib-paso" data-elegido={elegido === p.ref ? 'si' : undefined} data-revisar={revisar ? 'si' : undefined}>
                <span>{porRef.get(p.ref)?.nombre}{revisar && <strong className="dib-aviso"> · Revisar: parece mal marcado</strong>}</span>
                {conError && Number.isFinite(error) && <small>Diferencia con la cuenta: {String(error).replace('.', ',')} % del ancho</small>}
                <div className="dib-fila">
                  <button type="button" className="dib-boton" onClick={() => onElegir(p.ref)}>Corregir</button>
                  <button type="button" className="dib-boton" onClick={() => onQuitar(p.ref)}>Quitar</button>
                </div>
              </li>
            )
          })}
        </ol>
        <p className={`dib-cal-estado ${estado.tipo === 'error' ? 'dib-error' : estado.tipo === 'bien' ? 'dib-ayuda' : 'dib-aviso'}`} data-estado={estado.tipo} role="status">
          {estado.texto}
        </p>
      </div>

      <div className="dib-campo" data-guia="cal-recalibrar">
        <span>Calibraciones del clip</span>
        {otras.length > 0 && (
          <ul className="dib-pasos">
            {otras.map((c) => (
              <li key={c.id}><button type="button" className="dib-boton" onClick={() => onIr(c)}>Ir a la del cuadro {tiempoPreciso(c.t)}</button></li>
            ))}
          </ul>
        )}
        <button type="button" className="dib-boton" onClick={onRecalibrar} disabled={Math.abs(tiempo - cal.t) < 0.05}
          title="Si la cámara se movió: copia estos puntos en el cuadro actual para corregir los que cambiaron">Recalibrar en este cuadro ({tiempoPreciso(tiempo)})</button>
      </div>

      <div className="dib-fila">
        <button type="button" className="dib-boton" onClick={onBorrar}>Borrar esta calibración</button>
        <button type="button" className="dib-boton dib-principal" data-guia="cal-listo" onClick={onListo}>Listo</button>
      </div>
    </section>
  )
}

// Sobre el video: los puntos marcados y, si ya alcanza, las líneas de la cancha calculadas (control de calidad).
export function CapaCalibracion({ dibujo, cal, elegido, ancho, alto, cuadro }) {
  const cancha = useMemo(() => medidasCancha(dibujo.cancha), [dibujo.cancha])
  const r = useMemo(() => resolverCalibracion(cal, cancha), [cal, cancha])
  const lineas = useMemo(() => (r.ok ? lineasEnVideo(r.inversa, cancha) : []), [r, cancha])
  if (!ancho || !cuadro?.ancho) return null
  const px = (p) => `${p.x * cuadro.ancho},${p.y * cuadro.alto}`
  return (
    <svg className="dib-rastro-guia" width={ancho} height={alto} aria-hidden="true" data-calibracion="si">
      <g transform={`translate(${cuadro.izquierda} ${cuadro.arriba})`}>
        {lineas.map((l, i) => <polyline key={i} points={l.map(px).join(' ')} className="dib-cal-linea" />)}
        {cal.puntos.map((p, i) => (
          <g key={p.ref} transform={`translate(${p.x * cuadro.ancho} ${p.y * cuadro.alto})`}>
            <circle r={elegido === p.ref ? 11 : 7} className="dib-cal-punto" data-elegido={elegido === p.ref ? 'si' : undefined} />
            <text y={-12} textAnchor="middle" className="dib-cal-numero">{i + 1}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
