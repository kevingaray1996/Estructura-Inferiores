import { useEffect, useRef, useState } from 'react'
import { COLORES } from '../../theme'
import { fechaArgentina } from '../../utils/planificacion'
import { fechaCorta, fechaHora, fechaLarga } from '../../utils/formatoFecha'
import { iniciales } from '../../utils/inicioDatos'
import { cargarTableroHoy, textoPendientesWellness, DIAS_CUMPLEANOS } from '../../utils/hoyDatos'
import '../ui/panelDeportivo.css'
import './hoy.css'

// Los colores del tablero salen de theme.js; la hoja de estilos solo usa estas variables.
const COLORES_HOY = {
  '--hoy-rojo': COLORES.peligro,
  '--hoy-amarillo': COLORES.alerta,
  '--hoy-verde': COLORES.exito,
  '--hoy-neutro': COLORES.neutro,
  '--hoy-acento': COLORES.acento,
  '--hoy-sobre-acento': COLORES.textoSobreAcento,
  '--hoy-superficie': COLORES.fondoTarjeta,
  '--hoy-superficie-2': COLORES.fondoSecundario,
  '--hoy-borde': COLORES.borde,
  '--hoy-texto': COLORES.texto,
  '--hoy-texto-2': COLORES.textoSecundario,
  '--hoy-texto-3': COLORES.textoMuted,
}

function Foto({ jugadora }) {
  const [fallo, setFallo] = useState(false)
  return jugadora.foto_url && !fallo
    ? <img className="hoy-avatar" src={jugadora.foto_url} alt="" loading="lazy" onError={() => setFallo(true)} />
    : <span className="hoy-avatar" aria-hidden="true">{iniciales(jugadora.nombre, jugadora.apellido)}</span>
}

// Fila grande y tocable que abre el perfil de la jugadora.
function FilaJugadora({ jugadora, detalle, nivel, extra, onAbrir }) {
  const nombre = `${jugadora.apellido || ''}, ${jugadora.nombre || ''}`
  return <li>
    <button type="button" className="hoy-fila" data-nivel={nivel} onClick={() => onAbrir(jugadora.id)} aria-label={`Abrir perfil de ${nombre}`}>
      <Foto jugadora={jugadora} />
      <span className="hoy-fila-texto"><strong>{nombre}</strong>{detalle && <small>{detalle}</small>}</span>
      {extra && <b className="hoy-fila-extra">{extra}</b>}
      <span className="hoy-fila-flecha" aria-hidden="true">›</span>
    </button>
  </li>
}

function Tarjeta({ id, eyebrow, titulo, accion, children, destacada }) {
  return <section className="hoy-tarjeta" data-destacada={destacada || undefined} aria-labelledby={id}>
    <header className="hoy-tarjeta-cabecera">
      <div><p className="dp-eyebrow">{eyebrow}</p><h2 id={id}>{titulo}</h2></div>
      {accion}
    </header>
    {children}
  </section>
}

function Aviso({ bloque, cargando, restringido = 'No habilitado para tu categoría.' }) {
  if (!bloque) return <p className="hoy-vacio" role="status">{cargando}</p>
  if (bloque.estado === 'error') return <p className="hoy-error" role="alert">{bloque.error}</p>
  if (bloque.estado === 'restringido') return <p className="hoy-vacio">{restringido}</p>
  if (bloque.estado === 'sin_categoria') return <p className="hoy-vacio">Sin categoría Primera accesible.</p>
  return null
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Navegadores sin permiso de portapapeles: copia con un campo temporal.
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    let ok
    try { ok = document.execCommand('copy') } catch { ok = false }
    campo.remove()
    return ok
  }
}

