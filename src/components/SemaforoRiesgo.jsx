import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { calcularSemaforoJugador, SEMAFORO_INFO } from '../utils/semaforoRiesgo'
import { generarSemaforoIndividualPDF, generarSemaforoCategoriaPDF } from '../utils/generarSemaforoPDF'

function SemaforoRiesgo({ perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [categoriaNombre, setCategoriaNombre] = useState('')
  const [jugadores, setJugadores] = useState([])
  const [resultados, setResultados] = useState({})
  const [cargando, setCargando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => {
    if (esTecnico) return
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [esTecnico])

  useEffect(() => {
    async function cargar() {
      if (!categoriaId) {
        setJugadores([])
        setResultados({})
        return
      }
      setCargando(true)

      const { data: cat } = await supabase.from('categorias').select('nombre').eq('id', categoriaId).single()
      setCategoriaNombre(cat?.nombre || '')

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, categoriaId, categoriasData)
      setJugadores(jugadoresData || [])

      const nuevosResultados = {}
      for (const j of jugadoresData || []) {
        nuevosResultados[j.id] = await calcularSemaforoJugador(j.id, categoriaId)
      }
      setResultados(nuevosResultados)

      setCargando(false)
    }
    cargar()
  }, [categoriaId])

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
      await generarSemaforoCategoriaPDF(categoriaNombre, filas)
    } finally {
      setGenerandoPdf(false)
    }
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: '#5B6B85' }}>
        Semáforo combinado: bienestar (z-score), carga de entrenamiento (sRPE/ACWR) y CMJ.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {!esTecnico && (
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="">Elegí una categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
        {categoriaId && jugadores.length > 0 && (
          <button
            onClick={handlePdfCategoria}
            disabled={generandoPdf}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
          >
            {generandoPdf ? '...' : '📄 Descargar reporte de la categoría'}
          </button>
        )}
      </div>

      {!categoriaId && (
        <p className="text-sm" style={{ color: '#5B6B85' }}>
          Elegí una categoría para ver el semáforo de riesgo.
        </p>
      )}

      {cargando && <p style={{ color: '#5B6B85' }}>Calculando...</p>}

      {!cargando && jugadores.length > 0 && (
        <div className="space-y-2">
          {jugadores.map((j) => {
            const r = resultados[j.id]
            const info = r ? SEMAFORO_INFO[r.semaforo] : null
            return (
              <div
                key={j.id}
                className="p-3 rounded-xl flex items-center justify-between gap-3"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {j.foto_url ? (
                    <img src={j.foto_url} alt={j.apellido} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                    >
                      {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                    </span>
                  )}
                  <p className="text-sm truncate" style={{ color: '#F0F2F5' }}>
                    {j.apellido}, {j.nombre}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {info ? (
                    <span
                      className="text-xs font-mono px-3 py-1 rounded-full"
                      style={{ backgroundColor: '#0F1419', color: info.color, border: `1px solid ${info.color}` }}
                    >
                      {info.label} ({r.puntos})
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: '#5B6B85' }}>
                      Sin datos
                    </span>
                  )}
                  <button
                    onClick={() => handlePdfIndividual(j)}
                    disabled={generandoPdf}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
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
