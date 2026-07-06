import { useState } from 'react'
import ListaJugadores from './ListaJugadores'
import PerfilJugador from './PerfilJugador'
import AgregarJugador from './AgregarJugador'
import CargaMasiva from './CargaMasiva'

function PlantelSection({ onVerFichaMedica, onVerVideos }) {
  const [vista, setVista] = useState('lista')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)

  function irAlPerfil(id) {
    setJugadorSeleccionado(id)
    setVista('perfil')
  }

  function volver() {
    setVista('lista')
    setJugadorSeleccionado(null)
  }

  if (vista === 'perfil') {
    return (
      <PerfilJugador
        jugadorId={jugadorSeleccionado}
        onVolver={volver}
        onVerFichaMedica={onVerFichaMedica}
        onVerVideos={onVerVideos}
      />
    )
  }

  if (vista === 'agregar') {
    return <AgregarJugador onVolver={volver} onGuardado={volver} />
  }

  if (vista === 'masiva') {
    return <CargaMasiva onVolver={volver} onGuardado={volver} />
  }

  return (
    <ListaJugadores
      onSelectJugador={irAlPerfil}
      onNuevoJugador={() => setVista('agregar')}
      onCargaMasiva={() => setVista('masiva')}
    />
  )
}

export default PlantelSection