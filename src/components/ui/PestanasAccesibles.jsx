import { useId, useRef, useState } from 'react'
import './panelDeportivo.css'

/**
 * pestañas: [{ id (único/estable), etiqueta, contenido, deshabilitada? }].
 * Activación manual: flechas/Home/End mueven foco; Enter/Espacio o clic solicitan
 * selección al padre. Paneles siempre montados: cambiar de pestaña no borra estado.
 */
export default function PestanasAccesibles({ pestanas = [], seleccionada, onSeleccionar, etiqueta = 'Secciones del perfil' }) {
  const prefijo = useId()
  const botones = useRef(new Map())
  const [foco, setFoco] = useState(null)
  const disponibles = pestanas.filter(p => !p.deshabilitada)
  const activa = disponibles.find(p => p.id === seleccionada)?.id ?? disponibles[0]?.id
  const enfocable = disponibles.some(p => p.id === foco) ? foco : activa
  const idTab = id => `${prefijo}-tab-${encodeURIComponent(id)}`
  const idPanel = id => `${prefijo}-panel-${encodeURIComponent(id)}`

  function moverFoco(evento, id) {
    const teclas = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!teclas.includes(evento.key) || !disponibles.length) return
    evento.preventDefault()
    const indice = disponibles.findIndex(p => p.id === id)
    const siguiente = evento.key === 'Home' ? 0 : evento.key === 'End' ? disponibles.length - 1 :
      (indice + (evento.key === 'ArrowRight' ? 1 : -1) + disponibles.length) % disponibles.length
    botones.current.get(disponibles[siguiente].id)?.focus()
  }

  return <div className="dp-pestanas">
    <div className="dp-pestanas-lista" role="tablist" aria-label={etiqueta} aria-orientation="horizontal"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFoco(null) }}>
      {pestanas.map(p => <button key={p.id} ref={nodo => { if (nodo) botones.current.set(p.id, nodo); else botones.current.delete(p.id) }}
        type="button" role="tab" id={idTab(p.id)} aria-controls={idPanel(p.id)}
        aria-selected={activa === p.id} disabled={Boolean(p.deshabilitada)} tabIndex={enfocable === p.id ? 0 : -1}
        onFocus={() => setFoco(p.id)} onKeyDown={e => moverFoco(e, p.id)} onClick={() => onSeleccionar?.(p.id)}>
        {p.etiqueta}
      </button>)}
    </div>
    {pestanas.map(p => <div key={p.id} id={idPanel(p.id)} role="tabpanel" aria-labelledby={idTab(p.id)}
      className="dp-pestanas-panel" tabIndex={0} hidden={activa !== p.id}>{p.contenido}</div>)}
  </div>
}
