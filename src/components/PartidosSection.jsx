import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import ListaPartidos from './ListaPartidos'
import ConvocarPartido from './ConvocarPartido'
import AgregarPartido from './AgregarPartido'
import CargarEstadisticas from './CargarEstadisticas'
import FormacionPartido from './FormacionPartido'
import EquiposSection from './EquiposSection'

function PartidosSection() {
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState('')
  const [partidoId, setPartidoId] = useState(null)
  const [vista, setVista] = useState('categorias')
  const [refrescar, setRefrescar] = useState(0)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    cargar()
  }, [])

  function elegirCategoria(id) {
    setCategoriaId(id)
    setVista('lista')
  }

  if (vista === 'agregar') {
    return (
      <AgregarPartido
        categoriaId={categoriaId}
        onVolver={() => setVista('lista')}
        onGuardado={() => {
          setRefrescar((r) => r + 1)
          setVista('lista')
        }}
      />
    )
  }

  if (vista === 'editar') {
    return (
      <AgregarPartido
        categoriaId={categoriaId}
        partidoIdEditar={partidoId}
        onVolver={() => setVista('lista')}
        onGuardado={() => {
          setRefrescar((r) => r + 1)
          setVista('lista')
        }}
      />
    )
  }

  if (vista === 'estadisticas') {
    return (
      <CargarEstadisticas
        partidoId={partidoId}
        categoriaId={categoriaId}
        onVolver={() => setVista('lista')}
      />
    )
  }

  if (vista === 'formacion') {
    return (
      <FormacionPartido
        partidoId={partidoId}
        onVolver={() => setVista('convocar')}
        onGuardado={() => setVista('lista')}
      />
    )
  }

  if (vista === 'convocar') {
    return (
      <ConvocarPartido
        partidoId={partidoId}
        categoriaId={categoriaId}
        onVolver={() => setVista('lista')}
        onSiguiente={() => setVista('formacion')}
      />
    )
  }

  if (vista === 'equipos') {
    return <EquiposSection onVolver={() => setVista('lista')} />
  }

  if (vista === 'lista') {
    return (
      <ListaPartidos
        categoriaId={categoriaId}
        refrescar={refrescar}
        onVolver={() => setVista('categorias')}
        onElegirPartido={(id) => {
          setPartidoId(id)
          setVista('convocar')
        }}
        onNuevoPartido={() => setVista('agregar')}
        onGestionarEquipos={() => setVista('equipos')}
        onVerEstadisticas={(id) => {
          setPartidoId(id)
          setVista('estadisticas')
        }}
        onEditarPartido={(id) => {
          setPartidoId(id)
          setVista('editar')
        }}
      />
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Partidos
        </h1>
        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#5B6B85' }}>
          Elegí una categoría
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => elegirCategoria(c.id)}
              className="p-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#F0F2F5' }}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PartidosSection