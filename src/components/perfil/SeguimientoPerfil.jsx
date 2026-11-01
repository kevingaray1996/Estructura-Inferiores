import MiniBarras from './MiniBarrasPerfil'
import { COLORES, formatearFecha } from './presentacionPerfil'
import { CAMPOS_FISICOS } from '../../utils/camposFisicos'
import { textoPlantel } from '../../appearance/plantel'
import FuentePerfil from './FuentePerfil'
import EstadoContenido from '../ui/EstadoContenido'
export default function SeguimientoPerfil({ resumenBienestar, disciplinas, totalAsistenciaMarcada, resumenAsistencia, sesionesFisicas, datosDistanciaChart, sesionFisicaSeleccionadaId, idSesionFisicaPorDefecto, setSesionFisicaSeleccionadaId, sesionFisicaSeleccionada, fuentes, puedeWellness, puedeFisico }) { return <div className="perfil-seguimiento">
<FuentePerfil fuente={fuentes.wellness} permitido={puedeWellness} titulo="Wellness semanal">
        {/* Bienestar semanal: se conserva el diseño existente */}
        {resumenBienestar && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs tracking-widest uppercase" style={{ color: textoPlantel(COLORES.amarillo) }}>
                Bienestar · últimos 7 días
              </p>

            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-8">
              {resumenBienestar.map((m) => {
                const colorTendencia =
                  m.tendencia === null
                    ? COLORES.tenue
                    : m.tendencia === 'estable'
                      ? COLORES.secundario
                      : m.clave === 'rpe'
                        ? '#FBBF24'
                        : m.tendencia === 'sube'
                          ? '#F87171'
                          : '#4ADE80'

                const flecha =
                  m.tendencia === 'sube'
                    ? '↑'
                    : m.tendencia === 'baja'
                      ? '↓'
                      : m.tendencia === 'estable'
                        ? '→'
                        : ''

                const tieneComparacion =
                  m.promedioActual !== null &&
                  m.promedioActual !== undefined &&
                  m.promedioAnterior !== null &&
                  m.promedioAnterior !== undefined

                return (
                  <div key={m.clave} className="p-3 rounded-xl text-center" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                    <p className="text-lg font-mono" style={{ color: COLORES.texto }}>
                      {m.promedioActual !== null && m.promedioActual !== undefined ? m.promedioActual.toFixed(1) : '—'}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORES.secundario }}>
                      {m.label}
                    </p>
                    {flecha && tieneComparacion && (
                      <p className="text-xs" style={{ color: textoPlantel(colorTendencia) }}>
                        {flecha} {Math.abs(m.promedioActual - m.promedioAnterior).toFixed(1)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

{resumenBienestar && !resumenBienestar.some(m => m.promedioActual != null) && <EstadoContenido estado="vacio" titulo="Sin respuestas en la semana" mensaje="Los valores ausentes no indican bienestar normal." />}
</FuentePerfil>
        {/* Áreas: se conserva el diseño existente */}
        <p className="text-xs tracking-widest uppercase mb-3" style={{ color: textoPlantel(COLORES.amarillo) }}>
          Áreas
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {disciplinas.map((d) => (
            <button
              type="button"
              key={d.nombre}
              onClick={d.onClick}
              className="p-4 rounded-xl text-left hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
            >
              <p className="text-2xl mb-2">{d.icono}</p>
              <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                {d.nombre}
              </p>
              <p className="text-xs mt-1" style={{ color: d.resumen === 'Sin datos cargados' ? COLORES.tenue : textoPlantel(COLORES.amarillo) }}>
                {d.resumen}
              </p>
              {d.detalle && (
                <p className="text-xs mt-1 truncate" style={{ color: COLORES.secundario }}>
                  {d.detalle}
                </p>
              )}
            </button>
          ))}
        </div>


<FuentePerfil fuente={fuentes.asistencias} titulo="Asistencia">
        {/* Asistencia */}
        {totalAsistenciaMarcada > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: textoPlantel(COLORES.amarillo) }}>
              Asistencia
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: 'Presentes', valor: resumenAsistencia.presente, color: '#4ADE80' },
                { label: 'Tardes', valor: resumenAsistencia.tarde, color: '#FBBF24' },
                { label: 'Ausentes', valor: resumenAsistencia.ausente, color: '#F87171' },
                { label: 'Lesionadas', valor: resumenAsistencia.lesionado, color: '#FB923C' },
                { label: 'Enfermas', valor: resumenAsistencia.enfermo, color: '#7DD3FC' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                  <p className="text-xl font-bold" style={{ color: textoPlantel(item.color) }}>{item.valor}</p>
                  <p className="text-xs" style={{ color: COLORES.secundario }}>{item.label}</p>
                </div>
              ))}
            </div>
          </>
        )}

{totalAsistenciaMarcada === 0 && <EstadoContenido estado="vacio" titulo="Sin asistencia registrada" />}
</FuentePerfil>
<FuentePerfil fuente={fuentes.fisicos} permitido={puedeFisico} titulo="Sesiones físicas y RPE">
        {/* Físico / GPS */}
        {sesionesFisicas.length > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: textoPlantel(COLORES.amarillo) }}>
              Físico · GPS
            </p>

            <div className="p-4 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
              {datosDistanciaChart.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: COLORES.secundario }}>
                    Distancia total (m) · últimas sesiones
                  </p>
                  <div className="overflow-x-auto mb-4">
                    <MiniBarras datos={datosDistanciaChart} color={textoPlantel(COLORES.amarillo)} />
                  </div>
                </>
              )}

              <label className="text-[10px] uppercase tracking-wide block mb-2" style={{ color: COLORES.secundario }}>
                Ver sesión
              </label>

              <select
                value={sesionFisicaSeleccionadaId || idSesionFisicaPorDefecto || ''}
                onChange={(e) => setSesionFisicaSeleccionadaId(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm mb-3"
                style={{ backgroundColor: COLORES.fondo, border: `1px solid ${COLORES.borde}`, color: COLORES.texto }}
              >
                {sesionesFisicas.slice().reverse().map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatearFecha(s.fecha)}
                    {s.partidos ? ` · vs ${s.partidos.rival}` : s.tipo === 'partido' ? ' · Partido' : ' · Entrenamiento'}
                  </option>
                ))}
              </select>

              {sesionFisicaSeleccionada && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg" style={{ backgroundColor: COLORES.fondo }}>
                  {CAMPOS_FISICOS.map((campo) => (
                    <div key={campo.clave}>
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: COLORES.secundario }}>
                        {campo.label}
                      </p>
                      <p className="text-sm" style={{ color: COLORES.texto }}>
                        {sesionFisicaSeleccionada[campo.clave] ?? '—'}
                      </p>
                    </div>
                  ))}

                  <div>
                    <p className="text-[9px] uppercase tracking-wide" style={{ color: textoPlantel(COLORES.amarillo) }}>
                      RPE (1-10)
                    </p>
                    <p className="text-sm" style={{ color: COLORES.texto }}>
                      {sesionFisicaSeleccionada.rpe ?? '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

{sesionesFisicas.length === 0 && <EstadoContenido estado="vacio" titulo="Sin sesiones físicas registradas" />}
</FuentePerfil>
</div> }
