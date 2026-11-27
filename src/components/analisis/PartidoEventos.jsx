import { useState } from 'react'
import { MARCAS, estabaEnCancha, faltanMarcas, filaMinutos, leerTiempo, problemasOrden } from '../../utils/analisis/eventosPartido'
import { leerTiempoPartido, textoTiempos, tiemposDe } from '../../utils/analisis/marcador'
import { formatearTiempo, nombreJugadora } from '../../utils/analisis/formato'
import './partido.css'
import './estadisticasVisuales.css'

// «2T 12' (video 58:40)» (o solo el tiempo del video si faltan marcas). Para avisos de texto.
function tiempoConMinuto(segundo, marcas) {
  return textoTiempos(segundo, marcas)
}

const etiquetaConvocada = (c) => `${c.dorsal ?? '—'} · ${nombreJugadora(c.jugadora)}`

// Pestaña Partido: marcas de tiempo, hacia dónde atacamos en el 1T, cambios, goles y tarjetas, y minutos sugeridos.
// ev: useEventosPartido. tomarSegundo(): segundo actual del video (o null si no está listo).
export default function PartidoEventos({
  ev, puedeEditar, videoListo, tomarSegundo, irA, citaciones, titulares, direccion1T, onDireccion1T, avisar, alFallar,
  minutos, avisoLado = null,
}) {
  const [ocupado, setOcupado] = useState(false)
  const faltan = faltanMarcas(ev.marcas)
  const desorden = problemasOrden(ev.marcas)
  const nombre = (id) => {
    const c = citaciones.find((x) => x.jugador_id === id)
    return c ? etiquetaConvocada(c) : 'Jugadora'
  }

  async function guardar(evento, aviso) {
    setOcupado(true)
    try { await ev.guardar(evento); if (aviso) avisar(aviso); return true } catch (e) { alFallar(e); return false } finally { setOcupado(false) }
  }
  async function borrar(evento, texto) {
    if (!window.confirm(`¿Borrar ${texto}?`)) return
    setOcupado(true)
    try { await ev.borrar(evento.id) } catch (e) { alFallar(e) } finally { setOcupado(false) }
  }

  const bloqueado = !puedeEditar || ocupado

  return (
    <div className="pa">
      <section className="pa-seccion" aria-labelledby="pa-marcas-titulo">
        <h3 id="pa-marcas-titulo" className="pa-titulo">Marcas de tiempo</h3>
        {avisoLado}
        {ev.error && <p role="alert" className="pa-alerta">{ev.error}</p>}
        {!ev.error && faltan.length > 0 && (
          <p className="pa-aviso" role="status">
            Faltan: {faltan.join(', ')}. Con las cuatro marcas, cada acción muestra su minuto real y se calculan los minutos jugados.
          </p>
        )}
        {desorden.map((texto) => <p key={texto} className="pa-alerta" role="alert">{texto}</p>)}
        <ul className="pa-marcas">
          {MARCAS.map((m) => {
            const evento = ev.eventos.find((e) => e.tipo === m.tipo)
            return (
              <FilaMarca
                key={m.tipo}
                nombre={m.nombre}
                segundo={evento ? Number(evento.segundo) : null}
                bloqueado={bloqueado || ev.cargando || Boolean(ev.error)}
                videoListo={videoListo}
                onIr={() => irA(Number(evento.segundo))}
                onMarcarAhora={() => {
                  const s = tomarSegundo()
                  if (s != null) guardar({ id: evento?.id, tipo: m.tipo, segundo: s }, `${m.nombre}: ${formatearTiempo(s)}`)
                }}
                onGuardarTexto={(s) => guardar({ id: evento?.id, tipo: m.tipo, segundo: s }, `${m.nombre}: ${formatearTiempo(s)}`)}
                onBorrar={() => borrar(evento, `la marca «${m.nombre}»`)}
              />
            )
          })}
        </ul>
      </section>

      <section className="pa-seccion" aria-labelledby="pa-direccion-titulo">
        <h3 id="pa-direccion-titulo" className="pa-titulo">Hacia dónde atacamos en el 1T</h3>
        <div className="az-segmento pa-direccion" role="group" aria-labelledby="pa-direccion-titulo">
          <button type="button" aria-pressed={direccion1T === 'izquierda'} disabled={!puedeEditar} onClick={() => onDireccion1T('izquierda')}>← Izquierda</button>
          <button type="button" aria-pressed={direccion1T === 'derecha'} disabled={!puedeEditar} onClick={() => onDireccion1T('derecha')}>Derecha →</button>
        </div>
        <p className="pa-nota">En el 2T se toma el sentido contrario. Cambiarlo no modifica las acciones ya cargadas. Elegir un lado lo deja confirmado.</p>
      </section>

      <Cambios ev={ev} citaciones={citaciones} titulares={titulares} nombre={nombre} bloqueado={bloqueado || Boolean(ev.error)}
        videoListo={videoListo} tomarSegundo={tomarSegundo} irA={irA} guardar={guardar} borrar={borrar} avisar={avisar} />

      <GolesTarjetas ev={ev} citaciones={citaciones} nombre={nombre} bloqueado={bloqueado || Boolean(ev.error)}
        videoListo={videoListo} tomarSegundo={tomarSegundo} irA={irA} guardar={guardar} borrar={borrar} />

      <MinutosSugeridos {...minutos} citaciones={citaciones} titulares={titulares} puedeEditar={puedeEditar} />
    </div>
  )
}

