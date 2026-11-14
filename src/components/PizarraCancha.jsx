import { forwardRef, memo, useId } from 'react'
import { LINEAS, SUPERFICIES } from '../utils/pizarra'
import PizarraObjeto from './PizarraObjeto'
import { ContextoCancha } from './pizarraContexto'
import { escena } from '../utils/pizarraEscena'
import { OSCURECER_FOCO } from '../utils/pizarraExplicar'

// Colores de cancha desde el tema (apariencia.css). El PNG los resuelve al exportar.
const CESPED = { fill: 'var(--pizarra-cesped)' }, CESPED_LIBRE = { fill: 'var(--pizarra-cesped-libre)' }
const LINEA = { stroke: 'var(--pizarra-linea)' }, PUNTO = { fill: 'var(--pizarra-linea)' }
const SEL_BORDE = { stroke: 'var(--pizarra-seleccion-borde)' }, SEL = { stroke: 'var(--pizarra-seleccion)' }
const MANIJA = { fill: 'var(--pizarra-seleccion)', stroke: 'var(--pizarra-seleccion-borde)' }

// Objetos que se leen "de pie": en vista vertical se contragiran para que números y textos no queden acostados.
const ERGUIDOS = ['jugadora', 'pelota', 'texto', 'cono', 'tortuga', 'pica']

const POSESION = { stroke: 'var(--pizarra-posesion)' }
// Rediseño: franjas de corte, viñeta del borde y brillo/relieve compartido por las fichas con volumen.
const FRANJA = { fill: 'var(--pizarra-cesped-franja)' }, BORDE_CESPED = { stopColor: 'var(--pizarra-cesped-borde)' }
const BRILLO = { stopColor: 'var(--pizarra-brillo)' }, RELIEVE = { stopColor: 'var(--pizarra-relieve)' }
const TEXTO_CANCHA = { fill: 'var(--pizarra-linea)', fontFamily: 'var(--pizarra-fuente)' }

// Etapa I: pase alto, foco y opacidad mínima de lo oculto mientras se edita.
const PASE_ALTO = { stroke: 'var(--pizarra-pase-alto)' }, PASE_ALTO_PUNTA = { fill: 'var(--pizarra-pase-alto)', stroke: 'var(--pizarra-pase-alto)' }
const PASE_ALTO_SOMBRA = { stroke: 'var(--pizarra-ficha-sombra)' }, FOCO = { stroke: 'var(--pizarra-foco)' }
const OCULTO_EDITANDO = .3

// Pase alto: arco del vuelo (otro color) y, debajo, la sombra recta sobre el piso.
function PaseAlto({ f, w, h }) {
  const dx = f.dx * w / 100, dy = f.dy * h / 100, largo = Math.hypot(dx, dy) || 1, ux = dx / largo, uy = dy / largo
  // El arco se curva siempre hacia el mismo lado de la pantalla para que se lea como "por arriba".
  let nx = -uy, ny = ux
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny }
  const flecha = Math.min(largo * .28, 9), cx = dx / 2 + nx * flecha, cy = dy / 2 + ny * flecha
  const angulo = Math.atan2(dy - cy, dx - cx), a = Math.cos(angulo), b = Math.sin(angulo)
  return <g data-pase-alto="true">
    <path d={`M0 0 L${dx} ${dy}`} style={PASE_ALTO_SOMBRA} strokeOpacity=".35" strokeWidth=".35" strokeDasharray=".8 .8" fill="none" strokeLinecap="round" />
    <path d={`M0 0 Q${cx} ${cy} ${dx} ${dy}`} style={PASE_ALTO} strokeWidth=".45" fill="none" strokeLinecap="round" />
    <path d={`M${dx - a * 2.2 - b * 1.1} ${dy - b * 2.2 + a * 1.1} L${dx} ${dy} L${dx - a * 2.2 + b * 1.1} ${dy - b * 2.2 - a * 1.1} Z`} style={PASE_ALTO_PUNTA} strokeWidth=".2" strokeLinejoin="round" />
  </g>
}

