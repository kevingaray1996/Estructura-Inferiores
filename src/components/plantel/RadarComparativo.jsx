import { useId } from 'react'

const punto = (i, valor, n) => {
  const angulo = -Math.PI / 2 + i * Math.PI * 2 / n
  return [300 + Math.cos(angulo) * valor * 1.8, 265 + Math.sin(angulo) * valor * 1.8]
}
export default function RadarComparativo({ radar, colores, destacada }) {
  const n = radar.ejes.length
  const leyendaId = useId()
  return <div className="comparativas-radar-contenedor"><svg className="comparativas-radar" viewBox="0 0 600 540" role="img" aria-describedby={leyendaId} aria-label="Radar de magnitudes registradas, no calificación de calidad">
    <title>Comparación de acciones registradas</title><desc>Escalas compartidas. Los datos ausentes no se dibujan. Consultá los valores y denominadores en la tabla.</desc>
    {[25, 50, 75, 100].map(v => <polygon key={v} points={radar.ejes.map((_, i) => punto(i, v, n).join(',')).join(' ')} className="comparativas-reticula" />)}
    {radar.ejes.map((e, i) => { const [x, y] = punto(i, 125, n); return <g key={e.id}>
      <line x1="300" y1="265" x2={punto(i, 100, n)[0]} y2={punto(i, 100, n)[1]} className="comparativas-reticula" />
      <text className="comparativas-eje-texto" x={x} y={y} textAnchor="middle" fontSize="12">{e.etiqueta}<tspan x={x} dy="17">0–{e.maximo} · n={e.n}</tspan></text>
      <text className="comparativas-eje-numero" x={x} y={y} textAnchor="middle" fontSize="28" aria-hidden="true">{i + 1}</text>
    </g> })}
    {radar.series.map((s, indice) => <g key={s.jugadorId} opacity={!destacada || destacada === s.jugadorId ? 1 : .16}>
      {s.valores.every(v => v !== null) && <polygon points={s.valores.map((v, i) => punto(i, v, n).join(',')).join(' ')} fill={colores[indice]} fillOpacity=".12" stroke={colores[indice]} strokeWidth="3" strokeDasharray={indice % 2 ? '8 4' : undefined} />}
      {s.valores.map((v, i) => v === null ? null : <circle key={i} cx={punto(i, v, n)[0]} cy={punto(i, v, n)[1]} r="4" fill={colores[indice]} />)}
    </g>)}
  </svg>
    <div id={leyendaId} className="comparativas-indicadores"><p>Indicadores del radar · misma escala para todas las jugadoras</p>
      <ol>{radar.ejes.map(e => <li key={e.id} data-indicador={e.id}><strong>{e.etiqueta}</strong><span>Escala 0–{e.maximo} · n={e.n} jugadoras con dato y minutos confirmados</span>
        {e.id === 'precision' && <span>Pases correctos / pases registrados (correctos + incorrectos).</span>}
        {e.id === 'efectividad' && <span>Acciones exitosas / acciones evaluadas (exitosas + fallidas).</span>}
      </li>)}</ol></div>
  </div>
}
