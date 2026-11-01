import TarjetaIndicador from '../ui/TarjetaIndicador'

const INDICADORES = [
  ['Partidos', 'partidos'], ['Titularidades', 'titularidades'], ['Minutos', 'minutos'],
  ['Goles', 'goles'], ['Asistencias', 'asistencias'], ['Amarillas', 'amarillas'], ['Rojas', 'rojas'],
]
export default function IndicadoresPerfil({ totales, onDetalle, sinDato = false }) {
  return <div className="perfil-indicadores">{INDICADORES.map(([etiqueta, clave]) => {
    const contenido = <TarjetaIndicador etiqueta={etiqueta} valor={totales[clave]} sinDato={sinDato} mensajeSinDato="No disponible" />
    return clave === 'minutos' || sinDato ? <div key={clave}>{contenido}</div>
      : <button key={clave} type="button" onClick={() => onDetalle(clave)} aria-label={`Ver detalle de ${etiqueta.toLowerCase()}`}>{contenido}<span className="perfil-ver-detalle">Ver registros →</span></button>
  })}</div>
}
