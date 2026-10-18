
import { COLORES } from '../theme'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { agregarPendiente, contarPendientes, sincronizarPendientes } from '../utils/colaOffline'
import CargaEntrenamiento from './CargaEntrenamiento'
import CargaCMJ from './CargaCMJ'
import CMJComparativo from './CMJComparativo'
import RPEComparativo from './RPEComparativo'
import SemaforoRiesgo from './SemaforoRiesgo'
import BienestarComparativo from './BienestarComparativo'
import CargaWellness from './CargaWellness'
import AlertasDatosFisicos from './AlertasDatosFisicos'
import CicloComparativo from './CicloComparativo'

function normalizarNombre(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

function FisicoSection({
  perfil,
  partidoInicialId,
  onConsumirPartidoInicial,
  jugadorParaBienestar,
  onConsumirJugadorParaBienestar,
}) {
  const esTecnico = perfil.rol === 'tecnico'
  const puedeVerCargaYCmj =
    perfil.rol === 'coordinacion' || perfil.rol === 'preparador_fisico'
  const puedeVerCiclo = perfil.rol !== 'medico'

  const [tab, setTab] = useState('wellness')
  const [subTabWellness, setSubTabWellness] = useState('ver')
  const [subTabCMJ, setSubTabCMJ] = useState('cargar')
  const [subTabRPE, setSubTabRPE] = useState('cargar')

  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [tipo, setTipo] = useState('entrenamiento')
  const [partidos, setPartidos] = useState([])
  const [partidoId, setPartidoId] = useState('')
  const [jugadores, setJugadores] = useState([])
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [mostrarPegado, setMostrarPegado] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')
  const [resultadoPegado, setResultadoPegado] = useState(null)
  const [pendientes, setPendientes] = useState(0)

  const intentarSincronizar = useCallback(async () => {
    if (!navigator.onLine) return
    const sincronizados = await sincronizarPendientes(supabase)
    setPendientes(contarPendientes('fisico'))
    if (sincronizados > 0) {
      setMensaje(`Se sincronizaron ${sincronizados} registro(s) guardados sin conexión.`)
    }
  }, [])

  useEffect(() => {
    async function ejecutar() {
      setPendientes(contarPendientes('fisico'))
      intentarSincronizar()
    }
    ejecutar()
    window.addEventListener('online', intentarSincronizar)
    return () => window.removeEventListener('online', intentarSincronizar)
  }, [intentarSincronizar])

  useEffect(() => {
    if (jugadorParaBienestar) {
      setTab('wellness')
      setSubTabWellness('ver')
    }
  }, [jugadorParaBienestar])

  useEffect(() => {
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      const cats = data || []
      setCategorias(cats)
      if (!esTecnico && cats.length <= 1) {
        setCategoriaId(cats[0]?.id || '')
      }
    }
    cargarCategorias()
  }, [esTecnico])

  useEffect(() => {
    async function aplicarPartidoInicial() {
      if (!partidoInicialId) return
      const { data: partido } = await supabase
        .from('partidos')
        .select('*')
        .eq('id', partidoInicialId)
        .single()
      if (partido) {
        setCategoriaId(partido.categoria_id)
        setFecha(partido.fecha)
        setTipo('partido')
        setPartidoId(partido.id)
        setTab('rpe')
      }
      onConsumirPartidoInicial?.()
    }
    aplicarPartidoInicial()
  }, [partidoInicialId, onConsumirPartidoInicial])

  useEffect(() => {
    async function cargarPartidos() {
      if (!categoriaId) {
        setPartidos([])
        return
      }
      const { data } = await supabase
        .from('partidos')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('fecha', { ascending: false })
      setPartidos(data || [])
    }
    cargarPartidos()
  }, [categoriaId])

  useEffect(() => {
    async function cargar() {
      if (!categoriaId || !fecha) {
        setJugadores([])
        return
      }
      setCargando(true)
      setMensaje('')
      setResultadoPegado(null)

      const { data: jugadoresData } = await obtenerJugadoresDeCategoria(
        supabase,
        categoriaId,
        categorias
      )
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: sesionesData } = await supabase
          .from('sesiones_fisicas')
          .select('jugador_id, rpe, partido_id')
          .eq('fecha', fecha)
          .eq('tipo', tipo)
          .in('jugador_id', ids)
        const mapa = {}
        ;(sesionesData || []).forEach((s) => {
          mapa[s.jugador_id] = { rpe: s.rpe }
        })
        setDatos(mapa)
      } else {
        setDatos({})
      }

      setCargando(false)
    }
    cargar()
  }, [categoriaId, fecha, tipo, categorias])

  function cambiarValor(jugadorId, valor) {
    setDatos((prev) => ({
      ...prev,
      [jugadorId]: { rpe: valor },
    }))
  }

  function handleAplicarPegado() {
    const lineas = textoPegado.split('\n').map((l) => l.trim()).filter((l) => l !== '')
    if (lineas.length === 0) return

    const jugadoresConNombre = jugadores.map((j) => ({
      jugador: j,
      claveNombre: normalizarNombre(`${j.nombre} ${j.apellido}`),
    }))

    let aplicados = 0
    const noEncontrados = []
    const nuevoDatos = { ...datos }

    lineas.forEach((linea, i) => {
      const partes = (linea.includes('\t') ? linea.split('\t') : linea.split(',')).map((p) => p.trim())
      if (partes.length < 2) return

      const valorRpe = partes[partes.length - 1]
      const nombrePegado = partes.slice(0, partes.length - 1).join(' ')

      if (!nombrePegado) return

      const claveBuscada = normalizarNombre(nombrePegado)
      const match = jugadoresConNombre.find((j) => j.claveNombre === claveBuscada)

      if (!match) {
        noEncontrados.push(`Fila ${i + 1}: "${nombrePegado}"`)
        return
      }

      const v = valorRpe.replace(',', '.').trim()
      if (v !== '') {
        nuevoDatos[match.jugador.id] = { rpe: v }
        aplicados++
      }
    })

    setDatos(nuevoDatos)
    setResultadoPegado({ aplicados, noEncontrados })
  }

  function tieneAlgunValor(fila) {
    if (!fila) return false
    return fila.rpe !== undefined && fila.rpe !== '' && fila.rpe !== null
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = jugadores
      .filter((j) => tieneAlgunValor(datos[j.id]))
      .map((j) => ({
        fecha,
        jugador_id: j.id,
        tipo,
        partido_id: tipo === 'partido' && partidoId ? partidoId : null,
        rpe: Number(datos[j.id].rpe),
      }))

    const idsSinDatos = jugadores.map((j) => j.id).filter((id) => !tieneAlgunValor(datos[id]))

    if (!navigator.onLine) {
      agregarPendiente({ tipo: 'fisico', fecha, subtipo: tipo, filas, idsSinDatos })
      setPendientes(contarPendientes('fisico'))
      setGuardando(false)
      setMensaje('Sin conexión: guardado en el dispositivo. Se sincronizará solo cuando vuelva la señal.')
      return
    }

    try {
      if (filas.length > 0) {
        const { error } = await supabase
          .from('sesiones_fisicas')
          .upsert(filas, { onConflict: 'fecha,jugador_id,tipo' })
        if (error) throw error
      }
      if (idsSinDatos.length > 0) {
        const { error } = await supabase
          .from('sesiones_fisicas')
          .update({ rpe: null })
          .eq('fecha', fecha)
          .eq('tipo', tipo)
          .in('jugador_id', idsSinDatos)
        if (error) throw error
      }
      setGuardando(false)
      setMensaje('Listo, RPE guardado.')
    } catch {
      agregarPendiente({ tipo: 'fisico', fecha, subtipo: tipo, filas, idsSinDatos })
      setPendientes(contarPendientes('fisico'))
      setGuardando(false)
      setMensaje('No se pudo conectar: guardado en el dispositivo. Se sincronizará solo más tarde.')
    }
  }

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  const categoriaBloqueada = esTecnico || categorias.length <= 1

  const tabsDisponibles = [
    { key: 'wellness', label: 'Wellness', icon: '◉' },
    { key: 'rpe', label: 'RPE', icon: '↗' },
    ...(puedeVerCargaYCmj
      ? [
          { key: 'carga', label: 'Carga entrenamiento', icon: '▥' },
          { key: 'cmj', label: 'CMJ', icon: '↕' },
          { key: 'semaforo', label: 'Semáforo', icon: '◉' },
        ]
      : []),
    ...(puedeVerCiclo ? [{ key: 'ciclo', label: 'Ciclo', icon: '◷' }] : []),
  ]

  const botonPrincipal = (activo) => ({
    background: activo
      ? 'linear-gradient(135deg, #F7D45A 0%, #F2C230 100%)'
      : 'linear-gradient(145deg, #292925 0%, #22221F 100%)',
    color: activo ? '#171715' : COLORES.textoSecundario,
    border: `1px solid ${activo ? '#F2C230' : '#3B3B34'}`,
    boxShadow: activo ? '0 4px 14px rgba(242,194,48,0.13)' : 'none',
  })

  const botonSecundario = (activo) => ({
    backgroundColor: activo ? '#F2C230' : '#20201D',
    color: activo ? '#171715' : COLORES.textoSecundario,
    border: `1px solid ${activo ? '#F2C230' : '#3B3B34'}`,
    boxShadow: activo ? '0 3px 10px rgba(242,194,48,0.10)' : 'none',
  })

  return (
    <div className="min-h-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8" style={{ color: COLORES.texto }}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Encabezado */}
        <section
          className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-7 lg:p-8"
          style={{
            background: 'linear-gradient(120deg, #242422 0%, #1D1D1B 60%, #29271D 100%)',
            border: '1px solid #3B3B34',
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
          }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(242,194,48,0.15) 0%, rgba(242,194,48,0) 70%)',
            }}
          />
          <div
            className="pointer-events-none absolute right-8 top-0 h-full w-px opacity-30"
            style={{ background: 'linear-gradient(180deg, transparent, #F2C230, transparent)' }}
          />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black sm:h-16 sm:w-16"
                style={{
                  background: 'linear-gradient(145deg, #F7D45A, #DDAA16)',
                  color: '#171715',
                  boxShadow: '0 6px 20px rgba(242,194,48,0.18)',
                }}
              >
                F
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#F2C230' }}>
                  COMUNICACIONES · RENDIMIENTO
                </p>
                <h1
                  className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
                >
                  Físico
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: COLORES.textoMuted }}>
                  Seguimiento, control y análisis de la preparación física del plantel.
                </p>
              </div>
            </div>

            <div
              className="flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: '#1B1B19',
                border: '1px solid #454439',
                color: '#D4D2C6',
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#97C459', boxShadow: '0 0 8px rgba(151,196,89,0.55)' }} />
              Panel de rendimiento
            </div>
          </div>
          <div
            className="relative mt-6 h-1 overflow-hidden rounded-full"
            style={{ backgroundColor: '#3A3931' }}
          >
            <div className="h-full w-1/3 rounded-full" style={{ background: 'linear-gradient(90deg, #DDAA16, #F7D45A, transparent)' }} />
          </div>
        </section>

        {/* Avisos existentes */}
        <AlertasDatosFisicos incluirCargaYCmj={puedeVerCargaYCmj} />

        {/* Navegación principal */}
        <section
          className="rounded-2xl p-3 sm:p-4"
          style={{
            background: 'linear-gradient(145deg, #20201E 0%, #1A1A18 100%)',
            border: '1px solid #35352F',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: COLORES.textoMuted }}>
                Área de trabajo
              </p>
              <p className="mt-1 text-sm" style={{ color: COLORES.textoSecundario }}>
                Seleccioná un módulo para continuar
              </p>
            </div>
            <span className="hidden rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider sm:inline-flex" style={{ backgroundColor: '#302D20', color: '#F2C230' }}>
              {tabsDisponibles.find((t) => t.key === tab)?.label || 'Físico'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {tabsDisponibles.map((t) => {
              const activo = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-current={activo ? 'page' : undefined}
                  className="group relative flex min-h-[72px] items-center gap-3 overflow-hidden rounded-xl px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:min-h-[82px] sm:flex-col sm:items-start sm:justify-center sm:gap-1.5 sm:px-4"
                  style={{
                    ...botonPrincipal(activo),
                    borderRadius: '14px',
                  }}
                >
                  {activo && (
                    <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-full" style={{ backgroundColor: '#171715' }} />
                  )}
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-bold transition-transform duration-200 group-hover:scale-105"
                    style={{
                      backgroundColor: activo ? 'rgba(23,23,21,0.10)' : '#34342E',
                      color: activo ? '#171715' : '#F2C230',
                    }}
                  >
                    {t.icon}
                  </span>
                  <span className="text-xs font-bold leading-tight sm:text-sm">{t.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Contenido de cada módulo: se mantienen los componentes actuales */}
        <section
          className="min-w-0 rounded-2xl p-3 sm:rounded-3xl sm:p-5 lg:p-6"
          style={{
            background: 'linear-gradient(145deg, #20201E 0%, #191917 100%)',
            border: '1px solid #35352F',
            boxShadow: '0 10px 30px rgba(0,0,0,0.10)',
          }}
        >
          {tab === 'wellness' && (
            <div>
              {puedeVerCargaYCmj && (
                <div
                  className="mb-5 flex flex-wrap gap-2 rounded-xl p-1.5"
                  style={{ backgroundColor: '#171715', border: '1px solid #34342E' }}
                >
                  {[
                    { key: 'ver', label: 'Ver comparativo' },
                    { key: 'cargar', label: 'Carga manual' },
                  ].map((sub) => {
                    const activo = subTabWellness === sub.key
                    return (
                      <button
                        key={sub.key}
                        onClick={() => setSubTabWellness(sub.key)}
                        className="min-h-10 flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:text-sm"
                        style={botonSecundario(activo)}
                      >
                        {sub.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {(!puedeVerCargaYCmj || subTabWellness === 'ver') && (
                <BienestarComparativo
                  perfil={perfil}
                  jugadorInicialId={jugadorParaBienestar}
                  onConsumirJugadorInicial={onConsumirJugadorParaBienestar}
                />
              )}
              {puedeVerCargaYCmj && subTabWellness === 'cargar' && <CargaWellness />}
            </div>
          )}

          {tab === 'carga' && puedeVerCargaYCmj && <CargaEntrenamiento />}

          {tab === 'cmj' && puedeVerCargaYCmj && (
            <div>
              <div
                className="mb-5 flex flex-wrap gap-2 rounded-xl p-1.5"
                style={{ backgroundColor: '#171715', border: '1px solid #34342E' }}
              >
                {[
                  { key: 'cargar', label: 'Carga manual' },
                  { key: 'ver', label: 'Ver comparativo' },
                ].map((sub) => {
                  const activo = subTabCMJ === sub.key
                  return (
                    <button
                      key={sub.key}
                      onClick={() => setSubTabCMJ(sub.key)}
                      className="min-h-10 flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:text-sm"
                      style={botonSecundario(activo)}
                    >
                      {sub.label}
                    </button>
                  )
                })}
              </div>

              {subTabCMJ === 'cargar' && <CargaCMJ />}
              {subTabCMJ === 'ver' && <CMJComparativo />}
            </div>
          )}

          {tab === 'semaforo' && puedeVerCargaYCmj && <SemaforoRiesgo />}
          {tab === 'ciclo' && puedeVerCiclo && <CicloComparativo />}

          {tab === 'rpe' && (
            <div>
              <div
                className="mb-5 flex flex-wrap gap-2 rounded-xl p-1.5"
                style={{ backgroundColor: '#171715', border: '1px solid #34342E' }}
              >
                {[
                  { key: 'cargar', label: 'Carga manual' },
                  { key: 'ver', label: 'Ver comparativo' },
                ].map((sub) => {
                  const activo = subTabRPE === sub.key
                  return (
                    <button
                      key={sub.key}
                      onClick={() => setSubTabRPE(sub.key)}
                      className="min-h-10 flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:text-sm"
                      style={botonSecundario(activo)}
                    >
                      {sub.label}
                    </button>
                  )
                })}
              </div>

              {subTabRPE === 'cargar' && (
                <>
                  <div
                    className="mb-5 rounded-2xl p-4 sm:p-5"
                    style={{ backgroundColor: '#242422', border: '1px solid #3B3B34' }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black"
                        style={{ backgroundColor: '#343126', color: '#F2C230' }}
                      >
                        R
                      </div>
                      <div>
                        <h2 className="text-base font-bold" style={{ color: COLORES.texto }}>
                          Registro de esfuerzo
                        </h2>
                        <p className="mt-0.5 text-xs" style={{ color: COLORES.textoMuted }}>
                          Seleccioná la sesión antes de cargar los valores.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-xs font-semibold" style={{ color: COLORES.textoSecundario }}>
                          Fecha
                        </span>
                        <input
                          type="date"
                          value={fecha}
                          onChange={(e) => setFecha(e.target.value)}
                          className="w-full rounded-xl p-3 text-sm outline-none transition-colors focus:border-yellow-400"
                          style={inputStyle}
                        />
                      </label>

                      {!categoriaBloqueada && (
                        <label className="block min-w-0">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: COLORES.textoSecundario }}>
                            Categoría
                          </span>
                          <select
                            value={categoriaId}
                            onChange={(e) => setCategoriaId(e.target.value)}
                            className="w-full rounded-xl p-3 text-sm outline-none transition-colors focus:border-yellow-400"
                            style={inputStyle}
                          >
                            <option value="">Elegí una categoría</option>
                            {categorias.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-xs font-semibold" style={{ color: COLORES.textoSecundario }}>
                          Tipo de sesión
                        </span>
                        <select
                          value={tipo}
                          onChange={(e) => {
                            setTipo(e.target.value)
                            if (e.target.value !== 'partido') setPartidoId('')
                          }}
                          className="w-full rounded-xl p-3 text-sm outline-none transition-colors focus:border-yellow-400"
                          style={inputStyle}
                        >
                          <option value="entrenamiento">Entrenamiento</option>
                          <option value="partido">Partido</option>
                        </select>
                      </label>
                    </div>

                    {tipo === 'partido' && categoriaId && (
                      <div className="mt-4">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold" style={{ color: COLORES.textoSecundario }}>
                            Partido asociado
                          </span>
                          <select
                            value={partidoId}
                            onChange={(e) => {
                              setPartidoId(e.target.value)
                              const p = partidos.find((pp) => pp.id === e.target.value)
                              if (p?.fecha) setFecha(p.fecha)
                            }}
                            className="w-full rounded-xl p-3 text-sm outline-none transition-colors focus:border-yellow-400 sm:max-w-md"
                            style={inputStyle}
                          >
                            <option value="">Vincular a un partido (opcional)</option>
                            {partidos.map((p) => (
                              <option key={p.id} value={p.id}>
                                vs {p.rival} — {p.fecha}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>

                  {cargando && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl p-4 text-sm" style={{ backgroundColor: '#242422', color: COLORES.textoMuted, border: '1px solid #383832' }}>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Cargando plantel...
                    </div>
                  )}

                  {!cargando && categoriaId && jugadores.length === 0 && (
                    <p className="rounded-xl p-4 text-sm" style={{ backgroundColor: '#242422', color: COLORES.textoMuted, border: '1px solid #383832' }}>
                      No hay jugadores cargados en esta categoría.
                    </p>
                  )}

                  {!categoriaId && !categoriaBloqueada && (
                    <p className="rounded-xl p-4 text-sm" style={{ backgroundColor: '#242422', color: COLORES.textoMuted, border: '1px solid #383832' }}>
                      Elegí una categoría para ver el plantel.
                    </p>
                  )}

                  {jugadores.length > 0 && (
                    <>
                      <div className="mb-4">
                        <button
                          onClick={() => setMostrarPegado((v) => !v)}
                          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                          style={{
                            backgroundColor: '#292923',
                            color: '#F2C230',
                            border: '1px solid #494735',
                          }}
                        >
                          <span aria-hidden="true">▤</span>
                          {mostrarPegado ? 'Cerrar pegado desde Excel' : 'Pegar desde Excel'}
                        </button>

                        {mostrarPegado && (
                          <div
                            className="mt-3 rounded-2xl p-4 sm:p-5"
                            style={{ backgroundColor: '#242422', border: '1px solid #454439' }}
                          >
                            <p className="mb-3 text-xs leading-relaxed" style={{ color: COLORES.textoMuted }}>
                              Pegá una fila por jugador: nombre (o "Apellido, Nombre") y el valor de RPE (1-10).
                            </p>
                            <textarea
                              value={textoPegado}
                              onChange={(e) => setTextoPegado(e.target.value)}
                              placeholder={'Pérez, Juan\t7\nGómez, Martín\t5'}
                              rows={5}
                              className="mb-3 w-full resize-none rounded-xl p-3 font-mono text-sm outline-none transition-colors focus:border-yellow-400"
                              style={inputStyle}
                            />
                            <button
                              onClick={handleAplicarPegado}
                              disabled={!textoPegado.trim()}
                              className="rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg, #F7D45A, #F2C230)', color: '#171715' }}
                            >
                              Aplicar
                            </button>

                            {resultadoPegado && (
                              <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: '#1A1A18', border: '1px solid #383832' }}>
                                <p style={{ color: COLORES.exito }}>
                                  {resultadoPegado.aplicados} jugador{resultadoPegado.aplicados !== 1 ? 'es' : ''} completados.
                                </p>
                                {resultadoPegado.noEncontrados.length > 0 && (
                                  <>
                                    <p style={{ color: COLORES.peligro }} className="mt-2">
                                      No se encontraron {resultadoPegado.noEncontrados.length} fila
                                      {resultadoPegado.noEncontrados.length !== 1 ? 's' : ''} (revisá el nombre):
                                    </p>
                                    <ul style={{ color: COLORES.textoSecundario }} className="mt-1 list-inside list-disc">
                                      {resultadoPegado.noEncontrados.map((n) => (
                                        <li key={n}>{n}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mb-5 overflow-hidden rounded-2xl" style={{ border: '1px solid #3B3B34', backgroundColor: '#1B1B19' }}>
                        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: '#3B3B34', backgroundColor: '#242422' }}>
                          <div>
                            <h3 className="text-sm font-bold" style={{ color: COLORES.texto }}>
                              Plantel
                            </h3>
                            <p className="mt-0.5 text-xs" style={{ color: COLORES.textoMuted }}>
                              Ingresá el RPE correspondiente a cada jugador.
                            </p>
                          </div>
                          <span className="rounded-lg px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#343126', color: '#F2C230' }}>
                            {jugadores.length} jugadores
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#242422' }}>
                                <th
                                  className="sticky left-0 whitespace-nowrap p-3 text-left text-xs font-bold uppercase tracking-wider"
                                  style={{ color: COLORES.textoSecundario, backgroundColor: '#242422' }}
                                >
                                  Jugador
                                </th>
                                <th className="whitespace-nowrap p-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: '#F2C230' }}>
                                  RPE (1-10)
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {jugadores.map((j, i) => (
                                <tr
                                  key={j.id}
                                  className="transition-colors hover:bg-yellow-400/5"
                                  style={{
                                    backgroundColor: i % 2 === 0 ? '#1D1D1B' : '#242422',
                                    borderTop: '1px solid #30302B',
                                  }}
                                >
                                  <td
                                    className="sticky left-0 whitespace-nowrap p-3"
                                    style={{ color: COLORES.texto, backgroundColor: i % 2 === 0 ? '#1D1D1B' : '#242422' }}
                                  >
                                    <div className="flex items-center gap-3">
                                      {j.foto_url ? (
                                        <img
                                          src={j.foto_url}
                                          alt={`${j.apellido}, ${j.nombre}`}
                                          className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white/10"
                                        />
                                      ) : (
                                        <span
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                          style={{ backgroundColor: '#343126', color: '#F2C230', border: '1px solid #494735' }}
                                        >
                                          {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                                        </span>
                                      )}
                                      <span className="font-medium">{j.apellido}, {j.nombre}</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5">
                                    <input
                                      type="number"
                                      min="1"
                                      max="10"
                                      value={datos[j.id]?.rpe ?? ''}
                                      onChange={(e) => cambiarValor(j.id, e.target.value)}
                                      className="w-24 rounded-lg p-2 text-sm outline-none transition-colors focus:border-yellow-400"
                                      style={{ ...inputStyle, borderColor: '#645629' }}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {pendientes > 0 && (
                        <p className="mb-3 flex items-center gap-2 rounded-xl p-3 text-xs" style={{ color: COLORES.acento, backgroundColor: '#302D20', border: '1px solid #494735' }}>
                          <span aria-hidden="true">◌</span>
                          {pendientes} registro(s) guardados sin conexión, pendientes de sincronizar.
                        </p>
                      )}

                      {mensaje && (
                        <p
                          className="mb-4 rounded-xl p-3 text-sm"
                          style={{
                            color: mensaje.startsWith('Listo') || mensaje.includes('sincronizaron')
                              ? COLORES.exito
                              : mensaje.startsWith('Sin conexión') || mensaje.startsWith('No se pudo')
                                ? COLORES.acento
                                : COLORES.peligro,
                            backgroundColor: '#242422',
                            border: '1px solid #3B3B34',
                          }}
                        >
                          {mensaje}
                        </p>
                      )}

                      <button
                        onClick={handleGuardar}
                        disabled={guardando}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-extrabold transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        style={{
                          background: 'linear-gradient(135deg, #F7D45A 0%, #F2C230 100%)',
                          color: '#171715',
                          boxShadow: '0 5px 18px rgba(242,194,48,0.14)',
                        }}
                      >
                        {guardando ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Guardando...
                          </>
                        ) : (
                          <>✓ Guardar RPE</>
                        )}
                      </button>
                    </>
                  )}
                </>
              )}

              {subTabRPE === 'ver' && <RPEComparativo />}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default FisicoSection