function TarjetaWellness({ bloque, onAbrir }) {
  const [copiado, setCopiado] = useState('')
  const temporizador = useRef(null)
  useEffect(() => () => clearTimeout(temporizador.current), [])
  const resumen = bloque?.estado === 'ok' ? bloque.resumen : null
  const pendientes = resumen?.pendientes || []

  async function copiar() {
    const ok = await copiarTexto(textoPendientesWellness(pendientes, bloque.fecha))
    setCopiado(ok ? 'Lista copiada. Pegala en WhatsApp.' : 'No se pudo copiar. Probá de nuevo.')
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setCopiado(''), 3000)
  }

  const completo = resumen && resumen.total > 0 && pendientes.length === 0
  return <Tarjeta id="hoy-wellness" eyebrow="Wellness · Primera" titulo="Wellness de hoy" destacada
    accion={pendientes.length > 0 && <button type="button" className="hoy-boton" onClick={copiar}>Copiar lista</button>}>
    <Aviso bloque={bloque} cargando="Consultando respuestas…" />
    {copiado && <p className="hoy-copiado" role="status">{copiado}</p>}
    {resumen && <>
      <div className="hoy-contador" data-completo={completo || undefined}>
        <p><strong>{resumen.respondieron}</strong><span> de {resumen.total} completaron</span></p>
        <span className="hoy-progreso" aria-hidden="true"><i style={{ width: resumen.total ? (resumen.respondieron / resumen.total * 100) + '%' : 0 }} /></span>
      </div>
      {resumen.total === 0 && <p className="hoy-vacio">Sin jugadoras accesibles.</p>}
      {completo && <p className="hoy-vacio">Completaron todas.</p>}
      {pendientes.length > 0 && <>
        <h3 className="hoy-subtitulo">Faltan completar · {pendientes.length}</h3>
        <ul className="hoy-lista">{pendientes.map(j => <FilaJugadora key={j.id} jugadora={j} nivel="pendiente" onAbrir={onAbrir} />)}</ul>
      </>}
      {resumen.alertas.length > 0 && <>
        <h3 className="hoy-subtitulo">Con alerta en su respuesta · {resumen.alertas.length}</h3>
        <ul className="hoy-lista">{resumen.alertas.map(({ jugadora, nivel, motivo }) => <FilaJugadora key={jugadora.id} jugadora={jugadora}
          nivel={nivel === 'alta' ? 'rojo' : 'amarillo'} detalle={motivo} onAbrir={onAbrir} />)}</ul>
      </>}
    </>}
  </Tarjeta>
}

function TarjetaSemaforo({ bloque, onAbrir }) {
  const lista = bloque?.estado === 'ok' ? bloque.enRiesgo : null
  return <Tarjeta id="hoy-semaforo" eyebrow={'Semáforo de riesgo · Primera' + (lista ? ` · ${lista.length}` : '')} titulo="Rojo y amarillo">
    <Aviso bloque={bloque} cargando="Calculando el semáforo…" />
    {lista && (lista.length === 0
      ? <p className="hoy-vacio">Todas en verde.</p>
      : <ul className="hoy-lista">{lista.map(({ jugadora, resultado, motivo }) => <FilaJugadora key={jugadora.id} jugadora={jugadora}
        nivel={resultado.semaforo} detalle={motivo || 'Varias señales moderadas'} extra={`${resultado.puntos}/6`} onAbrir={onAbrir} />)}</ul>)}
  </Tarjeta>
}

function TarjetaNoDisponibles({ bloque, onAbrir }) {
  const grupos = bloque?.estado === 'ok' ? bloque.noDisponibles : null
  const total = grupos?.reduce((n, g) => n + g.jugadoras.length, 0)
  return <Tarjeta id="hoy-no-disponibles" eyebrow={'Plantel' + (grupos ? ` · ${total}` : '')} titulo="No disponibles">
    <Aviso bloque={bloque} cargando="Consultando el plantel…" />
    {grupos && (grupos.length === 0
      ? <p className="hoy-vacio">Todas disponibles.</p>
      : grupos.map(g => <div key={g.estado} className="hoy-grupo">
        <h3 className="hoy-subtitulo">{g.titulo} · {g.jugadoras.length}</h3>
        <ul className="hoy-lista">{g.jugadoras.map(({ jugadora, motivo, alta }) => <FilaJugadora key={jugadora.id} jugadora={jugadora}
          nivel={g.estado === 'lesionado' ? 'rojo' : g.estado === 'suspendido' ? 'amarillo' : 'neutro'}
          detalle={motivo + (alta ? ` · alta estimada ${fechaCorta(alta)}` : '')} onAbrir={onAbrir} />)}</ul>
      </div>))}
  </Tarjeta>
}

