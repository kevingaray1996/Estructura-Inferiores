import FuentePerfil from './FuentePerfil'
import GraficoTemporadasPerfil from './GraficoTemporadasPerfil'
import SintesisEvaluacionPerfil from './SintesisEvaluacionPerfil'
import EstadoContenido from '../ui/EstadoContenido'

export default function ResumenDeportivoPerfil({ estadisticasPorAnio, fuentes, evaluacionesPorPeriodo, criteriosEvaluacion, puedeConsultarCategoria, puedeWellness, resumenBienestar, resumenAsistencia, totalAsistenciaMarcada, onPestana, onEvaluacion }) {
  const ultimaEvaluacion = evaluacionesPorPeriodo.slice().sort((a, b) => {
    const clave = g => String(g.periodo).startsWith('final-') ? `${String(g.periodo).replace('final-', '')}-13` : String(g.periodo)
    return clave(b).localeCompare(clave(a))
  })[0]
  const wellness = resumenBienestar?.filter(m => m.clave !== 'rpe') || []
  const rpe = resumenBienestar?.find(m => m.clave === 'rpe')
  return <div className="perfil-dashboard">
    <div className="perfil-dashboard-principal"><FuentePerfil fuente={fuentes.estadisticas} titulo="Temporadas"><GraficoTemporadasPerfil estadisticasPorAnio={estadisticasPorAnio} /></FuentePerfil>
      <FuentePerfil permitido={puedeConsultarCategoria} fuente={fuentes.evaluaciones?.error ? fuentes.evaluaciones : fuentes.criterios} titulo="Última evaluación">
        <SintesisEvaluacionPerfil grupo={ultimaEvaluacion} criterios={criteriosEvaluacion} onAbrir={() => onEvaluacion(ultimaEvaluacion.periodo)} />
      </FuentePerfil>
    </div>
    <section className="perfil-panel perfil-seguimiento-resumen"><p className="perfil-sobretitulo">SEGUIMIENTO · FUENTES INDEPENDIENTES</p><h2>Contexto de trabajo</h2>
      <FuentePerfil permitido={puedeConsultarCategoria} fuente={fuentes.asistencias} titulo="Asistencia">
        <h3>Asistencia acumulada</h3>{totalAsistenciaMarcada > 0 ? <dl className="perfil-asistencia-resumen"><div><dt>Presentes</dt><dd>{resumenAsistencia.presente}</dd></div><div><dt>Tardes</dt><dd>{resumenAsistencia.tarde}</dd></div><div><dt>Registros totales</dt><dd>{totalAsistenciaMarcada}</dd></div></dl> : <EstadoContenido estado="vacio" titulo="Sin asistencia registrada" />}
      </FuentePerfil>
      <FuentePerfil permitido={puedeWellness} fuente={fuentes.wellness} titulo="Wellness y RPE">
        <h3>Wellness · últimos 7 días</h3><p className="perfil-nota">Promedios disponibles; la comparación con los 7 días anteriores está en Seguimiento.</p>
        {wellness.some(m => m.promedioActual != null) ? <dl className="perfil-wellness-resumen">{wellness.map(m => <div key={m.clave}><dt>{m.label}</dt><dd>{m.promedioActual == null ? '—' : m.promedioActual.toFixed(1)}<small> / {m.escalaMax}</small></dd></div>)}</dl> : <EstadoContenido estado="vacio" titulo="Sin respuestas de Wellness esta semana" />}
        <div className="perfil-rpe-resumen"><h3>Esfuerzo percibido · RPE</h3><strong>{rpe?.promedioActual == null ? 'No disponible' : `${rpe.promedioActual.toFixed(1)} / 10`}</strong><p className="perfil-nota">Promedio de RPE registrado en los últimos 7 días; no representa carga total.</p></div>
      </FuentePerfil>
      <button type="button" className="perfil-enlace" onClick={() => onPestana('seguimiento')}>Abrir seguimiento →</button>
    </section>
  </div>
}
