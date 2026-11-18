import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { etiquetaTipo, fechaHoraCorta, mensajeErrorAvisos } from '../../utils/avisos'

const ESTADOS = { pendiente: 'En cola', enviando: 'Enviando', enviado: 'Enviado', error: 'No salió' }

// Últimos 50 avisos. Coordinación ve todas las categorías (o una); técnico y PF, solo la suya.
function HistorialAvisos({ categorias, categoriaFija, activo }) {
  const [categoriaId, setCategoriaId] = useState('')
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)
  const filtro = categoriaFija || categoriaId || null

  useEffect(() => {
    if (!activo) return undefined
    let vigente = true
    supabase.rpc('avisos_historial', { p_categoria_id: filtro, p_limite: 50 }).then(({ data, error: fallo }) => {
      if (!vigente) return
      if (fallo) { setError(mensajeErrorAvisos(fallo)); setFilas([]); return }
      setError(''); setFilas(Array.isArray(data) ? data : [])
    })
    return () => { vigente = false }
  }, [activo, filtro, recarga])

  return (
    <section className="av-tarjeta" aria-labelledby="av-historial-titulo">
      <div className="av-cabecera-tarjeta">
        <h2 id="av-historial-titulo" className="av-titulo">Historial</h2>
        <button type="button" className="av-enlace" onClick={() => setRecarga((n) => n + 1)}>Actualizar</button>
      </div>
      <p className="av-texto av-suave">«Entregado» quiere decir que lo aceptó el servicio del celular, no que lo leyó. «Sin avisos»: jugadoras sin cuenta, sin los avisos activados o con ese tipo apagado.</p>
      {!categoriaFija && (
        <label className="av-campo" htmlFor="av-historial-categoria">
          <span>Categoría del historial</span>
          <select id="av-historial-categoria" className="ui-control av-control" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      )}
      {filas === null && !error && <p className="av-texto" role="status">Cargando historial…</p>}
      {error && <p className="av-error" role="alert">{error}</p>}
      {filas && filas.length === 0 && !error && <p className="av-texto">Todavía no salió ningún aviso.</p>}
      <ul className="av-lista">
        {(filas || []).map((e) => (
          <li key={e.id} className="av-fila av-fila-historial">
            <div className="av-fila-principal">
              <p className="av-fila-titulo">{etiquetaTipo(e.tipo)} · {e.categoria}</p>
              <p className="av-texto">{fechaHoraCorta(e.creado_at)} · {e.remitente} · {ESTADOS[e.estado] || e.estado}</p>
              {e.tipo === 'manual' && e.texto && <p className="av-cita">{e.texto}</p>}
            </div>
            <p className="av-cifras">
              {e.destinatarias == null ? '—' : <>Entregado a <strong>{e.entregados ?? 0} de {e.destinatarias}</strong></>}
              {e.sin_avisos ? <span> · {e.sin_avisos} sin avisos</span> : null}
              {e.fallidos ? <span> · {e.fallidos} no llegaron</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default HistorialAvisos
