import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CAMPOS_FISICOS } from '../utils/camposFisicos'

function CargarEstadisticas({ partidoId, categoriaId, onVolver, onIrAFisico }) {
  const [partido, setPartido] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [stats, setStats] = useState({})
  const [datosFisicos, setDatosFisicos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

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

      const { data: statsData } = await supabase
        .from('estadisticas_jugador')
        .select('*')
        .eq('partido_id', partidoId)

      const mapa = {}
      ;(statsData || []).forEach((s) => {
        mapa[s.jugador_id] = {
          minutos: s.minutos_jugados ?? '',
          goles: s.goles ?? 0,
          asistencias: s.asistencias ?? 0,
          amarillas: s.tarjetas_amarillas ?? 0,
          rojas: s.tarjetas_rojas ?? 0,
          titular: s.titular ?? false,
        }
      })
      setStats(mapa)

      const { data: fisicosData } = await supabase
        .from('sesiones_fisicas')
        .select('*')
        .eq('partido_id', partidoId)

      const mapaFisicos = {}
      ;(fisicosData || []).forEach((f) => {
        mapaFisicos[f.jugador_id] = f
      })
      setDatosFisicos(mapaFisicos)
    }
    cargarDatos()
  }, [partidoId, categoriaId])

  function actualizarCampo(jugadorId, campo, valor) {
    setStats((prev) => ({
      ...prev,
      [jugadorId]: {
        ...(prev[jugadorId] || { minutos: '', goles: 0, asistencias: 0, amarillas: 0, rojas: 0, titular: false }),
        [campo]: valor,
      },
    }))
  }

  async function handleGuardar() {
    setGuardando(true)

    await supabase.from('estadisticas_jugador').delete().eq('partido_id', partidoId)

    const filas = Object.entries(stats)
      .filter(([, s]) => s.minutos !== '' && s.minutos !== null)
      .map(([jugadorId, s]) => ({
        jugador_id: jugadorId,
        partido_id: partidoId,
        minutos_jugados: parseInt(s.minutos, 10) || 0,
        goles: parseInt(s.goles, 10) || 0,
        asistencias: parseInt(s.asistencias, 10) || 0,
        tarjetas_amarillas: parseInt(s.amarillas, 10) || 0,
        tarjetas_rojas: parseInt(s.rojas, 10) || 0,
        titular: !!s.titular,
      }))

    if (filas.length > 0) {
      await supabase.from('estadisticas_jugador').insert(filas)
    }

    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const inputStyle = {
    backgroundColor: '#0F1419',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  if (!partido) {
    return (
      <div className="p-6 md:p-10">
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
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
          Estadísticas — vs {partido.rival}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#8A9BB8' }}>
          {partido.fecha} {partido.hora && `· ${partido.hora}`}
        </p>

        <div className="space-y-2">
          {jugadores.map((j) => {
            const s = stats[j.id] || { minutos: '', goles: 0, asistencias: 0, amarillas: 0, rojas: 0, titular: false }
            return (
              <div
                key={j.id}
                className="p-3 rounded-xl"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                    {j.apellido}, {j.nombre}
                  </p>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: '#8A9BB8' }}>
                    <input
                      type="checkbox"
                      checked={s.titular}
                      onChange={(e) => actualizarCampo(j.id, 'titular', e.target.checked)}
                    />
                    Titular
                  </label>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Min.</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={s.minutos}
                      onChange={(e) => actualizarCampo(j.id, 'minutos', e.target.value)}
                      className="w-full p-1.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Goles</label>
                    <input
                      type="number"
                      min="0"
                      value={s.goles}
                      onChange={(e) => actualizarCampo(j.id, 'goles', e.target.value)}
                      className="w-full p-1.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Asist.</label>
                    <input
                      type="number"
                      min="0"
                      value={s.asistencias}
                      onChange={(e) => actualizarCampo(j.id, 'asistencias', e.target.value)}
                      className="w-full p-1.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Amar.</label>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      value={s.amarillas}
                      onChange={(e) => actualizarCampo(j.id, 'amarillas', e.target.value)}
                      className="w-full p-1.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Rojas</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      value={s.rojas}
                      onChange={(e) => actualizarCampo(j.id, 'rojas', e.target.value)}
                      className="w-full p-1.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full p-3 rounded-xl font-medium mt-6 transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
        >
          {guardando ? 'Guardando...' : guardado ? '✅ Guardado' : 'Guardar estadísticas'}
        </button>

        <div className="flex items-center justify-between mt-10 mb-3">
          <p className="text-xs uppercase tracking-wide" style={{ color: '#5B6B85' }}>
            Físico (GPS)
          </p>
          {onIrAFisico && (
            <button
              onClick={() => onIrAFisico(partidoId)}
              className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
            >
              📊 Cargar/editar físico
            </button>
          )}
        </div>

        {Object.keys(datosFisicos).length === 0 ? (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            Todavía no hay datos físicos cargados para este partido.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2A3548' }}>
            <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#1A2332' }}>
                  <th
                    className="text-left p-2.5 whitespace-nowrap sticky left-0"
                    style={{ color: '#8A9BB8', backgroundColor: '#1A2332' }}
                  >
                    Jugador
                  </th>
                  {CAMPOS_FISICOS.map((c) => (
                    <th key={c.clave} className="text-left p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jugadores
                  .filter((j) => datosFisicos[j.id])
                  .map((j, i) => (
                    <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                      <td
                        className="p-2.5 whitespace-nowrap sticky left-0"
                        style={{ color: '#F0F2F5', backgroundColor: i % 2 === 0 ? '#0F1419' : '#151D2A' }}
                      >
                        {j.apellido}, {j.nombre}
                      </td>
                      {CAMPOS_FISICOS.map((c) => (
                        <td key={c.clave} className="p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                          {datosFisicos[j.id][c.clave] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CargarEstadisticas