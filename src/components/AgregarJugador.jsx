import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'

function AgregarJugador({ onVolver, onGuardado, jugadorIdEditar }) {
  const [categorias, setCategorias] = useState([])
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [estado, setEstado] = useState('disponible')
  const [posicion, setPosicion] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [pieHabil, setPieHabil] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cargando, setCargando] = useState(!!jugadorIdEditar)

  const esEdicion = !!jugadorIdEditar

  useEffect(() => {
    async function cargarCategorias() {
      const { data } = await supabase
        .from('categorias')
        .select('*')
        .order('orden')
      setCategorias(data || [])
    }
    cargarCategorias()
  }, [])

  useEffect(() => {
    async function cargarJugador() {
      if (!jugadorIdEditar) return
      const { data } = await supabase
        .from('jugadores')
        .select('*')
        .eq('id', jugadorIdEditar)
        .single()
      if (data) {
        setNombre(data.nombre || '')
        setApellido(data.apellido || '')
        setCategoriaId(data.categoria_id || '')
        setEstado(data.estado || 'disponible')
        setPosicion(data.posicion || '')
        setFechaNacimiento(data.fecha_nacimiento || '')
        setPieHabil(data.pie_habil || '')
        setFotoUrl(data.foto_url || '')
      }
      setCargando(false)
    }
    cargarJugador()
  }, [jugadorIdEditar])

  async function handleSubirFoto(archivo) {
    if (!archivo) return
    setSubiendoFoto(true)
    const archivoComprimido = await comprimirImagen(archivo, { maxAncho: 500, maxAlto: 500 })
    const nombreArchivo = `jugadores/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`
    const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivoComprimido, {
      upsert: true,
    })
    if (error) {
      alert('Error al subir la foto: ' + error.message)
      setSubiendoFoto(false)
      return
    }
    const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
    setFotoUrl(data.publicUrl)
    setSubiendoFoto(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!nombre || !apellido || !categoriaId) {
      setErrorMsg('Completá nombre, apellido y categoría.')
      return
    }

    setGuardando(true)

    const datos = {
      nombre,
      apellido,
      categoria_id: categoriaId,
      estado,
      posicion: posicion || null,
      fecha_nacimiento: fechaNacimiento || null,
      pie_habil: pieHabil || null,
      foto_url: fotoUrl || null,
    }

    const { error } = esEdicion
      ? await supabase.from('jugadores').update(datos).eq('id', jugadorIdEditar)
      : await supabase.from('jugadores').insert(datos)

    setGuardando(false)

    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      onGuardado()
    }
  }

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1419' }}>
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ backgroundColor: '#0F1419' }}>
      <div className="max-w-md mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <h1
          className="text-2xl md:text-3xl mb-8"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          {esEdicion ? 'Editar jugador' : 'Nuevo jugador'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt="Foto del jugador"
                className="w-16 h-16 rounded-full object-cover shrink-0"
                style={{ border: '2px solid #2A3548' }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-xl"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548', color: '#5B6B85' }}
              >
                📷
              </div>
            )}
            <div>
              <label
                className="text-xs font-medium px-3 py-2 rounded-lg cursor-pointer inline-block transition-opacity hover:opacity-80"
                style={{ backgroundColor: '#1A2332', color: '#F0F2F5', border: '1px solid #2A3548' }}
              >
                {subiendoFoto ? 'Subiendo...' : fotoUrl ? 'Cambiar foto' : 'Subir foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendoFoto}
                  onChange={(e) => handleSubirFoto(e.target.files?.[0])}
                />
              </label>
              {fotoUrl && (
                <button
                  type="button"
                  onClick={() => setFotoUrl('')}
                  className="text-xs ml-2 hover:opacity-70 transition-opacity"
                  style={{ color: '#F87171' }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
              placeholder="Juan"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Apellido
            </label>
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
              placeholder="Pérez"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Categoría
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">Seleccionar...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Fecha de nacimiento
            </label>
            <input
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Posición
            </label>
            <select
              value={posicion}
              onChange={(e) => setPosicion(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">Seleccionar...</option>
              <option value="Arquero">Arquero</option>
              <option value="Defensor central">Defensor central</option>
              <option value="Lateral derecho">Lateral derecho</option>
              <option value="Lateral izquierdo">Lateral izquierdo</option>
              <option value="Mediocampista central">Mediocampista central</option>
              <option value="Volante ofensivo">Volante ofensivo</option>
              <option value="Extremo derecho">Extremo derecho</option>
              <option value="Extremo izquierdo">Extremo izquierdo</option>
              <option value="Delantero centro">Delantero centro</option>
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Pie hábil
            </label>
            <select
              value={pieHabil}
              onChange={(e) => setPieHabil(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">Seleccionar...</option>
              <option value="derecho">Derecho</option>
              <option value="izquierdo">Izquierdo</option>
              <option value="ambidiestro">Ambidiestro</option>
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Estado
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="disponible">Disponible</option>
              <option value="lesionado">Lesionado</option>
              <option value="suspendido">Suspendido</option>
            </select>
          </div>

          {errorMsg && (
            <p className="text-sm" style={{ color: '#F87171' }}>
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar jugador'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AgregarJugador