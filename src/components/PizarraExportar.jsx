import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FORMATOS_VIDEO, lineaVideo, nombreArchivo, placaDe } from '../utils/pizarraVideo'

// Etapa K: exportar la jugada desde el editor (Wellness no exporta). Video MP4 sin sonido (16:9 o 9:16) con placas de
// inicio y cierre, o PNG del paso en alta resolución. El dibujo y mediabunny se cargan recién al generar.
export default function PizarraExportar({ doc, titulo, indice, fotos, preferencias, raiz, onPlaca, onCerrar }) {
  const [formato, setFormato] = useState('horizontal'), [placas, setPlacas] = useState(true), [zona, setZona] = useState(true)
  const [estado, setEstado] = useState({ tipo: 'listo' }) // listo | generando | hecho | error
  const cancelar = useRef(false), url = useRef(null), caja = useRef(null), listo = useRef(null)
  useEffect(() => { if (estado.tipo === 'hecho') listo.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [estado.tipo, estado.url])
  const placa = placaDe(doc, titulo)
  const linea = lineaVideo(doc, { placas })
  const generando = estado.tipo === 'generando'

  useEffect(() => { caja.current?.focus(); return () => { cancelar.current = true; if (url.current) URL.revokeObjectURL(url.current) } }, [])

  function resultado(blob, nombre, tipo, extra = {}) {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(blob)
    setEstado({ tipo: 'hecho', blob, nombre, clase: tipo, url: url.current, ...extra })
  }
  async function generar(clase) {
    cancelar.current = false
    setEstado({ tipo: 'generando', clase, progreso: 0 })
    try {
      const { prepararRecursos, exportarPng, exportarVideo } = await import('../utils/pizarraRender')
      const recursos = await prepararRecursos(raiz, fotos)
      const comun = { formato, recursos, placa, zona, estela: preferencias?.estela || 'estela', flechas: Boolean(preferencias?.flechas) }
      if (clase === 'png') {
        const blob = await exportarPng(doc, { ...comun, indice })
        resultado(blob, nombreArchivo(placa.titulo, 'png', `paso-${indice + 1}`), 'png')
        return
      }
      const video = await exportarVideo(doc, { ...comun, placas, progreso: p => setEstado(e => e.tipo === 'generando' ? { ...e, progreso: p } : e), cancelado: () => cancelar.current })
      if (!video) { setEstado({ tipo: 'listo' }); return }
      resultado(video.blob, nombreArchivo(placa.titulo, 'mp4', FORMATOS_VIDEO[formato].sufijo), 'video', { recortado: video.recortado, formato })
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: e?.message || 'No se pudo exportar.' })
    }
  }
  function descargar() {
    const a = document.createElement('a'); a.href = estado.url; a.download = estado.nombre; a.click()
  }
  const archivo = estado.tipo === 'hecho' ? new File([estado.blob], estado.nombre, { type: estado.blob.type }) : null
  const puedeCompartir = Boolean(archivo && navigator.canShare?.({ files: [archivo] }))
  async function compartir() {
    try { await navigator.share({ files: [archivo], title: placa.titulo || 'Jugada' }) } catch (e) { if (e?.name !== 'AbortError') setEstado(s => ({ ...s, aviso: 'No se pudo compartir. Descargalo y compartilo desde la galería.' })) }
  }

  return createPortal(<div className="pizarra-exportar-fondo" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !generando) onCerrar() }} onPointerDown={e => { if (e.target === e.currentTarget && !generando) onCerrar() }}>
    <section ref={caja} tabIndex={-1} className="pizarra-exportar" role="dialog" aria-modal="true" aria-label="Exportar jugada">
      <header className="pizarra-exportar-cabeza"><h3>Exportar jugada</h3>
        <button type="button" className="pizarra-icono" aria-label="Cerrar" disabled={generando} onClick={onCerrar}>✕</button></header>

      <div className="pizarra-exportar-grupo" role="group" aria-label="Formato">
        {Object.entries(FORMATOS_VIDEO).map(([id, f]) => <button key={id} type="button" aria-pressed={formato === id} disabled={generando} onClick={() => setFormato(id)}>
          <span className={`pizarra-exportar-forma pizarra-exportar-${id}`} aria-hidden="true" />{f.nombre}</button>)}
      </div>

      <fieldset className="pizarra-exportar-placa" disabled={generando}>
        <legend>Placas de inicio y cierre</legend>
        <label className="pizarra-exportar-check"><input type="checkbox" checked={placas} onChange={e => setPlacas(e.target.checked)} /> Mostrar placas en el video (escudo, título y analista)</label>
        <label>Título<input value={doc.placa?.titulo || ''} maxLength={80} placeholder={titulo || 'Título de la jugada'} onChange={e => onPlaca({ ...(doc.placa || {}), titulo: e.target.value })} /></label>
        <label>Analista<input value={doc.placa?.analista || ''} maxLength={80} placeholder="Nombre de quien analiza" onChange={e => onPlaca({ ...(doc.placa || {}), analista: e.target.value })} /></label>
        <p className="pizarra-ayuda">El título y el analista se guardan con la jugada.</p>
      </fieldset>

      <label className="pizarra-exportar-check"><input type="checkbox" checked={zona} disabled={generando} onChange={e => setZona(e.target.checked)} /> Acercar la cámara a la zona de la jugada</label>

      <div className="pizarra-exportar-acciones">
        <button type="button" className="pizarra-primario" disabled={generando || doc.pasos.length < 2} onClick={() => generar('video')}>Generar video MP4 · {Math.round(linea.total)} s</button>
        <button type="button" disabled={generando} onClick={() => generar('png')}>PNG del paso {indice + 1}</button>
      </div>
      {doc.pasos.length < 2 && <p className="pizarra-ayuda">Para el video hacen falta al menos dos pasos. El PNG se puede generar igual.</p>}
      {linea.recortado && <p className="pizarra-ayuda">La jugada es larga: el video se corta a los 3 minutos.</p>}

      {generando && <div className="pizarra-exportar-progreso" role="status">
        <span>{estado.clase === 'png' ? 'Generando imagen…' : `Generando video… ${Math.round((estado.progreso || 0) * 100)} %`}</span>
        {estado.clase === 'video' && <progress max="1" value={estado.progreso || 0} />}
        {estado.clase === 'video' && <button type="button" onClick={() => { cancelar.current = true }}>Cancelar</button>}
      </div>}
      {estado.tipo === 'error' && <p className="pizarra-error" role="alert">{estado.mensaje}</p>}
      {estado.tipo === 'hecho' && <div ref={listo} className="pizarra-exportar-resultado">
        {estado.clase === 'video'
          ? <video src={estado.url} controls playsInline muted className={`pizarra-exportar-vista pizarra-exportar-vista-${estado.formato}`} />
          : <img src={estado.url} alt="Vista previa del PNG" className="pizarra-exportar-vista" />}
        <div className="pizarra-exportar-acciones">
          {puedeCompartir && <button type="button" className="pizarra-primario" onClick={compartir}>Compartir</button>}
          <button type="button" className={puedeCompartir ? undefined : 'pizarra-primario'} onClick={descargar}>Descargar {estado.clase === 'video' ? 'MP4' : 'PNG'}</button>
        </div>
        {estado.aviso && <p className="pizarra-ayuda">{estado.aviso}</p>}
      </div>}
    </section>
  </div>, document.body)
}
