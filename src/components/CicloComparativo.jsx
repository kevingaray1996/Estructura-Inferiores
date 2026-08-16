import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { COLORES } from '../theme'

const FASE_LABEL = {
  menstrual: 'Menstrual',
  folicular: 'Folicular',
  ovulacion: 'Ovulación',
  lutea: 'Lútea',
  no_responde: 'No especificado',
}

const FASE_COLOR = {
  menstrual: COLORES.acento,
  folicular: COLORES.textoSecundario,
  ovulacion: COLORES.textoSecundario,
  lutea: COLORES.textoSecundario,
  no_responde: COLORES.textoMuted,
}

function CicloComparativo() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadoras, setJugadoras] = useState([])
  const [fases, setFases] = useState({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarCategoria() {
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)
    }
    cargarCategoria()
  }, [])

  useEffect(() => {
    async function cargar() {
      if (!categoria || !fecha) return
      setCargando(true)

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadorasData } = await obtenerJugadoresDeCategoria(supabase, categoria.id, categoriasData)
      setJugadoras(jugadorasData || [])

      const ids = (jugadorasData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: bienestarData } = await supabase
          .from('bienestar')
          .select('jugador_id, fase_ciclo')
          .eq('fecha', fecha)
          .in('jugador_id', ids)
        const mapa = {}
        ;(bienestarData || []).forEach((b) => {
          if (b.fase_ciclo) mapa[b.jugador_id] = b.fase_ciclo
        })
        setFases(mapa)
      } else {
        setFases({})
      }
      setCargando(false)
    }
    cargar()
  }, [categoria, fecha])

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: COLORES.textoMuted }}>
        Fase del ciclo menstrual autoreportada por cada jugadora ese día. Es un dato opcional — no todas van a
        tener una respuesta cargada.
      </p>

      <div className="mb-6">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full sm:w-56 p-2.5 rounded-xl outline-none text-sm"
          style={inputStyle}
        />
      </div>

      {!categoria && (
        <p className="text-sm" style={{ color: COLORES.textoMuted }}>
          No se encontró la categoría Primera División.
        </p>
      )}

      {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

      {!cargando && categoria && jugadoras.length === 0 && (
        <p className="text-sm" style={{ color: COLORES.textoMuted }}>
          No hay jugadoras cargadas en Primera División.
        </p>
      )}

      {!cargando && jugadoras.length > 0 && (
        <div className="space-y-2">
          {jugadoras.map((j) => {
            const fase = fases[j.id]
            return (
              <div
                key={j.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${COLORES.borde}` }}
              >
                <div className="flex items-center gap-2">
                  {j.foto_url ? (
                    <img src={j.foto_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                    >
                      {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                    </span>
                  )}
                  <p className="text-sm" style={{ color: COLORES.texto }}>
                    {j.apellido}, {j.nombre}
                  </p>
                </div>
                <span
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: fase ? 'rgba(242,194,48,0.08)' : 'transparent',
                    color: fase ? FASE_COLOR[fase] || COLORES.textoSecundario : COLORES.textoMuted,
                    border: `1px solid ${fase ? FASE_COLOR[fase] || COLORES.borde : COLORES.borde}`,
                  }}
                >
                  {fase ? FASE_LABEL[fase] || fase : 'Sin responder'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CicloComparativo
