import { useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { leerComet } from '../../utils/analisis/comet'
import { cometParaGuardar, nombreLegible, nombresPropios, operacionesElegidas, revisarComet, sugerirJugadora } from '../../utils/analisis/cometRevision'
import { informeParaGuardar, normalizarInforme } from '../../utils/analisis/informePartido'
import { formatearTiempo, nombreJugadora } from '../../utils/analisis/formato'
import { mensajeErrorOPropio } from '../../utils/mensajesError'
import './comet.css'

const BUCKET = 'comet-pdf'
const LIMITE_BYTES = 2 * 1024 * 1024
const GRUPOS = [
  ['completar', 'Se va a completar'],
  ['distinto', 'No coincide'],
  ['coincide', 'Coincide'],
]

// Importar el «Informe del partido» de COMET (AFA): se elige el PDF, se asocian los nombres de COMET con nuestras
// jugadoras (la primera vez) y se revisa qué completar y qué no coincide. Nada se guarda hasta «Confirmar».
// leerTextos: para los tests (en la app, cometPdf.textosDeArchivo).
export default function ImportarComet({
  analisis, calendario, ev, citaciones, jugadoras, puedeEditar, videoListo, irA, onAnalisis, onCalendario, onAccionGol, avisar,
  leerTextos,
}) {
  const [paso, setPaso] = useState('inicio') // inicio | leyendo | nombres | revision | guardando
  const [error, setError] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [comet, setComet] = useState(null)
  const [asociados, setAsociados] = useState({}) // nombre normalizado → jugador_id ('' = sin asociar)
  const [pendientes, setPendientes] = useState([]) // [{ nombre, dorsal, sugerida }]
  const [elegidos, setElegidos] = useState(() => new Set())
  const [resultado, setResultado] = useState('')
  const entrada = useRef(null)

  const candidatas = useMemo(() => {
    const citadas = citaciones.filter((c) => c.jugadora).map((c) => ({ id: c.jugador_id, nombre: c.jugadora.nombre, apellido: c.jugadora.apellido, dorsal: c.dorsal, citada: true }))
    const ids = new Set(citadas.map((c) => c.id))
    const otras = (jugadoras || []).filter((j) => !ids.has(j.id)).map((j) => ({ id: j.id, nombre: j.nombre, apellido: j.apellido, dorsal: null, citada: false }))
    return [...citadas, ...otras]
  }, [citaciones, jugadoras])
  const nombreDe = (id) => {
    if (!id) return ''
    const c = candidatas.find((x) => x.id === id)
    return c ? nombreJugadora(c) : ''
  }

  const revision = useMemo(() => (comet && paso !== 'nombres' ? revisarComet({
    comet, eventos: ev.eventos, marcas: ev.marcas, idDe: (n) => asociados[n] || null,
    citaciones, calendario, informe: analisis.informe, anterior: analisis.comet, nombreDe,
  }) : null), [comet, paso, ev.eventos, ev.marcas, asociados, citaciones, calendario, analisis.informe, analisis.comet]) // eslint-disable-line react-hooks/exhaustive-deps

  function cancelar() {
    setPaso('inicio'); setComet(null); setArchivo(null); setPendientes([]); setAsociados({}); setError('')
    if (entrada.current) entrada.current.value = ''
  }

  async function elegirArchivo(e) {
    const elegido = e.target.files?.[0]
    if (!elegido) return
    setError(''); setResultado('')
    if (elegido.size > LIMITE_BYTES) { setError('El PDF pesa más de 2 MB. Bajalo de nuevo desde COMET (el informe pesa menos de 1 MB).'); return }
    setPaso('leyendo')
    try {
      const textos = await (leerTextos || (await import('../../utils/analisis/cometPdf')).textosDeArchivo)(elegido)
      const datos = leerComet(textos)
      const nombres = nombresPropios(datos)
      const { data, error: errorNombres } = await supabase.from('analisis_comet_nombres').select('nombre_comet, jugador_id')
        .in('nombre_comet', nombres.map((n) => n.nombre))
      if (errorNombres) throw errorNombres
      const guardados = Object.fromEntries((data || []).map((f) => [f.nombre_comet, f.jugador_id]))
      const faltan = nombres.filter((n) => !guardados[n.nombre])
        .map((n) => ({ ...n, sugerida: sugerirJugadora(n.nombre, n.dorsal, candidatas) || '' }))
      setArchivo(elegido); setComet(datos); setAsociados(guardados); setPendientes(faltan)
      if (faltan.length) {
        setAsociados({ ...guardados, ...Object.fromEntries(faltan.map((f) => [f.nombre, f.sugerida])) })
        setPaso('nombres')
      } else {
        empezarRevision()
      }
    } catch (e2) {
      setPaso('inicio')
      setError(/PDF|Password|Invalid/i.test(e2?.name || '') ? 'No se pudo abrir el archivo como PDF. Bajalo de nuevo desde COMET y probá otra vez.'
        : e2?.message && !e2.code ? e2.message : mensajeErrorOPropio(e2, 'leer el PDF de COMET'))
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  function empezarRevision() {
    setElegidos(new Set(['__iniciar__']))
    setPaso('revision')
  }

  // Los ítems «completar» arrancan tildados; los «distinto», en «Dejar el mío».
  const elegidosEfectivos = useMemo(() => {
    if (!revision) return new Set()
    if (!elegidos.has('__iniciar__')) return elegidos
    return new Set(revision.items.filter((i) => i.grupo === 'completar' && !i.bloqueado).map((i) => i.id))
  }, [revision, elegidos])
  const cambiar = (id, valor) => setElegidos(() => {
    const nuevo = new Set(elegidosEfectivos)
    if (valor) nuevo.add(id); else nuevo.delete(id)
    return nuevo
  })

  async function confirmarNombres() {
    const filas = pendientes.filter((p) => asociados[p.nombre]).map((p) => ({ nombre_comet: p.nombre, jugador_id: asociados[p.nombre] }))
    if (filas.length) {
      const { error: errorGuardar } = await supabase.from('analisis_comet_nombres').upsert(filas, { onConflict: 'nombre_comet' })
      if (errorGuardar) { setError(mensajeErrorOPropio(errorGuardar, 'guardar las jugadoras asociadas')); return }
    }
    setError('')
    empezarRevision()
  }

  async function confirmar() {
    const ops = operacionesElegidas(revision.items, elegidosEfectivos)
    setPaso('guardando'); setError('')
    const ruta = `${analisis.id}/comet.pdf`
    // 1) Respaldo del PDF. Si no se puede guardar, no se cambia nada.
    const { error: errorPdf } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: true, contentType: 'application/pdf' })
    if (errorPdf) { setPaso('revision'); setError(mensajeErrorOPropio(errorPdf, 'guardar el PDF de COMET')); return }
    const fallas = []
    let goles = 0
    // 2) Goles, tarjetas y cambios.
    for (const op of ops) {
      try {
        if (op.op === 'insertar_evento') {
          await ev.guardar(op.evento)
          // Gol nuestro: también la acción «Gol» de la jugadora, sin ubicación (queda pendiente en la Playlist).
          if (op.evento.tipo === 'gol' && op.evento.equipo === 'propio') {
            try { onAccionGol?.({ segundo: op.evento.segundo, jugador_id: op.evento.jugador_id }); goles++ }
            catch (e3) { fallas.push(`El gol quedó en el marcador, pero no se pudo crear su acción: ${mensajeErrorOPropio(e3, 'crear la acción de gol')}`) }
          }
        } else if (op.op === 'actualizar_evento') {
          const actual = ev.eventos.find((e) => e.id === op.id)
          if (actual) { await ev.guardar({ ...soloEditables(actual), ...op.cambios, id: op.id }) }
        } else if (op.op === 'borrar_evento') await ev.borrar(op.id)
      } catch (e2) {
        fallas.push(mensajeErrorOPropio(e2, 'guardar un evento del partido'))
      }
    }
    // 3) Datos de COMET y árbitra en el análisis.
    const camposInforme = Object.assign({}, ...ops.filter((o) => o.op === 'informe').map((o) => o.campos))
    const registro = { comet: cometParaGuardar(comet, ops, analisis.comet, archivo?.name), comet_pdf: ruta }
    if (Object.keys(camposInforme).length) registro.informe = informeParaGuardar({ ...normalizarInforme(analisis.informe), ...camposInforme })
    const { data: analisisNuevo, error: errorAnalisis } = await supabase.from('analisis_partidos').update(registro).eq('id', analisis.id).select().single()
    if (errorAnalisis) fallas.push(mensajeErrorOPropio(errorAnalisis, 'guardar los datos de COMET en el análisis'))
    else onAnalisis?.(analisisNuevo)
    // 4) Calendario.
    const camposCalendario = Object.assign({}, ...ops.filter((o) => o.op === 'calendario').map((o) => o.campos))
    if (calendario && Object.keys(camposCalendario).length) {
      const { data: calNuevo, error: errorCal } = await supabase.from('partidos').update(camposCalendario).eq('id', calendario.id).select().single()
      if (errorCal) fallas.push(mensajeErrorOPropio(errorCal, 'completar el partido en el calendario'))
      else onCalendario?.(calNuevo)
    }
    setPaso('inicio'); setComet(null); setArchivo(null)
    if (fallas.length) {
      setError(`Se guardó una parte, pero no todo: ${fallas.join(' ')} Volvé a importar el PDF para ver qué falta.`)
    } else {
      setResultado(`COMET importado: ${ops.filter((o) => o.op !== 'parte').length} cambios aplicados y el PDF guardado como respaldo.${goles ? ` ${goles === 1 ? 'El gol nuestro quedó' : `Los ${goles} goles nuestros quedaron`} en la Playlist para marcar desde dónde fue.` : ''}`)
      avisar?.('COMET importado')
    }
  }

  async function verPdf() {
    const { data, error: errorUrl } = await supabase.storage.from(BUCKET).createSignedUrl(analisis.comet_pdf, 120)
    if (errorUrl || !data?.signedUrl) { setError(mensajeErrorOPropio(errorUrl, 'abrir el PDF de COMET')); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const importado = analisis.comet
  const bloqueado = !puedeEditar || paso === 'leyendo' || paso === 'guardando'

  return (
    <section className="pa-seccion cm" aria-labelledby="cm-titulo">
      <div className="cm-cabecera">
        <h3 id="cm-titulo" className="pa-titulo">COMET (informe oficial)</h3>
        <div className="cm-botones">
          {analisis.comet_pdf && <button type="button" className="pa-enlace" onClick={verPdf}>Ver PDF</button>}
          {(paso === 'inicio' || paso === 'leyendo') && (
            <label className="pa-boton cm-elegir" data-principal="si" aria-disabled={bloqueado || undefined}>
              {paso === 'leyendo' ? 'Leyendo el PDF…' : 'Importar COMET'}
              <input ref={entrada} type="file" accept="application/pdf,.pdf" className="pa-sr" disabled={bloqueado} onChange={elegirArchivo} />
            </label>
          )}
        </div>
      </div>
      {paso === 'inicio' && importado && (
        <p className="pa-nota">
          Importado el {new Date(importado.importado).toLocaleDateString('es-AR')}: {importado.local?.nombre} {importado.local?.goles}-{importado.visitante?.goles} {importado.visitante?.nombre}
          {importado.arbitra ? ` · Árbitra: ${nombreLegible(importado.arbitra.nombre)}` : ''}.
        </p>
      )}
      {paso === 'inicio' && !importado && <p className="pa-nota">Elegí el PDF del informe del partido. Antes de guardar vas a ver qué se completa y qué no coincide.</p>}
      {error && <p className="pa-alerta" role="alert">{error}</p>}
      {resultado && paso === 'inicio' && <p className="pa-aviso" role="status">{resultado}</p>}

      {paso === 'nombres' && comet && (
        <div className="cm-paso">
          <p className="pa-nota">
            Primera vez con estas jugadoras: confirmá quién es quién. Queda guardado para los próximos partidos.
          </p>
          <ul className="cm-nombres">
            {pendientes.map((p) => (
              <li key={p.nombre}>
                <span className="cm-dorsal">{p.dorsal ?? '—'}</span>
                <label htmlFor={`cm-${p.nombre}`} className="cm-nombre-comet">{nombreLegible(p.nombre)}</label>
                <select id={`cm-${p.nombre}`} value={asociados[p.nombre] || ''} onChange={(e) => setAsociados((a) => ({ ...a, [p.nombre]: e.target.value }))}>
                  <option value="">Sin asociar</option>
                  <optgroup label="Convocadas">
                    {candidatas.filter((c) => c.citada).map((c) => <option key={c.id} value={c.id}>{c.dorsal ?? '—'} · {nombreJugadora(c)}</option>)}
                  </optgroup>
                  <optgroup label="Otras jugadoras">
                    {candidatas.filter((c) => !c.citada).map((c) => <option key={c.id} value={c.id}>{nombreJugadora(c)}</option>)}
                  </optgroup>
                </select>
              </li>
            ))}
          </ul>
          <div className="cm-acciones">
            <button type="button" className="pa-boton" data-principal="si" onClick={confirmarNombres}>Confirmar jugadoras</button>
            <button type="button" className="pa-boton" onClick={cancelar}>Cancelar</button>
          </div>
        </div>
      )}

      {(paso === 'revision' || paso === 'guardando') && revision && (
        <div className="cm-paso" aria-busy={paso === 'guardando' || undefined}>
          <p className="cm-resumen">
            {comet.local.nombre} {comet.local.goles}-{comet.visitante.goles} {comet.visitante.nombre} · {comet.fecha?.split('-').reverse().join('/')} · {comet.torneo}
          </p>
          {revision.avisos.length > 0 && (
            <ul className="cm-avisos" aria-label="Avisos">
              {revision.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          {GRUPOS.map(([grupo, titulo]) => {
            const lista = revision.items.filter((i) => i.grupo === grupo)
            if (!lista.length) return null
            const contenido = (
              <ul className="cm-lista">
                {lista.map((item) => (
                  <ItemRevision key={item.id} item={item} elegido={elegidosEfectivos.has(item.id)} onCambiar={(v) => cambiar(item.id, v)}
                    videoListo={videoListo} irA={irA} deshabilitado={paso === 'guardando'} />
                ))}
              </ul>
            )
            return grupo === 'coincide' ? (
              <details key={grupo} className="cm-grupo" data-grupo={grupo}>
                <summary>{titulo} ({lista.length})</summary>
                {contenido}
              </details>
            ) : (
              <section key={grupo} className="cm-grupo" data-grupo={grupo} aria-label={titulo}>
                <h4>{titulo} ({lista.length})</h4>
                {contenido}
              </section>
            )
          })}
          <div className="cm-acciones">
            <button type="button" className="pa-boton" data-principal="si" disabled={paso === 'guardando' || !puedeEditar} onClick={confirmar}>
              {paso === 'guardando' ? 'Guardando…' : 'Confirmar'}
            </button>
            <button type="button" className="pa-boton" disabled={paso === 'guardando'} onClick={cancelar}>Cancelar</button>
          </div>
          <p className="pa-nota">COMET no cambia nada hasta que confirmás. Lo destildado y lo que queda en «Dejar el mío» no se toca.</p>
        </div>
      )}
    </section>
  )
}

// Al editar un evento se mandan solo sus campos propios (no los de control, que pone la base).
function soloEditables(e) {
  const { tipo, segundo, jugadora_sale, jugadora_entra, jugador_id, equipo, tarjeta, observaciones } = e
  return { tipo, segundo, jugadora_sale, jugadora_entra, jugador_id, equipo, tarjeta, observaciones }
}

function BotonVideo({ segundo, texto, videoListo, irA }) {
  if (segundo == null) return null
  return (
    <button type="button" className="pa-enlace" disabled={!videoListo} onClick={() => irA(segundo)} title={`Ir al ${formatearTiempo(segundo)} del video`}>
      {texto}
    </button>
  )
}

function ItemRevision({ item, elegido, onCambiar, videoListo, irA, deshabilitado }) {
  const id = `cm-item-${item.id}`
  if (item.grupo === 'completar') {
    return (
      <li className="cm-item">
        <label className="cm-tilde" htmlFor={id}>
          <input id={id} type="checkbox" checked={elegido && !item.bloqueado} disabled={deshabilitado || Boolean(item.bloqueado)} onChange={(e) => onCambiar(e.target.checked)} />
          <span>{item.titulo}</span>
        </label>
        {item.bloqueado && <span className="cm-bloqueado">{item.bloqueado}</span>}
        <BotonVideo segundo={item.segundoComet ?? item.segundoMio} texto="Ver en el video" videoListo={videoListo} irA={irA} />
      </li>
    )
  }
  if (item.grupo === 'distinto') {
    return (
      <li className="cm-item" data-grupo="distinto">
        <p className="cm-item-titulo">{item.titulo}</p>
        <dl className="cm-comparacion">
          <div><dt>COMET</dt><dd>{item.comet}</dd></div>
          <div><dt>Lo mío</dt><dd>{item.mio || '—'}</dd></div>
        </dl>
        {item.bloqueado && <span className="cm-bloqueado">{item.bloqueado}</span>}
        <div className="cm-decision">
          <div className="az-segmento" role="group" aria-label={`Qué hacer: ${item.titulo}`}>
            <button type="button" aria-pressed={!elegido} disabled={deshabilitado} onClick={() => onCambiar(false)}>Dejar el mío</button>
            <button type="button" aria-pressed={elegido} disabled={deshabilitado || Boolean(item.bloqueado)} onClick={() => onCambiar(true)}>Usar COMET</button>
          </div>
          <BotonVideo segundo={item.segundoMio} texto="Ver el mío" videoListo={videoListo} irA={irA} />
          <BotonVideo segundo={item.segundoComet} texto="Ver COMET" videoListo={videoListo} irA={irA} />
        </div>
      </li>
    )
  }
  return <li className="cm-item" data-grupo="coincide"><span>{item.titulo}</span></li>
}

