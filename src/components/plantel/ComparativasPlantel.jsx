import { useMemo, useRef, useState } from 'react'
import useDatosRendimiento from './useDatosRendimiento'
import { construirRendimiento, seleccionarJugadora } from '../../utils/rendimiento/metricas.js'
import { METRICAS, crearRadar, detalleMetrica, metricasRadar } from '../../utils/rendimiento/comparativas.js'
import RadarComparativo from './RadarComparativo'
import './comparativas.css'

const COLORES = ['#AD8500', '#3B82F6', '#CE5684', '#159580', '#A779E9', '#CE6C20']
const nombre = j => [j.apellido, j.nombre].filter(Boolean).join(', ')
const formato = v => v == null ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })
function Foto({ jugadora }) {
  const [fallo, setFallo] = useState(false)
  return jugadora.foto_url && !fallo ? <img src={jugadora.foto_url} alt="" loading="lazy" onError={() => setFallo(true)} /> :
    <span className="comparativas-iniciales" aria-hidden="true">{jugadora.nombre?.[0]}{jugadora.apellido?.[0]}</span>
}

export default function ComparativasPlantel(props) {
  return props.fuente ? <VistaComparativas {...props} /> : <ComparativasAutonoma {...props} />
}
function ComparativasAutonoma(props) {
  const fuente = useDatosRendimiento(props.activo, props.categoriaId)
  return <VistaComparativas {...props} fuente={fuente} />
}
function VistaComparativas({ fuente, categoriaId, jugadoras = [], filtros, onFiltros }) {
  const { usuario, datos, reintentar } = fuente
  const [modo, setModo] = useState('puesto')
  const [posicion, setPosicion] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const campoBusqueda = useRef(null)
  const [locales, setLocales] = useState({ desde: '', hasta: '', partido: '' })
  const { desde, hasta, partido } = filtros || locales
  const cambiarFiltro = (campo, valor) => (onFiltros || setLocales)(previo => ({ ...previo, [campo]: valor }))
  const [destacada, setDestacada] = useState(null)
  const [percentiles, setPercentiles] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const posiciones = [...new Set(jugadoras.map(j => j.posicion).filter(Boolean))].sort()
  const puesto = posicion || posiciones[0] || ''
  const referencia = jugadoras.filter(j => modo === 'libre' || j.posicion === puesto)
  const visibles = referencia.filter(j => nombre(j).toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)
  const motor = useMemo(() => datos && !rangoInvalido ? construirRendimiento(datos, {
    desde, hasta, ...(partido ? { partidoIds: [partido] } : {}), jugadoraIds: jugadoras.map(j => j.id),
  }) : null, [datos, desde, hasta, partido, jugadoras, rangoInvalido])
  const elegidas = referencia.filter(j => seleccion.includes(j.id))
  const resultados = elegidas.map(j => motor?.jugadoras.find(r => r.jugadorId === j.id)).filter(Boolean)
  const radar = crearRadar(resultados, (motor?.jugadoras || []).filter(j => referencia.some(r => r.id === j.jugadorId)), metricasRadar(modo, puesto), percentiles)
  const errores = Object.entries(datos?.fuentes || {}).filter(([, f]) => ['error', 'denegado', 'no_disponible'].includes(f.estado))
  function cambiarGrupo(valor, esModo) {
    if (esModo) setModo(valor); else setPosicion(valor)
    setSeleccion([]); setDestacada(null); setMensaje('Selección vaciada al cambiar el grupo de comparación.')
  }
  function alternar(id) {
    if (seleccion.includes(id)) { setSeleccion(seleccion.filter(x => x !== id)); if (destacada === id) setDestacada(null); setMensaje('Jugadora quitada.'); return }
    if (seleccion.length === 6) { setMensaje('Alcanzaste seis jugadoras. Quitá una para reemplazarla.'); return }
    setSeleccion(seleccionarJugadora(seleccion, id)); setMensaje('Jugadora agregada.')
  }
  return <div className="comparativas-premium">
    <header><p className="comparativas-antetitulo">DATOS REALES · ANÁLISIS</p><h3>Comparativas</h3><p>Elegí de dos a seis jugadoras. Compará registros, no calificaciones de calidad.</p></header>
    <div className="comparativas-filtros">
      <label>Modo<select value={modo} onChange={e => cambiarGrupo(e.target.value, true)}><option value="puesto">Por puesto principal</option><option value="libre">Libre · métricas comunes</option></select></label>
      {modo === 'puesto' && <label>Posición principal<select value={puesto} onChange={e => cambiarGrupo(e.target.value, false)}>{posiciones.map(p => <option key={p}>{p}</option>)}</select></label>}
      <label>Desde<input type="date" value={desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></label>
      <label>Partido<select value={partido} onChange={e => cambiarFiltro('partido', e.target.value)}><option value="">Todos los partidos accesibles</option>{(datos?.partidos || []).map(p => <option key={p.id} value={p.id}>{p.fecha} · {p.rival || 'Rival no informado'}</option>)}</select></label>
    </div>
    {rangoInvalido && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    <label className="comparativas-busqueda">Buscar jugadora<input ref={campoBusqueda} type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre o apellido" /></label>
    {busqueda.trim() && visibles.length === 0 && <div role="status"><p>No se encontraron jugadoras con esa búsqueda</p>
      <button type="button" onClick={() => { setBusqueda(''); campoBusqueda.current?.focus() }}>Limpiar búsqueda</button></div>}
    <p aria-live="polite">{elegidas.length}/6 seleccionadas. {mensaje}</p>
    <div className="comparativas-selector" aria-label="Seleccionar jugadoras">
      {visibles.map(j => <button type="button" key={j.id} aria-pressed={seleccion.includes(j.id)} onClick={() => alternar(j.id)}>
        <Foto jugadora={j} /><span><strong>{nombre(j)}</strong><small>{j.posicion || 'Sin puesto'}</small></span><b aria-hidden="true">{seleccion.includes(j.id) ? '✓' : '+'}</b>
      </button>)}
    </div>
    <div className="comparativas-elegidas">{elegidas.map(j => <button type="button" key={j.id} onClick={() => alternar(j.id)} aria-label={`Quitar ${nombre(j)}`}>{nombre(j)} ×</button>)}</div>
    {!categoriaId ? <p role="status">Sin jugadoras accesibles con categoría para consultar Rendimiento.</p> : !usuario ? <p role="status">Se requiere una sesión autenticada para consultar las fuentes de Análisis.</p> : !datos ? <p role="status">Consultando fuentes de Rendimiento…</p> : <>
      {errores.length > 0 && <div role="alert">{errores.map(([fuente, f]) => <p key={fuente}>{fuente}: {f.mensaje || 'Fuente no disponible por una lectura anterior fallida.'}</p>)}<button type="button" onClick={reintentar}>Reintentar lectura</button></div>}
      <p className="comparativas-aviso">Solo se muestran registros accesibles mediante los permisos actuales. Una lectura vacía no acredita que no existan datos fuera de tu acceso. Cobertura del etiquetado desconocida: los conteos no prueban un análisis completo.</p>
      {motor?.sinVinculo.length > 0 && <p role="status">{motor.sinVinculo.length} análisis sin vínculo deportivo fiable excluidos. No se asocian por fecha o rival.</p>}
      {motor?.partidos.some(p => p.estadoAnalisis === 'sin_analisis' || p.estadoAnalisis === 'no_disponible') && <p role="status">El conjunto incluye partidos sin análisis accesible o con datos inconsistentes. Los agregados incompletos se muestran como —. Elegí un partido con análisis para consultar sus registros.</p>}
      {datos.fuentes.partidos?.estado === 'disponible' && Array.isArray(datos.partidos) && motor?.partidos.length === 0 && !rangoInvalido && <p role="status">Sin partidos accesibles en este rango.</p>}
      {elegidas.length < 2 ? <p role="status">Seleccioná al menos dos jugadoras para comparar, aunque sean las únicas de su puesto.</p> : motor && <>
        <div className="comparativas-escenario">
          <div className="comparativas-grafico"><h4>Perfil de acciones registradas</h4>
            <label><input type="checkbox" checked={percentiles && radar.percentilesDisponibles} disabled={!radar.percentilesDisponibles} onChange={e => setPercentiles(e.target.checked)} /> Percentiles internos</label>
            <p>{radar.percentilesDisponibles ? 'Muestra válida de al menos diez jugadoras por eje.' : 'Muestra insuficiente para percentiles (mínimo diez jugadoras válidas por eje). La comparación sigue disponible.'} La referencia usa todas las jugadoras del grupo con el mismo rango y partido; para percentiles exige minutos confirmados positivos.</p>
            <RadarComparativo radar={percentiles && radar.percentilesDisponibles ? { ...radar, ejes: radar.ejes.map(e => ({ ...e, maximo: 100 })) } : radar} colores={COLORES} destacada={destacada} />
            <p>Porcentajes: escala 0–100. Conteos: 0–máximo del grupo con estos filtros. En percentiles, todos los ejes van de 0 a 100. Ejes incompletos: puntos disponibles sin polígono, nunca ceros inventados.</p>
          </div>
          <aside className="comparativas-leyenda" aria-label="Destacar jugadora">{elegidas.map((j, i) => {
            const r = resultados.find(x => x.jugadorId === j.id)
            return <div key={j.id} style={{ '--serie': COLORES[i] }}><button type="button" aria-pressed={destacada === j.id} onClick={() => setDestacada(destacada === j.id ? null : j.id)}><Foto jugadora={j} /><strong>{nombre(j)}</strong><small>{j.posicion}</small></button>
              <p>{formato(r?.participacion.minutos)} min · {formato(r?.participacion.titularidades)} titularidades</p>
              {(!(r?.participacion.minutos > 0) || radar.series.find(s => s.jugadorId === j.id)?.valores.some(v => v === null)) && <p>Percentil no disponible: faltan participación confirmada o datos del indicador. Los valores reales permanecen en la tabla.</p>}
              <p>{r?.partidos.filter(p => p.participacion.minutos > 0).length || 0} partidos con minutos confirmados / {motor.partidos.length} filtrados</p>
              {r?.participacion.minutos != null && r.participacion.minutos < 180 && <p>Pocos minutos: menos de 180.</p>}
              {r?.participacion.minutos == null && <p>Minutos incompletos o inválidos en el conjunto filtrado.</p>}
              {!r?.acciones?.efectividad.evaluadas && <p>Sin acciones evaluables confirmadas.</p>}
              {r?.acciones?.resultados.pendientes > 0 && <p>{r.acciones.resultados.pendientes} acciones pendientes de evaluación.</p>}
              {r?.por90.valor == null && <p>Tasas por 90 no disponibles: faltan minutos positivos o análisis vinculados en el mismo conjunto de partidos.</p>}
            </div>
          })}</aside>
        </div>
        <div className="comparativas-tabla"><table><caption>Valores reales · — significa no disponible, no cero. Tasas de acciones registradas por 90 minutos. Los goles etiquetados no se suman a los oficiales.</caption><thead><tr><th scope="col">Indicador</th>{elegidas.map(j => <th scope="col" key={j.id}>{nombre(j)}</th>)}</tr></thead><tbody>
          {METRICAS.map(m => <tr key={m.id}><th scope="row">{m.etiqueta}</th>{elegidas.map(j => { const d = detalleMetrica(resultados.find(r => r.jugadorId === j.id), m); return <td key={j.id}>{formato(d.valor)}{d.valor != null && m.porcentaje ? '%' : ''}<small>{m.porcentaje ? `${formato(d.numerador)} / ${formato(d.denominador)} ${m.id === 'precision' ? 'pases registrados' : 'acciones evaluadas'}` : `${formato(d.tasa)} /90`}</small></td> })}</tr>)}
        </tbody></table></div>
      </>}
    </>}
  </div>
}
