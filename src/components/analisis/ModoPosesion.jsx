import { useCallback, useEffect, useRef, useState } from 'react'
import { useTiempoVideo } from '../../utils/relojVideo'
import { formatearTiempo } from '../../utils/analisis/formato'
import { estadoEn, guardarTeclasPosesion, leerTeclasPosesion, terminarPosesion, tocarPosesion } from '../../utils/analisis/posesion'
import './estadisticasVisuales.css'

// Modo posesión (coordinación): una pasada aparte con el video (por ejemplo a 2x) para completar los huecos.
// Indicador grande de quién tiene la pelota ahora y dos teclas configurables: cambio de equipo y pelota detenida.
// Cada toque cierra el tramo abierto en ese segundo y lo guarda (onGuardar(tramo) → { error }).
export default function ModoPosesion({ reloj, tomarSegundo, linea, nombres, activo, puedeEditar, aviso, onGuardar }) {
  const segundo = useTiempoVideo(reloj)
  const [grabacion, setGrabacion] = useState(null)
  const [teclas, setTeclas] = useState(leerTeclasPosesion)
  const [cambiando, setCambiando] = useState(null) // 'cambio' | 'detenida' | null
  const [error, setError] = useState('')
  const grabacionRef = useRef(null)
  const actual = grabacion ? grabacion.estado : estadoEn(linea, segundo)
  const nombreDe = (estado) => (estado === 'analizado' ? nombres.analizado : estado === 'otro' ? nombres.otro : estado === 'detenida' ? 'Pelota detenida' : 'Sin datos')

  const guardar = useCallback(async (tramo) => {
    if (!tramo) return
    const r = await onGuardar(tramo)
    setError(r?.error || '')
  }, [onGuardar])

  const tocar = useCallback((orden) => {
    if (!puedeEditar) return
    const s = tomarSegundo()
    if (s == null) { setError('El video todavía no está listo.'); return }
    const previa = grabacionRef.current
    const r = tocarPosesion(previa, orden, s, estadoEn(linea, s))
    grabacionRef.current = r.grabacion
    setGrabacion(r.grabacion)
    guardar(r.guardar)
  }, [puedeEditar, tomarSegundo, linea, guardar])

  const terminar = useCallback(() => {
    const s = tomarSegundo()
    const tramo = s == null ? null : terminarPosesion(grabacionRef.current, s)
    grabacionRef.current = null
    setGrabacion(null)
    guardar(tramo)
  }, [tomarSegundo, guardar])

  // Al salir de la pestaña, se guarda lo que quedó abierto.
  useEffect(() => { if (!activo && grabacionRef.current) terminar() }, [activo, terminar])

  useEffect(() => {
    if (!activo || !puedeEditar) return undefined
    function tecla(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const destino = e.target
      if (destino && (['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName) || destino.isContentEditable)) return
      const t = String(e.key || '').toLowerCase()
      if (cambiando) {
        if (t.length !== 1 || t === ' ') return
        e.preventDefault()
        const otra = cambiando === 'cambio' ? 'detenida' : 'cambio'
        if (teclas[otra] === t) { setError('Esa tecla ya es de la otra acción.'); return }
        const nuevas = { ...teclas, [cambiando]: t }
        setTeclas(nuevas); guardarTeclasPosesion(nuevas); setCambiando(null); setError('')
        return
      }
      if (t === teclas.cambio) { e.preventDefault(); e.stopPropagation(); tocar('cambio') }
      else if (t === teclas.detenida) { e.preventDefault(); e.stopPropagation(); tocar('detenida') }
      else if (e.key === 'Enter' && grabacionRef.current) { e.preventDefault(); terminar() }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [activo, puedeEditar, teclas, cambiando, tocar, terminar])

  return (
    <div className="mp">
      {aviso && <p className="mp-aviso" role="status">{aviso}</p>}
      <div className="mp-indicador" data-estado={actual} data-grabando={grabacion ? 'si' : undefined} aria-live="polite">
        <strong>{nombreDe(actual)}</strong>
        <span>{grabacion ? `Marcando desde ${formatearTiempo(grabacion.inicio)}` : `Ahora en el video (${formatearTiempo(segundo)})`}</span>
      </div>
      {puedeEditar ? (
        <>
          <div className="mp-botones">
            <button type="button" className="et-boton" onClick={() => tocar('cambio')}>⇄ Cambia la posesión <kbd>{teclas.cambio.toUpperCase()}</kbd></button>
            <button type="button" className="et-boton" onClick={() => tocar('detenida')}>⏸ Pelota detenida <kbd>{teclas.detenida.toUpperCase()}</kbd></button>
            <button type="button" className="et-boton" disabled={!grabacion} onClick={terminar}>■ Terminar <kbd>Enter</kbd></button>
          </div>
          <div className="mp-teclas">
            <span>Teclas:</span>
            <button type="button" className="et-boton" aria-pressed={cambiando === 'cambio'} onClick={() => setCambiando(cambiando === 'cambio' ? null : 'cambio')}>
              {cambiando === 'cambio' ? 'Tocá una tecla…' : <>Cambio: <kbd>{teclas.cambio.toUpperCase()}</kbd></>}
            </button>
            <button type="button" className="et-boton" aria-pressed={cambiando === 'detenida'} onClick={() => setCambiando(cambiando === 'detenida' ? null : 'detenida')}>
              {cambiando === 'detenida' ? 'Tocá una tecla…' : <>Detenida: <kbd>{teclas.detenida.toUpperCase()}</kbd></>}
            </button>
          </div>
          <p className="ev-nota">
            Poné el video a 2x. «Cambia la posesión» pasa la pelota al otro equipo desde ese segundo; «Pelota detenida» marca afuera,
            falta, cambio o lesión (después, «Cambia» sigue con el equipo que no la tenía). Lo marcado acá manda sobre lo calculado
            con los momentos colectivos.
          </p>
        </>
      ) : <p className="ev-nota">Solo mirar: marcar la posesión es de coordinación.</p>}
      {error && <p className="mp-error" role="alert">{error}</p>}
    </div>
  )
}
