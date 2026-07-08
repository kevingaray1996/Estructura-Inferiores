import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'

const CAMPOS = [
  { clave: 'distancia_total_m', label: 'Dist. total (m)' },
  { clave: 'distancia_alta_intensidad_m', label: 'Dist. alta int. (m)' },
  { clave: 'sprints', label: 'Sprints' },
  { clave: 'velocidad_maxima_kmh', label: 'Vel. máx (km/h)' },
  { clave: 'player_load', label: 'Player Load' },
  { clave: 'minutos', label: 'Minutos' },
]

function FisicoSection({ perfil }) {
  const esTecnico = perfil.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [tipo, setTipo] = useState('entrenamiento')
  const [jugadores, setJugadores] = useState([])
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

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
      if (!categoriaId || !fecha) {
        setJugadores([])
        return
      }
      setCargando(true)
      setMensaje('')

      const { data: jugadoresData } = await supabase
        .from('jugadores')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('apellido')
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: sesionesData } = await supabase
          .from('sesiones_fisicas')
          .select('*')
          .eq('fecha', fecha)
          .eq('tipo', tipo)
          .in('jugador_id', ids)
        const mapa = {}
        ;(sesionesData || []).forEach((s) => {
          mapa[s.jugador_id] = s
        })
        setDatos(mapa)
      } else {
        setDatos({})
      }

      setCargando(false)
    }
    cargar()
  }, [categoriaId, fecha, tipo])

  function cambiarValor(jugadorId, campo, valor) {
    setDatos((prev) => ({
      ...prev,
      [jugadorId]: {
        ...prev[jugadorId],
        [campo]: valor,
      },
    }))
  }

  function tieneAlgunValor(fila) {
    if (!fila) return false
    return CAMPOS.some((c) => fila[c.clave] !== undefined && fila[c.clave] !== '' && fila[c.clave] !== null)
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = jugadores
      .filter((j) => tieneAlgunValor(datos[j.id]))
      .map((j) => {
        const fila = datos[j.id] || {}
        const registro = { fecha, jugador_id: j.id, tipo }
        CAMPOS.forEach((c) => {
          const v = fila[c.clave]
          registro[c.clave] = v === '' || v === undefined || v === null ? null : Number(v)
        })
        return registro
      })

    if (filas.length > 0) {
      const { error } = await supabase
        .from('sesiones_fisicas')
        .upsert(filas, { onConflict: 'fecha,jugador_id,tipo' })
      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    const idsSinDatos = jugadores.map((j) => j.id).filter((id) => !tieneAlgunValor(datos[id]))
    if (idsSinDatos.length > 0) {
      await supabase
        .from('sesiones_fisicas')
        .delete()
        .eq('fecha', fecha)
        .eq('tipo', tipo)
        .in('jugador_id', idsSinDatos)
    }

    setGuardando(false)
    setMensaje('Listo, datos físicos guardados.')
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-1"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Físico
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Métricas resumen de GPS (Catapult) por jugador y sesión.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
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
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          >
            <option value="entrenamiento">Entrenamiento</option>
            <option value="partido">Partido</option>
          </select>
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && categoriaId && jugadores.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            No hay jugadores cargados en esta categoría.
          </p>
        )}

        {!categoriaId && !esTecnico && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            Elegí una categoría para ver el plantel.
          </p>
        )}

        {jugadores.length > 0 && (
          <>
            <div className="overflow-x-auto mb-6 rounded-xl" style={{ border: '1px solid #2A3548' }}>
              <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1A2332' }}>
                    <th
                      className="text-left p-2.5 whitespace-nowrap sticky left-0"
                      style={{ color: '#8A9BB8', backgroundColor: '#1A2332' }}
                    >
                      Jugador
                    </th>
                    {CAMPOS.map((c) => (
                      <th key={c.clave} className="text-left p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((j, i) => (
                    <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                      <td
                        className="p-2.5 whitespace-nowrap sticky left-0"
                        style={{ color: '#F0F2F5', backgroundColor: i % 2 === 0 ? '#0F1419' : '#151D2A' }}
                      >
                        {j.apellido}, {j.nombre}
                      </td>
                      {CAMPOS.map((c) => (
                        <td key={c.clave} className="p-1.5">
                          <input
                            type="number"
                            value={datos[j.id]?.[c.clave] ?? ''}
                            onChange={(e) => cambiarValor(j.id, c.clave, e.target.value)}
                            className="w-24 p-1.5 rounded-lg outline-none text-sm"
                            style={inputStyle}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mensaje && (
              <p className="text-sm mb-4" style={{ color: mensaje.startsWith('Listo') ? '#4ADE80' : '#F87171' }}>
                {mensaje}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full sm:w-auto px-6 p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar datos físicos'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default FisicoSection
