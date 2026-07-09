import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import CategoriaFiltro from './CategoriaFiltro'
import { obtenerFechaHoy } from '../utils/fecha'

const ESTADO_CONFIG = {
  en_prueba: { label: 'En prueba', color: '#FBBF24', icono: '🕓' },
  aceptado: { label: 'Aceptado', color: '#4ADE80', icono: '✅' },
  rechazado: { label: 'Rechazado', color: '#F87171', icono: '✖️' },
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function CaptacionSection({ perfil }) {
  const esTecnico = perfil?.rol === 'tecnico'
  const [candidatos, setCandidatos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaId, setCategoriaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [candidatoEditando, setCandidatoEditando] = useState(null)
  const [convirtiendoId, setConvirtiendoId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [posicion, setPosicion] = useState('')
  const [categoriaProbadaId, setCategoriaProbadaId] = useState(esTecnico ? perfil.categoria_id : '')
  const [fechaPrueba, setFechaPrueba] = useState(obtenerFechaHoy())
  const [contactoNombre, setContactoNombre] = useState('')
  const [telefonoContacto, setTelefonoContacto] = useState('')
  const [notas, setNotas] = useState('')
  const [estado, setEstado] = useState('en_prueba')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('candidatos')
      .select('*, categorias(nombre)')
      .order('fecha_prueba', { ascending: false })
    setCandidatos(data || [])
    setCargando(false)
  }

  useEffect(() => {
    async function ejecutar() {
      cargar()
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategorias(data || [])
    }
    ejecutar()
  }, [])

  function abrirNuevo() {
    setCandidatoEditando(null)
    setNombre('')
    setApellido('')
    setFechaNacimiento('')
    setPosicion('')
    setCategoriaProbadaId(esTecnico ? perfil.categoria_id : '')
    setFechaPrueba(obtenerFechaHoy())
    setContactoNombre('')
    setTelefonoContacto('')
    setNotas('')
    setEstado('en_prueba')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(c) {
    setCandidatoEditando(c)
    setNombre(c.nombre || '')
    setApellido(c.apellido || '')
    setFechaNacimiento(c.fecha_nacimiento || '')
    setPosicion(c.posicion || '')
    setCategoriaProbadaId(c.categoria_probada_id || '')
    setFechaPrueba(c.fecha_prueba || '')
    setContactoNombre(c.contacto_nombre || '')
    setTelefonoContacto(c.telefono_contacto || '')
    setNotas(c.notas || '')
    setEstado(c.estado || 'en_prueba')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setCandidatoEditando(null)
  }

  async function crearJugadorDesdeCandidato(c) {
    const { data: nuevoJugador, error: errorInsert } = await supabase
      .from('jugadores')
      .insert({
        nombre: c.nombre,
        apellido: c.apellido,
        fecha_nacimiento: c.fecha_nacimiento || null,
        posicion: c.posicion || null,
        categoria_id: c.categoria_probada_id,
        estado: 'disponible',
      })
      .select()
      .single()

    if (errorInsert) {
      alert('Error al crear el jugador: ' + errorInsert.message)
      return null
    }

    await supabase
      .from('candidatos')
      .update({ estado: 'aceptado', jugador_id: nuevoJugador.id })
      .eq('id', c.id)

    return nuevoJugador
  }

  async function handleGuardar() {
    if (!nombre || !apellido || !categoriaProbadaId) {
      setErrorMsg('Completá nombre, apellido y categoría probada.')
      return
    }
    setGuardando(true)
    setErrorMsg('')

    const datos = {
      nombre,
      apellido,
      fecha_nacimiento: fechaNacimiento || null,
      posicion: posicion || null,
      categoria_probada_id: categoriaProbadaId,
      fecha_prueba: fechaPrueba || null,
      contacto_nombre: contactoNombre || null,
      telefono_contacto: telefonoContacto || null,
      notas: notas || null,
      estado,
    }

    let candidatoGuardado
    if (candidatoEditando) {
      const { error } = await supabase.from('candidatos').update(datos).eq('id', candidatoEditando.id)
      if (error) {
        setGuardando(false)
        setErrorMsg('Error al guardar: ' + error.message)
        return
      }
      candidatoGuardado = { ...candidatoEditando, ...datos }
    } else {
      const { data, error } = await supabase.from('candidatos').insert(datos).select().single()
      if (error) {
        setGuardando(false)
        setErrorMsg('Error al guardar: ' + error.message)
        return
      }
      candidatoGuardado = data
    }

    // Si quedó "aceptado" y todavía no tiene un jugador vinculado, lo pasamos
    // directo al plantel de la categoría probada.
    if (candidatoGuardado.estado === 'aceptado' && !candidatoGuardado.jugador_id) {
      await crearJugadorDesdeCandidato(candidatoGuardado)
    }

    setGuardando(false)
    setMostrarForm(false)
    setCandidatoEditando(null)
    cargar()
  }

  async function handleEliminar(candidatoId) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este candidato?')
    if (!confirmar) return
    await supabase.from('candidatos').delete().eq('id', candidatoId)
    cargar()
  }

  async function handleConvertir(c) {
    const confirmar = window.confirm(`¿Dar de alta a ${c.apellido}, ${c.nombre} como jugador del plantel?`)
    if (!confirmar) return
    setConvirtiendoId(c.id)
    await crearJugadorDesdeCandidato(c)
    setConvirtiendoId(null)
    cargar()
  }

  const filtrados = candidatos.filter((c) => {
    const coincideCategoria = !categoriaId || c.categoria_probada_id === categoriaId
    const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase()
    const coincideBusqueda = !busqueda || nombreCompleto.includes(busqueda.toLowerCase())
    return coincideCategoria && coincideBusqueda
  })

  const grupos = ['en_prueba', 'aceptado', 'rechazado'].map((clave) => ({
    clave,
    config: ESTADO_CONFIG[clave],
    lista: filtrados.filter((c) => c.estado === clave),
  }))

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1
            className="text-3xl md:text-4xl flex items-center gap-3"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
          >
            <span>🔎</span> Captación
          </h1>
          <button
            onClick={mostrarForm ? cancelarForm : abrirNuevo}
            className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nuevo candidato'}
          </button>
        </div>

        {mostrarForm && (
          <div className="space-y-3 mb-6 p-4 rounded-xl" style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Fecha de nacimiento</label>
                <input
                  type="date"
                  value={fechaNacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
              </div>
              <input
                type="text"
                placeholder="Posición"
                value={posicion}
                onChange={(e) => setPosicion(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm self-end"
                style={inputStyle}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Categoría probada</label>
                {esTecnico ? (
                  <p className="p-2.5 rounded-xl text-sm" style={{ ...inputStyle, color: '#8A9BB8' }}>
                    {perfil?.categorias?.nombre || 'Tu categoría'}
                  </p>
                ) : (
                  <select
                    value={categoriaProbadaId}
                    onChange={(e) => setCategoriaProbadaId(e.target.value)}
                    className="w-full p-2.5 rounded-xl outline-none text-sm"
                    style={inputStyle}
                  >
                    <option value="">Seleccionar...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Fecha de la prueba</label>
                <input
                  type="date"
                  value={fechaPrueba}
                  onChange={(e) => setFechaPrueba(e.target.value)}
                  className="w-full p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Contacto (madre, padre, tutor)"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
              <input
                type="tel"
                placeholder="Teléfono de contacto"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
            </div>
            <textarea
              placeholder="Notas de la evaluación (técnica, físico, actitud, etc.)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="w-full p-2.5 rounded-xl outline-none text-sm resize-none"
              style={inputStyle}
            />
            <div>
              <label className="text-[10px] uppercase" style={{ color: '#5B6B85' }}>Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="en_prueba">En prueba</option>
                <option value="aceptado">Aceptado</option>
                <option value="rechazado">Rechazado</option>
              </select>
              {estado === 'aceptado' && !candidatoEditando?.jugador_id && (
                <p className="text-xs mt-1.5" style={{ color: '#4ADE80' }}>
                  Al guardar como "Aceptado" se crea automáticamente en el plantel de la categoría probada.
                </p>
              )}
            </div>

            {errorMsg && (
              <p className="text-sm" style={{ color: '#F87171' }}>{errorMsg}</p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
            >
              {guardando ? 'Guardando...' : candidatoEditando ? 'Guardar cambios' : 'Guardar candidato'}
            </button>
          </div>
        )}

        <CategoriaFiltro
          categoriaId={categoriaId}
          onCategoriaChange={setCategoriaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          bloqueada={esTecnico}
          categoriaNombre={perfil?.categorias?.nombre}
        />

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando &&
          grupos.map(
            (grupo) =>
              grupo.lista.length > 0 && (
                <div key={grupo.clave} className="mb-6">
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: grupo.config.color }}>
                    {grupo.config.icono} {grupo.config.label} ({grupo.lista.length})
                  </p>
                  <div className="space-y-2">
                    {grupo.lista.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-xl"
                        style={{ backgroundColor: '#1A2332', border: `1px solid ${grupo.config.color}` }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: '#0F1419', color: '#8A9BB8', fontFamily: "'Archivo Black', sans-serif" }}
                          >
                            {iniciales(c.nombre, c.apellido)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: '#F0F2F5' }}>
                              {c.apellido}, {c.nombre}
                            </p>
                            <p className="text-xs" style={{ color: '#8A9BB8' }}>
                              {c.categorias?.nombre}
                              {c.posicion ? ` · ${c.posicion}` : ''}
                              {c.fecha_prueba ? ` · ${c.fecha_prueba}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {c.estado === 'aceptado' && !c.jugador_id && (
                              <button
                                onClick={() => handleConvertir(c)}
                                disabled={convirtiendoId === c.id}
                                className="text-xs px-2.5 py-1 rounded-full hover:opacity-80 disabled:opacity-50"
                                style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
                              >
                                {convirtiendoId === c.id ? 'Creando...' : '➕ Pasar a plantel'}
                              </button>
                            )}
                            {c.jugador_id && (
                              <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: '#0F1419', color: '#4ADE80' }}>
                                Ya está en el plantel
                              </span>
                            )}
                            <button
                              onClick={() => abrirEditar(c)}
                              className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                              style={{ backgroundColor: '#0F1419', color: '#8A9BB8' }}
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleEliminar(c.id)}
                              className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                              style={{ backgroundColor: '#0F1419', color: '#F87171' }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                        {c.notas && (
                          <p className="text-xs mt-2" style={{ color: '#8A9BB8' }}>{c.notas}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}

        {!cargando && filtrados.length === 0 && (
          <p className="text-sm" style={{ color: '#5B6B85' }}>
            No hay candidatos cargados para ese filtro.
          </p>
        )}
      </div>
    </div>
  )
}

export default CaptacionSection
