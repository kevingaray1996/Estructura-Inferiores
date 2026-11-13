import { forwardRef, memo, useId } from 'react'
import { LINEAS, SUPERFICIES } from '../utils/pizarra'
import PizarraObjeto from './PizarraObjeto'

// Colores de cancha desde el tema (apariencia.css). El PNG los resuelve al exportar.
const CESPED = { fill: 'var(--pizarra-cesped)' }, CESPED_LIBRE = { fill: 'var(--pizarra-cesped-libre)' }
const LINEA = { stroke: 'var(--pizarra-linea)' }, PUNTO = { fill: 'var(--pizarra-linea)' }
const SEL_BORDE = { stroke: 'var(--pizarra-seleccion-borde)' }, SEL = { stroke: 'var(--pizarra-seleccion)' }
const MANIJA = { fill: 'var(--pizarra-seleccion)', stroke: 'var(--pizarra-seleccion-borde)' }

// Objetos que se leen "de pie": en vista vertical se contragiran para que números y textos no queden acostados.
const ERGUIDOS = ['jugadora', 'pelota', 'texto', 'cono', 'tortuga', 'pica']

// `giro`: sentido de la vista vertical. 90 = orientación guardada (ataque derecha hacia abajo);
// -90 = vista automática del celular (ataque derecha hacia arriba). No cambia el documento.
// `toque` es el radio mínimo de agarre en unidades de cancha (≈22 px en pantalla, calculado por el editor).
const PizarraCancha = memo(forwardRef(function PizarraCancha({ doc, poses, seleccion = [], onElemento, onExtremo, onFondo, onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel, onDragOver, onDrop, zoom = 1, pan = { x: 0, y: 0 }, caja, toque = 3, arrastrando = null, giro = 90, miniatura = false }, ref) {
  const [w, h] = SUPERFICIES[doc.superficie], vertical = doc.orientacion === 'vertical'
  const recorte = useId().replaceAll(':', '')
  const centroArco = doc.superficie === 'cuarto' ? h : h / 2
  const ancho = vertical ? h : w, alto = vertical ? w : h
  const cesped = doc.superficie === 'libre' ? CESPED_LIBRE : CESPED
  const unica = seleccion.length === 1 ? seleccion[0] : null
  const contragiro = vertical ? -giro : 0
  const flechaAtaque = vertical ? ((giro === 90) === (doc.ataque === 'derecha') ? '↓' : '↑') : doc.ataque === 'derecha' ? '→' : '←'
  // Las líneas van debajo de las fichas: una flecha que sale de una jugadora no le tapa el agarre.
  const ordenados = [...doc.elementos.filter(e => LINEAS.includes(e.tipo)), ...doc.elementos.filter(e => !LINEAS.includes(e.tipo))]
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`-3 -3 ${ancho + 6} ${alto + 6}`} role="img" aria-label={miniatura ? 'Vista previa de cancha' : 'Cancha táctica editable'} className={miniatura ? 'pizarra-vista-miniatura' : 'pizarra-cancha'} style={miniatura ? undefined : { aspectRatio: `${ancho + 6} / ${alto + 6}` }}
    onPointerDown={onFondo} onPointerDownCapture={onPointerDownCapture} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDragOver={onDragOver} onDrop={onDrop}>
    <title>Pizarra táctica de Comunicaciones</title><defs><clipPath id={recorte}><rect width={w} height={h} /></clipPath></defs><rect x="-3" y="-3" width={ancho + 6} height={alto + 6} style={cesped} />
    <g data-viewport="true" transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      <g data-campo="true" transform={vertical ? (giro === 90 ? `translate(${h} 0) rotate(90)` : `translate(0 ${w}) rotate(-90)`) : undefined}>
        <rect width={w} height={h} style={cesped} />
        {doc.superficie !== 'libre' && <g fill="none" style={LINEA} strokeWidth=".18" opacity=".9" clipPath={`url(#${recorte})`}>
          <rect width={w} height={h} />
          {doc.superficie === 'completa' && <><path d={`M${w / 2} 0 V${h}`} /><circle cx={w / 2} cy={h / 2} r="9.15" /><circle cx={w / 2} cy={h / 2} r=".3" style={PUNTO} /></>}
          {['completa', 'media', 'cuarto', 'area'].includes(doc.superficie) ? <>
            <path d={`M0 ${centroArco - 20.16} H16.5 V${centroArco + 20.16} H0 M0 ${centroArco - 9.16} H5.5 V${centroArco + 9.16} H0`} />
            <circle cx="11" cy={centroArco} r=".3" style={PUNTO} />
            <path d={`M16.5 ${centroArco - 7.3} A9.15 9.15 0 0 1 16.5 ${centroArco + 7.3}`} />
            {doc.superficie === 'media' && <path d={`M${w} ${h / 2 - 9.15} A9.15 9.15 0 0 0 ${w} ${h / 2 + 9.15}`} />}
            {doc.superficie === 'completa' && <g transform={`translate(${w} ${h}) rotate(180)`}><path d={`M0 ${h / 2 - 20.16} H16.5 V${h / 2 + 20.16} H0 M0 ${h / 2 - 9.16} H5.5 V${h / 2 + 9.16} H0 M0 ${h / 2 - 3.66} H-1.5 V${h / 2 + 3.66} H0`} /><circle cx="11" cy={h / 2} r=".3" style={PUNTO} /></g>}
          </> : <><path d={`M${w / 2} 0 V${h}`} /><circle cx={w / 2} cy={h / 2} r={h / 6} /></>}
        </g>}
        <text transform={`translate(${w / 2} ${h - 1.5}) rotate(${contragiro})`} textAnchor={!vertical ? 'middle' : giro === 90 ? 'start' : 'end'} style={PUNTO} opacity=".8" fontSize="1.5">Ataque {flechaAtaque}</text>
        {ordenados.map(e => {
          const p = poses[e.id]; if (!p) return null
          const linea = LINEAS.includes(e.tipo), px = e.dx * w / 100, py = e.dy * h / 100, elegido = seleccion.includes(e.id)
          return <g key={e.id} data-elemento={e.id} className={arrastrando === e.id ? 'pizarra-elevado' : undefined} transform={`translate(${p.x * w / 100} ${p.y * h / 100}) rotate(${p.rotacion})`}
            onPointerDown={event => { if (onElemento) { event.stopPropagation(); onElemento(event, e.id) } }} style={{ cursor: onElemento ? 'grab' : 'default' }}>
            {contragiro && ERGUIDOS.includes(e.tipo) ? <g transform={`rotate(${contragiro})`}><PizarraObjeto e={e} ancho={w} alto={h} /></g> : <PizarraObjeto e={e} ancho={w} alto={h} />}
            {onElemento && (linea
              ? <path d={`M0 0 L${px} ${py}`} stroke="transparent" strokeWidth={toque * 1.4} strokeLinecap="round" fill="none" />
              : <circle r={Math.max(e.tamano, toque)} fill="transparent" stroke="none" />)}
            {elegido && (linea
              ? <path data-seleccion="true" pointerEvents="none" d={`M0 0 L${px} ${py}`} fill="none" style={SEL} strokeWidth=".3" strokeDasharray=".8 .6" />
              : <g data-seleccion="true" pointerEvents="none"><circle r={e.tamano + 1} fill="none" style={SEL_BORDE} strokeWidth=".7" /><circle r={e.tamano + 1} fill="none" style={SEL} strokeWidth=".4" strokeDasharray="1 .5" /></g>)}
            {linea && unica === e.id && onExtremo && ['origen', 'punta'].map(extremo => <g key={extremo} data-seleccion="true" data-extremo={extremo} transform={extremo === 'punta' ? `translate(${px} ${py})` : undefined}
              onPointerDown={event => { event.stopPropagation(); onExtremo(event, e.id, extremo) }} style={{ cursor: 'move' }}>
              <circle r={toque} fill="transparent" /><circle r={Math.min(1.4, toque * .45)} style={MANIJA} strokeWidth=".2" />
            </g>)}
          </g>
        })}
        {caja && <rect x={Math.min(caja.x, caja.x2) * w / 100} y={Math.min(caja.y, caja.y2) * h / 100} width={Math.abs(caja.x2 - caja.x) * w / 100} height={Math.abs(caja.y2 - caja.y) * h / 100} style={{ fill: 'var(--pizarra-linea)', stroke: 'var(--pizarra-linea)' }} fillOpacity=".15" strokeWidth=".3" />}
      </g>
    </g>
  </svg>
}))
export default PizarraCancha
