import { useId } from 'react'
import { aPixeles } from '../../../utils/analisis/dibujos/coordenadas'
import { textoMetros } from '../../../utils/analisis/dibujos/calibracion'
import { cortarCuadratica, cortarPolilinea, geometriaAnillo } from '../../../utils/analisis/dibujos/animacion'
import { NOMBRE_ESTADO } from '../../../utils/analisis/dibujos/lineaDefensiva'
import { agarresDe } from '../../../utils/analisis/dibujos/operaciones'
import { COLOR } from './apoyo'

// Pinta en SVG lo que devuelve escenaEn() sobre el cuadro del video. Solo dibuja: el que la usa decide el tiempo.
// cuadro: { izquierda, arriba, ancho, alto } dentro del contenedor (ancho × alto del contenedor en total).
// elegidoId: en el editor, el objeto elegido (se marca con puntos de agarre). borrador: objeto a medio dibujar.
// tiempo: en el editor, para ubicar los agarres de las zonas que se mueven.
// Rendimiento: solo degradés y máscaras (nada de filtros de desenfoque), para que el video no se trabe.

const GROSOR = [1, 1.6, 2.4]
const COLOR_ESTADO = { en_linea: 'var(--dib-amarillo)', adelantada: 'var(--dib-naranja)', atras: 'var(--dib-rojo)' }

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
  if (d <= cuanto) return desde
  return { x: hasta.x - ((hasta.x - desde.x) / d) * cuanto, y: hasta.y - ((hasta.y - desde.y) / d) * cuanto }
}

const mezcla = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })

function Rastro({ puntos, color, ancho }) {
  if (puntos.length < 2) return null
  return <path d={puntos.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}
    style={{ stroke: color, strokeOpacity: 0.45, strokeWidth: ancho * 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }} />
}

// Pelotita que recorre la flecha mientras crece.
function Pelota({ p, ancho }) {
  return <circle data-pelota="si" cx={p.x} cy={p.y} r={ancho * 1.7} style={{ fill: 'var(--dib-blanco)', stroke: 'var(--dib-tinta)', strokeWidth: Math.max(1, ancho * 0.5) }} />
}

// Anillo bajo los pies con el hueco atrás (donde están las piernas): parece que la jugadora está parada adentro.
function Anillo({ p, rx, ry, color, ancho, hueco, sombra = false, opacidad = 1 }) {
  const g = geometriaAnillo(p.x, p.y, rx, ry, hueco)
  return (
    <g opacity={opacidad} data-hueco={g.hueco ? 'si' : 'no'}>
      {sombra && <ellipse cx={p.x + 2} cy={p.y + 3} rx={rx * 1.1} ry={ry * 1.2} style={{ fill: 'var(--dib-sombra)' }} />}
      <path d={g.relleno} style={{ fill: color, fillOpacity: 0.2, stroke: 'none' }} />
      <path className="dib-anillo-trazo" d={g.trazo} style={{ fill: 'none', stroke: color, strokeWidth: ancho, strokeLinecap: 'round' }} />
    </g>
  )
}

// Rótulo con fondo oscuro (metros, número de opción, estado de la línea).
function Cartel({ x, y, texto, color, alto, fondo = 'var(--dib-subtitulo-fondo)', tinta = null, dato = undefined }) {
  const largo = texto.length * alto * 0.58 + alto * 0.7
  return (
    <g data-cartel={dato} transform={`translate(${x} ${y})`}>
      <rect x={-largo / 2} y={-alto / 2} width={largo} height={alto} rx={alto / 2} style={{ fill: fondo }} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={alto * 0.66}
        style={{ fill: tinta || color, fontFamily: 'var(--fuente-titulo)', fontWeight: 800 }}>{texto}</text>
    </g>
  )
}

