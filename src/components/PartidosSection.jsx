import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import ListaPartidos from './ListaPartidos'
import ConvocarPartido from './ConvocarPartido'
import AgregarPartido from './AgregarPartido'
import EquiposSection from './EquiposSection'
import ComparativaJugadoras from './ComparativaJugadoras'

function PartidosSection({ perfil, onIrAFisico }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [partidoId, setPartidoId] = useState(null)
  const [vista, setVista] = useState(esTecnico ? 'lista' : 'categorias')
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

  if (vista === 'convocar') {
    return (
      <ConvocarPartido
        partidoId={partidoId}
        categoriaId={categoriaId}
        onVolver={() => setVista('lista')}
        onIrAFisico={onIrAFisico}
      />
    )
  }

  if (vista === 'equipos') {
    return <EquiposSection onVolver={() => setVista('lista')} />
  }

  if (vista === 'comparativa') {
    return (
      <ComparativaJugadoras
        categoriaId={categoriaId}
        categoriaNombre={categorias.find((c) => c.id === categoriaId)?.nombre}
        onVolver={() => setVista('lista')}
      />
    )
  }

  if (vista === 'lista') {
    return (
      <ListaPartidos
        categoriaId={categoriaId}
        categoriaNombre={categorias.find((c) => c.id === categoriaId)?.nombre}
        refrescar={refrescar}
        onVolver={esTecnico ? null : () => setVista('categorias')}
        onElegirPartido={(id) => {
          setPartidoId(id)
          setVista('convocar')
        }}
        onNuevoPartido={() => setVista('agregar')}
        onGestionarEquipos={() => setVista('equipos')}
        onVerEstadisticas={(id) => {
          setPartidoId(id)
          setVista('convocar')
        }}
        onEditarPartido={(id) => {
          setPartidoId(id)
          setVista('editar')
        }}
        onVerComparativa={() => setVista('comparativa')}
      />
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          Partidos
        </h1>
        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORES.textoMuted }}>
          Elegí una categoría
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => elegirCategoria(c.id)}
              className="p-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde', color: COLORES.texto }}
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

