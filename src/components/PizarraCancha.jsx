import { forwardRef, useId } from 'react'
import { SUPERFICIES } from '../utils/pizarra'

const LINEAS = ['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate']
function Figura({ e, ancho, alto }) {
  const s = e.tamano, stroke = { stroke: e.color, strokeWidth: e.grosor, fill: 'none' }
  if (LINEAS.includes(e.tipo)) {
    const dx = e.dx * ancho / 100, dy = e.dy * alto / 100, largo = Math.hypot(dx, dy) || 1, ux = dx / largo, uy = dy / largo
    const cx = dx / 2 - uy * (e.tipo === 'curva' ? e.curva : 0), cy = dy / 2 + ux * (e.tipo === 'curva' ? e.curva : 0)
    const angulo = Math.atan2(dy - cy, dx - cx), a = Math.cos(angulo), b = Math.sin(angulo)
    let d = `M0 0 Q${cx} ${cy} ${dx} ${dy}`
    if (e.tipo === 'conduccion') {
      d = 'M0 0'
      for (let i = 1; i <= 24; i++) { const t = i / 24, ond = Math.sin(t * Math.PI * 12) * .8; d += ` L${dx * t - uy * ond} ${dy * t + ux * ond}` }
    }
    return <g><path d={d} {...stroke} strokeDasharray={['punteada', 'pase', 'movimiento'].includes(e.tipo) ? '1.5 1' : undefined} />
      {e.tipo === 'remate' && <path d={`M${-uy * .7} ${ux * .7} L${dx - uy * .7} ${dy + ux * .7}`} {...stroke} />}
      <path d={`M${dx - a * 2 - b} ${dy - b * 2 + a} L${dx} ${dy} L${dx - a * 2 + b} ${dy - b * 2 - a}`} {...stroke} />
    </g>
  }
  if (e.tipo === 'jugadora') return <g><circle r={s} fill={e.color} stroke={e.tinta} strokeWidth=".25" /><text y=".2" dominantBaseline="middle" textAnchor="middle" fontSize={s * 1.15} fill={e.tinta}>{e.numero}</text>{e.texto && <text y={s + 2} textAnchor="middle" fontSize="1.8" fill={e.tinta} stroke="#FFFFFF" strokeWidth=".08" paintOrder="stroke">{e.texto}</text>}</g>
  if (e.tipo === 'texto') return <text fill={e.color} fontSize={s} dominantBaseline="middle">{e.texto}</text>
  if (e.tipo === 'pelota') return <g><circle r={s * .6} fill={e.color} stroke={e.tinta} strokeWidth=".2" /><path d={`M0 ${-s * .35} L${s * .33} ${-s * .1} L${s * .2} ${s * .3} H${-s * .2} L${-s * .33} ${-s * .1} Z`} fill={e.tinta} /></g>
  if (e.tipo === 'cono') return <path d={`M0 ${-s} L${s * .65} ${s} H${-s * .65} Z`} fill={e.color} stroke={e.tinta} strokeWidth=".2" />
  if (['tortuga', 'aro', 'circulo'].includes(e.tipo)) return <ellipse rx={s} ry={e.tipo === 'tortuga' ? s * .45 : s} fill={e.tipo === 'tortuga' ? e.color : 'none'} {...(e.tipo === 'tortuga' ? {} : stroke)} />
  if (['zona', 'rectangulo'].includes(e.tipo)) return <rect x={-s} y={-s * .65} width={s * 2} height={s * 1.3} fill={e.tipo === 'zona' ? e.color : 'none'} fillOpacity={e.tipo === 'zona' ? '.25' : '1'} strokeDasharray={e.tipo === 'zona' ? '1 1' : undefined} stroke={e.color} strokeWidth={e.grosor} />
  if (e.tipo === 'pica') return <path d={`M0 ${-s} V${s}`} {...stroke} />
  if (e.tipo === 'valla') return <path d={`M${-s} ${s / 2} V${-s / 2} H${s} V${s / 2}`} {...stroke} />
  if (e.tipo === 'escalera') return <g {...stroke}><path d={`M${-s / 2} ${-s * 2} V${s * 2} M${s / 2} ${-s * 2} V${s * 2}`} />{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${-s / 2} ${-s * 2 + i * s * 2 / 3} h${s}`} />)}</g>
  const arcoAncho = e.tipo === 'mini' ? s : s * 2
  return <g {...stroke}><path d={`M${-arcoAncho} 0 V${-s} H${arcoAncho} V0 Z`} />{[-.5, 0, .5].map(n => <path key={n} d={`M${arcoAncho * n} 0 V${-s}`} strokeWidth=".15" />)}</g>
}

const PizarraCancha = forwardRef(function PizarraCancha({ doc, poses, seleccion = [], onElemento, onFondo, onPointerMove, onPointerUp, onPointerCancel, zoom = 1, pan = { x: 0, y: 0 }, caja }, ref) {
  const [w, h] = SUPERFICIES[doc.superficie], vertical = doc.orientacion === 'vertical'
  const recorte = useId().replaceAll(':', '')
  const centroArco = doc.superficie === 'cuarto' ? h : h / 2
  const ancho = vertical ? h : w, alto = vertical ? w : h
  const verde = doc.superficie === 'libre' ? '#285C49' : '#24733F'
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`-3 -3 ${ancho + 6} ${alto + 6}`} role="img" aria-label="Cancha táctica editable" className="pizarra-cancha"
    onPointerDown={onFondo} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
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
          <Figura e={e} ancho={w} alto={h} />{onElemento && <circle r={Math.max(e.tamano, 3)} fill="transparent" stroke="none" />}
          {seleccion.includes(e.id) && <circle data-seleccion="true" r={e.tamano + 1} fill="none" stroke="#FFFFFF" strokeWidth=".3" strokeDasharray="1 .5" pointerEvents="none" />}
        </g> })}
        {caja && <rect x={Math.min(caja.x, caja.x2) * w / 100} y={Math.min(caja.y, caja.y2) * h / 100} width={Math.abs(caja.x2 - caja.x) * w / 100} height={Math.abs(caja.y2 - caja.y) * h / 100} fill="#FFFFFF" fillOpacity=".15" stroke="#FFFFFF" strokeWidth=".3" />}
      </g>
    </g>
  </svg>
})
export default PizarraCancha
