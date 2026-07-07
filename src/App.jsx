import { useState } from 'react'
import Layout from './components/Layout'
import PlantelSection from './components/PlantelSection'
import MedicosSection from './components/MedicosSection'
import NutricionSection from './components/NutricionSection'
import PsicologiaSection from './components/PsicologiaSection'
import VideoSection from './components/VideoSection'
import PartidosSection from './components/PartidosSection'
import EntrenamientosSection from './components/EntrenamientosSection'

function App() {
  const [seccion, setSeccion] = useState('plantel')
  const [jugadorParaMedicos, setJugadorParaMedicos] = useState(null)
  const [jugadorParaVideo, setJugadorParaVideo] = useState(null)
  const [jugadorParaNutricion, setJugadorParaNutricion] = useState(null)
  const [jugadorParaPsicologia, setJugadorParaPsicologia] = useState(null)

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

  return (
    <Layout seccionActiva={seccion} onCambiarSeccion={setSeccion}>
      {seccion === 'plantel' && (
        <PlantelSection
          onVerFichaMedica={irAMedicosDesdePerfil}
          onVerVideos={irAVideoDesdePerfil}
          onVerNutricion={irANutricionDesdePerfil}
          onVerPsicologia={irAPsicologiaDesdePerfil}
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
        />
      )}
      {seccion === 'partidos' && <PartidosSection />}
      {seccion === 'entrenamientos' && <EntrenamientosSection />}
    </Layout>
  )
}

export default App