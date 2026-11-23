import { resolverSeccionVisible } from './config/visibilidadSecciones'
import { puedePlanificar } from './utils/planificacion'
import useAdministracionAnalisis from './hooks/useAdministracionAnalisis'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Layout from './components/Layout'
import Login from './components/Login'
// Inicio y Hoy vienen en la carga inicial: todos los roles arrancan en Inicio y Hoy es lo siguiente que se abre.
import InicioSection from './components/InicioSection'
import HoySection from './components/hoy/HoySection'
import { puedeVerHoy } from './utils/hoyDatos'
import { destinoSinPerfil } from './utils/derivarJugadora'
import PantallaCarga from './components/ui/PantallaCarga'
import ContenedorSeccion from './components/ui/SeccionDiferida'
import { seccionDiferida } from './utils/cargaDiferida'

// El resto de las secciones se baja recién cuando se abre (src/utils/cargaDiferida.js).
const PlanificacionSection = seccionDiferida(() => import('./components/PlanificacionSection'))
const CalendarioSection = seccionDiferida(() => import('./components/CalendarioSection'))
const PlantelSection = seccionDiferida(() => import('./components/PlantelSection'))
const MedicosSection = seccionDiferida(() => import('./components/MedicosSection'))
const BienestarComparativo = seccionDiferida(() => import('./components/BienestarComparativo'))
const NutricionSection = seccionDiferida(() => import('./components/NutricionSection'))
const PsicologiaSection = seccionDiferida(() => import('./components/PsicologiaSection'))
const VideoSection = seccionDiferida(() => import('./components/VideoSection'))
const AnalisisSection = seccionDiferida(() => import('./components/AnalisisSection'))
const PartidosSection = seccionDiferida(() => import('./components/PartidosSection'))
const BibliotecaSection = seccionDiferida(() => import('./components/BibliotecaSection'))
const UsuariosSection = seccionDiferida(() => import('./components/UsuariosSection'))
const PaseCategoriaSection = seccionDiferida(() => import('./components/PaseCategoriaSection'))
const BuscadorGlobal = seccionDiferida(() => import('./components/BuscadorGlobal'))
const AsistenciaSection = seccionDiferida(() => import('./components/AsistenciaSection'))
const AvisosSection = seccionDiferida(() => import('./components/avisos/AvisosSection'))
const FisicoSection = seccionDiferida(() => import('./components/FisicoSection'))
const BienestarPublico = seccionDiferida(() => import('./components/BienestarPublico'))
const CaptacionSection = seccionDiferida(() => import('./components/CaptacionSection'))
const RepresentantesSection = seccionDiferida(() => import('./components/RepresentantesSection'))
const PensionesSection = seccionDiferida(() => import('./components/PensionesSection'))
const ConvocatoriasSeleccionSection = seccionDiferida(() => import('./components/ConvocatoriasSeleccionSection'))
const ContratosSection = seccionDiferida(() => import('./components/ContratosSection'))
const EvaluacionesSection = seccionDiferida(() => import('./components/EvaluacionesSection'))
const InformesAutomaticosSection = seccionDiferida(() => import('./components/InformesAutomaticosSection'))

// Nombre que muestra el indicador «Cargando …» mientras se baja cada sección.
const NOMBRES_SECCION = {
  inicio: 'Inicio', hoy: 'Hoy', buscar: 'el buscador', calendario: 'Calendario', plantel: 'Plantel', medicos: 'Médicos',
  bienestar: 'Bienestar', nutricion: 'Nutrición', psicologia: 'Psicología', video: 'Videoanálisis', analisis: 'Análisis',
  partidos: 'Partidos', entrenamientos: 'Biblioteca', planificacion: 'Entrenamientos', avisos: 'Avisos',
  asistencia: 'Asistencia', fisico: 'Físico', captacion: 'Captación', representantes: 'Representantes',
  pensiones: 'Pensión', seleccion: 'Selección', contratos: 'Contratos', evaluaciones: 'Evaluaciones', pases: 'Pases',
  usuarios: 'Usuarios', informes: 'Informes automáticos',
}

