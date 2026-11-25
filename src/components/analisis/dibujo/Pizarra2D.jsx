import { useMemo, useRef, useState } from 'react'
import PizarraCancha from '../../PizarraCancha'
import { SUPERFICIES } from '../../../utils/pizarra'
import { desdePizarra, elementosFijos, vista2dEn } from '../../../utils/analisis/dibujos/pizarra2d'
import { medidasCancha } from '../../../utils/analisis/dibujos/calibracion'
import '../../pizarra.css'
import './dibujo.css'

const [LARGO, ANCHO] = SUPERFICIES.completa
const limitar = (v) => Math.max(0, Math.min(100, v))

// Pizarra 2D de un clip en el instante `tiempo` (etapa 5): la cancha de la Pizarra con una ficha por jugadora seguida,
// los pases, zonas y textos, y el subtítulo. Solo lectura, salvo con `editable`: arrastrar una ficha llama a
// onMover(objId, metros) al soltar (corrige solo la 2D). onElegir(objId): al tocar una ficha o un dibujo.
// rival: equipo rival (de Equipos) para la camiseta. fichas: 'dorsal' | 'foto'.
export default function Pizarra2D({ dibujo, tiempo, rival = null, fichas = 'dorsal', editable = false, onMover = null, onElegir = null, elegidoId = null }) {
  const fijos = useMemo(() => elementosFijos(dibujo), [dibujo])
  const vista = useMemo(() => vista2dEn(dibujo, tiempo, { rival, fichas, fijos }), [dibujo, tiempo, rival, fichas, fijos])
  const [arrastre, setArrastre] = useState(null) // { id, pose, movido }
  const svgRef = useRef(null)
  const esFicha = useMemo(() => new Set(vista.fichas.map((f) => f.id)), [vista.fichas])
  const poses = arrastre ? { ...vista.poses, [arrastre.id]: arrastre.pose } : vista.poses

  // Punto del mouse o del dedo en % de la cancha de la Pizarra.
  function puntoDe(e) {
    const svg = svgRef.current
    const m = svg?.getScreenCTM?.()
    if (!m || !svg.createSVGPoint) return null
    const p = svg.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(m.inverse())
    return { x: limitar(q.x * 100 / LARGO), y: limitar(q.y * 100 / ANCHO) }
  }

  function tocar(e, id) {
    onElegir?.(id)
    if (!editable || !esFicha.has(id)) return
    try { svgRef.current?.setPointerCapture?.(e.pointerId) } catch { /* nada */ }
    setArrastre({ id, pose: vista.poses[id], movido: false })
  }
  function mover(e) {
    if (!arrastre) return
    const p = puntoDe(e)
    if (p) setArrastre((a) => (a ? { ...a, pose: { ...a.pose, x: p.x, y: p.y }, movido: true } : a))
  }
  function soltar() {
    const a = arrastre
    setArrastre(null)
    if (a?.movido) onMover?.(a.id, desdePizarra(a.pose, medidasCancha(dibujo.cancha)))
  }

  const vacia = vista.doc.elementos.length === 0
  return (
    <div className="dib-2d" data-editable={editable ? 'si' : undefined}>
      <PizarraCancha ref={svgRef} doc={vista.doc} poses={poses} opacidades={vista.opacidades} fotos={vista.fotos} foco={vista.foco}
        seleccion={elegidoId && poses[elegidoId] ? [elegidoId] : []} onElemento={editable || onElegir ? tocar : undefined}
        onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => setArrastre(null)} toque={3} />
      {vista.subtitulo && <p className="dib-subtitulo dib-2d-subtitulo">{vista.subtitulo}</p>}
      {vacia && <p className="dib-2d-vacia">Todavía no hay jugadoras para mostrar: calibrá la cancha y seguí a alguna jugadora (o agregá una ficha).</p>}
    </div>
  )
}
