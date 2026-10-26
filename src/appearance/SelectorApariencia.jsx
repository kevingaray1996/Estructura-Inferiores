import { useId } from 'react'
import { useApariencia } from './contextoApariencia'

export default function SelectorApariencia({ compacto = false }) {
  const id = useId()
  const { preferencia, establecerPreferencia } = useApariencia()
  const selector = (sufijo = '') => <>
    <label htmlFor={`${id}${sufijo}`} className="mb-1 block text-xs" style={{ color: 'var(--ui-texto-secundario)' }}>Apariencia</label>
    <select id={`${id}${sufijo}`} value={preferencia} onChange={(e) => establecerPreferencia(e.target.value)}
      className="w-full min-w-0 rounded-lg border px-2 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ backgroundColor: 'var(--ui-control-fondo)', color: 'var(--ui-control-texto)', borderColor: 'var(--ui-control-borde)', outlineColor: 'var(--ui-foco)' }}>
      <option value="claro">Claro</option>
      <option value="oscuro">Oscuro</option>
      <option value="sistema">Automático (según el dispositivo)</option>
    </select>
  </>
  return <div className="mb-3">
    <div className={compacto ? 'md:hidden' : ''}>{selector()}</div>
    {compacto && <details className="relative hidden md:block">
      <summary aria-label="Configurar apariencia" title="Configurar apariencia"
        className="flex h-9 w-full cursor-pointer list-none items-center justify-center rounded-lg border text-lg"
        style={{ color: 'var(--ui-texto)', borderColor: 'var(--ui-borde)' }}>◐</summary>
      <div className="absolute bottom-0 left-full z-[60] ml-3 w-64 rounded-xl border p-3 shadow-lg"
        style={{ backgroundColor: 'var(--ui-superficie)', borderColor: 'var(--ui-borde)' }}>{selector('-compacto')}</div>
    </details>}
  </div>
}
