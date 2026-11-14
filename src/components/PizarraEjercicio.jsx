import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { validarPizarra } from '../utils/pizarra'
import './pizarra.css'
const Editor = lazy(() => import('./PizarraTactica'))

export default function PizarraEjercicio({ valor, miniatura, onChange, soloLectura = false, nombre, objetivo, indicaciones }) {
  const [abierta, setAbierta] = useState(false)
  let doc = null, invalida = false
  try { if (valor) doc = validarPizarra(valor) } catch { invalida = true }
  if (soloLectura && !doc) return null
  // El modal va directo al body: dentro de la app hay secciones con transform/filter (animaciones, tarjetas) que
  // convierten "position: fixed" en relativo a ellas y lo dejaban angosto. Así ocupa siempre toda la ventana.
  const modal = abierta && <div role="dialog" aria-modal="true" aria-label={nombre || 'Pizarra táctica'} className={`pizarra-modal${soloLectura ? ' pizarra-modal-visor' : ''}`}>
    {soloLectura && <div style={{ color: 'var(--ui-texto)' }}><h2>{nombre}</h2>{objetivo && <p>{objetivo}</p>}{indicaciones && <p className="whitespace-pre-wrap">{indicaciones}</p>}</div>}
    <Suspense fallback={<p>Cargando pizarra…</p>}><Editor inicial={doc} titulo={nombre || 'Pizarra táctica'} soloLectura={soloLectura} onCerrar={() => setAbierta(false)}
      onGuardar={soloLectura ? undefined : (pizarra, vista) => { onChange(pizarra, vista); setAbierta(false) }} /></Suspense>
  </div>
  return <div>
    {!soloLectura && miniatura?.startsWith('data:image/png;base64,') && <img className="pizarra-miniatura" style={{ maxHeight: 120 }} src={miniatura} alt={`Vista previa de ${nombre || 'pizarra'}`} />}
    {invalida && <p role="alert">La pizarra guardada tiene un formato no compatible. No se reemplazará al guardar el ejercicio.</p>}
    <button type="button" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--ui-borde)', color: 'var(--ui-texto-acento)' }} disabled={invalida} onClick={() => setAbierta(true)}>{soloLectura ? '▶ Ver ejercicio' : 'Abrir pizarra táctica'}</button>
    {!soloLectura && <p className="text-xs" style={{ color: 'var(--ui-texto-secundario)' }}>Aplicar en la pizarra conserva el diseño en el formulario. Guardá también el ejercicio o la sesión para persistirlo.</p>}
    {modal && (typeof document !== 'undefined' ? createPortal(modal, document.body) : modal)}
  </div>
}
