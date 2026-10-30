import { useEffect, useRef, useState } from 'react'
import PizarraCancha from './PizarraCancha'
import { agregarElemento, duplicarElementos, duracionTotal, HERRAMIENTAS, historial, historialInicial, interpolar, limitar, nuevaPizarra, quitarElementos, SUPERFICIES, validarPizarra } from '../utils/pizarra'
import { descargarArchivo, miniaturaPizarra } from '../utils/pizarraExportar'
import './pizarra.css'

export default function PizarraTactica({ inicial, soloLectura = false, onGuardar, onCerrar, titulo = 'Pizarra táctica' }) {
  const [h, setH] = useState(() => historialInicial(inicial || nuevaPizarra()))
  const doc = h.actual
  const [paso, setPaso] = useState(0), [seleccion, setSeleccion] = useState([]), [herramienta, setHerramienta] = useState('seleccionar')
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [borrador, setBorrador] = useState(null), [caja, setCaja] = useState(null)
  const [reproduciendo, setReproduciendo] = useState(false), [tiempo, setTiempo] = useState(0), [velocidad, setVelocidad] = useState(doc.velocidad), [bucle, setBucle] = useState(doc.bucle)
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false), [guardado, setGuardado] = useState(() => JSON.stringify(doc))
  const svg = useRef(null), raiz = useRef(null), arrastre = useRef(null), reloj = useRef(0), ultimo = useRef(0)
  const indice = Math.min(paso, doc.pasos.length - 1), sucio = JSON.stringify(doc) !== guardado
  const activo = borrador || doc, total = duracionTotal(doc)
  const poses = reproduciendo || tiempo > 0 ? interpolar(doc, tiempo).poses : activo.pasos[indice].poses
  const elegido = doc.elementos.find(e => e.id === seleccion[0])

  useEffect(() => {
    if (!sucio || soloLectura) return
    const salir = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', salir)
    return () => window.removeEventListener('beforeunload', salir)
  }, [sucio, soloLectura])
  useEffect(() => {
    if (!reproduciendo) return
    ultimo.current = 0
    let raf
    function avanzar(ahora) {
      const delta = ultimo.current ? Math.min((ahora - ultimo.current) / 1000, .15) : 0
      ultimo.current = ahora
      reloj.current += delta * velocidad
      if (reloj.current >= total) {
        if (bucle && total > 0) reloj.current %= total
        else { reloj.current = total; setTiempo(total); setReproduciendo(false); return }
      }
      setTiempo(reloj.current)
      raf = requestAnimationFrame(avanzar)
    }
    raf = requestAnimationFrame(avanzar)
    return () => cancelAnimationFrame(raf)
  }, [reproduciendo, velocidad, bucle, total])

  function cambiar(siguiente) { if (soloLectura) return; setH(actual => historial(actual, 'editar', siguiente)); setTiempo(0); reloj.current = 0; setError('') }
  function historialAccion(accion) { setH(actual => historial(actual, accion)); setSeleccion([]); setTiempo(0); setReproduciendo(false) }
  function elegirPaso(i) { setReproduciendo(false); setTiempo(0); reloj.current = 0; setPaso(limitar(i, 0, doc.pasos.length - 1)) }
  function punto(e) {
    const g = svg.current.querySelector('[data-campo]'), matrix = g.getScreenCTM()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    const [w, h] = SUPERFICIES[doc.superficie]
    return { x: p.x * 100 / w, y: p.y * 100 / h }
  }
  function iniciar(e, id) {
    if (soloLectura || guardando || reproduciendo || tiempo > 0 || e.button !== 0) return
    if (herramienta !== 'seleccionar') { fondo(e); return }
    const ids = e.shiftKey ? (seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]) : seleccion.includes(id) ? seleccion : [id]
    setSeleccion(ids)
    arrastre.current = { tipo: 'mover', inicio: punto(e), doc, ids, pointer: e.pointerId }
    svg.current.setPointerCapture(e.pointerId)
  }
  function fondo(e) {
    if (soloLectura || guardando || reproduciendo || tiempo > 0 || e.button !== 0) return
    const p = punto(e)
    if (Object.hasOwn(HERRAMIENTAS, herramienta)) { cambiar(agregarElemento(doc, herramienta, limitar(p.x, 0, 100), limitar(p.y, 0, 100))); return }
    const tipo = herramienta === 'mover' ? 'pan' : 'caja'
    arrastre.current = { tipo, inicio: p, client: { x: e.clientX, y: e.clientY }, doc, pan, pointer: e.pointerId }
    if (tipo === 'caja') { setSeleccion([]); setCaja({ ...p, x2: p.x, y2: p.y }) }
    svg.current.setPointerCapture(e.pointerId)
  }
  function mover(e) {
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    const p = punto(e)
    if (a.tipo === 'mover') {
      const origen = a.doc.pasos[indice].poses
      // Una sola traslación limitada mantiene las distancias de la selección.
      const dx = limitar(p.x - a.inicio.x, -Math.min(...a.ids.map(id => origen[id].x)), 100 - Math.max(...a.ids.map(id => origen[id].x)))
      const dy = limitar(p.y - a.inicio.y, -Math.min(...a.ids.map(id => origen[id].y)), 100 - Math.max(...a.ids.map(id => origen[id].y)))
      if (!a.ids.length) return
      const actualizado = { ...origen, ...Object.fromEntries(a.ids.map(id => [id, { ...origen[id], x: origen[id].x + dx, y: origen[id].y + dy }])) }
      const next = { ...a.doc, pasos: a.doc.pasos.map((f, i) => i === indice ? { ...f, poses: actualizado } : f) }
      a.final = next; setBorrador(next)
    } else if (a.tipo === 'caja') { a.fin = p; setCaja({ ...a.inicio, x2: p.x, y2: p.y }) }
    else {
      const rect = svg.current.getBoundingClientRect(), [w, h] = SUPERFICIES[doc.superficie], vertical = doc.orientacion === 'vertical'
      const escala = Math.min(rect.width / ((vertical ? h : w) + 6), rect.height / ((vertical ? w : h) + 6))
      setPan({ x: a.pan.x + (e.clientX - a.client.x) / escala, y: a.pan.y + (e.clientY - a.client.y) / escala })
    }
  }
  function terminar(e, cancelar = false) {
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    if (!cancelar && a.final) cambiar(a.final)
    if (!cancelar && a.tipo === 'caja' && a.fin) setSeleccion(doc.elementos.filter(el => { const p = doc.pasos[indice].poses[el.id]; return p.x >= Math.min(a.inicio.x, a.fin.x) && p.x <= Math.max(a.inicio.x, a.fin.x) && p.y >= Math.min(a.inicio.y, a.fin.y) && p.y <= Math.max(a.inicio.y, a.fin.y) }).map(el => el.id))
    arrastre.current = null; setBorrador(null); setCaja(null)
    if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
  }
  function propiedad(clave, valor) { cambiar({ ...doc, elementos: doc.elementos.map(e => seleccion.includes(e.id) ? { ...e, [clave]: valor } : e) }) }
  function rotar(valor) { cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i !== indice ? p : { ...p, poses: Object.fromEntries(Object.entries(p.poses).map(([id, pose]) => [id, seleccion.includes(id) ? { ...pose, rotacion: valor } : pose])) }) }) }
  function borrar() { if (seleccion.length && window.confirm('¿Eliminar los elementos seleccionados de todos los pasos?')) { cambiar(quitarElementos(doc, seleccion)); setSeleccion([]) } }
  function pasoNuevo() {
    if (doc.pasos.length >= 60) return
    const pasos = [...doc.pasos]; pasos.splice(indice + 1, 0, { ...structuredClone(pasos[indice]), id: crypto.randomUUID(), nombre: `Paso ${pasos.length + 1}` })
    cambiar({ ...doc, pasos }); setPaso(indice + 1)
  }
  function ordenarPaso(delta) { const pasos = [...doc.pasos], hasta = indice + delta; if (hasta < 0 || hasta >= pasos.length) return; [pasos[indice], pasos[hasta]] = [pasos[hasta], pasos[indice]]; cambiar({ ...doc, pasos }); setPaso(hasta) }
  function cerrar() { if (!soloLectura && sucio && !window.confirm('¿Salir sin aplicar los cambios de la pizarra?')) return; onCerrar?.() }
  async function guardar() {
    setGuardando(true); setError('')
    try {
      const limpia = validarPizarra(doc)
      const miniatura = await miniaturaPizarra(svg.current)
      await onGuardar?.(limpia, miniatura)
      setGuardado(JSON.stringify(limpia))
    } catch (e) { setError(e.message || 'No se pudo guardar la pizarra.'); } finally { setGuardando(false) }
  }
  async function png() { try { const data = await miniaturaPizarra(svg.current); const a = document.createElement('a'); a.href = data; a.download = 'pizarra-comunicaciones.png'; a.click() } catch (e) { setError(e.message) } }
  async function importar(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    try { if (file.size > 900000) throw Error('Archivo demasiado grande.'); const nuevo = validarPizarra(JSON.parse(await file.text())); if (!window.confirm('¿Reemplazar el diseño actual por el archivo? Podés deshacer.')) return; cambiar(nuevo); setPaso(0); setSeleccion([]) } catch (e) { setError(e.message || 'Archivo inválido.') }
  }
  function teclado(e) {
    if (soloLectura || guardando || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || reproduciendo) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); historialAccion(e.shiftKey ? 'rehacer' : 'deshacer') }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); historialAccion('rehacer') }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSeleccion(doc.elementos.map(el => el.id)) }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); cambiar(duplicarElementos(doc, seleccion)) }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); borrar() }
    if (e.key === 'Escape') { setSeleccion([]); setHerramienta('seleccionar') }
  }

  return <div ref={raiz} className={`pizarra ${soloLectura ? 'pizarra-visor' : ''}`} tabIndex={0} onKeyDown={teclado}>
    <div className="pizarra-fila"><h2><strong>{titulo}</strong></h2>{onCerrar && <button type="button" disabled={guardando} onClick={cerrar}>Cerrar</button>}
      <button type="button" onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else raiz.current.requestFullscreen?.().catch(() => setError('Pantalla completa no disponible.')) }}>Ampliar cancha</button>
      {!soloLectura && <><button type="button" disabled={!h.antes.length || reproduciendo} onClick={() => historialAccion('deshacer')}>↶ Deshacer</button><button type="button" disabled={!h.despues.length || reproduciendo} onClick={() => historialAccion('rehacer')}>↷ Rehacer</button>
        <button type="button" onClick={png}>Descargar PNG</button><button type="button" onClick={() => descargarArchivo(JSON.stringify(doc), 'pizarra.json', 'application/json')}>Respaldo editable</button><label>Recuperar JSON <input type="file" accept="application/json,.json" onChange={importar} /></label></>}
    </div>
    {error && <p role="alert" className="pizarra-error">{error}</p>}
    {!soloLectura && <fieldset disabled={reproduciendo || guardando || tiempo > 0}>
      <div className="pizarra-fila"><label>Superficie <select value={doc.superficie} onChange={e => cambiar({ ...doc, superficie: e.target.value })}>{Object.entries(SUPERFICIES).map(([v, s]) => <option key={v} value={v}>{s[2]}</option>)}</select></label>
        <label>Orientación <select value={doc.orientacion} onChange={e => cambiar({ ...doc, orientacion: e.target.value })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
        <label>Ataque <select value={doc.ataque} onChange={e => cambiar({ ...doc, ataque: e.target.value })}><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option></select></label>
      </div>
      <div className="pizarra-herramientas" aria-label="Herramientas de pizarra">{Object.entries({ seleccionar: '↖ Seleccionar', mover: '✥ Desplazar vista', ...HERRAMIENTAS }).map(([v, label]) => <button key={v} type="button" aria-pressed={herramienta === v} onClick={() => setHerramienta(v)}>{label}</button>)}</div>
    </fieldset>}
    <div className="pizarra-fila"><label>Zoom <input aria-label="Zoom de cancha" type="range" min=".5" max="3" step=".1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Ajustar vista</button>
      <button type="button" aria-label="Desplazar vista a la izquierda" onClick={() => setPan(p => ({ ...p, x: p.x - 5 }))}>←</button><button type="button" aria-label="Desplazar vista a la derecha" onClick={() => setPan(p => ({ ...p, x: p.x + 5 }))}>→</button><button type="button" aria-label="Desplazar vista arriba" onClick={() => setPan(p => ({ ...p, y: p.y - 5 }))}>↑</button><button type="button" aria-label="Desplazar vista abajo" onClick={() => setPan(p => ({ ...p, y: p.y + 5 }))}>↓</button>
    </div>
    <div className={soloLectura ? '' : 'pizarra-layout'}>
      <div className="pizarra-lienzo"><PizarraCancha ref={svg} doc={activo} poses={poses} seleccion={soloLectura ? [] : seleccion} zoom={zoom} pan={pan} caja={caja}
        onElemento={soloLectura ? undefined : iniciar} onFondo={fondo} onPointerMove={mover} onPointerUp={e => terminar(e)} onPointerCancel={e => terminar(e, true)} /></div>
      {!soloLectura && <fieldset className="pizarra-propiedades" disabled={reproduciendo || guardando || tiempo > 0}>
        <strong>Propiedades · {seleccion.length} seleccionado(s)</strong>
        {elegido ? <>
          <label>Color<input type="color" value={elegido.color} onChange={e => propiedad('color', e.target.value)} /></label>
          <div className="pizarra-fila">{['#F2C230', '#111111', '#FFFFFF', '#EF4444', '#2563EB', '#FF7B24'].map(c => <button key={c} type="button" aria-label={`Color ${c}`} style={{ background: c, width: 24, height: 24 }} onClick={() => propiedad('color', c)} />)}</div>
          <label>Texto y borde<input type="color" value={elegido.tinta} onChange={e => propiedad('tinta', e.target.value)} /></label>
          <label>Número<input maxLength={4} value={elegido.numero} onChange={e => propiedad('numero', e.target.value)} /></label>
          <label>Nombre / texto<input maxLength={200} value={elegido.texto} onChange={e => propiedad('texto', e.target.value)} /></label>
          <label>Tamaño<input type="range" min="1" max="12" step=".2" value={elegido.tamano} onChange={e => propiedad('tamano', Number(e.target.value))} /></label>
          <label>Grosor<input type="range" min=".1" max="2" step=".1" value={elegido.grosor} onChange={e => propiedad('grosor', Number(e.target.value))} /></label>
          <label>Rotación del paso<input type="range" min="-180" max="180" value={doc.pasos[indice].poses[elegido.id]?.rotacion || 0} onChange={e => rotar(Number(e.target.value))} /></label>
          {['flecha', 'curva', 'punteada', 'conduccion', 'pase', 'movimiento', 'remate'].includes(elegido.tipo) && <>
            <label>Destino horizontal relativo<input type="range" min="-80" max="80" value={elegido.dx} onChange={e => propiedad('dx', Number(e.target.value))} /></label><label>Destino vertical relativo<input type="range" min="-80" max="80" value={elegido.dy} onChange={e => propiedad('dy', Number(e.target.value))} /></label>
            <label>Curvatura<input type="range" min="-50" max="50" value={elegido.curva} onChange={e => propiedad('curva', Number(e.target.value))} /></label>
          </>}
          <button type="button" onClick={() => cambiar(duplicarElementos(doc, seleccion))}>Duplicar selección</button><button type="button" onClick={borrar}>Eliminar selección</button>
        </> : <p>Elegí una herramienta y tocá la cancha. Arrastrá para mover; Shift suma a la selección. Arrastrá el fondo para seleccionar varias.</p>}
        <button type="button" onClick={() => { if (window.confirm('¿Borrar todos los elementos y pasos? Podés deshacer.')) { cambiar(nuevaPizarra()); setPaso(0); setSeleccion([]) } }}>Borrar todo</button>
      </fieldset>}
    </div>
    <div className="pizarra-pasos">{doc.pasos.map((p, i) => <button type="button" key={p.id} aria-pressed={!reproduciendo && indice === i} onClick={() => elegirPaso(i)}>{i + 1}. {p.nombre}</button>)}</div>
    <div className="pizarra-fila">
      <button type="button" disabled={doc.pasos.length < 2} onClick={() => { if (!reproduciendo && reloj.current >= total) { reloj.current = 0; setTiempo(0) } setReproduciendo(!reproduciendo) }}>{reproduciendo ? 'Pausar' : '▶ Reproducir'}</button>
      <button type="button" onClick={() => elegirPaso(0)}>Reiniciar</button><button type="button" onClick={() => elegirPaso(indice - 1)}>Paso anterior</button><button type="button" onClick={() => elegirPaso(indice + 1)}>Paso siguiente</button>
      <label>Velocidad<select value={velocidad} onChange={e => { const v = Number(e.target.value); setVelocidad(v); if (!soloLectura) cambiar({ ...doc, velocidad: v }) }}>{[.25, .5, 1, 1.5, 2, 3].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
      <label><input type="checkbox" checked={bucle} onChange={e => { setBucle(e.target.checked); if (!soloLectura) cambiar({ ...doc, bucle: e.target.checked }) }} /> Bucle</label><span>{tiempo.toFixed(1)} / {total.toFixed(1)} s</span>
    </div>
    {!soloLectura && <fieldset disabled={reproduciendo || guardando || tiempo > 0}>
      <div className="pizarra-fila"><label>Nombre del paso<input maxLength={80} value={doc.pasos[indice].nombre} onChange={e => cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, nombre: e.target.value } : p) })} /></label>
        <label>Transición hacia este paso (s)<input type="number" min=".1" max="60" step=".1" value={doc.pasos[indice].duracion} onChange={e => { const v = Number(e.target.value); if (v >= .1 && v <= 60) cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, duracion: v } : p) }) }} /></label>
        <button type="button" disabled={doc.pasos.length >= 60} onClick={pasoNuevo}>+ Duplicar paso y continuar</button>
        <button type="button" disabled={!indice} onClick={() => ordenarPaso(-1)}>Mover paso antes</button><button type="button" disabled={indice === doc.pasos.length - 1} onClick={() => ordenarPaso(1)}>Mover paso después</button>
        <button type="button" disabled={doc.pasos.length === 1} onClick={() => { if (window.confirm('¿Eliminar este paso?')) { cambiar({ ...doc, pasos: doc.pasos.filter((_, i) => i !== indice) }); setPaso(Math.max(0, indice - 1)) } }}>Eliminar paso</button>
      </div>
    </fieldset>}
    {!soloLectura && <p className="pizarra-ayuda">Las posiciones se editan en el paso seleccionado. Número, color y tamaño pertenecen al mismo elemento en todos los pasos. Para editar tras reproducir, seleccioná un paso. Ctrl/Cmd+Z: deshacer; Shift+Z: rehacer; A: seleccionar todo; D: duplicar.</p>}
    {!soloLectura && onGuardar && <button type="button" className="pizarra-guardar" disabled={guardando || reproduciendo || tiempo > 0} onClick={guardar}>{guardando ? 'Preparando…' : 'Aplicar pizarra al ejercicio'}</button>}
  </div>
}
