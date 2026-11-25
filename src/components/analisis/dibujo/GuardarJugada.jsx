import { useEffect, useMemo, useRef, useState } from 'react'
import { aJugadaPizarra, formularioJugada } from '../../../utils/analisis/dibujos/pizarra2d'
import { normalizarDibujo } from '../../../utils/analisis/dibujos/formato'
import './dibujo.css'

// «Guardar en Biblioteca de jugadas» (etapa 5): convierte la jugada 2D en una jugada de la Pizarra y la guarda en la
// carpeta elegida, con el enlace al clip. biblioteca: { cargarCarpetas() → { carpetas, error }, guardar(form) → { error } }.
export default function GuardarJugada({ titulo, dibujo, rival, videoId, inicio, biblioteca, onCerrar }) {
  const [nombre, setNombre] = useState(titulo || '')
  const [descripcion, setDescripcion] = useState('')
  const [carpetas, setCarpetas] = useState(null)
  const [carpeta, setCarpeta] = useState('')
  const [estado, setEstado] = useState({ tipo: 'listo' }) // listo | guardando | hecho | error
  const cajaRef = useRef(null)
  const conversion = useMemo(() => {
    try { return { doc: aJugadaPizarra(normalizarDibujo(dibujo).dibujo, { titulo: nombre, rival }) } } catch (e) { return { error: e.message } }
  }, [dibujo, rival, nombre])

  useEffect(() => {
    let vigente = true
    cajaRef.current?.focus()
    biblioteca.cargarCarpetas().then((r) => {
      if (!vigente) return
      const lista = (r.carpetas || []).filter((c) => c.ambito === 'cancha')
        .sort((a, b) => Number(b.sistema) - Number(a.sistema) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
      setCarpetas(lista)
      setCarpeta((actual) => actual || lista.find((c) => /jugada/i.test(c.nombre))?.id || lista[0]?.id || '')
      if (r.error) setEstado({ tipo: 'error', texto: r.error })
    })
    return () => { vigente = false }
  }, [biblioteca])

  async function guardar() {
    if (!conversion.doc || !nombre.trim() || estado.tipo === 'guardando') return
    setEstado({ tipo: 'guardando' })
    const form = formularioJugada({ nombre, carpetaId: carpeta, doc: conversion.doc, videoId, inicio, descripcion })
    const r = await biblioteca.guardar(form)
    if (r?.error) setEstado({ tipo: 'error', texto: r.error })
    else setEstado({ tipo: 'hecho', texto: `Guardada en la Biblioteca${carpetas?.find((c) => c.id === carpeta) ? ` (carpeta «${carpetas.find((c) => c.id === carpeta).nombre}»)` : ''}. Se abre desde Biblioteca → Cancha → Jugadas.` })
  }

  const fichas = conversion.doc ? conversion.doc.elementos.filter((e) => e.tipo === 'jugadora').length : 0
  return (
    <div className="dib-ventana-fondo" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onCerrar() }}
      onPointerDown={(e) => { if (e.target === e.currentTarget && estado.tipo !== 'guardando') onCerrar() }}>
      <section ref={cajaRef} tabIndex={-1} className="dib-ventana" role="dialog" aria-modal="true" aria-label="Guardar en Biblioteca de jugadas">
        <h3>Guardar en Biblioteca de jugadas</h3>
        {conversion.error
          ? <p className="dib-error" role="alert">{conversion.error}</p>
          : <p className="dib-ayuda">Se guarda como jugada de la Pizarra: {fichas} {fichas === 1 ? 'ficha' : 'fichas'} y {conversion.doc.pasos.length} pasos, con el enlace a este clip.</p>}
        <label className="dib-campo"><span>Nombre</span>
          <input type="text" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="dib-campo"><span>Carpeta</span>
          <select value={carpeta} onChange={(e) => setCarpeta(e.target.value)} disabled={!carpetas}>
            {!carpetas && <option value="">Cargando carpetas…</option>}
            {carpetas && !carpetas.some((c) => c.sistema) && <option value="">Sin carpeta</option>}
            {carpetas?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="dib-campo"><span>Descripción (opcional)</span>
          <textarea maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        {estado.tipo === 'error' && <p className="dib-error" role="alert">{estado.texto}</p>}
        {estado.tipo === 'hecho' && <p className="dib-aviso" role="status">{estado.texto}</p>}
        <div className="dib-fila" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="dib-boton" onClick={onCerrar} disabled={estado.tipo === 'guardando'}>{estado.tipo === 'hecho' ? 'Cerrar' : 'Cancelar'}</button>
          {estado.tipo !== 'hecho' && (
            <button type="button" className="dib-boton dib-principal" onClick={guardar} disabled={!conversion.doc || !nombre.trim() || estado.tipo === 'guardando'}>
              {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
