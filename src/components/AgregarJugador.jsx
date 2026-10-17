
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { sanitizarNombreArchivo } from '../utils/archivos'
import { comprimirImagen } from '../utils/comprimirImagen'
import { COLORES } from '../theme'

const CATEGORIA_PRIMERA_ID = '438874e7-e59f-460b-bec4-3c0ef5b44016'

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
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [categoriaId, setCategoriaId] = useState(CATEGORIA_PRIMERA_ID)
  const [estado, setEstado] = useState('disponible')
  const [estadoDetalle, setEstadoDetalle] = useState('')
  const [posicion, setPosicion] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [pieHabil, setPieHabil] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState('')
  const [telefonoEmergencia, setTelefonoEmergencia] = useState('')
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
  const [representantesTodos, setRepresentantesTodos] = useState([])
  const [representanteId, setRepresentanteId] = useState('')
  const [nuevoRepresentanteNombre, setNuevoRepresentanteNombre] = useState('')
  const [asignacionVigenteId, setAsignacionVigenteId] = useState(null)
  const [representanteVigenteId, setRepresentanteVigenteId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cargando, setCargando] = useState(!!jugadorIdEditar)

  const esEdicion = !!jugadorIdEditar

  useEffect(() => {
    async function cargarPensiones() {
      const { data, error } = await supabase
        .from('pensiones')
        .select('*')
        .order('nombre')

      if (error) console.error('Error al cargar pensiones:', error)
      setPensiones(data || [])
    }

    cargarPensiones()
  }, [])

  useEffect(() => {
    async function cargarRepresentantes() {
      const { data, error } = await supabase
        .from('representantes')
        .select('*')
        .order('nombre')

      if (error) console.error('Error al cargar representantes:', error)
      setRepresentantesTodos(data || [])
    }

    cargarRepresentantes()
  }, [])

  useEffect(() => {
    async function cargarRepresentanteVigente() {
      if (!jugadorIdEditar) return

      const { data, error } = await supabase
        .from('jugador_representantes')
        .select('id, representante_id')
        .eq('jugador_id', jugadorIdEditar)
        .is('fecha_fin', null)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error al cargar representante vigente:', error)
        return
      }

      if (data) {
        setAsignacionVigenteId(data.id)
        setRepresentanteId(data.representante_id)
        setRepresentanteVigenteId(data.representante_id)
      }
    }

    cargarRepresentanteVigente()
  }, [jugadorIdEditar])

  useEffect(() => {
    let activo = true

    async function cargarJugador() {
      if (!jugadorIdEditar) {
        setCargando(false)
        return
      }

      const { data, error } = await supabase
        .from('jugadores')
        .select('*')
        .eq('id', jugadorIdEditar)
        .single()

      if (!activo) return

      if (error || !data) {
        console.error('Error al cargar jugadora:', error)
        setErrorMsg('No se pudieron cargar los datos de la jugadora.')
        setCargando(false)
        return
      }

      setNombre(data.nombre || '')
      setApellido(data.apellido || '')
      setCategoriaId(data.categoria_id || '')
      setEstado(data.estado || 'disponible')
      setEstadoDetalle(data.estado_detalle || '')
      setPosicion(data.posicion || '')
      setFechaNacimiento(data.fecha_nacimiento || '')
      setPieHabil(data.pie_habil || '')
      setFotoUrl(data.foto_url || '')
      setContactoEmergenciaNombre(data.contacto_emergencia_nombre || '')
      setTelefonoEmergencia(data.telefono_emergencia || '')
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
      setCargando(false)
    }

    cargarJugador()

    return () => {
      activo = false
    }
  }, [jugadorIdEditar])

  async function handleSubirFoto(archivo) {
    if (!archivo) return

    setSubiendoFoto(true)

    try {
      const archivoComprimido = await comprimirImagen(archivo, {
        maxAncho: 500,
        maxAlto: 500,
      })

      const nombreArchivo = `jugadores/${Date.now()}-${sanitizarNombreArchivo(archivoComprimido.name)}`

      const { error } = await supabase.storage
        .from('Biblioteca')
        .upload(nombreArchivo, archivoComprimido, { upsert: true })

      if (error) {
        alert('Error al subir la foto: ' + error.message)
        return
      }

      const { data } = supabase.storage
        .from('Biblioteca')
        .getPublicUrl(nombreArchivo)

      setFotoUrl(data.publicUrl)
    } catch (error) {
      console.error('Error al procesar la foto:', error)
      alert('No se pudo procesar la foto. Intentá nuevamente.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!nombre.trim() || !apellido.trim()) {
      setErrorMsg('Completá nombre y apellido.')
      return
    }

    if (!categoriaId) {
      setErrorMsg('No se pudo identificar la categoría de la jugadora.')
      return
    }

    if (subiendoFoto) {
      setErrorMsg('Esperá a que termine de subirse la foto.')
      return
    }

    setGuardando(true)

    const datos = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      categoria_id: categoriaId,
      estado,
      estado_detalle: estado === 'no_disponible' ? estadoDetalle || null : null,
      posicion: posicion || null,
      fecha_nacimiento: fechaNacimiento || null,
      pie_habil: pieHabil || null,
      foto_url: fotoUrl || null,
      contacto_emergencia_nombre: contactoEmergenciaNombre || null,
      telefono_emergencia: telefonoEmergencia || null,
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

    const { data: jugadorGuardado, error } = esEdicion
      ? await supabase
          .from('jugadores')
          .update(datos)
          .eq('id', jugadorIdEditar)
          .select()
          .single()
      : await supabase
          .from('jugadores')
          .insert(datos)
          .select()
          .single()

    if (error) {
      setGuardando(false)
      setErrorMsg('Error al guardar: ' + error.message)
      return
    }

    const errorRepresentante = await sincronizarRepresentante(jugadorGuardado.id)

    setGuardando(false)

    if (errorRepresentante) {
      setErrorMsg(
        'La jugadora se guardó, pero hubo un error con el representante: ' +
          errorRepresentante
      )
    } else {
      onGuardado()
    }
  }

  async function sincronizarRepresentante(jugadorId) {
    let representanteFinalId = representanteId || null

    if (representanteId === '__nuevo__') {
      if (!nuevoRepresentanteNombre.trim()) {
        return 'Ingresá el nombre del nuevo representante.'
      }

      const { data: nuevoRep, error: errorNuevo } = await supabase
        .from('representantes')
        .insert({ nombre: nuevoRepresentanteNombre.trim() })
        .select()
        .single()

      if (errorNuevo) return errorNuevo.message
      representanteFinalId = nuevoRep.id
    }

    if (representanteFinalId === (representanteVigenteId || null)) {
      return null
    }

    if (asignacionVigenteId) {
      const { error } = await supabase
        .from('jugador_representantes')
        .update({ fecha_fin: new Date().toISOString().slice(0, 10) })
        .eq('id', asignacionVigenteId)

      if (error) return error.message
    }

    if (representanteFinalId) {
      const { error } = await supabase.from('jugador_representantes').insert({
        jugador_id: jugadorId,
        representante_id: representanteFinalId,
        fecha_inicio: new Date().toISOString().slice(0, 10),
      })

      if (error) return error.message
    }

    return null
  }

  const inputStyle = {
    backgroundColor: 'var(--fondo-tarjeta)',
    border: '1px solid var(--borde)',
    color: 'var(--texto)',
  }

  if (cargando) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--fondo)' }}
      >
        <p style={{ color: 'var(--texto-muted)' }}>Cargando...</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ backgroundColor: 'var(--fondo)', color: 'var(--texto)' }}
    >
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-2 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--texto-secundario)' }}
        >
          ← Volver al plantel
        </button>

        <div
          className="rounded-2xl p-6 md:p-8 mb-6"
          style={{
            backgroundColor: 'var(--fondo-tarjeta)',
            border: '1px solid var(--borde)',
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: COLORES.acento }}
          >
            Comunicaciones · Fútbol femenino
          </p>

          <h1
            className="text-2xl md:text-3xl"
            style={{
              fontFamily: "'Archivo Black', sans-serif",
              color: 'var(--texto)',
            }}
          >
            {esEdicion ? 'Editar jugadora' : 'Nueva jugadora'}
          </h1>

          <p className="text-sm mt-2" style={{ color: 'var(--texto-muted)' }}>
            {esEdicion
              ? 'Actualizá la información de la jugadora.'
              : 'Alta de una nueva integrante de Primera División.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-5 md:p-8 space-y-5"
          style={{
            backgroundColor: 'var(--fondo-tarjeta)',
            border: '1px solid var(--borde)',
          }}
        >
          <div className="flex items-center gap-4">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt="Foto de la jugadora"
                className="w-20 h-20 rounded-full object-cover shrink-0"
                style={{ border: `2px solid ${COLORES.acento}` }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full shrink-0 flex items-center justify-center text-2xl"
                style={{
                  backgroundColor: 'var(--fondo-sidebar)',
                  border: '1px solid var(--borde)',
                }}
              >
                📷
              </div>
            )}

            <div>
              <label
                className="text-sm font-medium px-4 py-2.5 rounded-xl cursor-pointer inline-block transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fondo-sidebar)',
                  color: 'var(--texto)',
                  border: '1px solid var(--borde)',
                }}
              >
                {subiendoFoto ? 'Subiendo foto...' : fotoUrl ? 'Cambiar foto' : 'Subir foto'}
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
                  className="text-xs ml-3 hover:opacity-70"
                  style={{ color: 'var(--peligro)' }}
                >
                  Quitar foto
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Nombre *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
                placeholder="Nombre"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Apellido *
              </label>
              <input
                type="text"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
                placeholder="Apellido"
              />
            </div>
          </div>

          <div
            className="flex items-center justify-between gap-3 p-4 rounded-xl"
            style={{
              backgroundColor: 'var(--fondo-sidebar)',
              border: '1px solid var(--borde)',
            }}
          >
            <div>
              <p className="text-sm font-semibold">Categoría del plantel</p>
              <p className="text-xs mt-1" style={{ color: 'var(--texto-muted)' }}>
                {esEdicion
                  ? 'Se conserva la categoría actual de la jugadora.'
                  : 'Las nuevas altas se asignan a Primera División.'}
              </p>
            </div>
            <span
              className="text-xs font-semibold px-3 py-2 rounded-full shrink-0"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
            >
              Primera División
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Documento
              </label>
              <input
                type="text"
                value={nroDocumento}
                onChange={(e) => setNroDocumento(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Posición principal
              </label>
              <select
                value={posicion}
                onChange={(e) => setPosicion(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              >
                <option value="">Seleccionar...</option>
                {OPCIONES_POSICION.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Número de afiliado
              </label>
              <input
                type="text"
                value={nroAfiliado}
                onChange={(e) => setNroAfiliado(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
                Video promocional
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
          </div>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={pasaporteComunitario}
              onChange={(e) => setPasaporteComunitario(e.target.checked)}
            />
            Tiene pasaporte comunitario
          </label>

          <div className="pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
            <h2 className="text-sm font-semibold mb-4">Contrato</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
                <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
            <h2 className="text-sm font-semibold mb-4">Representante</h2>
            <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
              Representante actual
            </label>
            <select
              value={representanteId}
              onChange={(e) => setRepresentanteId(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="">No tiene representante</option>
              {representantesTodos.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
              <option value="__nuevo__">+ Agregar nuevo representante...</option>
            </select>

            {representanteId === '__nuevo__' && (
              <input
                type="text"
                placeholder="Nombre del representante"
                value={nuevoRepresentanteNombre}
                onChange={(e) => setNuevoRepresentanteNombre(e.target.value)}
                className="w-full p-3 rounded-xl outline-none mt-3"
                style={inputStyle}
              />
            )}
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
            <h2 className="text-sm font-semibold mb-4">Pensión y alojamiento</h2>
            <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>

            {pensionId && (
              <div className="mt-4">
                <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
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
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
            <h2 className="text-sm font-semibold mb-4">Contacto de emergencia</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={contactoEmergenciaNombre}
                onChange={(e) => setContactoEmergenciaNombre(e.target.value)}
                className="w-full p-3 rounded-xl outline-none"
                style={inputStyle}
                placeholder="Nombre (madre, padre, tutor...)"
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
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
            <h2 className="text-sm font-semibold mb-4">Disponibilidad</h2>
            <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--texto-muted)' }}>
              Estado actual
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full p-3 rounded-xl outline-none"
              style={inputStyle}
            >
              <option value="disponible">Disponible</option>
              <option value="lesionado">Lesionada</option>
              <option value="suspendido">Suspendida</option>
              <option value="no_disponible">No disponible</option>
            </select>

            {estado === 'no_disponible' && (
              <input
                type="text"
                value={estadoDetalle}
                onChange={(e) => setEstadoDetalle(e.target.value)}
                className="w-full p-3 rounded-xl outline-none mt-3"
                style={inputStyle}
                placeholder="Motivo de la indisponibilidad"
              />
            )}
          </div>

          {errorMsg && (
            <p
              className="text-sm p-3 rounded-xl"
              role="alert"
              style={{
                color: 'var(--peligro)',
                backgroundColor: 'var(--fondo-sidebar)',
              }}
            >
              {errorMsg}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3">
            <button
              type="button"
              onClick={onVolver}
              className="flex-1 p-3 rounded-xl font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--fondo-sidebar)',
                color: 'var(--texto)',
                border: '1px solid var(--borde)',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={guardando || subiendoFoto}
              className="flex-1 p-3 rounded-xl font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
            >
              {guardando
                ? 'Guardando...'
                : esEdicion
                  ? 'Guardar cambios'
                  : 'Guardar jugadora'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AgregarJugador
