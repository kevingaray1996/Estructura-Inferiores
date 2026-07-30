import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { agregarPendiente, contarPendientes, sincronizarPendientes } from '../utils/colaOffline'
import CargaEntrenamiento from './CargaEntrenamiento'
import CargaCMJ from './CargaCMJ'
import SemaforoRiesgo from './SemaforoRiesgo'
import BienestarComparativo from './BienestarComparativo'
import CargaWellness from './CargaWellness'

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

function FisicoSection({ perfil, partidoInicialId, onConsumirPartidoInicial, jugadorParaBienestar, onConsumirJugadorParaBienestar }) {
  const esTecnico = perfil.rol === 'tecnico'
  const puedeVerCargaYCmj = perfil.rol === 'coordinacion' || perfil.rol === 'preparador_fisico'
  const [tab, setTab] = useState('wellness')
  const [subTabWellness, setSubTabWellness] = useState('ver')

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
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [])

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
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  const tabsDisponibles = [
    { key: 'wellness', label: 'Wellness' },
    { key: 'rpe', label: 'RPE' },
    ...(puedeVerCargaYCmj
      ? [
          { key: 'carga', label: 'Carga entrenamiento' },
          { key: 'cmj', label: 'CMJ' },
          { key: 'semaforo', label: 'Semáforo' },
        ]
      : []),
  ]

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-1"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Físico
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5B6B85' }}>
          Wellness, esfuerzo percibido (RPE), carga de entrenamiento, CMJ y semáforo de riesgo.
        </p>

        <div className="flex gap-2 mb-6 flex-wrap">
          {tabsDisponibles.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 p-2.5 rounded-xl text-sm font-medium transition-opacity"
              style={
                tab === t.key
                  ? { backgroundColor: '#4ADE80', color: '#0F1419' }
                  : { backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#8A9BB8' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'wellness' && (
          <div>
            {puedeVerCargaYCmj && (
              <div className="flex gap-2 mb-6">
                {[
                  { key: 'ver', label: 'Ver comparativo' },
                  { key: 'cargar', label: 'Carga manual' },
                ].map((sub) => (
                  <button
                    key={sub.key}
                    onClick={() => setSubTabWellness(sub.key)}
                    className="flex-1 p-2 rounded-xl text-xs font-medium transition-opacity"
                    style={
                      subTabWellness === sub.key
                        ? { backgroundColor: '#7DD3FC', color: '#0F1419' }
                        : { backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#8A9BB8' }
                    }
                  >
                    {sub.label}
                  </button>
                ))}
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
        {tab === 'cmj' && puedeVerCargaYCmj && <CargaCMJ />}
        {tab === 'semaforo' && puedeVerCargaYCmj && <SemaforoRiesgo />}

        {tab === 'rpe' && (
          <>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              {!esTecnico && (
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Elegí una categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value)
                  if (e.target.value !== 'partido') setPartidoId('')
                }}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="entrenamiento">Entrenamiento</option>
                <option value="partido">Partido</option>
              </select>
            </div>

            {tipo === 'partido' && categoriaId && (
              <div className="mb-6">
                <select
                  value={partidoId}
                  onChange={(e) => {
                    setPartidoId(e.target.value)
                    const p = partidos.find((pp) => pp.id === e.target.value)
                    if (p?.fecha) setFecha(p.fecha)
                  }}
                  className="w-full sm:w-72 p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                >
                  <option value="">Vincular a un partido (opcional)</option>
                  {partidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      vs {p.rival} — {p.fecha}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

            {!cargando && categoriaId && jugadores.length === 0 && (
              <p className="text-sm" style={{ color: '#5B6B85' }}>
                No hay jugadores cargados en esta categoría.
              </p>
            )}

            {!categoriaId && !esTecnico && (
              <p className="text-sm" style={{ color: '#5B6B85' }}>
                Elegí una categoría para ver el plantel.
              </p>
            )}

            {jugadores.length > 0 && (
              <>
                <div className="mb-4">
                  <button
                    onClick={() => setMostrarPegado((v) => !v)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
                  >
                    {mostrarPegado ? 'Cerrar' : '📋 Pegar desde Excel'}
                  </button>

                  {mostrarPegado && (
                    <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
                      <p className="text-xs mb-2" style={{ color: '#5B6B85' }}>
                        Pegá una fila por jugador: nombre (o "Apellido, Nombre") y el valor de RPE (1-10).
                      </p>
                      <textarea
                        value={textoPegado}
                        onChange={(e) => setTextoPegado(e.target.value)}
                        placeholder={'Pérez, Juan\t7\nGómez, Martín\t5'}
                        rows={5}
                        className="w-full p-2.5 rounded-xl outline-none text-sm font-mono resize-none mb-2"
                        style={inputStyle}
                      />
                      <button
                        onClick={handleAplicarPegado}
                        disabled={!textoPegado.trim()}
                        className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
                      >
                        Aplicar
                      </button>

                      {resultadoPegado && (
                        <div className="mt-3 text-xs">
                          <p style={{ color: '#4ADE80' }}>
                            {resultadoPegado.aplicados} jugador{resultadoPegado.aplicados !== 1 ? 'es' : ''} completados.
                          </p>
                          {resultadoPegado.noEncontrados.length > 0 && (
                            <>
                              <p style={{ color: '#F87171' }} className="mt-1">
                                No se encontraron {resultadoPegado.noEncontrados.length} fila
                                {resultadoPegado.noEncontrados.length !== 1 ? 's' : ''} (revisá el nombre):
                              </p>
                              <ul style={{ color: '#8A9BB8' }} className="list-disc list-inside">
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

                <div className="overflow-x-auto mb-6 rounded-xl" style={{ border: '1px solid #2A3548' }}>
                  <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1A2332' }}>
                        <th
                          className="text-left p-2.5 whitespace-nowrap sticky left-0"
                          style={{ color: '#8A9BB8', backgroundColor: '#1A2332' }}
                        >
                          Jugador
                        </th>
                        <th className="text-left p-2.5 whitespace-nowrap" style={{ color: '#7DD3FC' }}>
                          RPE (1-10)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jugadores.map((j, i) => (
                        <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                          <td
                            className="p-2.5 whitespace-nowrap sticky left-0"
                            style={{ color: '#F0F2F5', backgroundColor: i % 2 === 0 ? '#0F1419' : '#151D2A' }}
                          >
                            <div className="flex items-center gap-2">
                              {j.foto_url ? (
                                <img
                                  src={j.foto_url}
                                  alt={`${j.apellido}, ${j.nombre}`}
                                  className="w-6 h-6 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <span
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                                  style={{ backgroundColor: '#1A2332', color: '#8A9BB8' }}
                                >
                                  {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                                </span>
                              )}
                              {j.apellido}, {j.nombre}
                            </div>
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={datos[j.id]?.rpe ?? ''}
                              onChange={(e) => cambiarValor(j.id, e.target.value)}
                              className="w-20 p-1.5 rounded-lg outline-none text-sm"
                              style={{ ...inputStyle, borderColor: '#7DD3FC' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pendientes > 0 && (
                  <p className="text-xs mb-3" style={{ color: '#FBBF24' }}>
                    📴 {pendientes} registro(s) guardados sin conexión, pendientes de sincronizar.
                  </p>
                )}

                {mensaje && (
                  <p
                    className="text-sm mb-4"
                    style={{ color: mensaje.startsWith('Listo') || mensaje.includes('sincronizaron') ? '#4ADE80' : mensaje.startsWith('Sin conexión') || mensaje.startsWith('No se pudo') ? '#FBBF24' : '#F87171' }}
                  >
                    {mensaje}
                  </p>
                )}

                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="w-full sm:w-auto px-6 p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
                >
                  {guardando ? 'Guardando...' : 'Guardar RPE'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default FisicoSection
