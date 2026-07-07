import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
  suspendido: { color: '#F87171', label: 'Suspendido' },
}

const pieHabilLabel = {
  derecho: 'Derecho',
  izquierdo: 'Izquierdo',
  ambidiestro: 'Ambidiestro',
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--
  }
  return edad
}

function formatearFecha(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const [anio, mes, dia] = fechaNacimiento.split('-')
  return `${dia}/${mes}/${anio}`
}

function PerfilJugador({ jugadorId, onVolver, onVerFichaMedica, onVerVideos, onVerNutricion, onVerPsicologia, onEditar }) {
  const [jugador, setJugador] = useState(null)
  const [estadisticas, setEstadisticas] = useState([])
  const [fichasMedicas, setFichasMedicas] = useState([])
  const [videos, setVideos] = useState([])
  const [eliminando, setEliminando] = useState(false)
  const [filtroStat, setFiltroStat] = useState(null)

  useEffect(() => {
    async function cargarDatos() {
      const { data: jugadorData } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .eq('id', jugadorId)
        .single()
      setJugador(jugadorData)

      const { data: statsData } = await supabase
        .from('estadisticas_jugador')
        .select('*, partidos(rival, fecha, escudo_url)')
        .eq('jugador_id', jugadorId)
      setEstadisticas(statsData || [])

      const { data: fichasData } = await supabase
        .from('fichas_medicas')
        .select('*')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })
      setFichasMedicas(fichasData || [])

      const { data: videosData } = await supabase
        .from('videos')
        .select('*')
        .eq('jugador_id', jugadorId)
        .eq('tipo', 'individual')
      setVideos(videosData || [])
    }
    cargarDatos()
  }, [jugadorId])

  async function handleEliminarJugador() {
    const confirmar = window.confirm(
      `¿Seguro que querés eliminar a ${jugador.apellido}, ${jugador.nombre}? Esto también borra sus fichas médicas y videos asociados. Esta acción no se puede deshacer.`
    )
    if (!confirmar) return

    setEliminando(true)
    await supabase.from('fichas_medicas').delete().eq('jugador_id', jugadorId)
    await supabase.from('videos').delete().eq('jugador_id', jugadorId)
    await supabase.from('estadisticas_jugador').delete().eq('jugador_id', jugadorId)
    await supabase.from('citaciones').delete().eq('jugador_id', jugadorId)
    await supabase.from('jugadores').delete().eq('id', jugadorId)
    setEliminando(false)
    onVolver()
  }

  if (!jugador) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1419' }}>
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  const estado = estadoConfig[jugador.estado] || estadoConfig.disponible
  const edad = calcularEdad(jugador.fecha_nacimiento)

  const totales = estadisticas.reduce(
    (acc, e) => ({
      partidos: acc.partidos + 1,
      minutos: acc.minutos + (e.minutos_jugados || 0),
      goles: acc.goles + (e.goles || 0),
      asistencias: acc.asistencias + (e.asistencias || 0),
      amarillas: acc.amarillas + (e.tarjetas_amarillas || 0),
      rojas: acc.rojas + (e.tarjetas_rojas || 0),
    }),
    { partidos: 0, minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 }
  )

  const statConfig = {
    partidos: {
      titulo: 'Partidos jugados',
      filtro: () => true,
      valor: (e) => (e.minutos_jugados ? `${e.minutos_jugados}'` : null),
    },
    goles: {
      titulo: 'Goles',
      filtro: (e) => (e.goles || 0) > 0,
      valor: (e) => `${e.goles} gol${e.goles > 1 ? 'es' : ''}`,
    },
    asistencias: {
      titulo: 'Asistencias',
      filtro: (e) => (e.asistencias || 0) > 0,
      valor: (e) => `${e.asistencias} asist.`,
    },
    amarillas: {
      titulo: 'Tarjetas amarillas',
      filtro: (e) => (e.tarjetas_amarillas || 0) > 0,
      valor: (e) => `${e.tarjetas_amarillas} amarilla${e.tarjetas_amarillas > 1 ? 's' : ''}`,
    },
    rojas: {
      titulo: 'Tarjetas rojas',
      filtro: (e) => (e.tarjetas_rojas || 0) > 0,
      valor: (e) => `${e.tarjetas_rojas} roja${e.tarjetas_rojas > 1 ? 's' : ''}`,
    },
  }

  const ultimaFicha = fichasMedicas[0]
  const lesionesActivas = fichasMedicas.filter((f) => !f.recuperado).length

  const datosPersonales = [
    { label: 'Posición', valor: jugador.posicion },
    { label: 'Fecha nac.', valor: formatearFecha(jugador.fecha_nacimiento), extra: edad !== null ? `${edad} años` : null },
    { label: 'Pie hábil', valor: pieHabilLabel[jugador.pie_habil] },
  ].filter((d) => d.valor)

  const disciplinas = [
    {
      nombre: 'Kinesiología / Médica',
      icono: '🩺',
      resumen:
        fichasMedicas.length === 0
          ? 'Sin datos cargados'
          : `${fichasMedicas.length} registro${fichasMedicas.length > 1 ? 's' : ''}${
              lesionesActivas > 0 ? ` · ${lesionesActivas} activo${lesionesActivas > 1 ? 's' : ''}` : ''
            }`,
      detalle: ultimaFicha ? `Último: ${ultimaFicha.descripcion || ultimaFicha.fecha}` : null,
      onClick: () => onVerFichaMedica(jugadorId),
    },
    { nombre: 'Nutrición', icono: '🥗', resumen: 'Sin datos cargados', onClick: () => onVerNutricion(jugadorId) },
    { nombre: 'Psicología', icono: '🧠', resumen: 'Sin datos cargados', onClick: () => onVerPsicologia(jugadorId) },
    {
      nombre: 'Videoanálisis',
      icono: '🎥',
      resumen: videos.length === 0 ? 'Sin datos cargados' : `${videos.length} video${videos.length > 1 ? 's' : ''}`,
      onClick: () => onVerVideos(jugadorId),
    },
  ]

  if (filtroStat) {
    const config = statConfig[filtroStat]
    const partidosFiltrados = estadisticas
      .filter(config.filtro)
      .sort((a, b) => (b.partidos?.fecha || '').localeCompare(a.partidos?.fecha || ''))

    return (
      <div className="min-h-screen p-6 md:p-10" style={{ backgroundColor: '#0F1419' }}>
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setFiltroStat(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: '#8A9BB8' }}
          >
            ← Volver al perfil
          </button>

          <h1
            className="text-2xl md:text-3xl mb-1"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            {config.titulo}
          </h1>
          <p className="text-sm mb-6" style={{ color: '#8A9BB8' }}>
            {jugador.apellido}, {jugador.nombre}
          </p>

          {partidosFiltrados.length === 0 && (
            <p style={{ color: '#5B6B85' }}>No hay partidos registrados todavía.</p>
          )}

          <div className="space-y-2">
            {partidosFiltrados.map((e) => (
              <div
                key={e.id}
                className="p-3.5 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center gap-2.5">
                  {e.partidos?.escudo_url ? (
                    <img
                      src={e.partidos.escudo_url}
                      alt={e.partidos.rival}
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
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                      {e.partidos ? `vs ${e.partidos.rival}` : 'Partido'}
                    </p>
                    <p className="text-xs" style={{ color: '#5B6B85' }}>
                      {e.partidos?.fecha}
                    </p>
                  </div>
                </div>
                {config.valor(e) && (
                  <span
                    className="text-xs font-mono px-2 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                  >
                    {config.valor(e)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ backgroundColor: '#0F1419' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onVolver}
            className="text-sm flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: '#8A9BB8' }}
          >
            ← Volver al plantel
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onEditar(jugadorId)}
              className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
            >
              ✏️ Editar
            </button>
            <button
              onClick={handleEliminarJugador}
              disabled={eliminando}
              className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#1A2332', color: '#F87171', border: '1px solid #2A3548' }}
            >
              {eliminando ? 'Eliminando...' : '🗑 Eliminar'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-full shrink-0 text-lg font-bold"
            style={{
              backgroundColor: '#1A2332',
              border: `2px solid ${estado.color}`,
              color: estado.color,
              fontFamily: "'Archivo Black', sans-serif",
            }}
          >
            {iniciales(jugador.nombre, jugador.apellido)}
          </div>
          <div>
            <h1
              className="text-2xl md:text-3xl"
              style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
            >
              {jugador.apellido}, {jugador.nombre}
            </h1>
            <p className="text-sm" style={{ color: estado.color }}>
              {estado.label}
              {jugador.estado_detalle && ` — ${jugador.estado_detalle}`}
            </p>
          </div>
          <span
            className="ml-auto text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
            style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
          >
            {jugador.categorias?.nombre}
          </span>
        </div>

        {datosPersonales.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {datosPersonales.map((d) => (
              <div
                key={d.label}
                className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#5B6B85' }}>
                  {d.label}
                </p>
                <p className="text-sm" style={{ color: '#F0F2F5' }}>
                  {d.valor}
                  {d.extra && <span style={{ color: '#5B6B85' }}> · {d.extra}</span>}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs tracking-widest uppercase mb-3" style={{ color: '#5B6B85' }}>
          Estadísticas
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
          {[
            { label: 'Partidos', valor: totales.partidos, key: 'partidos' },
            { label: 'Minutos', valor: totales.minutos, key: null },
            { label: 'Goles', valor: totales.goles, key: 'goles' },
            { label: 'Asist.', valor: totales.asistencias, key: 'asistencias' },
            { label: 'Amar.', valor: totales.amarillas, key: 'amarillas' },
            { label: 'Rojas', valor: totales.rojas, key: 'rojas' },
          ].map((stat) => (
            <div
              key={stat.label}
              onClick={stat.key ? () => setFiltroStat(stat.key) : undefined}
              className="p-3 rounded-xl text-center"
              style={{
                backgroundColor: '#1A2332',
                border: '1px solid #2A3548',
                cursor: stat.key ? 'pointer' : 'default',
              }}
            >
              <p
                className="text-xl"
                style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
              >
                {stat.valor}
              </p>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#5B6B85' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <p className="text-xs tracking-widest uppercase mb-3" style={{ color: '#5B6B85' }}>
          Áreas
        </p>
        <div className="grid grid-cols-2 gap-3">
          {disciplinas.map((d) => (
            <div
              key={d.nombre}
              onClick={d.onClick}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-2xl mb-2">{d.icono}</p>
              <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                {d.nombre}
              </p>
              <p className="text-xs mt-1" style={{ color: d.resumen === 'Sin datos cargados' ? '#5B6B85' : '#8A9BB8' }}>
                {d.resumen}
              </p>
              {d.detalle && (
                <p className="text-xs mt-1 truncate" style={{ color: '#5B6B85' }}>
                  {d.detalle}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PerfilJugador