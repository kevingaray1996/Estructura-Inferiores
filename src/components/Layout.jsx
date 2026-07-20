import { useState } from 'react'
import { supabase } from '../supabaseClient'

const rolLabel = {
  coordinacion: 'Coordinación',
  medico: 'Depto. Médico',
  tecnico: 'Cuerpo técnico',
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F1419' }}>
      <div style={{ borderBottom: '1px solid #2A3548' }}>
        <div className="max-w-4xl mx-auto px-6 md:px-10 pt-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
              Club Comunicaciones
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {subtitulo && (
                <span className="text-xs" style={{ color: '#5B6B85' }}>
                  {subtitulo}
                </span>
              )}
              {perfil?.rol !== 'medico' && (
                <button
                  onClick={() => onCambiarSeccion('calendario')}
                  aria-label="Calendario"
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                  style={{
                    backgroundColor: seccionActiva === 'calendario' ? '#4ADE80' : '#1A2332',
                    color: seccionActiva === 'calendario' ? '#0F1419' : '#8A9BB8',
                    border: '1px solid #2A3548',
                  }}
                >
                  📅
                </button>
              )}
              <button
                onClick={() => onCambiarSeccion('buscar')}
                aria-label="Buscar"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80"
                style={{
                  backgroundColor: seccionActiva === 'buscar' ? '#4ADE80' : '#1A2332',
                  color: seccionActiva === 'buscar' ? '#0F1419' : '#8A9BB8',
                  border: '1px solid #2A3548',
                }}
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
                    style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
                  >
                    🔗
                  </button>
                  {mostrarLinkBienestar && perfil?.rol === 'coordinacion' && (
                    <div
                      className="absolute right-0 mt-2 p-2 rounded-xl z-10"
                      style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548', minWidth: '180px' }}
                    >
                      <p className="text-[10px] uppercase px-2 pb-1.5" style={{ color: '#5B6B85' }}>
                        Copiar link por categoría
                      </p>
                      {categoriasLink.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => copiarLink(c.id, c.nombre)}
                          className="block w-full text-left text-sm px-2 py-1.5 rounded-lg hover:opacity-80"
                          style={{ color: '#F0F2F5' }}
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {linkCopiado && (
                <span className="text-xs" style={{ color: '#4ADE80' }}>
                  ✓ Link de {linkCopiado} copiado
                </span>
              )}
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
                style={{ backgroundColor: '#1A2332', color: '#8A9BB8', border: '1px solid #2A3548' }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-4 -mb-px">
            {secciones.map((s) => {
              const activa = seccionActiva === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => onCambiarSeccion(s.id)}
                  className="px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors"
                  style={{
                    color: activa ? '#0F1419' : '#8A9BB8',
                    backgroundColor: activa ? '#4ADE80' : 'transparent',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

export default Layout
