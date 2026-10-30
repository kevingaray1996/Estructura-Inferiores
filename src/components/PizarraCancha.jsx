import { forwardRef, memo, useId } from 'react'
import { SUPERFICIES } from '../utils/pizarra'
import PizarraObjeto from './PizarraObjeto'


const PizarraCancha = memo(forwardRef(function PizarraCancha({ doc, poses, seleccion = [], onElemento, onFondo, onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel, onDragOver, onDrop, zoom = 1, pan = { x: 0, y: 0 }, caja, miniatura = false }, ref) {
  const [w, h] = SUPERFICIES[doc.superficie], vertical = doc.orientacion === 'vertical'
  const recorte = useId().replaceAll(':', '')
  const centroArco = doc.superficie === 'cuarto' ? h : h / 2
  const ancho = vertical ? h : w, alto = vertical ? w : h
  const verde = doc.superficie === 'libre' ? '#285C49' : '#24733F'
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`-3 -3 ${ancho + 6} ${alto + 6}`} role="img" aria-label={miniatura ? 'Vista previa de cancha' : 'Cancha táctica editable'} className={miniatura ? 'pizarra-vista-miniatura' : 'pizarra-cancha'}
    onPointerDown={onFondo} onPointerDownCapture={onPointerDownCapture} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDragOver={onDragOver} onDrop={onDrop}>
    <title>Pizarra táctica de Comunicaciones</title><defs><clipPath id={recorte}><rect width={w} height={h} /></clipPath></defs><rect x="-3" y="-3" width={ancho + 6} height={alto + 6} fill={verde} />
    <g data-viewport="true" transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      <g data-campo="true" transform={vertical ? `translate(${h} 0) rotate(90)` : undefined}>
        <rect width={w} height={h} fill={verde} />
        {doc.superficie !== 'libre' && <g fill="none" stroke="#FFFFFF" strokeWidth=".18" opacity=".9" clipPath={`url(#${recorte})`}>
          <rect width={w} height={h} />
          {doc.superficie === 'completa' && <><path d={`M${w / 2} 0 V${h}`} /><circle cx={w / 2} cy={h / 2} r="9.15" /><circle cx={w / 2} cy={h / 2} r=".3" fill="#FFFFFF" /></>}
          {['completa', 'media', 'cuarto', 'area'].includes(doc.superficie) ? <>
            <path d={`M0 ${centroArco - 20.16} H16.5 V${centroArco + 20.16} H0 M0 ${centroArco - 9.16} H5.5 V${centroArco + 9.16} H0`} />
            <circle cx="11" cy={centroArco} r=".3" fill="#FFFFFF" />
            <path d={`M16.5 ${centroArco - 7.3} A9.15 9.15 0 0 1 16.5 ${centroArco + 7.3}`} />
            {doc.superficie === 'media' && <path d={`M${w} ${h / 2 - 9.15} A9.15 9.15 0 0 0 ${w} ${h / 2 + 9.15}`} />}
            {doc.superficie === 'completa' && <g transform={`translate(${w} ${h}) rotate(180)`}><path d={`M0 ${h / 2 - 20.16} H16.5 V${h / 2 + 20.16} H0 M0 ${h / 2 - 9.16} H5.5 V${h / 2 + 9.16} H0 M0 ${h / 2 - 3.66} H-1.5 V${h / 2 + 3.66} H0`} /><circle cx="11" cy={h / 2} r=".3" fill="#FFFFFF" /></g>}
          </> : <><path d={`M${w / 2} 0 V${h}`} /><circle cx={w / 2} cy={h / 2} r={h / 6} /></>}
        </g>}
        <text x={w / 2} y={h - 1.5} textAnchor="middle" fill="#FFFFFF" opacity=".8" fontSize="1.5">Ataque {doc.ataque === 'derecha' ? '→' : '←'}</text>
        {doc.elementos.map(e => { const p = poses[e.id]; if (!p) return null; return <g key={e.id} data-elemento={e.id} transform={`translate(${p.x * w / 100} ${p.y * h / 100}) rotate(${p.rotacion})`}
          onPointerDown={event => { if (onElemento) { event.stopPropagation(); onElemento(event, e.id) } }} style={{ cursor: onElemento ? 'grab' : 'default' }}>
          <PizarraObjeto e={e} ancho={w} alto={h} />{onElemento && <circle r={Math.max(e.tamano, 3)} fill="transparent" stroke="none" />}
          {seleccion.includes(e.id) && <g data-seleccion="true" pointerEvents="none"><circle r={e.tamano + 1} fill="none" stroke="#111111" strokeWidth=".7" /><circle r={e.tamano + 1} fill="none" stroke="#F2C230" strokeWidth=".4" strokeDasharray="1 .5" /><circle cx={e.tamano + 1} r=".65" fill="#F2C230" stroke="#111111" strokeWidth=".15" /></g>}
        </g> })}
        {caja && <rect x={Math.min(caja.x, caja.x2) * w / 100} y={Math.min(caja.y, caja.y2) * h / 100} width={Math.abs(caja.x2 - caja.x) * w / 100} height={Math.abs(caja.y2 - caja.y) * h / 100} fill="#FFFFFF" fillOpacity=".15" stroke="#FFFFFF" strokeWidth=".3" />}
      </g>
    </g>
  </svg>
}))
export default PizarraCancha
