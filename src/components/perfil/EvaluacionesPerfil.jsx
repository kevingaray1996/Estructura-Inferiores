import { COLORES, nombrePeriodo, calcularResumenEvaluacion, valorPuntaje, recomendacionLabel } from './presentacionPerfil'
import { textoPlantel } from '../../appearance/plantel'
import EncabezadoSeccion from '../ui/EncabezadoSeccion'
import TarjetaIndicador from '../ui/TarjetaIndicador'
export default function EvaluacionesPerfil({ evaluacionesCargando, evaluacionesError, evaluacionesPorPeriodo, criteriosEvaluacion, mostrarEvaluaciones, setMostrarEvaluaciones, periodoAbierto, setPeriodoAbierto }) {
const periodoActivo = periodoAbierto ?? evaluacionesPorPeriodo[0]?.periodo ?? ''
const seleccionada = evaluacionesPorPeriodo.find(g => g.periodo === periodoActivo)
const resumenSeleccionado = seleccionada ? calcularResumenEvaluacion(seleccionada.evaluaciones, criteriosEvaluacion) : null
return <div className="perfil-evaluaciones"><EncabezadoSeccion titulo="Evaluaciones del cuerpo técnico" descripcion="Períodos mensuales y finales; cada evaluador conserva su registro." nivel={2} />
<label className="perfil-selector-periodo">Período de evaluación<select value={periodoActivo} onChange={e => { setPeriodoAbierto(e.target.value); setMostrarEvaluaciones(true) }}><option value="">Seleccionar un período</option>{evaluacionesPorPeriodo.map(g => <option key={g.periodo} value={g.periodo}>{nombrePeriodo(g.periodo, g.tipo)}</option>)}</select></label>
{seleccionada && <div className="perfil-evaluacion-resumen"><div><h3>{nombrePeriodo(seleccionada.periodo, seleccionada.tipo)}</h3><p>{seleccionada.evaluaciones.length} evaluador{seleccionada.evaluaciones.length !== 1 ? 'es' : ''} · {seleccionada.tipo === 'final' ? 'Final de temporada' : 'Evaluación mensual'}</p></div><TarjetaIndicador etiqueta="Promedio general / 5" valor={resumenSeleccionado.general == null ? null : resumenSeleccionado.general.toFixed(1)} /></div>}
        {/* Historial de evaluaciones desplegable */}
        <section className="mb-8">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: COLORES.tarjeta,
              border: `1px solid ${mostrarEvaluaciones ? COLORES.amarillo : COLORES.borde}`,
            }}
          >
            <button
              type="button"
              aria-expanded={mostrarEvaluaciones}
              onClick={() => setMostrarEvaluaciones((actual) => !actual)}
              className="w-full text-left p-4 flex items-center gap-3"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: COLORES.amarilloOscuro, color: textoPlantel(COLORES.amarillo) }}
              >
                ▤
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs tracking-widest uppercase mb-1" style={{ color: textoPlantel(COLORES.amarillo) }}>
                  Seguimiento del cuerpo técnico
                </p>
                <h2 className="text-lg font-bold" style={{ color: COLORES.texto }}>
                  Evaluaciones
                </h2>
                <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                  {evaluacionesCargando
                    ? 'Cargando historial...'
                    : `${evaluacionesPorPeriodo.length} período${evaluacionesPorPeriodo.length !== 1 ? 's' : ''} registrado${evaluacionesPorPeriodo.length !== 1 ? 's' : ''}`}
                </p>
              </div>

              <span className="text-xl" style={{ color: textoPlantel(COLORES.amarillo) }}>
                {mostrarEvaluaciones ? '−' : '+'}
              </span>
            </button>

            {mostrarEvaluaciones && (
              <div className="p-4 space-y-3" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
                {evaluacionesCargando ? (
                  <p className="text-sm" style={{ color: COLORES.secundario }}>
                    Cargando historial de evaluaciones...
                  </p>
                ) : evaluacionesError ? (
                  <p className="text-sm" style={{ color: "var(--plantel-aviso, #FBBF24)" }}>
                    {evaluacionesError}
                  </p>
                ) : evaluacionesPorPeriodo.length === 0 ? (
                  <div className="p-3 rounded-xl" style={{ backgroundColor: COLORES.fondo }}>
                    <p className="text-sm font-semibold" style={{ color: COLORES.texto }}>
                      Todavía no hay evaluaciones registradas
                    </p>
                    <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                      Cuando el cuerpo técnico guarde una evaluación mensual o final, aparecerá en este historial.
                    </p>
                  </div>
                ) : (
                  evaluacionesPorPeriodo.map((grupo) => {
                    const abierto = periodoActivo === grupo.periodo
                    const resumen = calcularResumenEvaluacion(grupo.evaluaciones, criteriosEvaluacion)
                    const esFinal = grupo.tipo === 'final' || grupo.periodo.startsWith('final-')

                    return (
                      <article
                        key={grupo.periodo}
                        className="rounded-xl overflow-hidden"
                        style={{
                          backgroundColor: COLORES.fondo,
                          border: `1px solid ${abierto ? COLORES.amarillo : COLORES.borde}`,
                        }}
                      >
                        <button
                          type="button"
                          aria-expanded={abierto}
                          onClick={() => setPeriodoAbierto(abierto ? '' : grupo.periodo)}
                          className="w-full text-left p-4 flex items-center gap-3"
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                            style={{ backgroundColor: COLORES.amarilloOscuro, color: textoPlantel(COLORES.amarillo) }}
                          >
                            {esFinal ? '★' : '▤'}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm" style={{ color: COLORES.texto }}>
                              {esFinal
                                ? `Evaluación final · ${nombrePeriodo(grupo.periodo, grupo.tipo)}`
                                : nombrePeriodo(grupo.periodo, grupo.tipo)}
                            </p>
                            <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                              {grupo.evaluaciones.length} evaluador{grupo.evaluaciones.length !== 1 ? 'es' : ''}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-2xl font-bold" style={{ color: textoPlantel(COLORES.amarillo) }}>
                              {resumen.general === null ? '—' : resumen.general.toFixed(1)}
                            </p>
                            <p className="text-[10px]" style={{ color: COLORES.tenue }}>
                              Promedio / 5
                            </p>
                          </div>

                          <span className="text-lg ml-1" style={{ color: COLORES.secundario }}>
                            {abierto ? '−' : '+'}
                          </span>
                        </button>

                        {abierto && (
                          <div className="p-4 space-y-5" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
                            <div>
                              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: textoPlantel(COLORES.amarillo) }}>
                                Promedio por criterio
                              </p>

                              {resumen.porCriterio.length === 0 ? (
                                <p className="text-sm" style={{ color: COLORES.secundario }}>
                                  No hay criterios disponibles.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {resumen.porCriterio.map(({ criterio, promedio, cantidad }) => (
                                    <div key={criterio.id}>
                                      <div className="flex justify-between gap-3 mb-1">
                                        <span className="text-sm" style={{ color: COLORES.texto }}>
                                          {criterio.nombre}
                                        </span>
                                        <span className="text-sm font-semibold shrink-0" style={{ color: textoPlantel(COLORES.amarillo) }}>
                                          {promedio === null ? '—' : promedio.toFixed(1)}
                                        </span>
                                      </div>

                                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORES.borde }}>
                                        <div
                                          className="h-full rounded-full"
                                          style={{
                                            width: `${promedio === null ? 0 : (promedio / 5) * 100}%`,
                                            backgroundColor: COLORES.amarillo,
                                          }}
                                        />
                                      </div>

                                      <p className="text-[10px] mt-1" style={{ color: COLORES.tenue }}>
                                        {cantidad} puntuación{cantidad !== 1 ? 'es' : ''} válida{cantidad !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="text-xs tracking-widest uppercase mb-3" style={{ color: textoPlantel(COLORES.amarillo) }}>
                                Detalle por evaluador
                              </p>

                              <div className="space-y-3">
                                {grupo.evaluaciones.map((evaluacion, indice) => (
                                  <div
                                    key={evaluacion.id || `${evaluacion.evaluador_id}-${indice}`}
                                    className="rounded-xl p-4"
                                    style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                      <p className="text-sm font-semibold" style={{ color: COLORES.texto }}>
                                        {evaluacion.evaluador_nombre || 'Evaluador'}
                                      </p>
                                      <span
                                        className="text-[10px] px-2 py-1 rounded-full"
                                        style={{ backgroundColor: COLORES.fondo, color: COLORES.secundario }}
                                      >
                                        {esFinal ? 'Final de temporada' : 'Evaluación mensual'}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {criteriosEvaluacion.map((criterio) => (
                                        <div
                                          key={criterio.id}
                                          className="p-3 rounded-lg"
                                          style={{ backgroundColor: COLORES.fondo }}
                                        >
                                          <p className="text-xs mb-2" style={{ color: COLORES.secundario }}>
                                            {criterio.nombre}
                                          </p>

                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {[1, 2, 3, 4, 5].map((numero) => {
                                              const valor = evaluacion.puntajes?.[criterio.id]
                                              const activo = valor !== 'no_evaluo' && Number(valor) === numero

                                              return (
                                                <span
                                                  key={numero}
                                                  className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                                                  style={{
                                                    backgroundColor: activo ? COLORES.amarillo : COLORES.tarjeta,
                                                    color: activo ? '#111111' : COLORES.tenue,
                                                    border: `1px solid ${activo ? COLORES.amarillo : COLORES.borde}`,
                                                  }}
                                                >
                                                  {numero}
                                                </span>
                                              )
                                            })}

                                            <span className="text-xs ml-1" style={{ color: COLORES.secundario }}>
                                              {valorPuntaje(evaluacion.puntajes?.[criterio.id])}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {[
                                      ['Fortalezas', evaluacion.fortalezas],
                                      ['A mejorar', evaluacion.a_mejorar],
                                      ['Comentario', evaluacion.comentario],
                                      ['Proyección próxima temporada', evaluacion.proyeccion],
                                    ].map(([titulo, contenido]) => (
                                      contenido ? (
                                        <div key={titulo} className="mt-4">
                                          <p className="text-xs font-semibold mb-1" style={{ color: textoPlantel(COLORES.amarillo) }}>
                                            {titulo}
                                          </p>
                                          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: COLORES.secundario }}>
                                            {contenido}
                                          </p>
                                        </div>
                                      ) : null
                                    ))}

                                    {evaluacion.recomendacion && (
                                      <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
                                        <p className="text-xs mb-1" style={{ color: COLORES.secundario }}>
                                          Recomendación para la próxima temporada
                                        </p>
                                        <span
                                          className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full"
                                          style={{ backgroundColor: COLORES.amarilloOscuro, color: textoPlantel(COLORES.amarillo) }}
                                        >
                                          {recomendacionLabel[evaluacion.recomendacion] || evaluacion.recomendacion}
                                        </span>
                                      </div>
                                    )}

                                    {!evaluacion.fortalezas &&
                                      !evaluacion.a_mejorar &&
                                      !evaluacion.comentario &&
                                      !evaluacion.proyeccion &&
                                      !evaluacion.recomendacion && (
                                        <p className="text-xs mt-3" style={{ color: COLORES.tenue }}>
                                          No se agregaron comentarios para esta evaluación.
                                        </p>
                                      )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </section>


</div>
}
