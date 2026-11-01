import { useState } from 'react'
import { COLORES } from '../theme'
import { textoGestion } from '../appearance/gestion'
import { tintePlantel } from '../appearance/plantel'

function Escudo({ imagen, equipo }) {
  const [fallo, setFallo] = useState(false)
  return imagen && !fallo ? <img src={imagen} alt={`Escudo de ${equipo}`} loading="lazy" onError={() => setFallo(true)} /> : <span className="partido-escudo-vacio" aria-label={`Escudo no disponible de ${equipo}`}>{equipo?.[0] || '—'}</span>
}
export default function TarjetaPartidoPremium({ partido: p, resultado, onAbrir, onPDF, onImagen, onEstadisticas, onEditar, onEliminar }) {
  const visitante = p.local_visitante === 'visitante'
  const club = { nombre: 'Comunicaciones', imagen: '/Escudo%20simplificado.png' }
  const rival = { nombre: p.rival || 'Rival por confirmar', imagen: p.escudo_url }
  const local = visitante ? rival : club, visita = visitante ? club : rival
  const color = resultado?.etiqueta === 'Victoria' ? COLORES.exito : resultado?.etiqueta === 'Derrota' ? COLORES.peligro : COLORES.acento
  const accion = (e, callback) => { e.stopPropagation(); callback(p.id) }
  return <article className="partido-premium" data-partido-id={p.id} onClick={() => onAbrir(p.id)}>
    <div className="partido-contexto"><span>{p.numero_fecha ? `Fecha ${p.numero_fecha}` : 'Partido'} · {p.fecha || 'Fecha por confirmar'}{p.hora && ` · ${p.hora}`}</span>
      <span className="partido-resultado" style={{ color: textoGestion(color), borderColor: tintePlantel(color, '40') }}>{resultado?.texto || 'Resultado pendiente'}</span></div>
    <button type="button" className="partido-marcador" aria-label={`Abrir partido vs ${rival.nombre}`}>
      <span className="partido-equipo"><Escudo key={local.imagen || local.nombre} imagen={local.imagen} equipo={local.nombre} /><strong>{local.nombre}</strong><small>Local</small></span>
      <span className="partido-goles"><span>{p.goles_local ?? '—'}</span><span aria-hidden="true">:</span><span>{p.goles_visitante ?? '—'}</span></span>
      <span className="partido-equipo"><Escudo key={visita.imagen || visita.nombre} imagen={visita.imagen} equipo={visita.nombre} /><strong>{visita.nombre}</strong><small>Visitante</small></span>
    </button>
    <p className="partido-lugar">{p.lugar || 'Lugar por confirmar'}{p.local_visitante && ` · Comunicaciones ${p.local_visitante}`}</p>
    <footer className="partido-acciones" aria-label={`Acciones del partido vs ${rival.nombre}`}>
      {p.link && <a href={p.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Ver video</a>}
      <button type="button" onClick={e => accion(e, onPDF)}>PDF citación</button>
      <button type="button" onClick={e => accion(e, onImagen)}>Imagen citación</button>
      <button type="button" onClick={e => accion(e, onEstadisticas)}>Estadísticas</button>
      <button type="button" onClick={e => accion(e, onEditar)}>Editar</button>
      <button type="button" className="partido-eliminar" onClick={e => onEliminar(e, p.id)}>Eliminar</button>
    </footer>
  </article>
}
