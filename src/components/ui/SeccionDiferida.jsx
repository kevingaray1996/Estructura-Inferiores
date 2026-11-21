import { Component, Suspense } from 'react'
import EstadoVacio from './EstadoVacio'
import EstadoContenido from './EstadoContenido'

// Si una sección no se puede abrir (no se pudo bajar, o falló al dibujarse), muestra un aviso con «Recargar» en vez
// de dejar la pantalla en blanco. El menú sigue funcionando: al cambiar de sección se vuelve a intentar.
class LimiteSeccion extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('No se pudo abrir la sección:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="p-4 sm:p-6">
        <EstadoContenido
          estado="error"
          titulo="No se pudo abrir esta sección"
          mensaje="Revisá la conexión y tocá Recargar. Si sigue pasando, avisá a coordinación."
          textoReintento="Recargar"
          onReintentar={() => window.location.reload()}
        />
      </div>
    )
  }
}

// Envuelve el contenido de la sección activa. `clave` (la sección) reinicia el aviso al cambiar de sección.
export default function ContenedorSeccion({ clave, nombre, children }) {
  return (
    <LimiteSeccion key={clave}>
      <Suspense fallback={<div className="p-4 sm:p-6"><EstadoVacio cargando mensaje={nombre ? `Cargando ${nombre}…` : 'Cargando…'} /></div>}>
        {children}
      </Suspense>
    </LimiteSeccion>
  )
}
