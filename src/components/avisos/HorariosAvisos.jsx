import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import { DIAS, mensajeErrorAvisos, textoHoy } from '../../utils/avisos'

// Una categoría: avisos automáticos activos, días de entrenamiento y horas de Wellness y RPE (hora de Argentina).
function TarjetaHorarios({ categoria, onGuardado }) {
  const [activo, setActivo] = useState(categoria.activo)
  const [dias, setDias] = useState(categoria.dias || [])
  const [horaWellness, setHoraWellness] = useState(categoria.hora_wellness || '07:10')
  const [horaRpe, setHoraRpe] = useState(categoria.hora_rpe || '10:15')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const base = `av-horarios-${categoria.categoria_id}`

  function alternarDia(numero) {
    setDias((prev) => (prev.includes(numero) ? prev.filter((d) => d !== numero) : [...prev, numero]))
    setAviso('')
  }

  async function guardar() {
    setError(''); setAviso('')
    if (dias.length === 0) { setError('Elegí al menos un día de entrenamiento.'); return }
    setGuardando(true)
    const { error: fallo } = await supabase.rpc('avisos_guardar_config', {
      p_categoria_id: categoria.categoria_id, p_activo: activo, p_dias: [...dias].sort((a, b) => a - b),
      p_hora_wellness: horaWellness, p_hora_rpe: horaRpe,
    })
    setGuardando(false)
    if (fallo) { setError(mensajeErrorAvisos(fallo)); return }
    setAviso('Horarios guardados.')
    onGuardado?.()
  }

  return (
    <li className="av-tarjeta" data-categoria-avisos="">
      <div className="av-cabecera-tarjeta">
        <h3 className="av-subtitulo">{categoria.nombre}</h3>
        <p className="av-hoy" data-aplica={categoria.hoy?.aplica ? 'si' : 'no'}>{textoHoy(categoria.hoy?.motivo)}</p>
      </div>
      <label className="av-opcion">
        <input type="checkbox" checked={activo} onChange={() => { setActivo(!activo); setAviso('') }} /> Recordatorios automáticos activos
      </label>
      <fieldset className="av-grupo">
        <legend>Días de entrenamiento</legend>
        <div className="av-dias">
          {DIAS.map((d) => (
            <label key={d.numero} className="av-dia">
              <input type="checkbox" checked={dias.includes(d.numero)} onChange={() => alternarDia(d.numero)} />
              {d.corto}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="av-horas">
        <label className="av-campo" htmlFor={`${base}-wellness`}>
          <span>Hora del Wellness</span>
          <input id={`${base}-wellness`} type="time" className="ui-control av-control" value={horaWellness}
            onChange={(e) => { setHoraWellness(e.target.value); setAviso('') }} />
        </label>
        <label className="av-campo" htmlFor={`${base}-rpe`}>
          <span>Hora del RPE</span>
          <input id={`${base}-rpe`} type="time" className="ui-control av-control" value={horaRpe}
            onChange={(e) => { setHoraRpe(e.target.value); setAviso('') }} />
        </label>
      </div>
      <Boton onClick={guardar} disabled={guardando} aria-busy={guardando}>{guardando ? 'Guardando…' : 'Guardar horarios'}</Boton>
      <p className="av-estado" role="status" aria-live="polite">{aviso}</p>
      {error && <p className="av-error" role="alert">{error}</p>}
    </li>
  )
}

function HorariosAvisos({ panel, onCambio }) {
  return (
    <div className="av-pila">
      <p className="av-texto">Los recordatorios salen los días de entrenamiento (y los días con una sesión publicada), salvo Descanso o pausa. Hora de Argentina.</p>
      <ul className="av-lista">
        {(panel?.categorias || []).map((c) => <TarjetaHorarios key={c.categoria_id} categoria={c} onGuardado={onCambio} />)}
      </ul>
    </div>
  )
}

export default HorariosAvisos
