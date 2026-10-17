```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import PdfPerfilModal from './PdfPerfilModal'
import { CAMPOS_FISICOS } from '../utils/camposFisicos'
import { cargarDatosBienestar } from '../utils/bienestar'
import { generarBienestarPDF } from '../utils/generarBienestarPDF'

const CATEGORIA_PRIMERA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const AMARILLO = '#F2C230'
const FONDO = '#0F1419'
const TARJETA = '#1A2332'
const BORDE = '#2A3548'
const TEXTO = '#F0F2F5'
const SECUNDARIO = '#8A9BB8'
const MUTED = '#5B6B85'

const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionada' },
  suspendido: { color: '#F87171', label: 'Suspendida' },
  no_disponible: { color: '#8A9BB8', label: 'No disponible' },
}

const pieHabilLabel = {
  derecho: 'Derecho',
  izquierdo: 'Izquierdo',
  ambidiestro: 'Ambidiestro',
}

function iniciales(nombre, apellido) {
  const primera = nombre ? nombre.charAt(0) : ''
  const segunda = apellido ? apellido.charAt(0) : ''
  return (primera + segunda).toUpperCase()
}

function formatearFecha(fecha) {
  if (!fecha) return '—'
  const [anio, mes, dia] = fecha.split('-')
  if (!anio || !mes || !dia) return fecha
  return dia + '/' + mes + '/' + anio
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null

  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento + 'T00:00:00')

  let edad = hoy.getFullYear() - nacimiento.getFullYear()

  const mesActual = hoy.getMonth()
  const mesNacimiento = nacimiento.getMonth()

  if (
    mesActual < mesNacimiento ||
    (mesActual === mesNacimiento &&
      hoy.getDate() < nacimiento.getDate())
  ) {
    edad--
  }

  return edad
}

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return anio + '-' + mes + '-' + dia
}

function formatearNumero(valor) {
  return Number(valor || 0).toLocaleString('es-AR')
}

function obtenerDorsal(jugador) {
  return (
    jugador?.dorsal ??
    jugador?.numero_camiseta ??
    jugador?.numero ??
    jugador?.camiseta ??
    null
  )
}

function obtenerResultado(partido) {
  if (!partido) return null

  const resultadoDirecto =
    partido.resultado_final ??
    partido.resultado ??
    partido.marcador ??
    partido.resultado_partido

  if (resultadoDirecto !== null && resultadoDirecto !== undefined) {
    const texto = String(resultadoDirecto).trim()
    if (texto) return texto
  }

  const paresDeGoles = [
    ['goles_local', 'goles_visitante'],
    ['goles_a_favor', 'goles_en_contra'],
    ['goles_favor', 'goles_contra'],
    ['marcador_local', 'marcador_visitante'],
  ]

  for (const [campoLocal, campoVisitante] of paresDeGoles) {
    const local = partido[campoLocal]
    const visitante = partido[campoVisitante]

    if (
      local !== null &&
      local !== undefined &&
      visitante !== null &&
      visitante !== undefined
    ) {
     return String(local) + ' - ' + String(visitante)
    }
  }

  return null
}

function MiniBarras({ datos, color }) {
  if (!datos.length) return null

  const valores = datos.map((d) => d.valor || 0)
  const max = Math.max(...valores, 1)
  const ancho = 26
  const gap = 6
  const alto = 60
  const svgAncho = datos.length * (ancho + gap)

  return (
    <svg
      viewBox={'0 0 ' + svgAncho + ' ' + (alto + 16)}
      width={svgAncho}
      height={alto + 16}
      role="img"
      aria-label="Evolución de las distancias registradas"
    >
      {datos.map((d, i) => {
        const h = (d.valor / max) * alto
        const x = i * (ancho + gap)

        return (
          <g key={i}>
            <rect
              x={x}
              y={alto - h}
              width={ancho}
              height={h}
              rx={3}
              fill={color}
              opacity={0.85}
            />
            <text
              x={x + ancho / 2}
              y={alto + 12}
              fontSize="8"
              fill={SECUNDARIO}
              textAnchor="middle"
            >
              {d.etiqueta}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function TituloSeccion({ titulo, detalle, accion }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2
          className="text-base md:text-lg font-semibold"
          style={{ color: TEXTO }}
        >
          {titulo}
        </h2>
        {detalle && (
          <p className="text-xs mt-1" style={{ color: MUTED }}>
            {detalle}
          </p>
        )}
      </div>
      {accion}
    </div>
  )
}

function TarjetaArea({ disciplina }) {
  return (
    <button
      type="button"
      onClick={disciplina.onClick}
      className="w-full min-w-0 text-left p-3 md:p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2"
      style={{
        backgroundColor: TARJETA,
        border: '1px solid ' + BORDE,
        '--tw-ring-color': AMARILLO,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl" aria-hidden="true">
          {disciplina.icono}
        </span>
        <span className="text-sm font-medium" style={{ color: TEXTO }}>
          {disciplina.nombre}
        </span>
      </div>

      <p
        className="text-xs leading-relaxed"
        style={{
          color:
            disciplina.resumen === 'Sin datos cargados' ? MUTED : SECUNDARIO,
        }}
      >
        {disciplina.resumen}
      </p>

      {disciplina.detalle && (
        <p className="text-xs mt-1 truncate" style={{ color: MUTED }}>
          {disciplina.detalle}
        </p>
      )}
    </button>
  )
}

function PerfilJugador({
  jugadorId,
  onVolver,
  onVerFichaMedica,
  onVerVideos,
  onVerNutricion,
  onVerPsicologia,
  onVerBienestar,
  onEditar,
}) {
  const [jugador, setJugador] = useState(null)
  const [estadisticas, setEstadisticas] = useState([])
  const [fichasMedicas, setFichasMedicas] = useState([])
  const [videos, setVideos] = useState([])
  const [historialCategorias, setHistorialCategorias] = useState([])
  const [asistencias, setAsistencias] = useState([])
  const [sesionesFisicas, setSesionesFisicas] = useState([])
  const [fichasNutricion, setFichasNutricion] = useState([])
  const [fichasPsicologicas, setFichasPsicologicas] = useState([])
  const [eliminando, setEliminando] = useState(false)
  const [filtroStat, setFiltroStat] = useState(null)
  const [mostrarPdf, setMostrarPdf] = useState(false)
  const [sesionFisicaSeleccionadaId, setSesionFisicaSeleccionadaId] =
    useState(null)
  const [resumenBienestar, setResumenBienestar] = useState(null)
  const [cmjHistorial, setCmjHistorial] = useState([])
  const [resumenBienestarMensual, setResumenBienestarMensual] = useState(null)
  const [asistenciaReciente, setAsistenciaReciente] = useState(null)

  useEffect(() => {
    let activo = true

    async function cargarDatos() {
      const { data: jugadorData, error: errorJugador } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .eq('id', jugadorId)
        .single()

      if (!activo) return

      if (errorJugador) {
        console.error('Error cargando ficha de la jugadora:', errorJugador)
        setJugador(null)
        return
      }

      setJugador(jugadorData)

      // Estadísticas correspondientes a partidos de Primera División.
      const { data: statsData, error: errorStats } = await supabase
        .from('estadisticas_jugador')
        .select('*, partidos(*)')
        .eq('jugador_id', jugadorId)
        .eq('partidos.categoria_id', CATEGORIA_PRIMERA_ID)

      if (!activo) return

      if (errorStats) {
        console.error(
          'Error cargando estadísticas de Primera División:',
          errorStats
        )
        setEstadisticas([])
      } else {
        setEstadisticas(statsData || [])
      }

      const { data: fichasData } = await supabase
        .from('fichas_medicas')
        .select('*')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })

      if (!activo) return
      setFichasMedicas(fichasData || [])

      const { data: videosData } = await supabase
        .from('videos')
        .select('*')
        .eq('jugador_id', jugadorId)
        .eq('tipo', 'individual')

      if (!activo) return
      setVideos(videosData || [])

      const { data: historialData } = await supabase
        .from('historial_categorias')
        .select(
          '*, categoria_anterior:categoria_anterior_id(nombre), categoria_nueva:categoria_nueva_id(nombre)'
        )
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })

      if (!activo) return
      setHistorialCategorias(historialData || [])

      const { data: asistenciasData } = await supabase
        .from('asistencias')
        .select('*')
        .eq('jugador_id', jugadorId)

      if (!activo) return
      setAsistencias(asistenciasData || [])

      const hoyRef = new Date()
      const fecha14 = fechaISO(
        new Date(
          hoyRef.getFullYear(),
          hoyRef.getMonth(),
          hoyRef.getDate() - 13
        )
      )

      const recientes = (asistenciasData || []).filter(
        (a) => a.fecha >= fecha14
      )

      const resumenReciente = recientes.reduce(
        (acc, a) => ({
          ...acc,
          [a.estado]: (acc[a.estado] || 0) + 1,
        }),
        { presente: 0, tarde: 0, ausente: 0, lesionado: 0, enfermo: 0 }
      )

      setAsistenciaReciente({
        resumen: resumenReciente,
        total: recientes.length,
      })

      const { data: fisicosData } = await supabase
        .from('sesiones_fisicas')
        .select('*, partidos(rival, fecha)')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: true })

      if (!activo) return
      setSesionesFisicas(fisicosData || [])

      const { data: cmjData } = await supabase
        .from('cmj')
        .select('fecha, valor_cm')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: true })

      if (!activo) return
      setCmjHistorial(cmjData || [])

      const fecha30 = fechaISO(
        new Date(
          hoyRef.getFullYear(),
          hoyRef.getMonth(),
          hoyRef.getDate() - 29
        )
      )

      const { data: bienestarMesData } = await supabase
        .from('bienestar')
        .select('sueno, dolor_muscular, fatiga, estres, animo_entrenar')
        .eq('jugador_id', jugadorId)
        .gte('fecha', fecha30)

      if (!activo) return

      const camposBienestar = [
        { clave: 'sueno', label: 'Sueño' },
        { clave: 'dolor_muscular', label: 'Dolor musc.' },
        { clave: 'fatiga', label: 'Fatiga' },
        { clave: 'estres', label: 'Estrés' },
        { clave: 'animo_entrenar', label: 'Ánimo' },
      ]

      const filasBienestarMes = bienestarMesData || []

      const resumenMes = camposBienestar.map((c) => {
        const valores = filasBienestarMes
          .map((f) => f[c.clave])
          .filter((v) => v !== null && v !== undefined)

        const promedio =
          valores.length > 0
            ? valores.reduce((a, b) => a + b, 0) / valores.length
            : null

        return { ...c, promedio }
      })

      setResumenBienestarMensual(
        filasBienestarMes.length > 0 ? resumenMes : null
      )

      const { data: nutricionData } = await supabase
        .from('fichas_nutricion')
        .select('*')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })

      if (!activo) return
      setFichasNutricion(nutricionData || [])

      const { data: psicologiaData } = await supabase
        .from('fichas_psicologicas')
        .select('*')
        .eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false })

      if (!activo) return
      setFichasPsicologicas(psicologiaData || [])

      const { metricas } = await cargarDatosBienestar(jugadorId, 'semana')

      if (!activo) return
      setResumenBienestar(metricas)
    }

    cargarDatos()

    return () => {
      activo = false
    }
  }, [jugadorId])

  async function handleEliminarJugador() {
    const confirmar = window.confirm(
      '¿Seguro que querés eliminar a ' + jugador.apellido + ', ' +
jugador.nombre + '? Esto también borra sus fichas médicas y videos asociados. Esta acción no se puede deshacer.'
    )

    if (!confirmar) return

    setEliminando(true)

    try {
      await supabase.from('fichas_medicas').delete().eq('jugador_id', jugadorId)
      await supabase.from('videos').delete().eq('jugador_id', jugadorId)
      await supabase
        .from('estadisticas_jugador')
        .delete()
        .eq('jugador_id', jugadorId)
      await supabase.from('citaciones').delete().eq('jugador_id', jugadorId)

      const { error } = await supabase
        .from('jugadores')
        .delete()
        .eq('id', jugadorId)

      if (error) {
        console.error('Error eliminando jugadora:', error)
        window.alert('No se pudo eliminar la jugadora. Revisá los permisos e intentá nuevamente.')
        return
      }

      onVolver()
    } catch (error) {
      console.error('Error eliminando jugadora:', error)
      window.alert('Ocurrió un error al eliminar la jugadora.')
    } finally {
      setEliminando(false)
    }
  }

  if (!jugador) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: FONDO }}
      >
        <p style={{ color: SECUNDARIO }}>Cargando perfil...</p>
      </div>
    )
  }

  const estado = estadoConfig[jugador.estado] || estadoConfig.disponible
  const edad = calcularEdad(jugador.fecha_nacimiento)
  const dorsal = obtenerDorsal(jugador)

  const estadisticasOrdenadas = [...estadisticas].sort((a, b) =>
    (b.partidos?.fecha || '').localeCompare(a.partidos?.fecha || '')
  )

  const ultimosPartidos = estadisticasOrdenadas.slice(0, 4)

  const totales = estadisticas.reduce(
    (acc, e) => ({
      partidos: acc.partidos + 1,
      titularidades: acc.titularidades + (e.titular ? 1 : 0),
      minutos: acc.minutos + (Number(e.minutos_jugados) || 0),
      goles: acc.goles + (Number(e.goles) || 0),
      asistencias: acc.asistencias + (Number(e.asistencias) || 0),
      amarillas: acc.amarillas + (Number(e.tarjetas_amarillas) || 0),
      rojas: acc.rojas + (Number(e.tarjetas_rojas) || 0),
    }),
    {
      partidos: 0,
      titularidades: 0,
      minutos: 0,
      goles: 0,
      asistencias: 0,
      amarillas: 0,
      rojas: 0,
    }
  )

  const estadisticasPorAnio = Object.values(
    estadisticas.reduce((acc, e) => {
      const anio = e.partidos?.fecha
        ? e.partidos.fecha.slice(0, 4)
        : 'Sin fecha'

      if (!acc[anio]) {
        acc[anio] = {
          anio,
          partidos: 0,
          minutos: 0,
          goles: 0,
          asistencias: 0,
        }
      }

      acc[anio].partidos += 1
      acc[anio].minutos += Number(e.minutos_jugados) || 0
      acc[anio].goles += Number(e.goles) || 0
      acc[anio].asistencias += Number(e.asistencias) || 0

      return acc
    }, {})
  ).sort((a, b) => b.anio.localeCompare(a.anio))

    
const statConfig = {
  partidos: {
    titulo: 'Partidos jugados',
    filtro: () => true,
    valor: (e) =>
      e.minutos_jugados !== null && e.minutos_jugados !== undefined
        ? String(e.minutos_jugados) + "'"
        : null,
  },
  titularidades: {
    titulo: 'Titularidades',
    filtro: (e) => !!e.titular,
    valor: (e) =>
      e.minutos_jugados !== null && e.minutos_jugados !== undefined
        ? String(e.minutos_jugados) + "'"
        : null,
  },
  goles: {
    titulo: 'Goles',
    filtro: (e) => (Number(e.goles) || 0) > 0,
    valor: (e) =>
      String(e.goles) + ' gol' + (e.goles > 1 ? 'es' : ''),
  },
  asistencias: {
    titulo: 'Asistencias',
    filtro: (e) => (Number(e.asistencias) || 0) > 0,
    valor: (e) => String(e.asistencias) + ' asist.',
  },
  amarillas: {
    titulo: 'Tarjetas amarillas',
    filtro: (e) => (Number(e.tarjetas_amarillas) || 0) > 0,
    valor: (e) =>
      String(e.tarjetas_amarillas) +
      ' amarilla' +
      (e.tarjetas_amarillas > 1 ? 's' : ''),
  },
  rojas: {
    titulo: 'Tarjetas rojas',
    filtro: (e) => (Number(e.tarjetas_rojas) || 0) > 0,
    valor: (e) =>
      String(e.tarjetas_rojas) + ' roja' + (e.tarjetas_rojas > 1 ? 's' : ''),
  },
}

  const ultimaFicha = fichasMedicas[0]
  const lesionesActivas = fichasMedicas.filter((f) => !f.recuperado).length

  const resumenAsistencia = asistencias.reduce(
    (acc, a) => ({
      ...acc,
      [a.estado]: (acc[a.estado] || 0) + 1,
    }),
    { presente: 0, tarde: 0, ausente: 0, lesionado: 0, enfermo: 0 }
  )

  const totalAsistenciaMarcada = asistencias.length

  const sesionesFisicasRecientes = sesionesFisicas.slice(-8)

  const datosDistanciaChart = sesionesFisicasRecientes
    .filter((s) => s.distancia_total_m !== null)
    .map((s) => ({
      valor: s.distancia_total_m,
      etiqueta: formatearFecha(s.fecha).slice(0, 5),
    }))

  const idSesionFisicaPorDefecto =
    sesionesFisicas[sesionesFisicas.length - 1]?.id || null

  const sesionFisicaSeleccionada = sesionesFisicas.find(
    (s) => s.id === (sesionFisicaSeleccionadaId || idSesionFisicaPorDefecto)
  )

  const datosPersonales = [
    {
      label: 'Fecha de nacimiento',
      valor: formatearFecha(jugador.fecha_nacimiento),
      extra: edad !== null ? String(edad) + ' años' : null,
    },
    {
      label: 'Pie hábil',
      valor: pieHabilLabel[jugador.pie_habil],
    },
    {
      label: 'Nacionalidad',
      valor: jugador.nacionalidad,
      extra: jugador.lugar_nacimiento,
    },
    {
      label: 'Pasaporte comunitario',
      valor: jugador.pasaporte_comunitario ? 'Sí' : null,
    },
    {
      label: 'Obra social',
      valor: jugador.obra_social,
      extra: jugador.nro_afiliado,
    },
    {
      label: 'Documento',
      valor: jugador.nro_documento,
    },
  ].filter((d) => d.valor)

  const disciplinas = [
    {
      nombre: 'Área médica',
      icono: '🩺',
      resumen:
  fichasMedicas.length === 0
    ? 'Sin datos cargados'
    : String(fichasMedicas.length) +
      ' registro' +
      (fichasMedicas.length !== 1 ? 's' : '') +
      (lesionesActivas > 0
        ? ' · ' +
          String(lesionesActivas) +
          ' activa' +
          (lesionesActivas !== 1 ? 's' : '')
        : ''),
detalle: ultimaFicha
  ? 'Último registro: ' +
    (ultimaFicha.descripcion || formatearFecha(ultimaFicha.fecha))
  : null,
      onClick: () => onVerFichaMedica?.(jugadorId),
    },
    {
      nombre: 'Nutrición',
      icono: '🥗',
     resumen:
  fichasNutricion.length === 0
    ? 'Sin datos cargados'
    : String(fichasNutricion.length) +
      ' registro' +
      (fichasNutricion.length !== 1 ? 's' : '') +
      (fichasNutricion[0]?.alerta_peso ? ' · alerta de peso' : ''),
      onClick: () => onVerNutricion?.(jugadorId),
    },
    {
     nombre: 'Psicología',
icono: '🧠',
resumen:
  fichasPsicologicas.length === 0
    ? 'Sin datos cargados'
    : String(fichasPsicologicas.length) +
      ' registro' +
      (fichasPsicologicas.length !== 1 ? 's' : ''),
onClick: () => onVerPsicologia?.(jugadorId),
},
   
 {
  nombre: 'Videoanálisis',
  icono: '🎥',
  resumen:
    videos.length === 0
      ? 'Sin datos cargados'
      : String(videos.length) +
        ' video' +
        (videos.length !== 1 ? 's' : ''),
  onClick: () => onVerVideos?.(jugadorId),
},
  ]

  if (filtroStat) {
    const config = statConfig[filtroStat]

    const partidosFiltrados = estadisticasOrdenadas.filter(config.filtro)

    return (
      <div
        className="min-h-screen px-4 py-6 md:p-10"
        style={{ backgroundColor: FONDO }}
      >
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => setFiltroStat(null)}
            className="text-sm mb-6 flex items-center gap-2 hover:opacity-70"
            style={{ color: SECUNDARIO }}
          >
            <span>←</span> Volver al perfil
          </button>

          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: AMARILLO }}
          >
            Primera División
          </p>

          <h1
            className="text-2xl md:text-3xl mb-1"
            style={{
              fontFamily: "'Archivo Black', sans-serif",
              color: TEXTO,
            }}
          >
            {config.titulo}
          </h1>

          <p className="text-sm mb-6" style={{ color: SECUNDARIO }}>
            {jugador.apellido}, {jugador.nombre}
          </p>

          {partidosFiltrados.length === 0 && (
            <p style={{ color: MUTED }}>
              No hay partidos registrados para esta estadística.
            </p>
          )}

          <div className="space-y-2">
            {partidosFiltrados.map((e) => (
              <div
                key={e.id}
                className="p-3 rounded-xl flex items-center justify-between gap-3"
                style={{
                  backgroundColor: TARJETA,
                  border: '1px solid ' + BORDE,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {e.partidos?.escudo_url ? (
                    <img
                      src={e.partidos.escudo_url}
                      alt={'Escudo de ' + (e.partidos.rival || 'rival')}
                      className="w-9 h-9 rounded-lg object-contain shrink-0"
                      style={{ backgroundColor: FONDO }}
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: FONDO, color: SECUNDARIO }}
                    >
                      🛡️
                    </div>
                  )}

                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: TEXTO }}
                    >
                      {e.partidos?.rival || 'Partido'}
                    </p>
                    <p className="text-xs" style={{ color: MUTED }}>
                      {formatearFecha(e.partidos?.fecha)}
                    </p>
                  </div>
                </div>

                {config.valor(e) && (
                  <span
                    className="text-xs font-mono px-2.5 py-1 rounded-lg shrink-0"
                    style={{ backgroundColor: FONDO, color: SECUNDARIO }}
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
    <div
      className="min-h-screen px-4 py-5 md:px-8 md:py-8"
      style={{ backgroundColor: FONDO }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Navegación y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={onVolver}
            className="text-sm flex items-center gap-2 hover:opacity-70"
            style={{ color: SECUNDARIO }}
          >
            <span>←</span> Volver al plantel
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEditar?.(jugadorId)}
              className="text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                backgroundColor: TARJETA,
                color: TEXTO,
                border: '1px solid ' + BORDE,
              }}
            >
              ✏️ Editar ficha
            </button>

            <button
              type="button"
              onClick={() => setMostrarPdf(true)}
              className="text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                backgroundColor: AMARILLO,
                color: '#171916',
                fontWeight: 700,
              }}
            >
              ↓ Exportar PDF
            </button>

            <button
              type="button"
              onClick={handleEliminarJugador}
              disabled={eliminando}
              className="text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                backgroundColor: TARJETA,
                color: '#F87171',
                border: '1px solid #65383D',
              }}
            >
              {eliminando ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>

        {/* Cabecera de la jugadora */}
        <section
          className="rounded-2xl overflow-hidden mb-6"
          style={{
            backgroundColor: TARJETA,
            border: '1px solid ' + BORDE,
          }}
        >
          <div
            className="h-1.5"
            style={{
             background:
  'linear-gradient(90deg, ' +
  AMARILLO +
  ' 0%, ' +
  AMARILLO +
  ' 35%, #3B3F36 35%, #3B3F36 100%)',
            }}
          />

          <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
              {jugador.foto_url ? (
                <img
                  src={jugador.foto_url}
                  alt={jugador.nombre + ' ' + jugador.apellido}
                  className="w-32 h-40 md:w-36 md:h-44 rounded-xl object-cover object-top shrink-0"
                  style={{
                    backgroundColor: FONDO,
                    border: '1px solid ' + BORDE,
                  }}
                />
              ) : (
                <div
                  className="w-32 h-40 md:w-36 md:h-44 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: FONDO,
                    border: '1px solid ' + BORDE,
                    color: AMARILLO,
                  }}
                >
                  <span
                    className="text-4xl font-bold"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    {iniciales(jugador.nombre, jugador.apellido)}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className="text-[10px] md:text-xs uppercase tracking-widest font-semibold"
                    style={{ color: AMARILLO }}
                  >
                    Comunicaciones · Primera División
                  </span>
                </div>

                <h1
                  className="text-2xl md:text-4xl leading-tight break-words"
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    color: TEXTO,
                  }}
                >
                  {jugador.nombre}
                  <br />
                  {jugador.apellido}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {(jugador.posicion || jugador.posicion_secundaria) && (
                    <span
                      className="text-xs px-2.5 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: FONDO,
color: TEXTO,
border: '1px solid ' + BORDE,
}}
>
  {jugador.posicion}
  {jugador.posicion_secundaria
    ? ' · ' + jugador.posicion_secundaria
    : ''}
</span>
)}

                  {dorsal !== null && dorsal !== '' && (
                    <span
                      className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                      style={{
                        backgroundColor: AMARILLO,
                        color: '#171916',
                      }}
                    >
                      N.º {dorsal}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span
                    className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-full"
                    style={{
                      backgroundColor: estado.color + '18',
                      color: estado.color,
                      border: '1px solid ' + estado.color + '50',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: estado.color }}
                    />
                    {estado.label}
                  </span>

                  {edad !== null && (
                    <span className="text-xs" style={{ color: SECUNDARIO }}>
                      {edad} años
                    </span>
                  )}

                  {pieHabilLabel[jugador.pie_habil] && (
                    <span className="text-xs" style={{ color: SECUNDARIO }}>
                      Pie hábil: {pieHabilLabel[jugador.pie_habil]}
                    </span>
                  )}
                </div>

                {jugador.estado_detalle && (
                  <p className="text-xs mt-3" style={{ color: SECUNDARIO }}>
                    {jugador.estado_detalle}
                  </p>
                )}

                {jugador.video_promocional && (
                  <a
                    href={jugador.video_promocional}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-xs mt-4 hover:opacity-80"
                    style={{ color: AMARILLO }}
                  >
                    ▶ Ver video promocional
                  </a>
                )}
              </div>
            </div>

            {(jugador.contacto_emergencia_nombre ||
              jugador.telefono_emergencia) && (
              <div
                className="flex items-start gap-3 p-3 rounded-xl mt-5"
                style={{
                  backgroundColor: FONDO,
                  border: '1px solid #65383D',
                }}
              >
                <span aria-hidden="true">🚨</span>
                <div className="min-w-0">
                  <p
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: '#F87171' }}
                  >
                    Contacto de emergencia
                  </p>
                  <p className="text-sm break-words" style={{ color: TEXTO }}>
                    {jugador.contacto_emergencia_nombre}
                    {jugador.contacto_emergencia_nombre &&
                      jugador.telefono_emergencia &&
                      ' · '}
                    {jugador.telefono_emergencia && (
                      <a
                        href={'tel:' + jugador.telefono_emergencia}
                        style={{ color: '#7DD3FC' }}
                      >
                        {jugador.telefono_emergencia}
                      </a>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Datos personales secundarios */}
        {datosPersonales.length > 0 && (
          <section className="mb-7">
            <details
              className="rounded-xl"
              style={{
                backgroundColor: TARJETA,
                border: '1px solid ' + BORDE,
              }}
            >
              <summary
                className="cursor-pointer p-3.5 text-sm font-medium"
                style={{ color: SECUNDARIO }}
              >
                Datos personales y administrativos
              </summary>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-3 pb-3">
                {datosPersonales.map((d) => (
                  <div
                    key={d.label}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: FONDO }}
                  >
                    <p
                      className="text-[10px] uppercase tracking-wide mb-1"
                      style={{ color: MUTED }}
                    >
                      {d.label}
                    </p>
                    <p className="text-sm break-words" style={{ color: TEXTO }}>
                      {d.valor}
                      {d.extra && (
                        <span style={{ color: SECUNDARIO }}>
                          {' · '}
                          {d.extra}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}

        {/* Estadísticas de temporada */}
        <section className="mb-8">
          <TituloSeccion
            titulo="Rendimiento en temporada"
            detalle="Primera División · Datos registrados en los partidos"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 md:gap-3">
            {[
              { label: 'Partidos', valor: totales.partidos, key: 'partidos' },
              {
                label: 'Titularidades',
                valor: totales.titularidades,
                key: 'titularidades',
              },
              { label: 'Minutos', valor: totales.minutos, key: null },
              { label: 'Goles', valor: totales.goles, key: 'goles' },
              {
                label: 'Asistencias',
                valor: totales.asistencias,
                key: 'asistencias',
              },
              {
                label: 'Amarillas',
                valor: totales.amarillas,
                key: 'amarillas',
                color: '#FBBF24',
              },
              {
                label: 'Rojas',
                valor: totales.rojas,
                key: 'rojas',
                color: '#F87171',
              },
            ].map((stat) => (
              <button
                type="button"
                key={stat.label}
                onClick={
                  stat.key ? () => setFiltroStat(stat.key) : undefined
                }
                disabled={!stat.key}
                className="min-w-0 p-3 md:p-4 rounded-xl text-left transition-all duration-200"
                style={{
                  backgroundColor: TARJETA,
                  border: '1px solid ' + BORDE,
                  cursor: stat.key ? 'pointer' : 'default',
                }}
              >
                <p
                  className="text-2xl md:text-3xl leading-none mb-2 break-words"
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    color: stat.color || (stat.key === 'goles' ? AMARILLO : TEXTO),
                  }}
                >
                  {formatearNumero(stat.valor)}
                </p>
                <p
                  className="text-[9px] md:text-[10px] uppercase tracking-wide leading-relaxed"
                  style={{ color: SECUNDARIO }}
                >
                  {stat.label}
                </p>
                {stat.key && (
                  <p className="text-[10px] mt-2" style={{ color: MUTED }}>
                    Ver detalle →
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Últimos cuatro partidos */}
        <section
          className="rounded-2xl p-3 md:p-5 mb-8"
          style={{
            backgroundColor: TARJETA,
            border: '1px solid ' + BORDE,
          }}
        >
          <TituloSeccion
            titulo="Últimos partidos"
            detalle="Las cuatro participaciones más recientes"
          />

          {ultimosPartidos.length === 0 ? (
            <div
              className="p-5 text-center rounded-xl"
              style={{ backgroundColor: FONDO }}
            >
              <p className="text-sm" style={{ color: SECUNDARIO }}>
                Todavía no hay partidos registrados para esta jugadora.
              </p>
            </div>
          ) : (
            <>
              {/* Tabla compacta para escritorio */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                   <tr style={{ borderBottom: '1px solid ' + BORDE }}>
                      {['Rival / fecha', 'Resultado', 'Min.', 'Goles', 'Asist.', 'Tarjetas'].map(
                        (titulo) => (
                          <th
                            key={titulo}
                            className="text-left font-medium text-xs px-2 py-3 whitespace-nowrap"
                            style={{ color: MUTED }}
                          >
                            {titulo}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ultimosPartidos.map((e) => {
                      const partido = e.partidos
                      const resultado = obtenerResultado(partido)
                      const amarillas = Number(e.tarjetas_amarillas) || 0
                      const rojas = Number(e.tarjetas_rojas) || 0

                      return (
                        <tr
                          key={e.id}
                          style={{ borderBottom: '1px solid ' + BORDE }}
                        >
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2.5 min-w-[150px]">
                              {partido?.escudo_url ? (
                                <img
                                  src={partido.escudo_url}
                                  alt={'Escudo de ' + (partido.rival || 'rival')}
                                  className="w-8 h-8 rounded-lg object-contain shrink-0"
                                  style={{ backgroundColor: FONDO }}
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                  style={{
                                    backgroundColor: FONDO,
                                    color: SECUNDARIO,
                                  }}
                                >
                                  🛡️
                                </div>
                              )}

                              <div className="min-w-0">
                                <p
                                  className="font-medium truncate max-w-[180px]"
                                  style={{ color: TEXTO }}
                                >
                                  {partido?.rival || 'Partido'}
                                </p>
                                <p className="text-xs" style={{ color: MUTED }}>
                                  {formatearFecha(partido?.fecha)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td
                            className="px-2 py-3 font-semibold whitespace-nowrap"
                            style={{ color: resultado ? TEXTO : MUTED }}
                          >
                            {resultado || '—'}
                          </td>

                          <td
                            className="px-2 py-3 whitespace-nowrap"
                            style={{ color: TEXTO }}
                          >
                            {e.minutos_jugados ?? '—'}
                            {e.minutos_jugados !== null &&
                            e.minutos_jugados !== undefined
                              ? '′'
                              : ''}
                          </td>

                          <td
                            className="px-2 py-3"
                            style={{
                              color: Number(e.goles) > 0 ? AMARILLO : SECUNDARIO,
                            }}
                          >
                            {e.goles ?? 0}
                          </td>

                          <td className="px-2 py-3" style={{ color: SECUNDARIO }}>
                            {e.asistencias ?? 0}
                          </td>

                          <td className="px-2 py-3 whitespace-nowrap">
                            <span style={{ color: '#FBBF24' }}>
                              {amarillas > 0 ? '🟨 ' + amarillas : ''}
                            </span>
                            {amarillas > 0 && rojas > 0 ? ' ' : ''}
                            <span style={{ color: '#F87171' }}>
                              {rojas > 0 ? '🟥 ' + rojas : ''}
                            </span>
                            {amarillas === 0 && rojas === 0 && (
                              <span style={{ color: MUTED }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Versión compacta para celular */}
              <div className="md:hidden space-y-2">
                {ultimosPartidos.map((e) => {
                  const partido = e.partidos
                  const resultado = obtenerResultado(partido)
                  const amarillas = Number(e.tarjetas_amarillas) || 0
                  const rojas = Number(e.tarjetas_rojas) || 0

                  return (
                    <div
                      key={e.id}
                      className="p-3 rounded-xl"
                      style={{
                        backgroundColor: FONDO,
                        border: '1px solid ' + BORDE,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {partido?.escudo_url ? (
                            <img
                              src={partido.escudo_url}
                              alt={'Escudo de ' + (partido.rival || 'rival')}
                              className="w-9 h-9 rounded-lg object-contain shrink-0"
                            />
                          ) : (
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: TARJETA }}
                            >
                              🛡️
                            </div>
                          )}

                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: TEXTO }}
                            >
                              {partido?.rival || 'Partido'}
                            </p>
                            <p className="text-xs" style={{ color: MUTED }}>
                              {formatearFecha(partido?.fecha)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className="text-base font-bold"
                            style={{ color: TEXTO }}
                          >
                            {resultado || '—'}
                          </p>
                          <p className="text-[10px]" style={{ color: MUTED }}>
                            Resultado
                          </p>
                        </div>
                      </div>

                      <div
                        className="grid grid-cols-4 gap-2 mt-3 pt-3"
                        style={{ borderTop: '1px solid ' + BORDE }}
                      >
                        {[
                          {
                            label: 'Minutos',
                            valor:
                              e.minutos_jugados !== null &&
                              e.minutos_jugados !== undefined
                                ? String(e.minutos_jugados) + '′'
                                : '—',
                          },
                          { label: 'Goles', valor: e.goles ?? 0 },
                          { label: 'Asist.', valor: e.asistencias ?? 0 },
                          {
                            label: 'Tarjetas',
                            valor:
                              amarillas + rojas > 0
                                ? String(amarillas) + '🟨 ' + String(rojas) + '🟥'
                                : '—',
                          },
                        ].map((stat) => (
                          <div key={stat.label} className="min-w-0">
                            <p
                              className="text-[9px] uppercase tracking-wide mb-1"
                              style={{ color: MUTED }}
                            >
                              {stat.label}
                            </p>
                            <p
                              className="text-xs font-medium break-words"
                              style={{ color: TEXTO }}
                            >
                              {stat.valor}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        {/* Comparativa anual */}
        {estadisticasPorAnio.length >= 2 && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Evolución por temporada"
              detalle="Comparativa histórica de Primera División"
            />

            <div
              className="overflow-x-auto rounded-xl"
              style={{ border: '1px solid ' + BORDE }}
            >
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: TARJETA }}>
                    {['Año', 'Partidos', 'Minutos', 'Goles', 'Asistencias'].map(
                      (titulo) => (
                        <th
                          key={titulo}
                          className="text-left p-3 whitespace-nowrap text-xs font-medium"
                          style={{ color: SECUNDARIO }}
                        >
                          {titulo}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {estadisticasPorAnio.map((a, i) => (
                    <tr
                      key={a.anio}
                      style={{
                        backgroundColor: i % 2 === 0 ? FONDO : TARJETA,
                        borderTop: '1px solid ' + BORDE,
                      }}
                    >
                      <td
                        className="p-3 font-medium whitespace-nowrap"
                        style={{ color: AMARILLO }}
                      >
                        {a.anio}
                      </td>
                      <td className="p-3" style={{ color: TEXTO }}>
                        {a.partidos}
                      </td>
                      <td className="p-3" style={{ color: SECUNDARIO }}>
                        {formatearNumero(a.minutos)}
                      </td>
                      <td className="p-3" style={{ color: TEXTO }}>
                        {a.goles}
                      </td>
                      <td className="p-3" style={{ color: TEXTO }}>
                        {a.asistencias}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Bienestar semanal */}
        {resumenBienestar && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Bienestar"
              detalle="Resumen de los últimos 7 días"
              accion={
                onVerBienestar && (
                  <button
                    type="button"
                    onClick={() => generarBienestarPDF(jugador, 'semana')}
                    className="text-xs px-3 py-2 rounded-lg hover:opacity-80"
                    style={{
                      backgroundColor: TARJETA,
                      color: SECUNDARIO,
                      border: '1px solid ' + BORDE,
                    }}
                  >
                    ↓ PDF
                  </button>
                )
              }
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {resumenBienestar.map((m) => {
                const colorTendencia =
                  m.tendencia === null
                    ? MUTED
                    : m.tendencia === 'estable'
                      ? SECUNDARIO
                      : m.clave === 'rpe'
                        ? '#FBBF24'
                        : m.tendencia === 'sube'
                          ? '#F87171'
                          : '#4ADE80'

                const flecha =
                  m.tendencia === 'sube'
                    ? '↑'
                    : m.tendencia === 'baja'
                      ? '↓'
                      : m.tendencia === 'estable'
                        ? '→'
                        : ''

                return (
                  <div
                    key={m.clave}
                    className="p-3 rounded-xl"
                    style={{
                      backgroundColor: TARJETA,
                      border: '1px solid ' + BORDE,
                    }}
                  >
                    <p
                      className="text-2xl font-semibold"
                      style={{ color: TEXTO }}
                    >
                      {m.promedioActual !== null
                        ? m.promedioActual.toFixed(1)
                        : '—'}
                    </p>
                    <p
                      className="text-[10px] uppercase tracking-wide mt-1"
                      style={{ color: MUTED }}
                    >
                      {m.label}
                    </p>
                    {flecha && (
                      <p
                        className="text-xs mt-2"
                        style={{ color: colorTendencia }}
                      >
                        {flecha}{' '}
                        {Math.abs(
                          (m.promedioActual ?? 0) -
                            (m.promedioAnterior ?? 0)
                        ).toFixed(1)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Áreas de seguimiento */}
        <section className="mb-8">
          <TituloSeccion
            titulo="Áreas de seguimiento"
            detalle="Acceso a la información complementaria de la jugadora"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {disciplinas.map((disciplina) => (
              <TarjetaArea key={disciplina.nombre} disciplina={disciplina} />
            ))}
          </div>
        </section>

        {/* Asistencia */}
        {totalAsistenciaMarcada > 0 && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Asistencia"
              detalle={String(totalAsistenciaMarcada) + ' registros acumulados'}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                {
                  label: 'Presentes',
                  valor: resumenAsistencia.presente,
                  color: '#4ADE80',
                },
                {
                  label: 'Llegadas tarde',
                  valor: resumenAsistencia.tarde,
                  color: '#FBBF24',
                },
                {
                  label: 'Ausencias',
                  valor: resumenAsistencia.ausente,
                  color: '#F87171',
                },
                {
                  label: 'Lesionada',
                  valor: resumenAsistencia.lesionado,
                  color: '#FB923C',
                },
                {
                  label: 'Enferma',
                  valor: resumenAsistencia.enfermo,
                  color: '#7DD3FC',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: TARJETA,
                    border: '1px solid ' + BORDE,
                  }}
                >
                  <p
                    className="text-2xl font-semibold"
                    style={{ color: item.color }}
                  >
                    {item.valor}
                  </p>
                  <p className="text-xs mt-1" style={{ color: SECUNDARIO }}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            {asistenciaReciente && (
              <p className="text-xs mt-3" style={{ color: MUTED }}>
                Últimos 14 días: {asistenciaReciente.total} registros.
              </p>
            )}
          </section>
        )}

        {/* Trayectoria */}
        {historialCategorias.length > 0 && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Trayectoria"
              detalle="Historial de categorías de la jugadora"
            />

            <div
              className="rounded-xl p-4 space-y-3"
              style={{
                backgroundColor: TARJETA,
                border: '1px solid ' + BORDE,
              }}
            >
              {historialCategorias.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3"
                  style={{ borderBottom: '1px solid ' + BORDE, paddingBottom: 12 }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: AMARILLO }}
                  />

                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: TEXTO }}>
                      {h.categoria_anterior?.nombre || '—'}
                      <span style={{ color: AMARILLO }}> → </span>
                      {h.categoria_nueva?.nombre || '—'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: MUTED }}>
                      {formatearFecha(h.fecha)}
                      {h.temporada ? ' · Temporada ' + h.temporada : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* GPS y rendimiento físico */}
        {sesionesFisicas.length > 0 && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Rendimiento físico"
              detalle="Sesiones GPS y datos de carga registrados"
            />

            <div
              className="rounded-2xl p-4 md:p-5"
              style={{
                backgroundColor: TARJETA,
                border: '1px solid ' + BORDE,
              }}
            >
              {datosDistanciaChart.length > 0 && (
                <div className="mb-5">
                  <p
                    className="text-xs uppercase tracking-wide mb-3"
                    style={{ color: SECUNDARIO }}
                  >
                    Distancia total (m) · Últimas sesiones
                  </p>
                  <div className="overflow-x-auto">
                    <MiniBarras
                      datos={datosDistanciaChart}
                      color={AMARILLO}
                    />
                  </div>
                </div>
              )}

              <label
                htmlFor="sesion-fisica"
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: SECUNDARIO }}
              >
                Consultar sesión
              </label>

              <select
                id="sesion-fisica"
                value={
                  sesionFisicaSeleccionadaId ||
                  idSesionFisicaPorDefecto ||
                  ''
                }
                onChange={(e) =>
                  setSesionFisicaSeleccionadaId(e.target.value)
                }
                className="w-full p-3 rounded-xl outline-none text-sm mb-4"
                style={{
                  backgroundColor: FONDO,
                  border: '1px solid ' + BORDE,
                  color: TEXTO,
                }}
              >
                {sesionesFisicas
                  .slice()
                  .reverse()
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatearFecha(s.fecha)}
                      {s.partidos
                        ? ' · vs ' + s.partidos.rival
                        : s.tipo === 'partido'
                          ? ' · Partido'
                          : ' · Entrenamiento'}
                    </option>
                  ))}
              </select>

              {sesionFisicaSeleccionada && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CAMPOS_FISICOS.map((c) => (
                    <div
                      key={c.clave}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: FONDO }}
                    >
                      <p
                        className="text-[10px] uppercase tracking-wide mb-1"
                        style={{ color: MUTED }}
                      >
                        {c.label}
                      </p>
                      <p className="text-sm" style={{ color: TEXTO }}>
                        {sesionFisicaSeleccionada[c.clave] ?? '—'}
                      </p>
                    </div>
                  ))}

                  <div
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: FONDO }}
                  >
                    <p
                      className="text-[10px] uppercase tracking-wide mb-1"
                      style={{ color: AMARILLO }}
                    >
                      RPE (1-10)
                    </p>
                    <p className="text-sm" style={{ color: TEXTO }}>
                      {sesionFisicaSeleccionada.rpe ?? '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Datos mensuales de bienestar */}
        {resumenBienestarMensual && (
          <section className="mb-8">
            <TituloSeccion
              titulo="Bienestar mensual"
              detalle="Promedios de los últimos 30 días"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {resumenBienestarMensual.map((item) => (
                <div
                  key={item.clave}
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: TARJETA,
                    border: '1px solid ' + BORDE,
                  }}
                >
                  <p className="text-xs mb-2" style={{ color: SECUNDARIO }}>
                    {item.label}
                  </p>
                  <p className="text-2xl font-semibold" style={{ color: TEXTO }}>
                    {item.promedio !== null
                      ? item.promedio.toFixed(1)
                      : '—'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Exportación del perfil */}
        <div className="pt-2 pb-8">
          <button
            type="button"
            onClick={() => setMostrarPdf(true)}
            className="w-full p-4 rounded-xl font-semibold text-sm transition-opacity hover:opacity-85"
            style={{
              backgroundColor: AMARILLO,
              color: '#171916',
            }}
          >
            ↓ Descargar informe completo de la jugadora
          </button>
        </div>
      </div>

      {mostrarPdf && (
        <PdfPerfilModal
          jugador={jugador}
          totales={totales}
          fichasMedicas={fichasMedicas}
          historialCategorias={historialCategorias}
          resumenAsistencia={resumenAsistencia}
          totalAsistenciaMarcada={totalAsistenciaMarcada}
          sesionesFisicas={sesionesFisicas}
          fichasNutricion={fichasNutricion}
          fichasPsicologicas={fichasPsicologicas}
          cmjHistorial={cmjHistorial}
          resumenBienestarMensual={resumenBienestarMensual}
          asistenciaReciente={asistenciaReciente}
          onCerrar={() => setMostrarPdf(false)}
        />
      )}
    </div>
 )
}

export default PerfilJugador
