import PlanificacionSection from './components/PlanificacionSection'
import { resolverSeccionVisible } from './config/visibilidadSecciones'
import { puedePlanificar } from './utils/planificacion'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Layout from './components/Layout'
import Login from './components/Login'
import InicioSection from './components/InicioSection'
import CalendarioSection from './components/CalendarioSection'
import PlantelSection from './components/PlantelSection'
import MedicosSection from './components/MedicosSection'
import BienestarComparativo from './components/BienestarComparativo'
import NutricionSection from './components/NutricionSection'
import PsicologiaSection from './components/PsicologiaSection'
import VideoSection from './components/VideoSection'
import AnalisisSection from './components/AnalisisSection'
import PartidosSection from './components/PartidosSection'
import EntrenamientosSection from './components/EntrenamientosSection'
import UsuariosSection from './components/UsuariosSection'
import PaseCategoriaSection from './components/PaseCategoriaSection'
import BuscadorGlobal from './components/BuscadorGlobal'
import AsistenciaSection from './components/AsistenciaSection'
import FisicoSection from './components/FisicoSection'
import BienestarPublico from './components/BienestarPublico'
import CaptacionSection from './components/CaptacionSection'
import RepresentantesSection from './components/RepresentantesSection'
import PensionesSection from './components/PensionesSection'
import ConvocatoriasSeleccionSection from './components/ConvocatoriasSeleccionSection'
import ContratosSection from './components/ContratosSection'
import EvaluacionesSection from './components/EvaluacionesSection'
import InformesAutomaticosSection from './components/InformesAutomaticosSection'

