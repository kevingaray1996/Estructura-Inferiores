import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'
import { validarPizarra } from '../utils/pizarra'
import { AMBITOS, carpetasDe, datosParaGuardar, DURACIONES, embedYoutube, erroresEjercicio, filtrarEjercicios, GRUPOS_MUSCULARES, idYoutube, MATERIALES, miniaturaYoutube,
  nombreCarpetaValido, puedeEditar, reordenar, sinCarpeta, TIPOS, valoresDistintos } from '../utils/biblioteca'
import { cargarSetInicial, faltantesSetInicial } from '../utils/bibliotecaInicial'
import EncabezadoFotografico from './EncabezadoFotografico'
import EstadoContenido from './ui/EstadoContenido'
import PizarraEjercicio from './PizarraEjercicio'
import PizarraCancha from './PizarraCancha'
import './audiovisualPremium.css'
import './biblioteca.css'

// Etapas D + G: Biblioteca de Cancha (ejercicios y jugadas con pizarra) y de Gimnasio (ejercicios con demostración).
// Reemplaza a la pantalla "Entrenamientos" (que era el alta de la tabla biblioteca). Leen coordinación, técnicos y PF;
// Cancha la editan coordinación y técnicos; Gimnasio, coordinación y PF (la base aplica lo mismo).
const CLAVE_AMBITO = 'biblioteca-ambito'
const FILTROS_VACIOS = { texto: '', carpeta: '', tipo: '', jugadoras: '', duracion: '', objetivo: '', musculo: '', material: '', soloFavoritos: false }
const leerAmbito = () => { try { return localStorage.getItem(CLAVE_AMBITO) === 'gimnasio' ? 'gimnasio' : 'cancha' } catch { return 'cancha' } }
const nuevoForm = (ambito, carpeta_id = '') => ({ ambito, tipo: 'ejercicio', carpeta_id, contenido: '', descripcion: '', cantidad_jugadores: '', duracion_minutos: '', objetivo: '',
  imagen_url: '', link_video: '', pizarra: null, pizarra_miniatura: '', musculos: [], material: [], tecnica: '', demo_tipo: 'youtube', demo_url: '', demo_credito: '' })
const formDe = e => ({ ...nuevoForm(e.ambito), ...e, carpeta_id: e.carpeta_id || '', cantidad_jugadores: e.cantidad_jugadores ?? '', duracion_minutos: e.duracion_minutos ?? '',
  musculos: e.musculos || [], material: e.material || [], demo_tipo: e.demo_tipo || 'youtube', demo_url: e.demo_url || '', demo_credito: e.demo_credito || '' })

function Vista({ e }) {
  if (e.ambito === 'gimnasio') {
    const yt = e.demo_tipo === 'youtube' && idYoutube(e.demo_url)
    const src = e.demo_tipo === 'imagen' ? e.demo_url : yt ? miniaturaYoutube(yt) : null
    return src ? <img src={src} alt="" loading="lazy" /> : <span className="bib-vista-vacia" aria-hidden="true">🏋️</span>
  }
  let doc = null
  try { if (e.pizarra) doc = validarPizarra(e.pizarra) } catch { doc = null }
  if (doc) return <PizarraCancha miniatura doc={doc} poses={doc.pasos[0].poses} />
  if (e.imagen_url) return <img src={e.imagen_url} alt="" loading="lazy" />
  return <span className="bib-vista-vacia" aria-hidden="true">🏟️</span>
}

