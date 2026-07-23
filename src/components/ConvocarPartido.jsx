import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { FORMACIONES } from '../data/formaciones'
import { CAMPOS_FISICOS } from '../utils/camposFisicos'

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function obtenerRangoSemana(fechaReferencia) {
  const fecha = new Date(`${fechaReferencia}T00:00:00`)
  const dia = fecha.getDay() // 0=domingo...6=sábado
  const diasDesdeLunes = (dia + 6) % 7
  const lunes = new Date(fecha)
  lunes.setDate(fecha.getDate() - diasDesdeLunes)
  const viernes = new Date(lunes)
  viernes.setDate(lunes.getDate() + 4)
  return { lunesISO: fechaISO(lunes), viernesISO: fechaISO(viernes) }
}

const nombresDiaCorto = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie' }
function nombreDiaCorto(fechaStr) {
  const fecha = new Date(`${fechaStr}T00:00:00`)
  return nombresDiaCorto[fecha.getDay()] || fechaStr
}

const estadoConfig = {
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
  suspendido: { color: '#F87171', label: 'Suspendido' },
  no_disponible: { color: '#8A9BB8', label: 'No disponible' },
}

const statsVacias = {
  minutos: '',
  goles: 0,
  asistencias: 0,
  amarillas: 0,
  rojas: 0,
  titular: false,
  observaciones: '',
  link: '',
  pdfUrl: '',
  capitan: false,
}

