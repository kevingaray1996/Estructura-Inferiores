import { useState } from 'react'
import { generarPerfilPDF } from '../utils/generarPerfilPDF'

const OPCIONES = [
  { clave: 'generales', label: 'Datos generales' },
  { clave: 'estadisticas', label: 'Estadísticas de partidos' },
  { clave: 'medico', label: 'Historial médico' },
  { clave: 'nutricion', label: 'Nutrición' },
  { clave: 'psicologia', label: 'Psicología' },
  { clave: 'fisico', label: 'Físico (GPS)' },
  { clave: 'asistencia', label: 'Asistencia' },
  { clave: 'trayectoria', label: 'Trayectoria entre categorías' },
]

function PdfPerfilModal({
  jugador,
  totales,
  fichasMedicas,
  fichasNutricion,
  fichasPsicologicas,
  historialCategorias,
  resumenAsistencia,
  totalAsistenciaMarcada,
  sesionesFisicas,
  onCerrar,
}) {
  const [secciones, setSecciones] = useState(
    OPCIONES.reduce((acc, o) => ({ ...acc, [o.clave]: true }), {})
  )
  const [generando, setGenerando] = useState(false)

  function toggle(clave) {
    setSecciones((prev) => ({ ...prev, [clave]: !prev[clave] }))
  }

  async function handleGenerar() {
    setGenerando(true)
    try {
      await generarPerfilPDF(
        {
          jugador,
          totales,
          fichasMedicas,
          fichasNutricion,
          fichasPsicologicas,
          historialCategorias,
          resumenAsistencia,
          totalAsistenciaMarcada,
          sesionesFisicas,
        },
        secciones
      )
      onCerrar()
    } finally {
      setGenerando(false)
    }
  }

  const algunaSeleccionada = Object.values(secciones).some(Boolean)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6 z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm p-6 rounded-2xl"
        style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
      >
        <h2 className="text-lg font-medium mb-1" style={{ color: '#F0F2F5' }}>
          Descargar PDF
        </h2>
        <p className="text-xs mb-4" style={{ color: '#8A9BB8' }}>
          {jugador.apellido}, {jugador.nombre} — elegí qué incluir
        </p>

        <div className="space-y-2 mb-6">
          {OPCIONES.map((o) => (
            <label
              key={o.clave}
              className="flex items-center gap-2.5 text-sm cursor-pointer p-2 rounded-lg hover:opacity-90"
              style={{ color: '#F0F2F5' }}
            >
              <input
                type="checkbox"
                checked={!!secciones[o.clave]}
                onChange={() => toggle(o.clave)}
              />
              {o.label}
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCerrar}
            className="flex-1 p-2.5 rounded-xl text-sm transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerar}
            disabled={generando || !algunaSeleccionada}
            className="flex-1 p-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {generando ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PdfPerfilModal
