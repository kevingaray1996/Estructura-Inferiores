import { direccionDeLaAccion, zonaConOrigen, zonaTactica } from '../../utils/orientacionAnalisis'

// Centros de los 9 sectores (posición visual, 0 a 100).
const CENTROS = [100 / 6, 50, 500 / 6]
const valido = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
const redondear = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10

// Cancha chiquita para ubicar una acción en la fila de la Playlist: tocar el lugar guarda el punto y la zona juntos.
// Con el teclado, cada uno de los 9 sectores es un botón (pone el punto en el centro del sector).
// onElegir({ x, y, zona }): zona calculada con la dirección de la acción (o null si no se sabe hacia dónde atacábamos).
export default function CanchaMini({ evento, partido, deshabilitada, falta, onElegir, onQuitar }) {
  const direccion = direccionDeLaAccion(evento, partido)
  const { zona, calculada } = zonaConOrigen(evento, partido)
  const punto = valido(evento.coordenada_x) && valido(evento.coordenada_y)
    ? { x: Number(evento.coordenada_x), y: Number(evento.coordenada_y) } : null

  const elegir = (x, y) => onElegir({ x: redondear(x), y: redondear(y), zona: direccion ? zonaTactica(redondear(x), redondear(y), direccion) : null })

  function alTocar(e) {
    if (deshabilitada) return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    elegir(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }

  return (
    <div className="pl-cancha" data-falta={falta ? 'si' : undefined}>
      <div className="pl-cancha-cabecera">
        <span className="pl-cancha-rotulo">Zona</span>
        <strong>{zona || 'Tocá dónde fue'}</strong>
        {calculada && <span className="pl-cancha-calculada" title="Calculada desde el punto, con la dirección del partido">calculada</span>}
        {direccion && <span className="pl-cancha-ataque">Atacamos {direccion === 'derecha' ? '→' : '←'}</span>}
      </div>
      <svg viewBox="0 0 100 64" className="pl-cancha-svg" data-deshabilitada={deshabilitada ? 'si' : undefined}
        role="group" aria-label="Cancha: tocá dónde fue la acción" onClick={alTocar}>
        <rect x="0" y="0" width="100" height="64" className="pl-cancha-cesped" />
        <g className="pl-cancha-lineas" aria-hidden="true">
          <rect x="1.5" y="1.5" width="97" height="61" />
          <line x1="50" y1="1.5" x2="50" y2="62.5" />
          <circle cx="50" cy="32" r="7" />
          <rect x="1.5" y="17" width="12" height="30" />
          <rect x="86.5" y="17" width="12" height="30" />
        </g>
        <g className="pl-cancha-tercios" aria-hidden="true">
          <line x1="33.33" y1="0" x2="33.33" y2="64" />
          <line x1="66.67" y1="0" x2="66.67" y2="64" />
          <line x1="0" y1="21.33" x2="100" y2="21.33" />
          <line x1="0" y1="42.67" x2="100" y2="42.67" />
        </g>
        {CENTROS.map((cx) => CENTROS.map((cy) => {
          const nombre = direccion ? zonaTactica(cx, cy, direccion) : null
          return (
            <rect key={`${cx}-${cy}`} x={cx - 100 / 6} y={(cy - 100 / 6) * 0.64} width={100 / 3} height={64 / 3}
              className="pl-cancha-sector" data-elegida={nombre && nombre === zona ? 'si' : undefined}
              role="button" tabIndex={deshabilitada ? -1 : 0} aria-label={nombre ? `Marcar en ${nombre}` : 'Marcar en este sector'}
              onKeyDown={(e) => {
                if (deshabilitada || (e.key !== 'Enter' && e.key !== ' ')) return
                e.preventDefault(); e.stopPropagation(); elegir(cx, cy)
              }} />
          )
        }))}
        {punto && <circle cx={punto.x} cy={punto.y * 0.64} r="2.6" className="pl-cancha-punto" />}
      </svg>
      {punto && (
        <button type="button" className="pl-enlace" disabled={deshabilitada} onClick={onQuitar}>Quitar punto</button>
      )}
    </div>
  )
}
