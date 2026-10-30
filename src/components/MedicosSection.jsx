import { BOTON_GESTION, textoGestion } from '../appearance/gestion'
import { COLORES } from '../theme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'
import SelectorMedicos from './SelectorMedicos'
import MapaCorporal from './MapaCorporal'
import CamposIncidenciaCorporal from './CamposIncidenciaCorporal'
import { ESTADOS_CORPORALES, LADOS_CORPORALES, colorZona, fichasZona, nombreZona, puedeVerMedicos, ubicacionFicha, validarIncidencia } from '../utils/mapaCorporal'

const incidenciaVacia = { zona_corporal: '', lateralidad: 'derecha', tipo_incidencia: 'molestia', estado_seguimiento: 'seguimiento', fecha_resolucion: '' }

const estadoConfig = {
  disponible: { color: COLORES.exito, label: 'Disponible' },
  lesionado: { color: COLORES.acento, label: 'Lesionado' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function MedicosContenido({ perfil, jugadorInicialId, onConsumirJugadorInicial }) {
  const [mapaDisponible, setMapaDisponible] = useState(false)
  const [incidencia, setIncidencia] = useState(incidenciaVacia)
  const [seleccionZona, setSeleccionZona] = useState(null)
  const [error, setError] = useState('')
  const [cargandoFicha, setCargandoFicha] = useState(false)
  const [falloLecturaFicha, setFalloLecturaFicha] = useState(false)
  const solicitudFicha = useRef(0)
  const guardadoEnCurso = useRef(false)
  const esPreparador = perfil.rol === 'preparador_fisico'
  const [jugadores, setJugadores] = useState([])
  const [idsConHistorial, setIdsConHistorial] = useState(new Set())
  const [todasLasFichas, setTodasLasFichas] = useState([])
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaLesion, setBusquedaLesion] = useState('')
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [categoriaAgregar, setCategoriaAgregar] = useState('')
  const [jugadorAgregarId, setJugadorAgregarId] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [fichas, setFichas] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [fichaEditando, setFichaEditando] = useState(null)
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [tiempoRecuperacion, setTiempoRecuperacion] = useState('')
  const [fechaEstimadaAlta, setFechaEstimadaAlta] = useState('')
  const [recuperado, setRecuperado] = useState(false)
  const [linkInforme, setLinkInforme] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [guardandoEstado, setGuardandoEstado] = useState(false)

  const cargarFichas = useCallback(async (jugadorId) => {
    const solicitud = ++solicitudFicha.current
    setCargandoFicha(true)
    setFalloLecturaFicha(false)
    const { data, error: fallo } = await supabase
      .from('fichas_medicas')
      .select('*')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
    if (solicitud !== solicitudFicha.current) return
    setCargandoFicha(false)
    if (fallo) { setFalloLecturaFicha(true); setError('No se pudo consultar el historial. Volvé a abrir la ficha.'); return }
    setFichas(data || [])
  }, [])

  const abrirJugador = useCallback(
    (j) => {
      setJugadorSeleccionado(j)
      setFichas([])
      setError('')
      setSeleccionZona(null)
      setMostrarForm(false)
      setFichaEditando(null)
      cargarFichas(j.id)
    },
    [cargarFichas]
  )

  useEffect(() => {
    async function cargar() {
      const { error: errorEsquema } = await supabase.from('fichas_medicas').select('zona_corporal,revision').limit(0)
      setMapaDisponible(!errorEsquema)
      const { data, error: errorJugadores } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')
      setJugadores(data || [])

      const { data: historial, error: errorHistorial } = await supabase.from('fichas_medicas').select('*')
      if (errorJugadores || errorHistorial) { setError('No se pudieron cargar las fichas médicas. Revisá tu acceso y volvé a ingresar.'); return }
      setTodasLasFichas(historial || [])
      setIdsConHistorial(new Set((historial || []).map((f) => f.jugador_id)))

      if (jugadorInicialId) {
        const encontrado = data?.find((j) => j.id === jugadorInicialId)
        if (encontrado) {
          abrirJugador(encontrado)
        }
        onConsumirJugadorInicial?.()
      }
    }
    cargar()
  }, [jugadorInicialId, abrirJugador, onConsumirJugadorInicial])

  async function refrescarTodasLasFichas() {
    const { data, error: fallo } = await supabase.from('fichas_medicas').select('*')
    if (fallo) { setError('Se guardó el registro, pero no se pudo actualizar la vista general. Volvé a ingresar.'); return }
    setTodasLasFichas(data || [])
    setIdsConHistorial(new Set((data || []).map((f) => f.jugador_id)))
  }

  function obtenerFechaHoy() {
    const hoy = new Date()
    const anio = hoy.getFullYear()
    const mes = String(hoy.getMonth() + 1).padStart(2, '0')
    const dia = String(hoy.getDate()).padStart(2, '0')
    return `${anio}-${mes}-${dia}`
  }

  function abrirNuevoRegistro(zona = null) {
    setError('')
    setIncidencia({ ...incidenciaVacia, zona_corporal: zona?.zona || '', lateralidad: zona?.lado || 'derecha' })
    setFichaEditando(null)
    setFecha(obtenerFechaHoy())
    setDescripcion('')
    setTiempoRecuperacion('')
    setFechaEstimadaAlta('')
    setRecuperado(false)
    setLinkInforme('')
    setMostrarForm(true)
  }

  function abrirEditarRegistro(f) {
    setError('')
    const u = ubicacionFicha(f)
    setIncidencia({ ...incidenciaVacia, zona_corporal: u?.zona || '', lateralidad: u?.lado || 'derecha', tipo_incidencia: f.tipo_incidencia || 'lesion_informada', estado_seguimiento: f.estado_seguimiento || (f.recuperado ? 'resuelta' : 'seguimiento'), fecha_resolucion: f.fecha_resolucion || '' })
    setFichaEditando(f)
    setFecha(f.fecha || '')
    setDescripcion(f.descripcion || '')
    setTiempoRecuperacion(f.tiempo_recuperacion || '')
    setFechaEstimadaAlta(f.fecha_estimada_alta || '')
    setRecuperado(!!f.recuperado)
    setLinkInforme(f.link_informe || '')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setFichaEditando(null)
  }

  async function handleGuardar() {
    if (guardadoEnCurso.current || !fecha) return
    const estructurada = mapaDisponible && !!incidencia.zona_corporal
    if (mapaDisponible && (!fichaEditando || fichaEditando.zona_corporal || esPreparador) && !estructurada) { setError('Seleccioná la zona corporal.'); return }
    const validacion = estructurada ? validarIncidencia({ ...incidencia, fecha }) : null
    if (validacion) { setError(validacion); return }
    setError('')
    guardadoEnCurso.current = true
    setGuardando(true)
    try {
    const datos = {
      fecha,
      descripcion,
      tiempo_recuperacion: tiempoRecuperacion || null,
      fecha_estimada_alta: fechaEstimadaAlta || null,
      recuperado,
      link_informe: linkInforme || null,
      ...(estructurada ? { ...incidencia, fecha_resolucion: incidencia.fecha_resolucion || null, recuperado: incidencia.estado_seguimiento === 'resuelta' } : {}),
    }

    if (fichaEditando) {
      let consulta = supabase.from('fichas_medicas').update(datos).eq('id', fichaEditando.id)
      if (mapaDisponible) consulta = consulta.eq('revision', fichaEditando.revision)
      const { data, error: fallo } = await consulta.select('id')
      if (fallo) throw fallo
      if (!data?.length) {
        await cargarFichas(jugadorSeleccionado.id)
        throw Error('El registro cambió o no tenés permiso. El historial fue actualizado: cancelá y volvé a editar el registro antes de guardar.')
      }
    } else {
      const { error: fallo } = await supabase.from('fichas_medicas').insert({
        jugador_id: jugadorSeleccionado.id,
        ...datos,
      })
      if (fallo) throw fallo
    }
    // Los nuevos seguimientos no diagnostican ni habilitan/bloquean jugadoras.
    if (!estructurada) {
    const nuevoEstado = recuperado ? 'disponible' : 'lesionado'
    const nuevoDetalle = recuperado ? null : descripcion || 'Lesión'

    await supabase
      .from('jugadores')
      .update({ estado: nuevoEstado, estado_detalle: nuevoDetalle })
      .eq('id', jugadorSeleccionado.id)

    setJugadorSeleccionado((prev) => ({ ...prev, estado: nuevoEstado, estado_detalle: nuevoDetalle }))
    setJugadores((prev) =>
      prev.map((j) =>
        j.id === jugadorSeleccionado.id ? { ...j, estado: nuevoEstado, estado_detalle: nuevoDetalle } : j
      )
    )
    }
    setIdsConHistorial((prev) => new Set(prev).add(jugadorSeleccionado.id))

    setGuardando(false)
    setFecha('')
    setDescripcion('')
    setTiempoRecuperacion('')
    setFechaEstimadaAlta('')
    setRecuperado(false)
    setLinkInforme('')
    setMostrarForm(false)
    setFichaEditando(null)
    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
    } catch (fallo) {
      setError(fallo?.code === '42501' ? 'No tenés permiso para guardar este registro.' : fallo?.message || 'No se pudo guardar. Revisá la conexión antes de reintentar.')
    } finally { guardadoEnCurso.current = false; setGuardando(false) }
  }

  async function handleEliminarFicha(fichaId) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro médico?')
    if (!confirmar) return
    await supabase.from('fichas_medicas').delete().eq('id', fichaId)

    const quedanActivas = fichas.some((f) => f.id !== fichaId && !f.recuperado)
    if (!quedanActivas && jugadorSeleccionado.estado === 'lesionado') {
      await supabase
        .from('jugadores')
        .update({ estado: 'disponible', estado_detalle: null })
        .eq('id', jugadorSeleccionado.id)
      setJugadorSeleccionado((prev) => ({ ...prev, estado: 'disponible', estado_detalle: null }))
      setJugadores((prev) =>
        prev.map((j) =>
          j.id === jugadorSeleccionado.id ? { ...j, estado: 'disponible', estado_detalle: null } : j
        )
      )
    }

    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
  }

  async function handleMarcarDisponible() {
    setGuardandoEstado(true)
    await supabase
      .from('jugadores')
      .update({ estado: 'disponible', estado_detalle: null })
      .eq('id', jugadorSeleccionado.id)
    let resolver = supabase
      .from('fichas_medicas')
      .update({ recuperado: true })
      .eq('jugador_id', jugadorSeleccionado.id)
      .eq('recuperado', false)
    if (mapaDisponible) resolver = resolver.is('zona_corporal', null)
    await resolver

    setGuardandoEstado(false)
    setJugadorSeleccionado((prev) => ({ ...prev, estado: 'disponible', estado_detalle: null }))
    setJugadores((prev) =>
      prev.map((j) =>
        j.id === jugadorSeleccionado.id ? { ...j, estado: 'disponible', estado_detalle: null } : j
      )
    )
    cargarFichas(jugadorSeleccionado.id)
    refrescarTodasLasFichas()
  }

  const filtrados = jugadores.filter((j) => {
    const coincideCategoria = !categoriaId || j.categoria_id === categoriaId
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const lesionados = filtrados.filter((j) => j.estado === 'lesionado')
  const recuperados = filtrados.filter((j) => j.estado !== 'lesionado' && idsConHistorial.has(j.id))

  const categoriasDisponibles = [
    ...new Map(
      jugadores.filter((j) => j.categoria_id).map((j) => [j.categoria_id, j.categorias?.nombre])
    ),
  ].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))

  const jugadoresParaAgregar = jugadores
    .filter((j) => !categoriaAgregar || j.categoria_id === categoriaAgregar)
    .sort((a, b) => (a.apellido || '').localeCompare(b.apellido || ''))

  const resultadosLesion = busquedaLesion
    ? todasLasFichas
        .filter((f) => (f.descripcion || '').toLowerCase().includes(busquedaLesion.toLowerCase()))
        .map((f) => ({ ficha: f, jugador: jugadores.find((j) => j.id === f.jugador_id) }))
        .filter((r) => r.jugador)
        .sort((a, b) => (b.ficha.fecha || '').localeCompare(a.ficha.fecha || ''))
    : []

  function irAAgregar() {
    const jugador = jugadores.find((j) => j.id === jugadorAgregarId)
    if (!jugador) return
    abrirJugador(jugador)
    setMostrarAgregar(false)
    setCategoriaAgregar('')
    setJugadorAgregarId('')
  }

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  if (jugadorSeleccionado) {
    const estadoActual = estadoConfig[jugadorSeleccionado.estado] || estadoConfig.disponible

    return (
      <div className="p-6 md:p-10">
        <div className="max-w-3xl mx-auto">
          {error && <p role="alert" className="p-3 mb-4 rounded-xl" style={{ color: COLORES.peligro, background: COLORES.fondoTarjeta }}>{error}</p>}
          <button
            disabled={guardando}
            onClick={() => { solicitudFicha.current++; setJugadorSeleccionado(null); setError('') }}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver
          </button>

          <div className="flex items-center gap-3 mb-6">
            <p className="text-3xl">🩺</p>
            <div>
              <h1
                className="text-2xl"
                style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
              >
                {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
              </h1>
              <p className="text-xs" style={{ color: textoGestion(estadoActual.color) }}>
                {estadoActual.label}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}>
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: COLORES.textoMuted }}>
              Estado del jugador
            </p>
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-sm font-medium px-3 py-1.5 rounded-xl"
                style={{
                  backgroundColor: COLORES.fondoPagina,
                  color: textoGestion(estadoActual.color),
                  border: `1px solid ${estadoActual.color}`,
                }}
              >
                {estadoActual.label}
              </span>
              {!esPreparador && jugadorSeleccionado.estado === 'lesionado' && (
                <button
                  onClick={handleMarcarDisponible}
                  disabled={guardandoEstado}
                  className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={BOTON_GESTION}
                >
                  {guardandoEstado ? 'Actualizando...' : 'Marcar como disponible'}
                </button>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: COLORES.textoMuted }}>
              Los seguimientos del mapa no cambian la disponibilidad deportiva ni constituyen un alta médica.
            </p>
          </div>

          {!mapaDisponible && <p className="text-sm mb-4" style={{ color: COLORES.textoSecundario }}>El mapa requiere habilitar la migración de mapa corporal. El historial existente se conserva.</p>}
          {cargandoFicha ? <p role="status">Cargando historial…</p> : mapaDisponible && !falloLecturaFicha && <MapaCorporal fichas={fichas} seleccion={seleccionZona} onSeleccionar={zona => { if (guardadoEnCurso.current) return; setSeleccionZona(zona); abrirNuevoRegistro(zona) }} />}
          {seleccionZona && <div className="mb-4 text-sm" style={{ color: COLORES.texto }}>
            <strong>{nombreZona(seleccionZona.zona)} · {LADOS_CORPORALES[seleccionZona.lado]}</strong>
            <p>{fichasZona(fichas, seleccionZona.zona, seleccionZona.lado).length} registros en esta zona. Consultá todos en el historial, sin perder los anteriores.</p>
            <button type="button" className="underline" onClick={() => setSeleccionZona(null)}>Mostrar todo el historial</button>
          </div>}

          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide" style={{ color: COLORES.textoMuted }}>
              Historial médico
            </p>
            <button
              onClick={mostrarForm ? cancelarForm : () => abrirNuevoRegistro()}
              disabled={guardando || cargandoFicha || falloLecturaFicha || (esPreparador && !mapaDisponible)}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 shrink-0"
              style={BOTON_GESTION}
            >
              {mostrarForm ? 'Cancelar' : '+ Agregar registro'}
            </button>
          </div>

          {mostrarForm && (
            <div className="space-y-3 mb-6 p-4 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}>
              <fieldset disabled={guardando} className="space-y-3">
              <p className="text-sm" style={{ color: COLORES.texto }}>{jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}</p>
              {mapaDisponible && <CamposIncidenciaCorporal valor={incidencia} onChange={setIncidencia} disabled={guardando} />}
              {fichaEditando && (
                <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                  Editando registro del {fichaEditando.fecha}
                </p>
              )}
              <label className="block text-sm" style={{ color: COLORES.texto }}>Fecha de inicio<input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              /></label>
              <textarea
                aria-label="Observaciones"
                placeholder="Observaciones: qué informó la jugadora y cómo se hará el seguimiento"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm resize-none"
                style={inputStyle}
              />
              {(!mapaDisponible || !incidencia.zona_corporal) && <><input
                type="text"
                placeholder="Tiempo estimado de recuperación (ej: 2 semanas)"
                value={tiempoRecuperacion}
                onChange={(e) => setTiempoRecuperacion(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              />
              <div>
                <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: COLORES.textoMuted }}>
                  Fecha estimada de alta
                </label>
                <input
                  type="date"
                  value={fechaEstimadaAlta}
                  onChange={(e) => setFechaEstimadaAlta(e.target.value)}
                  className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: COLORES.texto }}>
                <input
                  type="checkbox"
                  checked={recuperado}
                  onChange={(e) => setRecuperado(e.target.checked)}
                />
                Situación resuelta (registro anterior)
              </label>
              </>}
              <input
                type="text"
                placeholder="Link del informe (Drive, PDF, etc.)"
                value={linkInforme}
                onChange={(e) => setLinkInforme(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              />
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={BOTON_GESTION}
              >
                {guardando ? 'Guardando...' : fichaEditando ? 'Guardar cambios' : 'Guardar registro'}
              </button>
              </fieldset>
            </div>
          )}

          <div className="space-y-2">
            {(seleccionZona ? fichasZona(fichas, seleccionZona.zona, seleccionZona.lado) : fichas).map((f) => (
              <div key={f.id} className="p-3.5 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-mono" style={{ color: COLORES.textoSecundario }}>{f.fecha}</p>
                  <div className="flex items-center gap-2">
                    {f.tiempo_recuperacion && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORES.fondoPagina, color: textoGestion(COLORES.acento) }}
                      >
                        {f.tiempo_recuperacion}
                      </span>
                    )}
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: COLORES.fondoPagina,
                        color: f.recuperado ? COLORES.exito : COLORES.peligro,
                      }}
                    >
                      {f.recuperado ? (f.zona_corporal ? 'Resuelta' : 'Recuperado') : 'Activo'}
                    </span>
                    <button
                      aria-label={`Editar registro del ${f.fecha}`}
                      disabled={guardando || cargandoFicha || (esPreparador && !mapaDisponible)}
                      onClick={() => abrirEditarRegistro(f)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                    >
                      ✏️
                    </button>
                    {!f.zona_corporal && !esPreparador && <button
                      onClick={() => handleEliminarFicha(f.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                    >
                      🗑
                    </button>}
                  </div>
                </div>
                <p className="text-sm" style={{ color: COLORES.texto }}>{f.descripcion}</p>
                <p className="text-xs mt-2" style={{ color: COLORES.textoSecundario }}>
                  {ubicacionFicha(f) ? `${nombreZona(ubicacionFicha(f).zona)} · ${LADOS_CORPORALES[ubicacionFicha(f).lado]}${ubicacionFicha(f).inferida ? ' (asociación por descripción exacta; confirmar al editar)' : ''}` : 'Zona sin clasificar: editar para ubicarla, sin interpretar el diagnóstico.'}
                  {' · '}{f.tipo_incidencia === 'molestia' ? 'Molestia' : f.tipo_incidencia === 'lesion_informada' ? 'Lesión informada' : 'Registro anterior'}
                  {' · '}{ESTADOS_CORPORALES[f.estado_seguimiento] || (f.recuperado ? 'Resuelta' : 'En seguimiento')}
                  {f.fecha_resolucion && ` · Resuelta el ${f.fecha_resolucion}`}
                </p>
                {f.fecha_estimada_alta && !f.recuperado && (
                  <p className="text-xs mt-1" style={{ color: textoGestion('#7DD3FC') }}>
                    📅 Alta estimada: {f.fecha_estimada_alta}
                  </p>
                )}
                {f.link_informe && (
                  <a
                    href={f.link_informe}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs mt-1 inline-block underline"
                    style={{ color: COLORES.textoSecundario }}
                  >
                    📎 Ver informe
                  </a>
                )}
              </div>
            ))}
            {!cargandoFicha && !error && fichas.length === 0 && (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>Sin registros médicos todavía.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        {error && <p role="alert" className="mb-4" style={{ color: COLORES.peligro }}>{error}</p>}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1
            className="text-3xl md:text-4xl flex items-center gap-3"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
          >
            <span>🩺</span> Médicos
          </h1>
          <button
            onClick={() => setMostrarAgregar((v) => !v)}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={BOTON_GESTION}
          >
            {mostrarAgregar ? 'Cancelar' : '+ Agregar jugador'}
          </button>
        </div>

        {mostrarAgregar && (
          <div className="p-4 rounded-xl mb-6 space-y-3" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}>
            <p className="text-xs uppercase tracking-wide" style={{ color: COLORES.textoMuted }}>
              Elegí categoría y jugador para abrir su ficha médica
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <SelectorMedicos label="Categoría de la jugadora"
                value={categoriaAgregar}
                onChange={(valor) => {
                  setCategoriaAgregar(valor)
                  setJugadorAgregarId('')
                }}
                options={[{ value: '', label: 'Todas las categorías' }, ...categoriasDisponibles.map(([id, nombre]) => ({ value: id, label: nombre }))]} />
              <SelectorMedicos label="Jugadora"
                value={jugadorAgregarId}
                onChange={setJugadorAgregarId}
                options={[{ value: '', label: 'Seleccionar jugador...' }, ...jugadoresParaAgregar.map(j => ({ value: j.id, label: `${j.apellido}, ${j.nombre}` }))]} />
            </div>
            <button
              onClick={irAAgregar}
              disabled={!jugadorAgregarId}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={BOTON_GESTION}
            >
              Ir a la ficha
            </button>
          </div>
        )}

        <CategoriaFiltro
          Selector={SelectorMedicos}
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
        />

        {mapaDisponible && <section className="mb-6 p-4 rounded-xl" style={{ background: COLORES.fondoTarjeta, color: COLORES.texto, border: `1px solid ${COLORES.borde}` }} aria-label="Seguimiento del plantel">
          <h2 className="font-semibold mb-2">Seguimiento del plantel</h2>
          {filtrados.filter(j => todasLasFichas.some(f => f.jugador_id === j.id && !f.recuperado)).map(j => {
            const activas = todasLasFichas.filter(f => f.jugador_id === j.id && !f.recuperado).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
            return <button key={j.id} type="button" className="block text-left w-full py-3 border-b" style={{ borderColor: COLORES.borde }} onClick={() => abrirJugador(j)}>
              <strong>{j.apellido}, {j.nombre}</strong>
              {activas.map(f => { const u = ubicacionFicha(f); return <span key={f.id} className="block text-xs mt-1" style={{ color: COLORES.textoSecundario }}><span aria-hidden="true" style={{ color: u ? colorZona([f], u.zona, u.lado) : COLORES.textoSecundario }}>● </span>{f.tipo_incidencia === 'molestia' ? 'Molestia' : f.tipo_incidencia ? 'Lesión informada' : 'Registro anterior'} · {u ? `${nombreZona(u.zona)} (${LADOS_CORPORALES[u.lado]})` : 'Sin clasificar'} · {f.fecha} · {ESTADOS_CORPORALES[f.estado_seguimiento] || 'En seguimiento'}</span> })}
            </button>
          })}
          {!filtrados.some(j => todasLasFichas.some(f => f.jugador_id === j.id && !f.recuperado)) && <p className="text-sm" style={{ color: COLORES.textoSecundario }}>No hay situaciones activas para este filtro.</p>}
        </section>}

        <input
          type="text"
          placeholder="🔍 Buscar en diagnósticos (ej: desgarro, esguince)..."
          value={busquedaLesion}
          onChange={(e) => setBusquedaLesion(e.target.value)}
          className="w-full p-2.5 rounded-xl ui-control outline-none text-sm mb-6"
          style={inputStyle}
        />

        {busquedaLesion ? (
          <div className="space-y-2">
            {resultadosLesion.map(({ ficha, jugador }) => (
              <div
                key={ficha.id}
                onClick={() => abrirJugador(jugador)}
                className="p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {jugador.foto_url ? (
                      <img
                        src={jugador.foto_url}
                        alt={`${jugador.apellido}, ${jugador.nombre}`}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                      >
                        {iniciales(jugador.nombre, jugador.apellido)}
                      </span>
                    )}
                    <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                      {jugador.apellido}, {jugador.nombre}
                    </p>
                  </div>
                  <span className="text-xs font-mono" style={{ color: COLORES.textoSecundario }}>{ficha.fecha}</span>
                </div>
                <p className="text-sm" style={{ color: COLORES.textoSecundario }}>{ficha.descripcion}</p>
              </div>
            ))}
            {resultadosLesion.length === 0 && (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>
                No se encontraron diagnósticos que coincidan con "{busquedaLesion}".
              </p>
            )}
          </div>
        ) : (
          <>
            {[
          { titulo: 'Lesionados', icono: '🟡', color: COLORES.acento, lista: lesionados },
          { titulo: 'Recuperados', icono: '🟢', color: COLORES.exito, lista: recuperados },
        ].map(
          (grupo) =>
            grupo.lista.length > 0 && (
              <div key={grupo.titulo} className="mb-6">
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: textoGestion(grupo.color) }}>
                  {grupo.icono} {grupo.titulo} ({grupo.lista.length})
                </p>
                <div className="space-y-2">
                  {grupo.lista.map((j) => (
                    <div
                      key={j.id}
                      onClick={() => abrirJugador(j)}
                      className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: COLORES.fondoTarjeta, border: `1px solid ${grupo.color}` }}
                    >
                      {j.foto_url ? (
                        <img
                          src={j.foto_url}
                          alt={`${j.apellido}, ${j.nombre}`}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                          style={{ border: `2px solid ${grupo.color}` }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-xs font-bold"
                          style={{ backgroundColor: COLORES.fondoPagina, border: `2px solid ${grupo.color}`, color: textoGestion(grupo.color), fontFamily: "'Archivo Black', sans-serif" }}
                        >
                          {iniciales(j.nombre, j.apellido)}
                        </div>
                      )}
                      <p className="flex-1 text-sm" style={{ color: COLORES.texto }}>
                        {j.apellido}, {j.nombre}
                      </p>
                      <span className="text-xs font-mono px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}>
                        {j.categorias?.nombre}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
        )}

            {lesionados.length === 0 && recuperados.length === 0 && (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>
                No hay jugadores lesionados ni con historial médico para ese filtro.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function MedicosSection(props) {
  if (!puedeVerMedicos(props.perfil)) return <div className="p-6" style={{ color: COLORES.texto }}><h1>Médicos</h1><p>No tenés acceso autorizado a las fichas médicas.</p></div>
  return <MedicosContenido {...props} />
}


