
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const AMARILLO = '#F2C230'
const PANEL = '#151D29'
const BORDE = '#2A3548'
const TEXTO = '#F0F2F5'
const SECUNDARIO = '#8A9BB8'
const FONDO = '#0F1419'

const CATEGORIA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const TIPOS = [
  'Pase correcto',
  'Pase incorrecto',
  'Pérdida',
  'Recuperación',
  'Remate',
  'Centro',
  'Duelo ofensivo',
  'Duelo defensivo',
  'Duelo aéreo',
  'Atajada',
  'Salida de arquera',
  'Gol',
  'Falta cometida',
  'Falta recibida',
  'Intercepción',
]

const ZONAS = [
  'Defensa izquierda',
  'Defensa centro',
  'Defensa derecha',
  'Medio izquierda',
  'Medio centro',
  'Medio derecha',
  'Ataque izquierda',
  'Ataque centro',
  'Ataque derecha',
]

const RESULTADOS = [
  'Exitoso',
  'Fallido',
  'Neutro',
  'Gol',
  'Atajada',
  'Fuera',
  'Bloqueado',
]

const inputClass =
  'w-full rounded-xl border p-3 text-sm outline-none focus:ring-1'

const inputStyle = {
  backgroundColor: FONDO,
  borderColor: BORDE,
  color: TEXTO,
}

function Boton({ children, onClick, disabled = false, secundario = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-3 text-sm font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      style={
        secundario
          ? { backgroundColor: '#202A38', color: TEXTO, border: `1px solid ${BORDE}` }
          : { backgroundColor: AMARILLO, color: '#171717' }
      }
    >
      {children}
    </button>
  )
}

function Campo({ label, children }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function youtubeEmbed(url) {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    let id = ''

    if (parsed.hostname.includes('youtu.be')) {
      id = parsed.pathname.split('/').filter(Boolean)[0] || ''
    } else if (
      parsed.hostname.includes('youtube.com') ||
      parsed.hostname.includes('youtube-nocookie.com')
    ) {
      if (parsed.pathname === '/watch') {
        id = parsed.searchParams.get('v') || ''
      } else {
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(parts[0])) {
          id = parts[1] || ''
        }
      }
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return ''
    return `https://www.youtube-nocookie.com/embed/${id}`
  } catch {
    return ''
  }
}