// Relleno, efectos, texto y metros de una zona (rectangular, libre o entre líneas).
function Zona({ el, pts, color, ancho, cuadro, idDefs }) {
  const { obj } = el
  const centro = el.centro ? aPixeles(el.centro, cuadro) : null
  const rayado = obj.efectos?.rayado
  const opacidad = 0.22 * (el.pulso !== undefined ? 0.6 + 0.8 * el.pulso : 1)
  const escala = el.despliegue !== undefined ? el.despliegue : 1
  if (escala <= 0.001) return null
  const transform = centro && escala < 1 ? `translate(${centro.x} ${centro.y}) scale(${escala}) translate(${-centro.x} ${-centro.y})` : undefined
  const forma = obj.tipo === 'zona'
    ? { x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y), w: Math.abs(pts[1].x - pts[0].x), h: Math.abs(pts[1].y - pts[0].y) }
    : null
  const relleno = (estilo) => (forma
    ? <rect x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={4} style={estilo} />
    : <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} style={{ ...estilo, strokeLinejoin: 'round' }} />)
  const tam = Math.max(13, cuadro.alto / 26)
  const medidas = el.medidas ? `Ancho ${textoMetros(el.medidas.ancho)} · Profundidad ${textoMetros(el.medidas.profundidad)}` : ''
  return (
    <g transform={transform}>
      {rayado && (
        <defs>
          <pattern id={`${idDefs}-r`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={10} style={{ stroke: color, strokeWidth: 3, strokeOpacity: 0.55 }} />
          </pattern>
        </defs>
      )}
      {relleno({ fill: color, fillOpacity: opacidad, stroke: color, strokeWidth: ancho * 0.7 })}
      {rayado && relleno({ fill: `url(#${idDefs}-r)`, stroke: 'none' })}
      {centro && obj.texto && (
        <text x={centro.x} y={centro.y - (medidas ? tam * 0.6 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={tam}
          style={{ fill: 'var(--dib-blanco)', fontFamily: 'var(--fuente-titulo)', fontWeight: 800, paintOrder: 'stroke', stroke: 'var(--dib-tinta)', strokeWidth: tam / 5 }}>
          {obj.texto}
        </text>
      )}
      {centro && medidas && <Cartel dato="metros-zona" x={centro.x} y={centro.y + (obj.texto ? tam * 0.75 : 0)} texto={medidas} color={color} alto={tam * 1.15} />}
    </g>
  )
}

// Velo que oscurece todo menos un agujero (d: el camino del agujero).
function velo(cuadro, agujero) {
  const w = cuadro.ancho + cuadro.izquierda * 2 + 4, h = cuadro.alto + cuadro.arriba * 2 + 4
  return `M${-cuadro.izquierda - 2},${-cuadro.arriba - 2} h${w} v${h} h${-w} Z ${agujero}`
}
const caminoElipse = (cx, cy, rx, ry) => `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`

function Objeto({ el, cuadro, base, idMascara }) {
  const { obj, escala = 1 } = el
  const color = COLOR[obj.color] || COLOR.amarillo
  const ancho = base * GROSOR[(obj.grosor || 2) - 1]
  const px = (p) => aPixeles(p, cuadro)
  const trazo = { stroke: color, strokeWidth: ancho, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const sombra = { stroke: 'var(--dib-sombra)', strokeWidth: ancho + 2, fill: 'none', strokeLinecap: 'round' }
  // Flechas que crecen (v3): u = cuánto se ve (1 = entera). La pelotita va en la punta mientras crece.
  const u = el.progreso === undefined ? 1 : el.progreso
  const conPelota = obj.crecer?.pelota && u > 0 && u < 1

  switch (obj.tipo) {
    case 'pase_bajo': case 'linea': {
      if (u <= 0.001) return null
      const [a, bEntero] = obj.puntos.map(px)
      const b = mezcla(a, bEntero, u)
      const fin = obj.tipo === 'pase_bajo' ? acortar(a, b, ancho * 3) : b
      return (
        <g data-progreso={u < 1 ? u.toFixed(2) : undefined}>
          <line x1={a.x} y1={a.y} x2={fin.x} y2={fin.y} style={sombra} />
          <line x1={a.x} y1={a.y} x2={fin.x} y2={fin.y} style={trazo} />
          {obj.tipo === 'pase_bajo' && <Flecha desde={a} hasta={b} color={color} ancho={ancho} />}
          {conPelota && <Pelota p={b} ancho={ancho} />}
        </g>
      )
    }
    case 'pase_alto': {
      if (u <= 0.001) return null
      const [a, b] = obj.puntos.map(px)
      const largo = Math.hypot(b.x - a.x, b.y - a.y)
      const control = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(20, largo * 0.35) }
      // La parte que se ve es la misma curva (De Casteljau) y la sombra en el piso crece con ella.
      const parte = cortarCuadratica(a, control, b, u)
      const piso = mezcla(a, b, u)
      const fin = acortar(parte.c, parte.b, ancho * 3)
      return (
        <g data-progreso={u < 1 ? u.toFixed(2) : undefined}>
          <line data-sombra-piso="si" x1={a.x} y1={a.y} x2={piso.x} y2={piso.y} style={{ stroke: 'var(--dib-sombra)', strokeWidth: ancho, strokeDasharray: `${ancho * 2} ${ancho * 2}`, fill: 'none' }} />
          <path d={`M${a.x},${a.y} Q${parte.c.x},${parte.c.y} ${fin.x},${fin.y}`} style={sombra} />
          <path d={`M${a.x},${a.y} Q${parte.c.x},${parte.c.y} ${fin.x},${fin.y}`} style={trazo} />
          <Flecha desde={parte.c} hasta={parte.b} color={color} ancho={ancho} />
          {conPelota && <>
            <ellipse cx={piso.x} cy={piso.y} rx={ancho * 1.8} ry={ancho * 0.7} style={{ fill: 'var(--dib-sombra)' }} />
            <Pelota p={parte.b} ancho={ancho} />
          </>}
        </g>
      )
    }
    case 'movimiento': {
      if (u <= 0.001) return null
      const pts = cortarPolilinea(obj.puntos.map(px), u)
      if (pts.length < 2) return null
      const ultimo = pts[pts.length - 1], previo = pts[Math.max(0, pts.length - 3)]
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
      return (
        <g data-progreso={u < 1 ? u.toFixed(2) : undefined}>
          <path d={d} style={{ ...sombra, strokeDasharray: `${ancho * 2.5} ${ancho * 2}` }} />
          <path d={d} style={{ ...trazo, strokeDasharray: `${ancho * 2.5} ${ancho * 2}` }} />
          <Flecha desde={previo} hasta={ultimo} color={color} ancho={ancho} />
          {conPelota && <Pelota p={ultimo} ancho={ancho} />}
        </g>
      )
    }
    case 'zona': case 'poligono': case 'zona_lineas': {
      const pts = (el.puntos || obj.puntos).map(px)
      if (obj.tipo !== 'zona' && pts.length < 3) return <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} style={trazo} />
      return <Zona el={el} pts={pts} color={color} ancho={ancho} cuadro={cuadro} idDefs={idMascara} />
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
          {Number.isFinite(el.metros) && (() => {
            // Distancia en metros (clip calibrado), en un cartel en el medio de la línea.
            const texto = textoMetros(el.metros), alto = Math.max(16, cuadro.ancho * 0.026)
            const largo = texto.length * alto * 0.6 + alto * 0.6
            return (
              <g data-metros="si" transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`}>
                <rect x={-largo / 2} y={-alto / 2} width={largo} height={alto} rx={alto / 2} style={{ fill: 'var(--dib-subtitulo-fondo)' }} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={alto * 0.68}
                  style={{ fill: color, fontFamily: 'var(--fuente-titulo)', fontWeight: 800 }}>{texto}</text>
              </g>
            )
          })()}
        </g>
      )
    }
    case 'anillo': {
      const p = px(el.posicion)
      const rx = cuadro.ancho * 0.032 * escala, ry = rx * 0.36
      if (rx <= 0) return null
      return (
        <g>
          {el.rastro && <Rastro puntos={el.rastro.map(px)} color={color} ancho={ancho} />}
          <Anillo p={p} rx={rx} ry={ry} color={color} ancho={ancho} hueco={obj.hueco} sombra={obj.efectos?.sombra} />
        </g>
      )
    }
    case 'foco': {
      const p = px(el.posicion)
      const r = cuadro.ancho * 0.065 * escala
      const centro = { x: p.x, y: p.y - r * 0.55 }
      const rr = Math.max(0.1, r)
      return (
        <g>
          {/* Velo con un agujero redondo (regla evenodd): oscurece todo menos a la jugadora. */}
          <path fillRule="evenodd" style={{ fill: 'var(--dib-velo)' }} d={velo(cuadro, caminoElipse(centro.x, centro.y, rr, rr))} />
          {el.rastro && <Rastro puntos={el.rastro.map(px)} color={color} ancho={ancho} />}
          <circle cx={centro.x} cy={centro.y} r={Math.max(0, r)} style={{ fill: 'none', stroke: color, strokeWidth: Math.max(1.5, ancho * 0.6) }} />
        </g>
      )
    }
    case 'reflector': {
      // Cono de luz desde el borde de arriba del video hasta los pies, con una elipse iluminada abajo.
      const p = px(el.posicion)
      const luz = obj.luz || { color: 'blanco', intensidad: 0.6, ancho: 1 }
      const tinte = COLOR[luz.color] || COLOR.blanco
      const rx = cuadro.ancho * 0.045 * (luz.ancho || 1), ry = rx * 0.36
      const arriba = -cuadro.arriba - 2
      const encendido = el.encendido ?? 1
      if (encendido <= 0.001) return null
      const cono = `M${p.x - rx / 3},${arriba} L${p.x + rx / 3},${arriba} L${p.x + rx},${p.y} L${p.x - rx},${p.y} Z`
      const fuerza = luz.intensidad || 0.6
      return (
        <g data-reflector="si" opacity={encendido}>
          <defs>
            <linearGradient id={`${idMascara}-haz`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: tinte, stopOpacity: 0.04 }} />
              <stop offset="1" style={{ stopColor: tinte, stopOpacity: 0.42 * fuerza }} />
            </linearGradient>
            <radialGradient id={`${idMascara}-pie`}>
              <stop offset="0" style={{ stopColor: tinte, stopOpacity: 0.75 * fuerza }} />
              <stop offset="1" style={{ stopColor: tinte, stopOpacity: 0.12 }} />
            </radialGradient>
          </defs>
          {/* El resto se oscurece apenas: el velo tiene el agujero del cono y de la elipse. */}
          <path fillRule="evenodd" style={{ fill: 'var(--dib-tinta)', fillOpacity: 0.15 + 0.25 * fuerza }}
            d={velo(cuadro, `${cono} ${caminoElipse(p.x, p.y, rx, ry)}`)} />
          <path d={cono} style={{ fill: `url(#${idMascara}-haz)` }} />
          <ellipse cx={p.x} cy={p.y} rx={rx} ry={ry} style={{ fill: `url(#${idMascara}-pie)`, stroke: tinte, strokeOpacity: 0.7, strokeWidth: Math.max(1, ancho * 0.5) }} />
        </g>
      )
    }
    case 'foco_zona': {
      const f = el.forma
      if (!f) return null
      const c = px(f), rx = f.rx * cuadro.ancho
      const ry = obj.forma === 'circulo' ? rx : f.ry * cuadro.alto
      const encendido = el.encendido ?? 1
      if (encendido <= 0.001) return null
      const agujero = obj.forma === 'rectangulo'
        ? `M${c.x - rx},${c.y - ry} h${rx * 2} v${ry * 2} h${-rx * 2} Z`
        : caminoElipse(c.x, c.y, rx, ry)
      return (
        <g data-foco-zona={obj.forma} opacity={encendido}>
          <path fillRule="evenodd" style={{ fill: 'var(--dib-velo)' }} d={velo(cuadro, agujero)} />
          <path d={agujero} style={{ fill: 'none', stroke: color, strokeWidth: Math.max(1.5, ancho * 0.7), strokeDasharray: obj.forma === 'rectangulo' ? undefined : `${ancho * 3} ${ancho * 2}` }} />
        </g>
      )
    }
    case 'opciones_pase': {
      const a = px(el.pasadora), r = px(el.receptora)
      const rx = cuadro.ancho * 0.03, ry = rx * 0.36
      const alto = Math.max(16, cuadro.ancho * 0.022)
      const up = el.progresoPase ?? 1
      return (
        <g data-opciones-pase="si">
          {up > 0.001 && (() => {
            // El pase que se hizo: flecha roja que crece de la pasadora a la receptora.
            const fin = mezcla(a, r, up)
            const corte = acortar(a, fin, ancho * 3)
            return (
              <g data-pase-hecho="si">
                <line x1={a.x} y1={a.y} x2={corte.x} y2={corte.y} style={sombra} />
                <line x1={a.x} y1={a.y} x2={corte.x} y2={corte.y} style={{ ...trazo, stroke: 'var(--dib-rojo)' }} />
                <Flecha desde={a} hasta={fin} color="var(--dib-rojo)" ancho={ancho} />
              </g>
            )
          })()}
          {el.opciones.map((op) => {
            if (op.progreso <= 0.001) return null
            const q = px(op.posicion)
            const fin = mezcla(a, q, op.progreso)
            const medio = mezcla(a, q, 0.55)
            return (
              <g key={op.numero} data-opcion={op.numero} opacity={Math.min(1, op.progreso * 1.5)}>
                <Anillo p={q} rx={rx} ry={ry} color="var(--dib-verde)" ancho={ancho} hueco={obj.hueco} opacidad={op.progreso} />
                <line x1={a.x} y1={a.y} x2={fin.x} y2={fin.y} style={{ ...trazo, stroke: 'var(--dib-verde)', strokeDasharray: `${ancho * 2.5} ${ancho * 2}` }} />
                {op.progreso > 0.6 && (
                  <g transform={`translate(${medio.x} ${medio.y})`}>
                    <circle r={alto * 0.62} style={{ fill: 'var(--dib-verde)', stroke: 'var(--dib-tinta)', strokeWidth: 1.5 }} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={alto * 0.8}
                      style={{ fill: 'var(--dib-tinta)', fontFamily: 'var(--fuente-titulo)', fontWeight: 800 }}>{op.numero}</text>
                  </g>
                )}
              </g>
            )
          })}
        </g>
      )
    }
    case 'linea_defensiva': {
      const l = el.linea
      const pts = l.puntos.map((x) => ({ ...x, p: px(x.video) }))
      const alto = Math.max(20, cuadro.ancho * 0.03)
      return (
        <g data-linea-defensiva={l.calibrada ? 'calibrada' : 'manual'} opacity={el.aparicion ?? 1}>
          {l.triangulos.map((tr) => (
            <polygon key={tr.id} data-cobertura={tr.cubierto ? 'cubierto' : 'sin-cubrir'} points={tr.vertices.map(px).map((v) => `${v.x},${v.y}`).join(' ')}
              style={{ fill: tr.cubierto ? 'var(--dib-verde)' : 'var(--dib-rojo)', fillOpacity: 0.28, stroke: tr.cubierto ? 'var(--dib-verde)' : 'var(--dib-rojo)', strokeWidth: Math.max(1.5, ancho * 0.6), strokeLinejoin: 'round' }} />
          ))}
          <polyline points={pts.map((x) => `${x.p.x},${x.p.y}`).join(' ')} style={sombra} />
          <polyline points={pts.map((x) => `${x.p.x},${x.p.y}`).join(' ')} style={trazo} />
          {pts.map((x) => (
            <g key={x.id} data-estado={x.estado}>
              <circle cx={x.p.x} cy={x.p.y} r={ancho * 2.2} style={{ fill: COLOR_ESTADO[x.estado], stroke: 'var(--dib-tinta)', strokeWidth: 1.5 }} />
              {x.estado !== 'en_linea' && (
                <Cartel x={x.p.x} y={x.p.y - alto * 1.4} alto={alto} color={COLOR_ESTADO[x.estado]}
                  texto={x.estado === 'atras' ? NOMBRE_ESTADO.atras : Number.isFinite(x.d) ? `+${textoMetros(x.d)}` : NOMBRE_ESTADO.adelantada} />
              )}
            </g>
          ))}
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

// Puntos de agarre del objeto elegido (editor). Con `tiempo`, los de las zonas que se mueven (los que se arrastran).
function Agarres({ el, cuadro, tiempo }) {
  const o = el.obj
  let pts
  if (el.posicion) pts = [el.posicion]
  else if (o.objetivo) pts = [o.objetivo]
  else if (o.tipo === 'enlace') pts = [el.a, el.b]
  else if (o.tipo === 'linea_defensiva') pts = el.linea?.puntos.map((x) => x.video) || []
  else if (o.tipo === 'zona_lineas') pts = el.puntos || []
  else pts = Number.isFinite(tiempo) ? agarresDe(o, tiempo) : o.puntos || []
  return (
    <g aria-hidden="true" data-agarres="si">
      {pts.filter(Boolean).map((p, i) => {
        const q = aPixeles(p, cuadro)
        return <circle key={i} cx={q.x} cy={q.y} r={6} style={{ fill: 'var(--dib-tinta)', stroke: 'var(--dib-blanco)', strokeWidth: 2 }} />
      })}
    </g>
  )
}

export default function CapaDibujos({ escena, ancho, alto, cuadro, elegidoId = null, borrador = null, tiempo = null, className = 'dib-svg' }) {
  const idBase = useId().replace(/[^\w-]/g, '')
  if (!ancho || !alto || !cuadro?.ancho) return null
  const base = Math.max(2, cuadro.ancho / 360)
  const elementos = borrador ? [...escena.elementos, borrador] : escena.elementos
  return (
    <svg className={className} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      <g transform={`translate(${cuadro.izquierda} ${cuadro.arriba})`}>
        {elementos.map((el, i) => (
          <g key={el.obj.id || `borrador${i}`} opacity={el.fuera ? 0.45 : 1} className={el.fuera ? 'dib-fuera' : undefined} data-fuera={el.fuera ? 'si' : undefined} data-tipo={el.obj.tipo}>
            <Objeto el={el} cuadro={cuadro} base={base} idMascara={`${idBase}-m${i}`} />
            {el.obj.id && el.obj.id === elegidoId && <Agarres el={el} cuadro={cuadro} tiempo={tiempo} />}
          </g>
        ))}
      </g>
    </svg>
  )
}
