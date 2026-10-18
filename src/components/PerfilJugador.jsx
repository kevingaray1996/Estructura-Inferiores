import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import PdfPerfilModal from './PdfPerfilModal'
import { CAMPOS_FISICOS } from '../utils/camposFisicos'
import { cargarDatosBienestar } from '../utils/bienestar'
import { generarBienestarPDF } from '../utils/generarBienestarPDF'

const COLORES = {
  fondo: '#101010',
  tarjeta: '#202020',
  borde: '#383838',
  texto: '#F5F5F5',
  secundario: '#B8B8B8',
  tenue: '#8A8A8A',
  amarillo: '#F6C900',
  amarilloOscuro: '#332B00',
}

const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
  suspendido: { color: '#F87171', label: 'Suspendido' },
  no_disponible: { color: COLORES.secundario, label: 'No disponible' },
}

const pieHabilLabel = {
  derecho: 'Derecho',
  izquierdo: 'Izquierdo',
  ambidiestro: 'Ambidiestro',
}

const recomendacionLabel = {
  continuidad: 'Continuidad',
  a_evaluar: 'A evaluar',
  no_continuidad: 'No continuidad',
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function MiniBarras({ datos, color }) {
  const valores = datos.map((d) => d.valor || 0)
  const max = Math.max(...valores, 1)
  const ancho = 26
  const gap = 6
  const alto = 60
  const svgAncho = datos.length * (ancho + gap)

  return (
    <svg viewBox={`0 0 ${svgAncho} ${alto + 16}`} width={svgAncho} height={alto + 16}>
      {datos.map((d, i) => {
        const h = (d.valor / max) * alto
        const x = i * (ancho + gap)

        return (
          <g key={i}>
            <rect x={x} y={alto - h} width={ancho} height={h} rx={3} fill={color} opacity={0.9} />
            <text x={x + ancho / 2} y={alto + 12} fontSize="8" fill={COLORES.tenue} textAnchor="middle">
              {d.etiqueta}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null

  const hoy = new Date()
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`)

  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--

  return edad
}

function formatearFecha(fecha) {
  if (!fecha) return null

  const [anio, mes, dia] = String(fecha).slice(0, 10).split('-')
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : fecha
}

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')

  return `${anio}-${mes}-${dia}`
}

function nombrePeriodo(periodo, tipo) {
  if (tipo === 'final' || String(periodo).startsWith('final-')) {
    const anio = String(periodo).replace('final-', '')
    return `Temporada ${anio}`
  }

  const [anio, mes] = String(periodo).split('-')
  const numeroMes = Number(mes)

  if (!anio || numeroMes < 1 || numeroMes > 12) return periodo

  const fecha = new Date(Number(anio), numeroMes - 1, 1)

  return fecha.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  }).replace(/^\p{L}/u, (letra) => letra.toUpperCase())
}

function valorPuntaje(valor) {
  if (valor === 'no_evaluo') return 'No evaluó'
  if (valor === null || valor === undefined || valor === '') return '—'
  return valor
}

function calcularResumenEvaluacion(evaluaciones, criterios) {
  const porCriterio = criterios.map((criterio) => {
    const valores = evaluaciones
      .map((evaluacion) => evaluacion.puntajes?.[criterio.id])
      .filter((valor) => {
        if (valor === 'no_evaluo' || valor == null || valor === '') return false
        const numero = Number(valor)
        return Number.isFinite(numero) && numero >= 1 && numero <= 5
      })
      .map(Number)

    return {
      criterio,
      promedio: valores.length
        ? valores.reduce((total, valor) => total + valor, 0) / valores.length
        : null,
      cantidad: valores.length,
    }
  })

  const promedios = porCriterio
    .map((item) => item.promedio)
    .filter((valor) => valor !== null)

  const general = promedios.length
    ? promedios.reduce((total, valor) => total + valor, 0) / promedios.length
    : null

  return { porCriterio, general }
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
  const [sesionFisicaSeleccionadaId, setSesionFisicaSeleccionadaId] = useState(null)
  const [resumenBienestar, setResumenBienestar] = useState(null)
  const [cmjHistorial, setCmjHistorial] = useState([])
  const [resumenBienestarMensual, setResumenBienestarMensual] = useState(null)
  const [asistenciaReciente, setAsistenciaReciente] = useState(null)

  // Historial de evaluaciones ya guardadas en Supabase
  const [evaluaciones, setEvaluaciones] = useState([])
  const [criteriosEvaluacion, setCriteriosEvaluacion] = useState([])
  const [evaluacionesCargando, setEvaluacionesCargando] = useState(true)
  const [evaluacionesError, setEvaluacionesError] = useState('')
  const [periodoAbierto, setPeriodoAbierto] = useState(null)

  useEffect(() => {
    let cancelado = false

    async function cargarDatos() {
      setJugador(null)
      setEvaluacionesCargando(true)
      setEvaluacionesError('')

      try {
        const { data: jugadorData, error: jugadorError } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('id', jugadorId)
          .single()

        if (jugadorError) throw jugadorError
        if (cancelado) return

        setJugador(jugadorData)

        const [
          statsRes,
          fichasRes,
          videosRes,
          historialRes,
          asistenciasRes,
          fisicosRes,
          cmjRes,
          nutricionRes,
          psicologiaRes,
          evaluacionesRes,
          criteriosRes,
        ] = await Promise.all([
          supabase
            .from('estadisticas_jugador')
            .select('*, partidos(rival, fecha, escudo_url)')
            .eq('jugador_id', jugadorId),

          supabase
            .from('fichas_medicas')
            .select('*')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: false }),

          supabase
            .from('videos')
            .select('*')
            .eq('jugador_id', jugadorId)
            .eq('tipo', 'individual'),

          supabase
            .from('historial_categorias')
            .select('*, categoria_anterior:categoria_anterior_id(nombre), categoria_nueva:categoria_nueva_id(nombre)')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: false }),

          supabase
            .from('asistencias')
            .select('*')
            .eq('jugador_id', jugadorId),

          supabase
            .from('sesiones_fisicas')
            .select('*, partidos(rival, fecha)')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: true }),

          supabase
            .from('cmj')
            .select('fecha, valor_cm')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: true }),

          supabase
            .from('fichas_nutricion')
            .select('*')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: false }),

          supabase
            .from('fichas_psicologicas')
            .select('*')
            .eq('jugador_id', jugadorId)
            .order('fecha', { ascending: false }),

          supabase
            .from('evaluaciones')
            .select('*')
            .eq('jugador_id', jugadorId)
            .order('periodo', { ascending: false }),

          supabase
            .from('evaluacion_criterios')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true }),
        ])

        if (cancelado) return

        setEstadisticas(statsRes.data || [])
        setFichasMedicas(fichasRes.data || [])
        setVideos(videosRes.data || [])
        setHistorialCategorias(historialRes.data || [])
        setAsistencias(asistenciasRes.data || [])
        setSesionesFisicas(fisicosRes.data || [])
        setCmjHistorial(cmjRes.data || [])
        setFichasNutricion(nutricionRes.data || [])
        setFichasPsicologicas(psicologiaRes.data || [])

        if (evaluacionesRes.error) {
          setEvaluacionesError('No se pudo cargar el historial de evaluaciones.')
          setEvaluaciones([])
        } else {
          setEvaluaciones(evaluacionesRes.data || [])
        }

        if (criteriosRes.error) {
          setEvaluacionesError('No se pudieron cargar los criterios de evaluación.')
          setCriteriosEvaluacion([])
        } else {
          setCriteriosEvaluacion(criteriosRes.data || [])
        }

        setEvaluacionesCargando(false)

        const asistenciasData = asistenciasRes.data || []
        const hoyRef = new Date()

        const fecha14 = fechaISO(
          new Date(hoyRef.getFullYear(), hoyRef.getMonth(), hoyRef.getDate() - 13)
        )

        const recientes = asistenciasData.filter((a) => a.fecha >= fecha14)

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

        const fecha30 = fechaISO(
          new Date(hoyRef.getFullYear(), hoyRef.getMonth(), hoyRef.getDate() - 29)
        )

        const { data: bienestarMesData } = await supabase
          .from('bienestar')
          .select('sueno, dolor_muscular, fatiga, estres, animo_entrenar')
          .eq('jugador_id', jugadorId)
          .gte('fecha', fecha30)

        if (cancelado) return

        const camposBienestar = [
          { clave: 'sueno', label: 'Sueño' },
          { clave: 'dolor_muscular', label: 'Dolor musc.' },
          { clave: 'fatiga', label: 'Fatiga' },
          { clave: 'estres', label: 'Estrés' },
          { clave: 'animo_entrenar', label: 'Ánimo' },
        ]

        const filasBienestarMes = bienestarMesData || []

        const resumenMes = camposBienestar.map((campo) => {
          const valores = filasBienestarMes
            .map((fila) => fila[campo.clave])
            .filter((valor) => valor !== null && valor !== undefined)

          return {
            ...campo,
            promedio: valores.length
              ? valores.reduce((a, b) => a + b, 0) / valores.length
              : null,
          }
        })

        setResumenBienestarMensual(filasBienestarMes.length ? resumenMes : null)

        const { metricas } = await cargarDatosBienestar(jugadorId, 'semana')

        if (!cancelado) setResumenBienestar(metricas)
      } catch (error) {
        console.error('Error al cargar el perfil:', error)
      } finally {
        if (!cancelado) setEvaluacionesCargando(false)
      }
    }

    cargarDatos()

    return () => {
      cancelado = true
    }
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORES.fondo }}>
        <p style={{ color: COLORES.tenue }}>Cargando...</p>
      </div>
    )
  }

  const estado = estadoConfig[jugador.estado] || estadoConfig.disponible
  const edad = calcularEdad(jugador.fecha_nacimiento)

  const totales = estadisticas.reduce(
    (acc, e) => ({
      partidos: acc.partidos + 1,
      titularidades: acc.titularidades + (e.titular ? 1 : 0),
      minutos: acc.minutos + (e.minutos_jugados || 0),
      goles: acc.goles + (e.goles || 0),
      asistencias: acc.asistencias + (e.asistencias || 0),
      amarillas: acc.amarillas + (e.tarjetas_amarillas || 0),
      rojas: acc.rojas + (e.tarjetas_rojas || 0),
    }),
    { partidos: 0, titularidades: 0, minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 }
  )

  const estadisticasPorAnio = Object.values(
    estadisticas.reduce((acc, e) => {
      const anio = e.partidos?.fecha ? e.partidos.fecha.slice(0, 4) : 'Sin fecha'

      if (!acc[anio]) {
        acc[anio] = { anio, partidos: 0, minutos: 0, goles: 0, asistencias: 0 }
      }

      acc[anio].partidos += 1
      acc[anio].minutos += e.minutos_jugados || 0
      acc[anio].goles += e.goles || 0
      acc[anio].asistencias += e.asistencias || 0

      return acc
    }, {})
  ).sort((a, b) => b.anio.localeCompare(a.anio))

  const statConfig = {
    partidos: {
      titulo: 'Partidos jugados',
      filtro: () => true,
      valor: (e) => (e.minutos_jugados ? `${e.minutos_jugados}'` : null),
    },
    titularidades: {
      titulo: 'Titularidades',
      filtro: (e) => !!e.titular,
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
      etiqueta: formatearFecha(s.fecha)?.slice(0, 5) || '',
    }))

  const idSesionFisicaPorDefecto = sesionesFisicas[sesionesFisicas.length - 1]?.id || null

  const sesionFisicaSeleccionada = sesionesFisicas.find(
    (s) => String(s.id) === String(sesionFisicaSeleccionadaId || idSesionFisicaPorDefecto)
  )

  const datosPersonales = [
    { label: 'Posición', valor: jugador.posicion, extra: jugador.posicion_secundaria },
    {
      label: 'Fecha nac.',
      valor: formatearFecha(jugador.fecha_nacimiento),
      extra: edad !== null ? `${edad} años` : null,
    },
    { label: 'Pie hábil', valor: pieHabilLabel[jugador.pie_habil] },
    { label: 'Documento', valor: jugador.nro_documento },
    { label: 'Nacionalidad', valor: jugador.nacionalidad, extra: jugador.lugar_nacimiento },
    { label: 'Pasaporte comunitario', valor: jugador.pasaporte_comunitario ? 'Sí' : null },
    { label: 'Obra social', valor: jugador.obra_social, extra: jugador.nro_afiliado },
  ].filter((d) => d.valor)

  const disciplinas = [
    {
      nombre: 'Kinesiología / Médica',
      icono: '🩺',
      resumen: fichasMedicas.length === 0
        ? 'Sin datos cargados'
        : `${fichasMedicas.length} registro${fichasMedicas.length > 1 ? 's' : ''}${lesionesActivas > 0 ? ` · ${lesionesActivas} activo${lesionesActivas > 1 ? 's' : ''}` : ''}`,
      detalle: ultimaFicha ? `Último: ${ultimaFicha.descripcion || ultimaFicha.fecha}` : null,
      onClick: () => onVerFichaMedica(jugadorId),
    },
    {
      nombre: 'Nutrición',
      icono: '🥗',
      resumen: fichasNutricion.length === 0
        ? 'Sin datos cargados'
        : `${fichasNutricion.length} registro${fichasNutricion.length > 1 ? 's' : ''}${fichasNutricion[0]?.alerta_peso ? ' · alerta de peso' : ''}`,
      onClick: () => onVerNutricion(jugadorId),
    },
    {
      nombre: 'Psicología',
      icono: '🧠',
      resumen: fichasPsicologicas.length === 0
        ? 'Sin datos cargados'
        : `${fichasPsicologicas.length} registro${fichasPsicologicas.length > 1 ? 's' : ''}`,
      onClick: () => onVerPsicologia(jugadorId),
    },
    {
      nombre: 'Videoanálisis',
      icono: '🎥',
      resumen: videos.length === 0
        ? 'Sin datos cargados'
        : `${videos.length} video${videos.length > 1 ? 's' : ''}`,
      onClick: () => onVerVideos(jugadorId),
    },
  ]

  // Agrupa las evaluaciones mensuales y finales por período.
  const evaluacionesPorPeriodo = Object.values(
    evaluaciones.reduce((grupos, evaluacion) => {
      if (!evaluacion.periodo) return grupos

      if (!grupos[evaluacion.periodo]) {
        grupos[evaluacion.periodo] = {
          periodo: evaluacion.periodo,
          tipo: evaluacion.tipo,
          evaluaciones: [],
        }
      }

      grupos[evaluacion.periodo].evaluaciones.push(evaluacion)
      return grupos
    }, {})
  ).sort((a, b) => b.periodo.localeCompare(a.periodo))

  if (filtroStat) {
    const config = statConfig[filtroStat]

    const partidosFiltrados = estadisticas
      .filter(config.filtro)
      .sort((a, b) => (b.partidos?.fecha || '').localeCompare(a.partidos?.fecha || ''))

    return (
      <div className="min-h-screen p-6 md:p-10" style={{ backgroundColor: COLORES.fondo }}>
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setFiltroStat(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.secundario }}
          >
            ← Volver al perfil
          </button>

          <h1 className="text-2xl md:text-3xl mb-1" style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}>
            {config.titulo}
          </h1>

          <p className="text-sm mb-6" style={{ color: COLORES.secundario }}>
            {jugador.apellido}, {jugador.nombre}
          </p>

          {partidosFiltrados.length === 0 && (
            <p style={{ color: COLORES.tenue }}>No hay partidos registrados todavía.</p>
          )}

          <div className="space-y-2">
            {partidosFiltrados.map((e) => (
              <div
                key={e.id}
                className="p-3.5 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
              >
                <div className="flex items-center gap-2.5">
                  {e.partidos?.escudo_url ? (
                    <img
                      src={e.partidos.escudo_url}
                      alt={e.partidos.rival}
                      className="w-7 h-7 rounded object-contain shrink-0"
                      style={{ backgroundColor: COLORES.fondo }}
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: COLORES.fondo, color: COLORES.tenue }}
                    >
                      🛡️
                    </span>
                  )}

                  <div>
                    <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                      {e.partidos ? `vs ${e.partidos.rival}` : 'Partido'}
                    </p>
                    <p className="text-xs" style={{ color: COLORES.tenue }}>
                      {e.partidos?.fecha}
                    </p>
                  </div>
                </div>

                {config.valor(e) && (
                  <span
                    className="text-xs font-mono px-2 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: COLORES.fondo, color: COLORES.amarillo }}
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
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: COLORES.fondo }}>
      <div className="max-w-4xl mx-auto">
        {/* Navegación y acciones */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            onClick={onVolver}
            className="text-sm flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.secundario }}
          >
            ← Volver al plantel
          </button>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onEditar(jugadorId)}
              className="text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
              style={{
                backgroundColor: COLORES.tarjeta,
                color: COLORES.amarillo,
                border: `1px solid ${COLORES.borde}`,
              }}
            >
              ✏️ Editar
            </button>

            <button
              onClick={handleEliminarJugador}
              disabled={eliminando}
              className="text-xs px-3 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                backgroundColor: COLORES.tarjeta,
                color: '#F87171',
                border: `1px solid ${COLORES.borde}`,
              }}
            >
              {eliminando ? 'Eliminando...' : '🗑 Eliminar'}
            </button>
          </div>
        </div>

        {/* Encabezado rediseñado */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 md:p-7 mb-5"
          style={{
            background: 'linear-gradient(135deg, #25251F 0%, #171717 60%, #101010 100%)',
            border: `1px solid ${COLORES.borde}`,
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5"
            style={{ backgroundColor: COLORES.amarillo }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {jugador.foto_url ? (
              <img
                src={jugador.foto_url}
                alt={`${jugador.apellido}, ${jugador.nombre}`}
                className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover shrink-0"
                style={{
                  border: `2px solid ${COLORES.amarillo}`,
                  backgroundColor: COLORES.fondo,
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center w-32 h-32 md:w-40 md:h-40 rounded-2xl shrink-0 text-3xl font-bold"
                style={{
                  backgroundColor: COLORES.amarilloOscuro,
                  border: `2px solid ${COLORES.amarillo}`,
                  color: COLORES.amarillo,
                  fontFamily: "'Archivo Black', sans-serif",
                }}
              >
                {iniciales(jugador.nombre, jugador.apellido)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] uppercase tracking-[0.25em] mb-2"
                style={{ color: COLORES.amarillo }}
              >
                Perfil de jugadora
              </p>

              <h1
                className="text-2xl md:text-4xl leading-tight break-words"
                style={{
                  fontFamily: "'Archivo Black', sans-serif",
                  color: COLORES.texto,
                }}
              >
                {jugador.apellido}, {jugador.nombre}
              </h1>

              <div className="flex flex-wrap gap-2 items-center mt-4">
                <span
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: `${estado.color}18`,
                    color: estado.color,
                    border: `1px solid ${estado.color}66`,
                  }}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: estado.color }} />
                  {estado.label}
                </span>

                <span
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: COLORES.amarilloOscuro,
                    color: COLORES.amarillo,
                    border: `1px solid ${COLORES.amarillo}55`,
                  }}
                >
                  {jugador.categorias?.nombre || 'Sin categoría'}
                </span>
              </div>

              {jugador.estado_detalle && (
                <p className="text-sm mt-3" style={{ color: COLORES.secundario }}>
                  {jugador.estado_detalle}
                </p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-xs" style={{ color: COLORES.secundario }}>
                {jugador.posicion && <span>⚽ {jugador.posicion}</span>}
                {edad !== null && <span>◷ {edad} años</span>}
                {pieHabilLabel[jugador.pie_habil] && <span>Pie {pieHabilLabel[jugador.pie_habil].toLowerCase()}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Datos secundarios desplegables */}
        <details
          className="mb-5 rounded-xl overflow-hidden"
          style={{
            backgroundColor: COLORES.tarjeta,
            border: `1px solid ${COLORES.borde}`,
          }}
        >
          <summary className="p-4 cursor-pointer flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold" style={{ color: COLORES.texto }}>
                Datos personales
              </span>
              <span className="block text-xs mt-1" style={{ color: COLORES.tenue }}>
                Información complementaria de la jugadora
              </span>
            </span>
            <span style={{ color: COLORES.amarillo }}>＋</span>
          </summary>

          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {datosPersonales.map((d) => (
              <div
                key={d.label}
                className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: COLORES.fondo, border: `1px solid ${COLORES.borde}` }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: COLORES.tenue }}>
                  {d.label}
                </p>
                <p className="text-sm" style={{ color: COLORES.texto }}>
                  {d.valor}
                  {d.extra && <span style={{ color: COLORES.secundario }}> · {d.extra}</span>}
                </p>
              </div>
            ))}
          </div>
        </details>

        {(jugador.contacto_emergencia_nombre || jugador.telefono_emergencia) && (
          <details
            className="mb-5 rounded-xl overflow-hidden"
            style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
          >
            <summary className="p-4 cursor-pointer flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: COLORES.texto }}>
                  Contacto de emergencia
                </span>
                <span className="block text-xs mt-1" style={{ color: COLORES.tenue }}>
                  Datos para situaciones de urgencia
                </span>
              </span>
              <span style={{ color: '#F87171' }}>＋</span>
            </summary>

            <div className="px-4 pb-4">
              {jugador.contacto_emergencia_nombre && (
                <p className="text-sm mb-2" style={{ color: COLORES.texto }}>
                  {jugador.contacto_emergencia_nombre}
                </p>
              )}

              {jugador.telefono_emergencia && (
                <a href={`tel:${jugador.telefono_emergencia}`} className="text-sm" style={{ color: COLORES.amarillo }}>
                  {jugador.telefono_emergencia}
                </a>
              )}
            </div>
          </details>
        )}

        {jugador.video_promocional && (
          <a
            href={jugador.video_promocional}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition-opacity"
            style={{ color: COLORES.amarillo }}
          >
            🎬 Ver video promocional
          </a>
        )}

        {/* Estadísticas */}
        <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.amarillo }}>
          Rendimiento deportivo
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-8">
          {[
            { label: 'Partidos', valor: totales.partidos, key: 'partidos' },
            { label: 'Titular', valor: totales.titularidades, key: 'titularidades' },
            { label: 'Minutos', valor: totales.minutos, key: null },
            { label: 'Goles', valor: totales.goles, key: 'goles' },
            { label: 'Asist.', valor: totales.asistencias, key: 'asistencias' },
            { label: 'Amar.', valor: totales.amarillas, key: 'amarillas' },
            { label: 'Rojas', valor: totales.rojas, key: 'rojas' },
          ].map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={stat.key ? () => setFiltroStat(stat.key) : undefined}
              className="p-3 rounded-xl text-center transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: COLORES.tarjeta,
                border: `1px solid ${COLORES.borde}`,
                borderBottom: `2px solid ${COLORES.amarillo}`,
                cursor: stat.key ? 'pointer' : 'default',
              }}
            >
              <p className="text-xl" style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.amarillo }}>
                {stat.valor}
              </p>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: COLORES.secundario }}>
                {stat.label}
              </p>
            </button>
          ))}
        </div>

        {/* Historial de evaluaciones */}
        <section className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <p className="text-xs tracking-widest uppercase mb-1" style={{ color: COLORES.amarillo }}>
                Seguimiento del cuerpo técnico
              </p>
              <h2 className="text-2xl font-bold" style={{ color: COLORES.texto }}>
                Evaluaciones
              </h2>
            </div>

            <span
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ backgroundColor: COLORES.amarilloOscuro, color: COLORES.amarillo }}
            >
              {evaluacionesPorPeriodo.length} período{evaluacionesPorPeriodo.length !== 1 ? 's' : ''}
            </span>
          </div>

          {evaluacionesCargando ? (
            <div className="p-5 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
              <p className="text-sm" style={{ color: COLORES.secundario }}>Cargando historial de evaluaciones...</p>
            </div>
          ) : evaluacionesError ? (
            <div className="p-5 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
              <p className="text-sm" style={{ color: '#FBBF24' }}>{evaluacionesError}</p>
            </div>
          ) : evaluacionesPorPeriodo.length === 0 ? (
            <div className="p-5 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
              <p className="text-sm font-semibold" style={{ color: COLORES.texto }}>
                Todavía no hay evaluaciones registradas
              </p>
              <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                Cuando el cuerpo técnico guarde una evaluación mensual o final, aparecerá en este historial.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {evaluacionesPorPeriodo.map((grupo) => {
                const abierto = periodoAbierto === grupo.periodo
                const resumen = calcularResumenEvaluacion(grupo.evaluaciones, criteriosEvaluacion)
                const esFinal = grupo.tipo === 'final' || grupo.periodo.startsWith('final-')

                return (
                  <article
                    key={grupo.periodo}
                    className="rounded-xl overflow-hidden"
                    style={{
                      backgroundColor: COLORES.tarjeta,
                      border: `1px solid ${abierto ? COLORES.amarillo : COLORES.borde}`,
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={abierto}
                      onClick={() => setPeriodoAbierto(abierto ? null : grupo.periodo)}
                      className="w-full text-left p-4 flex items-center gap-3"
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: COLORES.amarilloOscuro, color: COLORES.amarillo }}
                      >
                        {esFinal ? '★' : '▤'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: COLORES.texto }}>
                          {esFinal ? `Evaluación final · ${nombrePeriodo(grupo.periodo, grupo.tipo)}` : nombrePeriodo(grupo.periodo, grupo.tipo)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                          {grupo.evaluaciones.length} evaluador{grupo.evaluaciones.length !== 1 ? 'es' : ''}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold" style={{ color: COLORES.amarillo }}>
                          {resumen.general === null ? '—' : resumen.general.toFixed(1)}
                        </p>
                        <p className="text-[10px]" style={{ color: COLORES.tenue }}>
                          Promedio / 5
                        </p>
                      </div>

                      <span className="text-lg ml-1" style={{ color: COLORES.secundario }}>
                        {abierto ? '−' : '+'}
                      </span>
                    </button>

                    {abierto && (
                      <div className="p-4 space-y-5" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
                        <div>
                          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.amarillo }}>
                            Promedio por criterio
                          </p>

                          {resumen.porCriterio.length === 0 ? (
                            <p className="text-sm" style={{ color: COLORES.secundario }}>
                              No hay criterios disponibles.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {resumen.porCriterio.map(({ criterio, promedio, cantidad }) => (
                                <div key={criterio.id}>
                                  <div className="flex justify-between gap-3 mb-1">
                                    <span className="text-sm" style={{ color: COLORES.texto }}>
                                      {criterio.nombre}
                                    </span>
                                    <span className="text-sm font-semibold shrink-0" style={{ color: COLORES.amarillo }}>
                                      {promedio === null ? '—' : promedio.toFixed(1)}
                                    </span>
                                  </div>

                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORES.borde }}>
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${promedio === null ? 0 : (promedio / 5) * 100}%`,
                                        backgroundColor: COLORES.amarillo,
                                      }}
                                    />
                                  </div>

                                  <p className="text-[10px] mt-1" style={{ color: COLORES.tenue }}>
                                    {cantidad} puntuación{cantidad !== 1 ? 'es' : ''} válida{cantidad !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.amarillo }}>
                            Detalle por evaluador
                          </p>

                          <div className="space-y-3">
                            {grupo.evaluaciones.map((evaluacion, indice) => (
                              <div
                                key={evaluacion.id || `${evaluacion.evaluador_id}-${indice}`}
                                className="rounded-xl p-4"
                                style={{ backgroundColor: COLORES.fondo, border: `1px solid ${COLORES.borde}` }}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                  <p className="text-sm font-semibold" style={{ color: COLORES.texto }}>
                                    {evaluacion.evaluador_nombre || 'Evaluador'}
                                  </p>
                                  <span
                                    className="text-[10px] px-2 py-1 rounded-full"
                                    style={{ backgroundColor: COLORES.tarjeta, color: COLORES.secundario }}
                                  >
                                    {esFinal ? 'Final de temporada' : 'Evaluación mensual'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {criteriosEvaluacion.map((criterio) => (
                                    <div
                                      key={criterio.id}
                                      className="p-3 rounded-lg"
                                      style={{ backgroundColor: COLORES.tarjeta }}
                                    >
                                      <p className="text-xs mb-2" style={{ color: COLORES.secundario }}>
                                        {criterio.nombre}
                                      </p>

                                      <div className="flex items-center gap-1.5">
                                        {[1, 2, 3, 4, 5].map((numero) => {
                                          const valor = evaluacion.puntajes?.[criterio.id]
                                          const activo = valor !== 'no_evaluo' && Number(valor) === numero

                                          return (
                                            <span
                                              key={numero}
                                              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                                              style={{
                                                backgroundColor: activo ? COLORES.amarillo : COLORES.fondo,
                                                color: activo ? '#111111' : COLORES.tenue,
                                                border: `1px solid ${activo ? COLORES.amarillo : COLORES.borde}`,
                                              }}
                                            >
                                              {numero}
                                            </span>
                                          )
                                        })}

                                        <span className="text-xs ml-1" style={{ color: COLORES.secundario }}>
                                          {valorPuntaje(evaluacion.puntajes?.[criterio.id])}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {[
                                  ['Fortalezas', evaluacion.fortalezas],
                                  ['A mejorar', evaluacion.a_mejorar],
                                  ['Comentario', evaluacion.comentario],
                                  ['Proyección próxima temporada', evaluacion.proyeccion],
                                ].map(([titulo, contenido]) => (
                                  contenido ? (
                                    <div key={titulo} className="mt-4">
                                      <p className="text-xs font-semibold mb-1" style={{ color: COLORES.amarillo }}>
                                        {titulo}
                                      </p>
                                      <p className="text-sm whitespace-pre-wrap break-words" style={{ color: COLORES.secundario }}>
                                        {contenido}
                                      </p>
                                    </div>
                                  ) : null
                                ))}

                                {evaluacion.recomendacion && (
                                  <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
                                    <p className="text-xs mb-1" style={{ color: COLORES.secundario }}>
                                      Recomendación para la próxima temporada
                                    </p>
                                    <span
                                      className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full"
                                      style={{
                                        backgroundColor: COLORES.amarilloOscuro,
                                        color: COLORES.amarillo,
                                      }}
                                    >
                                      {recomendacionLabel[evaluacion.recomendacion] || evaluacion.recomendacion}
                                    </span>
                                  </div>
                                )}

                                {!evaluacion.fortalezas &&
                                  !evaluacion.a_mejorar &&
                                  !evaluacion.comentario &&
                                  !evaluacion.proyeccion &&
                                  !evaluacion.recomendacion && (
                                    <p className="text-xs mt-3" style={{ color: COLORES.tenue }}>
                                      No se agregaron comentarios para esta evaluación.
                                    </p>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* Comparativa por año */}
        {estadisticasPorAnio.length >= 2 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.amarillo }}>
              Comparativa por año
            </p>

            <div className="overflow-x-auto rounded-xl mb-8" style={{ border: `1px solid ${COLORES.borde}` }}>
              <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: COLORES.tarjeta }}>
                    {['Año', 'Partidos', 'Minutos', 'Goles', 'Asist.'].map((titulo) => (
                      <th key={titulo} className="text-left p-2.5 whitespace-nowrap" style={{ color: COLORES.amarillo }}>
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {estadisticasPorAnio.map((a, i) => (
                    <tr key={a.anio} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#191919' }}>
                      {[a.anio, a.partidos, a.minutos, a.goles, a.asistencias].map((valor, indice) => (
                        <td
                          key={indice}
                          className="p-2.5 whitespace-nowrap"
                          style={{ color: indice === 0 ? COLORES.texto : COLORES.secundario }}
                        >
                          {valor}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Bienestar semanal */}
        {resumenBienestar && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs tracking-widest uppercase" style={{ color: COLORES.amarillo }}>
                Bienestar · últimos 7 días
              </p>

              {onVerBienestar && (
                <button
                  onClick={() => generarBienestarPDF(jugador, 'semana')}
                  className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ backgroundColor: COLORES.tarjeta, color: COLORES.amarillo, border: `1px solid ${COLORES.borde}` }}
                >
                  📄 PDF
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-8">
              {resumenBienestar.map((m) => {
                const colorTendencia =
                  m.tendencia === null
                    ? COLORES.tenue
                    : m.tendencia === 'estable'
                      ? COLORES.secundario
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

                const tieneComparacion =
                  m.promedioActual !== null &&
                  m.promedioActual !== undefined &&
                  m.promedioAnterior !== null &&
                  m.promedioAnterior !== undefined

                return (
                  <div key={m.clave} className="p-3 rounded-xl text-center" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                    <p className="text-lg font-mono" style={{ color: COLORES.texto }}>
                      {m.promedioActual !== null && m.promedioActual !== undefined ? m.promedioActual.toFixed(1) : '—'}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: COLORES.secundario }}>
                      {m.label}
                    </p>
                    {flecha && tieneComparacion && (
                      <p className="text-xs" style={{ color: colorTendencia }}>
                        {flecha} {Math.abs(m.promedioActual - m.promedioAnterior).toFixed(1)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Áreas */}
        <p className="text-xs tracking-widest uppercase mb-3" style={{ color: COLORES.amarillo }}>
          Áreas
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {disciplinas.map((d) => (
            <button
              type="button"
              key={d.nombre}
              onClick={d.onClick}
              className="p-4 rounded-xl text-left hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}
            >
              <p className="text-2xl mb-2">{d.icono}</p>
              <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                {d.nombre}
              </p>
              <p className="text-xs mt-1" style={{ color: d.resumen === 'Sin datos cargados' ? COLORES.tenue : COLORES.amarillo }}>
                {d.resumen}
              </p>
              {d.detalle && (
                <p className="text-xs mt-1 truncate" style={{ color: COLORES.secundario }}>
                  {d.detalle}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Asistencia */}
        {totalAsistenciaMarcada > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: COLORES.amarillo }}>
              Asistencia
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: 'Presentes', valor: resumenAsistencia.presente, color: '#4ADE80' },
                { label: 'Tardes', valor: resumenAsistencia.tarde, color: '#FBBF24' },
                { label: 'Ausentes', valor: resumenAsistencia.ausente, color: '#F87171' },
                { label: 'Lesionadas', valor: resumenAsistencia.lesionado, color: '#FB923C' },
                { label: 'Enfermas', valor: resumenAsistencia.enfermo, color: '#7DD3FC' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                  <p className="text-xl font-bold" style={{ color: item.color }}>{item.valor}</p>
                  <p className="text-xs" style={{ color: COLORES.secundario }}>{item.label}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Trayectoria */}
        {historialCategorias.length > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: COLORES.amarillo }}>
              Trayectoria
            </p>

            <div className="space-y-2">
              {historialCategorias.map((h) => (
                <div key={h.id} className="p-3 rounded-lg" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
                  <p className="text-sm" style={{ color: COLORES.texto }}>
                    <span style={{ color: COLORES.tenue }}>{formatearFecha(h.fecha)}</span>
                    {' · '}
                    {h.categoria_anterior?.nombre || '—'} → {h.categoria_nueva?.nombre || '—'}
                  </p>
                  {h.temporada && (
                    <p className="text-xs mt-1" style={{ color: COLORES.secundario }}>
                      Temporada {h.temporada}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Físico / GPS */}
        {sesionesFisicas.length > 0 && (
          <>
            <p className="text-xs tracking-widest uppercase mb-3 mt-8" style={{ color: COLORES.amarillo }}>
              Físico · GPS
            </p>

            <div className="p-4 rounded-xl" style={{ backgroundColor: COLORES.tarjeta, border: `1px solid ${COLORES.borde}` }}>
              {datosDistanciaChart.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: COLORES.secundario }}>
                    Distancia total (m) · últimas sesiones
                  </p>
                  <div className="overflow-x-auto mb-4">
                    <MiniBarras datos={datosDistanciaChart} color={COLORES.amarillo} />
                  </div>
                </>
              )}

              <label className="text-[10px] uppercase tracking-wide block mb-2" style={{ color: COLORES.secundario }}>
                Ver sesión
              </label>

              <select
                value={sesionFisicaSeleccionadaId || idSesionFisicaPorDefecto || ''}
                onChange={(e) => setSesionFisicaSeleccionadaId(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm mb-3"
                style={{ backgroundColor: COLORES.fondo, border: `1px solid ${COLORES.borde}`, color: COLORES.texto }}
              >
                {sesionesFisicas.slice().reverse().map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatearFecha(s.fecha)}
                    {s.partidos ? ` · vs ${s.partidos.rival}` : s.tipo === 'partido' ? ' · Partido' : ' · Entrenamiento'}
                  </option>
                ))}
              </select>

              {sesionFisicaSeleccionada && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg" style={{ backgroundColor: COLORES.fondo }}>
                  {CAMPOS_FISICOS.map((campo) => (
                    <div key={campo.clave}>
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: COLORES.secundario }}>
                        {campo.label}
                      </p>
                      <p className="text-sm" style={{ color: COLORES.texto }}>
                        {sesionFisicaSeleccionada[campo.clave] ?? '—'}
                      </p>
                    </div>
                  ))}

                  <div>
                    <p className="text-[9px] uppercase tracking-wide" style={{ color: COLORES.amarillo }}>
                      RPE (1-10)
                    </p>
                    <p className="text-sm" style={{ color: COLORES.texto }}>
                      {sesionFisicaSeleccionada.rpe ?? '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* PDF del perfil existente */}
        <button
          onClick={() => setMostrarPdf(true)}
          className="w-full mt-8 p-3 rounded-xl font-medium text-sm transition-opacity hover:opacity-80"
          style={{ backgroundColor: COLORES.amarillo, color: '#111111', border: `1px solid ${COLORES.amarillo}` }}
        >
          📄 Descargar PDF del perfil
        </button>
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
