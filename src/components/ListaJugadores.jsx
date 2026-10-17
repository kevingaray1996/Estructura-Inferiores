
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/generarPlantelPDF'
import { COLORES } from '../theme'

const CATEGORIA_PRIMERA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

const estadoConfig = {
  disponible: { color: COLORES.exito, label: 'Disponible' },
  lesionado: { color: COLORES.acento, label: 'Lesionada' },
  suspendido: { color: COLORES.peligro, label: 'Suspendida' },
  no_disponible: {
    color: COLORES.textoMuted,
    label: 'No disponible',
  },
}

const POSICIONES = [
  'Todas',
  'Arquera',
  'Defensora',
  'Mediocampista',
  'Delantera',
  'Sin posición',
]

const ORDENES = [
  { value: 'apellido', label: 'Apellido A-Z' },
  { value: 'nombre', label: 'Nombre A-Z' },
  { value: 'posicion', label: 'Posición' },
  { value: 'dorsal', label: 'Dorsal' },
]

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function obtenerPosicion(jugadora) {
  return (
    jugadora.posicion_principal ||
    jugadora.posicion ||
    jugadora.puesto ||
    jugadora.posicion_1 ||
    ''
  ).toString().trim()
}

function obtenerDorsal(jugadora) {
  const valor =
    jugadora.dorsal ??
    jugadora.numero_camiseta ??
    jugadora.numero ??
    jugadora.camiseta

  return valor === null || valor === undefined || valor === ''
    ? null
    : valor
}

function clasificarPosicion(posicion) {
  const p = posicion.toLowerCase()

  if (!p) return 'Sin posición'

  if (
    p.includes('arquero') ||
    p.includes('arquera') ||
    p.includes('portero') ||
    p.includes('portera')
  ) {
    return 'Arquera'
  }

  if (
    p.includes('defensor') ||
    p.includes('defensora') ||
    p.includes('central') ||
    p.includes('lateral') ||
    p.includes('marcador') ||
    p.includes('libero')
  ) {
    return 'Defensora'
  }

  if (
    p.includes('mediocamp') ||
    p.includes('volante') ||
    p.includes('mediapunta') ||
    p.includes('enganche')
  ) {
    return 'Mediocampista'
  }

  if (
    p.includes('delanter') ||
    p.includes('extremo') ||
    p.includes('punta') ||
    p.includes('atacante')
  ) {
    return 'Delantera'
  }

  return 'Sin posición'
}

function normalizarEstado(estado) {
  const valor = (estado || 'disponible')
    .toString()
    .toLowerCase()
    .replaceAll(' ', '_')

  if (valor.includes('lesion')) return 'lesionado'
  if (valor.includes('suspend')) return 'suspendido'
  if (
    valor.includes('no_disponible') ||
    valor.includes('baja') ||
    valor.includes('ausente')
  ) {
    return 'no_disponible'
  }

  return 'disponible'
}

function Icono({ nombre, size = 18 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const dibujos = {
    buscar: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 4 4" />
      </>
    ),
    cancha: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M12 3v18M3 8h4v8H3m18-8h-4v8h4" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    tarjetas: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </>
    ),
    flecha: <path d="m9 18 6-6-6-6" />,
    filtro: (
      <>
        <path d="M4 7h16M7 12h10m-7 5h4" />
        <circle cx="8" cy="7" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
      </>
    ),
    ordenar: (
      <>
        <path d="M8 5v14m0 0-4-4m4 4 4-4M16 19V5m0 0-4 4m4-4 4 4" />
      </>
    ),
  }

  return <svg {...props}>{dibujos[nombre]}</svg>
}