function FilaMarca({ nombre, segundo, bloqueado, videoListo, onIr, onMarcarAhora, onGuardarTexto, onBorrar }) {
  const [texto, setTexto] = useState(null)
  const [error, setError] = useState('')
  const valor = texto ?? (segundo == null ? '' : formatearTiempo(segundo))
  const id = `pa-marca-${nombre.replace(/\W+/g, '-')}`

  function confirmarTexto() {
    if (texto === null) return
    const s = leerTiempo(texto)
    if (texto.trim() === '' && segundo == null) { setTexto(null); return }
    if (s == null) { setError('Escribilo como minutos:segundos, por ejemplo 12:34.'); return }
    setError('')
    setTexto(null)
    if (s !== segundo) onGuardarTexto(s)
  }

  return (
    <li className="pa-marca" data-cargada={segundo != null ? 'si' : undefined}>
      <span className="pa-marca-nombre">{nombre}</span>
      <label className="pa-marca-campo" htmlFor={id}>
        <span className="pa-sr">Tiempo del video de «{nombre}» (mm:ss)</span>
        <input id={id} inputMode="numeric" placeholder="mm:ss" value={valor} disabled={bloqueado} aria-invalid={error ? 'true' : undefined}
          onChange={(e) => { setTexto(e.target.value); setError('') }} onBlur={confirmarTexto}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarTexto() } }} />
      </label>
      <button type="button" className="pa-boton" data-principal="si" disabled={bloqueado || !videoListo} onClick={onMarcarAhora}>Marcar ahora</button>
      <span className="pa-marca-extra">
        {segundo != null && <button type="button" className="pa-enlace" disabled={!videoListo} onClick={onIr}>Ir</button>}
        {segundo != null && <button type="button" className="pa-enlace" data-peligro="si" disabled={bloqueado} onClick={onBorrar}>Borrar</button>}
      </span>
      {error && <span className="pa-error" role="alert">{error}</span>}
    </li>
  )
}

// Un momento del partido en las listas: el minuto del partido grande y, chiquito, el tiempo del video.
export function TiempoDoble({ segundo, marcas }) {
  const t = tiemposDe(segundo, marcas)
  if (!t.partido) return <span className="pa-doble">{t.video}</span>
  return <span className="pa-doble">{t.partido}<small>{t.video}</small></span>
}

// Campo de tiempo con «Tomar del video». Acepta el minuto del partido («67'», «2T 22'», «45+2'») o el tiempo del
// video (mm:ss) y muestra a qué momento corresponde.
function CampoTiempo({ id, valor, onCambiar, videoListo, tomarSegundo, bloqueado, marcas }) {
  const leido = valor.trim() ? leerTiempoPartido(valor, marcas) : null
  return (
    <div className="pa-campo">
      <label htmlFor={id}>Minuto del partido o tiempo del video</label>
      <div className="pa-tiempo">
        <input id={id} placeholder="67' · 2T 22' · mm:ss" value={valor} disabled={bloqueado} autoComplete="off"
          aria-describedby={`${id}-ayuda`} onChange={(e) => onCambiar(e.target.value)} />
        <button type="button" className="pa-boton" disabled={bloqueado || !videoListo}
          onClick={() => { const s = tomarSegundo(); if (s != null) onCambiar(formatearTiempo(s)) }}>
          Tomar del video
        </button>
      </div>
      <small id={`${id}-ayuda`} className="pa-nota" aria-live="polite">
        {!leido ? "Escribí el minuto del partido (67', 2T 22' o 45+2') o el tiempo del video (mm:ss)."
          : leido.error ? leido.error : `= ${textoTiempos(leido.segundo, marcas)}`}
      </small>
    </div>
  )
}

