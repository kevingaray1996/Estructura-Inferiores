import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const costoLabel = {
  club: 'Club',
  compartido: 'Compartido',
}

function PensionesSection({ onVolver }) {
  const [pensiones, setPensiones] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [pensionEditando, setPensionEditando] = useState(null)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [filtroPensionId, setFiltroPensionId] = useState('')

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    const [{ data: pensionesData }, { data: jugadoresData }] = await Promise.all([
      supabase.from('pensiones').select('*').order('nombre'),
      supabase
        .from('jugadores')
        .select('id, nombre, apellido, pension_id, costo_pension, categorias(nombre)')
        .not('pension_id', 'is', null)
        .order('apellido'),
    ])
    setPensiones(pensionesData || [])
    setJugadores(jugadoresData || [])
    setCargando(false)
  }

  function abrirNuevo() {
    setPensionEditando(null)
    setNombre('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(p) {
    setPensionEditando(p)
    setNombre(p.nombre || '')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setPensionEditando(null)
  }

  async function handleGuardar() {
    setErrorMsg('')
    if (!nombre) {
      setErrorMsg('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    const { error } = pensionEditando
      ? await supabase.from('pensiones').update({ nombre }).eq('id', pensionEditando.id)
      : await supabase.from('pensiones').insert({ nombre })
    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      setMostrarForm(false)
      setPensionEditando(null)
      cargarDatos()
    }
  }

  async function handleEliminar(id) {
    const confirmar = window.confirm(
      '¿Seguro que querés eliminar esta pensión? Los jugadores asignados quedan sin pensión.'
    )
    if (!confirmar) return
    await supabase.from('jugadores').update({ pension_id: null, costo_pension: null }).eq('pension_id', id)
    await supabase.from('pensiones').delete().eq('id', id)
    cargarDatos()
  }

  const pensionesAMostrar = filtroPensionId ? pensiones.filter((p) => p.id === filtroPensionId) : pensiones

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            Pensión / alojamiento
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva pensión'}
          </button>
        </div>

        {mostrarForm && (
          <div
            className="space-y-3 mb-8 p-4 rounded-xl"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            {pensionEditando && (
              <p className="text-xs" style={{ color: '#8A9BB8' }}>
                Editando {pensionEditando.nombre}
              </p>
            )}
            <input
              type="text"
              placeholder="Nombre de la pensión"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            {errorMsg && (
              <p className="text-sm" style={{ color: '#F87171' }}>
                {errorMsg}
              </p>
            )}
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : pensionEditando ? 'Guardar cambios' : 'Guardar pensión'}
            </button>
          </div>
        )}

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && pensiones.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay pensiones cargadas todavía.</p>
        )}

        {!cargando && pensiones.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
                Jugadores por pensión
              </p>
              <select
                value={filtroPensionId}
                onChange={(e) => setFiltroPensionId(e.target.value)}
                className="p-2 rounded-lg outline-none text-xs"
                style={inputStyle}
              >
                <option value="">Todas</option>
                {pensiones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              {pensionesAMostrar.map((p) => {
                const jugadoresDeEstaPension = jugadores.filter((j) => j.pension_id === p.id)
                return (
                  <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #2A3548' }}>
                    <div
                      className="p-3 flex items-center justify-between"
                      style={{ backgroundColor: '#1A2332' }}
                    >
                      <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                        {p.nombre}{' '}
                        <span style={{ color: '#5B6B85' }}>
                          ({jugadoresDeEstaPension.length} jugador{jugadoresDeEstaPension.length === 1 ? '' : 'es'})
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => abrirEditar(p)}
                          className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                          style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleEliminar(p.id)}
                          className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                          style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    {jugadoresDeEstaPension.length > 0 && (
                      <div style={{ backgroundColor: '#0F1419' }}>
                        {jugadoresDeEstaPension.map((j) => (
                          <div
                            key={j.id}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                            style={{ borderTop: '1px solid #1A2332', color: '#F0F2F5' }}
                          >
                            <span>
                              {j.apellido}, {j.nombre}
                              {j.categorias?.nombre && (
                                <span className="text-xs ml-1" style={{ color: '#5B6B85' }}>
                                  · {j.categorias.nombre}
                                </span>
                              )}
                            </span>
                            <span className="text-xs" style={{ color: '#8A9BB8' }}>
                              {costoLabel[j.costo_pension] || '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default PensionesSection
