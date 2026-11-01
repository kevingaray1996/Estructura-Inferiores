import { useState } from 'react'
import IconoNavegacion from '../IconoNavegacion'
import { COLORES, iniciales, calcularEdad, pieHabilLabel, estadoConfig } from './presentacionPerfil'
import { textoPlantel, tintePlantel } from '../../appearance/plantel'

export default function CabeceraPerfil({ jugador, onVolver, onEditar, onPDF, onEliminar, eliminando }) {
  const [fallo, setFallo] = useState(false)
  const estado = estadoConfig[jugador.estado] || { color: COLORES.secundario, label: 'Estado sin confirmar' }
  const edad = calcularEdad(jugador.fecha_nacimiento)
  return <header className="perfil-cabecera">
    <div className="perfil-navegacion"><button type="button" onClick={onVolver}>← Volver al plantel</button><span>CLUB COMUNICACIONES · PERFIL INDIVIDUAL</span></div>
    <div className="perfil-identidad">
      {jugador.foto_url && !fallo ? <img className="perfil-foto" src={jugador.foto_url} alt={`${jugador.apellido}, ${jugador.nombre}`} onError={() => setFallo(true)} />
        : <div className="perfil-foto perfil-iniciales" aria-label="Fotografía no disponible">{iniciales(jugador.nombre, jugador.apellido)}</div>}
      <div className="perfil-nombre"><p>COMUNICACIONES · FÚTBOL FEMENINO</p><h1>{jugador.apellido}, {jugador.nombre}</h1>
        <div className="perfil-insignias"><span>{jugador.categorias?.nombre || 'Sin categoría'}</span>
          <span style={{ color: textoPlantel(estado.color), background: tintePlantel(estado.color, '18'), borderColor: tintePlantel(estado.color, '66') }}>{estado.label}</span></div>
        <dl className="perfil-datos-deportivos">
          {[[ 'Posición', jugador.posicion ], ['Alternativa', jugador.posicion_secundaria], ['Edad', edad == null ? null : `${edad} años`], ['Pie hábil', pieHabilLabel[jugador.pie_habil]]]
            .filter(([, v]) => v != null && v !== '').map(([etiqueta, valor]) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></div>)}
        </dl>
      </div>
      <div className="perfil-acciones"><button type="button" onClick={() => onEditar(jugador.id)}><IconoNavegacion nombre="evaluaciones" />Editar</button>
        <button type="button" className="perfil-primario" onClick={onPDF}><IconoNavegacion nombre="informes" />Descargar PDF</button>
        <details className="perfil-acciones-secundarias"><summary>Más acciones</summary><button type="button" className="perfil-eliminar" disabled={eliminando} onClick={onEliminar}>{eliminando ? 'Eliminando…' : 'Eliminar jugadora'}</button></details>
      </div>
    </div>
  </header>
}