function Cambios({ ev, citaciones, titulares, nombre, bloqueado, videoListo, tomarSegundo, irA, guardar, borrar, avisar }) {
  const [sale, setSale] = useState('')
  const [entra, setEntra] = useState('')
  const [tiempo, setTiempo] = useState('')
  const [error, setError] = useState('')

  async function agregar() {
    const leido = leerTiempoPartido(tiempo, ev.marcas)
    const s = leido.error ? null : leido.segundo
    if (!sale || !entra) { setError('Elegí quién sale y quién entra.'); return }
    if (sale === entra) { setError('Sale y entra tienen que ser jugadoras distintas.'); return }
    if (s == null) { setError(tiempo.trim() ? leido.error : "Marcá el momento: Tomar del video, el minuto del partido (67') o mm:ss."); return }
    setError('')
    if (estabaEnCancha(sale, s, titulares, ev.cambios) === false) avisar(`Ojo: ${nombre(sale)} no estaba en cancha en ese momento.`)
    if (await guardar({ tipo: 'cambio', segundo: s, jugadora_sale: sale, jugadora_entra: entra }, `Cambio guardado: ${tiempoConMinuto(s, ev.marcas)}`)) {
      setSale(''); setEntra(''); setTiempo('')
    }
  }

  return (
    <section className="pa-seccion" aria-labelledby="pa-cambios-titulo">
      <h3 id="pa-cambios-titulo" className="pa-titulo">Cambios</h3>
      {!titulares.length && <p className="pa-aviso">No hay titulares en la formación: no se puede saber quién estaba en cancha. Cargalas en Convocados.</p>}
      {ev.cambios.length > 0 && (
        <ul className="pa-lista">
          {ev.cambios.map((c) => (
            <li key={c.id}>
              <button type="button" className="pa-cuando" disabled={!videoListo} onClick={() => irA(Number(c.segundo))}><TiempoDoble segundo={c.segundo} marcas={ev.marcas} /></button>
              <span className="pa-texto">Sale {nombre(c.jugadora_sale)} · Entra {nombre(c.jugadora_entra)}</span>
              <button type="button" className="pa-enlace" data-peligro="si" disabled={bloqueado} onClick={() => borrar(c, 'este cambio')}>Borrar</button>
            </li>
          ))}
        </ul>
      )}
      <div className="pa-formulario">
        <div className="pa-campo">
          <label htmlFor="pa-cambio-sale">Sale</label>
          <select id="pa-cambio-sale" value={sale} disabled={bloqueado} onChange={(e) => setSale(e.target.value)}>
            <option value="">Elegí</option>
            {citaciones.map((c) => <option key={c.jugador_id} value={c.jugador_id}>{etiquetaConvocada(c)}</option>)}
          </select>
        </div>
        <div className="pa-campo">
          <label htmlFor="pa-cambio-entra">Entra</label>
          <select id="pa-cambio-entra" value={entra} disabled={bloqueado} onChange={(e) => setEntra(e.target.value)}>
            <option value="">Elegí</option>
            {citaciones.filter((c) => c.jugador_id !== sale).map((c) => <option key={c.jugador_id} value={c.jugador_id}>{etiquetaConvocada(c)}</option>)}
          </select>
        </div>
        <CampoTiempo id="pa-cambio-tiempo" valor={tiempo} onCambiar={setTiempo} videoListo={videoListo} tomarSegundo={tomarSegundo} bloqueado={bloqueado} marcas={ev.marcas} />
        <button type="button" className="pa-boton" data-principal="si" disabled={bloqueado} onClick={agregar}>Agregar cambio</button>
        {error && <p className="pa-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

function GolesTarjetas({ ev, citaciones, nombre, bloqueado, videoListo, tomarSegundo, irA, guardar, borrar }) {
  const [tipo, setTipo] = useState('gol')
  const [equipo, setEquipo] = useState('propio')
  const [jugadora, setJugadora] = useState('')
  const [tarjeta, setTarjeta] = useState('amarilla')
  const [tiempo, setTiempo] = useState('')
  const [error, setError] = useState('')
  const lista = ev.eventos.filter((e) => e.tipo === 'gol' || e.tipo === 'tarjeta')

  const describir = (e) => {
    const quien = e.equipo === 'rival' ? 'Rival' : e.jugador_id ? nombre(e.jugador_id) : 'Nuestro'
    return e.tipo === 'gol' ? `Gol · ${quien}` : `Tarjeta ${e.tarjeta} · ${quien}`
  }

  async function agregar() {
    const leido = leerTiempoPartido(tiempo, ev.marcas)
    const s = leido.error ? null : leido.segundo
    if (s == null) { setError(tiempo.trim() ? leido.error : "Marcá el momento: Tomar del video, el minuto del partido (67') o mm:ss."); return }
    setError('')
    const evento = {
      tipo, segundo: s, equipo,
      jugador_id: equipo === 'propio' && jugadora ? jugadora : null,
      tarjeta: tipo === 'tarjeta' ? tarjeta : null,
    }
    if (await guardar(evento, `${tipo === 'gol' ? 'Gol' : 'Tarjeta'} guardado: ${tiempoConMinuto(s, ev.marcas)}`)) { setJugadora(''); setTiempo('') }
  }

  return (
    <section className="pa-seccion" aria-labelledby="pa-goles-titulo">
      <h3 id="pa-goles-titulo" className="pa-titulo">Goles y tarjetas <span className="pa-opcional">(opcional)</span></h3>
      {lista.length > 0 && (
        <ul className="pa-lista">
          {lista.map((e) => (
            <li key={e.id}>
              <button type="button" className="pa-cuando" disabled={!videoListo} onClick={() => irA(Number(e.segundo))}><TiempoDoble segundo={e.segundo} marcas={ev.marcas} /></button>
              <span className="pa-texto">{describir(e)}</span>
              <button type="button" className="pa-enlace" data-peligro="si" disabled={bloqueado} onClick={() => borrar(e, e.tipo === 'gol' ? 'este gol' : 'esta tarjeta')}>Borrar</button>
            </li>
          ))}
        </ul>
      )}
      <div className="pa-formulario">
        <div className="az-segmento" role="group" aria-label="Qué pasó">
          <button type="button" aria-pressed={tipo === 'gol'} disabled={bloqueado} onClick={() => setTipo('gol')}>Gol</button>
          <button type="button" aria-pressed={tipo === 'tarjeta'} disabled={bloqueado} onClick={() => setTipo('tarjeta')}>Tarjeta</button>
        </div>
        <div className="az-segmento" role="group" aria-label="De quién">
          <button type="button" aria-pressed={equipo === 'propio'} disabled={bloqueado} onClick={() => setEquipo('propio')}>Nuestro</button>
          <button type="button" aria-pressed={equipo === 'rival'} disabled={bloqueado} onClick={() => setEquipo('rival')}>Rival</button>
        </div>
        {tipo === 'tarjeta' && (
          <div className="az-segmento" role="group" aria-label="Color de la tarjeta">
            <button type="button" aria-pressed={tarjeta === 'amarilla'} disabled={bloqueado} onClick={() => setTarjeta('amarilla')}>Amarilla</button>
            <button type="button" aria-pressed={tarjeta === 'roja'} disabled={bloqueado} onClick={() => setTarjeta('roja')}>Roja</button>
          </div>
        )}
        {equipo === 'propio' && (
          <div className="pa-campo">
            <label htmlFor="pa-gol-jugadora">Jugadora (opcional)</label>
            <select id="pa-gol-jugadora" value={jugadora} disabled={bloqueado} onChange={(e) => setJugadora(e.target.value)}>
              <option value="">Sin elegir</option>
              {citaciones.map((c) => <option key={c.jugador_id} value={c.jugador_id}>{etiquetaConvocada(c)}</option>)}
            </select>
          </div>
        )}
        <CampoTiempo id="pa-gol-tiempo" valor={tiempo} onCambiar={setTiempo} videoListo={videoListo} tomarSegundo={tomarSegundo} bloqueado={bloqueado} marcas={ev.marcas} />
        <button type="button" className="pa-boton" data-principal="si" disabled={bloqueado} onClick={agregar}>
          {tipo === 'gol' ? 'Agregar gol' : 'Agregar tarjeta'}
        </button>
        {error && <p className="pa-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

// Minutos sugeridos desde el video (solo partidos propios). Nunca se escriben solos: «Confirmar» (por jugadora) o
// «Confirmar todos» (con vista previa) son lo único que actualiza los minutos cargados en la planilla.
function MinutosSugeridos({ sugeridos, motivo, avisos = [], vinculado, planilla, onGuardar, citaciones, titulares, puedeEditar }) {
  const [guardando, setGuardando] = useState(null) // null | jugador_id | 'todos'
  const [vistaPrevia, setVistaPrevia] = useState(false)

  if (!vinculado) {
    return (
      <section className="pa-seccion" aria-labelledby="pa-minutos-titulo">
        <h3 id="pa-minutos-titulo" className="pa-titulo">Minutos jugados</h3>
        <p className="pa-nota">Este análisis no está vinculado a un partido del calendario: no hay planilla donde guardar los minutos.</p>
      </section>
    )
  }

  const nombreDe = (id) => {
    const c = citaciones.find((x) => x.jugador_id === id)
    return c ? nombreJugadora(c.jugadora) : 'Una jugadora'
  }
  const filas = sugeridos ? citaciones.map((c) => ({ c, ...filaMinutos(c.jugador_id, sugeridos, planilla.minutosPlanilla) })) : []
  const aConfirmar = filas.filter((f) => f.cambia)
  const lista = (fs) => fs.map((f) => ({ jugador_id: f.c.jugador_id, minutos: f.sugerido, titular: titulares.includes(f.c.jugador_id) }))

  async function confirmar(fs, quien) {
    setGuardando(quien)
    try { await onGuardar(lista(fs)) } finally { setGuardando(null); setVistaPrevia(false) }
  }

  return (
    <section className="pa-seccion" aria-labelledby="pa-minutos-titulo">
      <h3 id="pa-minutos-titulo" className="pa-titulo">Minutos jugados sugeridos</h3>
      {avisos.length > 0 && (
        <ul className="pa-avisos" role="status">
          {avisos.map((a, i) => <li key={i} className="pa-aviso">{a.jugadoraId ? `${nombreDe(a.jugadoraId)} ${a.texto}` : a.texto}</li>)}
        </ul>
      )}
      {!sugeridos ? (
        !avisos.length && <p className="pa-aviso">{motivo || 'Faltan datos para sugerir los minutos.'}</p>
      ) : (
        <>
          <p className="pa-nota">Salen de las marcas del video (con el tiempo agregado), los cambios y las expulsiones. Se guardan en la planilla solo cuando tocás «Confirmar».</p>
          {planilla.error && <p className="pa-alerta" role="alert">{planilla.error}</p>}
          <div className="pa-tabla-marco">
            <table className="pa-tabla">
              <thead>
                <tr><th scope="col">Jugadora</th><th scope="col">Sugeridos</th><th scope="col">Cargados</th><th scope="col">Diferencia</th><th scope="col"><span className="pa-sr">Confirmar</span></th></tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.c.jugador_id} data-cambia={f.cambia ? 'si' : undefined}>
                    <th scope="row">{etiquetaConvocada(f.c)}</th>
                    <td>{f.sugerido}'</td>
                    <td>{planilla.cargando ? '…' : f.cargado == null ? '—' : `${f.cargado}'`}</td>
                    <td>{f.diferencia == null ? '—' : f.diferencia === 0 ? '=' : `${f.diferencia > 0 ? '+' : ''}${f.diferencia}'`}</td>
                    <td>
                      {f.cambia && puedeEditar && (
                        <button type="button" className="pa-boton" disabled={Boolean(guardando) || planilla.cargando}
                          aria-label={`Confirmar ${f.sugerido} minutos de ${nombreJugadora(f.c.jugadora)}`}
                          onClick={() => confirmar([f], f.c.jugador_id)}>{guardando === f.c.jugador_id ? 'Guardando…' : 'Confirmar'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puedeEditar && aConfirmar.length > 0 && !vistaPrevia && (
            <button type="button" className="pa-boton" data-principal="si" disabled={Boolean(guardando) || planilla.cargando} onClick={() => setVistaPrevia(true)}>
              Confirmar todos ({aConfirmar.length})
            </button>
          )}
          {vistaPrevia && (
            <div className="pa-vista-previa" role="region" aria-label="Lo que va a cambiar en la planilla">
              <p className="pa-nota"><strong>Va a cambiar en la planilla:</strong></p>
              <ul>
                {aConfirmar.map((f) => <li key={f.c.jugador_id}>{nombreJugadora(f.c.jugadora)}: {f.cargado == null ? 'sin cargar' : `${f.cargado}'`} → {f.sugerido}'</li>)}
              </ul>
              <div className="pa-botones">
                <button type="button" className="pa-boton" data-principal="si" disabled={Boolean(guardando)} onClick={() => confirmar(aConfirmar, 'todos')}>
                  {guardando === 'todos' ? 'Guardando…' : 'Confirmar estos cambios'}
                </button>
                <button type="button" className="pa-boton" disabled={Boolean(guardando)} onClick={() => setVistaPrevia(false)}>Cancelar</button>
              </div>
            </div>
          )}
          {!aConfirmar.length && !planilla.cargando && <p className="pa-nota">La planilla ya tiene estos minutos.</p>}
        </>
      )}
    </section>
  )
}
