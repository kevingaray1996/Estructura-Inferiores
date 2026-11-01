import { COLORES } from './presentacionPerfil'
export default function MiniBarras({ datos, color }) {
  const valores = datos.map((d) => d.valor || 0)
  const max = Math.max(...valores, 1)
  const ancho = 26
  const gap = 6
  const alto = 60
  const svgAncho = datos.length * (ancho + gap)

  return (
    <svg viewBox={`0 0 ${svgAncho} ${alto + 16}`} width={svgAncho} height={alto + 16}>
      {datos.map((d, i) => {
        const h = (d.valor / max) * alto
        const x = i * (ancho + gap)

        return (
          <g key={i}>
            <rect x={x} y={alto - h} width={ancho} height={h} rx={3} fill={color} opacity={0.9} />
            <text x={x + ancho / 2} y={alto + 12} fontSize="8" fill={COLORES.tenue} textAnchor="middle">
              {d.etiqueta}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
