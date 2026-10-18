
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/generarPlantelPDF'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { obtenerEstadisticasCategoria } from '../utils/exportarEstadisticas'
import { COLORES } from '../theme'

const estadoConfig = {
  disponible: { color: COLORES.exito, label: 'Disponible' },
  lesionado: { color: COLORES.acento, label: 'Lesionada' },
  suspendido: { color: COLORES.peligro, label: 'Suspendida' },
  no_disponible: { color: COLORES.textoMuted, label: 'No disponible' },
}

const posiciones = [
  'Arquero',
  'Defensor central',
  'Lateral derecho',
  'Lateral izquierdo',
  'Mediocampista central',
  'Volante ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Delantero centro',
]

const FORMACIONES = {
  '4-4-2': [
    [
      { id: 'DC1', nombre: 'Delantera', acepta: ['Delantero centro'] },
      { id: 'DC2', nombre: 'Delantera', acepta: ['Delantero centro'] },
    ],
    [
      { id: 'EI', nombre: 'Volante izquierdo', acepta: ['Extremo izquierdo'] },
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'ED', nombre: 'Volante derecho', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
  '4-2-3-1': [
    [
      { id: 'DC', nombre: 'Delantera', acepta: ['Delantero centro'] },
    ],
    [
      { id: 'EI', nombre: 'Extrema izquierda', acepta: ['Extremo izquierdo'] },
      { id: 'VO', nombre: 'Volante ofensiva', acepta: ['Volante ofensivo'] },
      { id: 'ED', nombre: 'Extrema derecha', acepta: ['Extremo derecho'] },
    ],
    [
      { id: 'MC1', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
      { id: 'MC2', nombre: 'Mediocampista', acepta: ['Mediocampista central'] },
    ],
    [
      { id: 'LI', nombre: 'Lateral izquierdo', acepta: ['Lateral izquierdo'] },
      { id: 'DFC1', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'DFC2', nombre: 'Defensora central', acepta: ['Defensor central'] },
      { id: 'LD', nombre: 'Lateral derecho', acepta: ['Lateral derecho'] },
    ],
    [{ id: 'ARQ', nombre: 'Arquera', acepta: ['Arquero'] }],
  ],
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function normalizarPosicion(posicion) {
  return (posicion || '').trim().toLocaleLowerCase('es-AR')
}

function obtenerMinutos(jugadora, estadisticas) {
  return Number(estadisticas[String(jugadora.id)]?.minutos || 0)
}

function asignarOnce(jugadoras, estadisticas, formacion) {
  const filas = FORMACIONES[formacion]
  const puestos = filas.flat()
  const asignadas = new Map()
  const usadas = new Set()

  // Se priorizan los minutos acumulados de la temporada.
  // En caso de igualdad, se mantiene el orden alfabético del plantel.
  const ordenadas = [...jugadoras].sort((a, b) => {
    const diferencia =
      obtenerMinutos(b, estadisticas) - obtenerMinutos(a, estadisticas)

    if (diferencia !== 0) return diferencia

    return `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(
      `${b.apellido || ''} ${b.nombre || ''}`,
      'es'
    )
  })

  // Primero se intenta la posición principal; después, la secundaria.
  for (const jugadora of ordenadas) {
    const principal = normalizarPosicion(jugadora.posicion)
    const secundaria = normalizarPosicion(jugadora.posicion_secundaria)

    const puestoElegido = puestos.find((puesto) => {
      if (asignadas.has(puesto.id)) return false
      return puesto.acepta.some(
        (posicion) => normalizarPosicion(posicion) === principal
      )
    })

    if (puestoElegido) {
      asignadas.set(puestoElegido.id, jugadora)
      usadas.add(String(jugadora.id))
      continue
    }

    const puestoSecundario = puestos.find((puesto) => {
      if (asignadas.has(puesto.id)) return false
      return puesto.acepta.some(
        (posicion) => normalizarPosicion(posicion) === secundaria
      )
    })

    if (puestoSecundario) {
      asignadas.set(puestoSecundario.id, jugadora)
      usadas.add(String(jugadora.id))
    }
  }

  return {
    filas: filas.map((fila) =>
      fila.map((puesto) => ({
        ...puesto,
        jugadora: asignadas.get(puesto.id) || null,
      }))
    ),
    usadas,
  }
}

function FotoJugadora({ jugadora, className = '' }) {
  const [errorFoto, setErrorFoto] = useState(false)

  useEffect(() => {
    setErrorFoto(false)
  }, [jugadora?.foto_url])

  if (jugadora.foto_url && !errorFoto) {
    return (
      <img
        src={jugadora.foto_url}
        alt={`${jugadora.nombre} ${jugadora.apellido}`}
        onError={() => setErrorFoto(true)}
        className={`object-cover rounded-full ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold ${className}`}
      style={{
        backgroundColor: COLORES.fondoSidebar,
        color: COLORES.acento,
        border: `1px solid ${COLORES.borde}`,
      }}
    >
      {iniciales(jugadora.nombre, jugadora.apellido)}
    </div>
  )
}

function CanchaTactica({
  jugadoras,
  estadisticas,
  formacion,
  onCambiarFormacion,
  onSelectJugador,
}) {
  const { filas, usadas } = useMemo(
    () => asignarOnce(jugadoras, estadisticas, formacion),
    [jugadoras, estadisticas, formacion]
  )

  const totalCubiertos = usadas.size

  return (
    <div
      className="rounded-2xl p-4 md:p-6 overflow-hidden"
      style={{
        backgroundColor: '#10251F',
        border: '1px solid #285342',
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
        <div>
          <h2
            className="text-xl"
            style={{
              color: '#F0F2F5',
              fontFamily: "'Archivo Black', sans-serif",
            }}
          >
            Cancha táctica
          </h2>
          <p className="text-xs mt-1" style={{ color: '#B6D1C3' }}>
            Once ideal según minutos jugados y posiciones registradas
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.keys(FORMACIONES).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => onCambiarFormacion(opcion)}
              aria-pressed={formacion === opcion}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-opacity"
              style={{
                backgroundColor:
                  formacion === opcion ? '#4ADE80' : '#214A39',
                color: formacion === opcion ? '#10251F' : '#D7FBE7',
                border: '1px solid #4B8065',
              }}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span
          className="text-xs px-3 py-1.5 rounded-full"
          style={{ color: '#D7FBE7', backgroundColor: '#214A39' }}
        >
          {totalCubiertos} de 11 puestos cubiertos
        </span>
        <span className="text-xs" style={{ color: '#B6D1C3' }}>
          Formación {formacion}
        </span>
      </div>

      <div
        className="relative rounded-xl overflow-hidden px-1 py-5 md:px-3 md:py-6"
        style={{
          background:
            'repeating-linear-gradient(0deg, #1B6849 0px, #1B6849 55px, #205F45 55px, #205F45 110px)',
          border: '2px solid rgba(230,255,240,0.65)',
        }}
      >
        <div className="absolute inset-3 border border-white/40 rounded-lg pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/40 pointer-events-none" />
        <div className="absolute w-20 h-20 rounded-full border border-white/40 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-around gap-5 md:gap-7 min-h-[520px]">
          {filas.map((fila, indiceFila) => (
            <div
              key={`${formacion}-${indiceFila}`}
              className="flex flex-wrap justify-center items-start gap-x-1 gap-y-3 md:gap-x-5"
            >
              {fila.map((puesto) => {
                const j = puesto.jugadora
                const estado = j
                  ? estadoConfig[j.estado] || estadoConfig.disponible
                  : null

                return (
                  <div
                    key={puesto.id}
                    className="flex flex-col items-center w-[76px] md:w-[94px] min-h-[130px]"
                  >
                    {j ? (
                      <button
                        type="button"
                        onClick={() => onSelectJugador(j.id)}
                        title={`${j.nombre} ${j.apellido} — ${puesto.nombre}`}
                        className="flex flex-col items-center w-full rounded-lg p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <div
                          className="rounded-full p-0.5"
                          style={{ backgroundColor: estado.color }}
                        >
                          <FotoJugadora
                            jugadora={j}
                            className="w-11 h-11 md:w-14 md:h-14"
                          />
                        </div>

                        <span
                          className="text-[11px] md:text-xs font-bold mt-1 text-center leading-tight"
                          style={{
                            color: '#FFFFFF',
                            textShadow: '0 1px 3px #123B2A',
                          }}
                        >
                          {j.apellido || j.nombre}
                        </span>

                        <span
                          className="text-[10px] mt-1 font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: '#10251F',
                            backgroundColor: '#D7FBE7',
                          }}
                        >
                          {obtenerMinutos(j, estadisticas)} min
                        </span>

                        <span
                          className="text-[9px] text-center mt-1 leading-tight"
                          style={{ color: '#D7FBE7' }}
                        >
                          {j.posicion || puesto.nombre}
                        </span>
                      </button>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center w-full rounded-xl p-2 min-h-[112px]"
                        style={{
                          border: '1px dashed rgba(230,255,240,0.65)',
                          backgroundColor: 'rgba(10,40,27,0.28)',
                        }}
                      >
                        <span
                          className="text-2xl font-light"
                          style={{ color: '#D7FBE7' }}
                        >
                          +
                        </span>
                        <span
                          className="text-[10px] text-center font-semibold leading-tight"
                          style={{ color: '#D7FBE7' }}
                        >
                          Puesto vacío
                        </span>
                        <span
                          className="text-[9px] text-center mt-1 leading-tight"
                          style={{ color: '#B6D1C3' }}
                        >
                          {puesto.nombre}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs mt-3" style={{ color: '#B6D1C3' }}>
        Tocá una jugadora para abrir su perfil. Los minutos corresponden a las
        estadísticas cargadas. Los puestos sin una jugadora compatible quedan
        vacíos.
      </p>

      <div className="flex flex-wrap gap-3 mt-3 text-xs" style={{ color: '#B6D1C3' }}>
        {Object.entries(estadoConfig).map(([clave, estado]) => (
          <span key={clave} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: estado.color }}
            />
            {estado.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function ListaJugadores({ onSelectJugador, onNuevoJugador, onCargaMasiva }) {
  const [jugadores, setJugadores] = useState([])
  const [categoriaId, setCategoriaId] = useState(null)
  const [estadisticas, setEstadisticas] = useState({})
  const [formacion, setFormacion] = useState('4-4-2')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [errorEstadisticas, setErrorEstadisticas] = useState('')

  useEffect(() => {
    let activo = true

    async function cargarPlantel() {
      setCargando(true)
      setErrorCarga('')
      setErrorEstadisticas('')

      try {
        const categoria = await obtenerCategoriaPrimeraDivision()

        if (!activo) return

        if (!categoria?.id) {
          setErrorCarga(
            'No se encontró la categoría Primera División. Revisá el nombre de la categoría en la base de datos.'
          )
          setCargando(false)
          return
        }

        setCategoriaId(categoria.id)

        const { data, error } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('categoria_id', categoria.id)
          .order('apellido')

        if (!activo) return

        if (error) {
          console.error('Error al cargar el plantel:', error)
          setErrorCarga(
            'No se pudo cargar el plantel. Revisá la conexión y los permisos.'
          )
          setCargando(false)
          return
        }

        setJugadores(data || [])

        try {
          const filasEstadisticas = await obtenerEstadisticasCategoria(
            categoria.id
          )

          if (!activo) return

          const mapa = {}
          ;(filasEstadisticas || []).forEach((fila) => {
            if (fila.id != null) {
              mapa[String(fila.id)] = fila
            }
          })

          setEstadisticas(mapa)
        } catch (error) {
          console.error('Error al cargar estadísticas:', error)
          setErrorEstadisticas(
            'No se pudieron cargar las estadísticas. El plantel sigue disponible, pero los minutos podrían aparecer en cero.'
          )
          setEstadisticas({})
        }
      } catch (error) {
        console.error('Error al cargar el plantel:', error)
        if (activo) {
          setErrorCarga('Ocurrió un error al cargar el plantel.')
        }
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargarPlantel()

    return () => {
      activo = false
    }
  }, [])

  const jugadorasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es-AR')

    if (!texto) return jugadores

    return jugadores.filter((j) => {
      const nombreCompleto =
        `${j.nombre || ''} ${j.apellido || ''}`.toLocaleLowerCase('es-AR')
      const apellidoNombre =
        `${j.apellido || ''} ${j.nombre || ''}`.toLocaleLowerCase('es-AR')
      const posicion = (j.posicion || '').toLocaleLowerCase('es-AR')
      const posicionSecundaria = (j.posicion_secundaria || '').toLocaleLowerCase('es-AR')

      return (
        nombreCompleto.includes(texto) ||
        apellidoNombre.includes(texto) ||
        posicion.includes(texto) ||
        posicionSecundaria.includes(texto)
      )
    })
  }, [jugadores, busqueda])

  const grupos = useMemo(
    () =>
      posiciones.reduce((resultado, posicion) => {
        resultado[posicion] = jugadorasFiltradas.filter(
          (j) => j.posicion === posicion
        )
        return resultado
      }, {}),
    [jugadorasFiltradas]
  )

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-3xl md:text-4xl"
              style={{
                fontFamily: "'Archivo Black', sans-serif",
                color: COLORES.texto,
              }}
            >
              Plantel
            </h1>
            <p className="text-sm mt-2" style={{ color: COLORES.textoMuted }}>
              Primera División femenina
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={generarPlantelPDF}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: COLORES.fondoTarjeta,
                color: COLORES.textoSecundario,
                border: `1px solid ${COLORES.borde}`,
              }}
            >
              📄 Descargar plantel PDF
            </button>

            <button
              onClick={onCargaMasiva}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: COLORES.fondoTarjeta,
                color: COLORES.texto,
                border: `1px solid ${COLORES.borde}`,
              }}
            >
              📋 Carga masiva
            </button>

            <button
              onClick={onNuevoJugador}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{
                backgroundColor: COLORES.acento,
                color: '#1A1A1A',
              }}
            >
              + Nueva jugadora
            </button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar por nombre, apellido o posición..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full p-3 rounded-xl outline-none text-sm mb-6"
          style={{
            backgroundColor: '#1A2332',
            border: '1px solid #2A3548',
            color: '#F0F2F5',
          }}
        />

        {cargando ? (
          <p
            className="text-sm py-8 text-center"
            style={{ color: COLORES.textoMuted }}
          >
            Cargando plantel...
          </p>
        ) : errorCarga ? (
          <div
            className="rounded-xl p-4 mb-6 text-sm"
            style={{
              backgroundColor: COLORES.fondoTarjeta,
              color: COLORES.acento,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            {errorCarga}
          </div>
        ) : (
          <>
            {errorEstadisticas && (
              <div
                className="rounded-xl p-3 mb-4 text-sm"
                style={{
                  backgroundColor: COLORES.fondoTarjeta,
                  color: COLORES.acento,
                  border: `1px solid ${COLORES.borde}`,
                }}
              >
                {errorEstadisticas}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {posiciones.map((posicion) => (
                <div
                  key={posicion}
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: COLORES.fondoTarjeta,
                    border: `1px solid ${COLORES.borde}`,
                  }}
                >
                  <p
                    className="text-xs leading-snug"
                    style={{ color: COLORES.textoMuted }}
                  >
                    {posicion}
                  </p>
                  <p
                    className="text-2xl font-bold mt-1"
                    style={{
                      color: COLORES.texto,
                      fontFamily: "'Archivo Black', sans-serif",
                    }}
                  >
                    {grupos[posicion]?.length || 0}
                  </p>
                </div>
              ))}
            </div>

            <div className="mb-8">
              <CanchaTactica
                jugadoras={jugadores}
                estadisticas={estadisticas}
                formacion={formacion}
                onCambiarFormacion={setFormacion}
                onSelectJugador={onSelectJugador}
              />
            </div>

            <div className="flex items-center justify-between gap-3 mb-4">
              <h2
                className="text-xl font-semibold"
                style={{ color: COLORES.texto }}
              >
                Jugadoras
              </h2>
              <span className="text-sm" style={{ color: COLORES.textoMuted }}>
                {jugadorasFiltradas.length} de {jugadores.length}
              </span>
            </div>

            <div className="space-y-3">
              {jugadorasFiltradas.map((j) => {
                const estado =
                  estadoConfig[j.estado] || estadoConfig.disponible
                const minutos = obtenerMinutos(j, estadisticas)

                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => onSelectJugador(j.id)}
                    title={j.estado_detalle || ''}
                    className="w-full text-left group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: COLORES.fondoTarjeta,
                      border: `1px solid ${COLORES.borde}`,
                      borderLeft: `3px solid ${estado.color}`,
                    }}
                  >
                    <FotoJugadora
                      jugadora={j}
                      className="w-12 h-12 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold truncate"
                        style={{ color: COLORES.texto }}
                      >
                        {j.apellido}, {j.nombre}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: COLORES.textoMuted }}
                      >
                        {j.posicion || 'Posición sin cargar'} · {estado.label}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className="text-sm font-bold"
                        style={{ color: COLORES.texto }}
                      >
                        {minutos} min
                      </p>
                      <span
                        className="text-xs font-mono px-2.5 py-1 rounded-full inline-block mt-1"
                        style={{
                          backgroundColor: COLORES.fondoSidebar,
                          color: estado.color,
                        }}
                      >
                        Ver perfil →
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {jugadorasFiltradas.length === 0 && (
              <p
                className="text-sm py-8 text-center"
                style={{ color: COLORES.textoMuted }}
              >
                {busqueda
                  ? 'No se encontraron jugadoras con esa búsqueda.'
                  : 'Todavía no hay jugadoras cargadas en Primera División.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
