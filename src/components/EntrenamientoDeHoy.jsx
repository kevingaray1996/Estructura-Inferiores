import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'
import { cargarEntrenamientoHoy, enlaceSeguro, fechaArgentina } from '../utils/planificacion'

export function ContenidoEntrenamientoHoy({ sesiones }) {
  if (!sesiones?.length) return null
  return <section aria-label="Tu entrenamiento de hoy" className="mb-6 rounded-xl border p-4 space-y-4"
    style={{ backgroundColor: COLORES.fondoTarjeta, borderColor: COLORES.borde, color: COLORES.texto }}>
    <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--ui-texto-acento)' }}>Tu entrenamiento de hoy</h2>
    {sesiones.map((s) => <div key={s.id} className="space-y-3">
      <p className="text-sm font-semibold">
        {new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${s.fecha}T12:00:00Z`))}
        {s.hora ? ` · ${s.hora.slice(0, 5)}` : ''}{s.lugar ? ` · ${s.lugar}` : ''}
      </p>
      {s.objetivo && <p className="text-sm">{s.objetivo}</p>}
      {s.bloques.map((b, i) => <div key={i} className="border-t pt-3 space-y-2" style={{ borderColor: COLORES.borde }}>
        <h3 className="text-sm font-bold">Bloque {i + 1}{b.nombre ? ` — ${b.nombre}` : ''}</h3>
        {b.objetivo && <p className="text-sm">{b.objetivo}</p>}
        {b.duracion && <p className="text-xs" style={{ color: COLORES.textoSecundario }}>{b.duracion} min estimados</p>}
        {b.indicaciones && <p className="whitespace-pre-wrap text-sm">{b.indicaciones}</p>}
        {(b.ejercicios || []).map((e, j) => <div key={j} className="pl-3 border-l-2 space-y-1" style={{ borderColor: COLORES.acento }}>
          <p className="text-sm font-medium">{e.nombre || `Tarea ${j + 1}`}</p>
          {e.objetivo && <p className="text-sm">{e.objetivo}</p>}
          {(e.duracion || e.series || e.repeticiones) && <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
            {[e.duracion ? `${e.duracion} min` : '', e.series ? `Series: ${e.series}` : '', e.repeticiones ? `Repeticiones: ${e.repeticiones}` : ''].filter(Boolean).join(' · ')}
          </p>}
          {e.materiales && <p className="text-sm">Materiales: {e.materiales}</p>}
          {e.indicaciones && <p className="text-sm whitespace-pre-wrap">{e.indicaciones}</p>}
          {enlaceSeguro(e.imagen_url) && <img src={enlaceSeguro(e.imagen_url)} alt={e.nombre || 'Ejercicio'} loading="lazy" className="max-h-48 max-w-full rounded-lg object-contain" />}
          {enlaceSeguro(e.link_video) && <a className="inline-block text-sm underline" style={{ color: 'var(--ui-texto-acento)' }} href={enlaceSeguro(e.link_video)} target="_blank" rel="noreferrer">Ver ejercicio</a>}
        </div>)}
      </div>)}
    </div>)}
  </section>
}

export default function EntrenamientoDeHoy({ categoriaId, jugadoraId }) {
  const [lectura, setLectura] = useState(null)
  useEffect(() => {
    if (!categoriaId || !jugadoraId) return
    let activo = true
    let peticion = 0
    async function actualizar() {
      const numero = ++peticion
      try {
        const sesiones = await cargarEntrenamientoHoy(supabase, categoriaId, jugadoraId)
        if (activo && numero === peticion) setLectura({ categoriaId, jugadoraId, fecha: fechaArgentina(), sesiones })
      } catch {
        // Un fallo del módulo opcional nunca bloquea ni altera el formulario Wellness.
        if (activo && numero === peticion) setLectura(null)
      }
    }
    void actualizar()
    const intervalo = window.setInterval(() => { if (document.visibilityState === 'visible') void actualizar() }, 30000)
    window.addEventListener('focus', actualizar)
    const visible = () => { if (document.visibilityState === 'visible') void actualizar() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      activo = false
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [categoriaId, jugadoraId])
  if (!lectura || lectura.categoriaId !== categoriaId || lectura.jugadoraId !== jugadoraId || lectura.fecha !== fechaArgentina()) return null
  return <ContenidoEntrenamientoHoy sesiones={lectura.sesiones} />
}
