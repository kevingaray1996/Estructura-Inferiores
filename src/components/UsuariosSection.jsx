import EncabezadoSeccion from './ui/EncabezadoSeccion'
import EstadoContenido from './ui/EstadoContenido'
import FranjaNumeros from './ui/FranjaNumeros'
import Boton from './ui/Boton'
import { textoGestion } from '../appearance/gestion'
import { COLORES } from '../theme'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { exportarBackupCompleto } from '../utils/exportarBackup'
import { comprimirImagen } from '../utils/comprimirImagen'

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
  const archivo = await comprimirImagen(file, { maxAncho: 600, maxAlto: 600 })
  const ext = archivo.name.split('.').pop()
  const nombreArchivo = `staff/${email.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('Biblioteca').upload(nombreArchivo, archivo, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('Biblioteca').getPublicUrl(nombreArchivo)
  return data.publicUrl
}

function UsuariosSection() {
  const [usuarios, setUsuarios] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
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
    border: `1px solid ${COLORES.borde}`,
    color: COLORES.texto,
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    const { data: usuariosData, error: errorUsuarios } = await supabase
      .from('perfiles')
      .select('*, categorias(nombre)')
      .order('orden_pdf', { ascending: true, nullsFirst: false })
      .order('rol')
    setErrorCarga(errorUsuarios || null)
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
      categoria_id: ['tecnico', 'preparador_fisico'].includes(rol) ? categoriaId || null : null,
      cargo_pdf: cargoPdf || null,
      aparece_en_pdf: apareceEnPdf,
      orden_pdf: ordenPdf === '' ? null : Number(ordenPdf),
      foto_url: fotoUrlFinal || null,
    }

    const { data, error } = usuarioEditando
      ? await supabase.from('perfiles').update(datos).eq('email', usuarioEditando.email).select('email')
      : await supabase.from('perfiles').insert(datos).select('email')

    setGuardando(false)
    if (error) {
      setErrorMsg(error.code === '42501' ? 'No tenés permiso para guardar este perfil. Revisá tu sesión.' : 'Error al guardar: ' + error.message)
    } else if (!data?.length) {
      setErrorMsg('No se confirmó el guardado del perfil. Puede haber cambiado o no tenés permiso; revisá tu acceso antes de reintentar.')
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
    <div className="dp-gestion" data-modulo="usuarios">
      <div className="dp-gestion-contenido">
        <EncabezadoSeccion eyebrow="Gestión" eyebrowResaltado="Equipo de trabajo" titulo="Usua" resaltado="rios" acciones={<><Boton variante="secundario" onClick={handleExportarBackup} disabled={exportando} aria-busy={exportando}>{exportando ? 'Generando…' : 'Exportar backup'}</Boton><Boton variante={mostrarForm ? 'secundario' : 'principal'} onClick={mostrarForm ? cancelarForm : abrirNuevo} aria-expanded={mostrarForm} aria-controls="usuarios-editor">{mostrarForm ? 'Cancelar' : '+ Nuevo usuario'}</Boton></>} />

        <p className="text-xs mb-6" style={{ color: COLORES.textoMuted }}>
          Antes de darlo de alta acá, creá el login de esa persona en Supabase
          (Authentication → Add user) con este mismo email.
        </p>

        {mostrarForm && (
          <div id="usuarios-editor" role="region" aria-labelledby="usuarios-editor-titulo"
            className="dp-panel dp-editor"
            style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
          >
            <div className="dp-panel-cabecera"><div><p className="dp-antetitulo">Perfil del equipo</p><h2 id="usuarios-editor-titulo">{usuarioEditando ? 'Editar usuario' : 'Nuevo usuario'}</h2><p>Identidad, rol, categoría y presentación en citaciones.</p></div><span className="dp-insignia">{usuarioEditando ? 'Edición' : 'Alta'}</span></div>
            {usuarioEditando && (
              <p className="text-xs" style={{ color: COLORES.textoSecundario }}>
                Editando {usuarioEditando.email}
              </p>
            )}

            <fieldset className="dp-grupo-campos"><legend>01 · Identidad del perfil</legend>
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
                style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
              >
                Cambiar foto
                <input type="file" accept="image/*" onChange={handleElegirFoto} className="dp-archivo-foto" />
              </label>
            </div>

            <label className="dp-campo"><span>Email del login</span><input
              type="email"
              placeholder="Email (el mismo del login de Supabase)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!usuarioEditando}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm disabled:opacity-50"
              style={inputStyle}
            /></label>
            <label className="dp-campo"><span>Nombre (opcional)</span><input
              type="text"
              placeholder="Nombre (opcional)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
              style={inputStyle}
            /></label>
            </fieldset><fieldset className="dp-grupo-campos"><legend>02 · Rol y categoría</legend><label className="dp-campo"><span>Rol del sistema</span><select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
              style={inputStyle}
            >
              <option value="coordinacion">Coordinación</option>
              <option value="medico">Depto. Médico</option>
              <option value="tecnico">Cuerpo técnico</option>
              <option value="preparador_fisico">Preparador Físico</option>
            </select></label>
            <p className="dp-ayuda-rol">Se mantienen los accesos existentes de cada rol. La categoría es obligatoria para el cuerpo técnico; un preparador sin categoría no tiene Planificación habilitada.</p>
            {['tecnico', 'preparador_fisico'].includes(rol) && (
<label className="dp-campo"><span>Categoría asignada</span>              <select
                aria-label="Categoría asignada"
                id="usuarios-categoriaId" value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
                style={inputStyle}
              >
                <option value="">{rol === 'tecnico' ? 'Categoría (obligatoria)' : 'Sin categoría — Planificación no habilitada'}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select></label>
            )}

            </fieldset><fieldset className="dp-grupo-campos dp-campo-completo"><legend>03 · Presentación en citaciones</legend>
            <div>
              <label htmlFor="usuarios-cargoPdf" className="text-xs block mb-1" style={{ color: COLORES.textoMuted }}>
                Cargo a mostrar (en el PDF de citación, en vez del rol del sistema)
              </label>
              <input
                type="text"
                placeholder="Ej: Videoanalista, Director Técnico, Ayudante de campo..."
                id="usuarios-cargoPdf" value={cargoPdf}
                onChange={(e) => setCargoPdf(e.target.value)}
                className="w-full p-2.5 rounded-xl ui-control outline-none text-sm"
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
                <label htmlFor="usuarios-ordenPdf" className="text-xs block mb-1" style={{ color: COLORES.textoMuted }}>
                  Orden en el PDF (1 = primero, menor número aparece antes)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ej: 1"
                  id="usuarios-ordenPdf" value={ordenPdf}
                  onChange={(e) => setOrdenPdf(e.target.value)}
                  className="w-24 p-2.5 rounded-xl ui-control outline-none text-sm"
                  style={inputStyle}
                />
              </div>
            )}

            </fieldset>
            {errorMsg && <EstadoContenido estado="error" titulo="Revisá el registro" mensaje={errorMsg} />}

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full p-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
              data-primario=""
            >
              {guardando ? 'Guardando...' : usuarioEditando ? 'Guardar cambios' : 'Guardar usuario'}
            </button>
          </div>
        )}

        {cargando && <EstadoContenido estado="cargando" titulo="Cargando usuarios" />}
        {!cargando && errorCarga && <EstadoContenido estado={errorCarga.code === '42501' ? 'denegado' : 'error'} titulo="No se pudo consultar la información" mensaje="No equivale a una lista vacía. Podés reintentar la consulta." onReintentar={cargarDatos} />}

        <FranjaNumeros etiqueta="Perfiles por rol" items={[{ etiqueta: 'Perfiles', valor: cargando || errorCarga ? null : usuarios.length }, ...['coordinacion', 'tecnico', 'preparador_fisico'].map(rol => ({ etiqueta: rolLabel[rol], valor: cargando || errorCarga ? null : usuarios.filter(u => u.rol === rol).length }))]} />
        <div className="dp-listado-usuarios">
          {!cargando && !errorCarga && usuarios.map((u) => (
            <div
              key={u.email}
              className="dp-registro dp-usuario"
              style={{ backgroundColor: COLORES.fondoTarjeta, borderTop: `3px solid ${COLORES.acento}`, borderLeft: `1px solid ${COLORES.borde}`, borderRight: `1px solid ${COLORES.borde}`, borderBottom: `1px solid ${COLORES.borde}` }}
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
                  <p className="dp-nombre-registro" style={{ color: COLORES.texto }}>
                    {u.nombre || u.email}
                  </p>
                  <p className="dp-datos-usuario" style={{ color: COLORES.textoSecundario }}>
                    {u.email}
                    {u.cargo_pdf ? ` · ${u.cargo_pdf}` : ''}
                  </p>
                </div>
              </div>
              <div className="dp-rol-acciones">
                {u.aparece_en_pdf && (
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ backgroundColor: COLORES.fondoPagina, color: textoGestion(COLORES.acento) }}
                    title="Aparece en el PDF de citación"
                  >
                    📄
                  </span>
                )}
                <span
                  className="dp-insignia"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                >
                  {rolLabel[u.rol] || u.rol}
                  {['tecnico', 'preparador_fisico'].includes(u.rol) && u.categorias?.nombre ? ` · ${u.categorias.nombre}` : ''}
                  {u.rol === 'preparador_fisico' && !u.categoria_id ? ' · Sin categoría (Planificación no habilitada)' : ''}
                </span>
                <button
                  aria-label={`Editar usuario ${u.nombre || u.email}`} onClick={() => abrirEditar(u)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario }}
                >
                  Editar
                </button>
                <button
                  aria-label={`Quitar acceso a ${u.nombre || u.email}`} onClick={() => handleEliminar(u)}
                  className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                  style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.peligro }}
                >
                  Quitar acceso
                </button>
              </div>
            </div>
          ))}
        </div>
        {!cargando && !errorCarga && usuarios.length === 0 && <EstadoContenido estado="vacio" titulo="Sin usuarios registrados" mensaje="No hay perfiles devueltos por la consulta actual." />}
      </div>
    </div>
  )
}

export default UsuariosSection
