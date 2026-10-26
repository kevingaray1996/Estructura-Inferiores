import { WELLNESS, textoWellness } from '../appearance/wellness'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerFechaHoy } from '../utils/fecha'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

// Alias visual: conserva la superficie alternativa original de estos formularios.
const UI = { ...WELLNESS, tarjetaAlternativa: WELLNESS.filaAlternativa }

function CargaEntrenamiento() {
  const [categoria, setCategoria] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaHoy())
  const [posicionesDisponibles, setPosicionesDisponibles] = useState([])
  const [bloques, setBloques] = useState([])
  const [cargando, setCargando] = useState(false)
  const [subTab, setSubTab] = useState('cargar')

  const [descripcion, setDescripcion] = useState('')
  const [duracion, setDuracion] = useState('')
  const [posicionesSeleccionadas, setPosicionesSeleccionadas] = useState([])
  const [aplicaTodas, setAplicaTodas] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const inputStyle = {
    backgroundColor: UI.fondo,
    border: `1px solid ${UI.borde}`,
    color: UI.texto,
  }

  const tarjetaStyle = {
    backgroundColor: UI.tarjeta,
    border: `1px solid ${UI.borde}`,
  }

  useEffect(() => {
    async function cargarCategoria() {
      const cat = await obtenerCategoriaPrimeraDivision()
      setCategoria(cat)
    }
    cargarCategoria()
  }, [])

  useEffect(() => {
    async function cargarPosiciones() {
      if (!categoria) {
        setPosicionesDisponibles([])
        return
      }

      const { data } = await supabase
        .from('jugadores')
        .select('posicion')
        .eq('categoria_id', categoria.id)
        .not('posicion', 'is', null)

      const unicas = [...new Set((data || []).map((j) => j.posicion))]
        .filter(Boolean)
        .sort()

      setPosicionesDisponibles(unicas)
    }

    cargarPosiciones()
  }, [categoria])

  useEffect(() => {
    async function cargarBloques() {
      if (!categoria || !fecha) {
        setBloques([])
        return
      }

      setCargando(true)

      const { data } = await supabase
        .from('entrenamiento_bloques')
        .select('*')
        .eq('categoria_id', categoria.id)
        .eq('fecha', fecha)
        .order('created_at', { ascending: true })

      setBloques(data || [])
      setCargando(false)
    }

    cargarBloques()
  }, [categoria, fecha])

  useEffect(() => {
    async function cargarHistorial() {
      if (!categoria || subTab !== 'historial') return

      setCargandoHistorial(true)

      const { data } = await supabase
        .from('entrenamiento_bloques')
        .select('fecha, duracion_minutos')
        .eq('categoria_id', categoria.id)
        .order('fecha', { ascending: false })

      const porFecha = {}

      ;(data || []).forEach((b) => {
        if (!porFecha[b.fecha]) {
          porFecha[b.fecha] = {
            fecha: b.fecha,
            bloques: 0,
            minutos: 0,
          }
        }

        porFecha[b.fecha].bloques += 1
        porFecha[b.fecha].minutos += b.duracion_minutos || 0
      })

      const filas = Object.values(porFecha).sort((a, b) =>
        b.fecha.localeCompare(a.fecha)
      )

      setHistorial(filas)
      setCargandoHistorial(false)
    }

    cargarHistorial()
  }, [categoria, subTab])

  function limpiarForm() {
    setDescripcion('')
    setDuracion('')
    setPosicionesSeleccionadas([])
    setAplicaTodas(true)
    setEditandoId(null)
  }

  function editarBloque(b) {
    setEditandoId(b.id)
    setDescripcion(b.descripcion)
    setDuracion(String(b.duracion_minutos))

    if (!b.posiciones || b.posiciones.length === 0) {
      setAplicaTodas(true)
      setPosicionesSeleccionadas([])
    } else {
      setAplicaTodas(false)
      setPosicionesSeleccionadas(b.posiciones)
    }
  }

  function togglePosicion(p) {
    setPosicionesSeleccionadas((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function irADia(fechaElegida) {
    setFecha(fechaElegida)
    setSubTab('cargar')
  }

  async function handleGuardarBloque() {
    if (!descripcion || !duracion || !categoria || !fecha) return

    setGuardando(true)

    const datos = {
      fecha,
      categoria_id: categoria.id,
      descripcion,
      duracion_minutos: parseInt(duracion, 10),
      posiciones:
        aplicaTodas || posicionesSeleccionadas.length === 0
          ? null
          : posicionesSeleccionadas,
    }

    if (editandoId) {
      await supabase
        .from('entrenamiento_bloques')
        .update(datos)
        .eq('id', editandoId)
    } else {
      await supabase
        .from('entrenamiento_bloques')
        .insert(datos)
    }

    setGuardando(false)
    limpiarForm()

    const { data } = await supabase
      .from('entrenamiento_bloques')
      .select('*')
      .eq('categoria_id', categoria.id)
      .eq('fecha', fecha)
      .order('created_at', { ascending: true })

    setBloques(data || [])
  }

  async function handleEliminarBloque(id) {
    const confirmar = window.confirm('¿Eliminar este bloque?')
    if (!confirmar) return

    await supabase
      .from('entrenamiento_bloques')
      .delete()
      .eq('id', id)

    setBloques((prev) => prev.filter((b) => b.id !== id))
  }

  const totalMinutos = bloques.reduce(
    (acc, b) => acc + (b.duracion_minutos || 0),
    0
  )

  return (
    <div className="space-y-5" style={{ color: UI.texto }}>
      {/* Encabezado */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{
          background:
            UI.cabeceraCarga,
          border: `1px solid ${UI.borde}`,
        }}
      >
        <div
          className="absolute -right-8 -top-12 w-40 h-40 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(242,194,48,0.15) 0%, rgba(242,194,48,0) 70%)',
          }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2"
              style={{ color: textoWellness(UI.acento) }}
            >
              Comunicaciones · Rendimiento
            </p>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Carga de entrenamiento
            </h2>

            <p
              className="text-sm mt-2 max-w-2xl leading-relaxed"
              style={{ color: UI.secundario }}
            >
              Organización de bloques, duración y posiciones involucradas en
              cada jornada.
            </p>
          </div>

          <span
            className="self-start inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'rgba(242,194,48,0.10)',
              border: '1px solid rgba(242,194,48,0.25)',
              color: textoWellness(UI.acento),
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: UI.acento }}
            />
            Primera División
          </span>
        </div>

        <div
          className="absolute bottom-0 left-0 h-[3px] w-24"
          style={{ backgroundColor: UI.acento }}
        />
      </div>

      {/* Pestañas */}
      <div
        className="grid grid-cols-2 gap-2 rounded-2xl p-2"
        style={{
          backgroundColor: UI.tarjeta,
          border: `1px solid ${UI.borde}`,
        }}
      >
        {[
          { key: 'cargar', label: 'Cargar', icono: '＋' },
          { key: 'historial', label: 'Historial', icono: '◷' },
        ].map((s) => {
          const activo = subTab === s.key

          return (
            <button
              key={s.key}
              onClick={() => setSubTab(s.key)}
              className="flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-semibold transition-all"
              style={
                activo
                  ? {
                      background: UI.primarioWellness,
                      color: '#1A1914',
                      boxShadow: '0 4px 12px rgba(242,194,48,0.10)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: UI.secundario,
                    }
              }
            >
              <span className="text-base">{s.icono}</span>
              {s.label}
            </button>
          )
        })}
      </div>

      {subTab === 'cargar' && (
        <>
          <div>
            <p className="text-sm leading-relaxed" style={{ color: UI.secundario }}>
              Cargá los bloques del entrenamiento del día, indicando la duración
              y a qué jugadoras aplica cada actividad.
            </p>
          </div>

          {/* Fecha y resumen */}
          <div className="rounded-2xl p-4 sm:p-5" style={tarjetaStyle}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <label
                  htmlFor="fecha-entrenamiento"
                  className="block text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: UI.secundario }}
                >
                  Fecha de entrenamiento
                </label>

                <input
                  id="fecha-entrenamiento"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full sm:w-56 p-3 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                />
              </div>

              <div
                className="flex items-center justify-between gap-6 rounded-xl px-4 py-3"
                style={{
                  backgroundColor: UI.fondo,
                  border: `1px solid ${UI.borde}`,
                }}
              >
                <div>
                  <p
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: UI.muted }}
                  >
                    Bloques
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {bloques.length}
                  </p>
                </div>

                <div
                  className="w-px h-9"
                  style={{ backgroundColor: UI.borde }}
                />

                <div>
                  <p
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: UI.muted }}
                  >
                    Duración total
                  </p>
                  <p
                    className="text-xl font-bold tabular-nums"
                    style={{ color: textoWellness(UI.acento) }}
                  >
                    {totalMinutos}
                    <span className="text-xs font-medium ml-1">min</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {!categoria && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{
                backgroundColor: 'rgba(231,121,112,0.08)',
                border: '1px solid rgba(231,121,112,0.25)',
                color: UI.peligro,
              }}
            >
              No se encontró la categoría Primera División.
            </div>
          )}

          {categoria && (
            <>
              {/* Formulario */}
              <div className="rounded-2xl p-4 sm:p-5 space-y-4" style={tarjetaStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1"
                      style={{ color: textoWellness(UI.acento) }}
                    >
                      {editandoId ? 'Modificar actividad' : 'Nueva actividad'}
                    </p>
                    <h3 className="text-lg font-semibold">
                      {editandoId ? 'Editar bloque' : 'Agregar bloque'}
                    </h3>
                  </div>

                  {editandoId && (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: 'rgba(242,194,48,0.10)',
                        color: textoWellness(UI.acento),
                      }}
                    >
                      En edición
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="descripcion-bloque"
                    className="block text-xs font-semibold mb-2"
                    style={{ color: UI.secundario }}
                  >
                    Descripción del bloque
                  </label>

                  <textarea
                    id="descripcion-bloque"
                    placeholder='Ej: "Bloque de definición con pausas de 2 min" o "Despejes y posicionamiento"'
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={3}
                    className="w-full p-3 rounded-xl ui-control outline-none text-sm resize-y"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    htmlFor="duracion-bloque"
                    className="block text-xs font-semibold mb-2"
                    style={{ color: UI.secundario }}
                  >
                    Duración en minutos
                  </label>

                  <input
                    id="duracion-bloque"
                    type="number"
                    min="1"
                    placeholder="Ej: 15"
                    value={duracion}
                    onChange={(e) => setDuracion(e.target.value)}
                    className="w-full sm:w-48 p-3 rounded-xl ui-control outline-none text-sm"
                    style={inputStyle}
                  />
                </div>

                <div
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: UI.fondo,
                    border: `1px solid ${UI.borde}`,
                  }}
                >
                  <label className="flex items-center gap-3 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aplicaTodas}
                      onChange={(e) => {
                        setAplicaTodas(e.target.checked)
                        if (e.target.checked) setPosicionesSeleccionadas([])
                      }}
                      className="w-4 h-4 accent-yellow-400"
                    />

                    <span>
                      <span className="block font-semibold">
                        Aplica a todas las jugadoras
                      </span>
                      <span
                        className="block text-xs mt-1"
                        style={{ color: UI.muted }}
                      >
                        Desactivá esta opción para seleccionar posiciones.
                      </span>
                    </span>
                  </label>

                  {!aplicaTodas && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${UI.borde}` }}>
                      <p
                        className="text-xs font-semibold mb-3"
                        style={{ color: UI.secundario }}
                      >
                        Posiciones incluidas
                      </p>

                      {posicionesDisponibles.length === 0 && (
                        <p className="text-xs" style={{ color: UI.muted }}>
                          No hay posiciones cargadas todavía.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {posicionesDisponibles.map((p) => {
                          const activo = posicionesSeleccionadas.includes(p)

                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => togglePosicion(p)}
                              className="text-xs px-3 py-2 rounded-lg font-medium transition-all"
                              style={{
                                backgroundColor: activo
                                  ? 'rgba(242,194,48,0.13)'
                                  : UI.tarjeta,
                                color: textoWellness(activo ? UI.acento : UI.secundario),
                                border: `1px solid ${
                                  activo
                                    ? 'rgba(242,194,48,0.45)'
                                    : UI.borde
                                }`,
                              }}
                            >
                              {activo ? '✓ ' : ''}
                              {p}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={handleGuardarBloque}
                    disabled={guardando || !descripcion || !duracion}
                    className="flex-1 p-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-85 disabled:opacity-50"
                    style={{
                      background: UI.primarioWellness,
                      color: '#1A1914',
                    }}
                  >
                    {guardando
                      ? 'Guardando…'
                      : editandoId
                      ? 'Guardar cambios'
                      : '+ Agregar bloque'}
                  </button>

                  {editandoId && (
                    <button
                      onClick={limpiarForm}
                      className="px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: UI.fondo,
                        color: UI.secundario,
                        border: `1px solid ${UI.borde}`,
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Bloques del día */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold">Bloques del día</h3>
                    <p className="text-xs mt-1" style={{ color: UI.muted }}>
                      Actividades registradas para esta fecha
                    </p>
                  </div>

                  <span
                    className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: 'rgba(242,194,48,0.10)',
                      color: textoWellness(UI.acento),
                      border: '1px solid rgba(242,194,48,0.20)',
                    }}
                  >
                    {totalMinutos} min
                  </span>
                </div>

                {cargando && (
                  <div
                    className="rounded-xl p-4 text-sm"
                    style={{ ...tarjetaStyle, color: UI.secundario }}
                  >
                    Cargando bloques…
                  </div>
                )}

                {!cargando && bloques.length === 0 && (
                  <div
                    className="rounded-2xl p-7 text-center"
                    style={tarjetaStyle}
                  >
                    <div
                      className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-xl"
                      style={{
                        backgroundColor: 'rgba(242,194,48,0.10)',
                        color: textoWellness(UI.acento),
                      }}
                    >
                      ＋
                    </div>
                    <p className="text-sm font-semibold">
                      Todavía no hay bloques cargados
                    </p>
                    <p className="text-xs mt-1" style={{ color: UI.muted }}>
                      Agregá una actividad para comenzar el registro del día.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {bloques.map((b, i) => (
                    <div
                      key={b.id}
                      className="rounded-2xl p-4 sm:p-5"
                      style={tarjetaStyle}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                          style={{
                            backgroundColor: 'rgba(242,194,48,0.10)',
                            color: textoWellness(UI.acento),
                            border: '1px solid rgba(242,194,48,0.18)',
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-relaxed">
                            {b.descripcion}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5"
                              style={{
                                backgroundColor: UI.fondo,
                                color: textoWellness(UI.acento),
                                border: `1px solid ${UI.borde}`,
                              }}
                            >
                              ◷ {b.duracion_minutos} min
                            </span>

                            <span
                              className="text-xs rounded-lg px-2.5 py-1.5"
                              style={{
                                backgroundColor: UI.fondo,
                                color: UI.secundario,
                                border: `1px solid ${UI.borde}`,
                              }}
                            >
                              {b.posiciones && b.posiciones.length > 0
                                ? b.posiciones.join(', ')
                                : 'Todas las jugadoras'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => editarBloque(b)}
                            aria-label="Editar bloque"
                            title="Editar bloque"
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                            style={{
                              backgroundColor: UI.fondo,
                              color: UI.secundario,
                              border: `1px solid ${UI.borde}`,
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                            </svg>
                          </button>

                          <button
                            onClick={() => handleEliminarBloque(b.id)}
                            aria-label="Eliminar bloque"
                            title="Eliminar bloque"
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                            style={{
                              backgroundColor: 'rgba(231,121,112,0.08)',
                              color: UI.peligro,
                              border: '1px solid rgba(231,121,112,0.18)',
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="m19 6-1 14H6L5 6" />
                              <path d="M10 11v5M14 11v5" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Historial */}
      {subTab === 'historial' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Historial de entrenamientos</h3>
            <p className="text-sm mt-1" style={{ color: UI.secundario }}>
              Consultá los días registrados. Seleccioná una fecha para ver o editar
              sus bloques.
            </p>
          </div>

          <div
            className="grid grid-cols-2 gap-3"
          >
            <div className="rounded-xl p-4" style={tarjetaStyle}>
              <p
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: UI.muted }}
              >
                Días registrados
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {historial.length}
              </p>
            </div>

            <div className="rounded-xl p-4" style={tarjetaStyle}>
              <p
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: UI.muted }}
              >
                Bloques registrados
              </p>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: textoWellness(UI.acento) }}
              >
                {historial.reduce((acc, h) => acc + h.bloques, 0)}
              </p>
            </div>
          </div>

          {cargandoHistorial && (
            <div
              className="rounded-xl p-5 text-sm"
              style={{ ...tarjetaStyle, color: UI.secundario }}
            >
              Cargando historial…
            </div>
          )}

          {!cargandoHistorial && historial.length === 0 && (
            <div className="rounded-2xl p-8 text-center" style={tarjetaStyle}>
              <div
                className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-xl"
                style={{
                  backgroundColor: 'rgba(242,194,48,0.10)',
                  color: textoWellness(UI.acento),
                }}
              >
                ◷
              </div>
              <p className="text-sm font-semibold">
                Todavía no hay entrenamientos registrados
              </p>
              <p className="text-xs mt-1" style={{ color: UI.muted }}>
                Cuando cargues bloques, aparecerán acá.
              </p>
            </div>
          )}

          {!cargandoHistorial && historial.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden"
              style={tarjetaStyle}
            >
              <div className="overflow-x-auto">
                <table
                  className="min-w-full text-sm"
                  style={{ borderCollapse: 'collapse' }}
                >
                  <thead>
                    <tr style={{ backgroundColor: UI.fondo }}>
                      {['Fecha', 'Bloques', 'Minutos totales', ''].map((label, i) => (
                        <th
                          key={`${label}-${i}`}
                          className="text-left p-3 sm:p-4 whitespace-nowrap text-[10px] uppercase tracking-wider font-semibold"
                          style={{
                            color: UI.secundario,
                            borderBottom: `1px solid ${UI.borde}`,
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {historial.map((h, i) => (
                      <tr
                        key={h.fecha}
                        onClick={() => irADia(h.fecha)}
                        className="cursor-pointer transition-colors"
                        style={{
                          backgroundColor:
                            i % 2 === 0 ? 'transparent' : UI.tarjetaAlternativa,
                          borderBottom: `1px solid ${UI.borde}`,
                        }}
                      >
                        <td className="p-3 sm:p-4 whitespace-nowrap font-medium">
                          {h.fecha}
                        </td>

                        <td className="p-3 sm:p-4">
                          <span
                            className="inline-flex items-center justify-center min-w-8 px-2 py-1 rounded-lg text-xs font-semibold"
                            style={{
                              backgroundColor: UI.fondo,
                              color: UI.texto,
                              border: `1px solid ${UI.borde}`,
                            }}
                          >
                            {h.bloques}
                          </span>
                        </td>

                        <td
                          className="p-3 sm:p-4 whitespace-nowrap font-semibold tabular-nums"
                          style={{ color: textoWellness(UI.acento) }}
                        >
                          {h.minutos} min
                        </td>

                        <td
                          className="p-3 sm:p-4 text-right"
                          style={{ color: UI.muted }}
                        >
                          <span className="text-xs font-semibold">
                            Ver día →
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                className="px-4 py-3 text-xs"
                style={{
                  backgroundColor: UI.fondo,
                  color: UI.muted,
                  borderTop: `1px solid ${UI.borde}`,
                }}
              >
                Seleccioná una fila para abrir ese día.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CargaEntrenamiento
