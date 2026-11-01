import { useState } from 'react'
import PestanasAccesibles from '../ui/PestanasAccesibles'
import FormacionesPlantel from './FormacionesPlantel'
import ComparativasPlantel from './ComparativasPlantel'
import RankingsPlantel from './RankingsPlantel'
import EvolucionPlantel from './EvolucionPlantel'
import useDatosRendimiento from './useDatosRendimiento'
import './rendimiento.css'

// Las tres vistas comparten una lectura y el alcance deportivo de sus filtros.
export default function RendimientoPlantel({ activo, children, ...formaciones }) {
  const [seleccionada, seleccionar] = useState('comparativas')
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', partido: '' })
  const categoriaId = formaciones.jugadoras[0]?.categoria_id
  const fuente = useDatosRendimiento(activo && ['comparativas', 'rankings', 'evolucion'].includes(seleccionada), categoriaId)
  const errorLectura = Object.values(fuente.datos?.fuentes || {}).some(f => ['error', 'denegado', 'no_disponible'].includes(f.estado))
  return <section className="rendimiento-centro" aria-label="Rendimiento deportivo" data-activo={activo}>
    <header className="rendimiento-cabecera"><p>COMUNICACIONES · ANÁLISIS DEPORTIVO</p><h2>Rendimiento</h2>
      <span>Registros reales, métricas explicables y cobertura visible.</span></header>
    <div className="rendimiento-actualizacion"><button type="button" disabled={!fuente.usuario || !categoriaId || fuente.cargando} onClick={fuente.actualizar} aria-busy={fuente.cargando}>Actualizar datos</button>
      {fuente.cargando && <span role="status">Actualizando datos de partidos, participación y Análisis…</span>}</div>
    {errorLectura && <p role="alert">La actualización contiene fuentes con error o acceso insuficiente. Consultá los detalles en Comparativas, Rankings o Evolución; podés reintentar con Actualizar datos.</p>}
    <PestanasAccesibles etiqueta="Áreas de Rendimiento" seleccionada={seleccionada} onSeleccionar={seleccionar}
      pestanas={[
        { id: 'comparativas', etiqueta: 'Comparativas', contenido: <ComparativasPlantel fuente={fuente} filtros={filtros} onFiltros={setFiltros} jugadoras={formaciones.jugadoras} categoriaId={categoriaId} /> },
        { id: 'rankings', etiqueta: 'Rankings', contenido: <RankingsPlantel fuente={fuente} filtros={filtros} onFiltros={setFiltros} jugadoras={formaciones.jugadoras} categoriaId={categoriaId} /> },
        { id: 'evolucion', etiqueta: 'Evolución', contenido: <EvolucionPlantel fuente={fuente} filtros={filtros} onFiltros={setFiltros} jugadoras={formaciones.jugadoras} categoriaId={categoriaId} /> },
        { id: 'formaciones', etiqueta: 'Formaciones', contenido: <FormacionesPlantel {...formaciones} /> },
      ]} />
    <details className="rendimiento-resumen"><summary>Resumen y rankings existentes del plantel</summary>
      <div className="plantel-rendimiento">{children}</div></details>
  </section>
}
