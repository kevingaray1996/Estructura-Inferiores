
import { useEffect, useState } from 'react'
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

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
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

  useEffect(() => {
    let activo = true

    async function cargarJugadoras() {
      setCargando(true)

      const { data, error } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .eq('categoria_id', CATEGORIA_PRIMERA_ID)
        .order('apellido')

      if (!activo) return

      if (error) {
        console.error('Error al cargar el plantel de Primera División:', error)
        setJugadoras([])
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

  const jugadorasFiltradas = jugadoras.filter((jugadora) => {
    const nombreCompleto =
      `${jugadora.nombre || ''} ${jugadora.apellido || ''}`.toLowerCase()

    return nombreCompleto.includes(busqueda.trim().toLowerCase())
  })

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col gap-5 mb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: COLORES.acento }}
            >
              Comunicaciones · Fútbol femenino
            </p>

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
              className="text-sm mt-2"
              style={{ color: COLORES.textoMuted }}
            >
              Primera División femenina · {jugadoras.length} jugadoras
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

        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar jugadora por nombre o apellido..."
              aria-label="Buscar jugadora por nombre o apellido"
              className="w-full px-4 py-3 rounded-xl outline-none transition-colors"
              style={{
                backgroundColor: COLORES.fondoTarjeta,
                color: COLORES.texto,
                border: `1px solid ${COLORES.borde}`,
              }}
            />
          </div>
        </div>

        {cargando ? (
          <div
            className="py-12 text-center text-sm"
            style={{ color: COLORES.textoMuted }}
          >
            Cargando plantel de Primera División...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {jugadorasFiltradas.map((jugadora) => {
                const estado =
                  estadoConfig[jugadora.estado] || estadoConfig.disponible

                return (
                  <div
                    key={jugadora.id}
                    onClick={() => onSelectJugador(jugadora.id)}
                    title={jugadora.estado_detalle || ''}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectJugador(jugadora.id)
                      }
                    }}
                    className="group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                    style={{
                      backgroundColor: COLORES.fondoTarjeta,
                      border: `1px solid ${COLORES.borde}`,
                      borderLeft: `3px solid ${estado.color}`,
                    }}
                  >
                    {jugadora.foto_url ? (
                      <img
                        src={jugadora.foto_url}
                        alt={`${jugadora.apellido}, ${jugadora.nombre}`}
                        className="w-11 h-11 rounded-full object-cover shrink-0"
                        style={{ border: `2px solid ${estado.color}` }}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 text-sm font-bold"
                        style={{
                          backgroundColor: COLORES.fondoSidebar,
                          border: `2px solid ${estado.color}`,
                          color: estado.color,
                          fontFamily: "'Archivo Black', sans-serif",
                        }}
                      >
                        {iniciales(jugadora.nombre, jugadora.apellido)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold truncate"
                        style={{ color: COLORES.texto }}
                      >
                        {jugadora.apellido}, {jugadora.nombre}
                      </p>

                      <p
                        className="text-xs mt-1"
                        style={{ color: COLORES.textoMuted }}
                      >
                        {estado.label}
                      </p>
                    </div>

                    <span
                      className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                      style={{
                        backgroundColor: COLORES.fondoSidebar,
                        color: COLORES.textoSecundario,
                      }}
                    >
                      Primera División
                    </span>
                  </div>
                )
              })}
            </div>

            {jugadorasFiltradas.length === 0 && (
              <p
                className="text-sm py-8 text-center"
                style={{ color: COLORES.textoMuted }}
              >
                {busqueda
                  ? 'No se encontraron jugadoras con ese nombre.'
                  : 'Todavía no hay jugadoras asignadas a Primera División.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
