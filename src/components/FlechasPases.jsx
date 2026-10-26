import { useId } from 'react'
import { trayectoriaExacta } from '../utils/trayectoriasPases'

export default function FlechasPases({ eventos, detalles, onSelect }) {
  const prefijo = useId().replaceAll(':', '')
  return <g>
    <defs>
      {['correcto', 'incorrecto'].map((tipo) => <marker key={tipo} id={`${prefijo}-${tipo}`}
        viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={tipo === 'correcto' ? '#4ADE80' : '#F87171'} />
      </marker>)}
    </defs>
    {eventos.map((evento) => {
      const trayectoria = trayectoriaExacta(evento, detalles[evento.id])
      if (!trayectoria) return null
      const { origen, destino } = trayectoria
      const correcto = evento.tipo === 'Pase correcto'
      const color = correcto ? '#4ADE80' : '#F87171'
      const seleccionar = onSelect ? (e) => { e.stopPropagation(); onSelect(evento) } : undefined
      const coinciden = origen.x === destino.x && origen.y === destino.y
      const linea = { x1: origen.x, y1: origen.y * 0.64, x2: destino.x, y2: destino.y * 0.64 }
      return <g key={evento.id} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}
        aria-label={`Consultar trayectoria: ${evento.tipo}, segundo ${evento.segundo}`}
        onClick={seleccionar} onKeyDown={onSelect ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(e) }
        } : undefined} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
        <title>{`${evento.tipo} · ${coinciden ? 'Sin desplazamiento' : 'Consultar trayectoria'}`}</title>
        {!coinciden && <>
          <line {...linea} stroke="transparent" strokeWidth="4" pointerEvents={onSelect ? 'stroke' : 'none'} />
          <line {...linea} stroke={color} strokeWidth="0.8" pointerEvents="none"
            markerEnd={`url(#${prefijo}-${correcto ? 'correcto' : 'incorrecto'})`} />
        </>}
        <circle cx={destino.x} cy={destino.y * 0.64} r={coinciden ? 2.6 : 1.2}
          fill="none" stroke={color} strokeWidth="0.6" pointerEvents={onSelect ? 'all' : 'none'} />
      </g>
    })}
  </g>
}
