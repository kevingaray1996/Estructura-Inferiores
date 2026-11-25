import { useId } from 'react'
import { aPixeles } from '../../../utils/analisis/dibujos/coordenadas'
import { COLOR } from './apoyo'

// Pinta en SVG lo que devuelve escenaEn() sobre el cuadro del video. Solo dibuja: el que la usa decide el tiempo.
// cuadro: { izquierda, arriba, ancho, alto } dentro del contenedor (ancho × alto del contenedor en total).
// elegidoId: en el editor, el objeto elegido (se marca con puntos de agarre). borrador: objeto a medio dibujar.

const GROSOR = [1, 1.6, 2.4]

function Flecha({ desde, hasta, color, ancho }) {
  const ang = Math.atan2(hasta.y - desde.y, hasta.x - desde.x)
  const largo = ancho * 4.5
  const p1 = { x: hasta.x - largo * Math.cos(ang - 0.45), y: hasta.y - largo * Math.sin(ang - 0.45) }
  const p2 = { x: hasta.x - largo * Math.cos(ang + 0.45), y: hasta.y - largo * Math.sin(ang + 0.45) }
  return <polygon points={`${hasta.x},${hasta.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} style={{ fill: color }} />
}

// Corta el final del trazo para que la punta de la flecha no quede tapada por la línea.
function acortar(desde, hasta, cuanto) {
  const d = Math.hypot(hasta.x - desde.x, hasta.y - desde.y)
  if (d <= cuanto) return hasta
  return { x: hasta.x - ((hasta.x - desde.x) / d) * cuanto, y: hasta.y - ((hasta.y - desde.y) / d) * cuanto }
}

function Rastro({ puntos, color, ancho }) {
  if (puntos.length < 2) return null
  return <path d={puntos.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}
    style={{ stroke: color, strokeOpacity: 0.45, strokeWidth: ancho * 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }} />
}

function Objeto({ el, cuadro, base, idMascara }) {
  const { obj, escala = 1 } = el
  const color = COLOR[obj.color] || COLOR.amarillo
  const ancho = base * GROSOR[(obj.grosor || 2) - 1]
  const px = (p) => aPixeles(p, cuadro)
  const trazo = { stroke: color, strokeWidth: ancho, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const sombra = { stroke: 'var(--dib-sombra)', strokeWidth: ancho + 2, fill: 'none', strokeLinecap: 'round' }

  switch (obj.tipo) {
    case 'pase_bajo': case 'linea': {
      const [a, b] = obj.puntos.map(px)
      const fin = obj.tipo === 'pase_bajo' ? acortar(a, b, ancho * 3) : b
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={fin.x} y2={fin.y} style={sombra} />
          <line x1={a.x} y1={a.y} x2={fin.x} y2={fin.y} style={trazo} />
          {obj.tipo === 'pase_bajo' && <Flecha desde={a} hasta={b} color={color} ancho={ancho} />}
        </g>
      )
    }
    case 'pase_alto': {
      const [a, b] = obj.puntos.map(px)
      const largo = Math.hypot(b.x - a.x, b.y - a.y)
      const control = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(20, largo * 0.35) }
      const fin = acortar(control, b, ancho * 3)
      return (
        <g>
          {/* Sombra en el piso: la pelota viaja por arriba. */}
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ stroke: 'var(--dib-sombra)', strokeWidth: ancho, strokeDasharray: `${ancho * 2} ${ancho * 2}`, fill: 'none' }} />
          <path d={`M${a.x},${a.y} Q${control.x},${control.y} ${fin.x},${fin.y}`} style={sombra} />
          <path d={`M${a.x},${a.y} Q${control.x},${control.y} ${fin.x},${fin.y}`} style={trazo} />
          <Flecha desde={control} hasta={b} color={color} ancho={ancho} />
        </g>
      )
    }
    case 'movimiento': {
      const pts = obj.puntos.map(px)
      const ultimo = pts[pts.length - 1], previo = pts[Math.max(0, pts.length - 3)]
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
      return (
        <g>
          <path d={d} style={{ ...sombra, strokeDasharray: `${ancho * 2.5} ${ancho * 2}` }} />
          <path d={d} style={{ ...trazo, strokeDasharray: `${ancho * 2.5} ${ancho * 2}` }} />
          <Flecha desde={previo} hasta={ultimo} color={color} ancho={ancho} />
        </g>
      )
    }
    case 'zona': {
      const [a, b] = obj.puntos.map(px)
      return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={4}
        style={{ fill: color, fillOpacity: 0.22, stroke: color, strokeWidth: ancho * 0.7 }} />
    }
    case 'poligono': {
      const pts = obj.puntos.map(px).map((p) => `${p.x},${p.y}`).join(' ')
      return obj.puntos.length >= 3
        ? <polygon points={pts} style={{ fill: color, fillOpacity: 0.22, stroke: color, strokeWidth: ancho * 0.7, strokeLinejoin: 'round' }} />
        : <polyline points={pts} style={trazo} />
    }
    case 'texto': {
      const p = px(obj.puntos[0])
      const tam = Math.max(14, cuadro.alto / 20) * (0.8 + 0.2 * (obj.grosor || 2))
      return (
        <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={tam}
          style={{ fill: color, fontFamily: 'var(--fuente-titulo)', fontWeight: 800, paintOrder: 'stroke', stroke: 'var(--dib-tinta)', strokeWidth: tam / 6 }}>
          {obj.texto}
        </text>
      )
    }
    case 'enlace': {
      const a = px(el.a), b = px(el.b)
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={sombra} />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={trazo} />
          <circle cx={a.x} cy={a.y} r={ancho * 1.4} style={{ fill: color }} />
          <circle cx={b.x} cy={b.y} r={ancho * 1.4} style={{ fill: color }} />
        </g>
      )
    }
    case 'anillo': {
      const p = px(el.posicion)
      const rx = cuadro.ancho * 0.032 * escala, ry = rx * 0.36
      return (
        <g>
          {el.rastro && <Rastro puntos={el.rastro.map(px)} color={color} ancho={ancho} />}
          {obj.efectos?.sombra && <ellipse cx={p.x + 2} cy={p.y + 3} rx={rx * 1.1} ry={ry * 1.2} style={{ fill: 'var(--dib-sombra)' }} />}
          <ellipse cx={p.x} cy={p.y} rx={rx} ry={ry} style={{ fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: ancho }} />
        </g>
      )
    }
    case 'foco': {
      const p = px(el.posicion)
      const r = cuadro.ancho * 0.065 * escala
      const centro = { x: p.x, y: p.y - r * 0.55 }
      const ancho_ = cuadro.ancho + cuadro.izquierda * 2 + 4, alto_ = cuadro.alto + cuadro.arriba * 2 + 4
      const rr = Math.max(0.1, r)
      return (
        <g>
          {/* Velo con un agujero redondo (regla evenodd): oscurece todo menos a la jugadora. */}
          <path fillRule="evenodd" style={{ fill: 'var(--dib-velo)' }}
            d={`M${-cuadro.izquierda - 2},${-cuadro.arriba - 2} h${ancho_} v${alto_} h${-ancho_} Z M${centro.x - rr},${centro.y} a${rr},${rr} 0 1,0 ${rr * 2},0 a${rr},${rr} 0 1,0 ${-rr * 2},0 Z`} />
          {el.rastro && <Rastro puntos={el.rastro.map(px)} color={color} ancho={ancho} />}
          <circle cx={centro.x} cy={centro.y} r={Math.max(0, r)} style={{ fill: 'none', stroke: color, strokeWidth: Math.max(1.5, ancho * 0.6) }} />
        </g>
      )
    }
    case 'nombre': {
      const p = px(el.posicion)
      const j = obj.jugadora || {}
      const alto = Math.max(22, cuadro.alto * 0.055) * escala
      if (alto <= 0) return null
      const y = p.y - cuadro.alto * 0.16
      const nombre = j.nombre || (j.rival ? 'Rival' : '')
      const anchoDorsal = alto * 1.1
      const anchoNombre = nombre ? Math.max(alto * 1.5, nombre.length * alto * 0.42) : 0
      const foto = !j.rival && j.foto ? alto : 0
      const total = foto + anchoDorsal + anchoNombre
      const x0 = p.x - total / 2
      const idFoto = `${idMascara}-foto`
      return (
        <g>
          {el.rastro && <Rastro puntos={el.rastro.map(px)} color={color} ancho={ancho} />}
          <line x1={p.x} y1={y + alto / 2} x2={p.x} y2={p.y} style={{ stroke: color, strokeWidth: Math.max(1.5, ancho * 0.5) }} />
          {obj.efectos?.sombra && <rect x={x0 + 3} y={y - alto / 2 + 4} width={total} height={alto} rx={alto * 0.2} style={{ fill: 'var(--dib-sombra)' }} />}
          <rect x={x0} y={y - alto / 2} width={total} height={alto} rx={alto * 0.2} style={{ fill: 'var(--dib-tinta)', stroke: color, strokeWidth: 1.5 }} />
          {foto > 0 && <>
            <clipPath id={idFoto}><circle cx={x0 + alto / 2} cy={y} r={alto / 2 - 2} /></clipPath>
            <image href={j.foto} x={x0 + 2} y={y - alto / 2 + 2} width={alto - 4} height={alto - 4} clipPath={`url(#${idFoto})`} preserveAspectRatio="xMidYMid slice" />
          </>}
          <rect x={x0 + foto} y={y - alto / 2} width={anchoDorsal} height={alto} rx={foto ? 0 : alto * 0.2} style={{ fill: color }} />
          <text x={x0 + foto + anchoDorsal / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={alto * 0.62}
            style={{ fill: 'var(--dib-tinta)', fontFamily: 'var(--fuente-titulo)', fontWeight: 800 }}>{j.dorsal || '?'}</text>
          {nombre && (
            <text x={x0 + foto + anchoDorsal + anchoNombre / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={alto * 0.5}
              style={{ fill: 'var(--dib-blanco)', fontFamily: 'var(--fuente-titulo)', fontWeight: 700 }}>{nombre}</text>
          )}
        </g>
      )
    }
    default:
      return null
  }
}

