import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'

const OPCIONES_POSICION = [
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
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState('')
  const [telefonoEmergencia, setTelefonoEmergencia] = useState('')
  const [tambienReserva, setTambienReserva] = useState(false)
  const [nroDocumento, setNroDocumento] = useState('')
  const [nacionalidad, setNacionalidad] = useState('Argentina')
  const [lugarNacimiento, setLugarNacimiento] = useState('')
  const [pasaporteComunitario, setPasaporteComunitario] = useState(false)
  const [obraSocial, setObraSocial] = useState('')
  const [nroAfiliado, setNroAfiliado] = useState('')
  const [posicionSecundaria, setPosicionSecundaria] = useState('')
  const [videoPromocional, setVideoPromocional] = useState('')
  const [fechaInicioContrato, setFechaInicioContrato] = useState('')
  const [fechaFinContrato, setFechaFinContrato] = useState('')
  const [pensiones, setPensiones] = useState([])
  const [pensionId, setPensionId] = useState('')
  const [costoPension, setCostoPension] = useState('')
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
    async function cargarPensiones() {
      const { data } = await supabase.from('pensiones').select('*').order('nombre')
      setPensiones(data || [])
    }
    cargarPensiones()
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
        setContactoEmergenciaNombre(data.contacto_emergencia_nombre || '')
        setTelefonoEmergencia(data.telefono_emergencia || '')
        setTambienReserva(!!data.tambien_reserva)
        setNroDocumento(data.nro_documento || '')
        setNacionalidad(data.nacionalidad || 'Argentina')
        setLugarNacimiento(data.lugar_nacimiento || '')
        setPasaporteComunitario(!!data.pasaporte_comunitario)
        setObraSocial(data.obra_social || '')
        setNroAfiliado(data.nro_afiliado || '')
        setPosicionSecundaria(data.posicion_secundaria || '')
        setVideoPromocional(data.video_promocional || '')
        setFechaInicioContrato(data.fecha_inicio_contrato || '')
        setFechaFinContrato(data.fecha_fin_contrato || '')
        setPensionId(data.pension_id || '')
        setCostoPension(data.costo_pension || '')
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
      contacto_emergencia_nombre: contactoEmergenciaNombre || null,
      telefono_emergencia: telefonoEmergencia || null,
      tambien_reserva: tambienReserva,
      nro_documento: nroDocumento || null,
      nacionalidad: nacionalidad || null,
      lugar_nacimiento: lugarNacimiento || null,
      pasaporte_comunitario: pasaporteComunitario,
      obra_social: obraSocial || null,
      nro_afiliado: nroAfiliado || null,
      posicion_secundaria: posicionSecundaria || null,
      video_promocional: videoPromocional || null,
      fecha_inicio_contrato: fechaInicioContrato || null,
      fecha_fin_contrato: fechaFinContrato || null,
      pension_id: pensionId || null,
      costo_pension: pensionId ? costoPension || null : null,
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
              {OPCIONES_POSICION.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Posición secundaria
            </label>
            <select
              value={posicionSecundaria}
              onChange={(e) => setPosicionSecundaria(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">Seleccionar...</option>
              {OPCIONES_POSICION.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
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

          <p className="text-xs tracking-widest uppercase pt-2" style={{ color: '#5B6B85' }}>
            Datos personales
          </p>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Nro. documento
            </label>
            <input
              type="text"
              value={nroDocumento}
              onChange={(e) => setNroDocumento(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Nacionalidad
              </label>
              <input
                type="text"
                value={nacionalidad}
                onChange={(e) => setNacionalidad(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Lugar de nacimiento
              </label>
              <input
                type="text"
                value={lugarNacimiento}
                onChange={(e) => setLugarNacimiento(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#F0F2F5' }}>
            <input
              type="checkbox"
              checked={pasaporteComunitario}
              onChange={(e) => setPasaporteComunitario(e.target.checked)}
            />
            Tiene pasaporte comunitario
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Obra social
              </label>
              <input
                type="text"
                value={obraSocial}
                onChange={(e) => setObraSocial(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Nro. afiliado
              </label>
              <input
                type="text"
                value={nroAfiliado}
                onChange={(e) => setNroAfiliado(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Video promocional (link)
            </label>
            <input
              type="url"
              value={videoPromocional}
              onChange={(e) => setVideoPromocional(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
              placeholder="https://..."
            />
          </div>

          <p className="text-xs tracking-widest uppercase pt-2" style={{ color: '#5B6B85' }}>
            Contrato
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Inicio de contrato
              </label>
              <input
                type="date"
                value={fechaInicioContrato}
                onChange={(e) => setFechaInicioContrato(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                Fin de contrato
              </label>
              <input
                type="date"
                value={fechaFinContrato}
                onChange={(e) => setFechaFinContrato(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <p className="text-xs tracking-widest uppercase pt-2" style={{ color: '#5B6B85' }}>
            Pensión / alojamiento
          </p>

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Pensión
            </label>
            <select
              value={pensionId}
              onChange={(e) => setPensionId(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">No vive en pensión</option>
              {pensiones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {pensionId && (
            <div>
              <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
                ¿Quién paga?
              </label>
              <select
                value={costoPension}
                onChange={(e) => setCostoPension(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              >
                <option value="">Seleccionar...</option>
                <option value="club">Club</option>
                <option value="compartido">Compartido</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Contacto de emergencia
            </label>
            <input
              type="text"
              value={contactoEmergenciaNombre}
              onChange={(e) => setContactoEmergenciaNombre(e.target.value)}
              className="w-full p-3 rounded-xl outline-none mb-2"
              style={inputStyle}
              placeholder="Nombre (ej: madre, padre, tutor)"
            />
            <input
              type="tel"
              value={telefonoEmergencia}
              onChange={(e) => setTelefonoEmergencia(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
              placeholder="Teléfono"
            />
          </div>

          {categorias.find((c) => c.id === categoriaId)?.es_reserva !== true && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#F0F2F5' }}>
              <input
                type="checkbox"
                checked={tambienReserva}
                onChange={(e) => setTambienReserva(e.target.checked)}
              />
              También pertenece al plantel de Reserva
            </label>
          )}

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