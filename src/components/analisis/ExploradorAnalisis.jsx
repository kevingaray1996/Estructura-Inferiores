import { useMemo } from 'react'
import { ANALISIS as A, textoAnalisis } from '../../appearance/analisis'
import { zonaEvento as zonaEfectivaEvento } from '../../utils/orientacionAnalisis'
import { esPase, ESTADOS_DESTINATARIA } from '../../utils/destinatariasPases'
import { etiquetaDe } from '../../utils/analisis/catalogoAcciones'
import { AMARILLO, CLASE_CAMPO, ESTILO_CAMPO } from '../../utils/analisis/estilos'
import { fechaLegible, formatearTiempo, nombreJugadora, videoCalendario, youtubeEmbed } from '../../utils/analisis/formato'
import DetalleDestinatariaPase from '../DetalleDestinatariaPase'
import { Boton, Campo, Panel } from './PiezasAnalisis'

// Los filtros viven en AnalisisSection para que se conserven al cambiar de pestaña.
export default function ExploradorAnalisis({
  eventos, partidos, jugadoras, catalogo, catalogoAcciones, filtros, cambiarFiltro,
  resumenDestinatarias, onReintentarDestinatarias, puedeEditarDestinatarias, escrituraAutorizada,
  paseDestinataria, onEditarDestinataria, onCerrarDestinataria, onDestinatariaGuardada, onVideo,
}) {
  const eventosExplorador = useMemo(() => {
    const desde = filtros.minutoDesde === ''
      ? null
      : Number(filtros.minutoDesde) * 60
    const hasta = filtros.minutoHasta === ''
      ? null
      : (Number(filtros.minutoHasta) + 1) * 60 - 1

    return eventos
      .filter((evento) => {
        const partido = partidos.find((p) => p.id === evento.partido_id)
        return (
          (filtros.partido === 'todos' || evento.partido_id === filtros.partido) &&
          (filtros.jugadora === 'todos' || evento.jugador_id === filtros.jugadora) &&
          (filtros.tipo === 'todos' || evento.tipo === filtros.tipo) &&
          (filtros.resultado === 'todos' ||
            (filtros.resultado === 'Pendiente' ? !evento.resultado : evento.resultado === filtros.resultado)) &&
          (filtros.zona === 'todos' || zonaEfectivaEvento(evento) === filtros.zona) &&
          (desde === null || Number(evento.segundo) >= desde) &&
          (hasta === null || Number(evento.segundo) <= hasta) &&
          Boolean(partido)
        )
      })
      .sort((a, b) => {
        const partidoA = partidos.find((p) => p.id === a.partido_id)
        const partidoB = partidos.find((p) => p.id === b.partido_id)
        const fechaA = partidoA?.fecha || ''
        const fechaB = partidoB?.fecha || ''
        return fechaB.localeCompare(fechaA) || Number(a.segundo) - Number(b.segundo)
      })
  }, [eventos, partidos, filtros])

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: textoAnalisis(AMARILLO) }}>
            BIBLIOTECA DE JUGADAS
          </p>
          <h2 className="mt-1 text-xl font-black">Explorador de acciones</h2>
          <p className="mt-1 text-sm" style={{ color: A.secundario }}>
            Buscá acciones de todos los partidos analizados y abrí el video directamente en el momento registrado.
          </p>
        </div>
        <span className="rounded-lg px-3 py-2 text-sm font-black" style={{ backgroundColor: A.fondo, color: textoAnalisis(AMARILLO) }}>
          {eventosExplorador.length} resultados
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Partido / rival">
          <select className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.partido} onChange={(e) => cambiarFiltro.partido(e.target.value)}>
            <option value="todos">Todos los partidos</option>
            {partidos.map((p) => (
              <option key={p.id} value={p.id}>{p.rival} · {fechaLegible(p.fecha)}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Jugadora">
          <select className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.jugadora} onChange={(e) => cambiarFiltro.jugadora(e.target.value)}>
            <option value="todos">Todas las jugadoras</option>
            {jugadoras.map((j) => <option key={j.id} value={j.id}>{nombreJugadora(j)}</option>)}
          </select>
        </Campo>
        <Campo label="Tipo de acción">
          <select className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.tipo} onChange={(e) => cambiarFiltro.tipo(e.target.value)}>
            <option value="todos">Todos los tipos</option>
            {catalogoAcciones.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </Campo>
        <Campo label="Resultado">
          <select className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.resultado} onChange={(e) => cambiarFiltro.resultado(e.target.value)}>
            <option value="todos">Todos los resultados</option>
            <option value="Pendiente">Pendientes</option>
            {catalogo.resultados.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Campo>
        <Campo label="Zona de cancha">
          <select className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.zona} onChange={(e) => cambiarFiltro.zona(e.target.value)}>
            <option value="todos">Todas las zonas</option>
            {catalogo.zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Minuto desde">
            <input type="number" min="0" className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.minutoDesde} onChange={(e) => cambiarFiltro.minutoDesde(e.target.value)} placeholder="Ej. 0" />
          </Campo>
          <Campo label="Minuto hasta">
            <input type="number" min="0" className={CLASE_CAMPO} style={ESTILO_CAMPO} value={filtros.minutoHasta} onChange={(e) => cambiarFiltro.minutoHasta(e.target.value)} placeholder="Ej. 90" />
          </Campo>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Boton secundario onClick={() => {
          cambiarFiltro.partido('todos')
          cambiarFiltro.jugadora('todos')
          cambiarFiltro.tipo('todos')
          cambiarFiltro.resultado('todos')
          cambiarFiltro.zona('todos')
          cambiarFiltro.minutoDesde('')
          cambiarFiltro.minutoHasta('')
        }}>Limpiar filtros</Boton>
      </div>

      {resumenDestinatarias.error && <p role="alert" className="mt-3 text-sm text-red-300">
        {resumenDestinatarias.error}{' '}
        <button type="button" className="font-bold underline" onClick={onReintentarDestinatarias}>Reintentar</button>
      </p>}
      <div className="mt-5 overflow-x-auto rounded-lg border" style={{ borderColor: A.borde }}>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead style={{ backgroundColor: A.fondo, color: A.secundario }}>
            <tr>
              <th className="p-3">Video</th>
              <th className="p-3">Partido</th>
              <th className="p-3">Jugadora</th>
              <th className="p-3">Acción</th>
              <th className="p-3">Zona</th>
              <th className="p-3">Resultado</th>
              <th className="p-3">Destinataria</th>
            </tr>
          </thead>
          <tbody>
            {eventosExplorador.map((ev) => {
              const partido = partidos.find((p) => p.id === ev.partido_id)
              const jugadora = jugadoras.find((j) => j.id === ev.jugador_id)
              const accion = catalogo.tiposRapidos.find((a) => a.nombre === ev.tipo)
              return (
                <tr key={ev.id} className="border-t" style={{ borderColor: A.borde }}>
                  <td className="p-3">
                    <button type="button" disabled={!youtubeEmbed(partido?.video_url || videoCalendario(partido?.partido_calendario))} className="rounded-md px-3 py-2 font-mono font-black disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: A.activo, color: textoAnalisis(AMARILLO) }}
                      title={youtubeEmbed(partido?.video_url || videoCalendario(partido?.partido_calendario)) ? 'Abrir el video en este momento' : 'Este partido no tiene un video válido'}
                      onClick={() => onVideo(ev)}>
                      {formatearTiempo(ev.segundo)}
                    </button>
                  </td>
                  <td className="p-3">
                    <span className="block font-bold">{partido?.rival || 'Partido sin nombre'}</span>
                    <span className="text-xs" style={{ color: A.secundario }}>{fechaLegible(partido?.fecha)}</span>
                  </td>
                  <td className="p-3">{jugadora ? nombreJugadora(jugadora) : 'Sin jugadora'}</td>
                  <td className="p-3 font-bold" style={{ color: textoAnalisis(accion?.color || A.texto) }}>{etiquetaDe(catalogoAcciones, ev.tipo)}</td>
                  <td className="p-3">{ev.zona || '—'}</td>
                  <td className="p-3">
                    <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ backgroundColor: ev.resultado ? A.control : A.seleccion, color: textoAnalisis(ev.resultado ? A.texto : AMARILLO) }}>
                      {ev.resultado || 'Pendiente'}
                    </span>
                  </td>
                  <td className="p-3">
                    {esPase(ev) ? <>
                      <span className="block text-sm">
                        {resumenDestinatarias.cargando ? 'Cargando…' : resumenDestinatarias.error ? 'No disponible' :
                          resumenDestinatarias.detalles[ev.id]?.destinataria_estado === 'identificada'
                            ? resumenDestinatarias.nombres[resumenDestinatarias.detalles[ev.id].destinataria_id] || 'Jugadora no disponible'
                            : ESTADOS_DESTINATARIA[resumenDestinatarias.detalles[ev.id]?.destinataria_estado || 'pendiente']}
                      </span>
                      {puedeEditarDestinatarias && <button type="button"
                        disabled={resumenDestinatarias.cargando}
                        onClick={() => onEditarDestinataria(ev)}
                        className="mt-2 text-xs font-bold text-yellow-300 disabled:opacity-40">Editar destinataria</button>}
                    </> : <span style={{ color: A.secundario }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {eventosExplorador.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: A.secundario }}>
            No hay acciones que coincidan con los filtros seleccionados.
          </p>
        )}
      </div>
      <p className="mt-3 text-xs" style={{ color: A.secundario }}>
        Los minutos se calculan a partir del segundo guardado en cada acción. Las acciones sin zona o resultado también aparecen y se pueden revisar.
      </p>
      {paseDestinataria && puedeEditarDestinatarias && <DetalleDestinatariaPase puedeEditar={escrituraAutorizada}
        key={paseDestinataria.id}
        evento={paseDestinataria}
        etiquetaTipo={etiquetaDe(catalogoAcciones, paseDestinataria.tipo)}
        partido={partidos.find((p) => p.id === paseDestinataria.partido_id)}
        autora={nombreJugadora(jugadoras.find((j) => j.id === paseDestinataria.jugador_id))}
        onClose={onCerrarDestinataria}
        onVideo={onVideo}
        onSaved={onDestinatariaGuardada}
      />}
    </Panel>
  )
}
