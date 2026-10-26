import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function BuscadorGlobal({ onIrAJugador, onIrAMedicos, onIrAVideoJugador, onIrAVideoGeneral, onIrABiblioteca }) {
  const [termino, setTermino] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState(null)

  const buscar = useCallback(async (texto) => {
    setBuscando(true)
    const patron = `%${texto}%`

    const [jugadoresRes, fichasRes, videosRes, bibliotecaRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .or(`nombre.ilike.${patron},apellido.ilike.${patron}`)
        .limit(10),
      supabase
        .from('fichas_medicas')
        .select('*, jugadores(nombre, apellido, categorias(nombre))')
        .ilike('descripcion', patron)
        .limit(10),
      supabase
        .from('videos')
        .select('*, categorias(nombre), jugadores(nombre, apellido)')
        .or(`descripcion.ilike.${patron},contenido.ilike.${patron}`)
        .limit(10),
      supabase
        .from('biblioteca')
        .select('*')
        .or(`descripcion.ilike.${patron},contenido.ilike.${patron}`)
        .limit(10),
    ])

    setResultados({
      jugadores: jugadoresRes.data || [],
      fichas: fichasRes.data || [],
      videos: videosRes.data || [],
      biblioteca: bibliotecaRes.data || [],
    })
    setBuscando(false)
  }, [])

  useEffect(() => {
    const texto = termino.trim()
    if (texto.length < 2) return
    const timeout = setTimeout(() => buscar(texto), 350)
    return () => clearTimeout(timeout)
  }, [termino, buscar])

  const inputStyle = {
    backgroundColor: 'var(--ui-compartido-superficie, #1A2332)',
    border: '1px solid var(--ui-compartido-borde, #2A3548)',
    color: 'var(--ui-compartido-texto, #F0F2F5)',
  }

  const mostrarResultados = !!resultados && termino.trim().length >= 2

  const sinResultados =
    mostrarResultados &&
    resultados.jugadores.length === 0 &&
    resultados.fichas.length === 0 &&
    resultados.videos.length === 0 &&
    resultados.biblioteca.length === 0

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: 'var(--ui-compartido-texto, #F0F2F5)' }}
        >
          Buscar
        </h1>

        <input
          type="text"
          autoFocus
          placeholder="Buscar jugador, lesión, video, ejercicio..."
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          className="ui-control w-full p-3 rounded-xl outline-none text-sm mb-6"
          style={inputStyle}
        />

        {termino.trim().length > 0 && termino.trim().length < 2 && (
          <p className="text-sm" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
            Escribí al menos 2 letras.
          </p>
        )}

        {buscando && <p style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>Buscando...</p>}

        {sinResultados && !buscando && (
          <p className="text-sm" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
            No encontré nada con "{termino}".
          </p>
        )}

        {mostrarResultados && !buscando && (
          <div className="space-y-6">
            {resultados.jugadores.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
                  Jugadores
                </p>
                <div className="space-y-2">
                  {resultados.jugadores.map((j) => (
                    <div
                      key={j.id}
                      onClick={() => onIrAJugador(j.id)}
                      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: 'var(--ui-compartido-superficie, #1A2332)', border: '1px solid var(--ui-compartido-borde, #2A3548)' }}
                    >
                      {j.foto_url ? (
                        <img
                          src={j.foto_url}
                          alt={`${j.apellido}, ${j.nombre}`}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: 'var(--ui-compartido-fondo, #0F1419)', color: 'var(--ui-compartido-secundario, #8A9BB8)', fontFamily: "'Archivo Black', sans-serif" }}
                        >
                          {`${j.nombre?.[0] || ''}${j.apellido?.[0] || ''}`.toUpperCase()}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--ui-compartido-texto, #F0F2F5)' }}>
                          {j.apellido}, {j.nombre}
                        </p>
                        {j.categorias?.nombre && (
                          <p className="text-xs" style={{ color: 'var(--ui-compartido-secundario, #8A9BB8)' }}>
                            {j.categorias.nombre}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultados.fichas.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
                  Fichas médicas
                </p>
                <div className="space-y-2">
                  {resultados.fichas.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => onIrAMedicos(f.jugador_id)}
                      className="p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: 'var(--ui-compartido-superficie, #1A2332)', border: '1px solid var(--ui-compartido-borde, #2A3548)' }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--ui-compartido-texto, #F0F2F5)' }}>
                        {f.descripcion || 'Registro médico'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ui-compartido-secundario, #8A9BB8)' }}>
                        {f.jugadores ? `${f.jugadores.apellido}, ${f.jugadores.nombre}` : ''}
                        {f.jugadores?.categorias?.nombre && ` · ${f.jugadores.categorias.nombre}`}
                        {f.fecha && ` · ${f.fecha}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultados.videos.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
                  Videos
                </p>
                <div className="space-y-2">
                  {resultados.videos.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => (v.jugador_id ? onIrAVideoJugador(v.jugador_id) : onIrAVideoGeneral())}
                      className="p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: 'var(--ui-compartido-superficie, #1A2332)', border: '1px solid var(--ui-compartido-borde, #2A3548)' }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--ui-compartido-texto, #F0F2F5)' }}>
                        {v.contenido || v.descripcion || (v.jugadores ? `${v.jugadores.apellido}, ${v.jugadores.nombre}` : 'Video')}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ui-compartido-secundario, #8A9BB8)' }}>
                        {v.tipo} {v.categorias?.nombre && `· ${v.categorias.nombre}`} {v.fecha && `· ${v.fecha}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultados.biblioteca.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--ui-compartido-tenue, #5B6B85)' }}>
                  Biblioteca de entrenamientos
                </p>
                <div className="space-y-2">
                  {resultados.biblioteca.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => onIrABiblioteca()}
                      className="p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                      style={{ backgroundColor: 'var(--ui-compartido-superficie, #1A2332)', border: '1px solid var(--ui-compartido-borde, #2A3548)' }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--ui-compartido-texto, #F0F2F5)' }}>
                        {b.contenido || 'Ejercicio'}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--ui-compartido-secundario, #8A9BB8)' }}>
                        {b.descripcion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BuscadorGlobal
