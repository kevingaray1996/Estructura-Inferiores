import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function ConvocarPartido({ partidoId, categoriaId, onVolver, onSiguiente }) {
  const [partido, setPartido] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [convocados, setConvocados] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function cargarDatos() {
      const { data: partidoData } = await supabase
        .from('partidos')
        .select('*')
        .eq('id', partidoId)
        .single()
      setPartido(partidoData)

      const { data: jugadoresData } = await supabase
        .from('jugadores')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('apellido')
      setJugadores(jugadoresData || [])

      const { data: citacionesData } = await supabase
        .from('citaciones')
        .select('*')
        .eq('partido_id', partidoId)
      if (citacionesData?.length) {
        const map = {}
        citacionesData.forEach((c) => {
          map[c.jugador_id] = c.dorsal ?? ''
        })
        setConvocados(map)
      }
    }
    cargarDatos()
  }, [partidoId, categoriaId])

  function toggleConvocado(jugadorId) {
    setConvocados((prev) => {
      const copia = { ...prev }
      if (jugadorId in copia) {
        delete copia[jugadorId]
      } else {
        copia[jugadorId] = ''
      }
      return copia
    })
  }

  function actualizarDorsal(jugadorId, valor) {
    setConvocados((prev) => ({ ...prev, [jugadorId]: valor }))
  }

  async function handleGuardar() {
    setErrorMsg('')
    const ids = Object.keys(convocados)
    if (ids.length === 0) {
      setErrorMsg('Convocá al menos un jugador.')
      return
    }

    setGuardando(true)
    await supabase.from('citaciones').delete().eq('partido_id', partidoId)

    const filas = ids.map((jugadorId) => ({
      partido_id: partidoId,
      jugador_id: jugadorId,
      dorsal: convocados[jugadorId] ? parseInt(convocados[jugadorId], 10) : null,
      titular: false,
    }))

    const { error } = await supabase.from('citaciones').insert(filas)
    setGuardando(false)

    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      onSiguiente()
    }
  }

  if (!partido) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  const cantidadConvocados = Object.keys(convocados).length

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

        <h1
          className="text-2xl md:text-3xl mb-1 flex items-center gap-2.5"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          {partido.escudo_url ? (
            <img
              src={partido.escudo_url}
              alt={partido.rival}
              className="w-8 h-8 rounded object-contain shrink-0"
              style={{ backgroundColor: '#0F1419' }}
            />
          ) : (
            <span
              className="w-8 h-8 rounded flex items-center justify-center text-sm shrink-0"
              style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
            >
              🛡️
            </span>
          )}
          vs {partido.rival}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#8A9BB8' }}>
          {partido.fecha} {partido.hora && `· ${partido.hora}`} {partido.lugar && `· ${partido.lugar}`}
          {partido.local_visitante && ` · ${partido.local_visitante}`}
        </p>

        <div className="flex items-center justify-between mb-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
            Convocatoria
          </p>
          <span className="text-xs font-mono" style={{ color: '#8A9BB8' }}>
            {cantidadConvocados} convocados
          </span>
        </div>

        <div className="space-y-2 mb-6">
          {jugadores.map((j) => {
            const marcado = j.id in convocados
            return (
              <div
                key={j.id}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  backgroundColor: marcado ? '#1A2332' : 'transparent',
                  border: `1px solid ${marcado ? '#4ADE80' : '#2A3548'}`,
                }}
                onClick={() => toggleConvocado(j.id)}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: marcado ? '#4ADE80' : 'transparent',
                    border: `1px solid ${marcado ? '#4ADE80' : '#5B6B85'}`,
                  }}
                >
                  {marcado && <span style={{ color: '#0F1419', fontSize: '12px' }}>✓</span>}
                </div>
                <p className="flex-1 text-sm" style={{ color: '#F0F2F5' }}>
                  {j.apellido}, {j.nombre}
                </p>
                {marcado && (
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={convocados[j.id]}
                    onChange={(e) => actualizarDorsal(j.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="#"
                    className="w-14 p-1.5 rounded-lg text-center text-sm outline-none"
                    style={{ backgroundColor: '#0F1419', border: '1px solid #2A3548', color: '#F0F2F5' }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {errorMsg && (
          <p className="text-sm mb-4" style={{ color: '#F87171' }}>
            {errorMsg}
          </p>
        )}

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
        >
          {guardando ? 'Guardando...' : 'Siguiente: armar formación →'}
        </button>
      </div>
    </div>
  )
}

export default ConvocarPartido