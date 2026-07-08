import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'

const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
  suspendido: { color: '#F87171', label: 'Suspendido' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function ListaJugadores({ onSelectJugador, onNuevoJugador, onCargaMasiva, perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [jugadores, setJugadores] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function cargarJugadores() {
      const { data, error } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')

      if (error) {
        console.error(error)
      } else {
        setJugadores(data)
      }
    }
    cargarJugadores()
  }, [])

  const jugadoresFiltrados = jugadores.filter((j) => {
    const coincideCategoria = !categoriaId || j.categoria_id === categoriaId
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <h1
            className="text-3xl md:text-4xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            Plantel
          </h1>
          <div className="flex gap-2">
            <button
              onClick={onCargaMasiva}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
            >
              📋 Carga masiva
            </button>
            <button
              onClick={onNuevoJugador}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              + Nuevo jugador
            </button>
          </div>
        </div>

        <CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          bloqueada={esTecnico}
          categoriaNombre={perfil?.categorias?.nombre}
        />

        <div className="space-y-3">
          {jugadoresFiltrados.map((j) => {
            const estado = estadoConfig[j.estado] || estadoConfig.disponible
            return (
              <div
                key={j.id}
                onClick={() => onSelectJugador(j.id)}
                title={j.estado_detalle || ''}
                className="group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                style={{
                  backgroundColor: '#1A2332',
                  border: '1px solid #2A3548',
                  borderLeft: `3px solid ${estado.color}`,
                }}
              >
                {j.foto_url ? (
                  <img
                    src={j.foto_url}
                    alt={`${j.apellido}, ${j.nombre}`}
                    className="w-11 h-11 rounded-full object-cover shrink-0"
                    style={{ border: `2px solid ${estado.color}` }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 text-sm font-bold"
                    style={{
                      backgroundColor: '#0F1419',
                      border: `2px solid ${estado.color}`,
                      color: estado.color,
                      fontFamily: "'Archivo Black', sans-serif",
                    }}
                  >
                    {iniciales(j.nombre, j.apellido)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#F0F2F5' }}>
                    {j.apellido}, {j.nombre}
                  </p>
                  <p className="text-xs" style={{ color: '#5B6B85' }}>
                    {estado.label}
                  </p>
                </div>

                <span
                  className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                >
                  {j.categorias?.nombre}
                </span>
              </div>
            )
          })}
        </div>

        {jugadoresFiltrados.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            No se encontraron jugadores con ese filtro.
          </p>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores 