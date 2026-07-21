import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarCitacionPDF } from '../utils/generarCitacion'
import { exportarEstadisticasPDF, exportarEstadisticasCSV } from '../utils/exportarEstadisticas'

function ListaPartidos({ categoriaId, categoriaNombre, onVolver, onElegirPartido, onNuevoPartido, onGestionarEquipos, onVerEstadisticas, onEditarPartido, refrescar }) {
  const [partidos, setPartidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    async function cargarPartidos() {
      setCargando(true)
      const { data } = await supabase
        .from('partidos')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('fecha', { ascending: false })
      setPartidos(data || [])
      setCargando(false)
    }
    cargarPartidos()
  }, [categoriaId, refrescar])

  async function handleEliminar(e, partidoId) {
    e.stopPropagation()
    const confirmar = window.confirm('¿Seguro que querés eliminar este partido? También se borran sus citaciones y estadísticas asociadas.')
    if (!confirmar) return

    await supabase.from('citaciones').delete().eq('partido_id', partidoId)
    await supabase.from('estadisticas_jugador').delete().eq('partido_id', partidoId)
    await supabase.from('videos').update({ partido_id: null }).eq('partido_id', partidoId)
    await supabase.from('partidos').delete().eq('id', partidoId)

    setPartidos((prev) => prev.filter((p) => p.id !== partidoId))
  }

  async function handleExportar(formato) {
    setExportando(true)
    try {
      if (formato === 'pdf') {
        await exportarEstadisticasPDF(categoriaId, categoriaNombre)
      } else {
        await exportarEstadisticasCSV(categoriaId, categoriaNombre)
      }
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        {onVolver && (
          <button
            onClick={onVolver}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: '#8A9BB8' }}
          >
            ← Volver
          </button>
        )}

        <div className="flex items-start justify-between mb-8">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            Partidos
          </h1>
          <div className="flex items-center gap-2">
            {onGestionarEquipos && (
              <button
                onClick={onGestionarEquipos}
                className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
              >
                🛡️ Equipos
              </button>
            )}
            <button
              onClick={onNuevoPartido}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              + Nuevo partido
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs" style={{ color: '#5B6B85' }}>
            Estadísticas de la categoría:
          </span>
          <button
            onClick={() => handleExportar('pdf')}
            disabled={exportando}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
          >
            📄 PDF
          </button>
          <button
            onClick={() => handleExportar('csv')}
            disabled={exportando}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
          >
            ⬇️ CSV
          </button>
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && partidos.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay partidos cargados para esta categoría todavía.</p>
        )}

        <div className="space-y-2">
          {partidos.map((p) => (
            <div
              key={p.id}
              onClick={() => onElegirPartido(p.id)}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {p.escudo_url ? (
                    <img
                      src={p.escudo_url}
                      alt={p.rival}
                      className="w-7 h-7 rounded object-contain shrink-0"
                      style={{ backgroundColor: '#0F1419' }}
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
                    >
                      🛡️
                    </span>
                  )}
                  <p className="text-base font-medium" style={{ color: '#F0F2F5' }}>
                    vs {p.rival}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                    >
                      ▶
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      generarCitacionPDF(p.id)
                    }}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    📄
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onVerEstadisticas(p.id)
                    }}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    📊
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditarPartido(p.id)
                    }}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    ✏️
                  </button>
                  {p.resultado && (
                    <span
                      className="text-xs font-mono px-2 py-1 rounded-full"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
                    >
                      {p.resultado}
                    </span>
                  )}
                  <button
                    onClick={(e) => handleEliminar(e, p.id)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                  >
                    🗑
                  </button>
                </div>
              </div>
              <p className="text-xs mt-1" style={{ color: '#5B6B85' }}>
              {p.numero_fecha && `Fecha ${p.numero_fecha} · `}
              {p.fecha} {p.hora && `· ${p.hora}`} {p.lugar && `· ${p.lugar}`}
              {p.local_visitante && ` · ${p.local_visitante}`}
             </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ListaPartidos
