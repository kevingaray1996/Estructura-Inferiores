import { filtrarSeccionesVisibles } from '../config/visibilidadSecciones'
import { estadoErrorPerfil, calcularEdad, formatearFecha, fechaISO, pieHabilLabel } from './perfil/presentacionPerfil'
import CabeceraPerfil from './perfil/CabeceraPerfil'
import IndicadoresPerfil from './perfil/IndicadoresPerfil'
import EvaluacionesPerfil from './perfil/EvaluacionesPerfil'
import SeguimientoPerfil from './perfil/SeguimientoPerfil'
import DatosPerfil from './perfil/DatosPerfil'
import DocumentosPerfil from './perfil/DocumentosPerfil'
import ComparativaAnualPerfil from './perfil/ComparativaAnualPerfil'
import DetalleEstadisticaPerfil from './perfil/DetalleEstadisticaPerfil'
import FuentePerfil from './perfil/FuentePerfil'
import ResumenDeportivoPerfil from './perfil/ResumenDeportivoPerfil'
import GraficoTemporadasPerfil from './perfil/GraficoTemporadasPerfil'
import PestanasAccesibles from './ui/PestanasAccesibles'
import EncabezadoSeccion from './ui/EncabezadoSeccion'
import EstadoContenido from './ui/EstadoContenido'
import { puedeVerMedicos } from '../utils/mapaCorporal'
import './perfil/perfilPremium.css'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import PdfPerfilModal from './PdfPerfilModal'
import { cargarDatosBienestar } from '../utils/bienestar'
import { generarBienestarPDF } from '../utils/generarBienestarPDF'

