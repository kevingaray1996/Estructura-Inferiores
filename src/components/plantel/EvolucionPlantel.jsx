import { useMemo, useState } from 'react'
import { seleccionarJugadora } from '../../utils/rendimiento/metricas.js'
import { construirEvolucion, compararPeriodos, METRICAS_EVOLUCION, valorEvolucion } from '../../utils/rendimiento/evolucion.js'
import { modalidadesMetrica, nombreRanking, participacionRanking } from '../../utils/rendimiento/rankings.js'
import GraficoEvolucion from './GraficoEvolucion'
import './evolucion.css'

const COLORES = ['#AD8500', '#3B82F6', '#CE5684', '#159580', '#A779E9', '#CE6C20']
const numero = v => v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
const nuevoPeriodo = () => ({ modo: 'fechas', desde: '', hasta: '', partidoIds: [] })
const filtroPeriodo = p => p.modo === 'fechas' ? { desde: p.desde, hasta: p.hasta } : { partidoIds: p.partidoIds }
const definido = p => p.modo === 'fechas' ? Boolean(p.desde || p.hasta) : p.partidoIds.length > 0
const invalido = p => p.modo === 'fechas' && p.desde && p.hasta && p.desde > p.hasta
function Foto({ jugadora }) {
  const [fallo, setFallo] = useState(false)
  return jugadora.foto_url && !fallo ? <img src={jugadora.foto_url} alt="" loading="lazy" onError={() => setFallo(true)} /> : <span className="evolucion-iniciales" aria-hidden="true">{jugadora.nombre?.[0]}{jugadora.apellido?.[0]}</span>
}
function Periodo({ etiqueta, valor, onCambiar, partidos }) {
  return <fieldset className="evolucion-periodo"><legend>Período {etiqueta}</legend>
    <label>Selección {etiqueta}<select value={valor.modo} onChange={e => onCambiar({ ...valor, modo: e.target.value })}><option value="fechas">Rango de fechas</option><option value="partidos">Grupo de partidos</option></select></label>
    {valor.modo === 'fechas' ? <><label>Desde {etiqueta}<input type="date" value={valor.desde} onChange={e => onCambiar({ ...valor, desde: e.target.value })} /></label>
      <label>Hasta {etiqueta}<input type="date" value={valor.hasta} onChange={e => onCambiar({ ...valor, hasta: e.target.value })} /></label></> : <div className="evolucion-grupo">{partidos.map(p => <label key={p.id}><input type="checkbox" checked={valor.partidoIds.includes(p.id)} onChange={e => onCambiar({ ...valor, partidoIds: e.target.checked ? [...valor.partidoIds, p.id] : valor.partidoIds.filter(id => id !== p.id) })} />{p.fecha} · {p.rival || 'Rival no informado'}</label>)}</div>}
  </fieldset>
}
function ValorPeriodo({ fila, porcentaje, unidad }) {
  return <><strong>{numero(fila?.valor)}{fila?.valor != null ? unidad : ''}</strong>
    {porcentaje && <small>{numero(fila?.numerador)} / {numero(fila?.denominador)}</small>}
    <small>{numero(fila?.partidosIncluidos)} partidos incluidos · {numero(fila?.partidosJugados)} jugados · {numero(fila?.minutos)} min</small>
    {fila?.motivo && <small>{fila.motivo}</small>}
    {(fila?.minutos == null || fila.minutos < 180 || fila.partidosIncluidos < 3 || porcentaje && fila.denominador < 10) && <small>Muestra pequeña o participación incompleta.</small>}
    {fila?.pendientes > 0 && <small>{fila.pendientes} acciones pendientes de evaluación.</small>}
  </>
}
export default function EvolucionPlantel({ fuente, categoriaId, jugadoras = [], filtros, onFiltros }) {
  const { usuario, datos, reintentar } = fuente
  const [seleccion, setSeleccion] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [metricaId, setMetricaId] = useState('minutos')
  const [modalidad, setModalidad] = useState('absoluta')
  const [grupo, setGrupo] = useState([])
  const [periodoA, setPeriodoA] = useState(nuevoPeriodo)
  const [periodoB, setPeriodoB] = useState(nuevoPeriodo)
  const [destacada, setDestacada] = useState(null)
  const metrica = METRICAS_EVOLUCION.find(m => m.id === metricaId)
  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta)
  const filtrosMotor = useMemo(() => ({ desde: filtros.desde, hasta: filtros.hasta,
    ...(filtros.partido ? { partidoIds: [filtros.partido] } : grupo.length ? { partidoIds: grupo } : {}) }), [filtros, grupo])
  const evolucion = useMemo(() => datos && !rangoInvalido ? construirEvolucion(datos, seleccion, metricaId, modalidad, filtrosMotor) : null,
    [datos, seleccion, metricaId, modalidad, filtrosMotor, rangoInvalido])
  const periodosInvalidos = invalido(periodoA) || invalido(periodoB)
  const comparacion = useMemo(() => datos && !rangoInvalido && !periodosInvalidos && definido(periodoA) && definido(periodoB) ? compararPeriodos(datos, seleccion, metricaId, modalidad, filtrosMotor, filtroPeriodo(periodoA), filtroPeriodo(periodoB)) : null,
    [datos, seleccion, metricaId, modalidad, filtrosMotor, rangoInvalido, periodosInvalidos, periodoA, periodoB])
  const elegidas = seleccion.map(id => jugadoras.find(j => j.id === id)).filter(Boolean)
  const series = elegidas.map((j, i) => ({ ...evolucion?.series.find(s => s.jugadorId === j.id), jugadorId: j.id, puntos: evolucion?.series.find(s => s.jugadorId === j.id)?.puntos || [], nombre: nombreRanking(j), color: COLORES[i] }))
  const visibles = jugadoras.filter(j => nombreRanking(j).toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const errores = Object.entries(datos?.fuentes || {}).filter(([, f]) => ['error', 'denegado', 'no_disponible'].includes(f.estado))
  const cambiarFiltro = (campo, valor) => onFiltros(previo => ({ ...previo, [campo]: valor }))
  function alternar(id) {
    if (seleccion.includes(id)) { setSeleccion(seleccion.filter(v => v !== id)); if (destacada === id) setDestacada(null); setMensaje('Jugadora quitada.'); return }
    if (seleccion.length >= 6) { setMensaje('Máximo de seis jugadoras. Quitá una para reemplazarla.'); return }
    setSeleccion(seleccionarJugadora(seleccion, id)); setMensaje('Jugadora agregada.')
  }
  const unidad = modalidad === 'porcentaje' ? '%' : modalidad === 'por90' ? ' /90' : metricaId === 'minutos' ? ' min' : ''
  return <section className="evolucion-premium" aria-label="Evolución deportiva">
    <header className="evolucion-cabecera"><p>COMUNICACIONES · TEMPORADA EN PERSPECTIVA</p><h3>Evolución</h3><span>Partido a partido. Datos reales y contexto visible.</span></header>
    <div className="evolucion-filtros">
      <label>Indicador<select value={metricaId} onChange={e => { const m = METRICAS_EVOLUCION.find(m => m.id === e.target.value); setMetricaId(m.id); setModalidad(modalidadesMetrica(m)[0]) }}>{METRICAS_EVOLUCION.map(m => <option key={m.id} value={m.id}>{m.etiqueta}</option>)}</select></label>
      <label>Modalidad<select value={modalidad} onChange={e => setModalidad(e.target.value)}>{modalidadesMetrica(metrica).map(m => <option key={m} value={m}>{m === 'por90' ? 'Por 90 minutos' : m === 'porcentaje' ? 'Porcentaje' : 'Absoluta'}</option>)}</select></label>
      <label>Desde<input type="date" value={filtros.desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></label>
      <label>Hasta<input type="date" value={filtros.hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></label>
      <label>Partido<select value={filtros.partido} onChange={e => cambiarFiltro('partido', e.target.value)}><option value="">Todos los partidos accesibles</option>{(datos?.partidos || []).map(p => <option key={p.id} value={p.id}>{p.fecha} · {p.rival || 'Rival no informado'}</option>)}</select></label>
    </div>
    {rangoInvalido && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    {!filtros.partido && <details><summary>Elegir un conjunto de partidos ({grupo.length || 'todos'})</summary><div className="evolucion-grupo">{(datos?.partidos || []).map(p => <label key={p.id}><input type="checkbox" checked={grupo.includes(p.id)} onChange={e => setGrupo(e.target.checked ? [...grupo, p.id] : grupo.filter(id => id !== p.id))} />{p.fecha} · {p.rival || 'Rival no informado'}</label>)}</div><p>Sin selección se incluyen todos los partidos del rango. Este conjunto es propio de Evolución; el filtro Partido tiene prioridad.</p></details>}
    <label>Buscar jugadora<input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} /></label>
    <p role="status">{elegidas.length}/6 seleccionadas. {mensaje}</p>
    {busqueda && !visibles.length && <p role="status">No se encontraron jugadoras con esa búsqueda</p>}
    <div className="evolucion-selector">{visibles.map(j => <button key={j.id} type="button" aria-pressed={seleccion.includes(j.id)} onClick={() => alternar(j.id)}><Foto key={j.foto_url || j.id} jugadora={j} /><span><strong>{nombreRanking(j)}</strong><small>{j.posicion || 'Sin puesto'}</small></span></button>)}</div>
    <div className="evolucion-leyenda">{elegidas.map((j, i) => <div key={j.id} style={{ '--serie': COLORES[i] }}><button type="button" aria-pressed={destacada === j.id} onClick={() => setDestacada(destacada === j.id ? null : j.id)}><Foto key={j.foto_url || j.id} jugadora={j} /><strong>{nombreRanking(j)}</strong><small>{j.posicion}</small></button><button type="button" onClick={() => alternar(j.id)} aria-label={`Quitar ${nombreRanking(j)}`}>Quitar</button></div>)}</div>
    {!categoriaId ? <p role="status">Sin categoría accesible para consultar Evolución.</p> : !usuario ? <p role="status">Se requiere una sesión autenticada para consultar Evolución.</p> : !datos ? <p role="status">Consultando fuentes de Rendimiento…</p> : <>
      {errores.length > 0 && <div role="alert">{errores.map(([nombre, f]) => <p key={nombre}>{nombre}: {f.mensaje || 'Fuente no disponible por una lectura anterior fallida.'}</p>)}<button type="button" onClick={reintentar}>Reintentar lectura</button></div>}
      <p className="evolucion-aviso">Cobertura del análisis desconocida. Cero significa cero registros observados, no rendimiento nulo. Las diferencias no acreditan mejora o empeoramiento. Los goles etiquetados no se suman a los oficiales.</p>
      {evolucion?.motor.sinVinculo.length > 0 && <p>{evolucion.motor.sinVinculo.length} análisis sin vínculo deportivo fiable excluidos.</p>}
      {evolucion?.sinFecha.length > 0 && <p>{evolucion.sinFecha.length} partidos sin fecha válida no se ubican en el gráfico cronológico.</p>}
      {datos.fuentes.partidos?.estado === 'disponible' && evolucion?.motor.partidos.length === 0 && <p role="status">Sin partidos accesibles en este rango.</p>}
      {!elegidas.length ? <p role="status">Seleccioná entre una y seis jugadoras para ver su evolución.</p> : evolucion && <>
        <div className="evolucion-resumen" aria-label="Resumen del conjunto filtrado">{elegidas.map((j, i) => {
          const r = evolucion.motor.jugadoras.find(r => r.jugadorId === j.id)
          const agregado = valorEvolucion(r, metrica, modalidad)
          const participacion = participacionRanking(r)
          return <article key={j.id} style={{ '--serie': COLORES[i] }}><h4>{nombreRanking(j)}</h4><strong>{numero(agregado.valor)}{agregado.valor != null ? unidad : ''}</strong><p>{metrica.etiqueta} · agregado del conjunto filtrado</p>
            {metrica.porcentaje && <small>{numero(agregado.numerador)} / {numero(agregado.denominador)} {metricaId === 'precision' ? 'pases registrados' : 'acciones evaluadas'}</small>}
            <small>{numero(participacion.minutos)} min · {numero(participacion.partidos)} partidos jugados / {evolucion.motor.partidos.length} incluidos</small>
            {(participacion.minutos == null || participacion.minutos < 180 || evolucion.motor.partidos.length < 3) && <small>Muestra pequeña o participación incompleta.</small>}
            {r?.acciones?.resultados.pendientes > 0 && <small>{r.acciones.resultados.pendientes} acciones pendientes de evaluación.</small>}
            {agregado.motivo && <small>{agregado.motivo}</small>}
          </article>
        })}</div>
        <h4>{metrica.etiqueta} · {modalidad === 'por90' ? 'por 90 minutos' : modalidad}</h4>
        <GraficoEvolucion key={`${metricaId}:${modalidad}:${evolucion.partidos.map(p => p.id).join(',')}:${seleccion.join(',')}`} partidos={evolucion.partidos} series={series} destacada={destacada} unidad={unidad} />
        {!series.some(s => s.puntos.some(p => p.valor !== null)) && <p role="status">No hay puntos calculables con estos filtros. Consultá los motivos en la tabla.</p>}
        <div className="evolucion-tabla"><table><caption>Valores por partido · — indica dato ausente; nunca cero inventado.</caption><thead><tr><th scope="col">Partido</th>{elegidas.map(j => <th key={j.id} scope="col">{nombreRanking(j)}</th>)}</tr></thead><tbody>{evolucion.partidos.map((p, i) => <tr key={p.id}><th scope="row">{p.fecha} · {p.rival || 'Rival no informado'}</th>{series.map(s => { const punto = s.puntos[i]; return <td key={s.jugadorId}>{numero(punto.valor)}{punto.valor != null ? unidad : ''}
          {metrica.porcentaje && <small>{numero(punto.numerador)} / {numero(punto.denominador)} {metricaId === 'precision' ? 'pases registrados' : 'acciones evaluadas'}</small>}<small>{numero(punto.minutos)} min</small>{punto.motivo && <small>{punto.motivo}</small>}</td> })}</tr>)}</tbody></table></div>
        <section aria-label="Comparación entre períodos"><h4>Comparar períodos</h4><p>Los períodos se intersectan con los filtros de fecha, partido y conjunto del gráfico. Las tasas y porcentajes se recalculan sobre sus registros agregados.</p>
          <div className="evolucion-periodos"><Periodo etiqueta="A" valor={periodoA} onCambiar={setPeriodoA} partidos={evolucion.partidos} /><Periodo etiqueta="B" valor={periodoB} onCambiar={setPeriodoB} partidos={evolucion.partidos} /></div>
          {periodosInvalidos ? <p role="alert">Revisá las fechas de los períodos: el inicio no puede ser posterior al final.</p> : !comparacion ? <p role="status">Definí ambos períodos con fechas o grupos de partidos.</p> : <>
            {comparacion.solapados.length > 0 && <p role="status">Los períodos comparten {comparacion.solapados.length} partidos; no son muestras independientes.</p>}
            <div className="evolucion-tabla"><table><caption>{metrica.etiqueta} · A frente a B</caption><thead><tr><th scope="col">Jugadora</th><th scope="col">Período A</th><th scope="col">Período B</th><th scope="col">Diferencia B − A</th><th scope="col">Variación relativa</th></tr></thead><tbody>{comparacion.filas.map(f => <tr key={f.jugadorId}><th scope="row">{nombreRanking(jugadoras.find(j => j.id === f.jugadorId))}</th><td><ValorPeriodo fila={f.a} porcentaje={metrica.porcentaje} unidad={unidad} /></td><td><ValorPeriodo fila={f.b} porcentaje={metrica.porcentaje} unidad={unidad} /></td><td>{numero(f.diferencia)}{f.diferencia != null ? metrica.porcentaje ? ' puntos porcentuales' : unidad : ''}</td><td>{numero(f.variacion)}{f.variacion != null ? '%' : ''}{f.a.valor === 0 && <small>No calculable con base A igual a cero.</small>}</td></tr>)}</tbody></table></div>
          </>}
        </section>
      </>}
    </>}
  </section>
}
