import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { validarScouting } from '../../utils/analisis/colectiva'
import { youtubeEmbed } from '../../utils/analisis/formato'
import './colectiva.css'

// Alta o edición de un partido de scouting (el rival contra otro club). No se vincula al calendario: no cuenta en
// las estadísticas del club, en la convocatoria ni en los minutos.
export default function FormularioScouting({ inicial, categoriaPorDefecto, guardando, onGuardar, onCancelar, inputClass, inputStyle }) {
  const [datos, setDatos] = useState(() => ({
    local: inicial?.equipo_local || '',
    visitante: inicial?.equipo_visitante || '',
    analizado: inicial?.equipo_analizado === 'visitante' ? 'visitante' : 'local',
    fecha: inicial?.fecha || '',
    videoUrl: inicial?.video_url || '',
    notas: inicial?.notas || '',
    categoriaId: inicial?.categoria_id || categoriaPorDefecto || '',
  }))
  const [categorias, setCategorias] = useState([])
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let vigente = true
    supabase.from('categorias').select('id, nombre, orden').order('orden').then(({ data }) => { if (vigente) setCategorias(data || []) })
    return () => { vigente = false }
  }, [])

  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))

  function enviar(e) {
    e.preventDefault()
    const r = validarScouting(datos, (url) => Boolean(youtubeEmbed(url)))
    if (!r.ok) { setAviso(r.motivo); return }
    setAviso('')
    onGuardar({ ...r.registro, notas: datos.notas.trim() || null })
  }

  const campo = (texto, control) => (
    <label className="block space-y-1 text-sm font-bold"><span>{texto}</span>{control}</label>
  )

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('Equipo local', <input className={inputClass} style={inputStyle} value={datos.local} onChange={cambiar('local')} maxLength={60} required />)}
        {campo('Equipo visitante', <input className={inputClass} style={inputStyle} value={datos.visitante} onChange={cambiar('visitante')} maxLength={60} required />)}
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-bold">Equipo analizado (la botonera colectiva marca desde este equipo)</legend>
        <div className="az-segmento" role="group">
          <button type="button" aria-pressed={datos.analizado === 'local'} onClick={() => setDatos((d) => ({ ...d, analizado: 'local' }))}>
            {datos.local.trim() || 'Local'}
          </button>
          <button type="button" aria-pressed={datos.analizado === 'visitante'} onClick={() => setDatos((d) => ({ ...d, analizado: 'visitante' }))}>
            {datos.visitante.trim() || 'Visitante'}
          </button>
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('Fecha', <input className={inputClass} style={inputStyle} type="date" value={datos.fecha} onChange={cambiar('fecha')} />)}
        {campo('Categoría que lo usa', (
          <select className={inputClass} style={inputStyle} value={datos.categoriaId} onChange={cambiar('categoriaId')} required>
            <option value="">Elegí una categoría…</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        ))}
      </div>
      {campo('Enlace de YouTube', <input className={inputClass} style={inputStyle} type="url" value={datos.videoUrl} onChange={cambiar('videoUrl')} placeholder="https://www.youtube.com/watch?v=..." />)}
      {campo('Notas generales', <textarea className={inputClass} style={inputStyle} rows={2} value={datos.notas} onChange={cambiar('notas')} />)}
      {aviso && <p role="alert" className="text-sm" style={{ color: 'var(--ui-peligro-texto)' }}>{aviso}</p>}
      <p className="text-xs" style={{ color: 'var(--ui-compartido-secundario)' }}>
        Un partido de scouting no cuenta en las estadísticas del club, en la convocatoria ni en los minutos. Por ahora solo usa la botonera colectiva.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="et-boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar partido de scouting'}</button>
        <button type="button" className="et-boton" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  )
}
