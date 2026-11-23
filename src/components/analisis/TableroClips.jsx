import { useMemo, useState } from 'react'
import { etiquetaDe } from '../../utils/analisis/catalogoAcciones'
import { CLUB, equiposConAnalisis, filtrarPorEquipo, nombreDeClave } from '../../utils/analisis/equipos'
import { nombreJugadora } from '../../utils/analisis/formato'
import { clipsDeAnalisis, crucesDestacados, estadisticasColectivas, individualesPorTipo, tablaJugadoraAccion, textoDuracion } from '../../utils/analisis/tableroClips'
import './playlists.css'

function Numero({ titulo, valor, detalle, clips, onAbrir }) {
  return (
    <li>
      <button type="button" className="tb-numero" disabled={!clips.length} onClick={() => onAbrir(titulo, clips)}
        aria-label={`${titulo}: ${valor}. ${clips.length ? 'Ver los clips' : 'Sin clips'}`}>
        <span>{titulo}</span>
        <strong>{valor}</strong>
        {detalle && <small>{detalle}</small>}
      </button>
    </li>
  )
}

function Colectivas({ grupos, catalogo, nombre, onAbrir }) {
  if (!grupos.length) return <p className="tb-nota">Sin momentos colectivos marcados.</p>
  return (
    <ul className="tb-grilla">
      {grupos.map((g) => (
        <Numero key={g.tipo} titulo={`${etiquetaDe(catalogo, g.tipo)}${nombre ? ` · ${nombre}` : ''}`} valor={g.cantidad}
          detalle={`${textoDuracion(g.total)} en total · ${textoDuracion(g.promedio)} promedio`} clips={g.clips} onAbrir={onAbrir} />
      ))}
    </ul>
  )
}

// Tablero clickeable de un partido o del acumulado (lo del club, sin scouting) o de un scouting (solo lo colectivo).
// onAbrir(titulo, clips): reproduce esos clips como playlist temporal.
export default function TableroClips({ analisis, acciones, catalogo, equipos, jugadoras, marcasPorPartido, scouting = false, onAbrir }) {
  const clips = useMemo(() => clipsDeAnalisis({ analisis, acciones, catalogo, equipos, marcasPorPartido }), [analisis, acciones, catalogo, equipos, marcasPorPartido])
  const etiqueta = (t) => etiquetaDe(catalogo, t)

  if (scouting) {
    // En un scouting juegan dos equipos que no son Comunicaciones: lo colectivo de cada uno.
    const claves = [...new Set(clips.filter((c) => c.colectiva).map((c) => c.equipo))]
    return (
      <section className="tb" aria-label="Estadísticas colectivas del scouting">
        {claves.length === 0 && <p className="tb-nota">Todavía no hay momentos colectivos marcados en este partido.</p>}
        {claves.map((clave) => (
          <div key={clave}>
            <h3>Momentos colectivos · {nombreDeClave(clave, equipos)}</h3>
            <Colectivas grupos={estadisticasColectivas(clips, clave)} catalogo={catalogo} onAbrir={onAbrir} />
          </div>
        ))}
      </section>
    )
  }

  const nuestros = clips.filter((c) => c.equipo === CLUB)
  const porTipo = individualesPorTipo(nuestros)
  const cruces = crucesDestacados(clips)
  const tabla = tablaJugadoraAccion(nuestros, { orden: catalogo.tipos.map((t) => t.codigo) })
  const nombreDe = (id) => nombreJugadora(jugadoras.find((j) => j.id === id))

  return (
    <section className="tb" aria-label="Tablero clickeable">
      <p className="tb-nota">Tocá un número para ver sus clips.</p>
      <div>
        <h3>Acciones individuales</h3>
        {porTipo.length ? (
          <ul className="tb-grilla">
            {porTipo.map((g) => <Numero key={g.tipo} titulo={etiqueta(g.tipo)} valor={g.clips.length} clips={g.clips} onAbrir={onAbrir} />)}
          </ul>
        ) : <p className="tb-nota">Sin acciones individuales.</p>}
      </div>
      <div>
        <h3>Momentos colectivos de Comunicaciones</h3>
        <Colectivas grupos={estadisticasColectivas(clips, CLUB)} catalogo={catalogo} onAbrir={onAbrir} />
      </div>
      <div>
        <h3>Cruces</h3>
        <ul className="tb-grilla">
          {cruces.map((c) => <Numero key={c.id} titulo={c.titulo} valor={c.clips.length} clips={c.clips} onAbrir={onAbrir} />)}
        </ul>
      </div>
      <div>
        <h3>Jugadora × acción</h3>
        {tabla.filas.length ? (
          <div className="tb-tabla-scroll">
            <table className="tb-tabla">
              <thead>
                <tr><th scope="col">Jugadora</th>{tabla.tipos.map((t) => <th key={t} scope="col">{etiqueta(t)}</th>)}</tr>
              </thead>
              <tbody>
                {tabla.filas.map((f) => (
                  <tr key={f.jugadoraId}>
                    <td>{nombreDe(f.jugadoraId)}</td>
                    {tabla.tipos.map((t) => {
                      const lista = f.celdas[t] || []
                      return (
                        <td key={t}>
                          <button type="button" className="tb-celda" disabled={!lista.length}
                            aria-label={`${nombreDe(f.jugadoraId)} · ${etiqueta(t)}: ${lista.length}`}
                            onClick={() => onAbrir(`${etiqueta(t)} · ${nombreDe(f.jugadoraId)}`, lista)}>{lista.length || '·'}</button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="tb-nota">Sin acciones con jugadora.</p>}
      </div>
    </section>
  )
}

// Tablero por equipo: estadísticas colectivas de un equipo juntando todos los partidos donde aparece (scouting y
// contra nosotros), con el espejo de cuando fue el rival.
export function TableroPorEquipo({ analisis, acciones, catalogo, equipos, marcasPorPartido, onAbrir }) {
  const opciones = useMemo(() => equiposConAnalisis(analisis, equipos), [analisis, equipos])
  const [clave, setClave] = useState('')
  const partidos = useMemo(() => (clave ? filtrarPorEquipo(analisis, clave, equipos) : []), [analisis, clave, equipos])
  const clips = useMemo(() => {
    if (!clave) return []
    const ids = new Set(partidos.map((a) => a.id))
    return clipsDeAnalisis({ analisis: partidos, acciones: acciones.filter((a) => ids.has(a.partido_id)), catalogo, equipos, marcasPorPartido })
  }, [clave, partidos, acciones, catalogo, equipos, marcasPorPartido])
  const nombre = clave ? nombreDeClave(clave, equipos) : ''

  return (
    <section className="tb" aria-label="Tablero por equipo">
      <div>
        <h3>Tablero por equipo</h3>
        <label className="tb-equipo">
          <span className="se-etiqueta">Equipo</span>
          <select value={clave} onChange={(e) => setClave(e.target.value)}>
            <option value="">Elegí un equipo…</option>
            {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
          </select>
        </label>
      </div>
      {clave && (
        <div>
          <p className="tb-nota">{partidos.length} partidos de {nombre} (scouting y contra nosotros). Incluye lo que hacía {nombre} cuando el analizado era el otro equipo.</p>
          <Colectivas grupos={estadisticasColectivas(clips, clave)} catalogo={catalogo} onAbrir={onAbrir} />
        </div>
      )}
    </section>
  )
}