function App() {
  const [categoriaBienestarId] = useState(
    () => new URLSearchParams(window.location.search).get('bienestar')
  )
  const [sesion, setSesion] = useState(undefined)
  const usuarioIdSesion = sesion?.user?.id
  const emailSesion = sesion?.user?.email
  const [perfil, setPerfil] = useState(undefined)
  const accesoAnalisis = useAdministracionAnalisis(sesion, perfil?.rol)
  const [seccionSolicitada, setSeccionSolicitada] = useState('inicio')
  // Resuelve también una sección que ya estuviera abierta al cambiar la configuración.
  const seccion = resolverSeccionVisible(seccionSolicitada)
  const setSeccion = useCallback(id => setSeccionSolicitada(resolverSeccionVisible(id)), [])
  const [contextoCalendario, setContextoCalendario] = useState(null)
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
    let vigente = true
    async function cargarPerfil() {
      if (!usuarioIdSesion || !emailSesion) return

      const { data, error } = await supabase
        .from('perfiles')
        .select('*, categorias(nombre)')
        .eq('email', emailSesion)
        .maybeSingle()

      if (error) {
        console.error('Error cargando perfil:', error)
      }

      // Una jugadora con cuenta no tiene perfil del staff: se la manda a su app en vez de mostrar el aviso.
      if (!data) {
        const destino = await destinoSinPerfil(supabase)
        if (vigente && destino) { window.location.replace(destino); return }
      }

      if (vigente) setPerfil(data || null)
    }

    cargarPerfil()
    return () => { vigente = false }
  }, [usuarioIdSesion, emailSesion])

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
    return (
      <ContenedorSeccion clave="bienestar-publico">
        <Suspense fallback={<PantallaCarga />}>
          <BienestarPublico categoriaId={categoriaBienestarId} />
        </Suspense>
      </ContenedorSeccion>
    )
  }

  if (sesion === undefined) {
    return <PantallaCarga mensaje="Verificando sesión…" />
  }

  if (!sesion) {
    return <Login />
  }

  if (perfil === undefined) {
    return <PantallaCarga mensaje="Verificando sesión…" />
  }

  if (perfil === null) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ backgroundColor: 'var(--ui-estado-fondo)' }}
      >
        <p style={{ color: 'var(--ui-estado-texto)' }}>
          Tu usuario ({sesion.user.email}) todavía no tiene un perfil asignado
          en la app.
        </p>

        <p className="text-sm" style={{ color: 'var(--ui-estado-secundario)' }}>
          Pedile a coordinación que te dé de alta en la sección Usuarios.
        </p>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm px-4 py-2 rounded-xl hover:opacity-80"
          style={{
            backgroundColor: 'var(--ui-estado-control)',
            color: 'var(--ui-estado-secundario)',
            border: '1px solid var(--ui-estado-borde)',
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
      puedeAdministrarAnalisis={accesoAnalisis.puedeAbrir}
      puedeConsultarAnalisis={accesoAnalisis.puedeConsultar}
    >
      <ContenedorSeccion clave={seccion} nombre={NOMBRES_SECCION[seccion]}>
      {seccion === 'inicio' && (
        <InicioSection perfil={perfil} onCambiarSeccion={setSeccion} onVerBienestar={irABienestarDesdePerfil}
          onVerPlanificacion={(fecha, categoriaId, sesionId) => {
            if (!puedePlanificar(perfil, categoriaId)) return
            setContextoPlanificacion({ fecha, categoriaId, sesionId })
            setSeccion('planificacion')
          }}
          onAbrirCalendario={(fecha, categoriaId) => {
            if (perfil.rol === 'medico') return
            setContextoCalendario({ fecha, categoriaId })
            setSeccion('calendario')
          }} />
      )}

      {seccion === 'hoy' && (puedeVerHoy(perfil)
        ? <HoySection perfil={perfil} onAbrirJugadora={irAJugadorDesdeBusqueda} onCambiarSeccion={setSeccion} />
        : <div className="p-6" role="alert">Hoy está disponible para el cuerpo técnico y coordinación.<button type="button" onClick={() => setSeccion('inicio')}>Volver a Inicio</button></div>)}

      {seccion === 'buscar' && (
        <BuscadorGlobal
          onIrAJugador={irAJugadorDesdeBusqueda}
          onIrAMedicos={irAMedicosDesdePerfil}
          onIrAVideoJugador={irAVideoDesdePerfil}
          onIrAVideoGeneral={() => setSeccion('video')}
          onIrABiblioteca={() => setSeccion('entrenamientos')}
        />
      )}

      {seccion === 'calendario' && <CalendarioSection perfil={perfil} contextoInicial={contextoCalendario}
        onConsumirContexto={() => setContextoCalendario(null)}
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
      {seccion === 'analisis' && (accesoAnalisis.puedeAbrir ? <AnalisisSection key={usuarioIdSesion} escrituraAutorizada={accesoAnalisis.puedeEscribir} estadoAutorizacion={accesoAnalisis.estado} /> : accesoAnalisis.puedeConsultar ? <AnalisisSection key={`consulta-${usuarioIdSesion}`} modoConsulta escrituraAutorizada={false} /> : <div className="p-6" role="alert">Análisis es para coordinación y el cuerpo técnico. Los resultados también se ven en el perfil individual.<button type="button" onClick={() => setSeccion('inicio')}>Volver a Inicio</button></div>)}

      {seccion === 'partidos' && (
        <PartidosSection
          perfil={perfil}
          onIrAFisico={irAFisicoDesdePartido}
        />
      )}

      {/* 'entrenamientos' es la Biblioteca (etapas D + G); 'planificacion' se muestra como Entrenamientos. */}
      {seccion === 'entrenamientos' && <BibliotecaSection perfil={perfil} onPlanificar={puedePlanificar(perfil) ? () => { setContextoPlanificacion(null); setSeccion('planificacion') } : undefined} />}

      {seccion === 'planificacion' && <PlanificacionSection perfil={perfil} fechaInicial={contextoPlanificacion?.fecha} categoriaInicial={contextoPlanificacion?.categoriaId} sesionInicialId={contextoPlanificacion?.sesionId}
        onVerAsistencia={(fecha, categoriaId) => { setContextoAsistencia({ fecha, categoriaId }); setSeccion('asistencia') }} />}

      {seccion === 'avisos' && <AvisosSection perfil={perfil} />}
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

      {seccion === 'usuarios' && <UsuariosSection perfil={perfil} />}

      {/* Nuevo módulo de informes automáticos */}
      {seccion === 'informes' && (
        <InformesAutomaticosSection perfil={perfil} />
      )}
      </ContenedorSeccion>
    </Layout>
  )
}

export default App
