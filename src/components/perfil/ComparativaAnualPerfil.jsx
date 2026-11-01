import { COLORES } from './presentacionPerfil'
import { textoPlantel } from '../../appearance/plantel'
export default function ComparativaAnualPerfil({ estadisticasPorAnio }) { return <>
        {/* Comparativa por año */}
        {estadisticasPorAnio.length >= 2 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: textoPlantel(COLORES.amarillo) }}>
              Comparativa por año
            </p>

            <div className="overflow-x-auto rounded-xl mb-8" style={{ border: `1px solid ${COLORES.borde}` }}>
              <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: COLORES.tarjeta }}>
                    {['Año', 'Partidos', 'Minutos', 'Goles', 'Asist.'].map((titulo) => (
                      <th key={titulo} className="text-left p-2.5 whitespace-nowrap" style={{ color: textoPlantel(COLORES.amarillo) }}>
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {estadisticasPorAnio.map((a, i) => (
                    <tr key={a.anio} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : "var(--plantel-fila, #191919)" }}>
                      {[a.anio, a.partidos, a.minutos, a.goles, a.asistencias].map((valor, indice) => (
                        <td
                          key={indice}
                          className="p-2.5 whitespace-nowrap"
                          style={{ color: indice === 0 ? COLORES.texto : COLORES.secundario }}
                        >
                          {valor}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}


</> }
