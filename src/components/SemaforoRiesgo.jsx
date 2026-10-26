import { PARTIDOS as P } from '../appearance/partidos'
import { textoPlantel } from '../appearance/plantel'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { calcularSemaforoJugador, SEMAFORO_INFO } from '../utils/semaforoRiesgo'
import { generarSemaforoIndividualPDF, generarSemaforoCategoriaPDF } from '../utils/generarSemaforoPDF'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

function SemaforoRiesgo() {
  const [categoria, setCategoria] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [resultados, setResultados] = useState({})
  const [cargando, setCargando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)

      if (!cat) {
        setCargando(false)
        return
      }

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, cat.id, categoriasData)
      setJugadores(jugadoresData || [])

      const nuevosResultados = {}
      for (const j of jugadoresData || []) {
        nuevosResultados[j.id] = await calcularSemaforoJugador(j.id, cat.id)
      }
      setResultados(nuevosResultados)

      setCargando(false)
    }
    cargar()
  }, [])

  async function handlePdfIndividual(jugador) {
    setGenerandoPdf(true)
    try {
      await generarSemaforoIndividualPDF(jugador, resultados[jugador.id])
    } finally {
      setGenerandoPdf(false)
    }
  }

  async function handlePdfCategoria() {
    setGenerandoPdf(true)
    try {
      const filas = jugadores.map((j) => ({ jugador: j, resultado: resultados[j.id] }))
      await generarSemaforoCategoriaPDF(categoria?.nombre || 'Primera División', filas)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm" style={{ color: P.tenue }}>
          Semáforo combinado: bienestar (z-score), carga de entrenamiento (sRPE/ACWR) y CMJ.
        </p>
        {jugadores.length > 0 && (
          <button
            onClick={handlePdfCategoria}
            disabled={generandoPdf}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
            style={{ backgroundColor: P.superficie, color: P.texto, border: "1px solid var(--ui-compartido-borde, #2A3548)" }}
          >
            {generandoPdf ? '...' : '📄 Descargar reporte completo'}
          </button>
        )}
      </div>

      {!categoria && !cargando && (
        <p className="text-sm" style={{ color: P.tenue }}>
          No se encontró la categoría Primera División.
        </p>
      )}

      {cargando && <p style={{ color: P.tenue }}>Calculando...</p>}

      {!cargando && jugadores.length > 0 && (
        <div className="space-y-2">
          {jugadores.map((j) => {
            const r = resultados[j.id]
            const info = r ? SEMAFORO_INFO[r.semaforo] : null
            return (
              <div
                key={j.id}
                className="p-3 rounded-xl flex items-center justify-between gap-3"
                style={{ backgroundColor: P.superficie, border: "1px solid var(--ui-compartido-borde, #2A3548)" }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {j.foto_url ? (
                    <img src={j.foto_url} alt={j.apellido} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: P.fondo, color: P.secundario }}
                    >
                      {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: P.texto }}>
                      {j.apellido}, {j.nombre}
                    </p>
                    {r?.cmj?.bajaConsecutiva && (
                      <p className="text-[10px] mt-0.5" style={{ color: P.aviso }}>
                        CMJ en baja consecutiva
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {info ? (
                    <span
                      className="text-xs font-mono px-3 py-1 rounded-full"
                      style={{ backgroundColor: P.fondo, color: textoPlantel(info.color), border: `1px solid ${info.color}` }}
                    >
                      {info.label} ({r.puntos})
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: P.tenue }}>
                      Sin datos
                    </span>
                  )}
                  <button
                    onClick={() => handlePdfIndividual(j)}
                    disabled={generandoPdf}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: P.fondo, color: P.secundario }}
                  >
                    📄
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SemaforoRiesgo
