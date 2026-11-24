import { useMemo } from 'react'
import { ESCUDO_URL } from '../../config/club'
import { etiquetaDe } from '../../utils/analisis/catalogoAcciones'
import { CLUB, ladosDelAnalisis, nombreDeClave } from '../../utils/analisis/equipos'
import { fechaLegible, nombreJugadora } from '../../utils/analisis/formato'
import { dominioPorBloques, resumenPosesion } from '../../utils/analisis/posesion'
import { clipDeEventoPartido, comparacion, destacadas, lineaResumen, resultadoPartido } from '../../utils/analisis/resumenPartido'
import { clipsDeAnalisis, estadisticasColectivas, textoDuracion } from '../../utils/analisis/tableroClips'
import { BarraPosesion, DominioBloques, MarcaParcial } from './GraficosPosesion'
import './estadisticasVisuales.css'

function Escudo({ url, nombre }) {
  return url
    ? <img src={url} alt="" loading="lazy" />
    : <span className="rs-escudo-vacio" aria-hidden="true">{String(nombre || '?').slice(0, 1).toUpperCase()}</span>
}

// Pantalla del partido (propio o scouting), pensada primero para el celular. Todo abre sus clips con onAbrir.
// eventosPartido: marcas, goles, cambios y tarjetas (analisis_partido_eventos). linea: línea de posesión del partido.
export default function ResumenPartido({ analisis, equipos, acciones, catalogo, jugadoras, marcas, eventosPartido, linea, minutos, onAbrir }) {
  const scouting = analisis?.tipo_partido === 'scouting'
  const lados = ladosDelAnalisis(analisis, equipos)
  const nuestro = scouting ? lados.analizado : CLUB
  const rival = scouting ? lados.otro : (lados.analizado === CLUB ? lados.otro : lados.analizado)
  const nuestroEsAnalizado = scouting || analisis?.equipo_analizado !== 'rival'
  const etiqueta = (t) => etiquetaDe(catalogo, t)
  const marcasMapa = useMemo(() => new Map([[analisis?.id, marcas]]), [analisis?.id, marcas])
  const clips = useMemo(() => clipsDeAnalisis({ analisis: analisis ? [analisis] : [], acciones, catalogo, equipos, marcasPorPartido: marcasMapa }),
    [analisis, acciones, catalogo, equipos, marcasMapa])
  const posesion = useMemo(() => resumenPosesion(linea), [linea])
  const bloques = useMemo(() => dominioPorBloques(linea, marcas), [linea, marcas])
  const filas = comparacion({ clips, catalogo, ladoNuestro: nuestro, ladoRival: rival, nuestroEsAnalizado, posesion, eventosPartido, etiqueta })
  const eventosLinea = lineaResumen(eventosPartido, marcas)
  const top = scouting ? [] : destacadas(clips.filter((c) => c.equipo === CLUB), minutos || {}, catalogo)
  const nombreAnalizado = nombreDeClave(lados.analizado, equipos), nombreOtro = nombreDeClave(lados.otro, equipos)

  // Encabezado: local a la izquierda.
  const datosEquipo = (clave) => {
    if (clave === CLUB) return { nombre: nombreDeClave(CLUB), escudo: ESCUDO_URL }
    const eq = (equipos || []).find((e) => e.id === clave)
    return { nombre: nombreDeClave(clave, equipos), escudo: eq?.escudo_url || (!scouting ? analisis?.partido_calendario?.escudo_url : null) || null }
  }
  const local = datosEquipo(lados.local), visitante = datosEquipo(lados.visitante)
  const resultado = resultadoPartido(analisis, eventosPartido)
  let marcador = null
  if (resultado) {
    marcador = resultado.origen === 'calendario' ? [resultado.local, resultado.visitante]
      : (lados.local === nuestro ? [resultado.local, resultado.visitante] : [resultado.visitante, resultado.local])
  }
  const cal = analisis?.partido_calendario
  const fecha = [fechaLegible(cal?.fecha || analisis?.fecha), cal?.numero_fecha ? `Fecha ${String(cal.numero_fecha).replace(/^fecha\s*/i, '')}` : '', scouting ? 'Scouting' : '']
    .filter(Boolean).join(' · ')

  const nombreJug = (id) => nombreJugadora((jugadoras || []).find((j) => j.id === id))
  const textoEvento = (e) => {
    if (e.tipo === 'gol') return `Gol ${e.equipo === 'propio' ? (scouting ? nombreAnalizado : 'nuestro') : (scouting ? nombreOtro : 'rival')}${e.jugador_id ? ` · ${nombreJug(e.jugador_id)}` : ''}`
    if (e.tipo === 'tarjeta') return `Tarjeta ${e.tarjeta || ''} · ${e.equipo === 'propio' ? (e.jugador_id ? nombreJug(e.jugador_id) : 'nuestra') : 'rival'}`
    return `Cambio · sale ${nombreJug(e.jugadora_sale)}, entra ${nombreJug(e.jugadora_entra)}`
  }
  const abrirEvento = (e) => onAbrir(textoEvento(e), [clipDeEventoPartido(e, analisis.id, textoEvento(e))])
  const colectivosDe = (clave) => estadisticasColectivas(clips, clave)
  const maximo = (f) => Math.max(1, f.nuestro, f.rival)

  return (
    <section className="rs" aria-label="Resumen del partido">
      <div className="rs-encabezado">
        <div className="rs-equipo"><Escudo url={local.escudo} nombre={local.nombre} /><strong>{local.nombre}</strong></div>
        <div className="rs-resultado" aria-label={marcador ? `Resultado ${marcador[0]} a ${marcador[1]}` : 'Sin resultado'}>{marcador ? `${marcador[0]} – ${marcador[1]}` : 'vs'}</div>
        <div className="rs-equipo"><Escudo url={visitante.escudo} nombre={visitante.nombre} /><strong>{visitante.nombre}</strong></div>
        <p className="rs-fecha">{fecha}{resultado?.origen === 'video' ? ' · resultado según las marcas del video' : ''}</p>
      </div>

      <div className="rs-bloque">
        <h3>Posesión</h3>
        <BarraPosesion resumen={posesion} nombreAnalizado={nombreAnalizado} nombreOtro={nombreOtro} />
        <DominioBloques periodos={bloques} nombreAnalizado={nombreAnalizado} nombreOtro={nombreOtro}
          onBloque={(b) => {
            const dentro = clips.filter((c) => c.segundo >= b.desde && c.segundo < b.hasta && (c.colectiva ? !c.espejo : true))
            if (dentro.length) onAbrir(`Minutos ${b.minuto}' a ${b.minuto + 5}'`, dentro)
          }} />
      </div>

      {filas.length > 0 && (
        <div className="rs-bloque">
          <h3>{nombreDeClave(nuestro, equipos)} vs {nombreDeClave(rival, equipos)}</h3>
          <ul className="rs-comp">
            {filas.map((f) => (
              <li key={f.id}>
                <div className="rs-comp-titulo">{f.titulo}{f.parcial && <MarcaParcial visible />}</div>
                <div className="rs-comp-fila">
                  <button type="button" className="rs-comp-valor" disabled={!f.clipsNuestro?.length && !f.eventos}
                    onClick={() => (f.clipsNuestro?.length ? onAbrir(`${f.titulo} · ${nombreDeClave(nuestro, equipos)}`, f.clipsNuestro)
                      : f.eventos && onAbrir(f.titulo, f.eventos.filter((e) => e.equipo === 'propio').map((e) => clipDeEventoPartido(e, analisis.id, textoEvento(e)))))}>
                    {f.nuestro}{f.sufijo || ''}
                  </button>
                  <span className="rs-comp-barra" data-lado="nuestro"><span style={{ width: `${(f.nuestro / maximo(f)) * 100}%` }} /></span>
                  <span className="rs-comp-barra" data-lado="rival"><span style={{ width: `${(f.rival / maximo(f)) * 100}%` }} /></span>
                  <button type="button" className="rs-comp-valor" disabled={!f.clipsRival?.length && !f.eventos}
                    onClick={() => (f.clipsRival?.length ? onAbrir(`${f.titulo} · ${nombreDeClave(rival, equipos)}`, f.clipsRival)
                      : f.eventos && onAbrir(f.titulo, f.eventos.filter((e) => e.equipo === 'rival').map((e) => clipDeEventoPartido(e, analisis.id, textoEvento(e)))))}>
                    {f.rival}{f.sufijo || ''}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="ev-nota">Solo datos que hay para los dos equipos (los momentos del otro salen del espejo).</p>
        </div>
      )}

      <div className="rs-bloque">
        <h3>Momentos colectivos</h3>
        {[nuestro, rival].map((clave) => {
          const grupos = colectivosDe(clave)
          return (
            <div key={clave}>
              <p className="ev-nota"><strong>{nombreDeClave(clave, equipos)}</strong></p>
              {grupos.length ? (
                <ul className="rs-colectivos">
                  {grupos.map((g) => (
                    <li key={g.tipo}>
                      <button type="button" onClick={() => onAbrir(`${etiqueta(g.tipo)} · ${nombreDeClave(clave, equipos)}`, g.clips)}>
                        <strong>{etiqueta(g.tipo)}: {g.cantidad}</strong>
                        <small>{textoDuracion(g.total)} en total</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="ev-nota">Sin momentos.</p>}
            </div>
          )
        })}
      </div>

      <div className="rs-bloque">
        <h3>Goles, cambios y tarjetas</h3>
        {eventosLinea.length ? (
          <ol className="rs-linea">
            {eventosLinea.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => abrirEvento(e)}>
                  <span className="rs-linea-min">{e.minuto || 'sin minuto'}</span>
                  <span className="rs-icono" aria-hidden="true" data-tarjeta={e.tarjeta || undefined}>{e.tipo === 'gol' ? '⚽' : e.tipo === 'tarjeta' ? '■' : '⇄'}</span>
                  <span>{textoEvento(e)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="ev-nota">Todavía no hay goles, cambios ni tarjetas marcados (pestaña Partido).</p>}
      </div>

      {!scouting && (
        <div className="rs-bloque">
          <h3>Jugadoras destacadas</h3>
          {top.length ? (
            <ol className="rs-destacadas">
              {top.map((t) => (
                <li key={t.jugadoraId}>
                  <button type="button" onClick={() => onAbrir(`Acciones · ${nombreJug(t.jugadoraId)}`, t.clips)}>
                    <strong>{nombreJug(t.jugadoraId)}{t.minutos != null ? ` · ${t.minutos}'` : ''}</strong>
                    <span>
                      {[t.goles.length ? `${t.goles.length} ${t.goles.length === 1 ? 'gol' : 'goles'}` : '', t.remates.length ? `${t.remates.length} remates` : '',
                        t.recuperaciones.length ? `${t.recuperaciones.length} recuperaciones` : '', `${t.clips.length} acciones`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="ev-nota">Sin acciones individuales cargadas.</p>}
        </div>
      )}
    </section>
  )
}
