import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { CAMPOS_BLOQUE, CAMPOS_EJERCICIO, cargarSemana, copiarSemana, copiarSesion, eliminarSesion,
  fechaArgentina, guardarSesion, inicioSemana, mensajePlanificacion, moverElemento, nuevaSesion,
  nuevoBloque, nuevoEjercicio, puedePlanificar, sumarDias } from '../utils/planificacion'
import './planificacion.css'

const fechaTexto = (f) => new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`))
const etiquetas = { objetivo: 'Objetivo', duracion: 'Duración (min)', indicaciones: 'Indicaciones', series: 'Series', repeticiones: 'Repeticiones', materiales: 'Materiales', imagen_url: 'Imagen', link_video: 'Video' }

function Campo({ titulo, valor, cambiar, tipo = 'text', ...props }) {
  return <label className="planificacion-campo"><span>{titulo}</span><input type={tipo} value={valor ?? ''} onChange={(e) => cambiar(e.target.value)} {...props} /></label>
}

function Visibilidad({ item, campos, cambiar }) {
  return <details className="planificacion-compartir">
    <summary>Qué ven las jugadoras</summary>
    <label><input type="checkbox" checked={item.visible === true} onChange={(e) => cambiar({ ...item, visible: e.target.checked })} /> Compartir este contenido al publicar</label>
    <p>El nombre se comparte. Elegí los demás datos; las notas internas nunca se comparten.</p>
    <div className="planificacion-fila">{campos.map((campo) => <label key={campo}>
      <input type="checkbox" checked={item.campos_publicos?.includes(campo) || false} onChange={(e) => cambiar({ ...item,
        campos_publicos: e.target.checked ? [...(item.campos_publicos || []), campo] : (item.campos_publicos || []).filter((c) => c !== campo) })} /> {etiquetas[campo]}
    </label>)}</div>
  </details>
}

function Orden({ indice, cantidad, mover, eliminar, nombre }) {
  return <div className="planificacion-fila">
    <button type="button" aria-label={`Subir ${nombre}`} disabled={indice === 0} onClick={() => mover(indice - 1)}>↑</button>
    <button type="button" aria-label={`Bajar ${nombre}`} disabled={indice === cantidad - 1} onClick={() => mover(indice + 1)}>↓</button>
    <button type="button" onClick={eliminar}>Quitar {nombre}</button>
  </div>
}

function BloqueEditor({ bloque, indice, total, cambiar, mover, quitar, biblioteca }) {
  function tarea(index, valor) { cambiar({ ...bloque, ejercicios: bloque.ejercicios.map((e, i) => i === index ? valor : e) }) }
  return <section className="planificacion-tarjeta planificacion-bloque">
    <div className="planificacion-fila planificacion-entre"><h3>Bloque {indice + 1}</h3>
      <Orden indice={indice} cantidad={total} nombre="bloque" mover={mover} eliminar={quitar} /></div>
    <div className="planificacion-rejilla">
      <Campo titulo="Nombre del bloque" valor={bloque.nombre} cambiar={(nombre) => cambiar({ ...bloque, nombre })} placeholder="Gimnasio, fútbol formal… o el nombre que necesites" />
      <Campo titulo="Objetivo" valor={bloque.objetivo} cambiar={(objetivo) => cambiar({ ...bloque, objetivo })} />
      <Campo titulo="Duración estimada (opcional, min)" tipo="number" min="0.1" max="1440" step="any" valor={bloque.duracion} cambiar={(duracion) => cambiar({ ...bloque, duracion })} />
    </div>
    <Campo titulo="Indicaciones para compartir" valor={bloque.indicaciones} cambiar={(indicaciones) => cambiar({ ...bloque, indicaciones })} />
    <Campo titulo="Notas internas del bloque (privadas)" valor={bloque.notas_internas} cambiar={(notas_internas) => cambiar({ ...bloque, notas_internas })} />
    <Visibilidad item={bloque} campos={CAMPOS_BLOQUE} cambiar={cambiar} />
    {bloque.ejercicios.map((e, j) => <div className="planificacion-ejercicio" key={e.id}>
      <div className="planificacion-fila planificacion-entre"><strong>Tarea {j + 1}{e.biblioteca_id ? ' · Biblioteca' : ' · Libre'}</strong>
        {e.biblioteca_id && <button type="button" onClick={() => tarea(j, { ...e, biblioteca_id: null })}>Conservar como tarea libre</button>}
        <Orden indice={j} cantidad={bloque.ejercicios.length} nombre="tarea" mover={(hasta) => cambiar({ ...bloque, ejercicios: moverElemento(bloque.ejercicios, j, hasta) })}
          eliminar={() => cambiar({ ...bloque, ejercicios: bloque.ejercicios.filter((_, i) => i !== j) })} /></div>
      <Campo titulo="Nombre" valor={e.nombre} cambiar={(nombre) => tarea(j, { ...e, nombre })} />
      <details><summary>Detalles de la tarea (opcionales)</summary><div className="planificacion-rejilla">
        {CAMPOS_EJERCICIO.map((campo) => <Campo key={campo} titulo={etiquetas[campo]} tipo={campo === 'duracion' ? 'number' : 'text'}
          valor={e[campo]} cambiar={(valor) => tarea(j, { ...e, [campo]: valor })} {...(campo === 'duracion' ? { min: '0.1', max: '1440', step: 'any' } : {})} />)}
      </div><Campo titulo="Notas internas de la tarea (privadas)" valor={e.notas_internas} cambiar={(notas_internas) => tarea(j, { ...e, notas_internas })} /></details>
      <Visibilidad item={e} campos={CAMPOS_EJERCICIO} cambiar={(valor) => tarea(j, valor)} />
    </div>)}
    <div className="planificacion-fila">
      <button type="button" onClick={() => cambiar({ ...bloque, ejercicios: [...bloque.ejercicios, nuevoEjercicio()] })}>+ Tarea libre</button>
      <label className="planificacion-campo"><span>Reutilizar ejercicio existente</span>
        <select value="" onChange={(event) => {
          const elegido = biblioteca.find((e) => e.id === event.target.value)
          if (elegido) cambiar({ ...bloque, ejercicios: [...bloque.ejercicios, nuevoEjercicio(elegido)] })
        }}><option value="">Elegir de la biblioteca…</option>{biblioteca.map((e) => <option key={e.id} value={e.id}>{e.contenido || 'Ejercicio'} · {e.descripcion.slice(0, 90)}</option>)}</select>
      </label>
    </div>
  </section>
}

export default function PlanificacionSection({ perfil, fechaInicial, categoriaInicial, onVerAsistencia }) {
  const hoy = fechaArgentina()
  const [lunes, setLunes] = useState(() => inicioSemana(fechaInicial || hoy))
  const [categoriaId, setCategoriaId] = useState(() => perfil?.rol === 'coordinacion' ? categoriaInicial || '' : perfil?.categoria_id || '')
  const [categorias, setCategorias] = useState([])
  const [biblioteca, setBiblioteca] = useState([])
  const [bibliotecaError, setBibliotecaError] = useState('')
  const [sesiones, setSesiones] = useState([])
  const [reales, setReales] = useState([])
  const [form, setForm] = useState(null)
  const [sucio, setSucio] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [conflicto, setConflicto] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [destinoSemana, setDestinoSemana] = useState(() => sumarDias(lunes, 7))
  const [fechaCopia, setFechaCopia] = useState(hoy)
  const [realError, setRealError] = useState('')
  const peticion = useRef(0)
  const enCurso = useRef(false)
  const rolPermitido = ['coordinacion', 'tecnico', 'preparador_fisico'].includes(perfil?.rol)
  const autorizado = puedePlanificar(perfil, categoriaId)

  const cargarBiblioteca = useCallback(async () => {
    const { data, error: fallo } = await supabase.from('biblioteca').select('id,contenido,descripcion,imagen_url,link_video').order('contenido')
    setBiblioteca(data || [])
    setBibliotecaError(fallo ? 'No se pudo leer la biblioteca. Podés usar tareas libres y reintentar.' : '')
  }, [])

  useEffect(() => {
    if (!rolPermitido) return
    let activo = true
    async function cargar() {
      const [{ data, error: fallo }, bibliotecaRes] = await Promise.all([
        supabase.from('categorias').select('id,nombre,orden').order('orden'),
        supabase.from('biblioteca').select('id,contenido,descripcion,imagen_url,link_video').order('contenido'),
      ])
      if (activo) {
        setCategorias(data || [])
        if (fallo) setError('No se pudieron cargar las categorías.')
        setBiblioteca(bibliotecaRes.data || [])
        setBibliotecaError(bibliotecaRes.error ? 'No se pudo leer la biblioteca. Podés usar tareas libres y reintentar.' : '')
      }
    }
    void cargar()
    return () => { activo = false }
  }, [rolPermitido])

  useEffect(() => {
    if (!categoriaId || !autorizado) return
    let activo = true
    const numero = ++peticion.current
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const data = await cargarSemana(supabase, categoriaId, lunes)
        if (activo && numero === peticion.current) setSesiones(data)
      } catch (fallo) {
        if (activo) { setSesiones([]); setError(mensajePlanificacion(fallo)) }
      } finally { if (activo) setCargando(false) }
      const { data, error: fallo } = await supabase.from('entrenamiento_bloques').select('id,fecha,descripcion').eq('categoria_id', categoriaId).gte('fecha', lunes).lte('fecha', sumarDias(lunes, 6)).order('fecha')
      if (activo && numero === peticion.current) { setReales(data || []); setRealError(fallo ? 'No se pudieron leer los entrenamientos registrados. El vínculo es opcional.' : '') }
    }
    void cargar()
    return () => { activo = false }
  }, [categoriaId, lunes, recarga, autorizado])

  function puedeSalir() { return !sucio || window.confirm('Hay cambios sin guardar. ¿Querés descartarlos?') }
  function abrir(valor) {
    if (!puedeSalir()) return
    setForm(structuredClone(valor)); setSucio(false); setConflicto(false); setError(''); setMensaje(''); setFechaCopia(sumarDias(valor.fecha, 1))
  }
  function cambiar(valor) { setForm(valor); setSucio(true); setMensaje('') }
  function navegar(semana, categoria = categoriaId) {
    if (!puedeSalir()) return
    setForm(null); setSucio(false); setSesiones([]); setReales([]); setLunes(semana); setCategoriaId(categoria); setConflicto(false); setError(''); setMensaje('')
  }
  async function operacion(fn) {
    if (enCurso.current) return
    enCurso.current = true; setOcupado(true); setError(''); setMensaje('')
    try { await fn() } catch (fallo) {
      setError(mensajePlanificacion(fallo))
      // Validaciones rechazadas antes de escribir pueden corregirse sin perder el formulario.
      // Un conflicto o resultado incierto exige recarga y nunca se reintenta automáticamente.
      if (!['VALIDACION_LOCAL', '22023', '23503', '23514', '22007', '22008', '22P02', '42501'].includes(fallo?.code)) setConflicto(true)
    } finally { enCurso.current = false; setOcupado(false) }
  }
  function guardar(estado = form.estado) {
    void operacion(async () => {
      const guardada = await guardarSesion(supabase, { ...form, estado })
      setForm(guardada); setSucio(false); setRecarga((n) => n + 1)
      if (inicioSemana(guardada.fecha) !== lunes) { setLunes(inicioSemana(guardada.fecha)); setSesiones([]) }
      setMensaje(estado === 'publicado' ? 'Planificación publicada. En Wellness sólo se mostrará el contenido visible.' : 'Borrador guardado. No se muestra a las jugadoras.')
    })
  }
  function recargar() {
    if (!puedeSalir()) return
    setForm(null); setSucio(false); setConflicto(false); setRecarga((n) => n + 1)
  }

  if (!rolPermitido) return <p className="p-6">Tu perfil no tiene acceso a la planificación.</p>
  if (perfil.rol !== 'coordinacion' && !perfil.categoria_id) return <p className="p-6">Necesitás una categoría asignada en tu perfil para planificar.</p>

  return <div className="planificacion p-4 md:p-8">
    <header className="planificacion-fila planificacion-entre"><div><h1>Planificación semanal</h1><p>Lo previsto, separado de la asistencia y la carga real. Podés guardar aunque falten datos.</p></div></header>
    <fieldset disabled={ocupado} className="planificacion-fila planificacion-tarjeta">
      <label className="planificacion-campo"><span>Categoría</span><select value={categoriaId} disabled={perfil.rol !== 'coordinacion'} onChange={(e) => navegar(lunes, e.target.value)}>
        <option value="">Elegir categoría…</option>{categorias.filter((c) => perfil.rol === 'coordinacion' || c.id === perfil.categoria_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select></label>
      <button type="button" onClick={() => navegar(sumarDias(lunes, -7))}>← Anterior</button>
      <strong>{fechaTexto(lunes)} — {fechaTexto(sumarDias(lunes, 6))}</strong>
      <button type="button" onClick={() => navegar(sumarDias(lunes, 7))}>Siguiente →</button>
      <button type="button" onClick={() => navegar(inicioSemana(hoy))}>Esta semana</button>
    </fieldset>
    {error && <p role="alert" className="planificacion-error">{error}</p>}
    {mensaje && <p role="status" className="planificacion-exito">{mensaje}</p>}
    <button type="button" disabled={ocupado || !categoriaId} onClick={recargar}>Recargar semana{conflicto ? ' y descartar el editor' : ''}</button>
    {cargando && <p role="status">Cargando planificación…</p>}
    {categoriaId && autorizado && <>
      <div className="planificacion-semana" aria-label="Calendario de lunes a domingo">{Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).map((dia) => <section key={dia} className={`planificacion-dia ${dia === hoy ? 'planificacion-hoy' : ''}`}>
        <h2>{fechaTexto(dia)}</h2>
        {sesiones.filter((s) => s.fecha === dia).map((s) => <button key={s.id} type="button" disabled={ocupado || cargando} className="planificacion-resumen" onClick={() => abrir(s)}>
          <strong>{s.hora?.slice(0, 5) || 'Sin horario'} · {s.tipo}</strong><span>{s.objetivo || 'Sesión sin objetivo cargado'}</span>
          <span>{s.estado === 'publicado' ? 'Publicado' : 'Borrador'} · {s.bloques.length} bloque(s)</span>
        </button>)}
        <button type="button" disabled={ocupado || cargando} onClick={() => abrir(nuevaSesion(dia, categoriaId))}>+ Sesión</button>
      </section>)}</div>
      <details className="planificacion-tarjeta"><summary>Duplicar esta semana</summary>
        <p>Agrega copias como borradores; no reemplaza sesiones existentes ni crea asistencia o cargas.</p>
        <fieldset disabled={ocupado || cargando}><div className="planificacion-fila">
          <Campo titulo="Semana de destino (cualquier día)" tipo="date" valor={destinoSemana} cambiar={setDestinoSemana} />
          <button type="button" disabled={!destinoSemana || inicioSemana(destinoSemana) === lunes} onClick={() => {
            if (!puedeSalir() || !window.confirm('¿Duplicar todas las sesiones guardadas de esta semana como borradores?')) return
            void operacion(async () => {
              const n = await copiarSemana(supabase, categoriaId, lunes, inicioSemana(destinoSemana))
              setForm(null); setSucio(false); setLunes(inicioSemana(destinoSemana)); setSesiones([]); setMensaje(`${n} sesión(es) copiadas como borradores.`)
            })
          }}>Duplicar semana</button>
        </div></fieldset>
      </details>
    </>}
    {form && autorizado && <form className="planificacion-editor" onSubmit={(e) => { e.preventDefault(); guardar() }}>
      <fieldset disabled={ocupado}>
        <div className="planificacion-fila planificacion-entre"><h2>{form.id ? 'Editar sesión' : 'Nueva sesión'} · {form.estado === 'publicado' ? 'Publicada' : 'Borrador'}</h2>
          <button type="button" onClick={() => { if (puedeSalir()) { setForm(null); setSucio(false) } }}>Cerrar editor</button></div>
        <p>Sólo la fecha y categoría son indispensables. Los cambios de una sesión publicada se comparten al guardar.</p>
        <div className="planificacion-rejilla">
          <Campo titulo="Fecha" tipo="date" required valor={form.fecha} cambiar={(fecha) => cambiar({ ...form, fecha, entrenamiento_real_id: null })} />
          <label className="planificacion-campo"><span>Tipo de jornada</span><select value={form.tipo} onChange={(e) => cambiar({ ...form, tipo: e.target.value })}>
            <option value="entrenamiento">Entrenamiento</option><option value="descanso">Descanso</option><option value="partido">Partido</option>
          </select></label>
          <Campo titulo="Horario (opcional)" tipo="time" valor={form.hora} cambiar={(hora) => cambiar({ ...form, hora })} />
          <Campo titulo="Objetivo general" valor={form.objetivo} cambiar={(objetivo) => cambiar({ ...form, objetivo })} />
        </div>
        <details className="planificacion-tarjeta"><summary>Lugar, responsable, notas y vínculo con lo realizado</summary><div className="planificacion-rejilla">
          <Campo titulo="Lugar" valor={form.lugar} cambiar={(lugar) => cambiar({ ...form, lugar })} />
          <Campo titulo="Responsable (interno)" valor={form.responsable} cambiar={(responsable) => cambiar({ ...form, responsable })} />
        </div><label className="planificacion-campo"><span>Observaciones internas de la sesión (privadas)</span>
          <textarea rows={2} value={form.observaciones_internas} onChange={(e) => cambiar({ ...form, observaciones_internas: e.target.value })} />
        </label>
          {realError && <p>{realError}</p>}
          <label className="planificacion-campo"><span>Vincular a un bloque de entrenamiento registrado (opcional)</span><select value={form.entrenamiento_real_id || ''} onChange={(e) => cambiar({ ...form, entrenamiento_real_id: e.target.value || null })}>
            <option value="">Sin vínculo</option>{reales.filter((r) => r.fecha === form.fecha).map((r) => <option key={r.id} value={r.id}>{r.descripcion}</option>)}
          </select></label><p>No se modifica el registro real. La asistencia sigue consultándose por categoría y fecha.</p>
        </details>
        {bibliotecaError && <p role="alert">{bibliotecaError} <button type="button" onClick={cargarBiblioteca}>Reintentar biblioteca</button></p>}
        {form.bloques.map((b, i) => <BloqueEditor key={b.id} bloque={b} indice={i} total={form.bloques.length} biblioteca={biblioteca}
          cambiar={(valor) => cambiar({ ...form, bloques: form.bloques.map((x, j) => i === j ? valor : x) })}
          mover={(hasta) => cambiar({ ...form, bloques: moverElemento(form.bloques, i, hasta) })}
          quitar={() => cambiar({ ...form, bloques: form.bloques.filter((_, j) => j !== i) })} />)}
        <button type="button" onClick={() => cambiar({ ...form, bloques: [...form.bloques, nuevoBloque()] })}>+ Agregar bloque libre</button>
        <p>En Wellness sólo aparecen bloques marcados para compartir y con contenido. Las tareas también deben estar habilitadas. Las notas internas nunca se muestran.</p>
        <div className="planificacion-fila planificacion-acciones">
          <button className="planificacion-primario" type="submit" disabled={conflicto}>Guardar {form.estado === 'borrador' ? 'borrador' : 'cambios'}</button>
          <button type="button" disabled={conflicto} onClick={() => guardar(form.estado === 'publicado' ? 'borrador' : 'publicado')}>{form.estado === 'publicado' ? 'Retirar publicación' : 'Publicar'}</button>
          {onVerAsistencia && <button type="button" onClick={() => { if (puedeSalir()) onVerAsistencia(form.fecha, categoriaId) }}>Ver asistencia real de este día</button>}
          {form.id && <button type="button" disabled={conflicto} onClick={() => {
            if (!window.confirm('¿Eliminar esta sesión planificada? No se eliminarán registros reales de asistencia ni cargas.')) return
            void operacion(async () => { await eliminarSesion(supabase, form); setForm(null); setSucio(false); setRecarga((n) => n + 1); setMensaje('Sesión planificada eliminada.') })
          }}>Eliminar sesión</button>}
        </div>
        <details className="planificacion-tarjeta"><summary>Duplicar / copiar esta sesión a otro día</summary><div className="planificacion-fila">
          <Campo titulo="Fecha de la copia" tipo="date" valor={fechaCopia} cambiar={setFechaCopia} />
          <button type="button" disabled={!fechaCopia || conflicto} onClick={() => {
            void operacion(async () => {
              const copia = await guardarSesion(supabase, copiarSesion(form, fechaCopia))
              setForm(copia); setSucio(false); setLunes(inicioSemana(copia.fecha)); setRecarga((n) => n + 1); setMensaje('Copia guardada como borrador. La sesión original no cambió.')
            })
          }}>Guardar copia como borrador</button>
        </div></details>
      </fieldset>
    </form>}
  </div>
}
