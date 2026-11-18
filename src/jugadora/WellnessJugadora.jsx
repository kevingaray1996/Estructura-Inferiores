import { useEffect, useState } from 'react'
import FormularioWellness from '../components/wellness/FormularioWellness'
import FormularioRpe from '../components/wellness/FormularioRpe'
import { obtenerFechaHoy } from '../utils/fecha'
import { guardarRpe, guardarWellness, wellnessRespondio } from './portal'

function fechaHaceNDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MENSAJE_INACTIVA = 'tu cuenta no está activa. Hablá con coordinación.'

// Mismos formularios que el link público; guardan con la identidad de la cuenta (funciones portal_*).
function WellnessJugadora({ vistaInicial = 'bienestar' }) {
  const [vista, setVista] = useState(vistaInicial === 'rpe' ? 'rpe' : 'bienestar')
  const [completado, setCompletado] = useState(false)
  const fechaHoy = obtenerFechaHoy()

  useEffect(() => {
    let activo = true
    wellnessRespondio().then(({ data }) => { if (activo) setCompletado(data === true) })
    return () => { activo = false }
  }, [])

  async function guardarW(valores) {
    const { error } = await guardarWellness(valores)
    return { error: error ? (error.code === 'cuenta_inactiva' ? MENSAJE_INACTIVA : error.mensaje || 'revisá la conexión y probá de nuevo.') : undefined }
  }

  async function guardarR(datos) {
    const { error } = await guardarRpe(datos)
    return { error: error ? (error.code === 'cuenta_inactiva' ? MENSAJE_INACTIVA : error.mensaje || 'revisá la conexión y probá de nuevo.') : undefined }
  }

  return (
    <div className="jg-pila">
      <div className="jg-segmentos" role="group" aria-label="Qué querés cargar">
        <button type="button" className="jg-segmento" aria-pressed={vista === 'bienestar'} onClick={() => setVista('bienestar')}>Bienestar de hoy</button>
        <button type="button" className="jg-segmento" aria-pressed={vista === 'rpe'} onClick={() => setVista('rpe')}>Esfuerzo (RPE)</button>
      </div>
      <section className="jg-tarjeta">
        {/* Los dos quedan montados: al cambiar de pestaña no se pierde lo que ya marcó. */}
        <div hidden={vista !== 'bienestar'}>
          <FormularioWellness completado={completado} onCompletado={setCompletado} onGuardar={guardarW} />
        </div>
        <div hidden={vista !== 'rpe'}>
          <FormularioRpe fechaHoy={fechaHoy} fechaMinima={fechaHaceNDias(3)} onGuardar={guardarR} />
        </div>
      </section>
    </div>
  )
}

export default WellnessJugadora
