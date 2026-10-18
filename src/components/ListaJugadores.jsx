
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/generarPlantelPDF'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
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

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function agruparPorPosicion(jugadoras) {
  return posiciones.reduce((grupos, posicion) => {
    grupos[posicion] = jugadoras.filter((j) => j.posicion === posicion)
    return grupos
  }, {})
}

function FotoJugadora({ jugadora, className = '' }) {
  const [errorFoto, setErrorFoto] = useState(false)

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

function CanchaTactica({ jugadoras, onSelectJugador }) {
  const grupos = useMemo(() => agruparPorPosicion(jugadoras), [jugadoras])

  const sectores = [
    {
      nombre: 'Delantera',
      posiciones: ['Delantero centro', 'Extremo izquierdo', 'Extremo derecho'],
    },
    {
      nombre: 'Mediocampo',
      posiciones: ['Volante ofensivo', 'Mediocampista central'],
    },
    {
      nombre: 'Defensa',
      posiciones: ['Lateral izquierdo', 'Defensor central', 'Lateral derecho'],
    },
    {
      nombre: 'Arqueras',
      posiciones: ['Arquero'],
    },
  ]

  return (
    <div
      className="rounded-2xl p-4 md:p-6 overflow-hidden"
      style={{
        backgroundColor: '#10251F',
        border: '1px solid #285342',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2
            className="text-xl"
            style={{ color: '#F0F2F5', fontFamily: "'Archivo Black', sans-serif" }}
          >
            Cancha táctica
          </h2>
          <p className="text-xs mt-1" style={{ color: '#B6D1C3' }}>
            Posición principal registrada
          </p>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full"
          style={{ color: '#D7FBE7', backgroundColor: '#214A39' }}
        >
          {jugadoras.length} jugadoras
        </span>
      </div>

      <div
        className="relative rounded-xl overflow-hidden px-2 py-5 md:px-4"
        style={{
          background: 'repeating-linear-gradient(0deg, #1B6849 0px, #1B6849 55px, #205F45 55px, #205F45 110px)',
          border: '2px solid rgba(230,255,240,0.65)',
        }}
      >
        <div className="absolute inset-3 border border-white/40 rounded-lg pointer-events-none" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/40 pointer-events-none" />
        <div className="absolute w-20 h-20 rounded-full border border-white/40 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {sectores.map((sector) => {
            const jugadorasSector = sector.posiciones.flatMap(
              (posicion) => grupos[posicion] || []
            )

            return (
              <div key={sector.nombre}>
                <p
                  className="text-center text-[10px] uppercase tracking-[0.2em] mb-2 font-bold"
                  style={{ color: '#D7FBE7', textShadow: '0 1px 3px #123B2A' }}
                >
                  {sector.nombre}
                </p>

                {jugadorasSector.length ? (
                  <div className="flex flex-wrap justify-center gap-3 md:gap-5">
                    {jugadorasSector.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => onSelectJugador(j.id)}
                        title={`${j.nombre} ${j.apellido} — ${j.posicion}`}
                        className="flex flex-col items-center w-[76px] md:w-[90px] rounded-lg p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white"
                      >
                        <div
                          className="rounded-full p-0.5"
                          style={{
                            backgroundColor:
                              estadoConfig[j.estado]?.color || COLORES.exito,
                          }}
                        >
                          <FotoJugadora
                            jugadora={j}
                            className="w-11 h-11 md:w-14 md:h-14"
                          />
                        </div>
                        <span
                          className="text-[11px] md:text-xs font-semibold mt-1 text-center leading-tight"
                          style={{ color: '#FFFFFF' }}
                        >
                          {j.nombre} {j.apellido}
                        </span>
                        <span
                          className="text-[9px] md:text-[10px] text-center mt-0.5"
                          style={{ color: '#D7FBE7' }}
                        >
                          {j.posicion}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs py-2" style={{ color: '#B6D1C3' }}>
                    Sin jugadoras registradas
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs mt-3" style={{ color: '#B6D1C3' }}>
        Tocá una jugadora para abrir su perfil. El color del borde indica su estado.
      </p>
    </div>
  )
}

function ListaJugadores({ onSelectJugador, onNuevoJugador, onCargaMasiva }) {
  const [jugadores, setJugadores] = useState([])
  const [categoriaId, setCategoriaId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    let activo = true

    async function cargarPlantel() {
      setCargando(true)
      setErrorCarga('')

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
        setErrorCarga('No se pudo cargar el plantel. Revisá la conexión y los permisos.')
      } else {
        setJugadores(data || [])
      }

      setCargando(false)
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
      const nombreCompleto = `${j.nombre || ''} ${j.apellido || ''}`.toLocaleLowerCase('es-AR')
      const apellidoNombre = `${j.apellido || ''} ${j.nombre || ''}`.toLocaleLowerCase('es-AR')
      const posicion = (j.posicion || '').toLocaleLowerCase('es-AR')

      return (
        nombreCompleto.includes(texto) ||
        apellidoNombre.includes(texto) ||
        posicion.includes(texto)
      )
    })
  }, [jugadores, busqueda])

  const grupos = useMemo(
    () => agruparPorPosicion(jugadorasFiltradas),
    [jugadorasFiltradas]
  )

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-3xl md:text-4xl"
              style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
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
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
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
          <p className="text-sm py-8 text-center" style={{ color: COLORES.textoMuted }}>
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
                  <p className="text-xs leading-snug" style={{ color: COLORES.textoMuted }}>
                    {posicion}
                  </p>
                  <p
                    className="text-2xl font-bold mt-1"
                    style={{ color: COLORES.texto, fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    {grupos[posicion]?.length || 0}
                  </p>
                </div>
              ))}
            </div>

            <div className="mb-8">
              <CanchaTactica
                jugadoras={jugadorasFiltradas}
                onSelectJugador={onSelectJugador}
              />
            </div>

            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold" style={{ color: COLORES.texto }}>
                Jugadoras
              </h2>
              <span className="text-sm" style={{ color: COLORES.textoMuted }}>
                {jugadorasFiltradas.length} de {jugadores.length}
              </span>
            </div>

            <div className="space-y-3">
              {jugadorasFiltradas.map((j) => {
                const estado = estadoConfig[j.estado] || estadoConfig.disponible

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
                      <p className="font-semibold truncate" style={{ color: COLORES.texto }}>
                        {j.apellido}, {j.nombre}
                      </p>
                      <p className="text-xs mt-1" style={{ color: COLORES.textoMuted }}>
                        {j.posicion || 'Posición sin cargar'} · {estado.label}
                      </p>
                    </div>

                    <span
                      className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                      style={{
                        backgroundColor: COLORES.fondoSidebar,
                        color: estado.color,
                      }}
                    >
                      Ver perfil →
                    </span>
                  </button>
                )
              })}
            </div>

            {jugadorasFiltradas.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: COLORES.textoMuted }}>
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
