import { CENTRALES, ESTADOS_CORPORALES, LADOS_CORPORALES, ZONAS_CORPORALES } from '../utils/mapaCorporal'

export default function CamposIncidenciaCorporal({ valor, onChange, disabled }) {
  const cambiar = (clave, contenido) => onChange({ ...valor, [clave]: contenido })
  return <fieldset disabled={disabled} className="space-y-3" style={{ color: 'var(--ui-texto)' }}>
    <legend className="font-semibold">Situación informada</legend>
    <label className="block text-sm">Zona corporal
      <select className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.zona_corporal} onChange={e => onChange({ ...valor, zona_corporal: e.target.value, lateralidad: CENTRALES.includes(e.target.value) ? 'central' : 'derecha' })}>
        <option value="">Seleccionar zona</option>{ZONAS_CORPORALES.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
      </select>
    </label>
    <label className="block text-sm">Lateralidad de la jugadora
      <select className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.lateralidad} onChange={e => cambiar('lateralidad', e.target.value)}>
        {(CENTRALES.includes(valor.zona_corporal) ? ['central'] : ['derecha', 'izquierda', 'ambos']).map(l => <option key={l} value={l}>{LADOS_CORPORALES[l]}</option>)}
      </select>
    </label>
    <label className="block text-sm">Tipo
      <select className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.tipo_incidencia} onChange={e => cambiar('tipo_incidencia', e.target.value)}>
        <option value="molestia">Molestia (sin diagnóstico)</option><option value="lesion_informada">Lesión informada</option>
      </select>
    </label>
    <label className="block text-sm">Estado
      <select className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.estado_seguimiento} onChange={e => onChange({ ...valor, estado_seguimiento: e.target.value, fecha_resolucion: e.target.value === 'resuelta' ? valor.fecha_resolucion : '' })}>
        {Object.entries(ESTADOS_CORPORALES).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
      </select>
    </label>
    {valor.estado_seguimiento === 'resuelta' && <label className="block text-sm">Fecha de resolución
      <input type="date" className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.fecha_resolucion} onChange={e => cambiar('fecha_resolucion', e.target.value)} />
    </label>}
    <p className="text-xs" style={{ color: 'var(--ui-texto-secundario)' }}>Resolver el seguimiento no constituye un alta médica ni cambia la disponibilidad deportiva.</p>
  </fieldset>
}
