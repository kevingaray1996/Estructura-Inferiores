import { calcularResumenEvaluacion, nombrePeriodo } from './presentacionPerfil'
import EstadoContenido from '../ui/EstadoContenido'

export default function SintesisEvaluacionPerfil({ grupo, criterios, onAbrir }) {
  if (!grupo) return <EstadoContenido estado="vacio" titulo="Sin evaluaciones registradas" />
  const resumen = calcularResumenEvaluacion(grupo.evaluaciones, criterios)
  const final = grupo.tipo === 'final' || String(grupo.periodo).startsWith('final-')
  return <section className="perfil-panel perfil-sintesis-evaluacion">
    <div className="perfil-titulo-panel"><div><p className="perfil-sobretitulo">CUERPO TÉCNICO · {final ? 'FINAL' : 'MENSUAL'}</p><h2>{nombrePeriodo(grupo.periodo, grupo.tipo)}</h2></div><div className="perfil-promedio-grande"><strong>{resumen.general == null ? '—' : resumen.general.toFixed(1)}</strong><span>Promedio / 5</span></div></div>
    <p className="perfil-nota">{grupo.evaluaciones.length} evaluador{grupo.evaluaciones.length !== 1 ? 'es' : ''}. Promedio de criterios evaluados, con la escala original de 1 a 5.</p>
    <div className="perfil-criterios-grafico">{resumen.porCriterio.map(({ criterio, promedio, cantidad }) => <div className="perfil-criterio-grafico" key={criterio.id}>
      <div><span>{criterio.nombre}</span><strong>{promedio == null ? 'Sin evaluar' : `${promedio.toFixed(1)} / 5`}</strong></div>
      {promedio != null && <div className="perfil-pista-barra" aria-hidden="true"><span style={{ width: `${promedio / 5 * 100}%` }} /></div>}
      <small>{cantidad} {cantidad === 1 ? 'valoración válida' : 'valoraciones válidas'}</small>
    </div>)}</div>
    {onAbrir && <button className="perfil-enlace" type="button" onClick={onAbrir}>Abrir evaluación completa →</button>}
  </section>
}