// Puntos de agarre del objeto elegido (editor).
function Agarres({ el, cuadro }) {
  const o = el.obj
  const pts = el.posicion ? [el.posicion] : o.objetivo ? [o.objetivo] : o.tipo === 'enlace' ? [el.a, el.b] : o.puntos || []
  return (
    <g aria-hidden="true">
      {pts.filter(Boolean).map((p, i) => {
        const q = aPixeles(p, cuadro)
        return <circle key={i} cx={q.x} cy={q.y} r={6} style={{ fill: 'var(--dib-tinta)', stroke: 'var(--dib-blanco)', strokeWidth: 2 }} />
      })}
    </g>
  )
}

export default function CapaDibujos({ escena, ancho, alto, cuadro, elegidoId = null, borrador = null, className = 'dib-svg' }) {
  const idBase = useId().replace(/[^\w-]/g, '')
  if (!ancho || !alto || !cuadro?.ancho) return null
  const base = Math.max(2, cuadro.ancho / 360)
  const elementos = borrador ? [...escena.elementos, borrador] : escena.elementos
  return (
    <svg className={className} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      <g transform={`translate(${cuadro.izquierda} ${cuadro.arriba})`}>
        {elementos.map((el, i) => (
          <g key={el.obj.id || `borrador${i}`} opacity={el.fuera ? 0.45 : 1} className={el.fuera ? 'dib-fuera' : undefined} data-fuera={el.fuera ? 'si' : undefined}>
            <Objeto el={el} cuadro={cuadro} base={base} idMascara={`${idBase}-m${i}`} />
            {el.obj.id && el.obj.id === elegidoId && <Agarres el={el} cuadro={cuadro} />}
          </g>
        ))}
      </g>
    </svg>
  )
}
