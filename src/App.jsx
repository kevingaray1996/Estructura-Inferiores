import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Layout from './components/Layout'
import Login from './components/Login'
import InicioSection from './components/InicioSection'
import CalendarioSection from './components/CalendarioSection'
import PlantelSection from './components/PlantelSection'
import MedicosSection from './components/MedicosSection'
import NutricionSection from './components/NutricionSection'
import PsicologiaSection from './components/PsicologiaSection'
import VideoSection from './components/VideoSection'
import PartidosSection from './components/PartidosSection'
import EntrenamientosSection from './components/EntrenamientosSection'
import UsuariosSection from './components/UsuariosSection'
import PaseCategoriaSection from './components/PaseCategoriaSection'
import BuscadorGlobal from './components/BuscadorGlobal'
import AsistenciaSection from './components/AsistenciaSection'
import FisicoSection from './components/FisicoSection'

function App() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(undefined)
  const [seccion, setSeccion] = useState('inicio')
  const [jugadorParaMedicos, setJugadorParaMedicos] = useState(null)
  const [jugadorParaVideo, setJugadorParaVideo] = useState(null)
  const [jugadorParaNutricion, setJugadorParaNutricion] = useState(null)
  const [jugadorParaPsicologia, setJugadorParaPsicologia] = useState(null)
  const [jugadorParaPlantel, setJugadorParaPlantel] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSesion(nuevaSesion)
      if (!nuevaSesion) {
        setPerfil(undefined)
        setSeccion('inicio')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

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

  if (sesion === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1419' }}>
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  if (!sesion) {
    return <Login />
  }

  if (perfil === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1419' }}>
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  if (perfil === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ backgroundColor: '#0F1419' }}>
        <p style={{ color: '#F0F2F5' }}>
          Tu usuario ({sesion.user.email}) todavía no tiene un perfil asignado en la app.
        </p>
        <p className="text-sm" style={{ color: '#8A9BB8' }}>
          Pedile a coordinación que te dé de alta en la sección Usuarios.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm px-4 py-2 rounded-xl hover:opacity-80"
          style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <Layout seccionActiva={seccion} onCambiarSeccion={setSeccion} perfil={perfil}>
      {seccion === 'inicio' && <InicioSection perfil={perfil} onCambiarSeccion={setSeccion} />}
      {seccion === 'buscar' && (
        <BuscadorGlobal
          onIrAJugador={irAJugadorDesdeBusqueda}
          onIrAMedicos={irAMedicosDesdePerfil}
          onIrAVideoJugador={irAVideoDesdePerfil}
          onIrAVideoGeneral={() => setSeccion('video')}
          onIrABiblioteca={() => setSeccion('entrenamientos')}
        />
      )}
      {seccion === 'calendario' && <CalendarioSection perfil={perfil} />}
      {seccion === 'plantel' && (
        <PlantelSection
          onVerFichaMedica={irAMedicosDesdePerfil}
          onVerVideos={irAVideoDesdePerfil}
          onVerNutricion={irANutricionDesdePerfil}
          onVerPsicologia={irAPsicologiaDesdePerfil}
          jugadorInicialId={jugadorParaPlantel}
          onConsumirJugadorInicial={() => setJugadorParaPlantel(null)}
          perfil={perfil}
        />
      )}
      {seccion === 'medicos' && (
        <MedicosSection
          jugadorInicialId={jugadorParaMedicos}
          onConsumirJugadorInicial={() => setJugadorParaMedicos(null)}
        />
      )}
      {seccion === 'nutricion' && (
        <NutricionSection
          jugadorInicialId={jugadorParaNutricion}
          onConsumirJugadorInicial={() => setJugadorParaNutricion(null)}
        />
      )}
      {seccion === 'psicologia' && (
        <PsicologiaSection
          jugadorInicialId={jugadorParaPsicologia}
          onConsumirJugadorInicial={() => setJugadorParaPsicologia(null)}
        />
      )}
      {seccion === 'video' && (
        <VideoSection
          jugadorInicialId={jugadorParaVideo}
          onConsumirJugadorInicial={() => setJugadorParaVideo(null)}
          onIrABiblioteca={() => setSeccion('entrenamientos')}
          perfil={perfil}
        />
      )}
      {seccion === 'partidos' && <PartidosSection perfil={perfil} />}
      {seccion === 'entrenamientos' && <EntrenamientosSection />}
      {seccion === 'asistencia' && <AsistenciaSection perfil={perfil} />}
      {seccion === 'fisico' && <FisicoSection perfil={perfil} />}
      {seccion === 'pases' && <PaseCategoriaSection />}
      {seccion === 'usuarios' && <UsuariosSection />}
    </Layout>
  )
}

export default App
