import { memo, useContext } from 'react'
import { ContextoCancha } from './pizarraContexto'
import { LINEAS } from '../utils/pizarra'
// Convención de trazos: pase = continua con punta llena, conducción = ondulada,
// desplazamiento sin pelota = guiones, flecha punteada = puntos.
const TRAZOS = { punteada: '.5 1', movimiento: '2.2 1.3' }

const SOMBRA = { fill: 'var(--pizarra-ficha-sombra)' }
const NUMERO = { fontFamily: 'var(--pizarra-fuente)' }

// Volumen (etapa H): sombra apoyada en el piso, desplazada abajo a la derecha, y brillo/relieve encima del color.
// `altura` (m, pase alto de la etapa I): la sombra se separa y se achica a medida que la pelota sube.
function Sombra({ r, altura = 0 }) { return <ellipse cx={r * .2 + altura * .45} cy={r * .42 + altura * .6} rx={r * .98 / (1 + altura * .06)} ry={r * .78 / (1 + altura * .06)} style={SOMBRA} fillOpacity={.32 / (1 + altura * .12)} /> }
function Brillo({ r, id }) { return <circle r={r} fill={`url(#${id})`} pointerEvents="none" /> }

export default memo(function PizarraObjeto({ e, ancho, alto, altura = 0 }) {
  const brillo = useContext(ContextoCancha)
  const s = e.tamano, stroke = { stroke: e.color, strokeWidth: e.grosor, fill: 'none' }
  // Zona sombreada (v2): polígono relativo a la pose; los puntos están en % de la superficie.
  if (e.tipo === 'sombra') return <polygon points={(e.puntos || []).map(p => `${p.x * ancho / 100},${p.y * alto / 100}`).join(' ')} fill={e.color} fillOpacity=".28" stroke={e.color} strokeWidth={Math.max(.15, e.grosor * .6)} strokeDasharray="1.2 .8" strokeLinejoin="round" />
  if (LINEAS.includes(e.tipo)) {
    const dx = e.dx * ancho / 100, dy = e.dy * alto / 100, largo = Math.hypot(dx, dy) || 1, ux = dx / largo, uy = dy / largo
    const cx = dx / 2 - uy * (e.tipo === 'curva' ? e.curva : 0), cy = dy / 2 + ux * (e.tipo === 'curva' ? e.curva : 0)
    const angulo = Math.atan2(dy - cy, dx - cx), a = Math.cos(angulo), b = Math.sin(angulo)
    let d = `M0 0 Q${cx} ${cy} ${dx} ${dy}`
    if (e.tipo === 'conduccion') {
      d = 'M0 0'
      // Una onda cada ~3 m; se aplana al final para que la punta quede limpia.
      const ondas = Math.max(2, Math.round(largo / 3)), pasos = ondas * 8
      for (let i = 1; i <= pasos; i++) { const t = i / pasos, ond = Math.sin(t * Math.PI * 2 * ondas) * .7 * Math.min(1, (1 - t) * 6); d += ` L${dx * t - uy * ond} ${dy * t + ux * ond}` }
    }
    const punta = `M${dx - a * 2 - b} ${dy - b * 2 + a} L${dx} ${dy} L${dx - a * 2 + b} ${dy - b * 2 - a}`
    return <g><path d={d} {...stroke} strokeLinecap="round" strokeDasharray={TRAZOS[e.tipo]} />
      {e.tipo === 'remate' && <path d={`M${-uy * .7} ${ux * .7} L${dx - uy * .7} ${dy + ux * .7}`} {...stroke} />}
      {e.tipo === 'pase' ? <path d={`${punta} Z`} fill={e.color} stroke={e.color} strokeWidth={e.grosor} strokeLinejoin="round" /> : <path d={punta} {...stroke} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  }
  if (e.tipo === 'jugadora') return <g>{brillo && <Sombra r={s} />}<circle r={s} fill={e.color} />{brillo && <Brillo r={s} id={brillo} />}<circle r={s - .11} fill="none" stroke={e.tinta} strokeWidth=".22" strokeOpacity=".85" />
    <text y={s * .06} dominantBaseline="middle" textAnchor="middle" fontSize={s * 1.2} fontWeight="700" style={NUMERO} fill={e.tinta}>{e.numero}</text>
    {e.texto && <text y={s + 2} textAnchor="middle" fontSize="1.8" fontWeight="700" style={NUMERO} fill={e.tinta} stroke="#FFFFFF" strokeWidth=".08" paintOrder="stroke">{e.texto}</text>}</g>
  if (e.tipo === 'texto') return <text fill={e.color} fontSize={s} dominantBaseline="middle">{e.texto}</text>
  if (e.tipo === 'pelota') return <g>{brillo && <Sombra r={s * .7} altura={altura} />}<g transform={altura ? `scale(${1 + altura * .09})` : undefined}><circle r={s * .7} fill={e.color} stroke={e.tinta} strokeWidth=".2" /><path d={`M0 ${-s * .35} L${s * .33} ${-s * .1} L${s * .2} ${s * .3} H${-s * .2} L${-s * .33} ${-s * .1} Z`} fill={e.tinta} />{Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5 - Math.PI / 2; return <path key={i} d={`M${Math.cos(a) * s * .3} ${Math.sin(a) * s * .3} L${Math.cos(a) * s * .68} ${Math.sin(a) * s * .68}`} stroke={e.tinta} strokeWidth=".15" /> })}{brillo && <Brillo r={s * .7} id={brillo} />}</g></g>
  if (e.tipo === 'cono') return <g><ellipse cy={s * .8} rx={s} ry={s * .35} fill={e.color} stroke={e.tinta} strokeWidth=".15" /><path d={`M0 ${-s} L${s * .65} ${s * .7} Q0 ${s * 1.05} ${-s * .65} ${s * .7} Z`} fill={e.color} stroke={e.tinta} strokeWidth=".15" /><path d={`M${-s * .27} ${-s * .25} Q0 ${-s * .12} ${s * .27} ${-s * .25} L${s * .4} ${s * .12} Q0 ${s * .3} ${-s * .4} ${s * .12} Z`} fill="#FFFFFF" fillOpacity=".85" /><path d={`M0 ${-s * .9} L${s * .6} ${s * .7} Q${s * .25} ${s * .85} 0 ${s * .85} Z`} fill="#000000" fillOpacity=".13" /></g>
  if (e.tipo === 'tortuga') return <g><ellipse cy={s * .2} rx={s} ry={s * .4} fill={e.color} stroke={e.tinta} strokeWidth=".15" /><path d={`M${-s} ${s * .2} Q0 ${-s * 1.2} ${s} ${s * .2} Q0 ${s * .55} ${-s} ${s * .2}`} fill={e.color} stroke={e.tinta} strokeWidth=".15" /><ellipse cy={-s * .15} rx={s * .23} ry={s * .1} fill={e.tinta} /></g>
  if (['aro', 'circulo'].includes(e.tipo)) return <circle r={s} {...stroke} strokeWidth={e.tipo === 'aro' ? Math.max(.4, e.grosor) : e.grosor} />
  if (['zona', 'rectangulo'].includes(e.tipo)) return <rect x={-s} y={-s * .65} width={s * 2} height={s * 1.3} fill={e.tipo === 'zona' ? e.color : 'none'} fillOpacity={e.tipo === 'zona' ? '.25' : '1'} strokeDasharray={e.tipo === 'zona' ? '1 1' : undefined} stroke={e.color} strokeWidth={e.grosor} />
  if (e.tipo === 'pica') return <g><ellipse cy={s * 1.1} rx={s * .45} ry={s * .16} fill={e.tinta} /><path d={`M0 ${-s * 1.5} V${s}`} {...stroke} strokeWidth={Math.max(.35, e.grosor)} /><path d={`M0 ${-s} v${s * .4}`} stroke="#FFFFFF" strokeWidth=".3" /></g>
  if (e.tipo === 'valla') return <g><path d={`M${-s} ${s / 2} V${-s / 2} H${s} V${s / 2} M${-s * 1.3} ${s / 2} h${s * .6} M${s * .7} ${s / 2} h${s * .6}`} {...stroke} strokeWidth={Math.max(.3, e.grosor)} /><path d={`M${-s * .7} ${-s / 2} h${s * .35} M0 ${-s / 2} h${s * .35}`} stroke="#FFFFFF" strokeWidth=".3" /></g>
  if (e.tipo === 'escalera') return <g {...stroke}><path d={`M${-s / 2} ${-s * 2} V${s * 2} M${s / 2} ${-s * 2} V${s * 2}`} />{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${-s / 2} ${-s * 2 + i * s * 2 / 3} h${s}`} />)}</g>
  const arcoAncho = e.tipo === 'mini' ? s : s * 2
  return <g {...stroke}><path d={`M${-arcoAncho} 0 V${-s} H${arcoAncho} V0 M${-arcoAncho} 0 l${s * .5} ${-s * .5} H${arcoAncho + s * .5} L${arcoAncho} 0 M${arcoAncho} ${-s} l${s * .5} ${s * .5} V${-s * .5} M${-arcoAncho} ${-s} l${s * .5} ${s * .5} H${arcoAncho + s * .5}`} />{[-.75, -.5, -.25, 0, .25, .5, .75].map(n => <path key={n} d={`M${arcoAncho * n} 0 V${-s}`} strokeWidth=".1" />)}<path d={`M${-arcoAncho} ${-s / 2} H${arcoAncho}`} strokeWidth=".1" /></g>
})

