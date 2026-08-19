import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'

function calcularResultado(p) {
  if (p.goles_local == null || p.goles_visitante == null) return null
  const golesPropios = p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
  const golesRivales = p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante

  let etiqueta
  if (golesPropios > golesRivales) etiqueta = 'Victoria'
  else if (golesPropios < golesRivales) etiqueta = 'Derrota'
  else etiqueta = 'Empate'

  if (golesPropios === golesRivales && p.penales_favor != null && p.penales_contra != null) {
    if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
    else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
  }

  return { etiqueta, golesPropios, golesRivales }
}

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
        <p className="text-sm" style={{ color: COLORES.textoMuted }}>Sin datos cargados.</p>
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
  const [cargando, setCargando] = useState(true)
  const [resultados, setResultados] = useState({ victorias: 0, empates: 0, derrotas: 0 })
  const [goles, setGoles] = useState({ favor: 0, contra: 0 })
  const [formaciones, setFormaciones] = useState([])
  const [golesJugadoras, setGolesJugadoras] = useState([])
  const [asistJugadoras, setAsistJugadoras] = useState([])

  useEffect(() => {
    async function cargar() {
      setCargando(true)

      let queryPartidos = supabase
        .from('partidos')
        .select('*')
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null)
      if (categoriaId) queryPartidos = queryPartidos.eq('categoria_id', categoriaId)
      const { data: partidosData } = await queryPartidos

      let victorias = 0, empates = 0, derrotas = 0, favor = 0, contra = 0
      const conteoFormaciones = {}
      ;(partidosData || []).forEach((p) => {
        const r = calcularResultado(p)
        if (r) {
          if (r.etiqueta === 'Victoria') victorias++
          else if (r.etiqueta === 'Empate') empates++
          else derrotas++
          favor += r.golesPropios
          contra += r.golesRivales
        }
        if (p.formacion) {
          conteoFormaciones[p.formacion] = (conteoFormaciones[p.formacion] || 0) + 1
        }
      })
      setResultados({ victorias, empates, derrotas })
      setGoles({ favor, contra })
      setFormaciones(
        Object.entries(conteoFormaciones)
          .map(([nombre, valor]) => ({ nombre, valor }))
          .sort((a, b) => b.valor - a.valor)
      )

      let queryStats = supabase
        .from('estadisticas_jugador')
        .select('goles, asistencias, jugador_id, jugadores(nombre, apellido, categoria_id)')
      const { data: statsData } = await queryStats

      const statsFiltrados = (statsData || []).filter(
        (s) => !categoriaId || s.jugadores?.categoria_id === categoriaId
      )

      const golesPorJugadora = {}
      const asistPorJugadora = {}
      statsFiltrados.forEach((s) => {
        if (!s.jugadores) return
        const nombre = `${s.jugadores.apellido}, ${s.jugadores.nombre}`
        golesPorJugadora[nombre] = (golesPorJugadora[nombre] || 0) + (s.goles || 0)
        asistPorJugadora[nombre] = (asistPorJugadora[nombre] || 0) + (s.asistencias || 0)
      })

      setGolesJugadoras(
        Object.entries(golesPorJugadora)
          .map(([nombre, valor]) => ({ nombre, valor }))
          .filter((d) => d.valor > 0)
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 8)
      )
      setAsistJugadoras(
        Object.entries(asistPorJugadora)
          .map(([nombre, valor]) => ({ nombre, valor }))
          .filter((d) => d.valor > 0)
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 8)
      )

      setCargando(false)
    }
    cargar()
  }, [categoriaId])

  if (cargando) {
    return <p style={{ color: COLORES.textoMuted }}>Cargando estadísticas...</p>
  }

  const totalPartidos = resultados.victorias + resultados.empates + resultados.derrotas

  const segmentosResultados = [
    { label: 'Victorias', valor: resultados.victorias, color: COLORES.exito },
    { label: 'Empates', valor: resultados.empates, color: COLORES.acento },
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
      <p className="text-sm mb-6" style={{ color: COLORES.textoMuted }}>
        {categoriaNombre ? `${categoriaNombre} · ` : 'Todas las categorías · '}
        {totalPartidos} partido{totalPartidos !== 1 ? 's' : ''} con resultado cargado.
      </p>

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
