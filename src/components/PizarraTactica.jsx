import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import PizarraCancha from './PizarraCancha'
import PizarraPaleta, { IconoHerramienta } from './PizarraPaleta'
import { agregarElemento, colocarFlecha, duplicarElementos, duracionTotal, historial, historialInicial, interpolar, limitar, LINEAS, moverExtremo, nuevaPizarra, PALETA, plantillaHerramienta, quitarElementos, SUPERFICIES, validarPizarra } from '../utils/pizarra'
import { descargarArchivo, miniaturaPizarra } from '../utils/pizarraExportar'
import './pizarra.css'

// Barra rápida (celular y escritorio). El resto de los objetos está en la paleta completa.
const RAPIDAS = ['jugadora', 'rival', 'pelota', 'cono', 'pase', 'conduccion', 'movimiento']
const CORTOS = { jugadora: 'Propia', movimiento: 'Sin pelota' }
const UMBRAL_PX = 4, TOQUE_PX = 22
const RETRATO = '(orientation: portrait) and (max-width: 750px)'
const MOVIL = '(max-width: 750px)'

function consulta(q) { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null }
function suscribir(q) { return cb => { const m = consulta(q); m?.addEventListener?.('change', cb); return () => m?.removeEventListener?.('change', cb) } }
const suscribirRetrato = suscribir(RETRATO)
const esRetrato = () => !!consulta(RETRATO)?.matches

