import { useId, useState } from 'react'
import { segmentosObservados } from '../../utils/rendimiento/evolucion.js'

export default function GraficoEvolucion({ partidos, series, unidad, destacada }) {
  const descripcion = useId()
  const [detalle, setDetalle] = useState(null)
  const maximo = Math.max(1, ...series.flatMap(s => s.puntos.filter(p => p.valor !== null).map(p => p.valor)))
  const x = i => partidos.length <= 1 ? 450 : 65 + i * 770 / (partidos.length - 1)
  const y = valor => 350 - valor / maximo * 280
  const info = (s, p, i) => `${s.nombre} · ${partidos[i].fecha} · ${partidos[i].rival || 'Rival no informado'} · ${p.valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unidad}`
  const serieDetalle = series.find(s => s.jugadorId === detalle?.jugadorId)
  const indiceDetalle = partidos.findIndex(p => p.id === detalle?.partidoId)
  const puntoDetalle = serieDetalle?.puntos[indiceDetalle]
  const seleccionar = (s, p) => setDetalle({ jugadorId: s.jugadorId, partidoId: p.partidoId })
  return <div className="evolucion-grafico">
    <svg viewBox="0 0 900 410" data-maximo={maximo} role="group" aria-label="Evolución por partido, puntos interactivos" aria-describedby={descripcion}>
      <title>Evolución de registros deportivos</title>
      {[0, .25, .5, .75, 1].map(v => <g key={v}><line x1="65" x2="835" y1={y(v * maximo)} y2={y(v * maximo)} className="evolucion-reticula" /><text x="55" y={y(v * maximo) + 5} textAnchor="end">{(v * maximo).toLocaleString('es-AR', { maximumFractionDigits: 1 })}</text></g>)}
      {partidos.map((p, i) => <text key={p.id} x={x(i)} y="385" textAnchor="middle">{i + 1}</text>)}
      {series.map((s, indice) => <g key={s.jugadorId} data-serie={s.jugadorId} opacity={!destacada || destacada === s.jugadorId ? 1 : .16}>
        {segmentosObservados(s.puntos).map((tramo, i) => <polyline key={i} data-tramo={s.jugadorId} points={tramo.map(i => `${x(i)},${y(s.puntos[i].valor)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="3" strokeDasharray={indice % 2 ? '8 4' : undefined} />)}
        {s.puntos.map((p, i) => p.valor === null ? null : <g key={p.partidoId}>
          <circle className="evolucion-punto" data-punto={s.jugadorId} cx={x(i)} cy={y(p.valor)} r="12" fill="transparent" role="button" tabIndex={0} aria-label={info(s, p, i)}
            onFocus={() => seleccionar(s, p)} onClick={() => seleccionar(s, p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(s, p) } }}>
            <title>{info(s, p, i)}</title>
          </circle><circle cx={x(i)} cy={y(p.valor)} r="5" fill={s.color} pointerEvents="none" />
        </g>)}
      </g>)}
    </svg>
    <p id={descripcion}>El eje horizontal enumera los partidos cronológicamente. Las líneas se interrumpen donde faltan datos. La tabla inferior conserva las fechas, rivales, valores y motivos.</p>
    <p role="status" className="evolucion-detalle">{puntoDetalle?.valor != null ? info(serieDetalle, puntoDetalle, indiceDetalle) : 'Seleccioná un punto con mouse, tacto o teclado para consultar su registro.'}</p>
    <details className="evolucion-puntos-accesibles"><summary>Consultar puntos con controles ampliados</summary>{series.map(s => <fieldset key={s.jugadorId}><legend>{s.nombre}</legend>{s.puntos.map((p, i) => p.valor === null ? null : <button type="button" key={p.partidoId} onClick={() => seleccionar(s, p)}>{info(s, p, i)}</button>)}</fieldset>)}</details>
    <ol className="evolucion-partidos">{partidos.map(p => <li key={p.id}>{p.fecha} · {p.rival || 'Rival no informado'}</li>)}</ol>
  </div>
}