// Etiquetas libres (músculos, material) con sugerencias.
function Etiquetas({ titulo, valores, sugerencias, cambiar }) {
  const [texto, setTexto] = useState('')
  const agregar = v => { const t = v.trim(); if (t && !valores.some(x => x.toLowerCase() === t.toLowerCase()) && valores.length < 20) cambiar([...valores, t]); setTexto('') }
  return <div className="bib-campo bib-ancho"><span>{titulo}</span>
    <div className="bib-etiquetas">{valores.map(v => <button type="button" key={v} className="bib-etiqueta" aria-label={`Quitar ${v}`} onClick={() => cambiar(valores.filter(x => x !== v))}>{v} ✕</button>)}
      <input aria-label={`Agregar ${titulo.toLowerCase()}`} placeholder="Escribí y Enter" value={texto} maxLength={60} list={`bib-${titulo}`} onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(texto) } }} onBlur={() => texto && agregar(texto)} />
      <datalist id={`bib-${titulo}`}>{sugerencias.filter(s => !valores.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
    </div>
    <div className="bib-sugerencias">{sugerencias.filter(s => !valores.includes(s)).slice(0, 8).map(s => <button type="button" key={s} onClick={() => agregar(s)}>+ {s}</button>)}</div>
  </div>
}

function Editor({ inicial, carpetas, rol, onGuardado, onCancelar }) {
  const [form, setForm] = useState(inicial), [guardando, setGuardando] = useState(false), [subiendo, setSubiendo] = useState(false), [error, setError] = useState('')
  const gimnasio = form.ambito === 'gimnasio', cambiar = cambios => setForm(f => ({ ...f, ...cambios }))
  const errores = erroresEjercicio(form)
  async function subir(archivo, carpeta, campo) {
    if (!archivo) return
    setSubiendo(true); setError('')
    try {
      const comprimido = await comprimirImagen(archivo, { maxAncho: 1200, maxAlto: 1200 })
      const nombre = `${carpeta}/${Date.now()}-${sanitizarNombreArchivo(comprimido.name)}`
      const { error: fallo } = await supabase.storage.from('Biblioteca').upload(nombre, comprimido, { upsert: false })
      if (fallo) throw fallo
      const url = supabase.storage.from('Biblioteca').getPublicUrl(nombre).data.publicUrl
      cambiar(campo === 'demo' ? { demo_tipo: 'imagen', demo_url: url } : { imagen_url: url })
    } catch (e) { setError(`No se pudo subir la imagen: ${e.message || e}`) } finally { setSubiendo(false) }
  }
  async function guardar() {
    if (errores.length || guardando) return
    setGuardando(true); setError('')
    const { data, error: fallo } = await supabase.rpc('guardar_ejercicio_pizarra', { p_id: form.id || null, p_revision: form.id ? form.pizarra_revision : null, p_datos: datosParaGuardar({ ...form, fecha: form.fecha || obtenerFechaHoy() }) })
    setGuardando(false)
    if (fallo) { setError(fallo.code === '40001' ? 'El ejercicio cambió en otra sesión: recargá antes de guardar.' : fallo.code === '42501' ? 'No tenés permiso para editar este ámbito.' : fallo.message); return }
    onGuardado(data)
  }
  const yt = gimnasio && form.demo_tipo === 'youtube' && idYoutube(form.demo_url)
  return <section className="av-editor bib-editor" aria-labelledby="bib-editor-titulo">
    <header className="av-titulo-panel"><p>{AMBITOS[form.ambito].toUpperCase()}</p><h2 id="bib-editor-titulo">{form.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2></header>
    <div className="bib-form">
      <label className="bib-campo bib-ancho"><span>Nombre</span><input value={form.contenido} maxLength={120} onChange={e => cambiar({ contenido: e.target.value })} placeholder={gimnasio ? 'Ej.: Sentadilla búlgara' : 'Ej.: Rondo 4 vs 2'} /></label>
      {!gimnasio && <label className="bib-campo"><span>Tipo</span><select value={form.tipo} onChange={e => cambiar({ tipo: e.target.value })}>{Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>}
      <label className="bib-campo"><span>Carpeta</span><select value={form.carpeta_id} onChange={e => cambiar({ carpeta_id: e.target.value })}>
        {!carpetas.some(c => c.sistema) && <option value="">Sin carpeta</option>}
        {carpetas.map(c => <option key={c.id} value={c.sistema ? '' : c.id}>{c.nombre}</option>)}</select></label>
      {!gimnasio && <label className="bib-campo"><span>Jugadoras</span><input type="number" min="1" max="40" value={form.cantidad_jugadores} onChange={e => cambiar({ cantidad_jugadores: e.target.value })} /></label>}
      <label className="bib-campo"><span>Duración (min)</span><input type="number" min="1" max="600" value={form.duracion_minutos} onChange={e => cambiar({ duracion_minutos: e.target.value })} /></label>
      <label className="bib-campo bib-ancho"><span>Objetivo</span><input value={form.objetivo} maxLength={500} onChange={e => cambiar({ objetivo: e.target.value })} placeholder={gimnasio ? 'Ej.: Fuerza unilateral' : 'Ej.: Superar la primera línea'} /></label>
      <label className="bib-campo bib-ancho"><span>{gimnasio ? 'Descripción' : 'Descripción y consignas'}</span><textarea rows={3} value={form.descripcion} onChange={e => cambiar({ descripcion: e.target.value })} /></label>
      {gimnasio && <>
        <Etiquetas titulo="Músculos" valores={form.musculos} sugerencias={GRUPOS_MUSCULARES} cambiar={musculos => cambiar({ musculos })} />
        <Etiquetas titulo="Material" valores={form.material} sugerencias={MATERIALES} cambiar={material => cambiar({ material })} />
        <label className="bib-campo bib-ancho"><span>Puntos clave de técnica</span><textarea rows={4} maxLength={2000} value={form.tecnica} onChange={e => cambiar({ tecnica: e.target.value })} placeholder="Uno por línea: espalda neutra, rodilla alineada con el pie…" /></label>
        <fieldset className="bib-campo bib-ancho bib-demo"><legend>Demostración</legend>
          <div className="bib-segmentado" role="group" aria-label="Tipo de demostración">
            {[['youtube', 'Video de YouTube'], ['imagen', 'Imagen']].map(([v, n]) => <button type="button" key={v} aria-pressed={form.demo_tipo === v} onClick={() => cambiar({ demo_tipo: v, demo_url: form.demo_tipo === v ? form.demo_url : '' })}>{n}</button>)}
          </div>
          {form.demo_tipo === 'youtube'
            ? <label className="bib-campo"><span>Link de YouTube</span><input value={form.demo_url} onChange={e => cambiar({ demo_url: e.target.value.trim() })} placeholder="https://www.youtube.com/watch?v=…" /></label>
            : <label className="bib-subir">{subiendo ? 'Subiendo…' : form.demo_url ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/*" disabled={subiendo || !puedeEditar(rol, 'gimnasio')} onChange={e => subir(e.target.files?.[0], 'gimnasio', 'demo')} /></label>}
          {yt && <img className="bib-demo-previa" src={miniaturaYoutube(yt)} alt="Vista previa del video" />}
          {form.demo_tipo === 'imagen' && form.demo_url && <img className="bib-demo-previa" src={form.demo_url} alt="Vista previa de la demostración" />}
          {form.demo_url && <label className="bib-campo"><span>Crédito (opcional)</span><input value={form.demo_credito} maxLength={200} onChange={e => cambiar({ demo_credito: e.target.value })} placeholder="Ej.: Canal de origen o autor" /></label>}
          {form.demo_url && <button type="button" className="bib-quitar" onClick={() => cambiar({ demo_url: '', demo_credito: '' })}>Quitar demostración</button>}
        </fieldset>
      </>}
      {!gimnasio && <>
        <label className="bib-campo"><span>Link de video (opcional)</span><input value={form.link_video || ''} onChange={e => cambiar({ link_video: e.target.value.trim() })} /></label>
        <div className="bib-campo"><span>Imagen (opcional)</span>
          <label className="bib-subir">{subiendo ? 'Subiendo…' : form.imagen_url ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/*" disabled={subiendo} onChange={e => subir(e.target.files?.[0], 'entrenamientos', 'imagen')} /></label>
          {form.imagen_url && <button type="button" className="bib-quitar" onClick={() => cambiar({ imagen_url: '' })}>Quitar imagen</button>}
        </div>
        <div className="bib-campo bib-ancho"><span>Pizarra</span>
          <PizarraEjercicio valor={form.pizarra} miniatura={form.pizarra_miniatura} nombre={form.contenido || 'Ejercicio'} onChange={(pizarra, pizarra_miniatura) => cambiar({ pizarra, pizarra_miniatura })} />
          {form.pizarra && <button type="button" className="bib-quitar" onClick={() => { if (window.confirm('¿Quitar la pizarra de este ejercicio?')) cambiar({ pizarra: null, pizarra_miniatura: '' }) }}>Quitar pizarra</button>}
        </div>
      </>}
    </div>
    {(errores.length > 0 || error) && <p role="alert" className="bib-error">{error || errores.join(' ')}</p>}
    <div className="bib-acciones-form">
      <button type="button" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      <button type="button" data-primario="" onClick={guardar} disabled={guardando || errores.length > 0}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div>
  </section>
}

function Ficha({ e, carpeta, editable, favorito, onFavorito, onEditar, onCerrar }) {
  const yt = e.ambito === 'gimnasio' && e.demo_tipo === 'youtube' && idYoutube(e.demo_url)
  return <div className="bib-ficha-fondo" role="presentation" onClick={ev => { if (ev.target === ev.currentTarget) onCerrar() }}>
    <article className="bib-ficha" role="dialog" aria-modal="true" aria-labelledby="bib-ficha-titulo">
      <header><div><p>{AMBITOS[e.ambito]} · {carpeta}</p><h2 id="bib-ficha-titulo">{e.contenido || 'Ejercicio'}</h2></div>
        <button type="button" className="bib-favorito" aria-pressed={favorito} aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'} onClick={onFavorito}>{favorito ? '★' : '☆'}</button>
        <button type="button" aria-label="Cerrar" onClick={onCerrar}>✕</button></header>
      <div className="bib-chips">
        {e.ambito === 'cancha' && <span>{TIPOS[e.tipo] || 'Ejercicio'}</span>}
        {e.cantidad_jugadores && <span>{e.cantidad_jugadores} jugadoras</span>}
        {e.duracion_minutos && <span>{e.duracion_minutos} min</span>}
        {(e.musculos || []).map(m => <span key={m}>{m}</span>)}
        {(e.material || []).map(m => <span key={m} className="bib-chip-material">{m}</span>)}
      </div>
      {e.objetivo && <p className="bib-objetivo"><b>Objetivo:</b> {e.objetivo}</p>}
      {e.descripcion && <p className="bib-texto">{e.descripcion}</p>}
      {e.ambito === 'cancha' && e.pizarra && <div className="bib-ficha-pizarra"><Vista e={e} /><PizarraEjercicio valor={e.pizarra} nombre={e.contenido || 'Ejercicio'} objetivo={e.objetivo} indicaciones={e.descripcion} soloLectura /></div>}
      {e.ambito === 'cancha' && !e.pizarra && e.imagen_url && <img className="bib-demo" src={e.imagen_url} alt={e.contenido || 'Ejercicio'} />}
      {e.link_video && <a href={e.link_video} target="_blank" rel="noreferrer">▶ Ver video</a>}
      {e.ambito === 'gimnasio' && <>
        {e.tecnica && <div className="bib-tecnica"><h3>Puntos clave</h3><ul>{e.tecnica.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
        {yt && <div className="bib-video"><iframe src={embedYoutube(yt)} title={`Demostración: ${e.contenido}`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" /></div>}
        {e.demo_tipo === 'imagen' && e.demo_url && <img className="bib-demo" src={e.demo_url} alt={`Demostración: ${e.contenido}`} />}
        {e.demo_url && e.demo_credito && <p className="bib-credito">Crédito: {e.demo_credito}</p>}
      </>}
      {editable && <div className="bib-acciones-form"><button type="button" data-primario="" onClick={onEditar}>Editar</button></div>}
    </article>
  </div>
}

export default function BibliotecaSection({ perfil, onPlanificar }) {
  const rol = perfil?.rol
  const [ambito, setAmbito] = useState(leerAmbito)
  const [ejercicios, setEjercicios] = useState([]), [carpetas, setCarpetas] = useState([]), [favoritos, setFavoritos] = useState(() => new Set())
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [editor, setEditor] = useState(null), [ficha, setFicha] = useState(null), [gestion, setGestion] = useState(false)
  const [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false)
  const editable = puedeEditar(rol, ambito)

  const cargar = useCallback(async () => {
    const [b, c, f] = await Promise.all([
      supabase.from('biblioteca').select('*').order('contenido'),
      supabase.from('biblioteca_carpetas').select('*').order('orden'),
      supabase.from('biblioteca_favoritos').select('biblioteca_id'),
    ])
    const error = b.error || c.error || f.error
    if (error) { setEstado({ cargando: false, error }); return }
    setEjercicios((b.data || []).map(e => ({ ...e, ambito: e.ambito || 'cancha' })))
    setCarpetas(c.data || []); setFavoritos(new Set((f.data || []).map(x => x.biblioteca_id)))
    setEstado({ cargando: false, error: null })
  }, [])
  useEffect(() => { let activo = true; Promise.resolve().then(() => activo && cargar()); return () => { activo = false } }, [cargar])

  function elegirAmbito(a) { setAmbito(a); setFiltros(FILTROS_VACIOS); setGestion(false); setEditor(null); try { localStorage.setItem(CLAVE_AMBITO, a) } catch { /* sin almacenamiento */ } }
  const lista = useMemo(() => carpetasDe(carpetas, ambito, ejercicios), [carpetas, ambito, ejercicios])
  const fija = lista.find(c => c.sistema)?.id || null
  const delAmbito = useMemo(() => ejercicios.filter(e => e.ambito === ambito), [ejercicios, ambito])
  const visibles = useMemo(() => filtrarEjercicios(delAmbito, { ...filtros, ambito }, favoritos, fija), [delAmbito, filtros, ambito, favoritos, fija])
  const nombreCarpeta = e => lista.find(c => c.id === e.carpeta_id)?.nombre || lista.find(c => c.sistema)?.nombre || 'Sin carpeta'
  const faltan = ambito === 'cancha' && rol && puedeEditar(rol, 'cancha') ? faltantesSetInicial(ejercicios) : 0
  const filtrar = cambios => setFiltros(f => ({ ...f, ...cambios }))

  async function favorito(e) {
    const marcado = favoritos.has(e.id)
    setFavoritos(s => { const n = new Set(s); if (marcado) n.delete(e.id); else n.add(e.id); return n })
    const { error } = marcado ? await supabase.from('biblioteca_favoritos').delete().eq('biblioteca_id', e.id) : await supabase.from('biblioteca_favoritos').insert({ biblioteca_id: e.id })
    if (error) { setAviso(`No se pudo ${marcado ? 'quitar' : 'marcar'} el favorito: ${error.message}`); cargar() }
  }
  async function eliminar(e) {
    if (!window.confirm(`¿Eliminar "${e.contenido || 'este ejercicio'}" de la biblioteca? Las sesiones que ya lo usan conservan su copia.`)) return
    const { error } = await supabase.from('biblioteca').delete().eq('id', e.id)
    if (error) setAviso(`No se pudo eliminar: ${error.message}`); else { setFicha(null); cargar() }
  }
  async function carpetaNueva() {
    const nombre = window.prompt('Nombre de la carpeta nueva')
    if (nombre == null) return
    const problema = nombreCarpetaValido(nombre, carpetas, ambito)
    if (problema) { setAviso(problema); return }
    const orden = Math.max(0, ...lista.map(c => c.orden)) + 10
    const { error } = await supabase.from('biblioteca_carpetas').insert({ ambito, nombre: nombre.trim(), orden })
    if (error) setAviso(`No se pudo crear la carpeta: ${error.message}`); else cargar()
  }
  async function renombrar(c) {
    const nombre = window.prompt('Nuevo nombre', c.nombre)
    if (nombre == null || nombre.trim() === c.nombre) return
    const problema = nombreCarpetaValido(nombre, carpetas, ambito, c.id)
    if (problema) { setAviso(problema); return }
    const { error } = await supabase.from('biblioteca_carpetas').update({ nombre: nombre.trim() }).eq('id', c.id)
    if (error) setAviso(`No se pudo renombrar: ${error.message}`); else cargar()
  }
  async function mover(c, delta) {
    const cambios = reordenar(lista, c.id, delta)
    if (!cambios.length) return
    setOcupado(true)
    for (const x of cambios) { const { error } = await supabase.from('biblioteca_carpetas').update({ orden: x.orden }).eq('id', x.id); if (error) { setAviso(`No se pudo ordenar: ${error.message}`); break } }
    setOcupado(false); cargar()
  }
  async function borrar(c) {
    if (c.cantidad) { setAviso(`"${c.nombre}" tiene ${c.cantidad} ejercicio(s): movelos a otra carpeta antes de borrarla.`); return }
    if (!window.confirm(`¿Borrar la carpeta "${c.nombre}"?`)) return
    const { error } = await supabase.from('biblioteca_carpetas').delete().eq('id', c.id)
    if (error) setAviso(error.code === '23001' || error.code === '23503' ? `"${c.nombre}" todavía tiene ejercicios.` : `No se pudo borrar: ${error.message}`)
    else { if (filtros.carpeta === c.id) filtrar({ carpeta: '' }); cargar() }
  }
  async function setInicial() {
    setOcupado(true); setAviso('')
    try { const n = await cargarSetInicial(supabase, carpetas, ejercicios); setAviso(n ? `Se cargaron ${n} jugadas de ejemplo.` : 'Las jugadas de ejemplo ya estaban.'); cargar() }
    catch (e) { setAviso(`No se pudieron cargar las jugadas de ejemplo: ${e.message}`) } finally { setOcupado(false) }
  }

  const opcionesJugadoras = valoresDistintos(delAmbito, e => e.cantidad_jugadores)
  const opcionesObjetivo = valoresDistintos(delAmbito, e => e.objetivo)
  const opcionesMusculo = valoresDistintos(delAmbito, e => e.musculos), opcionesMaterial = valoresDistintos(delAmbito, e => e.material)
  const filtrosActivos = Object.entries(filtros).some(([k, v]) => k !== 'carpeta' && v)

  return <div className="av-premium bib" style={{ color: 'var(--ui-texto)' }}>
    <div className="av-contenido">
      <EncabezadoFotografico eyebrowResaltado="Ejercicios, jugadas y gimnasio" titulo="Biblio" resaltado="teca" imagen="/images/fotos-comunicaciones/banner_entrenamientos.jpg" descripcionImagen="Cancha y tribunas negras y amarillas de Comunicaciones" posicion="entrenamientos-premium">
        <div className="av-acciones-cabecera">
          {onPlanificar && <button type="button" onClick={onPlanificar} className="av-accion">▦ Entrenamientos</button>}
          {editable && <button type="button" className="av-accion av-primario" onClick={() => { setFicha(null); setEditor(nuevoForm(ambito, filtros.carpeta && filtros.carpeta !== 'sin' ? filtros.carpeta : '')) }}>+ Nuevo {ambito === 'gimnasio' ? 'ejercicio de gimnasio' : 'ejercicio o jugada'}</button>}
        </div>
      </EncabezadoFotografico>

      <div className="bib-ambitos" role="tablist" aria-label="Ámbito">
        {Object.entries(AMBITOS).map(([a, n]) => <button type="button" role="tab" key={a} aria-selected={ambito === a} onClick={() => elegirAmbito(a)}>
          {n}<small>{ejercicios.filter(e => e.ambito === a).length}</small></button>)}
      </div>
      {aviso && <p className="bib-aviso" role="status">{aviso}<button type="button" aria-label="Cerrar aviso" onClick={() => setAviso('')}>✕</button></p>}

      {editor && <Editor key={editor.id || 'nuevo'} inicial={editor} carpetas={lista} rol={rol} onCancelar={() => setEditor(null)}
        onGuardado={() => { setEditor(null); setAviso('Ejercicio guardado.'); cargar() }} />}

      <div className="bib-cuerpo">
        <aside className="bib-carpetas" aria-label="Carpetas">
          <div className="bib-carpetas-cabecera"><strong>Carpetas</strong>
            {editable && <button type="button" aria-pressed={gestion} onClick={() => setGestion(g => !g)}>{gestion ? 'Listo' : 'Ordenar'}</button>}</div>
          <button type="button" className="bib-carpeta" aria-pressed={!filtros.carpeta} onClick={() => filtrar({ carpeta: '' })}><span>Todas</span><small>{delAmbito.length}</small></button>
          {lista.map((c, i) => <div key={c.id} className="bib-carpeta-fila">
            <button type="button" className="bib-carpeta" aria-pressed={filtros.carpeta === c.id || (c.sistema && filtros.carpeta === 'sin')} onClick={() => filtrar({ carpeta: c.sistema ? 'sin' : c.id })}>
              <span>{c.nombre}</span><small>{c.cantidad}</small></button>
            {gestion && !c.sistema && <span className="bib-carpeta-acciones">
              <button type="button" aria-label={`Subir ${c.nombre}`} disabled={ocupado || i === (fija ? 1 : 0)} onClick={() => mover(c, -1)}>↑</button>
              <button type="button" aria-label={`Bajar ${c.nombre}`} disabled={ocupado || i === lista.length - 1} onClick={() => mover(c, 1)}>↓</button>
              <button type="button" aria-label={`Renombrar ${c.nombre}`} onClick={() => renombrar(c)}>✎</button>
              <button type="button" aria-label={`Borrar ${c.nombre}`} disabled={c.cantidad > 0} title={c.cantidad ? 'Solo se borran carpetas vacías' : 'Borrar carpeta'} onClick={() => borrar(c)}>🗑</button>
            </span>}
          </div>)}
          {!fija && sinCarpeta(ejercicios, ambito) > 0 && <button type="button" className="bib-carpeta" aria-pressed={filtros.carpeta === 'sin'} onClick={() => filtrar({ carpeta: 'sin' })}><span>Sin carpeta</span><small>{sinCarpeta(ejercicios, ambito)}</small></button>}
          {gestion && <button type="button" className="bib-carpeta-nueva" onClick={carpetaNueva}>+ Nueva carpeta</button>}
        </aside>

        <main className="bib-principal">
          <div className="bib-filtros" role="search" aria-label="Filtros">
            <label className="bib-campo bib-buscar"><span>Buscar</span><input type="search" value={filtros.texto} onChange={e => filtrar({ texto: e.target.value })} placeholder={ambito === 'gimnasio' ? 'Nombre, músculo, material…' : 'Nombre, objetivo, consigna…'} /></label>
            {ambito === 'cancha' ? <>
              <label className="bib-campo"><span>Tipo</span><select value={filtros.tipo} onChange={e => filtrar({ tipo: e.target.value })}><option value="">Todos</option>{Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}s</option>)}</select></label>
              <label className="bib-campo"><span>Jugadoras</span><select value={filtros.jugadoras} onChange={e => filtrar({ jugadoras: e.target.value })}><option value="">Todas</option>{opcionesJugadoras.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="bib-campo"><span>Duración</span><select value={filtros.duracion} onChange={e => filtrar({ duracion: e.target.value })}>{DURACIONES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
              <label className="bib-campo"><span>Objetivo</span><select value={filtros.objetivo} onChange={e => filtrar({ objetivo: e.target.value })}><option value="">Todos</option>{opcionesObjetivo.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
            </> : <>
              <label className="bib-campo"><span>Grupo muscular</span><select value={filtros.musculo} onChange={e => filtrar({ musculo: e.target.value })}><option value="">Todos</option>{opcionesMusculo.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="bib-campo"><span>Material</span><select value={filtros.material} onChange={e => filtrar({ material: e.target.value })}><option value="">Todos</option>{opcionesMaterial.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
            </>}
            <button type="button" className="bib-solo-favoritos" aria-pressed={filtros.soloFavoritos} onClick={() => filtrar({ soloFavoritos: !filtros.soloFavoritos })}>{filtros.soloFavoritos ? '★' : '☆'} Favoritos</button>
            {filtrosActivos && <button type="button" className="bib-limpiar" onClick={() => setFiltros(f => ({ ...FILTROS_VACIOS, carpeta: f.carpeta }))}>Limpiar filtros</button>}
          </div>

          {faltan > 0 && !estado.cargando && <div className="bib-set-inicial"><span>Hay {faltan} jugada{faltan > 1 ? 's' : ''} de ejemplo para cargar (salida con 3, lateral por dentro, presión alta y córners), cada una en su carpeta.</span>
            <button type="button" disabled={ocupado} onClick={setInicial}>{ocupado ? 'Cargando…' : 'Cargar jugadas de ejemplo'}</button></div>}

          {estado.cargando && <EstadoContenido estado="cargando" titulo="Cargando biblioteca" />}
          {!estado.cargando && estado.error && <EstadoContenido estado={estado.error.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la biblioteca" mensaje={estado.error.message} onReintentar={cargar} />}
          {!estado.cargando && !estado.error && visibles.length === 0 && <EstadoContenido estado="vacio"
            titulo={delAmbito.length ? 'Nada para estos filtros' : ambito === 'gimnasio' ? 'Gimnasio todavía está vacío' : 'Todavía no hay ejercicios de cancha'}
            mensaje={delAmbito.length ? 'Probá con otra carpeta o limpiá los filtros.' : editable ? 'Cargá el primero con “+ Nuevo”.' : 'Cuando el cuerpo técnico cargue ejercicios, aparecen acá.'} />}

          <div className="bib-tarjetas">
            {!estado.cargando && !estado.error && visibles.map(e => <article key={e.id} className="bib-tarjeta">
              <button type="button" className="bib-tarjeta-vista" aria-label={`Ver ${e.contenido || 'ejercicio'}`} onClick={() => setFicha(e)}><Vista e={e} /></button>
              <button type="button" className="bib-favorito bib-favorito-tarjeta" aria-pressed={favoritos.has(e.id)} aria-label={favoritos.has(e.id) ? `Quitar ${e.contenido} de favoritos` : `Marcar ${e.contenido} como favorito`} onClick={() => favorito(e)}>{favoritos.has(e.id) ? '★' : '☆'}</button>
              <div className="bib-tarjeta-texto">
                <p>{nombreCarpeta(e)}{e.ambito === 'cancha' && e.tipo === 'jugada' ? ' · Jugada' : ''}</p>
                <h3>{e.contenido || 'Ejercicio sin nombre'}</h3>
                <div className="bib-chips">
                  {e.cantidad_jugadores && <span>{e.cantidad_jugadores} jug.</span>}
                  {e.duracion_minutos && <span>{e.duracion_minutos} min</span>}
                  {(e.musculos || []).slice(0, 3).map(m => <span key={m}>{m}</span>)}
                  {(e.material || []).slice(0, 2).map(m => <span key={m} className="bib-chip-material">{m}</span>)}
                </div>
                {e.objetivo && <small>{e.objetivo}</small>}
              </div>
              {editable && <div className="bib-tarjeta-acciones">
                <button type="button" aria-label={`Editar ${e.contenido}`} onClick={() => { setFicha(null); setEditor(formDe(e)) }}>Editar</button>
                <button type="button" aria-label={`Duplicar ${e.contenido}`} onClick={() => { setFicha(null); setEditor({ ...formDe(e), id: undefined, pizarra_revision: undefined, contenido: `${e.contenido || 'Ejercicio'} (copia)` }) }}>Duplicar</button>
                <button type="button" className="bib-peligro" aria-label={`Eliminar ${e.contenido}`} onClick={() => eliminar(e)}>Eliminar</button>
              </div>}
            </article>)}
          </div>
        </main>
      </div>
    </div>
    {ficha && <Ficha e={ficha} carpeta={nombreCarpeta(ficha)} editable={puedeEditar(rol, ficha.ambito)} favorito={favoritos.has(ficha.id)} onFavorito={() => favorito(ficha)}
      onEditar={() => { setEditor(formDe(ficha)); setFicha(null) }} onCerrar={() => setFicha(null)} />}
  </div>
}
