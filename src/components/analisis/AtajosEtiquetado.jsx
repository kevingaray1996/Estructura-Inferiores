import { useEffect, useState } from 'react'
import { ATAJOS_POR_DEFECTO, TECLAS_FIJAS, mostrarTecla, validarAtajo } from '../../utils/analisis/atajos'
import './etiquetado.css'

// «Atajos activos» / «Atajos pausados» junto a la botonera.
export function IndicadorAtajos({ estado, onAyuda }) {
  if (estado === 'apagados') return null
  const activos = estado === 'activos'
  return (
    <div className="et-indicador" data-estado={estado} role="status" aria-live="polite">
      <span className="et-indicador-punto" aria-hidden="true" />
      <span>{activos ? 'Atajos activos' : 'Atajos pausados · hacé clic fuera del video'}</span>
      <button type="button" className="et-indicador-ayuda" onClick={onAyuda} aria-label="Ver y cambiar los atajos de teclado">?</button>
    </div>
  )
}

// Aviso corto al marcar una acción («Pase + · 23:10»). Se va solo.
export function AvisoAccion({ aviso }) {
  return (
    <div className="et-aviso" role="status" aria-live="polite" aria-atomic="true">
      {aviso && <span key={aviso.n} className="et-aviso-texto">{aviso.texto}</span>}
    </div>
  )
}

// Lista de atajos con editor. Panel no modal: no bloquea el video ni la botonera.
export function AyudaAtajos({ tipos, mapa, onCambiar, onCerrar, onEligiendo }) {
  const [eligiendo, setEligiendo] = useState(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => { onEligiendo?.(Boolean(eligiendo)) }, [eligiendo, onEligiendo])

  useEffect(() => {
    if (!eligiendo) return undefined
    const alTeclear = (evento) => {
      evento.preventDefault(); evento.stopPropagation()
      if (evento.key === 'Escape') { setEligiendo(null); setAviso(''); return }
      if (evento.key === 'Backspace' || evento.key === 'Delete') {
        const nuevo = { ...mapa }; delete nuevo[eligiendo]
        onCambiar(nuevo); setEligiendo(null); setAviso(`«${eligiendo}» quedó sin tecla.`); return
      }
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return
      const tecla = String(evento.key || '').toLowerCase()
      const validacion = validarAtajo(tecla, eligiendo, mapa)
      if (!validacion.ok) { setAviso(validacion.motivo); return }
      onCambiar({ ...mapa, [eligiendo]: tecla })
      setAviso(`«${eligiendo}» ahora es ${mostrarTecla(tecla)}.`)
      setEligiendo(null)
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [eligiendo, mapa, onCambiar])

  useEffect(() => {
    if (eligiendo) return undefined
    const alTeclear = (evento) => { if (evento.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [eligiendo, onCerrar])

  return (
    <section className="et-ayuda" aria-labelledby="et-ayuda-titulo">
      <div className="et-ayuda-encabezado">
        <h3 id="et-ayuda-titulo">Atajos de teclado</h3>
        <button type="button" className="et-boton" onClick={onCerrar}>Cerrar</button>
      </div>
      <p className="et-ayuda-nota">Las teclas de cada acción se guardan en esta computadora. Si estás escribiendo en un campo, las teclas escriben normal.</p>
      <dl className="et-ayuda-lista">
        {TECLAS_FIJAS.map((f) => (
          <div key={f.tecla} className="et-ayuda-fila">
            <dt><kbd>{f.tecla}</kbd></dt>
            <dd>{f.accion}</dd>
          </div>
        ))}
      </dl>
      <h4 className="et-ayuda-subtitulo">Acciones</h4>
      <ul className="et-ayuda-lista">
        {tipos.map((t) => (
          <li key={t.codigo} className="et-ayuda-fila">
            <span className="et-ayuda-tecla"><kbd data-vacia={!mapa[t.codigo] || undefined}>{mapa[t.codigo] ? mostrarTecla(mapa[t.codigo]) : '—'}</kbd></span>
            <span className="et-ayuda-accion">{t.etiqueta}</span>
            <button type="button" className="et-boton" aria-pressed={eligiendo === t.codigo}
              onClick={() => { setAviso(''); setEligiendo(eligiendo === t.codigo ? null : t.codigo) }}>
              {eligiendo === t.codigo ? 'Tocá una tecla…' : 'Cambiar tecla'}
            </button>
          </li>
        ))}
      </ul>
      <p className="et-ayuda-estado" role="status" aria-live="polite">
        {eligiendo && <span>Tocá la tecla para «{eligiendo}». Esc cancela; Borrar la deja sin tecla. </span>}
        {aviso}
      </p>
      <button type="button" className="et-boton" onClick={() => { onCambiar({ ...ATAJOS_POR_DEFECTO }); setAviso('Se restauraron las teclas por defecto.') }}>
        Restaurar teclas por defecto
      </button>
    </section>
  )
}
