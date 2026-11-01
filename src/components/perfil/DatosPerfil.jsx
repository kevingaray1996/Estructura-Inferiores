import { COLORES, formatearFecha } from './presentacionPerfil'
import { textoPlantel } from '../../appearance/plantel'
import FuentePerfil from './FuentePerfil'
import EstadoContenido from '../ui/EstadoContenido'
export default function DatosPerfil({ datosPersonales, jugador, historialCategorias, fuenteHistorial, puedeMedico }) {
 return <div className="perfil-datos">
        {/* Datos personales desplegables */}
        <details
          className="mb-5 rounded-xl overflow-hidden"
          style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
        >
          <summary className="p-4 cursor-pointer flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold" style={{ color: COLORES.texto }}>
                Datos personales
              </span>
              <span className="block text-xs mt-1" style={{ color: COLORES.tenue }}>
                Información complementaria de la jugadora
              </span>
            </span>
            <span style={{ color: textoPlantel(COLORES.amarillo) }}>＋</span>
          </summary>

          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {datosPersonales.map((d) => (
              <div
                key={d.label}
                className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: COLORES.fondo, border: `1px solid ${COLORES.borde}` }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: COLORES.tenue }}>
                  {d.label}
                </p>
                <p className="text-sm" style={{ color: COLORES.texto }}>
                  {d.valor}
                  {d.extra && <span style={{ color: COLORES.secundario }}> · {d.extra}</span>}
                </p>
              </div>
            ))}
          </div>
        </details>

        {(jugador.contacto_emergencia_nombre || jugador.telefono_emergencia) && (
          <details
            className="mb-5 rounded-xl overflow-hidden"
            style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
          >
            <summary className="p-4 cursor-pointer flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: COLORES.texto }}>
                  Contacto de emergencia
                </span>
                <span className="block text-xs mt-1" style={{ color: COLORES.tenue }}>
                  Datos para situaciones de urgencia
                </span>
              </span>
              <span style={{ color: "var(--plantel-peligro, #F87171)" }}>＋</span>
            </summary>

            <div className="px-4 pb-4">
              {jugador.contacto_emergencia_nombre && (
                <p className="text-sm mb-2" style={{ color: COLORES.texto }}>
                  {jugador.contacto_emergencia_nombre}
                </p>
              )}

              {jugador.telefono_emergencia && (
                <a href={`tel:${jugador.telefono_emergencia}`} className="text-sm" style={{ color: textoPlantel(COLORES.amarillo) }}>
                  {jugador.telefono_emergencia}
                </a>
              )}
            </div>
          </details>
        )}

        {jugador.video_promocional && (
          <a
            href={jugador.video_promocional}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition-opacity"
            style={{ color: textoPlantel(COLORES.amarillo) }}
          >
            🎬 Ver video promocional
          </a>
        )}

        {jugador.estado_detalle && <FuentePerfil permitido={puedeMedico} titulo="Detalle del estado"><details><summary>Detalle del estado registrado</summary><p>{jugador.estado_detalle}</p></details></FuentePerfil>}
        <FuentePerfil fuente={fuenteHistorial} titulo="Trayectoria">
        {historialCategorias.length === 0 && <EstadoContenido estado="vacio" titulo="Sin cambios de categoría registrados" />}
        {/* Trayectoria */}
        {historialCategorias.length > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: textoPlantel(COLORES.amarillo) }}>
              Trayectoria
            </p>

            <div className="space-y-2">
              {historialCategorias.map((h) => (
                <div key={h.id} className="p-3 rounded-lg" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                  <p className="text-sm" style={{ color: COLORES.texto }}>
                    <span style={{ color: COLORES.tenue }}>{formatearFecha(h.fecha)}</span>
                    {' · '}
                    {h.categoria_anterior?.nombre || '—'} → {h.categoria_nueva?.nombre || '—'}
                  </p>
                  {h.temporada && (
                    <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                      Temporada {h.temporada}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}


</FuentePerfil></div>
}
