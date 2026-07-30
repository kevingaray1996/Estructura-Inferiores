import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

function CargaEntrenamiento() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [posicionesDisponibles, setPosicionesDisponibles] = useState([])
  const [bloques, setBloques] = useState([])
  const [cargando, setCargando] = useState(false)

  const [descripcion, setDescripcion] = useState('')
  const [duracion, setDuracion] = useState('')
  const [posicionesSeleccionadas, setPosicionesSeleccionadas] = useState([])
  const [aplicaTodas, setAplicaTodas] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    async function cargarCategoria() {
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)
    }
    cargarCategoria()
  }, [])

  useEffect(() => {
    async function cargarPosiciones() {
      if (!categoria) {
        setPosicionesDisponibles([])
        return
      }
      const { data } = await supabase
        .from('jugadores')
        .select('posicion')
        .eq('categoria_id', categoria.id)
        .not('posicion', 'is', null)
      const unicas = [...new Set((data || []).map((j) => j.posicion))].filter(Boolean).sort()
      setPosicionesDisponibles(unicas)
    }
    cargarPosiciones()
  }, [categoria])

  useEffect(() => {
    async function cargarBloques() {
      if (!categoria || !fecha) {
        setBloques([])
        return
      }
      setCargando(true)
      const { data } = await supabase
        .from('entrenamiento_bloques')
        .select('*')
        .eq('categoria_id', categoria.id)
        .eq('fecha', fecha)
        .order('created_at', { ascending: true })
      setBloques(data || [])
      setCargando(false)
    }
    cargarBloques()
  }, [categoria, fecha])

  function limpiarForm() {
    setDescripcion('')
    setDuracion('')
    setPosicionesSeleccionadas([])
    setAplicaTodas(true)
    setEditandoId(null)
  }

  function editarBloque(b) {
    setEditandoId(b.id)
    setDescripcion(b.descripcion)
    setDuracion(String(b.duracion_minutos))
    if (!b.posiciones || b.posiciones.length === 0) {
      setAplicaTodas(true)
      setPosicionesSeleccionadas([])
    } else {
      setAplicaTodas(false)
      setPosicionesSeleccionadas(b.posiciones)
    }
  }

  function togglePosicion(p) {
    setPosicionesSeleccionadas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  async function handleGuardarBloque() {
    if (!descripcion || !duracion || !categoria || !fecha) return
    setGuardando(true)

    const datos = {
      fecha,
      categoria_id: categoria.id,
      descripcion,
      duracion_minutos: parseInt(duracion, 10),
      posiciones: aplicaTodas || posicionesSeleccionadas.length === 0 ? null : posicionesSeleccionadas,
    }

    if (editandoId) {
      await supabase.from('entrenamiento_bloques').update(datos).eq('id', editandoId)
    } else {
      await supabase.from('entrenamiento_bloques').insert(datos)
    }

    setGuardando(false)
    limpiarForm()
    const { data } = await supabase
      .from('entrenamiento_bloques')
      .select('*')
      .eq('categoria_id', categoria.id)
      .eq('fecha', fecha)
      .order('created_at', { ascending: true })
    setBloques(data || [])
  }

  async function handleEliminarBloque(id) {
    const confirmar = window.confirm('¿Eliminar este bloque?')
    if (!confirmar) return
    await supabase.from('entrenamiento_bloques').delete().eq('id', id)
    setBloques((prev) => prev.filter((b) => b.id !== id))
  }

  const totalMinutos = bloques.reduce((acc, b) => acc + (b.duracion_minutos || 0), 0)

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
        Cargá los bloques del entrenamiento del día de Primera División (duración y a qué jugadoras aplica).
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
        <p className="text-sm" style={{ color: '#5B6B85' }}>
          No se encontró la categoría Primera División.
        </p>
      )}

      {categoria && (
        <>
          <div className="p-4 rounded-xl mb-6 space-y-3" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
            {editandoId && (
              <p className="text-xs" style={{ color: '#8A9BB8' }}>Editando bloque</p>
            )}
            <textarea
              placeholder='Ej: "Bloque de definición con pausas de 2 min" o "Despejes y posicionamiento"'
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
              style={inputStyle}
            />
            <input
              type="number"
              min="1"
              placeholder="Duración en minutos"
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="w-full sm:w-48 p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2" style={{ color: '#F0F2F5' }}>
                <input
                  type="checkbox"
                  checked={aplicaTodas}
                  onChange={(e) => {
                    setAplicaTodas(e.target.checked)
                    if (e.target.checked) setPosicionesSeleccionadas([])
                  }}
                />
                Aplica a todas las jugadoras
              </label>

              {!aplicaTodas && (
                <div className="flex flex-wrap gap-2">
                  {posicionesDisponibles.length === 0 && (
                    <p className="text-xs" style={{ color: '#5B6B85' }}>
                      No hay posiciones cargadas todavía.
                    </p>
                  )}
                  {posicionesDisponibles.map((p) => {
                    const activo = posicionesSeleccionadas.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePosicion(p)}
                        className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: activo ? '#4ADE80' : '#0F1419',
                          color: activo ? '#0F1419' : '#8A9BB8',
                          border: '1px solid #2A3548',
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleGuardarBloque}
                disabled={guardando || !descripcion || !duracion}
                className="flex-1 p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
              >
                {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : '+ Agregar bloque'}
              </button>
              {editandoId && (
                <button
                  onClick={limpiarForm}
                  className="px-4 rounded-xl text-sm transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8', border: '1px solid #2A3548' }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
              Bloques del día
            </p>
            <span className="text-xs font-mono" style={{ color: '#8A9BB8' }}>
              Total: {totalMinutos} min
            </span>
          </div>

          {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

          {!cargando && bloques.length === 0 && (
            <p className="text-sm" style={{ color: '#5B6B85' }}>
              Todavía no hay bloques cargados para este día.
            </p>
          )}

          <div className="space-y-2">
            {bloques.map((b) => (
              <div
                key={b.id}
                className="p-3 rounded-xl flex items-start justify-between gap-3"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: '#F0F2F5' }}>{b.descripcion}</p>
                  <p className="text-xs mt-1" style={{ color: '#8A9BB8' }}>
                    {b.duracion_minutos} min ·{' '}
                    {b.posiciones && b.posiciones.length > 0 ? b.posiciones.join(', ') : 'Todas las jugadoras'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => editarBloque(b)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleEliminarBloque(b.id)}
                    className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CargaEntrenamiento
