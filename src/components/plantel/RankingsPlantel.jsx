import { useMemo, useState } from 'react'
import { construirRendimiento } from '../../utils/rendimiento/metricas.js'
import { construirRanking, METRICAS_RANKING, modalidadesMetrica, nombreRanking } from '../../utils/rendimiento/rankings.js'
import { GRUPOS_PLANTEL } from './posicionesPlantel.js'
import './rankings.css'

const numero = v => v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
function FotoRanking({ jugadora }) {
  const [fallo, setFallo] = useState(false)
  return jugadora.foto_url && !fallo ? <img src={jugadora.foto_url} alt="" loading="lazy" onError={() => setFallo(true)} /> :
    <span className="ranking-iniciales" aria-hidden="true">{jugadora.nombre?.[0]}{jugadora.apellido?.[0]}</span>
}
function ValorRanking({ fila, ranking }) {
  return <><strong className="ranking-valor">{numero(fila.valor)}{ranking.modalidad === 'porcentaje' ? '%' : ranking.modalidad === 'por90' ? ' /90' : ''}</strong>
    {fila.valor === 0 && !ranking.metrica.participacion && !ranking.metrica.porcentaje && <small>0 acciones registradas{ranking.modalidad === 'por90' ? ' por 90 minutos' : ''}; cobertura desconocida.</small>}
    {!ranking.metrica.participacion && !fila.participacionConfirmada && <small>Eventos propios registrados; participación no confirmada o incompleta.</small>}
    {ranking.metrica.porcentaje && <small>{numero(fila.numerador)} / {numero(fila.denominador)} {ranking.metrica.id === 'precision' ? 'pases registrados' : 'acciones evaluadas'}</small>}</>
}
export default function RankingsPlantel({ fuente, categoriaId, jugadoras = [], filtros, onFiltros }) {
  const { usuario, datos, reintentar } = fuente
  const [metricaId, setMetricaId] = useState('minutos')
  const [modalidad, setModalidad] = useState('absoluta')
  const [puesto, setPuesto] = useState('')
  const metrica = METRICAS_RANKING.find(m => m.id === metricaId)
  const cambiarFiltro = (campo, valor) => onFiltros(previo => ({ ...previo, [campo]: valor }))
  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta)
  const motor = useMemo(() => datos && !rangoInvalido ? construirRendimiento(datos, {
    desde: filtros.desde, hasta: filtros.hasta, ...(filtros.partido ? { partidoIds: [filtros.partido] } : {}), jugadoraIds: jugadoras.map(j => j.id),
  }) : null, [datos, filtros, jugadoras, rangoInvalido])
  const ranking = construirRanking(motor, jugadoras, { metricaId, modalidad, grupo: puesto.startsWith('grupo:') ? puesto.slice(6) : '', posicion: puesto.startsWith('puesto:') ? puesto.slice(7) : '' })
  const errores = Object.entries(datos?.fuentes || {}).filter(([, f]) => ['error', 'denegado', 'no_disponible'].includes(f.estado))
  const posiciones = [...new Set(jugadoras.map(j => j.posicion).filter(Boolean))].sort()
  const listo = Boolean(usuario && categoriaId && datos && motor)
  return <section className="rankings-premium" aria-label="Rankings deportivos">
    <header className="ranking-cabecera"><p>COMUNICACIONES · REGISTROS DEPORTIVOS</p><h3>Rankings</h3><span>Una métrica. Un contexto. Sin puntajes generales de calidad.</span></header>
    <div className="ranking-filtros">
      <label>Puesto o grupo<select value={puesto} onChange={e => setPuesto(e.target.value)}><option value="">Todas las posiciones</option>
        <optgroup label="Grupos">{GRUPOS_PLANTEL.map(([id, nombre]) => <option key={id} value={`grupo:${id}`}>{nombre}</option>)}</optgroup>
        <optgroup label="Posición principal">{posiciones.map(p => <option key={p} value={`puesto:${p}`}>{p}</option>)}</optgroup>
      </select></label>
      <label>Indicador<select value={metricaId} onChange={e => {
        const nueva = METRICAS_RANKING.find(m => m.id === e.target.value)
        setMetricaId(nueva.id); setModalidad(modalidadesMetrica(nueva)[0])
      }}>{METRICAS_RANKING.map(m => <option key={m.id} value={m.id}>{m.etiqueta}</option>)}</select></label>
      <label>Modalidad<select value={modalidad} onChange={e => setModalidad(e.target.value)}>{modalidadesMetrica(metrica).map(m => <option key={m} value={m}>{m === 'por90' ? 'Por 90 minutos' : m === 'porcentaje' ? 'Porcentaje' : 'Absoluta'}</option>)}</select></label>
      <label>Desde<input type="date" value={filtros.desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></label>
      <label>Hasta<input type="date" value={filtros.hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></label>
      <label>Partido<select value={filtros.partido} onChange={e => cambiarFiltro('partido', e.target.value)}><option value="">Todos los partidos accesibles</option>{(datos?.partidos || []).map(p => <option key={p.id} value={p.id}>{p.fecha} · {p.rival || 'Rival no informado'}</option>)}</select></label>
    </div>
    {rangoInvalido && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    {!categoriaId ? <p role="status">Sin categoría accesible para consultar Rankings.</p> : !usuario ? <p role="status">Se requiere una sesión autenticada para consultar Rankings.</p> : !datos ? <p role="status">Consultando fuentes de Rendimiento…</p> : <>
      {errores.length > 0 && <div role="alert">{errores.map(([nombre, f]) => <p key={nombre}>{nombre}: {f.mensaje || 'Fuente no disponible por una lectura anterior fallida.'}</p>)}<button type="button" onClick={reintentar}>Reintentar lectura</button></div>}
      <p className="ranking-aviso">Clasificación descriptiva de registros accesibles, no evaluación definitiva. Cobertura del análisis desconocida. Cero significa cero acciones registradas, no rendimiento nulo. Los goles etiquetados no se suman a los oficiales.</p>
      {listo && <>
        <p role="status">{ranking.filas.length} jugadoras con valor calculable · {motor.partidos.length} partidos deportivos filtrados · {ranking.excluidas.length} excluidas por datos insuficientes.</p>
        {motor.sinVinculo.length > 0 && <p>{motor.sinVinculo.length} análisis sin vínculo deportivo fiable excluidos.</p>}
        {datos.fuentes.partidos?.estado === 'disponible' && motor.partidos.length === 0 && <p role="status">Sin partidos accesibles en este rango.</p>}
        {ranking.filas.length > 0 ? <>
          <section className="ranking-podio" aria-label={`Primeras posiciones de ${metrica.etiqueta}`}><h4>{metrica.etiqueta} · {ranking.podio.length === 3 ? 'Top 3' : `${ranking.podio.length} registros válidos`}</h4>
            <div>{ranking.podio.map(f => <article key={f.jugadora.id} data-podio-id={f.jugadora.id} className={f.puesto === 1 ? 'ranking-primera' : ''}>
              <span className="ranking-puesto">#{f.puesto}</span><FotoRanking key={f.jugadora.foto_url || f.jugadora.id} jugadora={f.jugadora} /><h5>{nombreRanking(f.jugadora)}</h5><p>{f.jugadora.posicion || 'Sin posición'}</p>
              <ValorRanking fila={f} ranking={ranking} /><small>{numero(f.minutos)} min · {numero(f.partidos)} partidos jugados</small>
              {f.muestraPequena && <small>Muestra pequeña o participación incompleta.</small>}
            </article>)}</div>
          </section>
          <section aria-label="Clasificación completa"><h4>Clasificación completa · {metrica.etiqueta}</h4><p>Orden descendente. Los empates exactos comparten puesto; el orden alfabético solo organiza su presentación.</p>
            <ol className="ranking-lista">{ranking.filas.map(f => <li key={f.jugadora.id} data-ranking-id={f.jugadora.id}>
              <span className="ranking-puesto" aria-label={`Puesto ${f.puesto}`}>#{f.puesto}</span><FotoRanking key={f.jugadora.foto_url || f.jugadora.id} jugadora={f.jugadora} />
              <div className="ranking-identidad"><strong>{nombreRanking(f.jugadora)}</strong><small>{f.jugadora.posicion || 'Sin posición'}</small>
                <span className="ranking-barra" aria-hidden="true"><span style={{ width: `${ranking.maximo > 0 ? f.valor * 100 / ranking.maximo : 0}%` }} /></span>
                <small>{numero(f.minutos)} min · {numero(f.partidos)} partidos jugados / {motor.partidos.length} filtrados</small>
                {f.muestraPequena && <small>Muestra pequeña: menos de 180 min, tres partidos o diez acciones del denominador; o participación incompleta.</small>}
                {f.pendientes > 0 && <small>{f.pendientes} acciones pendientes de evaluación.</small>}
              </div><div className="ranking-cifra"><ValorRanking fila={f} ranking={ranking} /></div>
            </li>)}</ol>
          </section>
        </> : !errores.length && <p role="status">No hay valores calculables para este indicador y estos filtros. No se crea un podio sin registros válidos.</p>}
        {ranking.excluidas.length > 0 && <details><summary>Ver jugadoras fuera de clasificación ({ranking.excluidas.length})</summary><ul>{ranking.excluidas.map(f => <li key={f.jugadora.id}>{nombreRanking(f.jugadora)}: {f.motivo}</li>)}</ul></details>}
      </>}
    </>}
  </section>
}