function PerfilJugador({
  jugadorId,
  perfil,
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

  const [evaluaciones, setEvaluaciones] = useState([])
  const [criteriosEvaluacion, setCriteriosEvaluacion] = useState([])
  const [evaluacionesCargando, setEvaluacionesCargando] = useState(true)
  const [evaluacionesError, setEvaluacionesError] = useState('')
  const [periodoAbierto, setPeriodoAbierto] = useState(null)
  const [mostrarEvaluaciones, setMostrarEvaluaciones] = useState(true)
  const [pestana, setPestana] = useState('resumen')
  const [lectura, setLectura] = useState({ id: null, estado: 'cargando', fuentes: {} })
  const [generandoWellness, setGenerandoWellness] = useState(false)
  const [errorWellnessPDF, setErrorWellnessPDF] = useState('')

  useEffect(() => {
    let cancelado = false

    async function cargarDatos() {
      const fuentes = {}
      let errorPrincipal = null
      setLectura({ id: jugadorId, estado: 'cargando', fuentes: {} })
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
        ].map(q => Promise.resolve(q).catch(error => ({ error }))))

        if (cancelado) return

        for (const [clave, respuesta] of Object.entries({ estadisticas: statsRes, medicas: fichasRes, videos: videosRes, historial: historialRes, asistencias: asistenciasRes, fisicos: fisicosRes, cmj: cmjRes, nutricion: nutricionRes, psicologia: psicologiaRes, evaluaciones: evaluacionesRes, criterios: criteriosRes })) fuentes[clave] = { error: respuesta.error || null }
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

        const { data: bienestarMesData, error: bienestarMesError } = await supabase
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

        fuentes.wellnessMes = { error: bienestarMesError || null }
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

        try {
          const { metricas } = await cargarDatosBienestar(jugadorId, 'semana', { exigirLectura: true })
          fuentes.wellness = { error: null }
          if (!cancelado) setResumenBienestar(metricas)
        } catch (error) { fuentes.wellness = { error }; if (!cancelado) setResumenBienestar(null) }
      } catch (error) {
        errorPrincipal = error
        console.error('Error al cargar el perfil:', error)
      } finally {
        if (!cancelado) {
          setEvaluacionesCargando(false)
          setLectura({ id: jugadorId, estado: errorPrincipal ? 'error' : 'listo', fuentes, error: errorPrincipal })
        }
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

  if (lectura.id !== jugadorId || lectura.estado === 'cargando') return <div className="perfil-premium"><EstadoContenido estado="cargando" titulo="Cargando perfil" mensaje="Consultando la jugadora y sus fuentes. No se muestran registros anteriores." /></div>
  if (lectura.estado === 'error' || !jugador) return <div className="perfil-premium"><EstadoContenido estado={estadoErrorPerfil(lectura.error)} titulo="No se pudo abrir el perfil" mensaje="La jugadora no está disponible o la lectura falló. No se interpreta como ausencia de registros." /><button type="button" onClick={onVolver}>Volver al plantel</button></div>

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
    { label: 'Posición principal', valor: jugador.posicion },
    { label: 'Posición alternativa', valor: jugador.posicion_secundaria },
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

  const disciplinas = filtrarSeccionesVisibles([
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
      seccion: 'nutricion',
      icono: '🥗',
      resumen: fichasNutricion.length === 0
        ? 'Sin datos cargados'
        : `${fichasNutricion.length} registro${fichasNutricion.length > 1 ? 's' : ''}${fichasNutricion[0]?.alerta_peso ? ' · alerta de peso' : ''}`,
      onClick: () => onVerNutricion(jugadorId),
    },
    {
      nombre: 'Psicología',
      seccion: 'psicologia',
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
  ])

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
  ).sort((a, b) => {
    const periodoA = String(a.periodo)
    const periodoB = String(b.periodo)
    const esFinalA = periodoA.startsWith('final-')
    const esFinalB = periodoB.startsWith('final-')

    if (esFinalA && esFinalB) return periodoB.localeCompare(periodoA)
    if (esFinalA) return periodoB.localeCompare(periodoA)
    if (esFinalB) return periodoB.localeCompare(periodoA)

    return periodoB.localeCompare(periodoA)
  })

  const fuentes = lectura.fuentes
  const puedeConsultarCategoria = ['coordinacion', 'preparador_fisico', 'medico'].includes(perfil?.rol) ||
    perfil?.rol === 'tecnico' && Boolean(perfil.categoria_id) && perfil.categoria_id === jugador.categoria_id
  const puedeWellness = puedeConsultarCategoria
  const puedeFisico = puedeConsultarCategoria && perfil?.rol !== 'medico'
  const puedeMedico = puedeVerMedicos(perfil)
  const areasVisibles = disciplinas.filter(d => d.nombre === 'Kinesiología / Médica' ? puedeMedico : d.nombre === 'Videoanálisis' ? ['coordinacion','tecnico','preparador_fisico'].includes(perfil?.rol) : true)
    .map(d => {
      const fuente = d.nombre === 'Kinesiología / Médica' ? fuentes.medicas : d.nombre === 'Videoanálisis' ? fuentes.videos : null
      return fuente?.error ? { ...d, resumen: estadoErrorPerfil(fuente.error) === 'denegado' ? 'Acceso denegado a esta fuente' : 'No se pudo consultar esta fuente', detalle: null } : d
    })
  const abrirDetalle = clave => { setFiltroStat(clave); setPestana('rendimiento') }
  const fuentesConError = Object.values(fuentes).some(f => f.error)
  const descargarWellness = async () => {
    if (generandoWellness) return
    setGenerandoWellness(true); setErrorWellnessPDF('')
    try { await generarBienestarPDF(jugador, 'semana') }
    catch { setErrorWellnessPDF('No se pudo generar el documento. Revisá la conexión y volvé a intentar.') }
    finally { setGenerandoWellness(false) }
  }
  return <div className="perfil-premium"><div className="perfil-contenido">
    <CabeceraPerfil key={jugador.id} jugador={jugador} onVolver={onVolver} onEditar={onEditar} onPDF={() => setMostrarPdf(true)} onEliminar={handleEliminarJugador} eliminando={eliminando} />
    <PestanasAccesibles etiqueta="Secciones del perfil individual" seleccionada={pestana} onSeleccionar={setPestana} pestanas={[
      { id: 'resumen', etiqueta: 'Resumen', contenido: <div className="perfil-resumen"><EncabezadoSeccion titulo="Resumen deportivo" descripcion="Valores acumulados de los registros disponibles. Se conservan los cálculos actuales." nivel={2} />
        <IndicadoresPerfil totales={totales} onDetalle={abrirDetalle} sinDato={Boolean(fuentes.estadisticas?.error)} />
        <FuentePerfil fuente={fuentes.estadisticas} titulo="Estadísticas deportivas">{estadisticas.length === 0 && <EstadoContenido estado="vacio" titulo="Sin estadísticas registradas" mensaje="El acumulado no acredita ausencia de participación deportiva." />}</FuentePerfil>
        <ResumenDeportivoPerfil estadisticasPorAnio={estadisticasPorAnio} fuentes={fuentes} evaluacionesPorPeriodo={evaluacionesPorPeriodo} criteriosEvaluacion={criteriosEvaluacion} puedeConsultarCategoria={puedeConsultarCategoria} puedeWellness={puedeWellness} resumenBienestar={resumenBienestar} resumenAsistencia={resumenAsistencia} totalAsistenciaMarcada={totalAsistenciaMarcada} onPestana={setPestana} onEvaluacion={periodo => { setPeriodoAbierto(periodo); setMostrarEvaluaciones(true); setPestana('evaluaciones') }} />
        <nav className="perfil-resumen-accesos" aria-label="Accesos del perfil">{[['rendimiento','Rendimiento'],['evaluaciones','Evaluaciones'],['seguimiento','Seguimiento'],['documentos','Documentos']].map(([id, nombre]) => <button key={id} type="button" onClick={() => setPestana(id)}>{nombre} →</button>)}</nav>
      </div> },
      { id: 'rendimiento', etiqueta: 'Rendimiento', contenido: <div><EncabezadoSeccion titulo="Participación y estadísticas" descripcion="Registros deportivos actuales, sin sumar acciones de Videoanálisis." nivel={2} />
        <FuentePerfil fuente={fuentes.estadisticas} titulo="Rendimiento">{filtroStat ? <DetalleEstadisticaPerfil filtroStat={filtroStat} statConfig={statConfig} estadisticas={estadisticas} jugador={jugador} setFiltroStat={setFiltroStat} /> : <><IndicadoresPerfil totales={totales} onDetalle={abrirDetalle} />{estadisticas.length === 0 && <EstadoContenido estado="vacio" titulo="Sin estadísticas registradas" />}<GraficoTemporadasPerfil estadisticasPorAnio={estadisticasPorAnio} /><ComparativaAnualPerfil estadisticasPorAnio={estadisticasPorAnio} /></>}</FuentePerfil></div> },
      { id: 'evaluaciones', etiqueta: 'Evaluaciones', contenido: <FuentePerfil permitido={puedeConsultarCategoria} fuente={fuentes.evaluaciones?.error ? fuentes.evaluaciones : fuentes.criterios} titulo="Evaluaciones"><EvaluacionesPerfil evaluacionesCargando={evaluacionesCargando} evaluacionesError={evaluacionesError} evaluacionesPorPeriodo={evaluacionesPorPeriodo} criteriosEvaluacion={criteriosEvaluacion} mostrarEvaluaciones={mostrarEvaluaciones} setMostrarEvaluaciones={setMostrarEvaluaciones} periodoAbierto={periodoAbierto} setPeriodoAbierto={setPeriodoAbierto} /></FuentePerfil> },
      { id: 'seguimiento', etiqueta: 'Seguimiento', contenido: <SeguimientoPerfil resumenBienestar={resumenBienestar} disciplinas={areasVisibles} totalAsistenciaMarcada={totalAsistenciaMarcada} resumenAsistencia={resumenAsistencia} sesionesFisicas={sesionesFisicas} datosDistanciaChart={datosDistanciaChart} sesionFisicaSeleccionadaId={sesionFisicaSeleccionadaId} idSesionFisicaPorDefecto={idSesionFisicaPorDefecto} setSesionFisicaSeleccionadaId={setSesionFisicaSeleccionadaId} sesionFisicaSeleccionada={sesionFisicaSeleccionada} fuentes={fuentes} puedeWellness={puedeWellness} puedeFisico={puedeFisico} /> },
      { id: 'datos', etiqueta: 'Datos', contenido: <DatosPerfil datosPersonales={datosPersonales} jugador={jugador} historialCategorias={historialCategorias} fuenteHistorial={fuentes.historial} puedeMedico={puedeMedico} /> },
      { id: 'documentos', etiqueta: 'Documentos', contenido: <DocumentosPerfil onPDF={() => setMostrarPdf(true)} onWellnessPDF={onVerBienestar && puedeWellness && !fuentes.wellness?.error && resumenBienestar ? descargarWellness : null} generandoWellness={generandoWellness} errorWellnessPDF={errorWellnessPDF} fuentesConError={fuentesConError} /> },
    ]} />
    {mostrarPdf && <PdfPerfilModal jugador={jugador} totales={totales} fichasMedicas={fichasMedicas} historialCategorias={historialCategorias} resumenAsistencia={resumenAsistencia} totalAsistenciaMarcada={totalAsistenciaMarcada} sesionesFisicas={sesionesFisicas} fichasNutricion={fichasNutricion} fichasPsicologicas={fichasPsicologicas} cmjHistorial={cmjHistorial} resumenBienestarMensual={resumenBienestarMensual} asistenciaReciente={asistenciaReciente} onCerrar={() => setMostrarPdf(false)} />}
  </div></div>
}

export default PerfilJugador
