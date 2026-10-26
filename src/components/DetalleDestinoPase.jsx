import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ESTADOS_DESTINATARIA } from '../utils/destinatariasPases'
import {
  cargarFichaDestino, direccionAtaquePase, guardarDestinoPase, mensajeErrorDestino, puntoExacto,
} from '../utils/trayectoriasPases'
import FlechasPases from './FlechasPases'

export default function DetalleDestinoPase({ evento, partido, autora, puedeEditar, renderCancha, onSaved, onClose, onVideo }) {
  const [ficha, setFicha] = useState(null)
  const [destino, setDestino] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [bloqueado, setBloqueado] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)
  const activo = useRef(false)
  const ocupado = useRef(false)
  const panel = useRef(null)
  const origen = puntoExacto(evento.coordenada_x, evento.coordenada_y)
  const direccion = direccionAtaquePase(partido, evento)

  useEffect(() => {
    activo.current = true
    panel.current?.focus()
    return () => { activo.current = false }
  }, [])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setBloqueado(true)
      setFicha(null)
      setDestino(null)
      setError('')
      setMensaje('')
      try {
        const datos = await cargarFichaDestino(supabase, evento.id)
        if (cancelado) return
        setFicha(datos)
        setDestino(puntoExacto(datos.detalle?.destino_x, datos.detalle?.destino_y))
        setBloqueado(false)
      } catch {
        if (!cancelado) setError('No se pudo leer el detalle del pase. Recargá antes de editar; no se asume que falte destino o destinataria.')
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [evento, recarga])

  async function guardar(punto) {
    if (!puedeEditar || cargando || bloqueado || !ficha || ocupado.current) return
    ocupado.current = true
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const detalle = await guardarDestinoPase(supabase, evento, ficha.detalle, punto)
      if (!activo.current) return
      setFicha((actual) => ({ ...actual, detalle }))
      setDestino(puntoExacto(detalle.destino_x, detalle.destino_y))
      setMensaje(punto ? 'Destino guardado.' : 'Destino quitado. Se conserva la destinataria.')
      onSaved(detalle)
    } catch (err) {
      if (!activo.current) return
      setError(mensajeErrorDestino(err))
      setBloqueado(true)
    } finally {
      ocupado.current = false
      if (activo.current) setGuardando(false)
    }
  }

  return <section ref={panel} tabIndex={-1} aria-labelledby="titulo-destino-pase"
    className="rounded-xl border border-yellow-400 bg-slate-900 p-4 text-slate-100">
    <div className="flex items-start justify-between gap-3">
      <h3 id="titulo-destino-pase" className="font-bold">Trayectoria del pase</h3>
      <button type="button" disabled={guardando} onClick={onClose} className="text-sm disabled:opacity-40">Cerrar</button>
    </div>
    <p className="mt-2 text-sm">{autora} · {evento.tipo}</p>
    <p className="text-sm">{partido?.rival || 'Partido'} · Período {evento.periodo ?? 'sin registrar'} · {Math.floor(evento.segundo / 60)}:{String(evento.segundo % 60).padStart(2, '0')}</p>
    <p className="mt-2 text-sm">Destinataria: {cargando ? 'Cargando…' : error && !ficha ? 'No disponible' :
      ficha?.detalle?.destinataria_estado === 'identificada' ? ficha.destinataria :
        ESTADOS_DESTINATARIA[ficha?.detalle?.destinataria_estado || 'pendiente']}</p>
    <p className="mt-2 text-xs text-slate-300">Ataque registrado en este período: {direccion ? `${direccion === 'derecha' ? '→' : '←'} ${direccion}` : 'sin información válida'}.</p>
    <p className="text-xs text-amber-200">Referencia espacial histórica sin verificar: no se clasifica adelante, atrás ni lateral. Los puntos no se invierten.</p>
    {cargando && <p role="status" className="mt-3">Cargando detalle…</p>}
    {!cargando && ficha && <>
      <p className="mt-3 text-sm">{origen ? `Origen exacto: X ${origen.x}% · Y ${origen.y}% (punto blanco).` :
        'Sin origen exacto: podés registrar el destino, pero no se dibujará una flecha ni se usará el centro de la zona como origen.'}</p>
      <p className="mt-2 text-sm">{destino ? `Destino seleccionado: X ${destino.x}% · Y ${destino.y}%.` : 'Sin destino seleccionado.'}</p>
      {puedeEditar && <p className="my-2 text-xs text-slate-300">Tocá la cancha para marcar o corregir dónde terminó realmente la pelota, con la misma referencia visual del origen.</p>}
      <div className="mt-2">{renderCancha({
        coordenadas: destino,
        interactiva: puedeEditar && !bloqueado && !guardando,
        onSelect: (punto) => { setDestino(punto); setMensaje('') },
        capaTrayectorias: <>
          <FlechasPases eventos={[evento]} detalles={{ [evento.id]: { destino_x: destino?.x, destino_y: destino?.y } }} />
          {origen && <circle cx={origen.x} cy={origen.y * 0.64} r="1.6" fill="white" stroke="#10251B" strokeWidth="0.4" pointerEvents="none" />}
        </>,
      })}</div>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {mensaje && <p role="status" className="mt-3 text-sm text-green-300">{mensaje}</p>}
    <div className="mt-3 flex flex-wrap gap-3 text-sm">
      {puedeEditar && <>
        <button type="button" disabled={cargando || guardando || bloqueado || !destino}
          onClick={() => guardar(destino)} className="rounded bg-yellow-400 px-3 py-2 font-bold text-slate-900 disabled:opacity-40">
          {guardando ? 'Guardando…' : 'Guardar destino'}</button>
        <button type="button" disabled={cargando || guardando || bloqueado || !puntoExacto(ficha?.detalle?.destino_x, ficha?.detalle?.destino_y)}
          onClick={() => guardar(null)} className="rounded border border-slate-500 px-3 py-2 disabled:opacity-40">Quitar destino guardado</button>
      </>}
      <button type="button" disabled={guardando || cargando} onClick={() => setRecarga((n) => n + 1)}
        className="py-2 text-yellow-300 disabled:opacity-40">Recargar detalle (descarta selección sin guardar)</button>
      <button type="button" disabled={guardando} onClick={() => { onClose(); onVideo(evento) }}
        className="py-2 text-yellow-300 disabled:opacity-40">Abrir video en esta acción</button>
    </div>
  </section>
}
