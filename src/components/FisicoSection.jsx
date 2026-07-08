import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { CAMPOS_FISICOS as CAMPOS } from '../utils/camposFisicos'

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

function FisicoSection({ perfil, partidoInicialId, onConsumirPartidoInicial }) {
  const esTecnico = perfil.rol === 'tecnico'
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
  const partidoForzadoRef = useRef(false)

  useEffect(() => {
    if (esTecnico) return
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
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
        partidoForzadoRef.current = true
        setCategoriaId(partido.categoria_id)
        setFecha(partido.fecha)
        setTipo('partido')
        setPartidoId(partido.id)
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

      const { data: jugadoresData } = await supabase
        .from('jugadores')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('apellido')
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: sesionesData } = await supabase
          .from('sesiones_fisicas')
          .select('*')
          .eq('fecha', fecha)
          .eq('tipo', tipo)
          .in('jugador_id', ids)
        const mapa = {}
        ;(sesionesData || []).forEach((s) => {
          mapa[s.jugador_id] = s
        })
        setDatos(mapa)
        if (partidoForzadoRef.current) {
          partidoForzadoRef.current = false
        } else {
          const partidoExistente = (sesionesData || []).find((s) => s.partido_id)?.partido_id
          setPartidoId(partidoExistente || '')
        }
      } else {
        setDatos({})
        if (partidoForzadoRef.current) {
          partidoForzadoRef.current = false
        } else {
          setPartidoId('')
        }
      }

      setCargando(false)
    }
    cargar()
  }, [categoriaId, fecha, tipo])

  function cambiarValor(jugadorId, campo, valor) {
    setDatos((prev) => ({
      ...prev,
      [jugadorId]: {
        ...prev[jugadorId],
        [campo]: valor,
      },
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

      // Últimas 6 columnas son las métricas, en el mismo orden que CAMPOS.
      // Todo lo anterior es el nombre (puede venir en 1 o 2 columnas: "Apellido, Nombre" o separado).
      const valores = partes.slice(-CAMPOS.length)
      const columnasNombre = partes.slice(0, partes.length - valores.length)
      const nombrePegado = columnasNombre.join(' ')

      if (!nombrePegado) return

      const claveBuscada = normalizarNombre(nombrePegado)
      const match = jugadoresConNombre.find((j) => j.claveNombre === claveBuscada)

      if (!match) {
        noEncontrados.push(`Fila ${i + 1}: "${nombrePegado}"`)
        return
      }

      const fila = { ...nuevoDatos[match.jugador.id] }
      CAMPOS.forEach((c, idx) => {
        const v = (valores[idx] ?? '').toString().replace(',', '.').trim()
        if (v !== '') fila[c.clave] = v
      })
      nuevoDatos[match.jugador.id] = fila
      aplicados++
    })

    setDatos(nuevoDatos)
    setResultadoPegado({ aplicados, noEncontrados })
  }

  function tieneAlgunValor(fila) {
    if (!fila) return false
    return CAMPOS.some((c) => fila[c.clave] !== undefined && fila[c.clave] !== '' && fila[c.clave] !== null)
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = jugadores
      .filter((j) => tieneAlgunValor(datos[j.id]))
      .map((j) => {
        const fila = datos[j.id] || {}
        const registro = {
          fecha,
          jugador_id: j.id,
          tipo,
          partido_id: tipo === 'partido' && partidoId ? partidoId : null,
        }
        CAMPOS.forEach((c) => {
          const v = fila[c.clave]
          registro[c.clave] = v === '' || v === undefined || v === null ? null : Number(v)
        })
        return registro
      })

    if (filas.length > 0) {
      const { error } = await supabase
        .from('sesiones_fisicas')
        .upsert(filas, { onConflict: 'fecha,jugador_id,tipo' })
      if (error) {
        setMensaje('Error al guardar: ' + error.message)
        setGuardando(false)
        return
      }
    }

    const idsSinDatos = jugadores.map((j) => j.id).filter((id) => !tieneAlgunValor(datos[id]))
    if (idsSinDatos.length > 0) {
      await supabase
        .from('sesiones_fisicas')
        .delete()
        .eq('fecha', fecha)
        .eq('tipo', tipo)
        .in('jugador_id', idsSinDatos)
    }

    setGuardando(false)
    setMensaje('Listo, datos físicos guardados.')
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

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
          Métricas resumen de GPS (Catapult) por jugador y sesión.
        </p>

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
                    Pegá las filas copiadas del reporte de Catapult (una fila por jugador). Columnas: Nombre (o
                    Apellido y Nombre), Dist. total, Dist. alta int., Sprints, Vel. máx, Player Load, Minutos.
                  </p>
                  <textarea
                    value={textoPegado}
                    onChange={(e) => setTextoPegado(e.target.value)}
                    placeholder={'Pérez, Juan\t5200\t800\t18\t28.5\t420\t75\nGómez, Martín\t4900\t750\t15\t27.1\t390\t70'}
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
                    {CAMPOS.map((c) => (
                      <th key={c.clave} className="text-left p-2.5 whitespace-nowrap" style={{ color: '#8A9BB8' }}>
                        {c.label}
                      </th>
                    ))}
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
                      {CAMPOS.map((c) => (
                        <td key={c.clave} className="p-1.5">
                          <input
                            type="number"
                            value={datos[j.id]?.[c.clave] ?? ''}
                            onChange={(e) => cambiarValor(j.id, c.clave, e.target.value)}
                            className="w-24 p-1.5 rounded-lg outline-none text-sm"
                            style={inputStyle}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mensaje && (
              <p className="text-sm mb-4" style={{ color: mensaje.startsWith('Listo') ? '#4ADE80' : '#F87171' }}>
                {mensaje}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full sm:w-auto px-6 p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : 'Guardar datos físicos'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default FisicoSection
