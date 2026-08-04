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
    setErrorMsg('')
    setMostrarForm(true)
  }

  function abrirEditar(u) {
    setUsuarioEditando(u)
    setEmail(u.email)
    setNombre(u.nombre || '')
    setRol(u.rol)
    setCategoriaId(u.categoria_id || '')
    setErrorMsg('')
    setMostrarForm(true)
  }

  function cancelarForm() {
    setMostrarForm(false)
    setUsuarioEditando(null)
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

    const datos = {
      email: email.trim().toLowerCase(),
      nombre: nombre || null,
      rol,
      categoria_id: rol === 'tecnico' ? categoriaId : null,
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
              <div>
                <p className="text-sm font-medium" style={{ color: COLORES.texto }}>
                  {u.nombre || u.email}
                </p>
                <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                  {u.email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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



