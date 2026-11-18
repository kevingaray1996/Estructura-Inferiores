import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { mensajeErrorAvisos } from '../../utils/avisos'

const NOMBRES_TIPOS = { wellness: 'Wellness', rpe: 'RPE', entrenamiento: 'Entrenamiento', convocatoria: 'Convocatoria', mensajes: 'Mensajes' }

function estadoJugadora(j) {
  if (!j.cuenta) return { clave: 'sin_cuenta', texto: 'Sin cuenta' }
  if (j.cuenta === 'desactivada') return { clave: 'desactivada', texto: 'Cuenta desactivada' }
  if (!j.dispositivos) return { clave: 'sin_avisos', texto: 'Sin avisos activados' }
  return { clave: 'activos', texto: `Avisos activos en ${j.dispositivos} ${j.dispositivos === 1 ? 'celular' : 'celulares'}` }
}

// Coordinación: quiénes de una categoría tienen los avisos activados, y qué tipos apagaron.
function JugadorasAvisos({ categorias, activo }) {
  const [categoriaId, setCategoriaId] = useState('')
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const categoriaActual = categoriaId || categorias[0]?.id || ''

  useEffect(() => {
    if (!activo || !categoriaActual) return undefined
    let vigente = true
    supabase.rpc('avisos_jugadoras', { p_categoria_id: categoriaActual }).then(({ data, error: fallo }) => {
      if (!vigente) return
      if (fallo) { setError(mensajeErrorAvisos(fallo)); setFilas([]); return }
      setError(''); setFilas(Array.isArray(data) ? data : [])
    })
    return () => { vigente = false }
  }, [activo, categoriaActual])

  const conAvisos = (filas || []).filter((j) => j.cuenta === 'activa' && j.dispositivos > 0).length
  return (
    <section className="av-tarjeta" aria-labelledby="av-jugadoras-titulo">
      <h2 id="av-jugadoras-titulo" className="av-titulo">Quiénes tienen los avisos activados</h2>
      <label className="av-campo" htmlFor="av-jugadoras-categoria">
        <span>Categoría de las jugadoras</span>
        <select id="av-jugadoras-categoria" className="ui-control av-control" value={categoriaActual} onChange={(e) => setCategoriaId(e.target.value)}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      {filas === null && !error && <p className="av-texto" role="status">Cargando jugadoras…</p>}
      {error && <p className="av-error" role="alert">{error}</p>}
      {filas && filas.length > 0 && <p className="av-texto"><strong>{conAvisos}</strong> de {filas.length} con los avisos activados.</p>}
      {filas && filas.length === 0 && !error && <p className="av-texto">No hay jugadoras en esta categoría.</p>}
      <ul className="av-lista">
        {(filas || []).map((j) => {
          const estado = estadoJugadora(j)
          const apagados = estado.clave === 'activos'
            ? Object.entries(j.preferencias || {}).filter(([, v]) => v === false).map(([k]) => NOMBRES_TIPOS[k] || k)
            : []
          return (
            <li key={j.jugador_id} className="av-fila">
              <div>
                <p className="av-fila-titulo">{j.apellido}, {j.nombre}</p>
                <p className="av-texto" data-estado={estado.clave}>{estado.texto}{apagados.length ? ` · No recibe: ${apagados.join(', ')}` : ''}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default JugadorasAvisos
