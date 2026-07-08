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
  ]
}

function Layout({ seccionActiva, onCambiarSeccion, perfil, children }) {
  const secciones = seccionesParaRol(perfil?.rol)
  const subtitulo =
    perfil?.rol === 'tecnico' && perfil?.categorias?.nombre
      ? `${rolLabel[perfil.rol]} · ${perfil.categorias.nombre}`
      : rolLabel[perfil?.rol] || ''

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F1419' }}>
      <div style={{ borderBottom: '1px solid #2A3548' }}>
        <div className="max-w-4xl mx-auto px-6 md:px-10 pt-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="text-xs tracking-widest uppercase" style={{ color: '#5B6B85' }}>
              Estructura Inferiores
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
