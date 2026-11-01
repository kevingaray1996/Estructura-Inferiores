import { COLORES } from './presentacionPerfil'
import { textoPlantel } from '../../appearance/plantel'
export default function DetalleEstadisticaPerfil({ filtroStat, statConfig, estadisticas, jugador, setFiltroStat }) {
    const config = statConfig[filtroStat]

    const partidosFiltrados = estadisticas
      .filter(config.filtro)
      .sort((a, b) => (b.partidos?.fecha || '').localeCompare(a.partidos?.fecha || ''))

    return (
      <div className="perfil-detalle-estadistico" style={{ backgroundColor: COLORES.fondo }}>
        <div className="perfil-detalle-listado">
          <button
            onClick={() => setFiltroStat(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.secundario }}
          >
            ← Volver al perfil
          </button>

          <h1 className="text-2xl md:text-3xl mb-1" style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}>
            {config.titulo}
          </h1>

          <p className="text-sm mb-6" style={{ color: COLORES.secundario }}>
            {jugador.apellido}, {jugador.nombre}
          </p>

          {partidosFiltrados.length === 0 && (
            <p style={{ color: COLORES.tenue }}>No hay partidos registrados todavía.</p>
          )}

          <div className="space-y-2">
            {partidosFiltrados.map((e) => (
              <div
                key={e.id}
                className="p-3.5 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
              >
                <div className="flex items-center gap-2.5">
                  {e.partidos?.escudo_url ? (
                    <img
                      src={e.partidos.escudo_url}
                      alt={e.partidos.rival}
                      className="w-7 h-7 rounded object-contain shrink-0"
                      style={{ backgroundColor: COLORES.fondo }}
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: COLORES.fondo, color: COLORES.tenue }}
                    >
                      🛡️
                    </span>
                  )}

                  <div>
                    <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                      {e.partidos ? `vs ${e.partidos.rival}` : 'Partido'}
                    </p>
                    <p className="text-xs" style={{ color: COLORES.tenue }}>
                      {e.partidos?.fecha}
                    </p>
                  </div>
                </div>

                {config.valor(e) && (
                  <span
                    className="text-xs font-mono px-2 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: COLORES.fondo, color: textoPlantel(COLORES.amarillo) }}
                  >
                    {config.valor(e)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
