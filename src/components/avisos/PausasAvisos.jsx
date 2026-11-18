import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import Boton from '../ui/Boton'
import { mensajeErrorAvisos } from '../../utils/avisos'

const fecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

// Pausas de los recordatorios automáticos: feriados, vacaciones, entrenamiento suspendido.
function PausasAvisos({ panel, categorias, onCambio }) {
  const [categoriaId, setCategoriaId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function crear(evento) {
    evento.preventDefault()
    setError(''); setAviso('')
    if (!desde || !hasta || hasta < desde) { setError('Revisá las fechas: «hasta» no puede ser antes que «desde».'); return }
    if (!motivo.trim()) { setError('Escribí el motivo (por ejemplo «Vacaciones»).'); return }
    setTrabajando(true)
    const { error: fallo } = await supabase.rpc('avisos_crear_pausa', {
      p_categoria_id: categoriaId || null, p_desde: desde, p_hasta: hasta, p_motivo: motivo.trim(),
    })
    setTrabajando(false)
    if (fallo) { setError(mensajeErrorAvisos(fallo)); return }
    setDesde(''); setHasta(''); setMotivo('')
    setAviso('Pausa creada.')
    onCambio?.()
  }

  async function quitar(pausa) {
    setTrabajando(true); setError(''); setAviso('')
    const { error: fallo } = await supabase.rpc('avisos_borrar_pausa', { p_id: pausa.id })
    setTrabajando(false); setConfirmando(null)
    if (fallo) { setError(mensajeErrorAvisos(fallo)); return }
    setAviso('Pausa quitada.')
    onCambio?.()
  }

  const pausas = panel?.pausas || []
  return (
    <div className="av-pila">
      <section className="av-tarjeta" aria-labelledby="av-pausas-titulo">
        <h2 id="av-pausas-titulo" className="av-titulo">Pausas vigentes y próximas</h2>
        {pausas.length === 0 && <p className="av-texto">No hay pausas. Los recordatorios salen según los horarios.</p>}
        <ul className="av-lista">
          {pausas.map((p) => (
            <li key={p.id} className="av-fila">
              <div>
                <p className="av-fila-titulo">{p.motivo || 'Pausa'}</p>
                <p className="av-texto">{p.categoria || 'Todas las categorías'} · {fecha(p.desde)}{p.hasta !== p.desde ? ` al ${fecha(p.hasta)}` : ''}</p>
              </div>
              {confirmando !== p.id
                ? <Boton variante="secundario" onClick={() => setConfirmando(p.id)} disabled={trabajando}>Quitar pausa</Boton>
                : (
                  <div className="av-confirmar" role="group" aria-labelledby={`av-quitar-${p.id}`}>
                    <p id={`av-quitar-${p.id}`}>Quitar la pausa «{p.motivo || 'Pausa'}». Los recordatorios vuelven a salir esos días.</p>
                    <div className="av-botones">
                      <Boton variante="peligro" onClick={() => quitar(p)} disabled={trabajando} aria-busy={trabajando}>Quitar pausa</Boton>
                      <Boton variante="secundario" onClick={() => setConfirmando(null)} disabled={trabajando}>Cancelar</Boton>
                    </div>
                  </div>
                )}
            </li>
          ))}
        </ul>
      </section>

      <form className="av-tarjeta" onSubmit={crear} noValidate aria-labelledby="av-pausa-nueva">
        <h2 id="av-pausa-nueva" className="av-titulo">Nueva pausa</h2>
        <label className="av-campo" htmlFor="av-pausa-categoria">
          <span>Categoría de la pausa</span>
          <select id="av-pausa-categoria" className="ui-control av-control" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <div className="av-horas">
          <label className="av-campo" htmlFor="av-pausa-desde"><span>Desde</span>
            <input id="av-pausa-desde" type="date" className="ui-control av-control" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="av-campo" htmlFor="av-pausa-hasta"><span>Hasta</span>
            <input id="av-pausa-hasta" type="date" className="ui-control av-control" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        <label className="av-campo" htmlFor="av-pausa-motivo"><span>Motivo</span>
          <input id="av-pausa-motivo" type="text" maxLength={80} className="ui-control av-control" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <Boton type="submit" disabled={trabajando} aria-busy={trabajando}>Crear pausa</Boton>
        <p className="av-estado" role="status" aria-live="polite">{aviso}</p>
        {error && <p className="av-error" role="alert">{error}</p>}
      </form>
    </div>
  )
}

export default PausasAvisos
