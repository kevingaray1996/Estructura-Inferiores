import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'

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
  const [menuAbierto, setMenuAbierto] = useState(false)

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

  function seleccionarSeccion(id) {
    onCambiarSeccion(id)
    setMenuAbierto(false)
  }

  const iconBtnStyle = (activo) => ({
    backgroundColor: activo ? COLORES.acento : COLORES.fondoSidebar,
    color: activo ? '#1A1A1A' : COLORES.textoMuted,
    border: `1px solid ${COLORES.borde}`,
  })

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: COLORES.fondoPagina }}>
      {/* Barra superior solo mobile */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14"
        style={{ backgroundColor: COLORES.fondoSidebar, borderBottom: `1px solid ${COLORES.borde}` }}
      >
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-xl"
          style={{ color: COLORES.acento }}
        >
          ☰
        </button>
        <p className="text-xs tracking-widest uppercase font-medium truncate" style={{ color: COLORES.texto }}>
          Club Comunicaciones
        </p>
      </div>

      {/* Fondo oscuro al abrir menú en mobile */}
      {menuAbierto && (
        <div
          onClick={() => setMenuAbierto(false)}
          className="md:hidden fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 md:w-56 shrink-0 min-h-screen flex flex-col fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
        style={{ backgroundColor: COLORES.fondoSidebar, borderRight: `1px solid ${COLORES.borde}` }}
      >
        <div className="px-5 pt-6 pb-4 flex items-start justify-between" style={{ borderBottom: `1px solid ${COLORES.borde}` }}>
          <div>
            <p className="text-xs tracking-widest uppercase font-medium" style={{ color: COLORES.texto }}>
              Club Comunicaciones
            </p>
            {subtitulo && (
              <p className="text-xs mt-1" style={{ color: COLORES.acento }}>
                {subtitulo}
              </p>
            )}
          </div>
          <button
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-lg shrink-0"
            style={{ color: COLORES.textoMuted }}
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {secciones.map((s) => {
            const activa = seccionActiva === s.id
            return (
              <button
                key={s.id}
                onClick={() => seleccionarSeccion(s.id)}
                className="w-full text-left px-3 py-2.5 mb-0.5 text-sm rounded-r-lg transition-colors"
                style={{
                  color: activa ? COLORES.acento : COLORES.textoSecundario,
                  backgroundColor: activa ? 'rgba(242,194,48,0.08)' : 'transparent',
                  borderLeft: activa ? `3px solid ${COLORES.acento}` : '3px solid transparent',
                  fontWeight: activa ? 500 : 400,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="px-3 py-3" style={{ borderTop: `1px solid ${COLORES.borde}` }}>
          <div className="flex items-center gap-2 mb-3">
            {perfil?.rol !== 'medico' && (
              <button
                onClick={() => seleccionarSeccion('calendario')}
                aria-label="Calendario"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                style={iconBtnStyle(seccionActiva === 'calendario')}
              >
                📅
              </button>
            )}
            <button
              onClick={() => seleccionarSeccion('buscar')}
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
                    style={{ backgroundColor: COLORES.fondoPagina, border: `1px solid ${COLORES.borde}`, minWidth: '180px' }}
                  >
                    <p className="text-[10px] uppercase px-2 pb-1.5" style={{ color: COLORES.textoMuted }}>
                      Copiar link por categoría
                    </p>
                    {categoriasLink.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => copiarLink(c.id, c.nombre)}
                        className="block w-full text-left text-sm px-2 py-1.5 rounded-lg hover:opacity-80"
                        style={{ color: COLORES.texto }}
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
            <p className="text-xs mb-2" style={{ color: COLORES.exito }}>
              ✓ Link de {linkCopiado} copiado
            </p>
          )}

          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
            >
              {iniciales(perfil?.nombre || rolLabel[perfil?.rol])}
            </div>
            <div className="min-w-0">
              <p className="text-xs truncate" style={{ color: COLORES.texto }}>
                {perfil?.nombre || rolLabel[perfil?.rol] || 'Usuario'}
              </p>
              <p className="text-xs truncate" style={{ color: COLORES.textoMuted }}>
                {rolLabel[perfil?.rol] || ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-xs px-3 py-2 rounded-lg hover:opacity-80 text-left"
            style={{ backgroundColor: COLORES.fondoPagina, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0">{children}</div>
    </div>
  )
}

export default Layout
