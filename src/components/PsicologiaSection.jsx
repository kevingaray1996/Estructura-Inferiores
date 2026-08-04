import { COLORES } from '../theme'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'
import { obtenerFechaHoy } from '../utils/fecha'

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function PsicologiaSection({ jugadorInicialId, onConsumirJugadorInicial }) {
  const [jugadores, setJugadores] = useState([])
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null)
  const [fichas, setFichas] = useState([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [fichaEditando, setFichaEditando] = useState(null)
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [linkInforme, setLinkInforme] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargarFichas = useCallback(async (jugadorId) => {
    const { data } = await supabase
      .from('fichas_psicologicas')
      .select('*')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
    setFichas(data || [])
  }, [])

  const abrirJugador = useCallback(
    (j) => {
      setJugadorSeleccionado(j)
      setMostrarForm(false)
      setFichaEditando(null)
      cargarFichas(j.id)
    },
    [cargarFichas]
  )

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .order('apellido')
      setJugadores(data || [])

      if (jugadorInicialId) {
        const encontrado = data?.find((j) => j.id === jugadorInicialId)
        if (encontrado) abrirJugador(encontrado)
        onConsumirJugadorInicial()
      }
    }
    cargar()
  }, [jugadorInicialId, abrirJugador, onConsumirJugadorInicial])

  function abrirNuevoRegistro() {
    setFichaEditando(null)
    setFecha(obtenerFechaHoy())
    setDescripcion('')
    setLinkInforme('')
    setMostrarForm(true)
  }

  function abrirEditarRegistro(f) {
    setFichaEditando(f)
    setFecha(f.fecha || '')
    setDescripcion(f.descripcion || '')
    setLinkInforme(f.link_informe || '')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setFichaEditando(null)
  }

  async function handleGuardar() {
    if (!fecha) return
    setGuardando(true)

    const datos = { fecha, descripcion, link_informe: linkInforme || null }

    if (fichaEditando) {
      await supabase.from('fichas_psicologicas').update(datos).eq('id', fichaEditando.id)
    } else {
      await supabase.from('fichas_psicologicas').insert({
        jugador_id: jugadorSeleccionado.id,
        ...datos,
      })
    }

    setGuardando(false)
    setMostrarForm(false)
    setFichaEditando(null)
    setLinkInforme('')
    cargarFichas(jugadorSeleccionado.id)
  }

  async function handleEliminarFicha(fichaId) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro?')
    if (!confirmar) return
    await supabase.from('fichas_psicologicas').delete().eq('id', fichaId)
    cargarFichas(jugadorSeleccionado.id)
  }

  const filtrados = jugadores.filter((j) => {
    const coincideCategoria = !categoriaId || j.categoria_id === categoriaId
    const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  if (jugadorSeleccionado) {
    return (
      <div className="p-6 md:p-10">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setJugadorSeleccionado(null)}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver
          </button>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <p className="text-3xl">🧠</p>
              <h1
                className="text-2xl"
                style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
              >
                {jugadorSeleccionado.apellido}, {jugadorSeleccionado.nombre}
              </h1>
            </div>
            <button
              onClick={mostrarForm ? cancelarForm : abrirNuevoRegistro}
              className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 shrink-0"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {mostrarForm ? 'Cancelar' : '+ Agregar registro'}
            </button>
          </div>

          {mostrarForm && (
            <div className="space-y-3 mb-6 p-4 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
              {fichaEditando && (
                <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                  Editando registro del {fichaEditando.fecha}
                </p>
              )}
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <textarea
                placeholder="Notas de la sesión / observaciones"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Link del informe (Drive, PDF, etc.)"
                value={linkInforme}
                onChange={(e) => setLinkInforme(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
              >
                {guardando ? 'Guardando...' : fichaEditando ? 'Guardar cambios' : 'Guardar registro'}
              </button>
            </div>
          )}

          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: COLORES.textoMuted }}>
            Historial de sesiones
          </p>

          <div className="space-y-2">
            {fichas.map((f) => (
              <div key={f.id} className="p-3.5 rounded-xl" style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-mono" style={{ color: COLORES.textoSecundario }}>{f.fecha}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => abrirEditarRegistro(f)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleEliminarFicha(f.id)}
                      className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                      style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <p className="text-sm" style={{ color: COLORES.texto }}>{f.descripcion}</p>
                {f.link_informe && (
                  <a
                    href={f.link_informe}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs mt-1 inline-block underline"
                    style={{ color: COLORES.textoSecundario }}
                  >
                    📎 Ver informe
                  </a>
                )}
              </div>
            ))}
            {fichas.length === 0 && (
              <p className="text-sm" style={{ color: COLORES.textoMuted }}>Sin registros todavía.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1
          className="text-3xl md:text-4xl mb-6 flex items-center gap-3"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
        >
          <span>🧠</span> Psicología
        </h1>

        <CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
        />

        <div className="space-y-2">
          {filtrados.map((j) => (
            <div
              key={j.id}
              onClick={() => abrirJugador(j)}
              className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
            >
              {j.foto_url ? (
                <img
                  src={j.foto_url}
                  alt={`${j.apellido}, ${j.nombre}`}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                  style={{ border: '2px solid COLORES.borde' }}
                />
              ) : (
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-xs font-bold"
                  style={{ backgroundColor: COLORES.fondoPagina, border: '2px solid COLORES.borde', color: COLORES.textoSecundario, fontFamily: "'Archivo Black', sans-serif" }}
                >
                  {iniciales(j.nombre, j.apellido)}
                </div>
              )}
              <p className="flex-1 text-sm" style={{ color: COLORES.texto }}>
                {j.apellido}, {j.nombre}
              </p>
              <span className="text-xs font-mono px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}>
                {j.categorias?.nombre}
              </span>
            </div>
          ))}
        </div>

        {filtrados.length === 0 && (
          <p className="text-sm" style={{ color: COLORES.textoMuted }}>No se encontraron jugadores con ese filtro.</p>
        )}
      </div>
    </div>
  )
}

export default PsicologiaSection