function TarjetaPartido({ bloque, onAbrir }) {
  const partido = bloque?.estado === 'ok' ? bloque.partido : null
  return <Tarjeta id="hoy-partido" eyebrow="Agenda" titulo="Próximo partido">
    <Aviso bloque={bloque} cargando="Consultando partidos…" />
    {bloque?.estado === 'ok' && !partido && <p className="hoy-vacio">Sin partidos programados.</p>}
    {partido && <button type="button" className="hoy-partido" onClick={onAbrir} aria-label={`Ver partidos. Próximo: vs ${partido.rival}`}>
      <span className="hoy-partido-rival">
        {partido.escudo_url && <img src={partido.escudo_url} alt="" />}
        <strong>vs {partido.rival || 'Rival a confirmar'}</strong>
      </span>
      <span className="hoy-partido-dato"><small>Fecha y hora</small><b>{partido.fecha === fechaArgentina() ? 'Hoy' + (partido.hora ? ' · ' + partido.hora.slice(0, 5) : '') : fechaHora(partido.fecha, partido.hora)}</b></span>
      <span className="hoy-partido-dato"><small>Lugar</small><b>{[partido.local_visitante === 'visitante' ? 'Visitante' : partido.local_visitante === 'local' ? 'Local' : partido.local_visitante, partido.lugar].filter(Boolean).join(' · ') || 'A confirmar'}</b></span>
      {partido.categoriasNombres?.length > 0 && <small className="hoy-partido-categorias">{partido.categoriasNombres.join(', ')}</small>}
    </button>}
  </Tarjeta>
}

function TarjetaCumpleanos({ bloque, onAbrir }) {
  const lista = bloque?.estado === 'ok' ? bloque.cumpleanos : null
  return <Tarjeta id="hoy-cumpleanos" eyebrow={`Próximos ${DIAS_CUMPLEANOS} días`} titulo="Cumpleaños">
    <Aviso bloque={bloque} cargando="Consultando el plantel…" />
    {lista && (lista.length === 0
      ? <p className="hoy-vacio">Ninguno en los próximos días.</p>
      : <ul className="hoy-lista">{lista.map(({ jugadora, diasFaltan }) => <FilaJugadora key={jugadora.id} jugadora={jugadora}
        nivel={diasFaltan === 0 ? 'festejo' : undefined} detalle={fechaCorta(jugadora.fecha_nacimiento)}
        extra={diasFaltan === 0 ? '¡Hoy!' : diasFaltan === 1 ? 'Mañana' : `En ${diasFaltan} días`} onAbrir={onAbrir} />)}</ul>)}
  </Tarjeta>
}

export default function HoySection({ perfil, onAbrirJugadora, onCambiarSeccion }) {
  const { id, rol, categoria_id } = perfil
  const [intento, setIntento] = useState(0)
  const clave = [id, rol, categoria_id, intento].join(':')
  const [datos, setDatos] = useState({ clave: null })
  const [terminado, setTerminado] = useState(null)

  useEffect(() => {
    let activo = true
    cargarTableroHoy({ id, rol, categoria_id }, parcial => {
      if (activo) setDatos(previo => previo.clave === clave ? { ...previo, ...parcial } : { clave, ...parcial })
    }).finally(() => { if (activo) setTerminado(clave) })
    return () => { activo = false }
  }, [clave, id, rol, categoria_id])

  const vigente = datos.clave === clave ? datos : {}
  const cargando = terminado !== clave

  return <div className="hoy" style={COLORES_HOY}>
    <header className="hoy-cabecera">
      <div>
        <p className="dp-eyebrow">{fechaLarga(fechaArgentina())}{vigente.categoria ? <> · <b>{vigente.categoria.nombre}</b></> : null}</p>
        <h1 className="dp-titulo">Hoy</h1>
      </div>
      <button type="button" className="hoy-boton" onClick={() => setIntento(n => n + 1)} disabled={cargando}>
        {cargando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </header>

    <div className="hoy-grilla">
      <TarjetaWellness bloque={vigente.wellness} onAbrir={onAbrirJugadora} />
      <TarjetaSemaforo bloque={vigente.semaforo} onAbrir={onAbrirJugadora} />
      <TarjetaNoDisponibles bloque={vigente.plantel} onAbrir={onAbrirJugadora} />
      <TarjetaPartido bloque={vigente.partido} onAbrir={() => onCambiarSeccion('partidos')} />
      <TarjetaCumpleanos bloque={vigente.plantel} onAbrir={onAbrirJugadora} />
    </div>
  </div>
}
