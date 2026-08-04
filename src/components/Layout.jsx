import { useState } from 'react'
import { supabase } from '../supabaseClient'

const rolLabel = {
  coordinacion: 'Coordinación',
  medico: 'Depto. Médico',
  tecnico: 'Cuerpo técnico',
  preparador_fisico: 'Preparador Físico',
}

function iniciales(texto) {
  if (!texto) return '??'
  const partes = texto.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function seccionesParaRol(rol) {
  if (rol === 'coordinacion') {
    return [
      { id: 'inicio', label: 'Inicio' },
      { id: 'plantel', label: 'Plantel' },
      { id: 'medicos', label: 'Médicos' },
      { id: 'nutricion', label: 'Nutrición' },
      { id: 'psicologia', label: 'Psicología' },
      { id: 'video', label: 'Videoanálisis' },
      { id: 'partidos', label: 'Partidos' },
      { id: 'entrenamientos', label: 'Entrenamientos' },
      { id: 'asistencia', label: 'Asistencia' },
      { id: 'fisico', label: 'Físico' },
      { id: 'captacion', label: 'Captación' },
      { id: 'representantes', label: 'Representantes' },
      { id: 'pensiones', label: 'Pensión' },
      { id: 'seleccion', label: 'Selección' },
      { id: 'contratos', label: 'Contratos' },
      { id: 'pases', label: 'Pases' },
      { id: 'usuarios', label: 'Usuarios' },
    ]
  }
  if (rol === 'medico') {
    return [
      { id: 'inicio', label: 'Inicio' },
      { id: 'medicos', label: 'Médicos' },
      { id: 'nutricion', label: 'Nutrición' },
      { id: 'psicologia', label: 'Psicología' },
      { id: 'bienestar', label: 'Bienestar' },
    ]
  }
  if (rol === 'preparador_fisico') {
    return [
      { id: 'inicio', label: 'Inicio' },
      { id: 'plantel', label: 'Plantel' },
      { id: 'medicos', label: 'Médicos' },
      { id: 'nutricion', label: 'Nutrición' },
      { id: 'partidos', label: 'Partidos' },
      { id: 'entrenamientos', label: 'Entrenamientos' },
      { id: 'fisico', label: 'Físico' },
    ]
  }
  // tecnico
  return [
    { id: 'inicio', label: 'Inicio' },
    { id: 'plantel', label: 'Plantel' },
    { id: 'video', label: 'Videoanálisis' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'entrenamientos', label: 'Entrenamientos' },
    { id: 'asistencia', label: 'Asistencia' },
    { id: 'fisico', label: 'Físico' },
    { id: 'captacion', label: 'Captación' },
    { id: 'representantes', label: 'Representantes' },
    { id: 'pensiones', label: 'Pensión' },
    { id: 'seleccion', label: 'Selección' },
    { id: 'contratos', label: 'Contratos' },
  ]
}

function Layout({ seccionActiva, onCambiarSeccion, perfil, children }) {
  const secciones = seccionesParaRol(perfil?.rol)
  const subtitulo =
    perfil?.rol === 'tecnico' && perfil?.categorias?.nombre
      ? `${rolLabel[perfil.rol]} · ${perfil.categorias.nombre}`
      : rolLabel[perfil?.rol] || ''

  const [mostrarLinkBienestar, setMostrarLinkBienestar] = useState(false)
  const [categoriasLink, setCategoriasLink] = useState([])
  const [linkCopiado, setLinkCopiado] = useState('')

  function construirLink(categoriaId) {
    const url = new URL(window.location.href)
    url.search = `?bienestar=${categoriaId}`
    return url.toString()
  }

  async function copiarLink(categoriaId, etiqueta) {
    try {
      await navigator.clipboard.writeText(construirLink(categoriaId))
      setLinkCopiado(etiqueta)
    } catch {
      window.prompt('Copiá el link:', construirLink(categoriaId))
    }
    setTimeout(() => setLinkCopiado(''), 2500)
  }

  async function toggleLinkBienestar() {
    if (perfil?.rol === 'tecnico') {
      copiarLink(perfil.categoria_id, perfil?.categorias?.nombre || 'tu categoría')
      return
    }
    if (!mostrarLinkBienestar && categoriasLink.length === 0) {
      const { data } = await supabase.from('categorias').select('*').order('orden')
      setCategoriasLink(data || [])
    }
    setMostrarLinkBienestar((v) => !v)
  }

  const iconBtnStyle = (activo) => ({
    backgroundColor: activo ? '#F2C230' : '#1A1A18',
    color: activo ? '#1A1A1A' : '#8A8A82',
    border: '1px solid #2C2C2A',
  })

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#1A1A18' }}>
      {/* Sidebar */}
      <aside
        className="w-56 shrink-0 min-h-screen flex flex-col"
        style={{ backgroundColor: '#0A0A0A', borderRight: '1px solid #2C2C2A' }}
      >
        <div className="px-5 pt-6 pb-4" style={{ borderBottom: '1px solid #2C2C2A' }}>
          <p className="text-xs tracking-widest uppercase font-medium" style={{ color: '#FFFFFF' }}>
            Club Comunicaciones
          </p>
          {subtitulo && (
            <p className="text-xs mt-1" style={{ color: '#F2C230' }}>
              {subtitulo}
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {secciones.map((s) => {
            const activa = seccionActiva === s.id
            return (
              <button
                key={s.id}
                onClick={() => onCambiarSeccion(s.id)}
                className="w-full text-left px-3 py-2.5 mb-0.5 text-sm rounded-r-lg transition-colors"
                style={{
                  color: activa ? '#F2C230' : '#B4B2A9',
                  backgroundColor: activa ? 'rgba(242,194,48,0.08)' : 'transparent',
                  borderLeft: activa ? '3px solid #F2C230' : '3px solid transparent',
                  fontWeight: activa ? 500 : 400,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="px-3 py-3" style={{ borderTop: '1px solid #2C2C2A' }}>
          <div className="flex items-center gap-2 mb-3">
            {perfil?.rol !== 'medico' && (
              <button
                onClick={() => onCambiarSeccion('calendario')}
                aria-label="Calendario"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                style={iconBtnStyle(seccionActiva === 'calendario')}
              >
                📅
              </button>
            )}
            <button
              onClick={() => onCambiarSeccion('buscar')}
              aria-label="Buscar"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
              style={iconBtnStyle(seccionActiva === 'buscar')}
            >
              🔍
            </button>
            {(perfil?.rol === 'tecnico' || perfil?.rol === 'coordinacion') && (
              <div className="relative">
                <button
                  onClick={toggleLinkBienestar}
                  aria-label="Link de bienestar"
                  title="Copiar link de bienestar para los jugadores"
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                  style={iconBtnStyle(false)}
                >
                  🔗
                </button>
                {mostrarLinkBienestar && perfil?.rol === 'coordinacion' && (
                  <div
                    className="absolute left-0 bottom-10 p-2 rounded-xl z-10"
                    style={{ backgroundColor: '#1A1A18', border: '1px solid #2C2C2A', minWidth: '180px' }}
                  >
                    <p className="text-[10px] uppercase px-2 pb-1.5" style={{ color: '#8A8A82' }}>
                      Copiar link por categoría
                    </p>
                    {categoriasLink.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => copiarLink(c.id, c.nombre)}
                        className="block w-full text-left text-sm px-2 py-1.5 rounded-lg hover:opacity-80"
                        style={{ color: '#FFFFFF' }}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {linkCopiado && (
            <p className="text-xs mb-2" style={{ color: '#97C459' }}>
              ✓ Link de {linkCopiado} copiado
            </p>
          )}

          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: '#F2C230', color: '#1A1A1A' }}
            >
              {iniciales(perfil?.nombre || rolLabel[perfil?.rol])}
            </div>
            <div className="min-w-0">
              <p className="text-xs truncate" style={{ color: '#FFFFFF' }}>
                {perfil?.nombre || rolLabel[perfil?.rol] || 'Usuario'}
              </p>
              <p className="text-xs truncate" style={{ color: '#8A8A82' }}>
                {rolLabel[perfil?.rol] || ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-xs px-3 py-2 rounded-lg hover:opacity-80 text-left"
            style={{ backgroundColor: '#1A1A18', color: '#B4B2A9', border: '1px solid #2C2C2A' }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default Layout