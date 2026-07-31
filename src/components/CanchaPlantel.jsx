import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const POSICIONES = [
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

const ZONAS_POSICION = {
  'Delantero centro': { x: 50, y: 16, w: 170 },
  'Extremo izquierdo': { x: 18, y: 30, w: 150 },
  'Extremo derecho': { x: 82, y: 30, w: 150 },
  'Volante ofensivo': { x: 50, y: 44, w: 170 },
  'Mediocampista central': { x: 50, y: 58, w: 170 },
  'Lateral izquierdo': { x: 18, y: 72, w: 150 },
  'Lateral derecho': { x: 82, y: 72, w: 150 },
  'Defensor central': { x: 50, y: 78, w: 170 },
  Arquero: { x: 50, y: 90, w: 150 },
}

function CanchaPlantel({ onSelectJugador }) {
  const [jugadores, setJugadores] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarJugadores() {
      setCargando(true)
      const { data, error } = await supabase
        .from('jugadores')
        .select('id, nombre, apellido, foto_url, posicion, estado, categorias(nombre)')
        .order('apellido')

      if (error) {
        console.error(error)
      } else {
        setJugadores(data || [])
      }

      setCargando(false)
    }

    cargarJugadores()
  }, [])

  const jugadoresAgrupados = POSICIONES.reduce((acc, posicion) => {
    acc[posicion] = jugadores.filter((j) => j.posicion === posicion)
    return acc
  }, {})

  const zonasConJugadoras = POSICIONES.filter((posicion) => (jugadoresAgrupados[posicion] || []).length > 0)

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1
              className="text-3xl md:text-4xl"
              style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
            >
              Plantel
            </h1>
            <p className="text-sm mt-2" style={{ color: '#5B6B85' }}>
              Vista de cancha por posición
            </p>
          </div>
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando plantel...</p>}

        {!cargando && zonasConJugadoras.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay jugadoras cargadas para mostrar en la cancha.</p>
        )}

        {!cargando && zonasConJugadoras.length > 0 && (
          <div
            className="relative mx-auto rounded-2xl overflow-hidden select-none"
            style={{
              maxWidth: 420,
              aspectRatio: '68 / 100',
              backgroundColor: '#183A2A',
              border: '1px solid #2A3548',
            }}
          >
            <div
              className="absolute left-0 right-0"
              style={{ top: '50%', borderTop: '1px solid rgba(240,242,245,0.18)' }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: '22%',
                aspectRatio: '1 / 1',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                border: '1px solid rgba(240,242,245,0.18)',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '44%',
                height: '9%',
                bottom: 0,
                left: '28%',
                border: '1px solid rgba(240,242,245,0.18)',
                borderBottom: 'none',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '44%',
                height: '9%',
                top: 0,
                left: '28%',
                border: '1px solid rgba(240,242,245,0.18)',
                borderTop: 'none',
              }}
            />
            <div
              className="absolute"
              style={{
                height: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                borderLeft: '1px solid rgba(240,242,245,0.18)',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '18%',
                height: '18%',
                left: '10%',
                top: '75%',
                border: '1px solid rgba(240,242,245,0.18)',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '18%',
                height: '18%',
                right: '10%',
                top: '75%',
                border: '1px solid rgba(240,242,245,0.18)',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '18%',
                height: '18%',
                left: '10%',
                top: '7%',
                border: '1px solid rgba(240,242,245,0.18)',
              }}
            />
            <div
              className="absolute"
              style={{
                width: '18%',
                height: '18%',
                right: '10%',
                top: '7%',
                border: '1px solid rgba(240,242,245,0.18)',
              }}
            />

            {POSICIONES.map((posicion) => {
              const jugadoresDePosicion = jugadoresAgrupados[posicion] || []
              if (jugadoresDePosicion.length === 0) return null

              const zona = ZONAS_POSICION[posicion]

              return (
                <div
                  key={posicion}
                  className="absolute"
                  style={{
                    left: `${zona.x}%`,
                    top: `${zona.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: zona.w,
                    maxWidth: '46%',
                  }}
                >
                  <div
                    className="rounded-xl p-2"
                    style={{
                      backgroundColor: 'rgba(15, 20, 25, 0.8)',
                      border: '1px solid #2A3548',
                      backdropFilter: 'blur(3px)',
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: '#8A9BB8' }}>
                      {posicion}
                    </p>
                    <div className="space-y-1.5">
                      {jugadoresDePosicion.map((j) => (
                        <button
                          key={j.id}
                          onClick={() => onSelectJugador(j.id)}
                          className="block w-full text-left text-[10px] px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: '#0F1419',
                            border: '1px solid #2A3548',
                            color: '#F0F2F5',
                          }}
                          title={`${j.apellido}, ${j.nombre}`}
                        >
                          {`${j.apellido}, ${j.nombre}`}
                        </button>
                      ))}
                    </div>
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

export default CanchaPlantel
