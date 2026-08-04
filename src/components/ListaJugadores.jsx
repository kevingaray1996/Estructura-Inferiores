import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarPlantelPDF } from '../utils/generarPlantelPDF'
import CategoriaFiltro from './CategoriaFiltro'
import { COLORES } from '../theme'

const estadoConfig = {
  disponible: { color: COLORES.exito, label: 'Disponible' },
  lesionado: { color: COLORES.acento, label: 'Lesionado' },
  suspendido: { color: COLORES.peligro, label: 'Suspendido' },
  no_disponible: { color: COLORES.textoMuted, label: 'No disponible' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function ListaJugadores({ onSelectJugador, onNuevoJugador, onCargaMasiva, perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [jugadores, setJugadores] = useState([])
  const [categorias, setCategorias] = useState([])
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

      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      setCategorias(categoriasData || [])
    }
    cargarJugadores()
  }, [])

  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaId)

  const jugadoresFiltrados = jugadores.filter((j) => {
    const coincideCategoria =
      !categoriaId ||
      j.categoria_id === categoriaId ||
      (categoriaSeleccionada?.es_reserva && j.tambien_reserva)
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <h1
            className="text-3xl md:text-4xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
          >
            Plantel
          </h1>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={generarPlantelPDF}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
            >
              📄 Descargar plantel PDF
            </button>
            <button
              onClick={onCargaMasiva}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.texto, border: `1px solid ${COLORES.borde}` }}
            >
              📋 Carga masiva
            </button>
            <button
              onClick={onNuevoJugador}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
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
                  backgroundColor: COLORES.fondoTarjeta,
                  border: `1px solid ${COLORES.borde}`,
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
                      backgroundColor: COLORES.fondoSidebar,
                      border: `2px solid ${estado.color}`,
                      color: estado.color,
                      fontFamily: "'Archivo Black', sans-serif",
                    }}
                  >
                    {iniciales(j.nombre, j.apellido)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: COLORES.texto }}>
                    {j.apellido}, {j.nombre}
                  </p>
                  <p className="text-xs" style={{ color: COLORES.textoMuted }}>
                    {estado.label}
                  </p>
                </div>

                <span
                  className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                >
                  {j.categorias?.nombre}
                </span>
              </div>
            )
          })}
        </div>

        {jugadoresFiltrados.length === 0 && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>
            No se encontraron jugadores con ese filtro.
          </p>
        )}
      </div>
    </div>
  )
}

export default ListaJugadores
