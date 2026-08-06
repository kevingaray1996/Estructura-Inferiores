import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { exportarBackupCompleto } from '../utils/exportarBackup'

const rolLabel = {
  coordinacion: 'Coordinación',
  medico: 'Depto. Médico',
  tecnico: 'Cuerpo técnico',
  preparador_fisico: 'Preparador Físico',
}

function iniciales(nombre, email) {
  const base = nombre || email || '?'
  const partes = base.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

async function subirFotoPerfil(file, email) {
  const ext = file.name.split('.').pop()
  const nombreArchivo = `staff/${email.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
  return data.publicUrl
}

function UsuariosSection() {
  const [usuarios, setUsuarios] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState(null)

  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('tecnico')
  const [categoriaId, setCategoriaId] = useState('')
  const [cargoPdf, setCargoPdf] = useState('')
  const [apareceEnPdf, setApareceEnPdf] = useState(false)
  const [ordenPdf, setOrdenPdf] = useState('')
  const [fotoUrlActual, setFotoUrlActual] = useState('')
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [exportando, setExportando] = useState(false)

  const inputStyle = {
    backgroundColor: COLORES.fondoTarjeta,
    border: '1px solid COLORES.borde',
    color: COLORES.texto,
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    const { data: usuariosData } = await supabase
      .from('perfiles')
      .select('*, categorias(nombre)')
      .order('orden_pdf', { ascending: true, nullsFirst: false })
      .order('rol')
    setUsuarios(usuariosData || [])
    const { data: categoriasData } = await supabase.from('categorias').select('*').order('orden')
    setCategorias(categoriasData || [])
    setCargando(false)
  }

  async function handleExportarBackup() {
    setExportando(true)
    try {
      await exportarBackupCompleto()
    } finally {
      setExportando(false)
    }
  }

  function abrirNuevo() {
    setUsuarioEditando(null)
    setEmail('')
    setNombre('')
    setRol('tecnico')
    setCategoriaId('')
    setCargoPdf('')
    setApareceEnPdf(false)
    setOrdenPdf('')
    setFotoUrlActual('')
    setFotoArchivo(null)
    setFotoPreview('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(u) {
    setUsuarioEditando(u)
    setEmail(u.email)
    setNombre(u.nombre || '')
    setRol(u.rol)
    setCategoriaId(u.categoria_id || '')
    setCargoPdf(u.cargo_pdf || '')
    setApareceEnPdf(!!u.aparece_en_pdf)
    setOrdenPdf(u.orden_pdf ?? '')
    setFotoUrlActual(u.foto_url || '')
    setFotoArchivo(null)
    setFotoPreview('')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setUsuarioEditando(null)
  }

  function handleElegirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoArchivo(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  async function handleGuardar() {
    setErrorMsg('')
    if (!email) {
      setErrorMsg('El email es obligatorio.')
      return
    }
    if (rol === 'tecnico' && !categoriaId) {
      setErrorMsg('El cuerpo técnico necesita una categoría asignada.')
      return
    }
    setGuardando(true)

    let fotoUrlFinal = fotoUrlActual
    if (fotoArchivo) {
      try {
        fotoUrlFinal = await subirFotoPerfil(fotoArchivo, email.trim().toLowerCase())
      } catch (err) {
        setErrorMsg('Error al subir la foto: ' + err.message)
        setGuardando(false)
        return
      }
    }

    const datos = {
      email: email.trim().toLowerCase(),
      nombre: nombre || null,
      rol,
      categoria_id: rol === 'tecnico' ? categoriaId : null,
      cargo_pdf: cargoPdf || null,
      aparece_en_pdf: apareceEnPdf,
      orden_pdf: ordenPdf === '' ? null : Number(ordenPdf),
      foto_url: fotoUrlFinal || null,
    }

    const { error } = usuarioEditando
      ? await supabase.from('perfiles').update(datos).eq('email', usuarioEditando.email)
      : await supabase.from('perfiles').insert(datos)

    setGuardando(false)
    if (error) {
      setErrorMsg('Error al guardar: ' + error.message)
    } else {
      setMostrarForm(false)
      setUsuarioEditando(null)
      cargarDatos()
    }
  }

  async function handleEliminar(u) {
    const confirmar = window.confirm(`¿Seguro que querés quitarle el acceso a ${u.email}?`)
    if (!confirmar) return
    await supabase.from('perfiles').delete().eq('email', u.email)
    cargarDatos()
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
          <h1
            className="text-2xl md:text-3xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", color: COLORES.texto }}
          >
            Usuarios
          </h1>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleExportarBackup}
              disabled={exportando}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.texto, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
            >
              {exportando ? 'Generando...' : '📦 Exportar backup'}
            </button>
            <button
              onClick={mostrarForm ? cancelarForm : abrirNuevo}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {mostrarForm ? 'Cancelar' : '+ Nuevo usuario'}
            </button>
          </div>
        </div>
        <p className="text-xs mb-6" style={{ color: COLORES.textoMuted }}>
          Antes de darlo de alta acá, creá el login de esa persona en Supabase
          (Authentication → Add user) con este mismo email.
        </p>

        {mostrarForm && (
          <div
            className="space-y-3 mb-8 p-4 rounded-xl"
            style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
          >
            {usuarioEditando && (
              <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                Editando {usuarioEditando.email}
              </p>
            )}

            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-sm font-medium shrink-0"
                style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
              >
                {fotoPreview || fotoUrlActual ? (
                  <img src={fotoPreview || fotoUrlActual} alt="" className="w-full h-full object-cover" />
                ) : (
                  iniciales(nombre, email)
                )}
              </div>
              <label
                className="text-xs font-medium px-3 py-2 rounded-lg cursor-pointer hover:opacity-80"
                style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, border: '1px solid COLORES.borde' }}
              >
                Cambiar foto
                <input type="file" accept="image/*" onChange={handleElegirFoto} className="hidden" />
              </label>
            </div>

            <input
              type="email"
              placeholder="Email (el mismo del login de Supabase)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!usuarioEditando}
              className="w-full p-2.5 rounded-xl outline-none text-sm disabled:opacity-50"
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Nombre (opcional)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            >
              <option value="coordinacion">Coordinación (acceso total)</option>
              <option value="medico">Depto. Médico (médicos/nutrición/psicología, todas las categorías)</option>
              <option value="tecnico">Cuerpo técnico (una sola categoría)</option>
              <option value="preparador_fisico">Preparador Físico (Físico + Carga + CMJ)</option>
            </select>
            {rol === 'tecnico' && (
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              >
                <option value="">Categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            )}

            <div>
              <label className="text-xs block mb-1" style={{ color: COLORES.textoMuted }}>
                Cargo a mostrar (en el PDF de citación, en vez del rol del sistema)
              </label>
              <input
                type="text"
                placeholder="Ej: Videoanalista, Director Técnico, Ayudante de campo..."
                value={cargoPdf}
                onChange={(e) => setCargoPdf(e.target.value)}
                className="w-full p-2.5 rounded-xl outline-none text-sm"
                style={inputStyle}
              />
            </div>

            <label className="flex items-center gap-2 text-sm" style={{ color: COLORES.textoSecundario }}>
              <input
                type="checkbox"
                checked={apareceEnPdf}
                onChange={(e) => setApareceEnPdf(e.target.checked)}
              />
              Aparece en el PDF de citación
            </label>

            {apareceEnPdf && (
              <div>
                <label className="text-xs block mb-1" style={{ color: COLORES.textoMuted }}>
                  Orden en el PDF (1 = primero, menor número aparece antes)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ej: 1"
                  value={ordenPdf}
                  onChange={(e) => setOrdenPdf(e.target.value)}
                  className="w-24 p-2.5 rounded-xl outline-none text-sm"
                  style={inputStyle}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-sm" style={{ color: COLORES.peligro }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COLORES.exito, color: COLORES.fondoPagina }}
            >
              {guardando ? 'Guardando...' : usuarioEditando ? 'Guardar cambios' : 'Guardar usuario'}
            </button>
          </div>
        )}

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

        <div className="space-y-2">
          {usuarios.map((u) => (
            <div
              key={u.email}
              className="p-3 rounded-xl flex items-center justify-between gap-3"
              style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: '3px solid COLORES.acento', borderLeft: '1px solid COLORES.borde', borderRight: '1px solid COLORES.borde', borderBottom: '1px solid COLORES.borde' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-medium shrink-0"
                  style={{ backgroundColor: COLORES.fondoSidebar, color: COLORES.textoSecundario }}
                >
                  {u.foto_url ? (
                    <img src={u.foto_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    iniciales(u.nombre, u.email)
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: COLORES.texto }}>
                    {u.nombre || u.email}
                  </p>
                  <p className="text-xs truncate" style={{ color: COLORES.textoSecundario }}>
                    {u.email}
                    {u.cargo_pdf ? ` · ${u.cargo_pdf}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.aparece_en_pdf && (
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.acento }}
                    title="Aparece en el PDF de citación"
                  >
                    📄
                  </span>
                )}
                <span
                  className="text-xs font-mono px-2 py-1 rounded-full"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                >
                  {rolLabel[u.rol] || u.rol}
                  {u.rol === 'tecnico' && u.categorias?.nombre ? ` · ${u.categorias.nombre}` : ''}
                </span>
                <button
                  onClick={() => abrirEditar(u)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleEliminar(u)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default UsuariosSection
