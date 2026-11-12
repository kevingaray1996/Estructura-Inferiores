import { useMemo } from 'react'
import { ANALISIS as A, textoAnalisis } from '../../appearance/analisis'
import { AMARILLO } from '../../utils/analisis/estilos'
import { datosEncuentro, nombreJugadora } from '../../utils/analisis/formato'
import { etiquetaDe } from '../../utils/analisis/catalogoAcciones'
import { Panel } from './PiezasAnalisis'

// El alcance vive en AnalisisSection para que se conserve al cambiar de pestaña.
export default function EstadisticasAnalisis({ alcance, cambiarAlcance, catalogoAcciones, partidoActual, partidos, eventos, eventosPartido, jugadoras }) {
  const eventosEstadisticos = useMemo(
    () => alcance === 'acumulado' ? eventos : eventosPartido,
    [alcance, eventos, eventosPartido],
  )

  const estadisticas = useMemo(() => {
    const acumulado = {}

    for (const evento of eventosEstadisticos) {
      if (!acumulado[evento.tipo]) {
        acumulado[evento.tipo] = {
          total: 0,
          exitosos: 0,
          fallidos: 0,
          pendientes: 0,
          neutros: 0,
        }
      }

      acumulado[evento.tipo].total += 1

      if (['Exitoso', 'Gol', 'Atajada'].includes(evento.resultado)) {
        acumulado[evento.tipo].exitosos += 1
      }

      if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento.resultado)) {
        acumulado[evento.tipo].fallidos += 1
      }

      if (!evento.resultado) {
        acumulado[evento.tipo].pendientes += 1
      }
      if (evento.resultado === 'Neutro') acumulado[evento.tipo].neutros += 1
    }

    return Object.entries(acumulado).sort(
      (a, b) => b[1].total - a[1].total,
    )
  }, [eventosEstadisticos])

  const estadisticasJugadoras = useMemo(() => {
    const acumulado = {}

    for (const evento of eventosEstadisticos) {
      if (!evento.jugador_id) continue

      if (!acumulado[evento.jugador_id]) {
        acumulado[evento.jugador_id] = { total: 0, tipos: {} }
      }

      acumulado[evento.jugador_id].total += 1
      acumulado[evento.jugador_id].tipos[evento.tipo] =
        (acumulado[evento.jugador_id].tipos[evento.tipo] || 0) + 1
    }

    return Object.entries(acumulado)
      .map(([id, datos]) => {
        const jugadora = jugadoras.find((j) => j.id === id)

        return {
          id,
          ...datos,
          nombre: nombreJugadora(jugadora),
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [eventosEstadisticos, jugadoras])

  const resumenEfectividad = useMemo(() => {
    const exitosas = eventosEstadisticos.filter((e) => ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length
    const fallidas = eventosEstadisticos.filter((e) => ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length
    const evaluadas = exitosas + fallidas
    const pendientes = eventosEstadisticos.filter((e) => !e.resultado).length
    const neutros = eventosEstadisticos.filter((e) => e.resultado === 'Neutro').length
    const conUbicacionExacta = eventosEstadisticos.filter((e) => Number.isFinite(Number(e.coordenada_x)) && Number.isFinite(Number(e.coordenada_y)) && e.coordenada_x !== null && e.coordenada_y !== null).length
    return {
      exitosas,
      fallidas,
      evaluadas,
      pendientes,
      neutros,
      porcentaje: evaluadas ? Math.round((exitosas / evaluadas) * 100) : 0,
      conUbicacionExacta,
    }
  }, [eventosEstadisticos])

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Estadísticas</h2>
          <p className="mt-1 text-sm" style={{ color: A.secundario }}>
            {alcance === 'partido'
              ? `Partido seleccionado · ${partidoActual?.rival || 'Sin rival'}`
              : `Acumulado de ${partidos.length} partidos registrados`}
          </p>
          {alcance === 'partido' && partidoActual && (
            <p className="mt-1 text-xs" style={{ color: A.secundario }}>
              {datosEncuentro(partidoActual)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Alcance de estadísticas">
          <button
            type="button"
            onClick={() => cambiarAlcance('partido')}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
            style={alcance === 'partido'
              ? { backgroundColor: 'var(--ui-acento)', color: 'var(--ui-texto-sobre-acento)', borderColor: 'var(--ui-acento)' }
              : { backgroundColor: A.fondo, color: A.texto, borderColor: A.borde }}
          >Partido seleccionado</button>
          <button
            type="button"
            onClick={() => cambiarAlcance('acumulado')}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
            style={alcance === 'acumulado'
              ? { backgroundColor: 'var(--ui-acento)', color: 'var(--ui-texto-sobre-acento)', borderColor: 'var(--ui-acento)' }
              : { backgroundColor: A.fondo, color: A.texto, borderColor: A.borde }}
          >Todos los partidos</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Acciones totales', eventosEstadisticos.length],
          ['Efectivas', resumenEfectividad.exitosas],
          ['No efectivas', resumenEfectividad.fallidas],
          ['Efectividad', resumenEfectividad.evaluadas ? `${resumenEfectividad.porcentaje}%` : '—'],
          ['Neutras', resumenEfectividad.neutros],
          ['Pendientes', resumenEfectividad.pendientes],
        ].map(([label, valor]) => (
          <div
            key={label}
            className="rounded-lg border p-4"
            style={{ backgroundColor: A.fondo, borderColor: A.borde }}
          >
            <p className="min-h-10 text-sm" style={{ color: A.secundario }}>{label}</p>
            <p className="mt-2 text-3xl font-black" style={{ color: textoAnalisis(AMARILLO) }}>
              {valor}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border p-3 text-sm" style={{ backgroundColor: A.fondo, borderColor: A.borde }}>
        <span style={{ color: A.secundario }}>Partidos incluidos: <strong style={{ color: A.texto }}>{alcance === 'partido' ? (partidoActual ? 1 : 0) : partidos.length}</strong></span>
        <span style={{ color: A.secundario }}>Acciones sin jugadora asignada: <strong style={{ color: A.texto }}>{eventosEstadisticos.filter((e) => !e.jugador_id).length}</strong></span>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-bold">Rendimiento colectivo · acciones por tipo</h3>
        {estadisticas.length === 0 ? (
          <p className="text-sm" style={{ color: A.secundario }}>
            Todavía no hay acciones etiquetadas.
          </p>
        ) : (
          <div className="space-y-4">
            {estadisticas.map(([nombre, datos]) => {
              const maximo = Math.max(
                1,
                ...estadisticas.map(([, d]) => d.total),
              )

              return (
                <div key={nombre}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{etiquetaDe(catalogoAcciones, nombre)}</span>
                    <span className="font-bold">{datos.total}</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full"
                    style={{ backgroundColor: A.activo }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: AMARILLO,
                        width: `${(datos.total / maximo) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs" style={{ color: A.secundario }}>
                    Exitosos: {datos.exitosos} · Fallidos: {datos.fallidos}
                    {' · '}Neutros: {datos.neutros}
                    {' · '}Pendientes: {datos.pendientes}
                    {' · '}Efectividad: {datos.exitosos + datos.fallidos > 0
                      ? `${Math.round((datos.exitosos / (datos.exitosos + datos.fallidos)) * 100)}%`
                      : 'Sin evaluar'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-7">
        <h3 className="mb-3 font-bold">Rendimiento individual · acciones por jugadora</h3>
        {estadisticasJugadoras.length === 0 ? (
          <p className="text-sm" style={{ color: A.secundario }}>
            No hay acciones asignadas a jugadoras.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead>
                <tr style={{ color: A.secundario }}>
                  <th className="p-2">Jugadora</th>
                  <th className="p-2">Acciones</th>
                  <th className="p-2">Efectivas</th>
                  <th className="p-2">No efectivas</th>
                  <th className="p-2">Neutras</th>
                  <th className="p-2">Pendientes</th>
                  <th className="p-2">Efectividad</th>
                  <th className="p-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {estadisticasJugadoras.map((j) => (
                  <tr
                    key={j.id}
                    className="border-t"
                    style={{ borderColor: A.borde }}
                  >
                    <td className="p-2 font-bold">{j.nombre}</td>
                    <td className="p-2">{j.total}</td>
                    <td className="p-2 text-emerald-300">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length}</td>
                    <td className="p-2 text-red-300">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length}</td>
                    <td className="p-2">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && e.resultado === 'Neutro').length}</td>
                    <td className="p-2">{eventosEstadisticos.filter((e) => e.jugador_id === j.id && !e.resultado).length}</td>
                    <td className="p-2">{(() => {
                      const positivas = eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Exitoso', 'Gol', 'Atajada'].includes(e.resultado)).length
                      const negativas = eventosEstadisticos.filter((e) => e.jugador_id === j.id && ['Fallido', 'Fuera', 'Bloqueado'].includes(e.resultado)).length
                      return positivas + negativas ? `${Math.round((positivas / (positivas + negativas)) * 100)}%` : '—'
                    })()}</td>
                    <td className="p-2">
                      {Object.entries(j.tipos)
                        .map(([t, n]) => `${etiquetaDe(catalogoAcciones, t)}: ${n}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}
