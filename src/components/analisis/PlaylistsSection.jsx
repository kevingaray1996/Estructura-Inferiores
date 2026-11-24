import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { etiquetaDe } from '../../utils/analisis/catalogoAcciones'
import { moverBorde, moverClip, rangoClip, resolverClipsGuardados } from '../../utils/analisis/clips'
import { CLUB, equiposConAnalisis, fechaDelAnalisis, filtrarPorEquipo, juegaEquipo, nombreDeClave, tituloPartido } from '../../utils/analisis/equipos'
import { FILTRO_VACIO, clipsDeFiltro, clipsParaSumar, normalizarFiltro, partidosDelFiltro, resumenFiltro } from '../../utils/analisis/filtroPlaylist'
import { fechaLegible, formatearTiempo, nombreJugadora } from '../../utils/analisis/formato'
import { Panel } from './PiezasAnalisis'
import './playlists.css'

// Sección «Playlists» de Análisis: biblioteca, nueva playlist desde un filtro y edición (coordinación).
// El cuerpo técnico ve y reproduce las de su categoría (la base no le deja ver otras ni editar).
// dibujos (etapa 4): { tiene } de useDibujos. onDibujar(clip): ventana de dibujo (solo coordinación en la compu).
export default function PlaylistsSection({
  api, equipos, analisis, acciones, catalogo, jugadoras, categoriaPorDefecto, puedeEditar, marcasPorPartido, onReproducir,
  dibujos = null, onDibujar = null,
}) {
  const [vista, setVista] = useState({ tipo: 'lista' })
  const [categorias, setCategorias] = useState([])
  const [filtroEquipo, setFiltroEquipo] = useState('')
  const [aviso, setAviso] = useState('')
  const accionesPorId = useMemo(() => new Map((acciones || []).map((a) => [a.id, a])), [acciones])
  const analisisPorId = useMemo(() => new Map((analisis || []).map((a) => [a.id, a])), [analisis])
  const contexto = useMemo(() => ({ accionesPorId, analisisPorId, catalogo, equipos, marcasPorPartido }), [accionesPorId, analisisPorId, catalogo, equipos, marcasPorPartido])
  const etiqueta = (t) => etiquetaDe(catalogo, t)

  useEffect(() => {
    let vigente = true
    supabase.from('categorias').select('id, nombre, orden').order('orden').then(({ data }) => { if (vigente) setCategorias(data || []) })
    return () => { vigente = false }
  }, [])

  const clipsDe = (playlist) => resolverClipsGuardados(api.clipsPorPlaylist.get(playlist.id) || [], contexto)

  // Biblioteca filtrada por equipo: playlists de ese equipo (por su filtro) o con clips de partidos donde jugó.
  const visibles = useMemo(() => api.playlists.filter((p) => {
    if (!filtroEquipo) return true
    if (normalizarFiltro(p.filtro).equipo === filtroEquipo) return true
    return (api.clipsPorPlaylist.get(p.id) || []).some((f) => {
      const a = analisisPorId.get(accionesPorId.get(f.evento_id)?.partido_id)
      return a && juegaEquipo(a, filtroEquipo, equipos)
    })
  }), [api.playlists, api.clipsPorPlaylist, filtroEquipo, analisisPorId, accionesPorId, equipos])

  if (vista.tipo === 'nueva') {
    return (
      <NuevaPlaylist
        equipos={equipos} analisis={analisis} acciones={acciones} catalogo={catalogo} jugadoras={jugadoras}
        categorias={categorias} categoriaPorDefecto={categoriaPorDefecto} marcasPorPartido={marcasPorPartido}
        onVer={(titulo, clips) => onReproducir({ titulo, clips })}
        onCancelar={() => setVista({ tipo: 'lista' })}
        onGuardar={async (datos) => {
          const r = await api.crear(datos)
          if (r.error) return r
          setAviso(`Playlist «${datos.nombre}» guardada con ${datos.clips.length} clips.`)
          setVista({ tipo: 'editar', id: r.playlist.id })
          return r
        }}
      />
    )
  }

  const editando = vista.tipo === 'editar' ? api.playlists.find((p) => p.id === vista.id) : null
  if (editando) {
    return (
      <EditarPlaylist
        playlist={editando} filas={api.clipsPorPlaylist.get(editando.id) || []} api={api} contexto={contexto}
        analisis={analisis} acciones={acciones} etiqueta={etiqueta} jugadoras={jugadoras} aviso={aviso}
        onReproducir={(clips, indice) => onReproducir({ titulo: editando.nombre, clips, indice })}
        onVolver={() => { setAviso(''); setVista({ tipo: 'lista' }) }}
        dibujos={dibujos} onDibujar={onDibujar}
      />
    )
  }

  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre || ''
  const opcionesEquipo = equiposConAnalisis(analisis, equipos)

  return (
    <Panel>
      <div className="pls">
        <div className="pls-cabecera">
          <h2>Playlists</h2>
          {puedeEditar && <button type="button" className="pls-principal" onClick={() => { setAviso(''); setVista({ tipo: 'nueva' }) }}>+ Nueva playlist</button>}
        </div>
        {api.estado.aviso && <p className="pls-aviso" role="status">{api.estado.aviso}</p>}
        {aviso && <p className="pls-aviso" role="status">{aviso}</p>}
        {api.playlists.length > 0 && (
          <label className="tb-equipo">
            <span className="se-etiqueta">Equipo</span>
            <select value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)}>
              <option value="">Todos los equipos</option>
              {opcionesEquipo.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
            </select>
          </label>
        )}
        {api.estado.cargando ? <p className="pls-dato">Cargando playlists…</p>
          : visibles.length === 0 ? (
            <p className="pls-dato">
              {api.playlists.length ? 'Ninguna playlist de ese equipo.' : puedeEditar
                ? 'Todavía no hay playlists. Armá una con «+ Nueva playlist» o tocando un número de Estadísticas.'
                : 'Todavía no hay playlists de tu categoría.'}
            </p>
          ) : (
            <ul className="pls-tarjetas">
              {visibles.map((p) => {
                const { clips, faltan } = clipsDe(p)
                return (
                  <li key={p.id} className="pls-tarjeta">
                    <h3>{p.nombre}</h3>
                    <p className="pls-dato">{p.filtro ? resumenFiltro(p.filtro, { equipos, etiqueta, jugadoras }) : 'Armada a mano'}</p>
                    <p className="pls-dato">
                      {clips.length} clips{faltan.length ? ` (${faltan.length} no disponibles)` : ''}{nombreCategoria(p.categoria_id) ? ` · ${nombreCategoria(p.categoria_id)}` : ''}
                    </p>
                    {p.descripcion && <p className="pls-dato">{p.descripcion}</p>}
                    <div className="pls-botones">
                      <button type="button" className="pls-principal" disabled={!clips.length} onClick={() => onReproducir({ titulo: p.nombre, clips })}>▶ Reproducir</button>
                      {puedeEditar && <button type="button" className="et-boton" onClick={() => { setAviso(''); setVista({ tipo: 'editar', id: p.id }) }}>Editar</button>}
                      {puedeEditar && (
                        <button type="button" className="et-boton pls-peligro" onClick={async () => {
                          if (!window.confirm(`¿Borrar la playlist «${p.nombre}»? Las acciones de los partidos no se tocan.`)) return
                          const r = await api.borrar(p.id)
                          setAviso(r.error || `Playlist «${p.nombre}» borrada.`)
                        }}>Borrar</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
    </Panel>
  )
}

// ---------- Filtro ----------

function alternar(lista, valor) {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]
}

export function EditorFiltro({ filtro, cambiar, equipos, analisis, catalogo, jugadoras }) {
  const f = normalizarFiltro(filtro)
  const set = (campo, valor) => cambiar(normalizarFiltro({ ...f, [campo]: valor }))
  const opcionesEquipo = equiposConAnalisis(analisis, equipos)
  const partidosDisponibles = useMemo(
    () => [...filtrarPorEquipo(analisis, f.equipo, equipos)].sort((a, b) => String(fechaDelAnalisis(b)).localeCompare(String(fechaDelAnalisis(a)))),
    [analisis, f.equipo, equipos],
  )
  const individuales = catalogo.tipos.filter((t) => t.botonera !== 'colectiva')
  const colectivas = catalogo.tipos.filter((t) => t.botonera === 'colectiva')
  const nombreEquipo = f.equipo ? nombreDeClave(f.equipo, equipos) : ''
  const miradas = f.equipo
    ? [['equipo', `De ${nombreEquipo}`], ['rival', 'De sus rivales'], ['marcado', 'Como se marcó']]
    : [['marcado', 'Como se marcó'], ['espejo', 'Desde el otro equipo']]

  return (
    <div className="flt">
      <div className="flt-dos">
        <label className="flt-fila">
          <span>Equipo</span>
          <select value={f.equipo || ''} onChange={(e) => cambiar(normalizarFiltro({ ...f, equipo: e.target.value || null, partidos: [], mirada: e.target.value ? 'equipo' : 'marcado' }))}>
            <option value="">Todos los equipos</option>
            {opcionesEquipo.map((o) => <option key={o.clave} value={o.clave}>{o.clave === CLUB ? `${o.nombre} (nosotros)` : o.nombre}</option>)}
          </select>
        </label>
        {f.equipo && (
          <label className="flt-fila">
            <span>Últimos partidos de {nombreEquipo}</span>
            <input type="number" min={1} max={50} inputMode="numeric" placeholder="Todos" value={f.ultimos ?? ''}
              onChange={(e) => set('ultimos', e.target.value ? Number(e.target.value) : null)} />
          </label>
        )}
      </div>

      <fieldset className="flt-fila">
        <legend>Desde qué equipo se mira</legend>
        <div className="az-segmento flt-segmento" role="group" aria-label="Desde qué equipo se mira">
          {miradas.map(([id, texto]) => <button key={id} type="button" aria-pressed={f.mirada === id} onClick={() => set('mirada', id)}>{texto}</button>)}
        </div>
      </fieldset>

      <details>
        <summary>Partidos {f.partidos.length ? `(${f.partidos.length} elegidos)` : '(todos)'}</summary>
        <div className="flt-casillas">
          {partidosDisponibles.map((a) => (
            <label key={a.id}>
              <input type="checkbox" checked={f.partidos.includes(a.id)} onChange={() => set('partidos', alternar(f.partidos, a.id))} />
              {tituloPartido(a, equipos)} · {fechaLegible(fechaDelAnalisis(a))}{a.tipo_partido === 'scouting' ? ' · scouting' : ''}
            </label>
          ))}
          {!partidosDisponibles.length && <p className="pls-dato">No hay partidos de ese equipo.</p>}
        </div>
      </details>

      <fieldset className="flt-fila">
        <legend>Acciones colectivas</legend>
        <div className="flt-chips">
          {colectivas.map((t) => <button key={t.codigo} type="button" className="flt-chip" aria-pressed={f.tipos.includes(t.codigo)} onClick={() => set('tipos', alternar(f.tipos, t.codigo))}>{t.etiqueta}</button>)}
        </div>
      </fieldset>
      <fieldset className="flt-fila">
        <legend>Acciones individuales</legend>
        <div className="flt-chips">
          {individuales.map((t) => <button key={t.codigo} type="button" className="flt-chip" aria-pressed={f.tipos.includes(t.codigo)} onClick={() => set('tipos', alternar(f.tipos, t.codigo))}>{t.etiqueta}</button>)}
        </div>
      </fieldset>

      <details>
        <summary>Jugadoras {f.jugadoras.length ? `(${f.jugadoras.length} elegidas)` : '(todas)'}</summary>
        <div className="flt-casillas">
          {jugadoras.map((j) => (
            <label key={j.id}>
              <input type="checkbox" checked={f.jugadoras.includes(j.id)} onChange={() => set('jugadoras', alternar(f.jugadoras, j.id))} />
              {nombreJugadora(j)}
            </label>
          ))}
        </div>
      </details>

      <div className="flt-dos">
        <fieldset className="flt-fila">
          <legend>Tiempo</legend>
          <div className="az-segmento" role="group" aria-label="Tiempo">
            {[[null, 'Los dos'], [1, '1T'], [2, '2T']].map(([v, t]) => <button key={t} type="button" aria-pressed={f.tiempo === v} onClick={() => set('tiempo', v)}>{t}</button>)}
          </div>
        </fieldset>
        <fieldset className="flt-fila">
          <legend>Resultado (individuales)</legend>
          <div className="az-segmento" role="group" aria-label="Resultado">
            {[[null, 'Todas'], ['correcta', 'Correctas'], ['incorrecta', 'Incorrectas']].map(([v, t]) => <button key={t} type="button" aria-pressed={f.resultado === v} onClick={() => set('resultado', v)}>{t}</button>)}
          </div>
        </fieldset>
      </div>
      {(f.jugadoras.length > 0 || f.resultado) && <p className="pls-dato">Con jugadora o resultado elegidos quedan solo acciones individuales.</p>}
    </div>
  )
}

function NuevaPlaylist({ equipos, analisis, acciones, catalogo, jugadoras, categorias, categoriaPorDefecto, marcasPorPartido, onVer, onCancelar, onGuardar }) {
  const [filtro, setFiltro] = useState(FILTRO_VACIO)
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState(categoriaPorDefecto || '')
  const [estado, setEstado] = useState('')
  const clips = useMemo(() => clipsDeFiltro({ filtro, analisis, acciones, catalogo, equipos, marcasPorPartido }), [filtro, analisis, acciones, catalogo, equipos, marcasPorPartido])
  const partidos = useMemo(() => partidosDelFiltro(analisis, filtro, equipos), [analisis, filtro, equipos])
  const sugerido = resumenFiltro(filtro, { equipos, etiqueta: (t) => etiquetaDe(catalogo, t), jugadoras })

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim() || !categoriaId || !clips.length) return
    setEstado('guardando')
    const r = await onGuardar({ nombre: nombre.trim(), categoriaId, filtro: normalizarFiltro(filtro), clips })
    setEstado(r?.error || '')
  }

  return (
    <Panel>
      <form className="pls" onSubmit={guardar}>
        <div className="pls-cabecera">
          <h2>Nueva playlist</h2>
          <button type="button" className="et-boton" onClick={onCancelar}>← Volver</button>
        </div>
        <EditorFiltro filtro={filtro} cambiar={setFiltro} equipos={equipos} analisis={analisis} catalogo={catalogo} jugadoras={jugadoras} />
        <div className="flt-cuenta" role="status">
          <strong>{clips.length}</strong> clips · {partidos.length} partidos
          <button type="button" className="et-boton" disabled={!clips.length} onClick={() => onVer(nombre.trim() || sugerido, clips)}>▶ Ver antes de guardar</button>
        </div>
        <div className="flt flt-dos">
          <label className="flt-fila">
            <span>Nombre</span>
            <input type="text" maxLength={80} value={nombre} placeholder={sugerido} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="flt-fila">
            <span>Categoría que la ve</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="">Elegí una categoría…</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        </div>
        {estado && estado !== 'guardando' && <p className="pls-error" role="alert">{estado}</p>}
        <div className="pls-botones">
          <button type="submit" className="pls-principal" disabled={estado === 'guardando' || !nombre.trim() || !categoriaId || !clips.length}>
            {estado === 'guardando' ? 'Guardando…' : `Guardar playlist (${clips.length} clips)`}
          </button>
          {!nombre.trim() && <button type="button" className="et-boton" onClick={() => setNombre(sugerido.slice(0, 80))}>Usar «{sugerido.slice(0, 40)}»</button>}
        </div>
      </form>
    </Panel>
  )
}

// ---------- Edición ----------

function EditarPlaylist({ playlist, filas, api, contexto, analisis, acciones, etiqueta, jugadoras, aviso, onReproducir, onVolver, dibujos, onDibujar }) {
  const { clips, faltan } = useMemo(() => resolverClipsGuardados(filas, contexto), [filas, contexto])
  const [estado, setEstado] = useState(aviso || '')
  const [nombre, setNombre] = useState(playlist.nombre)
  const [arrastrando, setArrastrando] = useState(null)
  const [destino, setDestino] = useState(null)
  const nuevos = useMemo(() => {
    if (!playlist.filtro) return []
    const delFiltro = clipsDeFiltro({ filtro: playlist.filtro, analisis, acciones, catalogo: contexto.catalogo, equipos: contexto.equipos, marcasPorPartido: contexto.marcasPorPartido })
    return clipsParaSumar(delFiltro, clips.map((c) => c.clave), playlist.quitados)
  }, [playlist.filtro, playlist.quitados, analisis, acciones, contexto, clips])

  const avisar = (r, ok) => setEstado(r?.error || ok)

  async function mover(desde, hasta) {
    const ids = moverClip(clips.map((c) => c.filaId), desde, hasta)
    avisar(await api.reordenar(playlist.id, ids), 'Orden guardado.')
  }

  async function ajustar(clip, borde, delta) {
    const evento = contexto.accionesPorId.get(clip.eventoId)
    const base = rangoClip(evento, contexto.catalogo)
    const nuevo = moverBorde(clip, borde, delta, base)
    if (nuevo.ajuste_inicio === clip.ajuste_inicio && nuevo.ajuste_fin === clip.ajuste_fin) return
    avisar(await api.editarClip(clip.filaId, playlist.id, nuevo), '')
  }

  return (
    <Panel>
      <div className="pls">
        <div className="pls-cabecera">
          <h2>Editar playlist</h2>
          <button type="button" className="pls-principal" disabled={!clips.length} onClick={() => onReproducir(clips, 0)}>▶ Reproducir</button>
          <button type="button" className="et-boton" onClick={onVolver}>← Volver</button>
        </div>
        <div className="flt">
          <label className="flt-fila">
            <span>Nombre</span>
            <input type="text" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)}
              onBlur={async () => { if (nombre.trim() && nombre.trim() !== playlist.nombre) avisar(await api.actualizar(playlist.id, { nombre: nombre.trim() }), 'Nombre guardado.') }} />
          </label>
          <p className="pls-dato">{playlist.filtro ? `Filtro: ${resumenFiltro(playlist.filtro, { equipos: contexto.equipos, etiqueta, jugadoras })}` : 'Armada a mano (sin filtro).'}</p>
          {playlist.filtro && (
            <div className="pls-botones">
              <button type="button" className="et-boton" disabled={!nuevos.length} onClick={async () => {
                const r = await api.sumarClips(playlist.id, nuevos)
                avisar(r, `Se sumaron ${r.sumados} clips nuevos.`)
              }}>Actualizar con el filtro{nuevos.length ? ` (+${nuevos.length} nuevos)` : ' (no hay nuevos)'}</button>
            </div>
          )}
        </div>
        {estado && <p className="pls-aviso" role="status">{estado}</p>}
        {faltan.length > 0 && <p className="pls-dato">{faltan.length} clips son de acciones que ya no están o que no podés ver.</p>}
        <p className="pls-dato">Arrastrá ⠿ (o usá ↑ ↓) para cambiar el orden. El ajuste de ±1 s es solo de esta playlist: la acción original no cambia.</p>
        <ol className="ed-clips">
          {clips.map((c, i) => {
            const a = contexto.analisisPorId.get(c.partidoId)
            return (
              <li key={c.filaId} className="ed-clip" data-arrastrando={arrastrando === i ? '' : undefined} data-destino={destino === i && arrastrando !== i ? '' : undefined}
                onDragOver={(e) => { if (arrastrando !== null) { e.preventDefault(); setDestino(i) } }}
                onDrop={(e) => { e.preventDefault(); if (arrastrando !== null) mover(arrastrando, i); setArrastrando(null); setDestino(null) }}>
                <span className="ed-asa" draggable aria-hidden="true"
                  onDragStart={(e) => { setArrastrando(i); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setArrastrando(null); setDestino(null) }}>⠿</span>
                <div>
                  <p className="ed-titulo">{i + 1}. {etiqueta(c.tipo)}{c.equipo ? ` · ${nombreDeClave(c.equipo, contexto.equipos)}` : ''}{dibujos?.tiene(c.eventoId, c.espejo) && <span className="dib-icono" title="Tiene dibujos"> ✎</span>}</p>
                  <p className="ed-dato">{tituloPartido(a, contexto.equipos)} · {formatearTiempo(c.inicio)} a {formatearTiempo(c.fin)} ({c.fin - c.inicio} s)</p>
                </div>
                <div className="ed-controles">
                  <button type="button" className="et-boton" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, i - 1)}>↑</button>
                  <button type="button" className="et-boton" aria-label="Bajar" disabled={i === clips.length - 1} onClick={() => mover(i, i + 1)}>↓</button>
                  <span className="ed-grupo">Inicio
                    <button type="button" className="et-boton" aria-label="Empezar 1 segundo antes" onClick={() => ajustar(c, 'inicio', -1)}>−1</button>
                    <button type="button" className="et-boton" aria-label="Empezar 1 segundo después" onClick={() => ajustar(c, 'inicio', 1)}>+1</button>
                  </span>
                  <span className="ed-grupo">Fin
                    <button type="button" className="et-boton" aria-label="Terminar 1 segundo antes" onClick={() => ajustar(c, 'fin', -1)}>−1</button>
                    <button type="button" className="et-boton" aria-label="Terminar 1 segundo después" onClick={() => ajustar(c, 'fin', 1)}>+1</button>
                  </span>
                  <button type="button" className="et-boton" onClick={() => onReproducir(clips, i)}>▶</button>
                  {onDibujar && <button type="button" className="et-boton" onClick={() => onDibujar(c)}>✎ Dibujar</button>}
                  {dibujos?.tiene(c.eventoId, c.espejo) && (
                    <span className="az-segmento" role="group" aria-label="Dibujos en este clip">
                      {[[true, 'Con dibujos'], [false, 'Sin dibujos']].map(([valor, texto]) => (
                        <button key={texto} type="button" aria-pressed={c.conDibujos === valor}
                          onClick={async () => { if (c.conDibujos !== valor) avisar(await api.editarClip(c.filaId, playlist.id, { con_dibujos: valor }), valor ? 'Se verá con sus dibujos.' : 'Se verá sin dibujos.') }}>
                          {texto}
                        </button>
                      ))}
                    </span>
                  )}
                  <button type="button" className="et-boton pls-peligro" onClick={async () => {
                    avisar(await api.quitarClip(playlist, { id: c.filaId }, c.clave), 'Clip quitado.')
                  }}>Quitar</button>
                </div>
                <NotaClip clip={c} onGuardar={async (nota) => avisar(await api.editarClip(c.filaId, playlist.id, { nota: nota || null }), 'Nota guardada.')} />
              </li>
            )
          })}
        </ol>
        {!clips.length && <p className="pls-dato">La playlist no tiene clips.</p>}
      </div>
    </Panel>
  )
}

function NotaClip({ clip, onGuardar }) {
  const [nota, setNota] = useState(clip.nota || '')
  return (
    <input type="text" className="ed-nota" maxLength={300} placeholder="Nota para este clip (se ve al reproducir)" aria-label="Nota del clip"
      value={nota} onChange={(e) => setNota(e.target.value)}
      onBlur={() => { if (nota.trim() !== (clip.nota || '')) onGuardar(nota.trim()) }} />
  )
}
