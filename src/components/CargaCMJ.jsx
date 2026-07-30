import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'

function CargaCMJ({ perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadores, setJugadores] = useState([])
  const [valores, setValores] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

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

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, categoriaId, categoriasData)
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: cmjData } = await supabase
          .from('cmj')
          .select('*')
          .eq('fecha', fecha)
          .in('jugador_id', ids)
        const mapa = {}
        ;(cmjData || []).forEach((c) => {
          mapa[c.jugador_id] = c.valor_cm
        })
        setValores(mapa)
      } else {
        setValores({})
      }
      setCargando(false)
    }
    cargar()
  }, [categoriaId, fecha])

  function cambiarValor(jugadorId, valor) {
    setValores((prev) => ({ ...prev, [jugadorId]: valor }))
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = jugadores
      .filter((j) => valores[j.id] !== undefined && valores[j.id] !== '' && valores[j.id] !== null)
      .map((j) => ({
        fecha,
        jugador_id: j.id,
        valor_cm: Number(valores[j.id]),
      }))

    if (filas.length > 0) {
      const { error } = await supabase.from('cmj').upsert(filas, { onConflict: 'fecha,jugador_id' })
      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    setGuardando(false)
    setMensaje('Listo, valores de CMJ guardados.')
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-1"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          CMJ (salto)
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Test de salto contramovimiento (en cm). Se toma habitualmente los miércoles.
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
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && categoriaId && jugadores.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            No hay jugadoras cargadas en esta categoría.
          </p>
        )}

        {!categoriaId && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            Elegí una categoría para cargar el test.
          </p>
        )}

        {jugadores.length > 0 && (
          <>
            <div className="space-y-2 mb-6">
              {jugadores.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl"
                  style={inputStyle}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {j.foto_url ? (
                      <img
                        src={j.foto_url}
                        alt={`${j.apellido}, ${j.nombre}`}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                      >
                        {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                      </span>
                    )}
                    <p className="text-sm truncate" style={{ color: '#F0F2F5' }}>
                      {j.apellido}, {j.nombre}
                    </p>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="cm"
                    value={valores[j.id] ?? ''}
                    onChange={(e) => cambiarValor(j.id, e.target.value)}
                    className="w-24 p-2 rounded-lg outline-none text-sm text-center"
                    style={{ backgroundColor: '#0F1419', border: '1px solid #2A3548', color: '#F0F2F5' }}
                  />
                </div>
              ))}
            </div>

            {mensaje && (
              <p
                className="text-sm mb-4"
                style={{ color: mensaje.startsWith('Listo') ? '#4ADE80' : '#F87171' }}
              >
                {mensaje}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar CMJ'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default CargaCMJ
