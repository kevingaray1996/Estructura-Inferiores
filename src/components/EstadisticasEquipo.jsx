import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'
import FranjaNumeros from './ui/FranjaNumeros'
import EstadoVacio from './ui/EstadoVacio'
import EstadoContenido from './ui/EstadoContenido'
import { leerEstadisticasEquipo } from '../utils/estadisticasEquipo'
import { mensajeError } from '../utils/mensajesError'

function Donut({ segmentos, size = 170, grosor = 26 }) {
  const r = (size - grosor) / 2
  const c = 2 * Math.PI * r
  const total = segmentos.reduce((a, s) => a + s.valor, 0)
  let acumulado = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORES.borde} strokeWidth={grosor} />
        ) : (
          segmentos
            .filter((s) => s.valor > 0)
            .map((s, i) => {
              const frac = s.valor / total
              const dash = frac * c
              const offset = acumulado
              acumulado += dash
              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={grosor}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                />
              )
            })
        )}
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="22"
        fontWeight="bold"
        fill={COLORES.texto}
      >
        {total}
      </text>
    </svg>
  )
}

function Leyenda({ segmentos }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-3">
      {segmentos.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: COLORES.textoSecundario }}>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
          {s.label} <b style={{ color: COLORES.texto }}>{s.valor}</b>
        </div>
      ))}
    </div>
  )
}

function BarrasHorizontal({ datos, color }) {
  const max = Math.max(...datos.map((d) => d.valor), 1)
  return (
    <div className="space-y-2.5">
      {datos.map((d) => (
        <div key={d.nombre}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: COLORES.textoSecundario }}>{d.nombre}</span>
            <span style={{ color: COLORES.texto }} className="font-mono">{d.valor}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORES.borde }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.valor / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
      {datos.length === 0 && (
        <EstadoVacio mensaje="Sin registros." />
      )}
    </div>
  )
}

function TarjetaEstadistica({ titulo, children }) {
  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${COLORES.borde}` }}>
      <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.textoMuted }}>
        {titulo}
      </p>
      {children}
    </div>
  )
}

function EstadisticasEquipo({ categoriaId, categoriaNombre }) {
  // { clave, datos, error }: mientras la clave guardada no sea la de la consulta actual (categoría + intento), se
  // muestra «Cargando». Si la consulta falla se muestra un aviso, nunca números en cero.
  const [intento, setIntento] = useState(0)
  const clave = `${categoriaId ?? ''}|${intento}`
  const [estado, setEstado] = useState({ clave: null, datos: null, error: null })
  const reintentar = useCallback(() => setIntento((n) => n + 1), [])

  useEffect(() => {
    let vigente = true
    leerEstadisticasEquipo(supabase, categoriaId).then(({ datos, error }) => {
      if (vigente) setEstado({ clave, datos: error ? null : datos, error: error || null })
    })
    return () => { vigente = false }
  }, [categoriaId, clave])

  const cargando = estado.clave !== clave

  if (!cargando && estado.error) {
    return (
      <EstadoContenido
        estado="error"
        titulo="No se pudieron cargar las estadísticas"
        mensaje={mensajeError(estado.error, 'consultar la información')}
        onReintentar={reintentar}
      />
    )
  }

  if (cargando || !estado.datos) {
    return <EstadoVacio cargando mensaje="Cargando estadísticas…" />
  }

  const { resultados, goles, formaciones, golesJugadoras, asistJugadoras } = estado.datos

  const totalPartidos = resultados.victorias + resultados.empates + resultados.derrotas

  const segmentosResultados = [
    { label: 'Victorias', valor: resultados.victorias, color: COLORES.exito },
    { label: 'Empates', valor: resultados.empates, color: COLORES.alerta },
    { label: 'Derrotas', valor: resultados.derrotas, color: COLORES.peligro },
  ]

  const segmentosGoles = [
    { label: 'A favor', valor: goles.favor, color: COLORES.exito },
    { label: 'En contra', valor: goles.contra, color: COLORES.peligro },
  ]

  const coloresFormaciones = [COLORES.acento, COLORES.exito, COLORES.peligro, '#7DD3FC', '#B4B2A9', '#8B5CF6']
  const segmentosFormaciones = formaciones.map((f, i) => ({
    label: f.nombre,
    valor: f.valor,
    color: coloresFormaciones[i % coloresFormaciones.length],
  }))

  return (
    <div>
      <p className="dp-eyebrow mb-3">{categoriaNombre || 'Todas las categorías'} · <b>Con resultado cargado</b></p>
      <div className="mb-6">
        <FranjaNumeros etiqueta="Resumen de resultados" items={[
          { etiqueta: 'Partidos', valor: totalPartidos },
          { etiqueta: 'G-E-P', valor: `${resultados.victorias}-${resultados.empates}-${resultados.derrotas}` },
          { etiqueta: 'Goles a favor', valor: goles.favor },
          { etiqueta: 'Goles en contra', valor: goles.contra },
        ]} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <TarjetaEstadistica titulo="Partidos - Resultados">
          <div className="flex justify-center">
            <Donut segmentos={segmentosResultados} />
          </div>
          <Leyenda segmentos={segmentosResultados} />
        </TarjetaEstadistica>

        <TarjetaEstadistica titulo="Partidos - Goles">
          <div className="flex justify-center">
            <Donut segmentos={segmentosGoles} />
          </div>
          <Leyenda segmentos={segmentosGoles} />
        </TarjetaEstadistica>

        <TarjetaEstadistica titulo="Sistemas utilizados">
          {segmentosFormaciones.length > 0 ? (
            <>
              <div className="flex justify-center">
                <Donut segmentos={segmentosFormaciones} />
              </div>
              <Leyenda segmentos={segmentosFormaciones} />
            </>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: COLORES.textoMuted }}>
              Sin formaciones cargadas.
            </p>
          )}
        </TarjetaEstadistica>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TarjetaEstadistica titulo="Jugadoras - Goles">
          <BarrasHorizontal datos={golesJugadoras} color={COLORES.exito} />
        </TarjetaEstadistica>

        <TarjetaEstadistica titulo="Jugadoras - Asistencias">
          <BarrasHorizontal datos={asistJugadoras} color={COLORES.acento} />
        </TarjetaEstadistica>
      </div>
    </div>
  )
}

export default EstadisticasEquipo