export default function PizarraTactica({ inicial, soloLectura = false, onGuardar, onCerrar, titulo = 'Pizarra táctica' }) {
  const [h, setH] = useState(() => historialInicial(inicial || nuevaPizarra()))
  const doc = h.actual
  const [paso, setPaso] = useState(0), [seleccion, setSeleccion] = useState([]), [herramienta, setHerramienta] = useState('seleccionar')
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [borrador, setBorrador] = useState(null), [caja, setCaja] = useState(null)
  const [reproduciendo, setReproduciendo] = useState(false), [tiempo, setTiempo] = useState(0), [velocidad, setVelocidad] = useState(doc.velocidad), [bucle, setBucle] = useState(doc.bucle)
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false), [guardado, setGuardado] = useState(() => JSON.stringify(doc))
  const [arrastrandoMaterial, setArrastrandoMaterial] = useState(null), [arrastrando, setArrastrando] = useState(null)
  const [hoja, setHoja] = useState(false), [verPasos, setVerPasos] = useState(() => soloLectura || !consulta(MOVIL)?.matches)
  const [aviso, setAviso] = useState(null), [fantasma, setFantasma] = useState(null), [medida, setMedida] = useState(null)
  // Vista vertical automática en celular vertical: sólo cambia cómo se ve, no la orientación guardada.
  const retrato = useSyncExternalStore(suscribirRetrato, esRetrato, () => false)
  const svg = useRef(null), svgExportar = useRef(null), raiz = useRef(null), arrastre = useRef(null), reloj = useRef(0), ultimo = useRef(0)
  const punteros = useRef(new Map()), gesto = useRef(null), cuadro = useRef(0), pendiente = useRef(null), barra = useRef(null), temporizador = useRef(0)
  const indice = Math.min(paso, doc.pasos.length - 1), sucio = JSON.stringify(doc) !== guardado
  const activo = borrador || doc, total = duracionTotal(doc)
  const poses = reproduciendo || tiempo > 0 ? interpolar(doc, tiempo).poses : activo.pasos[indice].poses
  const elegido = doc.elementos.find(e => e.id === seleccion[0])
  const bloqueado = soloLectura || guardando || reproduciendo || tiempo > 0
  // Sólo conviene girar superficies apaisadas (completa, cuarto, reducida); media cancha y área ya son "de pie".
  const forzarVertical = retrato && activo.orientacion !== 'vertical' && SUPERFICIES[activo.superficie][0] > SUPERFICIES[activo.superficie][1]
  const vista = useMemo(() => forzarVertical ? { ...activo, orientacion: 'vertical' } : activo, [activo, forzarVertical])
  const vertical = vista.orientacion === 'vertical'
  const [cw, ch] = SUPERFICIES[vista.superficie]
  const pxPorUnidad = medida ? Math.min(medida.w / ((vertical ? ch : cw) + 6), medida.h / ((vertical ? cw : ch) + 6)) : 0
  const toque = pxPorUnidad ? limitar(TOQUE_PX / (pxPorUnidad * zoom), 1.2, 9) : 3

  useEffect(() => {
    if (!sucio || soloLectura) return
    const salir = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', salir)
    return () => window.removeEventListener('beforeunload', salir)
  }, [sucio, soloLectura])
  useEffect(() => {
    const nodo = svg.current
    if (!nodo || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) => setMedida({ w: entrada.contentRect.width, h: entrada.contentRect.height }))
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])
  useEffect(() => () => { window.clearTimeout(temporizador.current); cancelAnimationFrame(cuadro.current) }, [])
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

  // `clave` agrupa cambios continuos (deslizadores, textos) en un solo paso de deshacer.
  function cambiar(siguiente, clave = null) { if (soloLectura) return; setH(actual => historial(actual, 'editar', siguiente, clave)); setTiempo(0); reloj.current = 0; setError('') }
  function historialAccion(accion) {
    const siguiente = historial(h, accion)
    setH(siguiente); setSeleccion(s => s.filter(id => siguiente.actual.elementos.some(e => e.id === id))); setTiempo(0); setReproduciendo(false); setAviso(null)
  }
  const cambiarSuperficie = useCallback(superficie => { if (!soloLectura) setH(a => historial(a, 'editar', { ...a.actual, superficie })) }, [soloLectura])
  const elegirDesdeHoja = useCallback(id => { setHerramienta(id); setHoja(false) }, [])
  const terminarMaterial = useCallback(() => setArrastrandoMaterial(null), [])
  const cerrarHoja = useCallback(() => setHoja(false), [])
  function mostrarAviso(texto) { window.clearTimeout(temporizador.current); setAviso(texto); temporizador.current = window.setTimeout(() => setAviso(null), 5000) }
  function elegirPaso(i) { setReproduciendo(false); setTiempo(0); reloj.current = 0; setPaso(limitar(i, 0, doc.pasos.length - 1)) }
  function alternarReproduccion() { if (!reproduciendo && reloj.current >= total) { reloj.current = 0; setTiempo(0) } setReproduciendo(!reproduciendo) }
  function punto(e) {
    const g = svg.current.querySelector('[data-campo]'), matrix = g.getScreenCTM()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    const [w, h] = SUPERFICIES[doc.superficie]
    return { x: p.x * 100 / w, y: p.y * 100 / h }
  }
  function colocar(id, p, destino = null) {
    const plantilla = plantillaHerramienta(id); if (!plantilla) return
    const siguiente = destino && LINEAS.includes(plantilla.tipo) ? colocarFlecha(doc, plantilla.tipo, p, destino, plantilla.extra) : agregarElemento(doc, plantilla.tipo, limitar(p.x, 0, 100), limitar(p.y, 0, 100), plantilla.extra)
    if (siguiente === doc) { setError('La pizarra admite hasta 200 elementos.'); return }
    cambiar(siguiente); setSeleccion([siguiente.elementos.at(-1).id])
  }
  // Dibuja en el próximo cuadro de pantalla: un render por frame aunque el dedo envíe más eventos.
  function programar(fn) {
    pendiente.current = fn
    if (!cuadro.current) cuadro.current = requestAnimationFrame(() => { cuadro.current = 0; if (arrastre.current) pendiente.current?.() })
  }
  function coordenadaVista(x, y) { return new DOMPoint(x, y).matrixTransform(svg.current.getScreenCTM().inverse()) }
  function registrarPuntero(e) {
    if (e.pointerType !== 'touch' || guardando) return
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()], centro = coordenadaVista((a.x + b.x) / 2, (a.y + b.y) / 2)
      gesto.current = { distancia: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), zoom, ancla: { x: (centro.x - pan.x) / zoom, y: (centro.y - pan.y) / zoom } }
      arrastre.current = null; setBorrador(null); setCaja(null); setArrastrando(null)
    }
    svg.current.setPointerCapture(e.pointerId)
  }
  function soltarMaterial(e) {
    if (bloqueado) return
    const id = e.dataTransfer.getData('application/x-comunicaciones-herramienta')
    if (!plantillaHerramienta(id)) return
    e.preventDefault(); setArrastrandoMaterial(null)
    const p = punto(e)
    if (p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100) colocar(id, p)
  }
  function capturar(e, datos) { arrastre.current = { ...datos, pointer: e.pointerId, client: { x: e.clientX, y: e.clientY }, doc, activo: false }; svg.current.setPointerCapture(e.pointerId) }
  function iniciar(e, id) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    if (herramienta !== 'seleccionar') { fondo(e); return }
    const ids = e.shiftKey ? (seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]) : seleccion.includes(id) ? seleccion : [id]
    setSeleccion(ids)
    capturar(e, { tipo: 'mover', inicio: punto(e), ids })
  }
  function iniciarExtremo(e, id, extremo) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    capturar(e, { tipo: 'extremo', id, extremo })
  }
  function fondo(e) {
    if (bloqueado || e.button !== 0 || gesto.current) return
    const p = punto(e), plantilla = plantillaHerramienta(herramienta)
    if (plantilla && LINEAS.includes(plantilla.tipo)) { capturar(e, { tipo: 'flecha', herramienta, inicio: p }); return }
    if (plantilla) { colocar(herramienta, p); return }
    if (zoom > 1) { capturar(e, { tipo: 'pan', pan }); return }
    setSeleccion([]); capturar(e, { tipo: 'caja', inicio: p })
  }
  function mover(e) {
    if (punteros.current.has(e.pointerId)) punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesto.current) {
      if (punteros.current.size === 2) {
        const [a, b] = [...punteros.current.values()], g = gesto.current
        const centro = coordenadaVista((a.x + b.x) / 2, (a.y + b.y) / 2)
        const escala = limitar(g.zoom * Math.hypot(b.x - a.x, b.y - a.y) / g.distancia, .5, 3)
        setZoom(escala); setPan({ x: centro.x - g.ancla.x * escala, y: centro.y - g.ancla.y * escala })
      }
      return
    }
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    if (!a.activo) {
      // Un toque con temblor no mueve nada ni ensucia el historial.
      if (Math.hypot(e.clientX - a.client.x, e.clientY - a.client.y) < UMBRAL_PX) return
      a.activo = true
      if (a.tipo === 'mover') setArrastrando(a.ids.length === 1 ? a.ids[0] : null)
    }
    const p = punto(e)
    if (a.tipo === 'mover') {
      if (!a.ids.length) return
      const origen = a.doc.pasos[indice].poses
      // Una sola traslación limitada mantiene las distancias de la selección.
      const dx = limitar(p.x - a.inicio.x, -Math.min(...a.ids.map(id => origen[id].x)), 100 - Math.max(...a.ids.map(id => origen[id].x)))
      const dy = limitar(p.y - a.inicio.y, -Math.min(...a.ids.map(id => origen[id].y)), 100 - Math.max(...a.ids.map(id => origen[id].y)))
      const actualizado = { ...origen, ...Object.fromEntries(a.ids.map(id => [id, { ...origen[id], x: origen[id].x + dx, y: origen[id].y + dy }])) }
      const next = { ...a.doc, pasos: a.doc.pasos.map((f, i) => i === indice ? { ...f, poses: actualizado } : f) }
      a.final = next; programar(() => setBorrador(next))
    } else if (a.tipo === 'extremo') {
      const next = moverExtremo(a.doc, indice, a.id, a.extremo, p)
      a.final = next; programar(() => setBorrador(next))
    } else if (a.tipo === 'flecha') {
      const plantilla = plantillaHerramienta(a.herramienta)
      const next = colocarFlecha(a.doc, plantilla.tipo, a.inicio, p, plantilla.extra)
      programar(() => setBorrador(next))
    } else if (a.tipo === 'caja') { a.fin = p; programar(() => setCaja({ ...a.inicio, x2: p.x, y2: p.y })) }
    else {
      const escala = pxPorUnidad || 1
      const siguiente = { x: a.pan.x + (e.clientX - a.client.x) / escala, y: a.pan.y + (e.clientY - a.client.y) / escala }
      programar(() => setPan(siguiente))
    }
  }
  function terminar(e, cancelar = false) {
    punteros.current.delete(e.pointerId)
    if (gesto.current) {
      if (!punteros.current.size) gesto.current = null
      if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
      return
    }
    const a = arrastre.current; if (!a || a.pointer !== e.pointerId) return
    cancelAnimationFrame(cuadro.current); cuadro.current = 0
    if (!cancelar) {
      if (a.tipo === 'flecha') {
        // Toque sin arrastre: flecha corta por defecto en ese punto.
        const fin = a.activo ? punto(e) : null
        colocar(a.herramienta, a.inicio, fin && Math.hypot(fin.x - a.inicio.x, fin.y - a.inicio.y) > 2 ? fin : null)
      } else if (a.activo && a.final) cambiar(a.final)
      if (a.tipo === 'caja' && a.activo && a.fin) setSeleccion(doc.elementos.filter(el => { const p = doc.pasos[indice].poses[el.id]; return p.x >= Math.min(a.inicio.x, a.fin.x) && p.x <= Math.max(a.inicio.x, a.fin.x) && p.y >= Math.min(a.inicio.y, a.fin.y) && p.y <= Math.max(a.inicio.y, a.fin.y) }).map(el => el.id))
    }
    arrastre.current = null; setBorrador(null); setCaja(null); setArrastrando(null)
    if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
  }
  // Arrastrar una ficha desde la barra rápida hasta la cancha (funciona con el dedo).
  function barraInicio(e, id) {
    if (bloqueado && id !== 'mas') return
    barra.current = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY, movido: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function barraMover(e) {
    const b = barra.current; if (!b || b.pointer !== e.pointerId || b.id === 'seleccionar' || b.id === 'mas') return
    if (!b.movido && Math.hypot(e.clientX - b.x, e.clientY - b.y) < 8) return
    b.movido = true; setFantasma({ id: b.id, x: e.clientX, y: e.clientY })
  }
  function barraFin(e, cancelar = false) {
    const b = barra.current; if (!b || b.pointer !== e.pointerId) return
    barra.current = null; setFantasma(null)
    if (cancelar) return
    // Se activa al levantar el dedo: Chrome a veces descarta el click del primer toque tras un trazo rápido.
    if (!b.movido) { activarHerramienta(b.id); return }
    const r = svg.current.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
    const p = punto(e)
    if (p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100) colocar(b.id, p)
  }
  function activarHerramienta(id) {
    if (id === 'mas') { setHoja(abierta => !abierta); return }
    setHerramienta(actual => actual === id && id !== 'seleccionar' ? 'seleccionar' : id)
  }
  // Teclado y lectores de pantalla (click sin puntero, detail 0); el puntero se resuelve en barraFin.
  function barraClick(e, id) { if (e.detail === 0) activarHerramienta(id) }
  function propiedad(clave, valor, agrupar = true) { cambiar({ ...doc, elementos: doc.elementos.map(e => seleccion.includes(e.id) ? { ...e, [clave]: valor } : e) }, agrupar ? `propiedad:${clave}:${seleccion.join()}` : null) }
  function rotar(valor, agrupar = false) { cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i !== indice ? p : { ...p, poses: Object.fromEntries(Object.entries(p.poses).map(([id, pose]) => [id, seleccion.includes(id) ? { ...pose, rotacion: valor } : pose])) }) }, agrupar ? `rotacion:${indice}:${seleccion.join()}` : null) }
  function borrar() {
    if (!seleccion.length) return
    const cantidad = seleccion.length
    cambiar(quitarElementos(doc, seleccion)); setSeleccion([])
    mostrarAviso(cantidad > 1 ? `${cantidad} elementos eliminados` : 'Elemento eliminado')
  }
  function duplicar() {
    const siguiente = duplicarElementos(doc, seleccion)
    if (siguiente === doc) return
    cambiar(siguiente); setSeleccion(siguiente.elementos.slice(-seleccion.length).map(e => e.id))
  }
  function pasoNuevo() {
    if (doc.pasos.length >= 60) return
    const pasos = [...doc.pasos]; pasos.splice(indice + 1, 0, { ...structuredClone(pasos[indice]), id: crypto.randomUUID(), nombre: `Paso ${pasos.length + 1}` })
    cambiar({ ...doc, pasos }); setPaso(indice + 1)
  }
  function ordenarPaso(delta) { const pasos = [...doc.pasos], hasta = indice + delta; if (hasta < 0 || hasta >= pasos.length) return; [pasos[indice], pasos[hasta]] = [pasos[hasta], pasos[indice]]; cambiar({ ...doc, pasos }); setPaso(hasta) }
  function cerrar() { if (!soloLectura && sucio && !window.confirm('¿Salir sin aplicar los cambios de la pizarra?')) return; onCerrar?.() }
  function pantallaCompleta() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else if (raiz.current.requestFullscreen) raiz.current.requestFullscreen().catch(() => setError('Pantalla completa no disponible.')); else setError('Pantalla completa no disponible en este navegador.') }
  function ajustarVista() { setZoom(1); setPan({ x: 0, y: 0 }) }
  async function guardar() {
    setGuardando(true); setError('')
    try {
      const limpia = validarPizarra(doc)
      const miniatura = await miniaturaPizarra(svgExportar.current || svg.current)
      await onGuardar?.(limpia, miniatura)
      setGuardado(JSON.stringify(limpia))
    } catch (e) { setError(e.message || 'No se pudo guardar la pizarra.'); } finally { setGuardando(false) }
  }
  async function png() { try { const data = await miniaturaPizarra(svgExportar.current || svg.current); const a = document.createElement('a'); a.href = data; a.download = 'pizarra-comunicaciones.png'; a.click() } catch (e) { setError(e.message) } }
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
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicar() }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); borrar() }
    if (e.key === 'Escape') { setSeleccion([]); setHerramienta('seleccionar'); setHoja(false) }
  }

  const zoomControl = <label className="pizarra-zoom">Zoom <input aria-label="Zoom de cancha" type="range" min=".5" max="3" step=".1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
  const plantillaActiva = plantillaHerramienta(herramienta)

  return <div ref={raiz} className={`pizarra ${soloLectura ? 'pizarra-visor' : 'pizarra-editor'}`} tabIndex={0} onKeyDown={teclado}>
    <header className="pizarra-barra">
      <h2 className="pizarra-titulo"><strong>{titulo}</strong><small>PIZARRA DE COMUNICACIONES</small></h2>
      {onCerrar && <button type="button" className="pizarra-icono" aria-label="Cerrar" title="Cerrar" disabled={guardando} onClick={cerrar}>✕</button>}
      {!soloLectura && <div className="pizarra-grupo" role="group" aria-label="Historial">
        <button type="button" className="pizarra-icono" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!h.antes.length || reproduciendo || guardando} onClick={() => historialAccion('deshacer')}>↶</button>
        <button type="button" className="pizarra-icono" aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)" disabled={!h.despues.length || reproduciendo || guardando} onClick={() => historialAccion('rehacer')}>↷</button>
      </div>}
      {!soloLectura && <div className="pizarra-grupo pizarra-segmentado" role="group" aria-label="Superficie">
        <button type="button" aria-label="Cancha completa" aria-pressed={doc.superficie === 'completa'} disabled={bloqueado} onClick={() => cambiarSuperficie('completa')}>Completa</button>
        <button type="button" aria-label="Media cancha" aria-pressed={doc.superficie === 'media'} disabled={bloqueado} onClick={() => cambiarSuperficie('media')}>Media</button>
      </div>}
      <span className="pizarra-espacio" />
      {soloLectura ? <button type="button" onClick={pantallaCompleta}>Ampliar cancha</button>
        : <details className="pizarra-menu"><summary aria-label="Más opciones" title="Más opciones">⋯</summary>
          <div className="pizarra-menu-panel">
            <strong>Vista</strong>
            {zoomControl}
            <div className="pizarra-fila"><button type="button" onClick={ajustarVista}>Ajustar vista</button><button type="button" onClick={pantallaCompleta}>Pantalla completa</button></div>
            <fieldset disabled={bloqueado} className="pizarra-fila">
              <label>Orientación guardada <select value={doc.orientacion} onChange={e => cambiar({ ...doc, orientacion: e.target.value })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
              <label>Ataque <select value={doc.ataque} onChange={e => cambiar({ ...doc, ataque: e.target.value })}><option value="derecha">Derecha</option><option value="izquierda">Izquierda</option></select></label>
            </fieldset>
            {retrato && <p className="pizarra-ayuda">En el celular vertical la cancha se muestra de pie; lo guardado y Wellness conservan la orientación elegida.</p>}
            <strong>Archivo</strong>
            <div className="pizarra-fila"><button type="button" onClick={png}>Descargar PNG</button><button type="button" onClick={() => descargarArchivo(JSON.stringify(doc), 'pizarra.json', 'application/json')}>Respaldo editable</button><label className="pizarra-archivo">Recuperar JSON <input type="file" accept="application/json,.json" onChange={importar} /></label></div>
            <button type="button" className="pizarra-peligro" disabled={bloqueado} onClick={() => { if (window.confirm('¿Borrar todos los elementos y pasos? Podés deshacer.')) { cambiar(nuevaPizarra()); setPaso(0); setSeleccion([]) } }}>Borrar todo</button>
          </div>
        </details>}
      {!soloLectura && onGuardar && <button type="button" className="pizarra-guardar" aria-label="Aplicar pizarra al ejercicio" disabled={guardando || reproduciendo || tiempo > 0} onClick={guardar}>{guardando ? 'Preparando…' : <><span className="pizarra-largo">Aplicar</span><span className="pizarra-corto" aria-hidden="true">✓</span></>}</button>}
    </header>
    {error && <p role="alert" className="pizarra-error">{error}</p>}
    {soloLectura && <div className="pizarra-fila">{zoomControl}<button type="button" onClick={ajustarVista}>Ajustar vista</button></div>}
    <div className={soloLectura ? '' : 'pizarra-layout'}>
      {!soloLectura && <PizarraPaleta herramienta={herramienta} elegir={elegirDesdeHoja} superficie={doc.superficie} cambiarSuperficie={cambiarSuperficie}
        deshabilitada={bloqueado} alArrastrar={setArrastrandoMaterial} alTerminar={terminarMaterial} abierta={hoja} onCerrar={cerrarHoja} />}
      {hoja && <div className="pizarra-velo" aria-hidden="true" onPointerDown={cerrarHoja} />}
      <div className={`pizarra-lienzo ${arrastrandoMaterial ? 'pizarra-soltar' : ''} ${plantillaActiva ? 'pizarra-colocando' : ''}`}>
        <PizarraCancha ref={svg} doc={vista} poses={poses} seleccion={soloLectura ? [] : seleccion} zoom={zoom} pan={pan} caja={caja} toque={toque} arrastrando={arrastrando} giro={forzarVertical ? -90 : 90}
          onElemento={soloLectura ? undefined : iniciar} onExtremo={soloLectura ? undefined : iniciarExtremo} onFondo={fondo} onPointerDownCapture={registrarPuntero}
          onDragOver={e => { if (!bloqueado && Array.from(e.dataTransfer.types || []).includes('application/x-comunicaciones-herramienta')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }} onDrop={soltarMaterial} onPointerMove={mover} onPointerUp={e => terminar(e)} onPointerCancel={e => terminar(e, true)} />
        {zoom !== 1 && <button type="button" className="pizarra-flotante pizarra-ajustar" onClick={ajustarVista}>Ajustar vista</button>}
        {aviso && <div className="pizarra-flotante pizarra-aviso" role="status"><span>{aviso}</span><button type="button" onClick={() => historialAccion('deshacer')}>Deshacer</button></div>}
      </div>
      {!soloLectura && <details className="pizarra-panel"><summary>Más propiedades del objeto</summary><fieldset className="pizarra-propiedades" disabled={bloqueado}>
        <strong>Propiedades · {seleccion.length} seleccionado(s)</strong>
        {elegido ? <>
          <label>Color<input type="color" value={elegido.color} onChange={e => propiedad('color', e.target.value)} /></label>
          <label>Texto y borde<input type="color" value={elegido.tinta} onChange={e => propiedad('tinta', e.target.value)} /></label>
          <label>Número<input maxLength={4} value={elegido.numero} onChange={e => propiedad('numero', e.target.value)} /></label>
          <label>Nombre / texto<input maxLength={200} value={elegido.texto} onChange={e => propiedad('texto', e.target.value)} /></label>
          <label>Tamaño<input type="range" min="1" max="12" step=".2" value={elegido.tamano} onChange={e => propiedad('tamano', Number(e.target.value))} /></label>
          <label>Grosor<input type="range" min=".1" max="2" step=".1" value={elegido.grosor} onChange={e => propiedad('grosor', Number(e.target.value))} /></label>
          <label>Rotación del paso<input type="range" min="-180" max="180" value={doc.pasos[indice].poses[elegido.id]?.rotacion || 0} onChange={e => rotar(Number(e.target.value), true)} /></label>
          {LINEAS.includes(elegido.tipo) && <>
            <label>Destino horizontal relativo<input type="range" min="-80" max="80" value={elegido.dx} onChange={e => propiedad('dx', Number(e.target.value))} /></label><label>Destino vertical relativo<input type="range" min="-80" max="80" value={elegido.dy} onChange={e => propiedad('dy', Number(e.target.value))} /></label>
            {elegido.tipo === 'curva' && <label>Curvatura<input type="range" min="-50" max="50" value={elegido.curva} onChange={e => propiedad('curva', Number(e.target.value))} /></label>}
          </>}
          <button type="button" onClick={duplicar}>Duplicar selección</button><button type="button" onClick={borrar}>Eliminar selección</button>
        </> : <p>Tocá una ficha para editarla. Arrastrá el fondo para seleccionar varias; Shift suma a la selección.</p>}
      </fieldset></details>}
    </div>
    {!soloLectura && <fieldset disabled={bloqueado} className="pizarra-contexto" aria-label="Acciones del objeto seleccionado">
      {elegido ? <>
        <span className="pizarra-contexto-nombre">{elegido.tipo === 'jugadora' && elegido.color.toLowerCase() === PALETA.rival.toLowerCase() ? 'Rival' : plantillaHerramienta(elegido.tipo).nombre}{seleccion.length > 1 ? ` · ${seleccion.length}` : ''}</span>
        <button type="button" title="Duplicar selección" onClick={duplicar}>⧉ Duplicar</button>
        <button type="button" title="Rotar 15 grados" onClick={() => rotar(((doc.pasos[indice].poses[elegido.id].rotacion + 195) % 360) - 180)}>↻ Girar</button>
        <span className="pizarra-colores" role="group" aria-label="Colores rápidos">{PALETA.rapidos.map(c => <button key={c} type="button" className="pizarra-muestra" aria-label={`Color ${c}`} aria-pressed={elegido.color.toLowerCase() === c.toLowerCase()} style={{ '--muestra': c }} onClick={() => propiedad('color', c, false)} />)}</span>
        <button type="button" aria-label="Reducir tamaño" onClick={() => propiedad('tamano', limitar(elegido.tamano - .5, 1, 12), false)}>−</button>
        <button type="button" aria-label="Aumentar tamaño" onClick={() => propiedad('tamano', limitar(elegido.tamano + .5, 1, 12), false)}>+</button>
        <button type="button" className="pizarra-peligro" aria-label="Eliminar selección" onClick={borrar}>⌫</button>
      </> : <span className="pizarra-contexto-ayuda">{plantillaActiva
        ? (LINEAS.includes(plantillaActiva.tipo) ? `${plantillaActiva.nombre}: arrastrá desde la salida hasta el destino.` : `${plantillaActiva.nombre}: tocá la cancha para colocar. Tocá Mover para terminar.`)
        : 'Tocá una ficha para editarla · dos dedos para ampliar.'}</span>}
    </fieldset>}
    {!soloLectura && <nav className="pizarra-herramientas" aria-label="Herramientas rápidas">
      {['seleccionar', ...RAPIDAS, 'mas'].map(id => {
        const nombre = id === 'seleccionar' ? 'Mover' : id === 'mas' ? 'Más objetos' : plantillaHerramienta(id).nombre
        return <button type="button" key={id} aria-label={nombre} title={nombre} disabled={bloqueado && id !== 'mas'} aria-pressed={id === 'mas' ? hoja : herramienta === id}
          onPointerDown={e => barraInicio(e, id)} onPointerMove={barraMover} onPointerUp={e => barraFin(e)} onPointerCancel={e => barraFin(e, true)} onClick={e => barraClick(e, id)}>
          {id === 'seleccionar' ? <span className="pizarra-herramienta-simbolo" aria-hidden="true">↖</span> : id === 'mas' ? <span className="pizarra-herramienta-simbolo" aria-hidden="true">＋</span> : <IconoHerramienta id={id} />}
          <span>{id === 'mas' ? 'Más' : CORTOS[id] || nombre}</span>
        </button>
      })}
    </nav>}
    {fantasma && <div className="pizarra-fantasma" aria-hidden="true" style={{ transform: `translate(${fantasma.x}px, ${fantasma.y}px)` }}><IconoHerramienta id={fantasma.id} /></div>}
    <section className="pizarra-secuencia" aria-label="Pasos y animación">
      <div className="pizarra-fila pizarra-secuencia-cabecera">
        {!soloLectura && <button type="button" aria-expanded={verPasos} onClick={() => setVerPasos(v => !v)}>Pasos ({doc.pasos.length}) {verPasos ? '▴' : '▾'}</button>}
        <button type="button" disabled={doc.pasos.length < 2} onClick={alternarReproduccion}>{reproduciendo ? 'Pausar' : '▶ Reproducir'}</button>
        <span className="pizarra-tiempo">{tiempo.toFixed(1)} / {total.toFixed(1)} s</span>
      </div>
      {verPasos && <>
        <div className="pizarra-pasos" aria-label="Pasos de la animación">{doc.pasos.map((p, i) => <button type="button" key={p.id} className="pizarra-paso" aria-label={`Paso ${i + 1}: ${p.nombre}`} aria-pressed={!reproduciendo && indice === i} onClick={() => elegirPaso(i)}>
          {doc.pasos.length <= 12 || Math.abs(indice - i) <= 2 ? <PizarraCancha miniatura doc={doc} poses={p.poses} /> : <span className="pizarra-paso-resumen">{doc.elementos.length} elementos</span>}<span>{i + 1}. {p.nombre}</span></button>)}
          {!soloLectura && <button type="button" className="pizarra-agregar-paso" disabled={doc.pasos.length >= 60 || bloqueado} onClick={pasoNuevo}>+ Agregar paso</button>}
        </div>
        <div className="pizarra-fila">
          <button type="button" onClick={() => elegirPaso(0)}>Reiniciar</button><button type="button" onClick={() => elegirPaso(indice - 1)}>Paso anterior</button><button type="button" onClick={() => elegirPaso(indice + 1)}>Paso siguiente</button>
          <label>Velocidad<select value={velocidad} onChange={e => { const v = Number(e.target.value); setVelocidad(v); if (!soloLectura) cambiar({ ...doc, velocidad: v }) }}>{[.25, .5, 1, 1.5, 2, 3].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
          <label><input type="checkbox" checked={bucle} onChange={e => { setBucle(e.target.checked); if (!soloLectura) cambiar({ ...doc, bucle: e.target.checked }) }} /> Bucle</label>
        </div>
        {!soloLectura && <fieldset disabled={bloqueado}>
          <div className="pizarra-fila"><label>Nombre del paso<input maxLength={80} value={doc.pasos[indice].nombre} onChange={e => cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, nombre: e.target.value } : p) }, `nombre:${doc.pasos[indice].id}`)} /></label>
            <label>Transición hacia este paso (s)<input type="number" min=".1" max="60" step=".1" value={doc.pasos[indice].duracion} onChange={e => { const v = Number(e.target.value); if (v >= .1 && v <= 60) cambiar({ ...doc, pasos: doc.pasos.map((p, i) => i === indice ? { ...p, duracion: v } : p) }, `duracion:${doc.pasos[indice].id}`) }} /></label>
            <button type="button" disabled={!indice} onClick={() => ordenarPaso(-1)}>Mover paso antes</button><button type="button" disabled={indice === doc.pasos.length - 1} onClick={() => ordenarPaso(1)}>Mover paso después</button>
            <button type="button" disabled={doc.pasos.length === 1} onClick={() => { if (window.confirm('¿Eliminar este paso?')) { cambiar({ ...doc, pasos: doc.pasos.filter((_, i) => i !== indice) }); setPaso(Math.max(0, indice - 1)) } }}>Eliminar paso</button>
          </div>
        </fieldset>}
      </>}
    </section>
    {!soloLectura && <p className="pizarra-ayuda">Las posiciones se editan en el paso seleccionado; número, color y forma de las flechas son del elemento en todos los pasos. Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z rehacer · Ctrl/Cmd+A seleccionar todo · Ctrl/Cmd+D duplicar · Supr eliminar · Esc soltar herramienta.</p>}
    {/* Copia para exportar con la orientación guardada aunque la vista esté de pie. */}
    {!soloLectura && <div hidden><PizarraCancha ref={svgExportar} miniatura doc={doc} poses={doc.pasos[indice].poses} /></div>}
  </div>
}