function formatearTiempo(segundos) {
  const total = Math.max(0, Number(segundos) || 0)
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

export default function AnalisisSection() {
  const [usuario, setUsuario] = useState(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const [partidos, setPartidos] = useState([])
  const [eventos, setEventos] = useState([])
  const [jugadoras, setJugadoras] = useState([])
  const [partidoId, setPartidoId] = useState('')

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [rival, setRival] = useState('')
  const [fecha, setFecha] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [notas, setNotas] = useState('')

  const [tipo, setTipo] = useState('Pase correcto')
  const [jugadorId, setJugadorId] = useState('')
  const [segundo, setSegundo] = useState('0')
  const [zona, setZona] = useState('Medio centro')
  const [resultado, setResultado] = useState('Exitoso')
  const [observaciones, setObservaciones] = useState('')

  const [filtroJugador, setFiltroJugador] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [seccion, setSeccion] = useState('video')

  const partidoActual = partidos.find((p) => p.id === partidoId)
  const videoActual = youtubeEmbed(partidoActual?.video_url)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError

      const authUser = authData?.user

      if (!authUser?.email) {
        setUsuario(null)
        setEsAdmin(false)
        setPartidos([])
        setEventos([])
        setJugadoras([])
        setError('Iniciá sesión para consultar Análisis.')
        return
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('email, nombre, rol, categoria_id')
        .eq('email', authUser.email)
        .maybeSingle()

      if (perfilError) throw perfilError

      setUsuario(perfil || null)

      const admin =
        perfil?.rol === 'coordinacion' &&
        perfil?.nombre?.trim().toLowerCase() === 'kevin garay' &&
        perfil?.email?.toLowerCase() === authUser.email.toLowerCase()

      setEsAdmin(Boolean(admin))

      const { data: lista, error: partidosError } = await supabase
        .from('analisis_partidos')
        .select('*')
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (partidosError) throw partidosError

      const listaPartidos = lista || []
      setPartidos(listaPartidos)

      if (!listaPartidos.length) {
        setEventos([])
        setJugadoras([])
        setPartidoId('')
        return
      }

      const ids = listaPartidos.map((p) => p.id)

      const { data: listaEventos, error: eventosError } = await supabase
        .from('analisis_eventos')
        .select('*')
        .in('partido_id', ids)
        .order('segundo', { ascending: true })

      if (eventosError) throw eventosError
      setEventos(listaEventos || [])

      const categoriaIds = [
        ...new Set(listaPartidos.map((p) => p.categoria_id).filter(Boolean)),
      ]

      let listaJugadoras = []

      if (categoriaIds.length) {
        const { data: jugadoresData, error: jugadoresError } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, categoria_id, estado')
          .in('categoria_id', categoriaIds)
          .order('apellido', { ascending: true })

        if (jugadoresError) {
          console.warn('No se pudieron cargar las jugadoras:', jugadoresError)
        } else {
          listaJugadoras = jugadoresData || []
        }
      }

      setJugadoras(listaJugadoras)
      setPartidoId((actual) =>
        listaPartidos.some((p) => p.id === actual)
          ? actual
          : listaPartidos[0].id,
      )
    } catch (e) {
      console.error('Error en Análisis:', e)
      setError(e.message || 'No se pudieron cargar los datos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const eventosPartido = useMemo(
    () => eventos.filter((e) => e.partido_id === partidoId),
    [eventos, partidoId],
  )

  const eventosFiltrados = useMemo(
    () =>
      eventosPartido.filter(
        (e) =>
          (filtroJugador === 'todos' || e.jugador_id === filtroJugador) &&
          (filtroTipo === 'todos' || e.tipo === filtroTipo),
      ),
    [eventosPartido, filtroJugador, filtroTipo],
  )

  const estadisticas = useMemo(() => {
    const resultado = {}

    for (const evento of eventosPartido) {
      if (!resultado[evento.tipo]) {
        resultado[evento.tipo] = { total: 0, exitosos: 0, fallidos: 0 }
      }

      resultado[evento.tipo].total += 1

      if (['Exitoso', 'Gol', 'Atajada'].includes(evento.resultado)) {
        resultado[evento.tipo].exitosos += 1
      }

      if (['Fallido', 'Fuera', 'Bloqueado'].includes(evento.resultado)) {
        resultado[evento.tipo].fallidos += 1
      }
    }

    return Object.entries(resultado).sort((a, b) => b[1].total - a[1].total)
  }, [eventosPartido])

  const estadisticasJugadoras = useMemo(() => {
    const resultado = {}

    for (const evento of eventosPartido) {
      if (!evento.jugador_id) continue

      if (!resultado[evento.jugador_id]) {
        resultado[evento.jugador_id] = { total: 0, tipos: {} }
      }

      resultado[evento.jugador_id].total += 1
      resultado[evento.jugador_id].tipos[evento.tipo] =
        (resultado[evento.jugador_id].tipos[evento.tipo] || 0) + 1
    }

    return Object.entries(resultado)
      .map(([id, datos]) => ({
        id,
        ...datos,
        nombre:
          jugadoras.find((j) => j.id === id)?.nombre +
          ' ' +
          (jugadoras.find((j) => j.id === id)?.apellido || ''),
      }))
      .sort((a, b) => b.total - a.total)
  }, [eventosPartido, jugadoras])

  const estadisticasZonas = useMemo(
    () =>
      ZONAS.map((nombre) => ({
        nombre,
        total: eventosPartido.filter((e) => e.zona === nombre).length,
      })),
    [eventosPartido],
  )

  function limpiarFormulario() {
    setRival('')
    setFecha('')
    setVideoUrl('')
    setNotas('')
    setEditandoId(null)
  }

  function editarPartido(partido) {
    if (!esAdmin) return

    setEditandoId(partido.id)
    setRival(partido.rival || '')
    setFecha(partido.fecha || '')
    setVideoUrl(partido.video_url || '')
    setNotas(partido.notas || '')
    setMostrarFormulario(true)
    setError('')
    setMensaje('')
  }

  async function guardarPartido(e) {
    e.preventDefault()
    if (!esAdmin || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      if (!rival.trim()) {
        throw new Error('Ingresá el nombre del rival.')
      }

      if (videoUrl.trim() && !youtubeEmbed(videoUrl.trim())) {
        throw new Error('Ingresá un enlace válido de YouTube.')
      }

      const registro = {
        categoria_id: CATEGORIA_ID,
        rival: rival.trim(),
        fecha: fecha || null,
        video_url: videoUrl.trim() || null,
        notas: notas.trim() || null,
        creado_por: usuario?.email || null,
      }

      let respuesta

      if (editandoId) {
        respuesta = await supabase
          .from('analisis_partidos')
          .update(registro)
          .eq('id', editandoId)
          .select()
          .single()
      } else {
        respuesta = await supabase
          .from('analisis_partidos')
          .insert(registro)
          .select()
          .single()
      }

      if (respuesta.error) throw respuesta.error

      const idGuardado = respuesta.data.id

      limpiarFormulario()
      setMostrarFormulario(false)
      await cargarDatos()
      setPartidoId(idGuardado)
      setMensaje(editandoId ? 'Partido actualizado.' : 'Partido creado.')
    } catch (e) {
      setError(e.message || 'No se pudo guardar el partido.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarPartido(partido) {
    if (!esAdmin) return

    const confirmar = window.confirm(
      `¿Querés eliminar el análisis de ${partido.rival}? También se eliminarán sus eventos.`,
    )

    if (!confirmar) return

    setError('')
    setMensaje('')

    const { error: deleteError } = await supabase
      .from('analisis_partidos')
      .delete()
      .eq('id', partido.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setMensaje('Partido eliminado.')
    await cargarDatos()
  }

  async function guardarEvento(e) {
    e.preventDefault()
    if (!esAdmin || !partidoActual || guardando) return

    setGuardando(true)
    setError('')
    setMensaje('')

    try {
      const tiempo = Number(segundo)

      if (!Number.isInteger(tiempo) || tiempo < 0) {
        throw new Error('El tiempo debe ser un número entero de segundos.')
      }

      if (jugadorId && !jugadoras.some((j) => j.id === jugadorId)) {
        throw new Error('La jugadora seleccionada no está disponible.')
      }

      const { error: insertError } = await supabase
        .from('analisis_eventos')
        .insert({
          partido_id: partidoId,
          jugador_id: jugadorId || null,
          segundo: tiempo,
          tipo,
          zona,
          resultado,
          observaciones: observaciones.trim() || null,
        })

      if (insertError) throw insertError

      setMensaje('Acción registrada correctamente.')
      setObservaciones('')

      const { data: listaEventos, error: refreshError } = await supabase
        .from('analisis_eventos')
        .select('*')
        .eq('partido_id', partidoId)
        .order('segundo', { ascending: true })

      if (refreshError) throw refreshError
      setEventos((actuales) => [
        ...actuales.filter((ev) => ev.partido_id !== partidoId),
        ...(listaEventos || []),
      ])
    } catch (e) {
      setError(e.message || 'No se pudo registrar la acción.')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarEvento(evento) {
    if (!esAdmin) return
    if (!window.confirm('¿Querés eliminar esta acción etiquetada?')) return

    const { error: deleteError } = await supabase
      .from('analisis_eventos')
      .delete()
      .eq('id', evento.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setEventos((actuales) => actuales.filter((e) => e.id !== evento.id))
    setMensaje('Acción eliminada.')
  }

  function imprimirInforme() {
    window.print()
  }

  if (cargando) {
    return (
      <div className="p-6 text-sm" style={{ color: SECUNDARIO }}>
        Cargando módulo de Análisis...
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6" style={{ color: TEXTO }}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p
            className="mb-2 text-xs font-bold uppercase tracking-widest"
            style={{ color: AMARILLO }}
          >
            VIDEOANÁLISIS · COMUNICACIONES
          </p>
          <h1 className="text-3xl font-bold">Análisis</h1>
          <p className="mt-2 text-sm" style={{ color: SECUNDARIO }}>
            Partidos, etiquetado, estadísticas e informes.
          </p>
          <p className="mt-2 text-xs" style={{ color: SECUNDARIO }}>
            {esAdmin
              ? 'Modo administrador · Podés gestionar los análisis.'
              : 'Modo consulta · Solo lectura.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Boton secundario onClick={cargarDatos}>
            Actualizar
          </Boton>
          {esAdmin && (
            <Boton
              onClick={() => {
                if (mostrarFormulario) {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                } else {
                  limpiarFormulario()
                  setMostrarFormulario(true)
                }
              }}
            >
              {mostrarFormulario ? 'Cancelar' : '+ Nuevo partido'}
            </Boton>
          )}
        </div>
      </header>

      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            backgroundColor: '#351D22',
            borderColor: '#85404B',
            color: '#FFD5DA',
          }}
        >
          {error}
        </div>
      )}

      {mensaje && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            backgroundColor: '#203326',
            borderColor: '#3B714A',
            color: '#D5F5DE',
          }}
        >
          {mensaje}
        </div>
      )}

      {mostrarFormulario && esAdmin && (
        <section
          className="rounded-2xl border p-5"
          style={{ backgroundColor: PANEL, borderColor: BORDE }}
        >
          <h2 className="mb-4 text-lg font-bold">
            {editandoId ? 'Editar partido' : 'Nuevo partido'}
          </h2>

          <form onSubmit={guardarPartido} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Rival">
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={rival}
                  onChange={(e) => setRival(e.target.value)}
                  placeholder="Nombre del rival"
                  required
                />
              </Campo>

              <Campo label="Fecha">
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Campo>

              <div className="md:col-span-2">
                <Campo label="Enlace de YouTube">
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </Campo>
              </div>

              <div className="md:col-span-2">
                <Campo label="Notas del partido">
                  <textarea
                    className={inputClass}
                    style={inputStyle}
                    rows={3}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Observaciones generales..."
                  />
                </Campo>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Boton disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar partido'}
              </Boton>
              <Boton
                secundario
                onClick={() => {
                  limpiarFormulario()
                  setMostrarFormulario(false)
                }}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        </section>
      )}

      <section
        className="rounded-2xl border p-5"
        style={{
          background: 'linear-gradient(135deg, #202A38 0%, #151D29 100%)',
          borderColor: BORDE,
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: AMARILLO, color: '#171717' }}
          >
            ▶
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">Biblioteca de análisis</h2>
            <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
              {partidos.length} partido{partidos.length === 1 ? '' : 's'} cargado
              {partidos.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border p-5"
        style={{ backgroundColor: PANEL, borderColor: BORDE }}
      >
        <h2 className="mb-4 font-bold">Partidos analizados</h2>

        {partidos.length === 0 ? (
          <p className="text-sm" style={{ color: SECUNDARIO }}>
            Todavía no hay partidos. Cuando cargues el primero, aparecerá acá.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {partidos.map((partido) => (
              <article
                key={partido.id}
                className="rounded-xl border p-4"
                style={{
                  backgroundColor:
                    partido.id === partidoId ? '#263449' : FONDO,
                  borderColor: partido.id === partidoId ? AMARILLO : BORDE,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPartidoId(partido.id)
                    setFiltroJugador('todos')
                    setFiltroTipo('todos')
                    setSeccion('video')
                    setError('')
                    setMensaje('')
                  }}
                  className="w-full text-left"
                >
                  <h3 className="font-bold">{partido.rival}</h3>
                  <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                    {partido.fecha || 'Fecha sin definir'}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: SECUNDARIO }}>
                    {eventos.filter((e) => e.partido_id === partido.id).length}{' '}
                    acciones etiquetadas
                  </p>
                </button>

                {esAdmin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editarPartido(partido)}
                      className="text-xs font-bold"
                      style={{ color: AMARILLO }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarPartido(partido)}
                      className="text-xs font-bold text-red-300"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {partidoActual && (
        <>
          <nav className="flex flex-wrap gap-2">
            {[
              ['video', 'Video y etiquetas'],
              ['estadisticas', 'Estadísticas'],
              ['mapa', 'Mapa de zonas'],
              ['informe', 'Informe'],
            ].map(([id, texto]) => (
              <button
                type="button"
                key={id}
                onClick={() => setSeccion(id)}
                className="rounded-xl border px-4 py-3 text-sm font-bold"
                style={{
                  backgroundColor: seccion === id ? AMARILLO : PANEL,
                  color: seccion === id ? '#171717' : TEXTO,
                  borderColor: seccion === id ? AMARILLO : BORDE,
                }}
              >
                {texto}
              </button>
            ))}
          </nav>

          {seccion === 'video' && (
            <div className="grid gap-5 xl:grid-cols-2">
              <section
                className="rounded-2xl border p-4 md:p-5"
                style={{ backgroundColor: PANEL, borderColor: BORDE }}
              >
                <h2 className="mb-3 text-lg font-bold">
                  {partidoActual.rival}
                </h2>

                {videoActual ? (
                  <div className="aspect-video overflow-hidden rounded-xl">
                    <iframe
                      title={`Video del partido contra ${partidoActual.rival}`}
                      src={videoActual}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p
                    className="rounded-xl border p-5 text-sm"
                    style={{
                      backgroundColor: FONDO,
                      borderColor: BORDE,
                      color: SECUNDARIO,
                    }}
                  >
                    Este partido no tiene un enlace de YouTube válido.
                  </p>
                )}

                {partidoActual.notas && (
                  <p className="mt-4 text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.notas}
                  </p>
                )}

                {partidoActual.video_url && (
                  <a
                    href={partidoActual.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm font-bold"
                    style={{ color: AMARILLO }}
                  >
                    Abrir video en YouTube ↗
                  </a>
                )}
              </section>

              <section
                className="rounded-2xl border p-4 md:p-5"
                style={{ backgroundColor: PANEL, borderColor: BORDE }}
              >
                <h2 className="mb-4 text-lg font-bold">Etiquetar acciones</h2>

                {esAdmin ? (
                  <form onSubmit={guardarEvento} className="space-y-4">
                    <Campo label="Acción">
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                      >
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Jugadora">
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={jugadorId}
                        onChange={(e) => setJugadorId(e.target.value)}
                      >
                        <option value="">Sin jugadora asignada</option>
                        {jugadoras.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.apellido}, {j.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo label="Tiempo (segundos)">
                        <input
                          className={inputClass}
                          style={inputStyle}
                          type="number"
                          min="0"
                          step="1"
                          value={segundo}
                          onChange={(e) => setSegundo(e.target.value)}
                          required
                        />
                        <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                          Tiempo mostrado: {formatearTiempo(segundo)}
                        </p>
                      </Campo>

                      <Campo label="Resultado">
                        <select
                          className={inputClass}
                          style={inputStyle}
                          value={resultado}
                          onChange={(e) => setResultado(e.target.value)}
                        >
                          {RESULTADOS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    </div>

                    <Campo label="Zona de la cancha">
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={zona}
                        onChange={(e) => setZona(e.target.value)}
                      >
                        {ZONAS.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Observaciones">
                      <textarea
                        className={inputClass}
                        style={inputStyle}
                        rows={2}
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        placeholder="Detalle opcional de la acción"
                      />
                    </Campo>

                    <Boton disabled={guardando}>
                      {guardando ? 'Guardando...' : 'Registrar acción'}
                    </Boton>
                  </form>
                ) : (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Esta sección es de consulta. Solo el administrador puede
                    registrar o modificar acciones.
                  </p>
                )}
              </section>

              <section
                className="rounded-2xl border p-4 md:p-5 xl:col-span-2"
                style={{ backgroundColor: PANEL, borderColor: BORDE }}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">
                    Acciones registradas ({eventosFiltrados.length})
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-lg border p-2 text-xs"
                      style={inputStyle}
                      value={filtroJugador}
                      onChange={(e) => setFiltroJugador(e.target.value)}
                    >
                      <option value="todos">Todas las jugadoras</option>
                      {jugadoras.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.apellido}, {j.nombre}
                        </option>
                      ))}
                    </select>

                    <select
                      className="rounded-lg border p-2 text-xs"
                      style={inputStyle}
                      value={filtroTipo}
                      onChange={(e) => setFiltroTipo(e.target.value)}
                    >
                      <option value="todos">Todas las acciones</option>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {eventosFiltrados.length === 0 ? (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    No hay acciones para mostrar con estos filtros.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <thead>
                        <tr style={{ color: SECUNDARIO }}>
                          <th className="p-2">Tiempo</th>
                          <th className="p-2">Acción</th>
                          <th className="p-2">Jugadora</th>
                          <th className="p-2">Zona</th>
                          <th className="p-2">Resultado</th>
                          {esAdmin && <th className="p-2">Acción</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {eventosFiltrados.map((ev) => {
                          const jugadora = jugadoras.find(
                            (j) => j.id === ev.jugador_id,
                          )

                          return (
                            <tr
                              key={ev.id}
                              className="border-t"
                              style={{ borderColor: BORDE }}
                            >
                              <td className="p-2 font-mono">
                                {formatearTiempo(ev.segundo)}
                              </td>
                              <td className="p-2">{ev.tipo}</td>
                              <td className="p-2">
                                {jugadora
                                  ? `${jugadora.nombre} ${jugadora.apellido}`
                                  : '—'}
                              </td>
                              <td className="p-2">{ev.zona || '—'}</td>
                              <td className="p-2">{ev.resultado || '—'}</td>
                              {esAdmin && (
                                <td className="p-2">
                                  <button
                                    type="button"
                                    onClick={() => eliminarEvento(ev)}
                                    className="text-xs font-bold text-red-300"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {seccion === 'estadisticas' && (
            <section
              className="space-y-5 rounded-2xl border p-5"
              style={{ backgroundColor: PANEL, borderColor: BORDE }}
            >
              <h2 className="text-xl font-bold">
                Estadísticas · {partidoActual.rival}
              </h2>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Acciones totales', eventosPartido.length],
                  [
                    'Jugadoras registradas',
                    new Set(
                      eventosPartido
                        .map((e) => e.jugador_id)
                        .filter(Boolean),
                    ).size,
                  ],
                  ['Zonas utilizadas', new Set(eventosPartido.map((e) => e.zona).filter(Boolean)).size],
                ].map(([label, valor]) => (
                  <div
                    key={label}
                    className="rounded-xl border p-4"
                    style={{ backgroundColor: FONDO, borderColor: BORDE }}
                  >
                    <p className="text-sm" style={{ color: SECUNDARIO }}>
                      {label}
                    </p>
                    <p
                      className="mt-2 text-3xl font-bold"
                      style={{ color: AMARILLO }}
                    >
                      {valor}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="mb-3 font-bold">Acciones por tipo</h3>
                {estadisticas.length === 0 ? (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Todavía no hay acciones etiquetadas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {estadisticas.map(([nombre, datos]) => (
                      <div key={nombre}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <span>{nombre}</span>
                          <span className="font-bold">{datos.total}</span>
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full"
                          style={{ backgroundColor: '#303B4D' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: AMARILLO,
                              width: `${
                                (datos.total /
                                  Math.max(
                                    ...estadisticas.map(([, d]) => d.total),
                                  )) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs" style={{ color: SECUNDARIO }}>
                          Exitosos: {datos.exitosos} · Fallidos: {datos.fallidos}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 font-bold">Acciones por jugadora</h3>
                {estadisticasJugadoras.length === 0 ? (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    No hay acciones asignadas a jugadoras.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr style={{ color: SECUNDARIO }}>
                          <th className="p-2">Jugadora</th>
                          <th className="p-2">Acciones</th>
                          <th className="p-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estadisticasJugadoras.map((j) => (
                          <tr
                            key={j.id}
                            className="border-t"
                            style={{ borderColor: BORDE }}
                          >
                            <td className="p-2 font-bold">{j.nombre}</td>
                            <td className="p-2">{j.total}</td>
                            <td className="p-2">
                              {Object.entries(j.tipos)
                                .map(([t, n]) => `${t}: ${n}`)
                                .join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {seccion === 'mapa' && (
            <section
              className="rounded-2xl border p-5"
              style={{ backgroundColor: PANEL, borderColor: BORDE }}
            >
              <h2 className="mb-2 text-xl font-bold">Mapa de zonas</h2>
              <p className="mb-5 text-sm" style={{ color: SECUNDARIO }}>
                Distribución de las acciones registradas por zona. Es un mapa
                zonal de nueve sectores, no un seguimiento de coordenadas GPS.
              </p>

              <div
                className="mx-auto grid max-w-3xl grid-cols-3 overflow-hidden rounded-xl border"
                style={{ borderColor: '#A3B0A0' }}
              >
                {estadisticasZonas.map((z) => {
                  const maximo = Math.max(
                    1,
                    ...estadisticasZonas.map((item) => item.total),
                  )
                  const intensidad = z.total / maximo

                  return (
                    <div
                      key={z.nombre}
                      className="flex min-h-28 flex-col items-center justify-center border p-3 text-center"
                      style={{
                        borderColor: '#A3B0A0',
                        backgroundColor:
                          z.total === 0
                            ? '#233A36'
                            : `rgba(242, 194, 48, ${0.18 + intensidad * 0.72})`,
                        color: z.total === 0 ? TEXTO : '#171717',
                      }}
                    >
                      <span className="text-xs font-semibold">{z.nombre}</span>
                      <span className="mt-2 text-2xl font-bold">{z.total}</span>
                      <span className="text-xs">acciones</span>
                    </div>
                  )
                })}
              </div>

              <p className="mt-4 text-xs" style={{ color: SECUNDARIO }}>
                Para que el mapa sea representativo, mantené el mismo criterio
                al etiquetar las zonas en todos los partidos.
              </p>
            </section>
          )}

          {seccion === 'informe' && (
            <section
              className="space-y-5 rounded-2xl border p-5"
              style={{ backgroundColor: PANEL, borderColor: BORDE }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">
                    Informe del partido
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.rival} · {partidoActual.fecha || 'Sin fecha'}
                  </p>
                </div>
                <Boton onClick={imprimirInforme}>Imprimir / Guardar PDF</Boton>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: FONDO, borderColor: BORDE }}
                >
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Total de acciones
                  </p>
                  <p className="mt-1 text-3xl font-bold" style={{ color: AMARILLO }}>
                    {eventosPartido.length}
                  </p>
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: FONDO, borderColor: BORDE }}
                >
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    Acciones con jugadora asignada
                  </p>
                  <p className="mt-1 text-3xl font-bold" style={{ color: AMARILLO }}>
                    {eventosPartido.filter((e) => e.jugador_id).length}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-bold">Resumen por acción</h3>
                {estadisticas.length ? (
                  <ul className="space-y-2 text-sm">
                    {estadisticas.map(([nombre, datos]) => (
                      <li
                        key={nombre}
                        className="flex justify-between gap-3 border-b pb-2"
                        style={{ borderColor: BORDE }}
                      >
                        <span>{nombre}</span>
                        <span className="font-bold">{datos.total}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: SECUNDARIO }}>
                    No hay información suficiente para generar el resumen.
                  </p>
                )}
              </div>

              {partidoActual.notas && (
                <div>
                  <h3 className="mb-2 font-bold">Observaciones generales</h3>
                  <p className="whitespace-pre-wrap text-sm" style={{ color: SECUNDARIO }}>
                    {partidoActual.notas}
                  </p>
                </div>
              )}

              <p className="text-xs" style={{ color: SECUNDARIO }}>
                Este informe utiliza los eventos guardados en la base de datos.
                La impresión permite guardarlo como PDF desde el navegador.
              </p>
            </section>
          )}
        </>
      )}

      <footer className="border-t pt-4 text-xs" style={{ borderColor: BORDE, color: SECUNDARIO }}>
        {esAdmin
          ? 'Administrador: Kevin Garay · Gestión de análisis'
          : 'Modo consulta · Los cambios en los análisis están restringidos'}
      </footer>
    </div>
  )
}
