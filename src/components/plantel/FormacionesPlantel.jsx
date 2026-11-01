import { useMemo } from 'react'
import { PLANTEL as P } from '../../appearance/plantel'
import { FORMACIONES, asignarOnce, obtenerMinutos } from '../../utils/rendimiento/formaciones'

const estadoConfig = {
  disponible: {
    label: 'Disponible',
    color: '#4ADE80',
    fondo: '#163627',
  },
  lesionado: {
    label: 'Lesionada',
    color: '#F87171',
    fondo: '#402326',
  },
  suspendido: {
    label: 'Suspendida',
    color: '#FBBF24',
    fondo: '#40351B',
  },
  no_disponible: {
    label: 'No disponible',
    color: '#A1A1AA',
    fondo: '#292B32',
  },
}

function obtenerEstado(jugadora) {
  return estadoConfig[jugadora.estado] || estadoConfig.disponible
}

export default function FormacionesPlantel({
  FotoJugadora,
  jugadoras,
  estadisticas,
  formacion,
  onCambiarFormacion,
  onSelectJugador,
}) {
  const { filas, usadas } = useMemo(
    () => asignarOnce(jugadoras, estadisticas, formacion),
    [jugadoras, estadisticas, formacion]
  )

  return (
    <section
      className="plantel-cancha rounded-2xl p-4 md:p-6"
      style={{
        backgroundColor: P.tarjetaLista,
        border: "1px solid var(--plantel-borde-lista, #2D3038)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 style={{ color: P.blanco }} className="text-lg md:text-xl font-bold ">
            Formación automática por minutos
          </h2>
          <p className="text-xs mt-1" style={{ color: P.secundarioLista }}>
            Distribución automática según minutos y posiciones. No representa una convocatoria oficial.
          </p>
        </div>

        <div className="flex gap-2">
          {Object.keys(FORMACIONES).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => onCambiarFormacion(opcion)}
              aria-pressed={formacion === opcion}
              className="px-3 py-2 rounded-lg text-sm font-bold"
              style={{
                backgroundColor: formacion === opcion ? P.amarilloLista : P.controlLista,
                color: formacion === opcion ? '#171717' : P.textoDetalle,
                border: `1px solid ${formacion === opcion ? P.amarilloLista : P.bordeControl}`,
              }}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: P.secundarioLista }}>
          {usadas.size} de 11 puestos cubiertos
        </span>
        <span className="text-xs" style={{ color: P.textoAmarilloLista }}>
          {formacion}
        </span>
      </div>

      <div
        className="relative rounded-xl overflow-hidden px-1 py-4 md:px-3 md:py-5"
        style={{
          background:
            'repeating-linear-gradient(0deg, #194D38 0px, #194D38 45px, #20583F 45px, #20583F 90px)',
          border: '1px solid #4A8065',
        }}
      >
        <div className="absolute inset-2 border border-white/30 rounded-lg pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/30 pointer-events-none" />
        <div className="absolute w-16 h-16 rounded-full border border-white/30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-around gap-3 md:gap-4 min-h-[390px] md:min-h-[420px]">
          {filas.map((fila, indiceFila) => (
            <div
              key={`${formacion}-${indiceFila}`}
              className="flex flex-wrap justify-center items-start gap-x-1 gap-y-2 md:gap-x-4"
            >
              {fila.map((puesto) => {
                const j = puesto.jugadora
                const estado = j ? obtenerEstado(j) : null

                return (
                  <div
                    key={puesto.id}
                    className="flex flex-col items-center w-[65px] sm:w-[78px] md:w-[88px] min-h-[92px]"
                  >
                    {j ? (
                      <button
                        type="button"
                        onClick={() => onSelectJugador(j.id)}
                        title={`${j.nombre} ${j.apellido} — ${puesto.nombre}`}
                        className="flex flex-col items-center w-full rounded-lg p-1 hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <div
                          className="rounded-full p-0.5"
                          style={{ backgroundColor: estado.color }}
                        >
                          <FotoJugadora
                            jugadora={j}
                            className="w-9 h-9 md:w-11 md:h-11"
                          />
                        </div>
                        <span className="plantel-cancha-nombre text-[10px] md:text-xs font-bold mt-1 text-center leading-tight text-white">
                          {j.apellido || j.nombre}
                        </span>
                        <span
                          className="text-[9px] mt-1 px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: P.amarilloLista, color: '#171717' }}
                        >
                          {obtenerMinutos(j, estadisticas)} min
                        </span>
                      </button>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center w-full rounded-lg p-1 min-h-[76px]"
                        style={{
                          border: '1px dashed rgba(255,255,255,0.45)',
                          backgroundColor: 'rgba(10,25,18,0.25)',
                        }}
                      >
                        <span className="text-xl text-white/80">+</span>
                        <span className="text-[9px] text-white/80 text-center leading-tight">
                          {puesto.nombre}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs mt-3" style={{ color: P.secundarioLista }}>
        Seleccioná una jugadora para abrir su perfil. Los puestos vacíos indican
        que no se encontró una jugadora compatible con esa posición.
      </p>
    </section>
  )
}