function App() {
  const [categoriaBienestarId] = useState(
    () => new URLSearchParams(window.location.search).get('bienestar')
  )
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(undefined)
  const [seccionSolicitada, setSeccionSolicitada] = useState('inicio')
  // Resuelve también una sección que ya estuviera abierta al cambiar la configuración.
  const seccion = resolverSeccionVisible(seccionSolicitada)
  const setSeccion = useCallback(id => setSeccionSolicitada(resolverSeccionVisible(id)), [])
  const [contextoPlanificacion, setContextoPlanificacion] = useState(null)
  const [contextoAsistencia, setContextoAsistencia] = useState(null)
  const [jugadorParaMedicos, setJugadorParaMedicos] = useState(null)
  const [jugadorParaVideo, setJugadorParaVideo] = useState(null)
  const [jugadorParaNutricion, setJugadorParaNutricion] = useState(null)
  const [jugadorParaPsicologia, setJugadorParaPsicologia] = useState(null)
  const [jugadorParaPlantel, setJugadorParaPlantel] = useState(null)
  const [partidoParaFisico, setPartidoParaFisico] = useState(null)
  const [jugadorParaBienestar, setJugadorParaBienestar] = useState(null)

  useEffect(() => {
    if (categoriaBienestarId) return

    supabase.auth.getSession().then(({ data }) => setSesion(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nuevaSesion) => {
        setSesion(nuevaSesion)

        if (!nuevaSesion) {
          setPerfil(undefined)
          setSeccion('inicio')
          setContextoPlanificacion(null)
          setContextoAsistencia(null)
        }
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [categoriaBienestarId, setSeccion])

  useEffect(() => {
    async function cargarPerfil() {
      if (!sesion) return

      const { data, error } = await supabase
        .from('perfiles')
        .select('*, categorias(nombre)')
        .eq('email', sesion.user.email)
        .maybeSingle()

      if (error) {
        console.error('Error cargando perfil:', error)
      }

      setPerfil(data || null)
    }

    cargarPerfil()
  }, [sesion])

  function irAMedicosDesdePerfil(jugadorId) {
    setJugadorParaMedicos(jugadorId)
    setSeccion('medicos')
  }

  function irAVideoDesdePerfil(jugadorId) {
    setJugadorParaVideo(jugadorId)
    setSeccion('video')
  }

  function irANutricionDesdePerfil(jugadorId) {
    setJugadorParaNutricion(jugadorId)
    setSeccion('nutricion')
  }

  function irAPsicologiaDesdePerfil(jugadorId) {
    setJugadorParaPsicologia(jugadorId)
    setSeccion('psicologia')
  }

  function irAJugadorDesdeBusqueda(jugadorId) {
    setJugadorParaPlantel(jugadorId)
    setSeccion('plantel')
  }

  function irAFisicoDesdePartido(partidoId) {
    setPartidoParaFisico(partidoId)
    setSeccion('fisico')
  }

  function irABienestarDesdePerfil(jugadorId) {
    setJugadorParaBienestar(jugadorId)
    setSeccion('fisico')
  }

  const consumirJugadorParaPlantel = useCallback(
    () => setJugadorParaPlantel(null),
    []
  )
  const consumirJugadorParaMedicos = useCallback(
    () => setJugadorParaMedicos(null),
    []
  )
  const consumirJugadorParaNutricion = useCallback(
    () => setJugadorParaNutricion(null),
    []
  )
  const consumirJugadorParaPsicologia = useCallback(
    () => setJugadorParaPsicologia(null),
    []
  )
  const consumirJugadorParaVideo = useCallback(
    () => setJugadorParaVideo(null),
    []
  )
  const consumirPartidoParaFisico = useCallback(
    () => setPartidoParaFisico(null),
    []
  )
  const consumirJugadorParaBienestar = useCallback(
    () => setJugadorParaBienestar(null),
    []
  )

  if (categoriaBienestarId) {
    return <BienestarPublico categoriaId={categoriaBienestarId} />
  }

  if (sesion === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--ui-estado-fondo, #0F1419)' }}
      >
        <p style={{ color: 'var(--ui-carga-texto, #5B6B85)' }}>Cargando...</p>
      </div>
    )
  }

  if (!sesion) {
    return <Login />
  }

  if (perfil === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--ui-estado-fondo, #0F1419)' }}
      >
        <p style={{ color: 'var(--ui-carga-texto, #5B6B85)' }}>Cargando...</p>
      </div>
    )
  }

  if (perfil === null) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ backgroundColor: 'var(--ui-estado-fondo, #0F1419)' }}
      >
        <p style={{ color: 'var(--ui-estado-texto, #F0F2F5)' }}>
          Tu usuario ({sesion.user.email}) todavía no tiene un perfil asignado
          en la app.
        </p>

        <p className="text-sm" style={{ color: 'var(--ui-estado-secundario, #8A9BB8)' }}>
          Pedile a coordinación que te dé de alta en la sección Usuarios.
        </p>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm px-4 py-2 rounded-xl hover:opacity-80"
          style={{
            backgroundColor: 'var(--ui-estado-control, #1A2332)',
            color: 'var(--ui-estado-secundario, #8A9BB8)',
            border: '1px solid var(--ui-estado-borde, #2A3548)',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <Layout
      seccionActiva={seccion}
      onCambiarSeccion={setSeccion}
      perfil={perfil}
    >
      {seccion === 'inicio' && (
        <InicioSection perfil={perfil} onCambiarSeccion={setSeccion} />
      )}

      {seccion === 'buscar' && (
        <BuscadorGlobal
          onIrAJugador={irAJugadorDesdeBusqueda}
          onIrAMedicos={irAMedicosDesdePerfil}
          onIrAVideoJugador={irAVideoDesdePerfil}
          onIrAVideoGeneral={() => setSeccion('video')}
          onIrABiblioteca={() => setSeccion('entrenamientos')}
        />
      )}

      {seccion === 'calendario' && <CalendarioSection perfil={perfil}
        onVerPlanificacion={(fecha, categoriaId, sesionId) => {
          if (!puedePlanificar(perfil, categoriaId)) return
          setContextoPlanificacion({ fecha, categoriaId, sesionId })
          setSeccion('planificacion')
        }} />}

      {seccion === 'plantel' && (
        <PlantelSection
          onVerFichaMedica={irAMedicosDesdePerfil}
          onVerVideos={irAVideoDesdePerfil}
          onVerNutricion={irANutricionDesdePerfil}
          onVerPsicologia={irAPsicologiaDesdePerfil}
          jugadorInicialId={jugadorParaPlantel}
          onConsumirJugadorInicial={consumirJugadorParaPlantel}
          onVerBienestar={irABienestarDesdePerfil}
          perfil={perfil}
        />
      )}

      {seccion === 'medicos' && (
        <MedicosSection
          perfil={perfil}
          jugadorInicialId={jugadorParaMedicos}
          onConsumirJugadorInicial={consumirJugadorParaMedicos}
        />
      )}

      {seccion === 'bienestar' && (perfil.rol === 'medico'
        ? <BienestarComparativo perfil={perfil} />
        : <InicioSection perfil={perfil} onCambiarSeccion={setSeccion} />)}

      {seccion === 'nutricion' && (
        <NutricionSection
          jugadorInicialId={jugadorParaNutricion}
          onConsumirJugadorInicial={consumirJugadorParaNutricion}
        />
      )}

      {seccion === 'psicologia' && (
        <PsicologiaSection
          jugadorInicialId={jugadorParaPsicologia}
          onConsumirJugadorInicial={consumirJugadorParaPsicologia}
        />
      )}

      {seccion === 'video' && (
        <VideoSection
          jugadorInicialId={jugadorParaVideo}
          onConsumirJugadorInicial={consumirJugadorParaVideo}
          onIrABiblioteca={() => setSeccion('entrenamientos')}
          perfil={perfil}
        />
      )}

      {/* Módulo independiente de análisis de partidos */}
      {seccion === 'analisis' && <AnalisisSection />}

      {seccion === 'partidos' && (
        <PartidosSection
          perfil={perfil}
          onIrAFisico={irAFisicoDesdePartido}
        />
      )}

      {seccion === 'entrenamientos' && <EntrenamientosSection onPlanificar={puedePlanificar(perfil) ? () => { setContextoPlanificacion(null); setSeccion('planificacion') } : undefined} />}

      {seccion === 'planificacion' && <PlanificacionSection perfil={perfil} fechaInicial={contextoPlanificacion?.fecha} categoriaInicial={contextoPlanificacion?.categoriaId} sesionInicialId={contextoPlanificacion?.sesionId}
        onVerAsistencia={(fecha, categoriaId) => { setContextoAsistencia({ fecha, categoriaId }); setSeccion('asistencia') }} />}

      {seccion === 'asistencia' && <AsistenciaSection perfil={perfil} fechaInicial={contextoAsistencia?.fecha} categoriaInicial={contextoAsistencia?.categoriaId}
        onVerPlanificacion={puedePlanificar(perfil) ? (fecha, categoriaId) => { if (!puedePlanificar(perfil, categoriaId)) return; setContextoPlanificacion({ fecha, categoriaId }); setSeccion('planificacion') } : undefined} />}

      {seccion === 'fisico' && (
        <FisicoSection
          perfil={perfil}
          partidoInicialId={partidoParaFisico}
          onConsumirPartidoInicial={consumirPartidoParaFisico}
          jugadorParaBienestar={jugadorParaBienestar}
          onConsumirJugadorParaBienestar={consumirJugadorParaBienestar}
        />
      )}

      {seccion === 'captacion' && <CaptacionSection perfil={perfil} />}

      {seccion === 'representantes' && (
        <RepresentantesSection onVolver={() => setSeccion('inicio')} />
      )}

      {seccion === 'pensiones' && (
        <PensionesSection onVolver={() => setSeccion('inicio')} />
      )}

      {seccion === 'seleccion' && (
        <ConvocatoriasSeleccionSection
          onVolver={() => setSeccion('inicio')}
        />
      )}

      {seccion === 'contratos' && (
        <ContratosSection onVolver={() => setSeccion('inicio')} />
      )}

      {seccion === 'evaluaciones' && <EvaluacionesSection perfil={perfil} />}

      {seccion === 'pases' && <PaseCategoriaSection />}

      {seccion === 'usuarios' && <UsuariosSection />}

      {/* Nuevo módulo de informes automáticos */}
      {seccion === 'informes' && (
        <InformesAutomaticosSection perfil={perfil} />
      )}
    </Layout>
  )
}

export default App
