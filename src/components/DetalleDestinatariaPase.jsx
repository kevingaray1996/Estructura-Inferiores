import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  cargarDetallePase, cargarOpcionesDestinatarias, ESTADOS_DESTINATARIA,
  guardarDestinataria, mensajeErrorDestinataria, nombreDestinataria,
} from '../utils/destinatariasPases'

const control = 'w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100'

export default function DetalleDestinatariaPase({ evento, partido, autora, onClose, onSaved, onVideo }) {
  const [datos, setDatos] = useState(null)
  const [estado, setEstado] = useState('pendiente')
  const [destinatariaId, setDestinatariaId] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [requiereRecarga, setRequiereRecarga] = useState(false)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const panel = useRef(null)
  const ocupado = useRef(false)
  const activo = useRef(true)

  useEffect(() => {
    activo.current = true
    const previo = document.activeElement
    panel.current?.focus()
    return () => { activo.current = false; previo?.focus() }
  }, [])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setRequiereRecarga(true)
      setError('')
      try {
        const detalle = await cargarDetallePase(supabase, evento.id)
        const opciones = await cargarOpcionesDestinatarias(supabase, partido, evento, detalle)
        if (cancelado) return
        setDatos({ detalle, ...opciones })
        setEstado(detalle?.destinataria_estado || 'pendiente')
        setDestinatariaId(detalle?.destinataria_id || '')
        setRequiereRecarga(false)
      } catch {
        if (!cancelado) setError('No se pudieron cargar el detalle o las convocadas. Reintentá antes de guardar.')
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [evento, partido, intentoCarga])

  async function guardar(e) {
    e.preventDefault()
    if (ocupado.current || cargando || requiereRecarga || !datos) return
    ocupado.current = true
    setGuardando(true)
    setError('')
    try {
      const detalle = await guardarDestinataria(supabase, evento, datos.detalle, estado, destinatariaId)
      if (!activo.current) return
      onSaved(detalle, datos.opciones.find((j) => j.id === detalle.destinataria_id))
      onClose()
    } catch (err) {
      if (!activo.current) return
      setError(mensajeErrorDestinataria(err))
      // Incluso un fallo de red puede ocurrir despues de confirmar la transaccion.
      // No repetir una escritura sin consultar primero la revision actual.
      setRequiereRecarga(true)
    } finally {
      ocupado.current = false
      if (activo.current) setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="titulo-destinataria"
        className="my-auto w-full max-w-lg rounded-xl border border-slate-600 bg-slate-800 p-5 text-slate-100"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !guardando) onClose()
          if (e.key === 'Tab') {
            const controles = [...panel.current.querySelectorAll('button:not(:disabled), select:not(:disabled)')]
            const primero = controles[0]
            const ultimo = controles[controles.length - 1]
            if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) {
              e.preventDefault(); ultimo?.focus()
            } else if (!e.shiftKey && document.activeElement === ultimo) {
              e.preventDefault(); primero?.focus()
            }
          }
        }}>
        <h3 id="titulo-destinataria" className="text-lg font-bold">Editar destinataria</h3>
        <p className="mt-2 text-sm text-slate-300">{autora} · {evento.tipo}</p>
        <p className="text-sm text-slate-300">{partido?.rival || 'Partido'} · {Math.floor(evento.segundo / 60)}:{String(evento.segundo % 60).padStart(2, '0')}</p>
        <form onSubmit={guardar} className="mt-4 space-y-4" aria-busy={cargando || guardando}>
          {cargando && <p role="status">Cargando detalle y convocadas…</p>}
          {!cargando && datos && <>
            {datos.aviso && <p className="text-sm text-amber-200">{datos.aviso}</p>}
            {datos.guardadaEsAutora && <p className="text-sm text-amber-200">La destinataria guardada coincide con la autora actual. Seleccioná otra jugadora o un estado sin identificar.</p>}
            <label className="block text-sm">Estado de destinataria
              <select className={`${control} mt-1`} value={estado} disabled={guardando || requiereRecarga}
                onChange={(e) => setEstado(e.target.value)}>
                {Object.entries(ESTADOS_DESTINATARIA).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
              </select>
            </label>
            {estado === 'identificada' && <label className="block text-sm">Jugadora destinataria
              <select className={`${control} mt-1`} value={destinatariaId} required disabled={guardando || requiereRecarga}
                onChange={(e) => setDestinatariaId(e.target.value)}>
                <option value="">Seleccioná una jugadora</option>
                {datos.opciones.map((j) => <option key={j.id} value={j.id}>
                  {nombreDestinataria(j)}{j.previamenteGuardada ? ' (previamente guardada; fuera de las opciones actuales)' : ''}
                </option>)}
              </select>
            </label>}
          </>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          {error && !guardando && <button type="button" className="text-sm font-bold text-yellow-300"
            onClick={() => setIntentoCarga((n) => n + 1)}>Recargar datos (reemplaza la selección del formulario)</button>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={cargando || guardando || requiereRecarga || !datos ||
              (estado === 'identificada' && (!destinatariaId || destinatariaId === evento.jugador_id))}
              className="rounded-lg bg-yellow-400 px-4 py-2 font-bold text-slate-900 disabled:opacity-40">
              {guardando ? 'Guardando…' : 'Guardar destinataria'}
            </button>
            <button type="button" disabled={guardando} onClick={onClose} className="px-2 py-2 disabled:opacity-40">Cancelar</button>
            <button type="button" disabled={guardando} onClick={() => { onClose(); onVideo(evento) }}
              className="py-2 text-sm text-yellow-300 disabled:opacity-40">Ir al video</button>
          </div>
        </form>
      </section>
    </div>
  )
}
