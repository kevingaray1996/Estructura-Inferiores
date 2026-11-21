import { useEffect, useId, useMemo, useState } from 'react'
import {
  CAPAS, NOMBRE_TERCIO, avisosDireccion, calor, filtrarAcciones, opcionesResultado, porTercio, prepararAcciones, resumenCapa,
} from '../../utils/analisis/mapaAcciones'
import './mapaAcciones.css'

const TIEMPOS = [['1', '1T'], ['2', '2T'], ['partido', 'Partido']]
const MODOS = [['puntos', 'Puntos'], ['calor', 'Calor'], ['zonas', 'Zonas']]
// Cancha de 100 x 64 (x: largo, y: ancho). El margen deja ver los arcos.
const VISTA_COMPLETA = { x: -3, y: -3, ancho: 106, alto: 70 }
const VISTA_MEDIA = { x: 47, y: -3, ancho: 56, alto: 70 }
const Y = (y) => y * 0.64

const ESTADO = {
  bien: 'Salió bien', mal: 'Salió mal', neutro: 'Sin resultado',
  gol: 'Gol', arco: 'Al arco', afuera: 'Afuera o bloqueado', pendiente: 'Sin resultado',
}

// Mapa de acciones unificado: el mismo en la pestaña Mapa (completo) y abajo del panel del video (compacto).
// eventos: las acciones del alcance elegido. partidos y marcas: Map por partido_id. detallesPases: destinos por id de evento.
// onVideo(evento): abrir el video en esa acción. onDestinoPase(evento): ver o editar el destino (opcional).
export default function MapaAcciones({
  eventos = [], partidos, marcas, detallesPases = {}, nombreJugadora = () => '', etiquetaTipo = (c) => c,
  onVideo, onDestinoPase, compacto = false, estadoPases = {}, masFiltros = null, titulo = 'Mapa de acciones',
}) {
  const [capa, setCapa] = useState('todas')
  const [resultado, setResultado] = useState('todas')
  const [tiempo, setTiempo] = useState('partido')
  const [modo, setModo] = useState('puntos')
  const [pasesErrados, setPasesErrados] = useState(true)
  const [seleccionId, setSeleccionId] = useState(null)
  const [ayuda, setAyuda] = useState(false)
  const [lista, setLista] = useState(false)
  const prefijo = useId().replaceAll(':', '')

  const acciones = useMemo(() => prepararAcciones(eventos, { partidos, marcas, detallesPases }), [eventos, partidos, marcas, detallesPases])
  const filtradas = useMemo(() => filtrarAcciones(acciones, { capa, resultado, tiempo, pasesErrados }), [acciones, capa, resultado, tiempo, pasesErrados])
  const conPunto = useMemo(() => filtradas.filter((a) => a.punto), [filtradas])
  const avisos = useMemo(() => avisosDireccion(acciones, { partidos, marcas }), [acciones, partidos, marcas])
  const resumen = useMemo(() => resumenCapa(filtradas, capa, nombreJugadora), [filtradas, capa, nombreJugadora])
  const tercios = useMemo(() => (modo === 'zonas' ? porTercio(filtradas) : []), [modo, filtradas])
  const densidad = useMemo(() => (modo === 'calor' ? calor(conPunto.map((a) => a.punto)) : null), [modo, conPunto])
  const seleccion = filtradas.find((a) => a.id === seleccionId && a.punto) || null
  const opciones = opcionesResultado(capa)
  const media = capa === 'remates' && modo === 'puntos'
  const vista = media ? VISTA_MEDIA : VISTA_COMPLETA
  const flechas = capa === 'pases' && modo === 'puntos'
  const variosPartidos = new Set(filtradas.map((a) => a.evento.partido_id)).size > 1

  useEffect(() => {
    if (!seleccion && !ayuda) return undefined
    const alTeclado = (e) => { if (e.key === 'Escape') { setSeleccionId(null); setAyuda(false) } }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [seleccion, ayuda])

  function elegirCapa(id) {
    setCapa(id); setResultado('todas'); setSeleccionId(null)
  }
  function verTodas() {
    setCapa('todas'); setResultado('todas'); setTiempo('partido'); setSeleccionId(null)
  }

  const fichaPos = seleccion ? {
    izquierda: ((seleccion.punto.x - vista.x) / vista.ancho) * 100,
    arriba: ((Y(seleccion.punto.y) - vista.y) / vista.alto) * 100,
  } : null

  return (
    <div className="ma" data-compacto={compacto ? 'si' : undefined}>
      <div className="ma-cabecera">
        <h2 className="ma-titulo">{titulo}</h2>
        <div className="ma-cabecera-acciones">
          <button type="button" className="ma-boton-texto" aria-pressed={lista} onClick={() => setLista((v) => !v)}>
            {lista ? 'Ver la cancha' : `Ver lista (${filtradas.length})`}
          </button>
          <button type="button" className="ma-info" aria-expanded={ayuda} aria-controls={`${prefijo}-ayuda`}
            aria-label="Cómo leer el mapa" title="Cómo leer el mapa" onClick={() => setAyuda((v) => !v)}>i</button>
        </div>
      </div>
      {ayuda && (
        <div id={`${prefijo}-ayuda`} className="ma-ayuda" role="note">
          <ul>
            <li>Siempre atacamos hacia la derecha. El 2T se da vuelta solo.</li>
            <li>Amarillo: salió bien. Rojo punteado: salió mal. Gris: sin resultado.</li>
            <li>Tocá un punto para ver quién fue, en qué minuto, y abrir el video.</li>
            <li>Calor: dónde se juntan más acciones. Zonas: qué parte pasó en cada tercio.</li>
            <li>Pase progresivo: el que acerca la pelota al arco rival 30 m en campo propio, 15 m si cruza la mitad o 10 m en campo rival.</li>
          </ul>
        </div>
      )}

      <div className="ma-filtros">
        <div className="ma-capas" role="group" aria-label="Capa">
          {CAPAS.map((c) => (
            <button key={c.id} type="button" className="ma-chip" aria-pressed={capa === c.id} onClick={() => elegirCapa(c.id)}>{c.nombre}</button>
          ))}
        </div>
        <div className="ma-controles">
          {opciones.length > 0 && (
            <Segmento etiqueta="Resultado" opciones={opciones} valor={resultado} cambiar={(v) => { setResultado(v); setSeleccionId(null) }} />
          )}
          <Segmento etiqueta="Tiempo" opciones={TIEMPOS} valor={tiempo} cambiar={(v) => { setTiempo(v); setSeleccionId(null) }} />
          <Segmento etiqueta="Ver como" opciones={MODOS} valor={modo} cambiar={(v) => { setModo(v); setSeleccionId(null) }} />
          {capa === 'perdidas' && (
            <button type="button" className="ma-interruptor" role="switch" aria-checked={pasesErrados} onClick={() => setPasesErrados((v) => !v)}>
              <span className="ma-interruptor-riel" aria-hidden="true"><span /></span>Incluir pases errados
            </button>
          )}
        </div>
        {masFiltros && <details className="ma-mas"><summary>Más filtros</summary><div className="ma-mas-cuerpo">{masFiltros}</div></details>}
      </div>

      {avisos.map((aviso) => <p key={aviso} className="ma-aviso" role="status">{aviso}</p>)}
      {capa === 'pases' && estadoPases.cargando && <p className="ma-nota" role="status">Cargando los destinos de los pases…</p>}
      {capa === 'pases' && estadoPases.error && (
        <p className="ma-aviso" role="alert">
          No se pudieron leer los destinos de los pases: se muestran como puntos.{' '}
          {estadoPases.reintentar && <button type="button" className="ma-enlace" onClick={estadoPases.reintentar}>Reintentar</button>}
        </p>
      )}

      <div className="ma-cuerpo">
        <div className="ma-principal" data-media={media && !lista ? 'si' : undefined}>
          {lista ? (
            <ListaAcciones acciones={filtradas} nombreJugadora={nombreJugadora} etiquetaTipo={etiquetaTipo} onVideo={onVideo}
              partidos={partidos} variosPartidos={variosPartidos} />
          ) : (
            <>
              <div className="ma-direccion" aria-hidden="true">
                <span>{media ? 'Mitad de cancha' : 'Nuestro arco'}</span>
                <strong>Ataque →</strong>
              </div>
              <div className="ma-lienzo" data-media={media ? 'si' : undefined}>
                <svg viewBox={`${vista.x} ${vista.y} ${vista.ancho} ${vista.alto}`} className="ma-svg" role="img"
                  aria-label={`Cancha con ${conPunto.length} acciones. Atacamos hacia la derecha.`}
                  onClick={() => setSeleccionId(null)}>
                  <defs>
                    <marker id={`${prefijo}-bien`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse">
                      <path d="M0 0 L10 5 L0 10 z" className="ma-punta" data-calidad="bien" />
                    </marker>
                    <marker id={`${prefijo}-mal`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse">
                      <path d="M0 0 L10 5 L0 10 z" className="ma-punta" data-calidad="mal" />
                    </marker>
                    <filter id={`${prefijo}-suave`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.8" /></filter>
                    <clipPath id={`${prefijo}-cancha`}><rect x="0" y="0" width="100" height="64" /></clipPath>
                  </defs>
                  <Cancha />
                  {modo === 'calor' && densidad && (
                    <g clipPath={`url(#${prefijo}-cancha)`}>
                      <g filter={`url(#${prefijo}-suave)`}>
                        {densidad.celdas.map((c) => (
                          <rect key={`${c.c}-${c.f}`} x={c.c * 4} y={c.f * 4} width="4" height="4" className="ma-calor" style={{ fillOpacity: Math.pow(c.v, 1.6) * 0.9 }} />
                        ))}
                      </g>
                    </g>
                  )}
                  {modo === 'calor' && <LineasCancha />}
                  {modo === 'zonas' && <Tercios tercios={tercios} conBien={capa !== 'perdidas'} />}
                  {modo === 'puntos' && conPunto.map((a) => (
                    flechas && a.destino
                      ? <Flecha key={a.id} accion={a} prefijo={prefijo} elegida={a.id === seleccionId} elegir={setSeleccionId} />
                      : <Marca key={a.id} accion={a} elegida={a.id === seleccionId} elegir={setSeleccionId} />
                  ))}
                </svg>
                {seleccion && modo === 'puntos' && (
                  <Ficha accion={seleccion} pos={fichaPos} nombreJugadora={nombreJugadora} etiquetaTipo={etiquetaTipo}
                    onVideo={onVideo} onDestinoPase={onDestinoPase} cerrar={() => setSeleccionId(null)}
                    rival={variosPartidos ? partidos?.get?.(seleccion.evento.partido_id)?.rival : null} />
                )}
                {filtradas.length === 0 && (
                  <div className="ma-vacio">
                    <p>{eventos.length ? 'No hay acciones con estos filtros.' : 'Todavía no hay acciones etiquetadas.'}</p>
                    {eventos.length > 0 && <button type="button" className="ma-boton-texto" onClick={verTodas}>Ver todas las acciones</button>}
                  </div>
                )}
              </div>
              <Leyenda capa={capa} modo={modo} />
            </>
          )}
        </div>
        <Resumen resumen={resumen} compacto={compacto} />
      </div>
    </div>
  )
}

function Segmento({ etiqueta, opciones, valor, cambiar }) {
  return (
    <div className="ma-control">
      <span className="ma-control-etiqueta">{etiqueta}</span>
      <div className="ma-segmento" role="group" aria-label={etiqueta}>
        {opciones.map(([v, texto]) => (
          <button key={v} type="button" aria-pressed={valor === v} onClick={() => cambiar(v)}>{texto}</button>
        ))}
      </div>
    </div>
  )
}

// Cancha de 105 x 68 m llevada a 100 x 64.
function Cancha() {
  return (
    <g aria-hidden="true">
      <rect x="0" y="0" width="100" height="64" className="ma-cesped" />
      {Array.from({ length: 10 }, (_, i) => i % 2 === 1 && <rect key={i} x={i * 10} y="0" width="10" height="64" className="ma-franja" />)}
      <LineasCancha />
      <circle cx="50" cy="32" r="0.45" className="ma-punto-linea" />
      <circle cx="10.5" cy="32" r="0.35" className="ma-punto-linea" />
      <circle cx="89.5" cy="32" r="0.35" className="ma-punto-linea" />
    </g>
  )
}

function LineasCancha() {
  return (
      <g className="ma-lineas" aria-hidden="true">
        <rect x="0" y="0" width="100" height="64" />
        <line x1="50" y1="0" x2="50" y2="64" />
        <circle cx="50" cy="32" r="8.7" />
        <rect x="0" y="13" width="15.7" height="38" />
        <rect x="84.3" y="13" width="15.7" height="38" />
        <rect x="0" y="23.4" width="5.2" height="17.2" />
        <rect x="94.8" y="23.4" width="5.2" height="17.2" />
        <path d="M15.7 25.03 A8.7 8.7 0 0 1 15.7 38.97 M84.3 25.03 A8.7 8.7 0 0 0 84.3 38.97" />
        <rect x="-1.6" y="28.55" width="1.6" height="6.9" />
        <rect x="100" y="28.55" width="1.6" height="6.9" className="ma-arco-rival" />
      </g>
  )
}

function Tercios({ tercios, conBien }) {
  const max = Math.max(1, ...tercios.map((t) => t.pct))
  return (
    <g>
      {tercios.map((t, i) => (
        <g key={t.tercio}>
          <rect x={(i * 100) / 3} y="0" width={100 / 3} height="64" className="ma-tercio" style={{ fillOpacity: t.total ? 0.05 + Math.pow(t.pct / max, 2) * 0.4 : 0 }} />
          <text x={(i * 100) / 3 + 100 / 6} y="30" className="ma-tercio-pct">{t.pct}%</text>
          <text x={(i * 100) / 3 + 100 / 6} y="36.5" className="ma-tercio-detalle">{t.total} {t.total === 1 ? 'acción' : 'acciones'}</text>
          {conBien && t.pctBien !== null && <text x={(i * 100) / 3 + 100 / 6} y="40.5" className="ma-tercio-detalle">{t.pctBien}% bien</text>}
          <text x={(i * 100) / 3 + 100 / 6} y="60" className="ma-tercio-nombre">{NOMBRE_TERCIO[t.tercio]}</text>
        </g>
      ))}
      <g className="ma-lineas-zona" aria-hidden="true">
        <line x1="33.333" y1="0" x2="33.333" y2="64" />
        <line x1="66.667" y1="0" x2="66.667" y2="64" />
      </g>
    </g>
  )
}

function Marca({ accion, elegida, elegir }) {
  const cx = accion.punto.x, cy = Y(accion.punto.y)
  const tocar = (e) => { e.stopPropagation(); elegir(accion.id) }
  return (
    <g className="ma-marca" onClick={tocar} data-elegida={elegida ? 'si' : undefined}>
      {accion.remate
        ? <circle cx={cx} cy={cy} r={accion.remate === 'gol' ? 1.25 : 1} className="ma-remate" data-clase={accion.remate} />
        : <circle cx={cx} cy={cy} r="0.85" className="ma-punto" data-calidad={accion.calidad} />}
      {elegida && <circle cx={cx} cy={cy} r="1.9" className="ma-anillo" />}
      <circle cx={cx} cy={cy} r="2.6" className="ma-toque" />
    </g>
  )
}

function Flecha({ accion, prefijo, elegida, elegir }) {
  const { punto: o, destino: d } = accion
  const bien = accion.calidad === 'bien'
  const tocar = (e) => { e.stopPropagation(); elegir(accion.id) }
  const linea = { x1: o.x, y1: Y(o.y), x2: d.x, y2: Y(d.y) }
  return (
    <g className="ma-marca" onClick={tocar} data-elegida={elegida ? 'si' : undefined}>
      <line {...linea} className="ma-flecha" data-calidad={bien ? 'bien' : 'mal'} markerEnd={`url(#${prefijo}-${bien ? 'bien' : 'mal'})`} />
      <circle cx={o.x} cy={Y(o.y)} r="0.5" className="ma-origen" data-calidad={bien ? 'bien' : 'mal'} />
      {elegida && <circle cx={o.x} cy={Y(o.y)} r="1.8" className="ma-anillo" />}
      <line {...linea} className="ma-toque-linea" />
    </g>
  )
}

function Ficha({ accion, pos, nombreJugadora, etiquetaTipo, onVideo, onDestinoPase, cerrar, rival }) {
  const { evento } = accion
  const estado = accion.remate || accion.calidad
  const esPase = ['Pase correcto', 'Pase incorrecto'].includes(evento.tipo)
  const lado = pos.izquierda > 50 ? 'izquierda' : 'derecha'
  const arriba = Math.min(78, Math.max(22, pos.arriba))
  return (
    <div className="ma-ficha" data-lado={lado} role="dialog" aria-label={`Acción: ${etiquetaTipo(evento.tipo)}`}
      style={{ '--ma-x': `${pos.izquierda}%`, '--ma-y': `${arriba}%` }} onClick={(e) => e.stopPropagation()}>
      <div className="ma-ficha-cabecera">
        <strong>{etiquetaTipo(evento.tipo)}</strong>
        <button type="button" className="ma-cerrar" aria-label="Cerrar" onClick={cerrar}>×</button>
      </div>
      <dl className="ma-ficha-datos">
        <div><dt>Jugadora</dt><dd>{nombreJugadora(evento.jugador_id) || 'Sin jugadora'}</dd></div>
        <div><dt>Minuto</dt><dd>{accion.minuto}{rival ? ` (vs ${rival})` : ''}</dd></div>
        <div><dt>Resultado</dt><dd><span className="ma-estado" data-estado={estado}>{ESTADO[estado]}</span>{evento.resultado && !['Exitoso', 'Fallido'].includes(evento.resultado) && evento.resultado !== ESTADO[estado] ? ` (${evento.resultado})` : ''}</dd></div>
        {esPase && !accion.destino && <div><dt>Destino</dt><dd>Sin cargar</dd></div>}
      </dl>
      <div className="ma-ficha-acciones">
        {onVideo && <button type="button" className="ma-primario" onClick={() => onVideo(evento)}>Ver en el video</button>}
        {esPase && onDestinoPase && <button type="button" className="ma-boton-texto" onClick={() => onDestinoPase(evento)}>Destino del pase</button>}
      </div>
    </div>
  )
}

function Leyenda({ capa, modo }) {
  if (modo === 'zonas') return <p className="ma-nota">Porcentaje de las acciones que pasó en cada tercio de la cancha.</p>
  if (modo === 'calor') {
    return (
      <div className="ma-leyenda" aria-label="Leyenda">
        <span>Menos</span><span className="ma-escala" aria-hidden="true" /><span>Más acciones</span>
      </div>
    )
  }
  const items = capa === 'remates'
    ? [['gol', 'Gol'], ['arco', 'Al arco'], ['afuera', 'Afuera o bloqueado']]
    : capa === 'pases'
      ? [['flecha-bien', 'Llegó'], ['flecha-mal', 'No llegó'], ['bien', 'Sin destino (punto)']]
      : capa === 'perdidas' ? [['mal', 'Pérdida']]
        : [['bien', 'Salió bien'], ['mal', 'Salió mal'], ['neutro', 'Sin resultado']]
  return (
    <ul className="ma-leyenda" aria-label="Leyenda">
      {items.map(([clave, texto]) => <li key={clave}><Muestra clave={clave} />{texto}</li>)}
      {capa === 'todas' && <li><Muestra clave="gol" />Gol</li>}
    </ul>
  )
}

function Muestra({ clave }) {
  return (
    <svg viewBox="0 0 12 12" className="ma-muestra" aria-hidden="true">
      {clave.startsWith('flecha')
        ? <line x1="1" y1="6" x2="11" y2="6" className="ma-flecha" data-calidad={clave === 'flecha-bien' ? 'bien' : 'mal'} style={{ strokeWidth: 1.4 }} />
        : ['gol', 'arco', 'afuera'].includes(clave)
          ? <circle cx="6" cy="6" r="4" className="ma-remate" data-clase={clave} style={{ strokeWidth: 1.4 }} />
          : <circle cx="6" cy="6" r="4" className="ma-punto" data-calidad={clave} style={{ strokeWidth: 1.2 }} />}
    </svg>
  )
}

function Resumen({ resumen, compacto }) {
  const max = Math.max(1, ...resumen.top.map((t) => t.total))
  return (
    <aside className="ma-resumen" aria-label="Resumen de la capa">
      <p className="ma-resumen-titulo">
        <strong>{resumen.titulo}: {resumen.total}</strong>
        {resumen.destacado && <span> · {resumen.destacado}</span>}
      </p>
      {resumen.extras.length > 0 && (
        <dl className="ma-resumen-extras">
          {resumen.extras.map((x) => (
            <div key={x.etiqueta}><dt>{x.etiqueta}</dt><dd><strong>{x.valor}</strong>{x.detalle ? ` · ${x.detalle}` : ''}</dd></div>
          ))}
        </dl>
      )}
      {resumen.top.length > 0 && (
        <div className="ma-top">
          <p className="ma-top-titulo">{resumen.tituloTop}</p>
          <ol>
            {resumen.top.slice(0, compacto ? 3 : 5).map((t) => (
              <li key={t.id}>
                <span className="ma-top-nombre">{t.nombre || 'Sin nombre'}</span>
                <span className="ma-top-barra" aria-hidden="true"><span style={{ width: `${(t.total / max) * 100}%` }} /></span>
                <span className="ma-top-total">{t.total}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {resumen.sinUbicacion > 0 && (
        <p className="ma-nota">{resumen.sinUbicacion} {resumen.sinUbicacion === 1 ? 'acción no tiene punto y no aparece' : 'acciones no tienen punto y no aparecen'} en la cancha (sí en la lista y en Zonas si tienen zona).</p>
      )}
    </aside>
  )
}

function ListaAcciones({ acciones, nombreJugadora, etiquetaTipo, onVideo, partidos, variosPartidos }) {
  const ordenadas = [...acciones].sort((a, b) =>
    String(a.evento.partido_id).localeCompare(String(b.evento.partido_id)) || a.periodo - b.periodo || Number(a.evento.segundo) - Number(b.evento.segundo))
  if (!ordenadas.length) return <p className="ma-vacio-lista">No hay acciones con estos filtros.</p>
  return (
    <div className="ma-lista">
      <table>
        <thead>
          <tr><th scope="col">Minuto</th><th scope="col">Jugadora</th><th scope="col">Acción</th><th scope="col">Resultado</th><th scope="col"><span className="sr-only">Video</span></th></tr>
        </thead>
        <tbody>
          {ordenadas.map((a) => {
            const estado = a.remate || a.calidad
            return (
              <tr key={a.id}>
                <td>{a.minuto}{variosPartidos && <small>{partidos?.get?.(a.evento.partido_id)?.rival || ''}</small>}</td>
                <td>{nombreJugadora(a.evento.jugador_id) || '—'}</td>
                <td>{etiquetaTipo(a.evento.tipo)}</td>
                <td><span className="ma-estado" data-estado={estado}>{ESTADO[estado]}</span></td>
                <td>{onVideo && <button type="button" className="ma-boton-texto" onClick={() => onVideo(a.evento)}>Video</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
