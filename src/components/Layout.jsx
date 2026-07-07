function Layout({ seccionActiva, onCambiarSeccion, children }) {
const secciones = [
    { id: 'plantel', label: 'Plantel' },
    { id: 'medicos', label: 'Médicos' },
    { id: 'nutricion', label: 'Nutrición' },
    { id: 'psicologia', label: 'Psicología' },
    { id: 'video', label: 'Videoanálisis' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'entrenamientos', label: 'Entrenamientos' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F1419' }}>
      <div style={{ borderBottom: '1px solid #2A3548' }}>
        <div className="max-w-4xl mx-auto px-6 md:px-10 pt-6">
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: '#5B6B85' }}>
            Estructura Inferiores
          </p>
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