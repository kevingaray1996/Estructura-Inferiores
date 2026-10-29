import EntrenamientoDeHoy from './EntrenamientoDeHoy'
import { WELLNESS as UI, textoWellness } from '../appearance/wellness'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { cargarDatosBienestar } from '../utils/bienestar'
import { generarBienestarPDF } from '../utils/generarBienestarPDF'
import { generarBienestarCategoriaPDF } from '../utils/generarBienestarCategoriaPDF'
import { calcularWellnessZScore } from '../utils/semaforoRiesgo'

// Paleta exclusiva de pantalla; informes y escalas conservan sus valores.

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function promedio(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length === 0) return null
  return limpios.reduce((a, b) => a + b, 0) / limpios.length
}

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function restarDias(fecha, dias) {
  const d = new Date(fecha)
  d.setDate(d.getDate() - dias)
  return d
}

function MiniLinea({ serie, escalaMax, color }) {
  if (serie.length === 0) {
    return (
      <p className="text-xs py-4" style={{ color: UI.muted }}>
        Sin registros en este período.
      </p>
    )
  }

  const ancho = 320
  const alto = 90
  const paddingX = 10
  const paddingY = 10

  const puntos = serie.map((s, i) => {
    const x = serie.length === 1
      ? ancho / 2
      : paddingX + (i / (serie.length - 1)) * (ancho - paddingX * 2)
    const y = paddingY + (1 - s.valor / escalaMax) * (alto - paddingY * 2)
    return { x, y, valor: s.valor, fecha: s.fecha }
  })

  const pathD = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${ancho} ${alto + 16}`} width="100%" height={alto + 16}>
      <path
        d={pathD}
        fill="none"
        stroke={textoWellness(color)}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={textoWellness(color)} />
      ))}
      {puntos.map((p, i) => (
        <text
          key={`t-${i}`}
          x={p.x}
          y={alto + 14}
          fontSize="7"
          fill={UI.muted}
          textAnchor="middle"
        >
          {p.fecha.slice(5).replace('-', '/')}
        </text>
      ))}
    </svg>
  )
}

function BienestarComparativo({ perfil, jugadorInicialId, onConsumirJugadorInicial }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [jugadores, setJugadores] = useState([])
  const [jugadorId, setJugadorId] = useState('')
  const [periodo, setPeriodo] = useState('semana')
  const [metricas, setMetricas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const [resumenGeneral, setResumenGeneral] = useState([])
  const [cargandoGeneral, setCargandoGeneral] = useState(false)

  async function handleDescargarPdf() {
    setGenerandoPdf(true)
    try {
      if (jugadorId && jugadorSeleccionado) {
        await generarBienestarPDF(jugadorSeleccionado, periodo)
      } else {
        const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre
        await generarBienestarCategoriaPDF(categoriaNombre, resumenGeneral)
      }
    } finally {
      setGenerandoPdf(false)
    }
  }

  useEffect(() => {
    if (esTecnico) return

    async function cargarCategoriaPrimera() {
      const [{ data }, primera] = await Promise.all([
        supabase.from('categorias').select('*').order('orden'),
        obtenerCategoriaPrimeraDivision(),
      ])

      const lista = data || []
      setCategorias(lista)
      setCategoriaId(primera?.id || '')
    }

    cargarCategoriaPrimera()
  }, [esTecnico])

  useEffect(() => {
    async function aplicarJugadorInicial() {
      if (!jugadorInicialId) return

      const { data: jugadorData } = await supabase
        .from('jugadores')
        .select('id, categoria_id')
        .eq('id', jugadorInicialId)
        .single()

      if (jugadorData) {
        setCategoriaId(jugadorData.categoria_id)
        setJugadorId(jugadorData.id)
      }

      onConsumirJugadorInicial?.()
    }

    aplicarJugadorInicial()
  }, [jugadorInicialId, onConsumirJugadorInicial])

  useEffect(() => {
    async function cargarJugadores() {
      if (!categoriaId) {
        setJugadores([])
        return
      }

      const { data: categoriasData } = await supabase
        .from('categorias')
        .select('id, es_reserva')

      const { data } = await obtenerJugadoresDeCategoria(
        supabase,
        categoriaId,
        categoriasData,
        { soloDisponibles: true }
      )

      setJugadores(data || [])
    }

    cargarJugadores()
  }, [categoriaId])

  useEffect(() => {
    async function cargar() {
      if (!jugadorId) {
        setMetricas(null)
        return
      }

      setCargando(true)
      const { metricas: m } = await cargarDatosBienestar(jugadorId, periodo)
      setMetricas(m)
      setCargando(false)
    }

    cargar()
  }, [jugadorId, periodo])

  useEffect(() => {
    async function cargarGeneral() {
      if (jugadorId || jugadores.length === 0) {
        setResumenGeneral([])
        return
      }

      setCargandoGeneral(true)

      const hoy = new Date()
      const desdeSemana = fechaISO(restarDias(hoy, 6))
      const desdeMes = fechaISO(restarDias(hoy, 27))
      const hoyISO = fechaISO(hoy)

      const ids = jugadores.map((j) => j.id)

      const { data: bienestarData } = await supabase
        .from('bienestar')
        .select('jugador_id, fecha, sueno, dolor_muscular, fatiga, estres, animo_entrenar')
        .in('jugador_id', ids)
        .gte('fecha', desdeMes)
        .lte('fecha', hoyISO)

      const porJugador = {}

      ;(bienestarData || []).forEach((b) => {
        if (!porJugador[b.jugador_id]) porJugador[b.jugador_id] = []

        const prom = promedio([
          b.sueno,
          b.dolor_muscular,
          b.fatiga,
          b.estres,
          b.animo_entrenar,
        ])

        if (prom !== null) {
          porJugador[b.jugador_id].push({ fecha: b.fecha, valor: prom })
        }
      })

      const resultadosNivel = await Promise.all(
        jugadores.map((j) => calcularWellnessZScore(j.id))
      )

      const filas = jugadores.map((j, i) => {
        const registros = porJugador[j.id] || []
        const promedioSemanal = promedio(
          registros.filter((r) => r.fecha >= desdeSemana).map((r) => r.valor)
        )
        const promedioMensual = promedio(registros.map((r) => r.valor))

        return {
          jugador: j,
          respuestas: registros.length,
          promedioSemanal,
          promedioMensual,
          nivel: resultadosNivel[i]?.nivel ?? null,
        }
      })

      setResumenGeneral(filas)
      setCargandoGeneral(false)
    }

    cargarGeneral()
  }, [jugadorId, jugadores])

  const jugadorSeleccionado = jugadores.find((j) => j.id === jugadorId)

  const inputStyle = {
    backgroundColor: UI.fondo,
    border: `1px solid ${UI.borde}`,
    color: UI.texto,
  }

  const tarjetaStyle = {
    backgroundColor: UI.tarjeta,
    border: `1px solid ${UI.borde}`,
  }

  const botonSecundario = {
    backgroundColor: UI.fondo,
    border: `1px solid ${UI.borde}`,
    color: UI.secundario,
  }

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8" style={{ color: UI.texto }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {jugadorId && <EntrenamientoDeHoy categoriaId={categoriaId} jugadoraId={jugadorId} />}

        {/* Encabezado */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 sm:p-7"
          style={{
            background: UI.cabeceraComparativo,
            border: `1px solid ${UI.borde}`,
          }}
        >
          <div
            className="absolute -right-8 -top-12 w-48 h-48 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(242,194,48,0.15) 0%, rgba(242,194,48,0) 70%)',
            }}
          />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p
                className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2"
                style={{ color: textoWellness(UI.acento) }}
              >
                Comunicaciones · Rendimiento
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Bienestar
              </h2>
              <p className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: UI.secundario }}>
                Seguimiento individual y comparativo del plantel: sueño, dolor muscular,
                fatiga, estrés y esfuerzo percibido.
              </p>
            </div>

            <div
              className="shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium self-start sm:self-auto"
              style={{
                backgroundColor: 'rgba(151,196,89,0.10)',
                border: '1px solid rgba(151,196,89,0.25)',
                color: UI.exito,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: UI.exito }} />
              Primera División
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 h-[3px] w-24"
            style={{ backgroundColor: UI.acento }}
          />
        </div>

        {/* Filtros */}
        <div className="rounded-2xl p-4 sm:p-5" style={tarjetaStyle}>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 min-w-0">
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: UI.secundario }}
              >
                Jugadora
              </label>

              <select
                value={jugadorId}
                onChange={(e) => setJugadorId(e.target.value)}
                disabled={!categoriaId}
                className="w-full p-3 rounded-xl ui-control outline-none text-sm disabled:opacity-50"
                style={inputStyle}
              >
                <option value="">Todo el plantel · Vista general</option>
                {jugadores.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.apellido}, {j.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs sm:text-right" style={{ color: UI.muted }}>
              <span className="block uppercase tracking-wider mb-1">Plantel</span>
              <span className="text-lg font-semibold" style={{ color: UI.texto }}>
                {jugadores.length}
              </span>
              <span className="ml-1">jugadoras disponibles</span>
            </div>
          </div>

          {!categoriaId && (
            <p className="text-sm mt-4" style={{ color: UI.peligro }}>
              No se pudo determinar la categoría para mostrar el comparativo.
            </p>
          )}

          {categoriaId && (
            <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${UI.borde}` }}>
              {jugadorId && (
                <div className="flex flex-1 gap-2">
                  {[
                    { key: 'semana', label: 'Última semana' },
                    { key: 'mes', label: 'Último mes' },
                  ].map((p) => {
                    const activo = periodo === p.key

                    return (
                      <button
                        key={p.key}
                        onClick={() => setPeriodo(p.key)}
                        className="flex-1 p-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={
                          activo
                            ? {
                                background: UI.primarioWellness,
                                color: '#1A1914',
                                border: `1px solid ${UI.acento}`,
                              }
                            : botonSecundario
                        }
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                onClick={handleDescargarPdf}
                disabled={generandoPdf}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-85 disabled:opacity-50"
                style={{
                  backgroundColor: UI.fondo,
                  border: `1px solid ${UI.borde}`,
                  color: UI.texto,
                }}
              >
                {generandoPdf ? 'Generando PDF…' : '↓ Descargar PDF'}
              </button>
            </div>
          )}
        </div>

        {/* Perfil de jugadora */}
        {jugadorSeleccionado && (
          <div className="flex items-center gap-3 rounded-2xl p-4" style={tarjetaStyle}>
            {jugadorSeleccionado.foto_url ? (
              <img
                src={jugadorSeleccionado.foto_url}
                alt={jugadorSeleccionado.apellido}
                className="w-12 h-12 rounded-xl object-cover shrink-0"
              />
            ) : (
              <span
                className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                style={{
                  backgroundColor: 'rgba(242,194,48,0.12)',
                  color: textoWellness(UI.acento),
                  border: '1px solid rgba(242,194,48,0.25)',
                }}
              >
                {iniciales(jugadorSeleccionado.nombre, jugadorSeleccionado.apellido)}
              </span>
            )}

            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: UI.muted }}>
                Análisis individual
              </p>
              <p className="text-base font-semibold truncate">
                {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
              </p>
            </div>

            <div
              className="ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'rgba(242,194,48,0.10)',
                color: textoWellness(UI.acento),
              }}
            >
              {periodo === 'semana' ? '7 días' : '28 días'}
            </div>
          </div>
        )}

        {/* Resumen general */}
        {categoriaId && !jugadorId && (
          <div className="rounded-2xl overflow-hidden" style={tarjetaStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 sm:px-5" style={{ borderBottom: `1px solid ${UI.borde}` }}>
              <div>
                <h3 className="font-semibold">Estado general del plantel</h3>
                <p className="text-xs mt-1" style={{ color: UI.muted }}>
                  Respuestas y promedios de los últimos 28 días
                </p>
              </div>
              <span
                className="self-start rounded-full px-3 py-1 text-xs"
                style={{ backgroundColor: UI.fondo, color: UI.secundario, border: `1px solid ${UI.borde}` }}
              >
                Vista colectiva
              </span>
            </div>

            {cargandoGeneral && (
              <div className="p-8 text-center text-sm" style={{ color: UI.secundario }}>
                Cargando datos del plantel…
              </div>
            )}

            {!cargandoGeneral && resumenGeneral.length === 0 && (
              <div className="p-8 text-center text-sm" style={{ color: UI.muted }}>
                Todavía no hay datos para mostrar en este período.
              </div>
            )}

            {!cargandoGeneral && resumenGeneral.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: UI.fondo }}>
                      {['Jugadora', 'Respuestas (28d)', 'Prom. semanal', 'Prom. mensual', 'Estado'].map((label) => (
                        <th
                          key={label}
                          className="text-left p-3 sm:p-4 whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold"
                          style={{ color: UI.secundario, borderBottom: `1px solid ${UI.borde}` }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumenGeneral.map((f, i) => (
                      <tr
                        key={f.jugador.id}
                        className="transition-colors"
                        style={{
                          backgroundColor: i % 2 === 0 ? 'transparent' : UI.tarjetaAlternativa,
                          borderBottom: `1px solid ${UI.borde}`,
                        }}
                      >
                        <td className="p-3 sm:p-4 whitespace-nowrap font-medium">
                          {f.jugador.apellido}, {f.jugador.nombre}
                        </td>
                        <td className="p-3 sm:p-4 tabular-nums" style={{ color: UI.secundario }}>
                          {f.respuestas}
                        </td>
                        <td className="p-3 sm:p-4 tabular-nums font-semibold">
                          {f.promedioSemanal !== null ? f.promedioSemanal.toFixed(1) : '—'}
                        </td>
                        <td className="p-3 sm:p-4 tabular-nums font-semibold">
                          {f.promedioMensual !== null ? f.promedioMensual.toFixed(1) : '—'}
                        </td>
                        <td className="p-3 sm:p-4">
                          {f.nivel ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{
                                backgroundColor:
                                  f.nivel === 'alerta'
                                    ? 'rgba(231,121,112,0.13)'
                                    : f.nivel === 'moderado'
                                    ? 'rgba(242,194,48,0.13)'
                                    : 'rgba(151,196,89,0.13)',
                                color:
                                  f.nivel === 'alerta'
                                    ? UI.peligro
                                    : f.nivel === 'moderado'
                                    ? UI.advertencia
                                    : UI.exito,
                                border: `1px solid ${
                                  f.nivel === 'alerta'
                                    ? 'rgba(231,121,112,0.28)'
                                    : f.nivel === 'moderado'
                                    ? 'rgba(242,194,48,0.28)'
                                    : 'rgba(151,196,89,0.28)'
                                }`,
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{
                                backgroundColor:
                                  f.nivel === 'alerta'
                                    ? UI.peligro
                                    : f.nivel === 'moderado'
                                    ? UI.advertencia
                                    : UI.exito,
                              }} />
                              {f.nivel === 'alerta' ? 'Alerta' : f.nivel === 'moderado' ? 'Moderado' : 'Normal'}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: UI.muted }}>
                              Sin datos
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Cargando análisis individual */}
        {cargando && (
          <div className="rounded-2xl p-8 text-center" style={tarjetaStyle}>
            <p className="text-sm" style={{ color: UI.secundario }}>
              Cargando análisis individual…
            </p>
          </div>
        )}

        {/* Métricas individuales */}
        {!cargando && jugadorId && metricas && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {metricas.map((m) => {
              const colorLinea = m.clave === 'rpe' ? UI.acento : UI.exito

              const colorTendencia =
                m.tendencia === null
                  ? UI.muted
                  : m.tendencia === 'estable'
                  ? UI.secundario
                  : m.clave === 'rpe'
                  ? UI.acento
                  : m.tendencia === 'sube'
                  ? UI.peligro
                  : UI.exito

              const flecha =
                m.tendencia === 'sube'
                  ? '↑ subió'
                  : m.tendencia === 'baja'
                  ? '↓ bajó'
                  : m.tendencia === 'estable'
                  ? '→ estable'
                  : ''

              return (
                <div
                  key={m.clave}
                  className="rounded-2xl p-4 sm:p-5 transition-colors"
                  style={tarjetaStyle}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-xs mt-1" style={{ color: UI.muted }}>
                        Evolución del período seleccionado
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-2xl font-semibold tabular-nums">
                        {m.promedioActual !== null ? m.promedioActual.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs ml-1" style={{ color: UI.muted }}>
                        / {m.escalaMax}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl px-2 pt-3 pb-1 mb-3" style={{ backgroundColor: UI.fondo }}>
                    <MiniLinea serie={m.serie} escalaMax={m.escalaMax} color={colorLinea} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: UI.muted }}>
                      Promedio del período
                    </span>

                    {flecha ? (
                      <span
                        className="text-xs font-semibold rounded-full px-2.5 py-1"
                        style={{
                          backgroundColor:
                            m.tendencia === 'estable'
                              ? 'rgba(181,179,170,0.10)'
                              : m.tendencia === 'sube'
                              ? 'rgba(231,121,112,0.12)'
                              : 'rgba(151,196,89,0.12)',
                          color: textoWellness(colorTendencia),
                        }}
                      >
                        {flecha}
                        {m.promedioAnterior !== null && ` · antes ${m.promedioAnterior.toFixed(1)}`}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: UI.muted }}>
                        Sin tendencia disponible
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default BienestarComparativo
