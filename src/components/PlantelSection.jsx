import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import ListaJugadores from './ListaJugadores'
import PerfilJugador from './PerfilJugador'
import AgregarJugador from './AgregarJugador'
import CargaMasiva from './CargaMasiva'

function PlantelSection({ onVerFichaMedica, onVerVideos, onVerNutricion, onVerPsicologia, onVerBienestar, jugadorInicialId, onConsumirJugadorInicial, perfil }) {
  const [vista, setVista] = useState('lista')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)

  useEffect(() => {
    async function aplicarJugadorInicial() {
      if (jugadorInicialId) {
        setJugadorSeleccionado(jugadorInicialId)
        setVista('perfil')
        onConsumirJugadorInicial?.()
      }
    }
    aplicarJugadorInicial()
  }, [jugadorInicialId, onConsumirJugadorInicial])

  function irAlPerfil(id) {
    setJugadorSeleccionado(id)
    setVista('perfil')
  }

  function irAEditar(id) {
    setJugadorSeleccionado(id)
    setVista('editar')
  }

  function volver() {
    setVista('lista')
    setJugadorSeleccionado(null)
  }

  function volverAlPerfil() {
    setVista('perfil')
  }

  if (vista === 'perfil') {
    return (
      <PerfilJugador
        jugadorId={jugadorSeleccionado}
        onVolver={volver}
        onVerFichaMedica={onVerFichaMedica}
        onVerVideos={onVerVideos}
        onVerNutricion={onVerNutricion}
        onVerPsicologia={onVerPsicologia}
        onVerBienestar={onVerBienestar}
        onEditar={irAEditar}
      />
    )
  }

  if (vista === 'agregar') {
    return <AgregarJugador onVolver={volver} onGuardado={volver} />
  }

  if (vista === 'editar') {
    return (
      <AgregarJugador
        jugadorIdEditar={jugadorSeleccionado}
        onVolver={volverAlPerfil}
        onGuardado={volverAlPerfil}
      />
    )
  }

  if (vista === 'masiva') {
    return <CargaMasiva onVolver={volver} onGuardado={volver} />
  }

  return (
    <ListaJugadores
      onSelectJugador={irAlPerfil}
      onNuevoJugador={() => setVista('agregar')}
      onCargaMasiva={() => setVista('masiva')}
      perfil={perfil}
    />
  )
}

export default PlantelSection

