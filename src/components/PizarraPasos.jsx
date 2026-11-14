import { memo, useRef, useState } from 'react'
import { esRival, PAUSA_MAXIMA } from '../utils/pizarra'

// Pasos (ronda de uso): chips con número grande y subtítulo; eliminar en cada chip, duplicar y reordenar arrastrando
// (con el mouse desde cualquier parte del chip; con el dedo desde la manija ⠿, así la fila se sigue deslizando).
// Al lado (o debajo en el celular), el panel del paso elegido siempre visible.
const UMBRAL_MOUSE = 6
const segundos = v => String(v).replace('.', ',')

export default memo(function PizarraPasos({ doc, indice, indiceVisible, animando, soloLectura, bloqueado, jugadoras = [],
  onPaso, onAgregar, onDuplicar, onEliminar, onMover, onNombre, onDuracion, onPausa, onTexto, onPase, onFoco }) {
  const chips = useRef([]), arrastre = useRef(null), recienArrastrado = useRef(false)
  const [moviendo, setMoviendo] = useState(null) // { desde, hasta }
  const paso = doc.pasos[indice], ultimo = doc.pasos.length - 1, editable = !soloLectura && !bloqueado

  function destino(x, y) {
    let mejor = 0, distancia = Infinity
    chips.current.forEach((nodo, i) => {
      if (!nodo) return
      const r = nodo.getBoundingClientRect(), d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      if (d < distancia) { distancia = d; mejor = i }
    })
    return mejor
  }
  function empezar(e, i, desdeManija) {
    if (!editable || e.button !== 0 || (e.pointerType === 'touch' && !desdeManija)) return
    arrastre.current = { desde: i, x: e.clientX, y: e.clientY, puntero: e.pointerId, activo: desdeManija, nodo: e.currentTarget }
    if (desdeManija) { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); setMoviendo({ desde: i, hasta: i }) }
  }
  function mover(e) {
    const a = arrastre.current
    if (!a || a.puntero !== e.pointerId) return
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < UMBRAL_MOUSE) return
      a.activo = true; a.nodo.setPointerCapture?.(e.pointerId)
    }
    setMoviendo({ desde: a.desde, hasta: destino(e.clientX, e.clientY) })
  }
  function terminar(e, cancelar = false) {
    const a = arrastre.current
    if (!a || a.puntero !== e.pointerId) return
    arrastre.current = null
    if (a.activo) {
      // El click que sigue a soltar no tiene que elegir el paso; se limpia enseguida por si se soltó afuera.
      recienArrastrado.current = true; setTimeout(() => { recienArrastrado.current = false }, 0)
      const hasta = destino(e.clientX, e.clientY)
      setMoviendo(null)
      if (!cancelar && hasta !== a.desde) onMover(a.desde, hasta)
    }
  }
  function teclas(e, i) {
    if (!editable || !e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    const hasta = i + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1)
    if (hasta >= 0 && hasta <= ultimo) onMover(i, hasta)
  }

  return <section className="pizarra-pasos" aria-label="Pasos">
    <div className="pizarra-chips" role="list">
      {doc.pasos.map((p, i) => {
        const elegido = !animando && indice === i
        return <div key={p.id} role="listitem" ref={n => { chips.current[i] = n }}
          className={`pizarra-chip-caja${moviendo?.desde === i ? ' pizarra-chip-moviendo' : ''}${moviendo && moviendo.hasta === i && moviendo.desde !== i ? ' pizarra-chip-destino' : ''}`}
          onPointerDown={e => empezar(e, i, false)} onPointerMove={mover} onPointerUp={e => terminar(e)} onPointerCancel={e => terminar(e, true)}>
          <button type="button" className="pizarra-chip" aria-label={`Paso ${i + 1}: ${p.nombre}`} title={editable ? `${p.nombre} · arrastrá para reordenar (Alt+flechas)` : p.nombre}
            aria-pressed={elegido} aria-current={animando && indiceVisible === i ? 'step' : undefined}
            onClick={() => { if (recienArrastrado.current) { recienArrastrado.current = false; return } onPaso(i) }} onKeyDown={e => teclas(e, i)}>
            <b>{i + 1}</b>
            <span className="pizarra-chip-texto">{p.texto || p.nombre}</span>
            {(p.pase === 'alto' || p.pausa > 0) && <span className="pizarra-chip-marcas">
              {p.pase === 'alto' && i > 0 && <i>Alto</i>}{p.pausa > 0 && <i>Pausa {segundos(p.pausa)} s</i>}
            </span>}
          </button>
          {editable && elegido && <span className="pizarra-chip-manija" aria-hidden="true" title="Arrastrar para reordenar" onPointerDown={e => { e.stopPropagation(); empezar(e, i, true) }}>⠿</span>}
          {editable && <button type="button" className="pizarra-chip-quitar" aria-label={`Eliminar paso ${i + 1}`} title="Eliminar paso" disabled={doc.pasos.length === 1} onPointerDown={e => e.stopPropagation()} onClick={() => onEliminar(i)}>✕</button>}
        </div>
      })}
      {!soloLectura && <button type="button" className="pizarra-chip pizarra-agregar-paso" aria-label="Agregar paso" title="Agregar paso: sigue desde el paso actual" disabled={doc.pasos.length >= 60 || bloqueado} onClick={onAgregar}>+ Paso</button>}
    </div>
    {!soloLectura && <fieldset className="pizarra-paso-panel" disabled={bloqueado} aria-label={`Paso ${indice + 1}`}>
      <div className="pizarra-paso-cabecera">
        <strong>Paso {indice + 1}</strong>
        <button type="button" aria-label="Duplicar paso" title="Duplicar este paso" disabled={doc.pasos.length >= 60} onClick={() => onDuplicar(indice)}>⧉ Duplicar</button>
      </div>
      <label className="pizarra-paso-subtitulo">Subtítulo del paso<textarea maxLength={200} rows={2} placeholder="Ej.: salida por bajo, la 6 baja entre centrales" value={paso.texto} onChange={e => onTexto(e.target.value)} /></label>
      <div className="pizarra-paso-fila">
        <label>Pausa al llegar (s)<input type="number" min="0" max={PAUSA_MAXIMA} step=".5" value={paso.pausa} onChange={e => onPausa(Number(e.target.value))} /></label>
        <label>Transición (s)<input type="number" min=".1" max="60" step=".1" value={paso.duracion} disabled={indice === 0} title={indice === 0 ? 'El primer paso no tiene transición' : 'Segundos para llegar a este paso'} onChange={e => onDuracion(Number(e.target.value))} /></label>
      </div>
      <div className="pizarra-paso-fila">
        {indice > 0 && <div className="pizarra-paso-pase" role="group" aria-label="Pase hacia este paso">
          <span>Pase</span>
          <span className="pizarra-grupo">{[['bajo', 'Bajo'], ['alto', 'Alto']].map(([valor, nombre]) => <button type="button" key={valor} aria-pressed={paso.pase === valor} onClick={() => onPase(valor)}>{nombre}</button>)}</span>
        </div>}
        <label>Foco en<select value={paso.foco || ''} onChange={e => onFoco(e.target.value)}>
          <option value="">Nadie</option>
          {jugadoras.map(j => <option key={j.id} value={j.id}>{esRival(j) ? 'Rival' : 'Propia'}{j.numero ? ` N.º ${j.numero}` : ''}{j.texto ? ` · ${j.texto}` : ''}</option>)}
        </select></label>
      </div>
      <label>Nombre del paso<input maxLength={80} value={paso.nombre} onChange={e => onNombre(e.target.value)} /></label>
    </fieldset>}
  </section>
})
