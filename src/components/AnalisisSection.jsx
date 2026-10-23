
              <div className="mt-6">
                <h3 className="mb-3 font-bold">Resumen por acción</h3>
                {estadisticas.length ? (
                  <ul className="space-y-2 text-sm">
                    {estadisticas.map(([nombre, datos]) => (
                      <li
                        key={nombre}
                        className="flex justify-between gap-3 border-b pb-2"
                        style={{ borderColor: BORDE }}
                      >
                        <span>{nombre}</span>
                        <span className="font-bold">{datos.total}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    No hay información suficiente para generar el resumen.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <h3 className="mb-3 font-bold">Detalle de acciones</h3>
                {eventosPartido.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead>
                        <tr style={{ color: SECUNDARIO }}>
                          <th className="p-2">Tiempo</th>
                          <th className="p-2">Acción</th>
                          <th className="p-2">Jugadora</th>
                          <th className="p-2">Zona</th>
                          <th className="p-2">Resultado</th>
                          <th className="p-2">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...eventosPartido]
                          .sort((a, b) => Number(a.segundo) - Number(b.segundo))
                          .map((ev) => (
                            <tr
                              key={ev.id}
                              className="border-t"
                              style={{ borderColor: BORDE }}
                            >
                              <td className="p-2 font-mono">
                                {formatearTiempo(ev.segundo)}
                              </td>
                              <td className="p-2">{ev.tipo}</td>
                              <td className="p-2">
                                {nombreJugadora(
                                  jugadoras.find((j) => j.id === ev.jugador_id),
                                )}
                              </td>
                              <td className="p-2">{ev.zona || '—'}</td>
                              <td className="p-2">{ev.resultado || 'Pendiente'}</td>
                              <td className="p-2">{ev.observaciones || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Todavía no hay acciones registradas.
                  </p>
                )}
              </div>

              {partidoActual.notas && (
                <div className="mt-6">
                  <h3 className="mb-2 font-bold">Observaciones generales</h3>
                  <p className="whitespace-pre-wrap text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.notas}
                  </p>
                </div>
              )}

              <p className="mt-5 text-xs" style={{ color: SECUNDARIO }}>
                El informe utiliza los eventos guardados en la base de datos.
                Podés imprimirlo o guardarlo como PDF desde el navegador.
              </p>
            </Panel>
          )}
        </>
      )}

      <footer
        className="border-t pt-4 text-xs"
        style={{ borderColor: BORDE, color: SECUNDARIO }}
      >
        {esAdmin
          ? 'Administrador: Kevin Garay · Gestión de análisis'
          : 'Modo consulta · Los cambios están restringidos'}
      </footer>

      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          button, nav, iframe, summary {
            display: none !important;
          }
          section, article {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