function ConvocarPartido({ partidoId, categoriaId, onVolver, onIrAFisico }) {
  const [partido, setPartido] = useState(null)
  const [jugadores, setJugadores] = useState([])
  const [tab, setTab] = useState('convocados') // 'convocados' | 'formacion' | 'destacados'

  const [citacionesExistentes, setCitacionesExistentes] = useState([])
  const [convocados, setConvocados] = useState({}) // jugadorId -> dorsal (string)
  const [stats, setStats] = useState({}) // jugadorId -> statsVacias
  const [datosFisicos, setDatosFisicos] = useState({})
  const [inasistenciasSemana, setInasistenciasSemana] = useState({}) // jugadorId -> array de fechas ausente/enfermo esta semana

  const [formacion, setFormacion] = useState('4-4-2') // ahora es solo una etiqueta de referencia
  const [posiciones, setPosiciones] = useState({}) // jugadorId -> { x, y } en % (0-100) dentro de la cancha
  const [arrastrando, setArrastrando] = useState(null) // jugadorId que se está moviendo
  const fieldRef = useRef(null)

  const [destacadosRival, setDestacadosRival] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [guardadoMsg, setGuardadoMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const inputStyle = {
    backgroundColor: '#0F1419',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  useEffect(() => {
    cargarDatos()
  }, [partidoId, categoriaId])

  async function cargarDatos() {
    const { data: partidoData } = await supabase
      .from('partidos')
      .select('*')
      .eq('id', partidoId)
      .single()
    setPartido(partidoData)
    if (partidoData?.formacion) setFormacion(partidoData.formacion)
    setDestacadosRival(partidoData?.destacados_rival || '')

    const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
    const { data: jugadoresData } = await obtenerJugadoresDeCategoria(supabase, categoriaId, categoriasData)
    setJugadores(jugadoresData || [])

    if (partidoData?.fecha && jugadoresData?.length) {
      const { lunesISO, viernesISO } = obtenerRangoSemana(partidoData.fecha)
      const idsJugadores = jugadoresData.map((j) => j.id)
      const { data: ausenciasData } = await supabase
        .from('asistencias')
        .select('jugador_id, fecha')
        .in('estado', ['ausente', 'enfermo'])
        .gte('fecha', lunesISO)
        .lte('fecha', viernesISO)
        .in('jugador_id', idsJugadores)

      const mapaAusencias = {}
      ;(ausenciasData || []).forEach((a) => {
        if (!mapaAusencias[a.jugador_id]) mapaAusencias[a.jugador_id] = []
        mapaAusencias[a.jugador_id].push(a.fecha)
      })
      setInasistenciasSemana(mapaAusencias)
    }

    const { data: citacionesData } = await supabase
      .from('citaciones')
      .select('*')
      .eq('partido_id', partidoId)
    setCitacionesExistentes(citacionesData || [])

    const mapaConvocados = {}
    const posicionesGuardadas = {}
    ;(citacionesData || []).forEach((c) => {
      mapaConvocados[c.jugador_id] = c.dorsal ?? ''
      if (c.titular && c.posicion_cancha && c.posicion_cancha.includes(',')) {
        const [xStr, yStr] = c.posicion_cancha.split(',')
        const x = parseFloat(xStr)
        const y = parseFloat(yStr)
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          posicionesGuardadas[c.jugador_id] = { x, y }
        }
      }
    })
    setConvocados(mapaConvocados)
    setPosiciones(posicionesGuardadas)

    const { data: statsData } = await supabase
      .from('estadisticas_jugador')
      .select('*')
      .eq('partido_id', partidoId)
    const mapaStats = {}
    ;(statsData || []).forEach((s) => {
      mapaStats[s.jugador_id] = {
        minutos: s.minutos_jugados ?? '',
        goles: s.goles ?? 0,
        asistencias: s.asistencias ?? 0,
        amarillas: s.tarjetas_amarillas ?? 0,
        rojas: s.tarjetas_rojas ?? 0,
        titular: s.titular ?? false,
        observaciones: s.observaciones ?? '',
        link: s.link ?? '',
        pdfUrl: s.pdf_url ?? '',
        capitan: s.capitan ?? false,
      }
    })
    setStats(mapaStats)

    const { data: fisicosData } = await supabase
      .from('sesiones_fisicas')
      .select('*')
      .eq('partido_id', partidoId)
    const mapaFisicos = {}
    ;(fisicosData || []).forEach((f) => {
      mapaFisicos[f.jugador_id] = f
    })
    setDatosFisicos(mapaFisicos)
  }

  function toggleConvocado(jugadorId, bloqueado) {
    if (bloqueado) return
    setConvocados((prev) => {
      const copia = { ...prev }
      if (jugadorId in copia) {
        delete copia[jugadorId]
      } else {
        copia[jugadorId] = ''
      }
      return copia
    })
  }

  function actualizarDorsal(jugadorId, valor) {
    setConvocados((prev) => ({ ...prev, [jugadorId]: valor }))
  }

  function actualizarStat(jugadorId, campo, valor) {
    setStats((prev) => ({
      ...prev,
      [jugadorId]: { ...(prev[jugadorId] || statsVacias), [campo]: valor },
    }))
  }

  async function handleGuardarConvocados() {
    setErrorMsg('')
    const idsActuales = Object.keys(convocados)
    if (idsActuales.length === 0) {
      setErrorMsg('Convocá al menos un jugador.')
      return
    }
    setGuardando(true)

    // Borrar los que ya no están convocados
    const aBorrar = citacionesExistentes.filter((c) => !idsActuales.includes(c.jugador_id))
    for (const c of aBorrar) {
      await supabase.from('citaciones').delete().eq('id', c.id)
    }

    // Actualizar o crear (sin pisar titular/posicion_cancha de la Formación)
    for (const jugadorId of idsActuales) {
      const existente = citacionesExistentes.find((c) => c.jugador_id === jugadorId)
      const dorsalValor = convocados[jugadorId] ? parseInt(convocados[jugadorId], 10) : null
      if (existente) {
        await supabase.from('citaciones').update({ dorsal: dorsalValor }).eq('id', existente.id)
      } else {
        await supabase.from('citaciones').insert({
          partido_id: partidoId,
          jugador_id: jugadorId,
          dorsal: dorsalValor,
          titular: false,
        })
      }
    }

    // Estadísticas
    await supabase.from('estadisticas_jugador').delete().eq('partido_id', partidoId)
    const filas = Object.entries(stats)
      .filter(([, s]) => s.minutos !== '' && s.minutos != null)
      .map(([jugadorId, s]) => ({
        jugador_id: jugadorId,
        partido_id: partidoId,
        minutos_jugados: parseInt(s.minutos, 10) || 0,
        goles: parseInt(s.goles, 10) || 0,
        asistencias: parseInt(s.asistencias, 10) || 0,
        tarjetas_amarillas: parseInt(s.amarillas, 10) || 0,
        tarjetas_rojas: parseInt(s.rojas, 10) || 0,
        titular: !!s.titular,
        observaciones: s.observaciones || null,
        link: s.link || null,
        pdf_url: s.pdfUrl || null,
        capitan: !!s.capitan,
      }))
    if (filas.length > 0) {
      await supabase.from('estadisticas_jugador').insert(filas)
    }

    const { data: nuevasCitaciones } = await supabase
      .from('citaciones')
      .select('*')
      .eq('partido_id', partidoId)
    setCitacionesExistentes(nuevasCitaciones || [])

    setGuardando(false)
    setGuardadoMsg('Convocados y estadísticas guardados')
    setTimeout(() => setGuardadoMsg(''), 2000)
  }

  // --- Formación: arrastre libre ---
  useEffect(() => {
    if (!arrastrando) return

    function obtenerPunto(e) {
      return e.touches && e.touches[0] ? e.touches[0] : e
    }

    function mover(e) {
      if (!fieldRef.current) return
      const punto = obtenerPunto(e)
      const rect = fieldRef.current.getBoundingClientRect()
      let x = ((punto.clientX - rect.left) / rect.width) * 100
      let y = ((punto.clientY - rect.top) / rect.height) * 100
      x = Math.max(3, Math.min(97, x))
      y = Math.max(3, Math.min(97, y))
      setPosiciones((prev) => ({ ...prev, [arrastrando]: { x, y } }))
      if (e.cancelable) e.preventDefault()
    }

    function soltar() {
      setArrastrando(null)
    }

    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    window.addEventListener('touchmove', mover, { passive: false })
    window.addEventListener('touchend', soltar)
    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      window.removeEventListener('touchmove', mover)
      window.removeEventListener('touchend', soltar)
    }
  }, [arrastrando])

  function agregarACancha(jugadorId) {
    setPosiciones((prev) => ({ ...prev, [jugadorId]: prev[jugadorId] || { x: 50, y: 50 } }))
  }

  function quitarDeCancha(jugadorId) {
    setPosiciones((prev) => {
      const copia = { ...prev }
      delete copia[jugadorId]
      return copia
    })
  }

  async function handleGuardarFormacion() {
    setGuardando(true)
    await supabase.from('partidos').update({ formacion }).eq('id', partidoId)

    for (const c of citacionesExistentes) {
      const pos = posiciones[c.jugador_id]
      await supabase
        .from('citaciones')
        .update({
          titular: !!pos,
          posicion_cancha: pos ? `${pos.x.toFixed(2)},${pos.y.toFixed(2)}` : null,
        })
        .eq('id', c.id)
    }

    const { data: nuevasCitaciones } = await supabase
      .from('citaciones')
      .select('*')
      .eq('partido_id', partidoId)
    setCitacionesExistentes(nuevasCitaciones || [])

    setGuardando(false)
    setGuardadoMsg('Formación guardada')
    setTimeout(() => setGuardadoMsg(''), 2000)
  }

  async function handleGuardarDestacados() {
    setGuardando(true)
    await supabase.from('partidos').update({ destacados_rival: destacadosRival || null }).eq('id', partidoId)
    setGuardando(false)
    setGuardadoMsg('Destacados del rival guardados')
    setTimeout(() => setGuardadoMsg(''), 2000)
  }

  if (!partido) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  const cantidadConvocados = Object.keys(convocados).length
  const convocadosOrdenados = Object.keys(convocados)
    .map((jugadorId) => ({
      jugadorId,
      dorsal: convocados[jugadorId] ? parseInt(convocados[jugadorId], 10) : null,
      jugador: jugadores.find((j) => j.id === jugadorId),
    }))
    .sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))

  const enCancha = convocadosOrdenados.filter((c) => posiciones[c.jugadorId])
  const enBanco = convocadosOrdenados.filter((c) => !posiciones[c.jugadorId])

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <h1
          className="text-2xl md:text-3xl mb-1 flex items-center gap-2.5"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          {partido.escudo_url ? (
            <img
              src={partido.escudo_url}
              alt={partido.rival}
              className="w-8 h-8 rounded object-contain shrink-0"
              style={{ backgroundColor: '#0F1419' }}
            />
          ) : (
            <span
              className="w-8 h-8 rounded flex items-center justify-center text-sm shrink-0"
              style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
            >
              🛡️
            </span>
          )}
          vs {partido.rival}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#8A9BB8' }}>
          {partido.fecha} {partido.hora && `· ${partido.hora}`} {partido.lugar && `· ${partido.lugar}`}
          {partido.local_visitante && ` · ${partido.local_visitante}`}
        </p>

        <div className="flex gap-2 mb-6">
          {[
            { key: 'convocados', label: 'Convocados' },
            { key: 'formacion', label: 'Formación' },
            { key: 'destacados', label: 'Destacados - Rival' },
          ].map((t) => (
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

        {tab === 'convocados' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
                Convocatoria y estadísticas
              </p>
              <span className="text-xs font-mono" style={{ color: '#8A9BB8' }}>
                {cantidadConvocados} convocados
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl mb-6" style={{ border: '1px solid #2A3548' }}>
              <table className="min-w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1A2332' }}>
                    <th className="p-2 text-left sticky left-0 whitespace-nowrap" style={{ color: '#8A9BB8', backgroundColor: '#1A2332' }}>
                      Jugador
                    </th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Conv.</th>
                    <th className="p-2" style={{ color: '#7DD3FC' }}>Titular</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Dorsal</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Min</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Goles</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Asist</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Amar</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Roja</th>
                    <th className="p-2" style={{ color: '#FBBF24' }}>Cap.</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>Link</th>
                    <th className="p-2" style={{ color: '#8A9BB8' }}>PDF</th>
                    <th className="p-2 text-left" style={{ color: '#8A9BB8' }}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((j, i) => {
                    const marcado = j.id in convocados
                    const estadoInfo = estadoConfig[j.estado]
                    const ausenciasDelJugador = inasistenciasSemana[j.id] || []
                    const bloqueadoPorInasistencia = ausenciasDelJugador.length >= 2
                    const bloqueado = !!estadoInfo || bloqueadoPorInasistencia
                    const s = stats[j.id] || statsVacias
                    return (
                      <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A', opacity: bloqueado ? 0.5 : 1 }}>
                        <td
                          className="p-2 whitespace-nowrap sticky left-0"
                          style={{ color: '#F0F2F5', backgroundColor: i % 2 === 0 ? '#0F1419' : '#151D2A' }}
                        >
                          {j.apellido}, {j.nombre}
                          {estadoInfo && (
                            <span className="block" style={{ color: estadoInfo.color, fontSize: '10px' }}>
                              {estadoInfo.label}
                              {j.estado_detalle && ` — ${j.estado_detalle}`}
                            </span>
                          )}
                          {!estadoInfo && bloqueadoPorInasistencia && (
                            <span className="block" style={{ color: '#F87171', fontSize: '10px' }}>
                              No convocable: faltó {ausenciasDelJugador.length} días esta semana (
                              {ausenciasDelJugador.map(nombreDiaCorto).join(', ')})
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={bloqueado}
                            onChange={() => toggleConvocado(j.id, bloqueado)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          {marcado && (
                            <input
                              type="checkbox"
                              checked={s.titular}
                              onChange={(e) => actualizarStat(j.id, 'titular', e.target.checked)}
                            />
                          )}
                        </td>
                        <td className="p-2">
                          {marcado && (
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={convocados[j.id]}
                              onChange={(e) => actualizarDorsal(j.id, e.target.value)}
                              className="w-12 p-1 rounded text-center outline-none"
                              style={inputStyle}
                            />
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max="120"
                            value={s.minutos}
                            onChange={(e) => actualizarStat(j.id, 'minutos', e.target.value)}
                            className="w-14 p-1 rounded text-center outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            value={s.goles}
                            onChange={(e) => actualizarStat(j.id, 'goles', e.target.value)}
                            className="w-12 p-1 rounded text-center outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            value={s.asistencias}
                            onChange={(e) => actualizarStat(j.id, 'asistencias', e.target.value)}
                            className="w-12 p-1 rounded text-center outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max="2"
                            value={s.amarillas}
                            onChange={(e) => actualizarStat(j.id, 'amarillas', e.target.value)}
                            className="w-12 p-1 rounded text-center outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max="1"
                            value={s.rojas}
                            onChange={(e) => actualizarStat(j.id, 'rojas', e.target.value)}
                            className="w-12 p-1 rounded text-center outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={s.capitan}
                            onChange={(e) => actualizarStat(j.id, 'capitan', e.target.checked)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={s.link}
                            onChange={(e) => actualizarStat(j.id, 'link', e.target.value)}
                            placeholder="https://..."
                            className="w-24 p-1 rounded outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={s.pdfUrl}
                            onChange={(e) => actualizarStat(j.id, 'pdfUrl', e.target.value)}
                            placeholder="https://..."
                            className="w-24 p-1 rounded outline-none"
                            style={inputStyle}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={s.observaciones}
                            onChange={(e) => actualizarStat(j.id, 'observaciones', e.target.value)}
                            className="w-40 p-1 rounded outline-none"
                            style={inputStyle}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {errorMsg && (
              <p className="text-sm mb-4" style={{ color: '#F87171' }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleGuardarConvocados}
              disabled={guardando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar convocados y estadísticas'}
            </button>

            <div className="flex items-center justify-between mt-10 mb-3">
              <p className="text-xs uppercase tracking-wide" style={{ color: '#5B6B85' }}>
                Físico (GPS)
              </p>
              {onIrAFisico && (
                <button
                  onClick={() => onIrAFisico(partidoId)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
                >
                  📊 Cargar/editar físico
                </button>
              )}
            </div>

            {Object.keys(datosFisicos).length === 0 ? (
              <p className="text-sm" style={{ color: '#5B6B85' }}>
                Todavía no hay datos físicos cargados para este partido.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #2A3548' }}>
                <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1A2332' }}>
                      <th
                        className="text-left p-2.5 whitespace-nowrap sticky left-0"
                        style={{ color: '#8A9BB8', backgroundColor: '#1A2332' }}
                      >
                        Jugador
                      </th>
                      {CAMPOS_FISICOS.map((c) => (
                        <th key={c.clave} className="text-left p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                          {c.label}
                        </th>
                      ))}
                      <th className="text-left p-2.5 whitespace-nowrap" style={{ color: '#7DD3FC' }}>
                        RPE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jugadores
                      .filter((j) => datosFisicos[j.id])
                      .map((j, i) => (
                        <tr key={j.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : '#151D2A' }}>
                          <td
                            className="p-2.5 whitespace-nowrap sticky left-0"
                            style={{ color: '#F0F2F5', backgroundColor: i % 2 === 0 ? '#0F1419' : '#151D2A' }}
                          >
                            {j.apellido}, {j.nombre}
                          </td>
                          {CAMPOS_FISICOS.map((c) => (
                            <td key={c.clave} className="p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                              {datosFisicos[j.id][c.clave] ?? '—'}
                            </td>
                          ))}
                          <td className="p-2.5 whitespace-nowrap" style={{ color: '#7DD3FC' }}>
                            {datosFisicos[j.id].rpe ?? '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'formacion' && (
          <>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Esquema (referencia)
              </label>
              <select
                value={formacion}
                onChange={(e) => setFormacion(e.target.value)}
                className="p-2.5 rounded-xl outline-none text-sm"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#F0F2F5' }}
              >
                {Object.keys(FORMACIONES).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs mb-3" style={{ color: '#5B6B85' }}>
              Arrastrá a cada jugador desde el banco hacia la cancha, y movelo libremente donde quieras.
            </p>

            <div className="grid md:grid-cols-[1fr_260px] gap-6 mb-6">
              <div
                ref={fieldRef}
                className="relative mx-auto w-full rounded-2xl overflow-hidden select-none"
                style={{
                  maxWidth: 380,
                  aspectRatio: '68 / 100',
                  backgroundColor: '#183A2A',
                  border: '1px solid #2A3548',
                  touchAction: 'none',
                }}
              >
                <div
                  className="absolute left-0 right-0"
                  style={{ top: '50%', borderTop: '1px solid rgba(240,242,245,0.15)' }}
                />
                <div
                  className="absolute rounded-full"
                  style={{
                    width: '22%',
                    aspectRatio: '1 / 1',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '1px solid rgba(240,242,245,0.15)',
                  }}
                />
                <div
                  className="absolute"
                  style={{
                    width: '44%',
                    height: '9%',
                    bottom: 0,
                    left: '28%',
                    border: '1px solid rgba(240,242,245,0.15)',
                    borderBottom: 'none',
                  }}
                />

                {enCancha.map((c) => {
                  const pos = posiciones[c.jugadorId]
                  return (
                    <div
                      key={c.jugadorId}
                      onMouseDown={() => setArrastrando(c.jugadorId)}
                      onTouchStart={() => setArrastrando(c.jugadorId)}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        transform: 'translate(-50%, -50%)',
                        cursor: 'grab',
                        zIndex: arrastrando === c.jugadorId ? 10 : 1,
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full text-sm font-bold"
                        style={{
                          width: 34,
                          height: 34,
                          backgroundColor: '#4ADE80',
                          color: '#0F1419',
                          border: '2px solid #4ADE80',
                          fontFamily: "'Archivo Black', sans-serif",
                          boxShadow: arrastrando === c.jugadorId ? '0 0 0 3px rgba(74,222,128,0.4)' : 'none',
                        }}
                      >
                        {c.dorsal ?? '·'}
                      </div>
                      <p
                        className="text-[9px] mt-1 px-1 rounded text-center whitespace-nowrap"
                        style={{ backgroundColor: 'rgba(15,20,25,0.7)', color: '#F0F2F5', maxWidth: 76 }}
                      >
                        {c.jugador?.apellido}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          quitarDeCancha(c.jugadorId)
                        }}
                        className="text-[9px] mt-0.5 px-1.5 rounded-full"
                        style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>

              <div>
                <p className="text-xs tracking-widest uppercase mb-3" style={{ color: '#5B6B85' }}>
                  Banco ({enBanco.length})
                </p>
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  {enBanco.map((c) => (
                    <button
                      key={c.jugadorId}
                      onClick={() => agregarACancha(c.jugadorId)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-left hover:opacity-80"
                      style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
                    >
                      <span
                        className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0"
                        style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                      >
                        {c.dorsal ?? '·'}
                      </span>
                      <span style={{ color: '#F0F2F5' }} className="truncate">
                        {c.jugador?.apellido}, {c.jugador?.nombre}
                      </span>
                    </button>
                  ))}
                  {enBanco.length === 0 && (
                    <p className="text-xs" style={{ color: '#5B6B85' }}>
                      Todos los convocados están en la cancha.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleGuardarFormacion}
              disabled={guardando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar formación'}
            </button>
          </>
        )}

        {tab === 'destacados' && (
          <>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Jugadores destacados del rival
            </label>
            <textarea
              value={destacadosRival}
              onChange={(e) => setDestacadosRival(e.target.value)}
              rows={10}
              placeholder="Ej: #9 delantero rápido por izquierda, buen juego aéreo..."
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-y mb-6"
              style={inputStyle}
            />
            <button
              onClick={handleGuardarDestacados}
              disabled={guardando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar destacados'}
            </button>
          </>
        )}

        {guardadoMsg && (
          <p className="text-sm text-center mt-3" style={{ color: '#4ADE80' }}>
            ✅ {guardadoMsg}
          </p>
        )}
      </div>
    </div>
  )
}

export default ConvocarPartido
