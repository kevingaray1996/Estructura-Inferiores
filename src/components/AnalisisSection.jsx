                        backgroundColor:
                          z.total === 0
                            ? '#233A36'
                            : `rgba(242, 194, 48, ${0.18 + intensidad * 0.72})`,
                        color: z.total === 0 ? TEXTO : '#171717',
                      }}
                    >
                      <span className="text-xs font-semibold">{z.nombre}</span>
                      <span className="mt-2 text-2xl font-bold">{z.total}</span>
                      <span className="text-xs">acciones</span>
                    </div>
                  )
                })}
              </div>

              <p className="mt-4 text-xs" style={{ color: SECUNDARIO }}>
                Para que el mapa sea representativo, mantené el mismo criterio
                al etiquetar las zonas en todos los partidos.
              </p>
            </section>
          )}

          {seccion === 'informe' && (
            <section
              className="space-y-5 rounded-2xl border p-5"
              style={{ backgroundColor: PANEL, borderColor: BORDE }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Informe del partido</h2>
                  <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.rival} · {partidoActual.fecha || 'Sin fecha'}
                  </p>
                </div>
                <Boton onClick={imprimirInforme}>Imprimir / Guardar PDF</Boton>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: FONDO, borderColor: BORDE }}
                >
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Total de acciones
                  </p>
                  <p className="mt-1 text-3xl font-bold" style={{ color: AMARILLO }}>
                    {eventosPartido.length}
                  </p>
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: FONDO, borderColor: BORDE }}
                >
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Acciones con jugadora asignada
                  </p>
                  <p className="mt-1 text-3xl font-bold" style={{ color: AMARILLO }}>
                    {eventosPartido.filter((e) => e.jugador_id).length}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-bold">Resumen por acción</h3>
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

              {partidoActual.notas && (
                <div>
                  <h3 className="mb-2 font-bold">Observaciones generales</h3>
                  <p className="whitespace-pre-wrap text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.notas}
                  </p>
                </div>
              )}

              <p className="text-xs" style={{ color: SECUNDARIO }}>
                Este informe utiliza los eventos guardados en la base de datos.
                La impresión permite guardarlo como PDF desde el navegador.
              </p>
            </section>
          )}
        </>
      )}

      <footer className="border-t pt-4 text-xs" style={{ borderColor: BORDE, color: SECUNDARIO }}>
        {esAdmin
          ? 'Administrador: Kevin Garay · Gestión de análisis'
          : 'Modo consulta · Los cambios en los análisis están restringidos'}
      </footer>
    </div>
  )
}
