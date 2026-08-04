import { COLORES } from '../theme'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { agregarPendiente, contarPendientes, sincronizarPendientes } from '../utils/colaOffline'
import { generarAsistenciaPDF } from '../utils/generarAsistenciaPDF'

const ESTADOS = [
  { valor: 'presente', label: 'Presente', color: COLORES.exito },
  { valor: 'tarde', label: 'Tarde', color: COLORES.acento },
  { valor: 'ausente', label: 'Ausente', color: COLORES.peligro },
  { valor: 'lesionado', label: 'Lesionado', color: '#FB923C' },
  { valor: 'enfermo', label: 'Enfermo', color: '#7DD3FC' },
]

function AsistenciaSection({ perfil }) {
  const esTecnico = perfil.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [jugadores, setJugadores] = useState([])
  const [asistencias, setAsistencias] = useState({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [pendientes, setPendientes] = useState(0)

  const [mostrarReporte, setMostrarReporte] = useState(false)
  const [reporteDesde, setReporteDesde] = useState(obtenerFechaHoy())
  const [reporteHasta, setReporteHasta] = useState(obtenerFechaHoy())
  const [generandoReporte, setGenerandoReporte] = useState(false)

  const intentarSincronizar = useCallback(async () => {
    if (!navigator.onLine) return
    const sincronizados = await sincronizarPendientes(supabase)
    setPendientes(contarPendientes('asistencia'))
    if (sincronizados > 0) {
      setMensaje(`Se sincronizaron ${sincronizados} registro(s) guardados sin conexión.`)
    }
  }, [])

  useEffect(() => {
    async function ejecutar() {
      setPendientes(contarPendientes('asistencia'))
      intentarSincronizar()
    }
    ejecutar()
    window.addEventListener('online', intentarSincronizar)
    return () => window.removeEventListener('online', intentarSincronizar)
  }, [intentarSincronizar])

  useEffect(() => {
    if (esTecnico) return
    async function cargarCategorias() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [esTecnico])

  useEffect(() => {
    async function cargar() {
      if (!categoriaId || !fecha) {
        setJugadores([])
        return
      }
      setCargando(true)
      setMensaje('')

      const { data: jugadoresData } = await supabase
        .from('jugadores')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('apellido')
      setJugadores(jugadoresData || [])

      const ids = (jugadoresData || []).map((j) => j.id)
      if (ids.length > 0) {
        const { data: asistenciasData } = await supabase
          .from('asistencias')
          .select('*')
          .eq('fecha', fecha)
          .in('jugador_id', ids)
        const mapa = {}
        ;(asistenciasData || []).forEach((a) => {
          mapa[a.jugador_id] = a.estado
        })
        // Por defecto todos presentes; el técnico marca las excepciones.
        ;(jugadoresData || []).forEach((j) => {
          if (!mapa[j.id]) mapa[j.id] = 'presente'
        })
        setAsistencias(mapa)
      } else {
        setAsistencias({})
      }

      setCargando(false)
    }
    cargar()
  }, [categoriaId, fecha])

  function marcar(jugadorId, estado) {
    setAsistencias((prev) => ({
      ...prev,
      [jugadorId]: prev[jugadorId] === estado ? undefined : estado,
    }))
  }

  function marcarTodos(estado) {
    const nuevo = {}
    jugadores.forEach((j) => {
      nuevo[j.id] = estado
    })
    setAsistencias(nuevo)
  }

  async function handleGuardar() {
    setGuardando(true)
    setMensaje('')

    const filas = Object.entries(asistencias)
      .filter(([, estado]) => !!estado)
      .map(([jugadorId, estado]) => ({
        fecha,
        jugador_id: jugadorId,
        estado,
      }))
    const idsSinMarcar = jugadores.map((j) => j.id).filter((id) => !asistencias[id])

    if (!navigator.onLine) {
      agregarPendiente({ tipo: 'asistencia', fecha, filas, idsSinMarcar })
      setPendientes(contarPendientes('asistencia'))
      setGuardando(false)
      setMensaje('Sin conexión: guardado en el dispositivo. Se sincronizará solo cuando vuelva la señal.')
      return
    }

    try {
      if (filas.length > 0) {
        const { error } = await supabase.from('asistencias').upsert(filas, { onConflict: 'fecha,jugador_id' })
        if (error) throw error
      }
      if (idsSinMarcar.length > 0) {
        const { error } = await supabase.from('asistencias').delete().eq('fecha', fecha).in('jugador_id', idsSinMarcar)
        if (error) throw error
      }
      setGuardando(false)
      setMensaje('Listo, asistencia guardada.')
    } catch {
      agregarPendiente({ tipo: 'asistencia', fecha, filas, idsSinMarcar })
      setPendientes(contarPendientes('asistencia'))
      setGuardando(false)
      setMensaje('No se pudo conectar: guardado en el dispositivo. Se sincronizará solo más tarde.')
    }
  }

  async function handleDescargarReporte() {
    if (!categoriaId || !reporteDesde || !reporteHasta) return
    setGenerandoReporte(true)
    try {
      const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre || ''
      await generarAsistenciaPDF(categoriaId, categoriaNombre, reporteDesde, reporteHasta)
    } finally {
      setGenerandoReporte(false)
    }
  }

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          Asistencia
        </h1>

        <div className="mb-6">
          <button
            onClick={() => setMostrarReporte((v) => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.texto, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
          >
            {mostrarReporte ? 'Cerrar' : '📄 Exportar reporte de asistencia'}
          </button>

          {mostrarReporte && (
            <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Desde</label>
                  <input
                    type="date"
                    value={reporteDesde}
                    onChange={(e) => setReporteDesde(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase" style={{ color: COLORES.textoMuted }}>Hasta</label>
                  <input
                    type="date"
                    value={reporteHasta}
                    onChange={(e) => setReporteHasta(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  />
                </div>
              </div>
              <button
                onClick={handleDescargarReporte}
                disabled={!categoriaId || generandoReporte}
                className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
              >
                {generandoReporte ? 'Generando...' : 'Descargar PDF'}
              </button>
              {!categoriaId && (
                <p className="text-xs mt-2" style={{ color: COLORES.textoMuted }}>
                  Elegí una categoría más abajo primero.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
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
        </div>

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

        {!cargando && categoriaId && jugadores.length === 0 && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>
            No hay jugadores cargados en esta categoría.
          </p>
        )}

        {!categoriaId && !esTecnico && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>
            Elegí una categoría para ver el plantel.
          </p>
        )}

        {jugadores.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs" style={{ color: COLORES.textoMuted }}>
                Marcar todos:
              </span>
              {ESTADOS.map((e) => (
                <button
                  key={e.valor}
                  onClick={() => marcarTodos(e.valor)}
                  className="text-xs px-2.5 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoTarjeta, color: e.color, border: '1px solid COLORES.borde' }}
                >
                  {e.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 mb-6">
              {jugadores.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl flex-wrap"
                  style={inputStyle}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {j.foto_url ? (
                      <img
                        src={j.foto_url}
                        alt={`${j.apellido}, ${j.nombre}`}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                      >
                        {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                      </span>
                    )}
                    <p className="text-sm truncate" style={{ color: COLORES.texto }}>
                      {j.apellido}, {j.nombre}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {ESTADOS.map((e) => {
                      const activo = asistencias[j.id] === e.valor
                      return (
                        <button
                          key={e.valor}
                          onClick={() => marcar(j.id, e.valor)}
                          className="text-[10px] px-2 py-1 rounded-full transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: activo ? e.color : COLORES.fondoPagina,
                            color: activo ? COLORES.fondoPagina : COLORES.textoSecundario,
                            fontWeight: activo ? 700 : 400,
                          }}
                        >
                          {e.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {pendientes > 0 && (
              <p className="text-xs mb-3" style={{ color: COLORES.acento }}>
                📴 {pendientes} registro(s) guardados sin conexión, pendientes de sincronizar.
              </p>
            )}

            {mensaje && (
              <p
                className="text-sm mb-4"
                style={{ color: mensaje.startsWith('Listo') || mensaje.includes('sincronizaron') ? COLORES.exito : mensaje.startsWith('Sin conexión') || mensaje.startsWith('No se pudo') ? COLORES.acento : COLORES.peligro }}
              >
                {mensaje}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {guardando ? 'Guardando...' : 'Guardar asistencia'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default AsistenciaSection




