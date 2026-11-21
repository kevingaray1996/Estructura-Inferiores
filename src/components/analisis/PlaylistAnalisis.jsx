import { useEffect, useRef } from 'react'
import { ESTADOS_DESTINATARIA } from '../../utils/destinatariasPases'
import { opcionesResultado, reglasDe } from '../../utils/analisis/catalogoAcciones'
import { aparienciaTipo } from '../../utils/analisis/botonera'
import { NOMBRE_FALTA, faltasDetalle } from '../../utils/analisis/playlist'
import { formatearTiempo, nombreJugadora } from '../../utils/analisis/formato'
import { zonaConOrigen } from '../../utils/orientacionAnalisis'
import CanchaMini from './CanchaMini'
import { mensajeError } from '../../utils/mensajesError'
import { minutoReal } from '../../utils/analisis/eventosPartido'
import './playlist.css'

const nombreConocida = (j) => (j ? nombreJugadora(j) : 'Jugadora guardada')

// Lista de acciones del partido para revisar y detallar. Toda la lógica está en usePlaylistAnalisis.
export default function PlaylistAnalisis({
  pl, total, partido, marcas, fueraDeCancha, faltanMarcas = [], onIrAPartido, catalogo, citaciones, jugadoras, detalles, cargandoDetalles, errorDetalles, onReintentarDetalles,
  puedeEditar, videoListo, onEditarTodo, onEliminar, onDescartar, antesDeLaLista,
}) {
  const { lista, progreso, filtros, cambiarFiltro, activoId } = pl
  const porcentaje = progreso.total ? Math.round((progreso.detalladas / progreso.total) * 100) : 0

  return (
    <div className="pl">
      <div className="pl-cabecera">
        <h2 className="az-titulo">Acciones registradas ({lista.length})</h2>
        <p className="pl-progreso"><strong>{progreso.detalladas} de {progreso.total}</strong> detalladas</p>
      </div>
      <div className="pl-barra" role="progressbar" aria-label="Acciones detalladas" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.detalladas}>
        <span style={{ width: `${porcentaje}%` }} />
      </div>

      {faltanMarcas.length > 0 && total > 0 && (
        <p className="pl-marcas" role="status">
          Faltan marcas de tiempo ({faltanMarcas.join(', ').toLowerCase()}): sin ellas no se ve el minuto real.{' '}
          <button type="button" className="pl-enlace" onClick={onIrAPartido}>Cargarlas en Partido</button>
        </p>
      )}

      <div className="pl-filtros">
        <label className="pl-campo">
          <span>Acción</span>
          <select value={filtros.tipo} onChange={(e) => cambiarFiltro('tipo', e.target.value)}>
            <option value="todos">Todas</option>
            {catalogo.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </label>
        <label className="pl-campo">
          <span>Jugadora</span>
          <select value={filtros.jugadora} onChange={(e) => cambiarFiltro('jugadora', e.target.value)}>
            <option value="todos">Todas</option>
            {jugadoras.map((j) => <option key={j.id} value={j.id}>{nombreJugadora(j)}</option>)}
          </select>
        </label>
      </div>

      <div className="pl-interruptores">
        <button type="button" className="pl-chip" aria-pressed={filtros.soloPendientes} onClick={() => cambiarFiltro('soloPendientes', !filtros.soloPendientes)}>
          Pendientes de detallar
        </button>
        <button type="button" className="pl-chip" aria-pressed={pl.avanceAuto} onClick={() => pl.setAvanceAuto(!pl.avanceAuto)}>
          Pasar sola a la siguiente
        </button>
        <button type="button" className="pl-chip" aria-pressed={pl.repetir} disabled={!videoListo} onClick={() => pl.setRepetir(!pl.repetir)}>
          Repetir clip
        </button>
      </div>
      <p className="pl-ayuda">
        Tocá una acción para verla desde 3 s antes. Con el teclado: ↑ ↓ para moverte y el número de la camiseta para elegir la jugadora.
        {pl.dorsalEscrito && <span className="pl-dorsal" role="status"> Dorsal: {pl.dorsalEscrito}…</span>}
      </p>

      {errorDetalles && (
        <p role="alert" className="pl-alerta">
          {errorDetalles} <button type="button" className="pl-enlace" onClick={onReintentarDetalles}>Reintentar</button>
        </p>
      )}

      {antesDeLaLista}

      {total === 0 ? (
        <p className="pl-vacio">Todavía no hay acciones en este partido. Marcalas desde la pestaña Etiquetado.</p>
      ) : lista.length === 0 ? (
        <div className="pl-vacio">
          <p>{filtros.soloPendientes ? 'No quedan acciones por detallar con estos filtros.' : 'No hay acciones con estos filtros.'}</p>
          <button type="button" className="pl-enlace" onClick={() => { cambiarFiltro('soloPendientes', false); cambiarFiltro('tipo', 'todos'); cambiarFiltro('jugadora', 'todos') }}>
            Ver todas las acciones
          </button>
        </div>
      ) : (
        <ol className="pl-lista">
          {lista.map((ev) => (
            <FilaPlaylist
              key={ev.id}
              ev={ev}
              activa={ev.id === activoId}
              pl={pl}
              catalogo={catalogo}
              citaciones={citaciones}
              jugadoras={jugadoras}
              partido={partido}
              detalle={detalles[ev.id]}
              marcas={marcas}
              fuera={Boolean(ev.jugador_id && fueraDeCancha?.(ev.jugador_id, ev.segundo))}
              cargandoDetalles={cargandoDetalles}
              puedeEditar={puedeEditar}
              onEditarTodo={onEditarTodo}
              onEliminar={onEliminar}
              onDescartar={onDescartar}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function FilaPlaylist({ ev, activa, pl, partido, marcas, fuera, catalogo, citaciones, jugadoras, detalle, cargandoDetalles, puedeEditar, onEditarTodo, onEliminar, onDescartar }) {
  const fila = useRef(null)
  // La acción elegida (con clic o con ↑ / ↓) queda a la vista dentro de la lista.
  useEffect(() => { if (activa) fila.current?.scrollIntoView?.({ block: 'nearest' }) }, [activa])

  const reglas = reglasDe(catalogo, ev.tipo)
  const apariencia = aparienciaTipo(catalogo, ev.tipo)
  const faltas = faltasDetalle(ev, detalle, catalogo, partido)
  const jugadora = jugadoras.find((j) => j.id === ev.jugador_id)
  // Zona guardada o calculada desde el punto (acciones viejas, con la dirección del partido).
  const { zona, calculada: zonaCalculada } = zonaConOrigen(ev, partido)
  const enCola = ev._cola
  const estadoGuardado = pl.guardando[ev.id]
  const textoCola = enCola === 'rechazada' ? 'No se pudo guardar'
    : enCola === 'error' ? 'Sin guardar · reintentando'
      : enCola ? 'Guardando…' : ''
  const opciones = reglas.resultado_implicito ? [] : opcionesResultado(catalogo, ev.tipo)
  const editable = activa && !enCola && puedeEditar
  const ocupada = estadoGuardado === 'guardando'
  const falta = (campo) => (faltas.includes(campo) ? 'si' : undefined)
  // Minuto real con las marcas («2T 12'»); si no, el tiempo guardado (1T / 2T).
  const minuto = minutoReal(ev.segundo, marcas)
  const minutoTexto = minuto ? (minuto.estado === 'juego' ? minuto.texto : minuto.texto.split(' ')[0]) : Number(ev.periodo) === 2 ? '2T' : '1T'

  // Receptora: valor del selector a partir del detalle guardado.
  const valorReceptora = !detalle ? 'pendiente'
    : detalle.destinataria_estado === 'identificada' ? detalle.destinataria_id : detalle.destinataria_estado
  const receptoraNombre = detalle?.destinataria_estado === 'identificada'
    ? nombreConocida(jugadoras.find((j) => j.id === detalle.destinataria_id))
    : detalle && detalle.destinataria_estado !== 'pendiente' ? ESTADOS_DESTINATARIA[detalle.destinataria_estado] : null
  const convocadasSinAutora = citaciones.filter((c) => c.jugador_id !== ev.jugador_id)
  const jugadoraFueraDeLista = ev.jugador_id && !citaciones.some((c) => c.jugador_id === ev.jugador_id)

  const resumen = [jugadora ? nombreJugadora(jugadora) : 'Sin jugadora', receptoraNombre && `→ ${receptoraNombre}`,
    zona && (zonaCalculada ? `${zona} (calculada)` : zona), ev.resultado]
    .filter(Boolean).join(' · ')

  return (
    <li ref={fila} className="pl-item">
      <article data-guardado={enCola || 'guardada'} data-activa={activa ? 'si' : undefined} className={`pl-fila${enCola ? ' et-fila-pendiente' : ''}`}>
        <button type="button" className="pl-fila-resumen" aria-current={activa ? 'true' : undefined} onClick={() => pl.elegir(ev.id)}
          title="Ver en el video desde 3 s antes">
          <span className="pl-tiempo">
            {formatearTiempo(ev.segundo)}
            <small>{minutoTexto}</small>
          </span>
          <span className="az-boton-icono pl-icono" style={{ '--az-color-accion': apariencia.color, color: apariencia.colorTexto }} aria-hidden="true">
            {apariencia.icono}
          </span>
          <span className="pl-texto">
            <span className="pl-tipo">{reglas.etiqueta}</span>
            <span className="pl-sub">{resumen}</span>
          </span>
          {fuera && <span className="pl-estado" data-estado="fuera" title="Según la formación y los cambios, no estaba en cancha en ese momento">Fuera de cancha</span>}
          {!enCola && (faltas.length
            ? <span className="pl-estado" data-estado="falta">Falta {faltas.map((f) => NOMBRE_FALTA[f].toLowerCase()).join(', ')}</span>
            : <span className="pl-estado" data-estado="ok">Detallada</span>)}
        </button>

        {enCola && (
          <div className="pl-cola">
            <span className="et-guardado" data-estado={enCola} title={enCola === 'rechazada' ? mensajeError(ev._error, 'guardar la acción') : undefined}>{textoCola}</span>
            {puedeEditar && enCola === 'rechazada' && <button type="button" className="pl-enlace" onClick={() => onDescartar(ev.id)}>Descartar</button>}
          </div>
        )}

        {editable && (
          <div className="pl-detalle" aria-busy={ocupada || undefined}>
            <label className="pl-campo" data-falta={falta('jugadora')}>
              <span>Jugadora</span>
              <select value={ev.jugador_id || ''} disabled={ocupada} onChange={(e) => pl.cambiarCampos(ev, { jugador_id: e.target.value || null })}>
                <option value="">Sin jugadora</option>
                {jugadoraFueraDeLista && <option value={ev.jugador_id}>{nombreConocida(jugadora)} (no convocada)</option>}
                {citaciones.map((c) => <option key={c.jugador_id} value={c.jugador_id}>{c.dorsal ?? '—'} · {nombreJugadora(c.jugadora)}</option>)}
              </select>
            </label>

            {reglas.es_pase && (
              <label className="pl-campo" data-falta={falta('receptora')}>
                <span>Receptora</span>
                <select value={valorReceptora} disabled={ocupada || cargandoDetalles}
                  onChange={(e) => pl.cambiarReceptora(ev, e.target.value)}>
                  <option value="pendiente">{cargandoDetalles ? 'Cargando…' : 'Sin elegir'}</option>
                  {convocadasSinAutora.map((c) => <option key={c.jugador_id} value={c.jugador_id}>{c.dorsal ?? '—'} · {nombreJugadora(c.jugadora)}</option>)}
                  {detalle?.destinataria_estado === 'identificada' && !convocadasSinAutora.some((c) => c.jugador_id === detalle.destinataria_id) && (
                    <option value={detalle.destinataria_id}>{receptoraNombre} (guardada)</option>
                  )}
                  <option value="desconocida">No se sabe quién</option>
                  <option value="no_observable">No se ve en el video</option>
                </select>
              </label>
            )}

            <CanchaMini
              evento={ev}
              partido={partido}
              deshabilitada={ocupada}
              falta={Boolean(falta('zona'))}
              onElegir={({ x, y, zona: nueva }) => pl.cambiarCampos(ev, { coordenada_x: x, coordenada_y: y, zona: nueva })}
              onQuitar={() => pl.cambiarCampos(ev, { coordenada_x: null, coordenada_y: null, zona: null })}
            />

            {opciones.length > 0 && (
              <fieldset className="pl-resultado" data-falta={falta('resultado')}>
                <legend>Resultado</legend>
                <div className="pl-opciones">
                  {opciones.map((r) => (
                    <button key={r} type="button" className="pl-chip" aria-pressed={ev.resultado === r} disabled={ocupada}
                      onClick={() => pl.cambiarCampos(ev, { resultado: r })}>
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="pl-acciones">
              <span className="pl-guardado" role="status" data-error={estadoGuardado && estadoGuardado !== 'guardando' ? 'si' : undefined}>
                {estadoGuardado === 'guardando' ? 'Guardando…' : estadoGuardado || ''}
              </span>
              <button type="button" className="pl-enlace" onClick={() => onEditarTodo(ev)}>Editar todo</button>
              <button type="button" className="pl-enlace" data-peligro="si" onClick={() => onEliminar(ev)}>Eliminar</button>
            </div>
          </div>
        )}
      </article>
    </li>
  )
}
