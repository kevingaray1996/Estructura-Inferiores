import { useEffect, useState } from 'react'
import ListaJugadores from './ListaJugadores'
import PerfilJugador from './PerfilJugador'
import AgregarJugador from './AgregarJugador'
import CargaMasiva from './CargaMasiva'
import CanchaPlantel from './CanchaPlantel'

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

  if (vista === 'cancha') {
    return (
      <div className="p-6 md:p-10">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setVista('lista')}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: vista === 'lista' ? '#4ADE80' : '#1A2332',
                color: vista === 'lista' ? '#0F1419' : '#8A9BB8',
                border: '1px solid #2A3548',
              }}
            >
              Ver lista
            </button>
            <button
              onClick={() => setVista('cancha')}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: vista === 'cancha' ? '#4ADE80' : '#1A2332',
                color: vista === 'cancha' ? '#0F1419' : '#8A9BB8',
                border: '1px solid #2A3548',
              }}
            >
              Ver cancha
            </button>
          </div>
          <CanchaPlantel onSelectJugador={irAlPerfil} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setVista('lista')}
            className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
            style={{
              backgroundColor: vista === 'lista' ? '#4ADE80' : '#1A2332',
              color: vista === 'lista' ? '#0F1419' : '#8A9BB8',
              border: '1px solid #2A3548',
            }}
          >
            Ver lista
          </button>
          <button
            onClick={() => setVista('cancha')}
            className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
            style={{
              backgroundColor: vista === 'cancha' ? '#4ADE80' : '#1A2332',
              color: vista === 'cancha' ? '#0F1419' : '#8A9BB8',
              border: '1px solid #2A3548',
            }}
          >
            Ver cancha
          </button>
        </div>
        <ListaJugadores
          onSelectJugador={irAlPerfil}
          onNuevoJugador={() => setVista('agregar')}
          onCargaMasiva={() => setVista('masiva')}
          perfil={perfil}
        />
      </div>
    </div>
  )
}

export default PlantelSection