// Recorridos de la animación debajo de las fichas. 'estela': se desvanece hacia la cola; 'completo': línea pareja.
function Estelas({ estelas, modo, w, h }) {
  const TRAMOS = 6
  return <g data-estelas="true" pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
    {estelas.map(({ id, tipo, color, puntos }) => {
      const ancho = tipo === 'pelota' ? .35 : .6, aMetros = ([x, y]) => `${x * w / 100} ${y * h / 100}`
      if (modo === 'completo') return <polyline key={id} points={puntos.map(aMetros).join(' ')} stroke={color} strokeWidth={ancho} opacity=".55" strokeDasharray={tipo === 'pelota' ? '.6 .5' : undefined} />
      const largo = Math.ceil((puntos.length - 1) / TRAMOS)
      return <g key={id}>{Array.from({ length: TRAMOS }, (_, i) => {
        const parte = puntos.slice(i * largo, (i + 1) * largo + 1)
        return parte.length > 1 && <polyline key={i} points={parte.map(aMetros).join(' ')} stroke={color} strokeWidth={ancho * (.55 + .45 * (i + 1) / TRAMOS)} opacity={.12 + .58 * (i + 1) / TRAMOS} />
      })}</g>
    })}
  </g>
}

// `giro`: sentido de la vista vertical. 90 = orientación guardada (ataque derecha hacia abajo);
// -90 = vista automática del celular (ataque derecha hacia arriba). No cambia el documento.
// `toque` es el radio mínimo de agarre en unidades de cancha (≈22 px en pantalla, calculado por el editor).
// Capas calculadas, que nunca se guardan: `estelas` (recorridos), `automaticas` (flechas entre pasos),
// `fantasmas` (poses del paso anterior), `pegadas` (pelotas con dueña) e `iman` (jugadora que atraería la pelota).
// Los anillos de posesión e imán llevan data-seleccion: el PNG los quita como a la selección.
// Etapa I: `alturas` (pelota en el aire), `opacidades` (fundido de lo oculto por paso), `foco` ({ id, peso }) y
// `camara` ({ x, y, escala } en metros). `verOcultos`: al editar, lo oculto se ve tenue para poder tocarlo.
const PizarraCancha = memo(forwardRef(function PizarraCancha({ doc, poses, seleccion = [], onElemento, onExtremo, onVertice, onFondo, onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel, onDragOver, onDrop, zoom = 1, pan = { x: 0, y: 0 }, caja, toque = 3, arrastrando = null, giro = 90, miniatura = false, estelas = null, modoEstela = 'estela', automaticas = null, fantasmas = null, pegadas = null, iman = null, alturas = null, opacidades = null, foco = null, camara = null, verOcultos = false }, ref) {
  const [w, h] = SUPERFICIES[doc.superficie], vertical = doc.orientacion === 'vertical'
  const recorte = useId().replaceAll(':', '')
  const centroArco = doc.superficie === 'cuarto' ? h : h / 2
  const ancho = vertical ? h : w, alto = vertical ? w : h
  const cesped = doc.superficie === 'libre' ? CESPED_LIBRE : CESPED
  const unica = seleccion.length === 1 ? seleccion[0] : null
  const contragiro = vertical ? -giro : 0
  const flechaAtaque = vertical ? ((giro === 90) === (doc.ataque === 'derecha') ? '↓' : '↑') : doc.ataque === 'derecha' ? '→' : '←'
  // Las líneas van debajo de las fichas: una flecha que sale de una jugadora no le tapa el agarre.
  // El modelo de escena ordena por capas (líneas, materiales, jugadoras, pelota, textos) y da posiciones en metros.
  const objetos = escena(doc, poses, alturas || {}).objetos
  const camaraActiva = camara && camara.escala > 1.001
  // Opacidad final de cada objeto: fundido por paso y, con foco, todo lo demás más apagado.
  const opacidad = id => {
    let o = opacidades?.[id] ?? 1
    if (verOcultos) o = Math.max(o, OCULTO_EDITANDO)
    if (foco && foco.id !== id) o *= 1 - OSCURECER_FOCO * foco.peso
    return o
  }
  const brillo = `${recorte}-brillo`, vineta = `${recorte}-vineta`
  // Franjas de corte a lo largo de la cancha, de unos 7-9 m.
  const franjas = doc.superficie === 'libre' ? 0 : Math.max(4, Math.round(w / 8.75))
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`-3 -3 ${ancho + 6} ${alto + 6}`} role="img" aria-label={miniatura ? 'Vista previa de cancha' : 'Cancha táctica editable'} className={miniatura ? 'pizarra-vista-miniatura' : 'pizarra-cancha'} style={miniatura ? undefined : { aspectRatio: `${ancho + 6} / ${alto + 6}` }}
    onPointerDown={onFondo} onPointerDownCapture={onPointerDownCapture} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDragOver={onDragOver} onDrop={onDrop}>
    <title>Pizarra táctica de Comunicaciones</title><defs><clipPath id={recorte}><rect width={w} height={h} /></clipPath>
      <radialGradient id={brillo} cx=".34" cy=".28" r=".78"><stop offset="0" style={BRILLO} stopOpacity=".55" /><stop offset=".42" style={BRILLO} stopOpacity=".06" /><stop offset="1" style={RELIEVE} stopOpacity=".32" /></radialGradient>
      <radialGradient id={vineta} cx=".5" cy=".5" r=".72"><stop offset=".62" style={BORDE_CESPED} stopOpacity="0" /><stop offset="1" style={BORDE_CESPED} stopOpacity=".55" /></radialGradient></defs><rect x="-3" y="-3" width={ancho + 6} height={alto + 6} style={cesped} />
    <ContextoCancha.Provider value={brillo}><g data-viewport="true" transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      <g data-campo="true" transform={vertical ? (giro === 90 ? `translate(${h} 0) rotate(90)` : `translate(0 ${w}) rotate(-90)`) : undefined}>
       <g data-camara={camaraActiva ? 'true' : undefined} transform={camaraActiva ? `translate(${w / 2} ${h / 2}) scale(${camara.escala}) translate(${-camara.x} ${-camara.y})` : undefined}>
        <rect width={w} height={h} style={cesped} />
        {franjas > 0 && <g data-franjas="true" pointerEvents="none">{Array.from({ length: franjas }, (_, i) => i % 2 === 1 && <rect key={i} x={i * w / franjas} width={w / franjas} height={h} style={FRANJA} />)}</g>}
        <rect width={w} height={h} fill={`url(#${vineta})`} pointerEvents="none" />
        {doc.superficie !== 'libre' && <g fill="none" style={LINEA} strokeWidth=".14" opacity=".85" clipPath={`url(#${recorte})`}>
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
        <text transform={`translate(${w / 2} ${h - 1.5}) rotate(${contragiro})`} textAnchor={!vertical ? 'middle' : giro === 90 ? 'start' : 'end'} style={TEXTO_CANCHA} opacity=".75" fontSize="1.6" fontWeight="700" letterSpacing=".12">Ataque {flechaAtaque}</text>
        {estelas?.length > 0 && <Estelas estelas={estelas} modo={modoEstela} w={w} h={h} />}
        {fantasmas && <g data-fantasmas="true" pointerEvents="none">{doc.elementos.map(e => {
          const antes = fantasmas[e.id], ahora = poses[e.id]
          if (!antes || !ahora || LINEAS.includes(e.tipo) || Math.hypot((antes.x - ahora.x) * w / 100, (antes.y - ahora.y) * h / 100) < .5) return null
          return <g key={e.id} opacity=".32">
            {!automaticas && <path d={`M${antes.x * w / 100} ${antes.y * h / 100} L${ahora.x * w / 100} ${ahora.y * h / 100}`} style={LINEA} strokeWidth=".2" strokeDasharray=".6 .6" fill="none" />}
            <g transform={`translate(${antes.x * w / 100} ${antes.y * h / 100}) rotate(${antes.rotacion})`}>
              {contragiro && ERGUIDOS.includes(e.tipo) ? <g transform={`rotate(${contragiro})`}><PizarraObjeto e={e} ancho={w} alto={h} /></g> : <PizarraObjeto e={e} ancho={w} alto={h} />}
            </g>
          </g>
        })}</g>}
        {automaticas?.length > 0 && <g data-automaticas="true" pointerEvents="none" opacity=".9">{automaticas.map(f =>
          <g key={f.id} data-automatica={f.alto ? 'pase-alto' : f.tipo} transform={`translate(${f.x * w / 100} ${f.y * h / 100})`}>
            {f.alto ? <PaseAlto f={f} w={w} h={h} /> : <PizarraObjeto e={{ id: f.id, tipo: f.tipo, color: f.color, tinta: f.color, tamano: 3, grosor: .35, dx: f.dx, dy: f.dy, curva: 0, texto: '', numero: '' }} ancho={w} alto={h} />}
          </g>)}</g>}
        {objetos.map(({ elemento: e, x, y, z, rotacion }) => {
          const linea = LINEAS.includes(e.tipo), px = e.dx * w / 100, py = e.dy * h / 100, elegido = seleccion.includes(e.id), o = opacidad(e.id)
          if (o <= .001) return null
          const dibujo = <PizarraObjeto e={e} ancho={w} alto={h} altura={z} />
          return <g key={e.id} data-elemento={e.id} data-oculto={(opacidades?.[e.id] ?? 1) < 1 ? 'true' : undefined} opacity={o < 1 ? o : undefined} className={arrastrando === e.id ? 'pizarra-elevado' : undefined} transform={`translate(${x} ${y}) rotate(${rotacion})`}
            onPointerDown={event => { if (onElemento) { event.stopPropagation(); onElemento(event, e.id) } }} style={{ cursor: onElemento ? 'grab' : 'default' }}>
            {foco?.id === e.id && <g data-foco="true" pointerEvents="none" opacity={foco.peso}><circle r={e.tamano + 1.6} fill="none" style={FOCO} strokeWidth="1.1" strokeOpacity=".3" /><circle r={e.tamano + 1.2} fill="none" style={FOCO} strokeWidth=".45" /></g>}
            {contragiro && ERGUIDOS.includes(e.tipo) ? <g transform={`rotate(${contragiro})`}>{dibujo}</g> : dibujo}
            {pegadas?.includes(e.id) && <circle data-seleccion="true" data-pegada="true" pointerEvents="none" r={e.tamano * .7 + .55} fill="none" style={POSESION} strokeWidth=".35" />}
            {iman === e.id && <circle data-seleccion="true" data-iman="true" pointerEvents="none" r={e.tamano + 1.3} fill="none" style={POSESION} strokeWidth=".45" strokeDasharray="1 .6" />}
            {onElemento && (linea
              ? <path d={`M0 0 L${px} ${py}`} stroke="transparent" strokeWidth={toque * 1.4} strokeLinecap="round" fill="none" />
              : <circle r={Math.max(e.tamano, toque)} fill="transparent" stroke="none" />)}
            {elegido && (linea
              ? <path data-seleccion="true" pointerEvents="none" d={`M0 0 L${px} ${py}`} fill="none" style={SEL} strokeWidth=".3" strokeDasharray=".8 .6" />
              : e.tipo === 'sombra'
                ? <polygon data-seleccion="true" pointerEvents="none" points={e.puntos.map(p => `${p.x * w / 100},${p.y * h / 100}`).join(' ')} fill="none" style={SEL} strokeWidth=".35" strokeDasharray="1 .5" />
                : <g data-seleccion="true" pointerEvents="none"><circle r={e.tamano + 1} fill="none" style={SEL_BORDE} strokeWidth=".7" /><circle r={e.tamano + 1} fill="none" style={SEL} strokeWidth=".4" strokeDasharray="1 .5" /></g>)}
            {e.tipo === 'sombra' && unica === e.id && onVertice && e.puntos.map((p, i) => <g key={i} data-seleccion="true" data-vertice={i} transform={`translate(${p.x * w / 100} ${p.y * h / 100})`}
              onPointerDown={event => { event.stopPropagation(); onVertice(event, e.id, i) }} style={{ cursor: 'move' }}>
              <circle r={toque} fill="transparent" /><circle r={Math.min(1.2, toque * .4)} style={MANIJA} strokeWidth=".2" />
            </g>)}
            {linea && unica === e.id && onExtremo && ['origen', 'punta'].map(extremo => <g key={extremo} data-seleccion="true" data-extremo={extremo} transform={extremo === 'punta' ? `translate(${px} ${py})` : undefined}
              onPointerDown={event => { event.stopPropagation(); onExtremo(event, e.id, extremo) }} style={{ cursor: 'move' }}>
              <circle r={toque} fill="transparent" /><circle r={Math.min(1.4, toque * .45)} style={MANIJA} strokeWidth=".2" />
            </g>)}
          </g>
        })}
        {caja && <rect x={Math.min(caja.x, caja.x2) * w / 100} y={Math.min(caja.y, caja.y2) * h / 100} width={Math.abs(caja.x2 - caja.x) * w / 100} height={Math.abs(caja.y2 - caja.y) * h / 100} style={{ fill: 'var(--pizarra-linea)', stroke: 'var(--pizarra-linea)' }} fillOpacity=".15" strokeWidth=".3" />}
       </g>
      </g>
    </g></ContextoCancha.Provider>
  </svg>
}))
export default PizarraCancha