function ListaJugadores({
  onSelectJugador,
  onNuevoJugador,
  onCargaMasiva,
  perfil,
}) {
  const [jugadoras, setJugadoras] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [posicionActiva, setPosicionActiva] = useState('Todas')
  const [estadoActivo, setEstadoActivo] = useState('Todas')
  const [orden, setOrden] = useState('apellido')
  const [vista, setVista] = useState('tarjetas')

  useEffect(() => {
    let activo = true

    async function cargarJugadoras() {
      setCargando(true)
      setErrorCarga(false)

      const { data, error } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .eq('categoria_id', CATEGORIA_PRIMERA_ID)
        .order('apellido')

      if (!activo) return

      if (error) {
        console.error(
          'Error al cargar el plantel de Primera División:',
          error
        )
        setJugadoras([])
        setErrorCarga(true)
      } else {
        setJugadoras(data || [])
      }

      setCargando(false)
    }

    cargarJugadoras()

    return () => {
      activo = false
    }
  }, [])

  const jugadorasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()

    const resultado = jugadoras.filter((jugadora) => {
      const nombreCompleto =
        `${jugadora.nombre || ''} ${jugadora.apellido || ''}`.toLowerCase()

      const dorsal = obtenerDorsal(jugadora)
      const posicion = obtenerPosicion(jugadora)
      const grupoPosicion = clasificarPosicion(posicion)
      const estado = normalizarEstado(jugadora.estado)

      const coincideBusqueda =
        !termino ||
        nombreCompleto.includes(termino) ||
        posicion.toLowerCase().includes(termino) ||
        String(dorsal ?? '').includes(termino)

      const coincidePosicion =
        posicionActiva === 'Todas' ||
        grupoPosicion === posicionActiva

      const coincideEstado =
        estadoActivo === 'Todas' || estado === estadoActivo

      return coincideBusqueda && coincidePosicion && coincideEstado
    })

    return [...resultado].sort((a, b) => {
      if (orden === 'nombre') {
        return (a.nombre || '').localeCompare(b.nombre || '', 'es')
      }

      if (orden === 'posicion') {
        return obtenerPosicion(a).localeCompare(
          obtenerPosicion(b),
          'es'
        )
      }

      if (orden === 'dorsal') {
        const dorsalA = obtenerDorsal(a)
        const dorsalB = obtenerDorsal(b)

        if (dorsalA == null && dorsalB == null) return 0
        if (dorsalA == null) return 1
        if (dorsalB == null) return -1

        return (
          Number(dorsalA) - Number(dorsalB) ||
          String(dorsalA).localeCompare(String(dorsalB))
        )
      }

      return (a.apellido || '').localeCompare(
        b.apellido || '',
        'es'
      )
    })
  }, [
    jugadoras,
    busqueda,
    posicionActiva,
    estadoActivo,
    orden,
  ])

  const conteos = useMemo(() => {
    const grupos = {
      Todas: jugadoras.length,
      Arquera: 0,
      Defensora: 0,
      Mediocampista: 0,
      Delantera: 0,
      'Sin posición': 0,
    }

    jugadoras.forEach((jugadora) => {
      grupos[clasificarPosicion(obtenerPosicion(jugadora))] += 1
    })

    return grupos
  }, [jugadoras])

  const disponibles = jugadoras.filter(
    (j) => normalizarEstado(j.estado) === 'disponible'
  ).length

  const reiniciarFiltros = () => {
    setBusqueda('')
    setPosicionActiva('Todas')
    setEstadoActivo('Todas')
    setOrden('apellido')
  }

  const renderTarjeta = (jugadora) => {
    const estadoKey = normalizarEstado(jugadora.estado)
    const estado = estadoConfig[estadoKey]
    const posicion = obtenerPosicion(jugadora)
    const dorsal = obtenerDorsal(jugadora)

    return (
      <article
        key={jugadora.id}
        className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5"
        style={{
          backgroundColor: COLORES.fondoTarjeta,
          border: `1px solid ${COLORES.borde}`,
          borderLeft: `3px solid ${estado.color}`,
        }}
      >
        <button
          type="button"
          onClick={() => onSelectJugador(jugadora.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
          aria-label={`Ver ficha de ${jugadora.nombre} ${jugadora.apellido}`}
        >
          <div className="relative shrink-0">
            {jugadora.foto_url ? (
              <img
                src={jugadora.foto_url}
                alt={`${jugadora.nombre || ''} ${jugadora.apellido || ''}`}
                loading="lazy"
                className="h-12 w-12 rounded-lg object-cover"
                style={{
                  backgroundColor: COLORES.fondoSidebar,
                  border: `1px solid ${COLORES.borde}`,
                }}
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold"
                style={{
                  backgroundColor: COLORES.fondoSidebar,
                  color: COLORES.acento,
                  border: `1px solid ${COLORES.borde}`,
                  fontFamily: "'Archivo Black', sans-serif",
                }}
              >
                {iniciales(jugadora.nombre, jugadora.apellido)}
              </div>
            )}

            <span
              className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full"
              title={estado.label}
              style={{
                backgroundColor: estado.color,
                border: `2px solid ${COLORES.fondoTarjeta}`,
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: COLORES.texto }}
            >
              {jugadora.apellido}, {jugadora.nombre}
            </p>

            <p
              className="mt-1 truncate text-xs"
              style={{ color: COLORES.textoMuted }}
            >
              {posicion || 'Posición sin registrar'}
            </p>

            <span
              className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-medium"
              style={{ color: estado.color }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: estado.color }}
              />
              {estado.label}
            </span>
          </div>

          <div
            className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{
              backgroundColor: COLORES.fondoSidebar,
              color: dorsal != null
                ? COLORES.acento
                : COLORES.textoMuted,
              border: `1px solid ${COLORES.borde}`,
              fontFamily: "'Archivo Black', sans-serif",
            }}
            title={dorsal != null ? `Dorsal ${dorsal}` : 'Sin dorsal registrado'}
          >
            {dorsal ?? '—'}
          </div>

          <span
            className="shrink-0"
            style={{ color: COLORES.textoMuted }}
          >
            <Icono nombre="flecha" size={17} />
          </span>
        </button>
      </article>
    )
  }

  const renderCancha = () => {
    const grupos = [
      { nombre: 'Delanteras', clase: 'Delantera' },
      { nombre: 'Mediocampistas', clase: 'Mediocampista' },
      { nombre: 'Defensoras', clase: 'Defensora' },
      { nombre: 'Arquera', clase: 'Arquera' },
    ]

    return (
      <div
        className="overflow-hidden rounded-2xl p-3 sm:p-5"
        style={{
          backgroundColor: COLORES.fondoTarjeta,
          border: `1px solid ${COLORES.borde}`,
        }}
      >
        <div
          className="relative overflow-hidden rounded-xl p-3 sm:p-5"
          style={{
            backgroundColor: '#24583D',
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 79px, rgba(255,255,255,0.045) 80px, rgba(255,255,255,0.045) 160px)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-3 rounded-lg"
            style={{ border: '1px solid rgba(255,255,255,0.42)' }}
          />

          <div
            className="pointer-events-none absolute left-3 right-3 top-1/2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.42)' }}
          />

          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.42)' }}
          />

          <div className="relative z-10 flex min-h-[420px] flex-col justify-between gap-5 py-2 sm:min-h-[470px]">
            {grupos.map((grupo) => {
              const integrantes = jugadorasFiltradas.filter(
                (j) =>
                  clasificarPosicion(obtenerPosicion(j)) === grupo.clase
              )

              return (
                <section key={grupo.clase} className="relative">
                  <p
                    className="mb-2 text-center text-[9px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(255,255,255,0.8)' }}
                  >
                    {grupo.nombre} · {integrantes.length}
                  </p>

                  {integrantes.length ? (
                    <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                      {integrantes.map((jugadora) => {
                        const dorsal = obtenerDorsal(jugadora)
                        const estado =
                          estadoConfig[normalizarEstado(jugadora.estado)]

                        return (
                          <button
                            key={jugadora.id}
                            type="button"
                            onClick={() => onSelectJugador(jugadora.id)}
                            title={`${jugadora.nombre || ''} ${jugadora.apellido || ''} · ${obtenerPosicion(jugadora) || 'Sin posición'}`}
                            className="flex w-[76px] flex-col items-center gap-1.5 rounded-lg p-1.5 transition-transform hover:scale-105 focus:outline-none focus:ring-2"
                            style={{
                              color: '#FFFFFF',
                              backgroundColor: 'rgba(0,0,0,0.2)',
                            }}
                          >
                            <div className="relative">
                              {jugadora.foto_url ? (
                                <img
                                  src={jugadora.foto_url}
                                  alt=""
                                  loading="lazy"
                                  className="h-10 w-10 rounded-full object-cover"
                                  style={{
                                    border: `2px solid ${estado.color}`,
                                  }}
                                />
                              ) : (
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-full text-[10px] font-bold"
                                  style={{
                                    backgroundColor: '#173B29',
                                    border: `2px solid ${estado.color}`,
                                    color: '#F2C230',
                                  }}
                                >
                                  {iniciales(
                                    jugadora.nombre,
                                    jugadora.apellido
                                  )}
                                </div>
                              )}

                              <span
                                className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                                style={{
                                  backgroundColor: '#F2C230',
                                  color: '#191919',
                                }}
                              >
                                {dorsal ?? '—'}
                              </span>
                            </div>

                            <span className="w-full truncate text-center text-[10px] font-medium">
                              {jugadora.apellido || jugadora.nombre}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p
                      className="py-2 text-center text-xs"
                      style={{ color: 'rgba(255,255,255,0.58)' }}
                    >
                      Sin jugadoras registradas en esta posición
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        </div>

        <p
          className="mt-3 text-xs leading-relaxed"
          style={{ color: COLORES.textoMuted }}
        >
          Vista orientativa según la posición registrada de cada jugadora.
          No representa una formación táctica confirmada.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-full p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1 w-7 rounded-full"
                  style={{ backgroundColor: COLORES.acento }}
                />
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: COLORES.acento }}
                >
                  Comunicaciones · Fútbol femenino
                </p>
              </div>

              <h1
                className="text-3xl md:text-4xl"
                style={{
                  fontFamily: "'Archivo Black', sans-serif",
                  color: COLORES.texto,
                }}
              >
                Plantel
              </h1>

              <p
                className="mt-2 text-sm"
                style={{ color: COLORES.textoMuted }}
              >
                Primera División · Gestión de jugadoras
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generarPlantelPDF}
                className="rounded-lg px-3 py-2.5 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: COLORES.fondoTarjeta,
                  color: COLORES.textoSecundario,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                Descargar PDF
              </button>

              <button
                type="button"
                onClick={onCargaMasiva}
                className="rounded-lg px-3 py-2.5 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: COLORES.fondoTarjeta,
                  color: COLORES.texto,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                Carga masiva
              </button>

              <button
                type="button"
                onClick={onNuevoJugador}
                className="rounded-lg px-4 py-2.5 text-xs font-bold transition-opacity hover:opacity-85"
                style={{
                  backgroundColor: COLORES.acento,
                  color: '#191919',
                }}
              >
                + Nueva jugadora
              </button>
            </div>
          </div>
        </header>

        {!cargando && !errorCarga && (
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                etiqueta: 'Plantel',
                valor: jugadoras.length,
                detalle: 'Primera División',
                color: COLORES.acento,
              },
              {
                etiqueta: 'Disponibles',
                valor: disponibles,
                detalle: 'Según estado registrado',
                color: COLORES.exito,
              },
              {
                etiqueta: 'Con posición',
                valor: jugadoras.filter(
                  (j) => Boolean(obtenerPosicion(j))
                ).length,
                detalle: 'Datos registrados',
                color: COLORES.texto,
              },
              {
                etiqueta: 'Resultados',
                valor: jugadorasFiltradas.length,
                detalle: 'Con filtros actuales',
                color: COLORES.texto,
              },
            ].map((dato) => (
              <div
                key={dato.etiqueta}
                className="rounded-xl p-4"
                style={{
                  backgroundColor: COLORES.fondoTarjeta,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: COLORES.textoMuted }}
                >
                  {dato.etiqueta}
                </p>

                <div className="mt-2 flex items-end justify-between gap-2">
                  <span
                    className="text-2xl font-bold"
                    style={{
                      color: dato.color,
                      fontFamily: "'Archivo Black', sans-serif",
                    }}
                  >
                    {dato.valor}
                  </span>

                  <span
                    className="text-right text-[10px]"
                    style={{ color: COLORES.textoMuted }}
                  >
                    {dato.detalle}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <section
          className="mb-5 rounded-xl p-3 sm:p-4"
          style={{
            backgroundColor: COLORES.fondoTarjeta,
            border: `1px solid ${COLORES.borde}`,
          }}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: COLORES.textoMuted }}
              >
                <Icono nombre="buscar" />
              </span>

              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, apellido, posición o dorsal..."
                aria-label="Buscar jugadora"
                className="w-full rounded-lg py-3 pl-10 pr-3 text-sm outline-none"
                style={{
                  backgroundColor: COLORES.fondoSidebar,
                  color: COLORES.texto,
                  border: `1px solid ${COLORES.borde}`,
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{
                  backgroundColor: COLORES.fondoSidebar,
                  border: `1px solid ${COLORES.borde}`,
                  color: COLORES.textoMuted,
                }}
              >
                <Icono nombre="ordenar" size={15} />
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                  aria-label="Ordenar jugadoras"
                  className="max-w-[145px] bg-transparent text-xs outline-none"
                  style={{ color: COLORES.texto }}
                >
                  {ORDENES.map((opcion) => (
                    <option
                      key={opcion.value}
                      value={opcion.value}
                      style={{
                        backgroundColor: COLORES.fondoTarjeta,
                        color: COLORES.texto,
                      }}
                    >
                      {opcion.label}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className="flex rounded-lg p-1"
                style={{ backgroundColor: COLORES.fondoSidebar }}
              >
                <button
                  type="button"
                  onClick={() => setVista('tarjetas')}
                  aria-label="Ver tarjetas"
                  aria-pressed={vista === 'tarjetas'}
                  title="Vista compacta"
                  className="rounded-md p-2"
                  style={{
                    backgroundColor:
                      vista === 'tarjetas'
                        ? COLORES.acento
                        : 'transparent',
                    color:
                      vista === 'tarjetas'
                        ? '#191919'
                        : COLORES.textoMuted,
                  }}
                >
                  <Icono nombre="tarjetas" />
                </button>

                <button
                  type="button"
                  onClick={() => setVista('cancha')}
                  aria-label="Ver cancha táctica"
                  aria-pressed={vista === 'cancha'}
                  title="Vista táctica"
                  className="rounded-md p-2"
                  style={{
                    backgroundColor:
                      vista === 'cancha'
                        ? COLORES.acento
                        : 'transparent',
                    color:
                      vista === 'cancha'
                        ? '#191919'
                        : COLORES.textoMuted,
                  }}
                >
                  <Icono nombre="cancha" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <Icono nombre="filtro" size={15} />
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: COLORES.textoMuted }}
              >
                Posición
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {POSICIONES.map((posicion) => {
                const activa = posicionActiva === posicion
                const cantidad = conteos[posicion] ?? 0

                return (
                  <button
                    key={posicion}
                    type="button"
                    onClick={() => setPosicionActiva(posicion)}
                    aria-pressed={activa}
                    className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: activa
                        ? COLORES.acento
                        : COLORES.fondoSidebar,
                      color: activa ? '#191919' : COLORES.textoSecundario,
                      border: `1px solid ${
                        activa ? COLORES.acento : COLORES.borde
                      }`,
                    }}
                  >
                    {posicion}
                    <span className="ml-1.5 opacity-70">{cantidad}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORES.acento }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: COLORES.textoMuted }}
              >
                Estado
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { valor: 'Todas', label: 'Todos los estados' },
                { valor: 'disponible', label: 'Disponible' },
                { valor: 'lesionado', label: 'Lesionada' },
                { valor: 'suspendido', label: 'Suspendida' },
                { valor: 'no_disponible', label: 'No disponible' },
              ].map((opcion) => {
                const activa = estadoActivo === opcion.valor

                return (
                  <button
                    key={opcion.valor}
                    type="button"
                    onClick={() => setEstadoActivo(opcion.valor)}
                    aria-pressed={activa}
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: activa
                        ? COLORES.fondo
                        : 'transparent',
                      color: activa ? COLORES.texto : COLORES.textoMuted,
                      border: `1px solid ${
                        activa ? COLORES.acento : COLORES.borde
                      }`,
                    }}
                  >
                    {opcion.label}
                  </button>
                )
              })}
            </div>
          </div>

          {(busqueda ||
            posicionActiva !== 'Todas' ||
            estadoActivo !== 'Todas' ||
            orden !== 'apellido') && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={reiniciarFiltros}
                className="text-xs font-semibold underline underline-offset-4"
                style={{ color: COLORES.acento }}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </section>

        {cargando ? (
          <div
            className="rounded-xl py-16 text-center text-sm"
            style={{
              backgroundColor: COLORES.fondoTarjeta,
              color: COLORES.textoMuted,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            Cargando plantel de Primera División...
          </div>
        ) : errorCarga ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              backgroundColor: COLORES.fondoTarjeta,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: COLORES.texto }}
            >
              No se pudo cargar el plantel.
            </p>
            <p
              className="mt-2 text-xs"
              style={{ color: COLORES.textoMuted }}
            >
              Revisá la conexión e intentá nuevamente.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg px-4 py-2 text-xs font-bold"
              style={{
                backgroundColor: COLORES.acento,
                color: '#191919',
              }}
            >
              Volver a cargar
            </button>
          </div>
        ) : jugadorasFiltradas.length === 0 ? (
          <div
            className="rounded-xl px-5 py-14 text-center"
            style={{
              backgroundColor: COLORES.fondoTarjeta,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                backgroundColor: COLORES.fondoSidebar,
                color: COLORES.acento,
              }}
            >
              <Icono nombre="buscar" size={23} />
            </div>

            <p
              className="mt-4 text-sm font-semibold"
              style={{ color: COLORES.texto }}
            >
              No hay jugadoras para mostrar
            </p>

            <p
              className="mt-1 text-xs"
              style={{ color: COLORES.textoMuted }}
            >
              Probá con otra búsqueda o cambiá los filtros.
            </p>

            <button
              type="button"
              onClick={reiniciarFiltros}
              className="mt-4 text-xs font-bold underline underline-offset-4"
              style={{ color: COLORES.acento }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : vista === 'cancha' ? (
          renderCancha()
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {jugadorasFiltradas.map(renderTarjeta)}
          </div>
        )}

        {!cargando && !errorCarga && jugadorasFiltradas.length > 0 && (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ color: COLORES.textoMuted }}
          >
            <span>
              Mostrando {jugadorasFiltradas.length} de {jugadoras.length}{' '}
              jugadoras
            </span>
            <span>Primera División femenina</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
