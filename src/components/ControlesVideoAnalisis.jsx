import { ANALISIS as A, textoAnalisis } from '../appearance/analisis'

export default function ControlesVideoAnalisis({ listo, reproduciendo, tiempo, segundo, cambiarSegundo, reproducir, tomarTiempo, saltar, desplazar, velocidad, velocidades, cambiarVelocidad, pendiente }) {
  const boton = { backgroundColor: A.control, color: A.texto, border: `1px solid ${A.borde}` }
  const t = Math.max(0, Math.floor(tiempo || 0))
  return <section className="analisis-controles-video" aria-label="Controles del reproductor activo">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="mr-auto font-mono text-2xl" style={{ color: textoAnalisis('#F2C230') }}>{String(Math.floor(t / 60)).padStart(2, '0')}:{String(t % 60).padStart(2, '0')}</strong>
      <button type="button" style={boton} disabled={!listo || pendiente} onClick={reproducir}>{reproduciendo ? 'Ⅱ Pausar' : '▶ Reproducir'}</button>
      <button type="button" style={boton} disabled={!listo || pendiente} onClick={() => desplazar(-5)}>−5 s</button>
      <button type="button" style={boton} disabled={!listo || pendiente} onClick={() => desplazar(5)}>+5 s</button>
      <button type="button" style={boton} disabled={!listo || pendiente} onClick={tomarTiempo}>Tomar tiempo</button>
    </div>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs">Ir a un segundo del video<input type="number" min="0" step="1" value={segundo} onChange={e => cambiarSegundo(e.target.value)} style={boton} className="mt-1 block rounded-lg border p-2" /></label>
      <button type="button" style={boton} disabled={!listo || pendiente} onClick={() => saltar(segundo)}>Ir al momento</button>
      <label className="text-xs">Velocidad<select value={velocidad} style={boton} className="ml-2 rounded-lg border p-2" disabled={!listo || pendiente || !velocidades.length} onChange={e => cambiarVelocidad(Number(e.target.value))}>
        {(velocidades.length ? velocidades : [1]).map(v => <option value={v} key={v}>{v}×</option>)}
      </select></label>
    </div>
    {pendiente && <p role="status" className="mt-2 text-xs">Esperando confirmación del reproductor…</p>}
  </section>
}
