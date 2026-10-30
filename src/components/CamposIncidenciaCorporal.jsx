import SelectorMedicos from './SelectorMedicos'
import { CENTRALES, ESTADOS_CORPORALES, LADOS_CORPORALES, ZONAS_CORPORALES } from '../utils/mapaCorporal'

export default function CamposIncidenciaCorporal({ valor, onChange, disabled }) {
  const cambiar = (clave, contenido) => onChange({ ...valor, [clave]: contenido })
  return <fieldset disabled={disabled} className="space-y-3" style={{ color: 'var(--ui-texto)' }}>
    <legend className="font-semibold">Situación informada</legend>
    <SelectorMedicos label="Zona corporal" disabled={disabled} value={valor.zona_corporal}
      options={[{ value: '', label: 'Seleccionar zona' }, ...ZONAS_CORPORALES.map(z => ({ value: z.id, label: z.nombre }))]}
      onChange={zona => onChange({ ...valor, zona_corporal: zona, lateralidad: CENTRALES.includes(zona) ? 'central' : 'derecha' })} />
    <SelectorMedicos label="Lateralidad de la jugadora" disabled={disabled} value={valor.lateralidad}
      options={(CENTRALES.includes(valor.zona_corporal) ? ['central'] : ['derecha', 'izquierda', 'ambos']).map(l => ({ value: l, label: LADOS_CORPORALES[l] }))}
      onChange={lado => cambiar('lateralidad', lado)} />
    <SelectorMedicos label="Tipo" disabled={disabled} value={valor.tipo_incidencia}
      options={[{ value: 'molestia', label: 'Molestia (sin diagnóstico)' }, { value: 'lesion_informada', label: 'Lesión informada' }]}
      onChange={tipo => cambiar('tipo_incidencia', tipo)} />
    <SelectorMedicos label="Estado" disabled={disabled} value={valor.estado_seguimiento}
      options={Object.entries(ESTADOS_CORPORALES).map(([value, label]) => ({ value, label }))}
      onChange={estado => onChange({ ...valor, estado_seguimiento: estado, fecha_resolucion: estado === 'resuelta' ? valor.fecha_resolucion : '' })} />
    {valor.estado_seguimiento === 'resuelta' && <label className="block text-sm">Fecha de resolución
      <input type="date" className="w-full p-2.5 rounded-xl ui-control outline-none" value={valor.fecha_resolucion} onChange={e => cambiar('fecha_resolucion', e.target.value)} />
    </label>}
    <p className="text-xs" style={{ color: 'var(--ui-texto-secundario)' }}>Resolver el seguimiento no constituye un alta médica ni cambia la disponibilidad deportiva.</p>
  </fieldset>
}
