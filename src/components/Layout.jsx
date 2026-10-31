
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'
import SelectorApariencia from '../appearance/SelectorApariencia'
import { filtrarSeccionesVisibles, resolverSeccionVisible } from '../config/visibilidadSecciones'
import { puedePlanificar } from '../utils/planificacion'

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
      { id: 'analisis', label: 'Análisis' },
      { id: 'partidos', label: 'Partidos' },
      { id: 'calendario', label: 'Calendario' },
      { id: 'entrenamientos', label: 'Entrenamientos' },
      { id: 'planificacion', label: 'Planificación semanal' },
      { id: 'asistencia', label: 'Asistencia' },
      { id: 'fisico', label: 'Físico' },
      { id: 'captacion', label: 'Captación' },
      { id: 'representantes', label: 'Representantes' },
      { id: 'pensiones', label: 'Pensión' },
      { id: 'seleccion', label: 'Selección' },
      { id: 'contratos', label: 'Contratos' },
      { id: 'pases', label: 'Pases' },
      { id: 'informes', label: 'Informes automáticos' },
      { id: 'usuarios', label: 'Usuarios' },
      { id: 'evaluaciones', label: 'Evaluaciones' },
    ]
  }

  if (rol === 'medico') {
    return [
      { id: 'inicio', label: 'Inicio' },
      { id: 'medicos', label: 'Médicos' },
      { id: 'nutricion', label: 'Nutrición' },
      { id: 'psicologia', label: 'Psicología' },
      { id: 'bienestar', label: 'Bienestar' },
      { id: 'evaluaciones', label: 'Evaluaciones' },
    ]
  }

  if (rol === 'preparador_fisico') {
    return [
      { id: 'inicio', label: 'Inicio' },
      { id: 'plantel', label: 'Plantel' },
      { id: 'medicos', label: 'Médicos' },
      { id: 'nutricion', label: 'Nutrición' },
      { id: 'partidos', label: 'Partidos' },
      { id: 'calendario', label: 'Calendario' },
      { id: 'entrenamientos', label: 'Entrenamientos' },
      { id: 'planificacion', label: 'Planificación semanal' },
      { id: 'fisico', label: 'Físico' },
      { id: 'evaluaciones', label: 'Evaluaciones' },
    ]
  }

  // Cuerpo técnico
  return [
    { id: 'inicio', label: 'Inicio' },
    { id: 'plantel', label: 'Plantel' },
    { id: 'video', label: 'Videoanálisis' },
    { id: 'analisis', label: 'Análisis' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'calendario', label: 'Calendario' },
    { id: 'entrenamientos', label: 'Entrenamientos' },
    { id: 'planificacion', label: 'Planificación semanal' },
    { id: 'asistencia', label: 'Asistencia' },
    { id: 'fisico', label: 'Físico' },
    { id: 'captacion', label: 'Captación' },
    { id: 'representantes', label: 'Representantes' },
    { id: 'pensiones', label: 'Pensión' },
    { id: 'seleccion', label: 'Selección' },
    { id: 'contratos', label: 'Contratos' },
    { id: 'informes', label: 'Informes automáticos' },
    { id: 'evaluaciones', label: 'Evaluaciones' },
  ]
}

const ICONOS = {
  inicio: '⌂', plantel: '♟', medicos: '✚', nutricion: '◉', psicologia: '♡',
  video: '▶', analisis: '▥', partidos: '⚽', calendario: '📅', entrenamientos: '◆', planificacion: '▦',
  asistencia: '✓', fisico: '▤', captacion: '◎', representantes: '♧',
  pensiones: '⌂', seleccion: '★', contratos: '▣', pases: '⇄',
  informes: '▧', usuarios: '♙', evaluaciones: '☑', bienestar: '♥',
}

function Layout({ seccionActiva, onCambiarSeccion, perfil, children }) {
  const secciones = filtrarSeccionesVisibles(seccionesParaRol(perfil?.rol), 'id')
    .filter(s => s.id !== 'planificacion' || puedePlanificar(perfil))

  const subtitulo =
    perfil?.rol === 'tecnico' && perfil?.categorias?.nombre
      ? `${rolLabel[perfil.rol]} · ${perfil.categorias.nombre}`
      : rolLabel[perfil?.rol] || ''

  const [mostrarLinkBienestar, setMostrarLinkBienestar] = useState(false)
  const [categoriasLink, setCategoriasLink] = useState([])
  const [linkCopiado, setLinkCopiado] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [menuCompacto, setMenuCompacto] = useState(() => {
    try {
      const guardado = window.localStorage.getItem('comunicaciones-menu-compacto')
      return guardado === null ? seccionActiva === 'analisis' : guardado === 'true'
    } catch {
      return seccionActiva === 'analisis'
    }
  })

  useEffect(() => {
    if (seccionActiva === 'analisis') setMenuCompacto(true)
  }, [seccionActiva])

  function alternarMenuCompacto() {
    setMenuCompacto((actual) => {
      const siguiente = !actual
      try { window.localStorage.setItem('comunicaciones-menu-compacto', String(siguiente)) } catch { /* almacenamiento no disponible */ }
      return siguiente
    })
  }

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
    onCambiarSeccion(resolverSeccionVisible(id))
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
        style={{
          backgroundColor: COLORES.fondoSidebar,
          borderBottom: `1px solid ${COLORES.borde}`,
        }}
      >
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-xl"
          style={{ color: 'var(--ui-texto-acento, #F2C230)' }}
        >
          ☰
        </button>
        <p
          className="text-xs tracking-widest uppercase font-medium truncate"
          style={{ color: COLORES.texto }}
        >
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
        className={`w-64 ${menuCompacto ? 'md:w-[68px]' : 'md:w-56'} shrink-0 min-h-screen flex flex-col fixed md:static inset-y-0 left-0 z-50 transition-all duration-200 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
        style={{
          backgroundColor: COLORES.fondoSidebar,
          borderRight: `1px solid ${COLORES.borde}`,
        }}
      >
        <div
          className={`pt-6 pb-4 flex items-start justify-between ${menuCompacto ? 'px-3 md:px-2' : 'px-5'}`}
          style={{ borderBottom: `1px solid ${COLORES.borde}` }}
        >
          <div className={menuCompacto ? 'md:hidden' : ''}>
            <p
              className="text-xs tracking-widest uppercase font-medium"
              style={{ color: COLORES.texto }}
            >
              Club Comunicaciones
            </p>
            {subtitulo && (
              <p className="text-xs mt-1" style={{ color: 'var(--ui-texto-acento, #F2C230)' }}>
                {subtitulo}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={alternarMenuCompacto}
            title={menuCompacto ? 'Expandir menú' : 'Plegar menú'}
            aria-label={menuCompacto ? 'Expandir menú lateral' : 'Plegar menú lateral'}
            className="hidden md:flex items-center justify-center rounded-lg w-9 h-9 shrink-0 hover:opacity-80"
            style={{ color: 'var(--ui-texto-acento, #F2C230)', border: `1px solid ${COLORES.borde}` }}
          >
            {menuCompacto ? '»' : '«'}
          </button>
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 mb-0.5 text-sm rounded-lg transition-colors ${menuCompacto ? 'md:justify-center md:px-1' : ''}`}
                title={s.label}
                aria-label={s.label}
                style={{
                  color: activa ? 'var(--ui-nav-activo-texto, #F2C230)' : COLORES.textoSecundario,
                  backgroundColor: activa ? 'var(--ui-nav-activo-fondo, rgba(242,194,48,0.08))' : 'transparent',
                  borderLeft: activa
                    ? `3px solid ${COLORES.acento}`
                    : '3px solid transparent',
                  fontWeight: activa ? 500 : 400,
                }}
              >
                <span aria-hidden="true" className={`text-lg shrink-0 text-center ${menuCompacto ? 'md:w-full' : 'w-6'}`}>{ICONOS[s.id] || '•'}</span>
                <span className={menuCompacto ? 'md:hidden' : ''}>{s.label}</span>
              </button>
            )
          })}
        </nav>

        <div
          className="px-3 py-3"
          style={{ borderTop: `1px solid ${COLORES.borde}` }}
        >
          <div className={`flex items-center gap-2 mb-3 ${menuCompacto ? 'md:flex-col' : ''}`}>
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
                    style={{
                      backgroundColor: COLORES.fondoPagina,
                      border: `1px solid ${COLORES.borde}`,
                      minWidth: '180px',
                    }}
                  >
                    <p
                      className="text-[10px] uppercase px-2 pb-1.5"
                      style={{ color: COLORES.textoMuted }}
                    >
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

          <div className={`flex items-center gap-2 mb-2 ${menuCompacto ? 'md:justify-center' : ''}`}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
            >
              {iniciales(perfil?.nombre || rolLabel[perfil?.rol])}
            </div>

            <div className={`min-w-0 ${menuCompacto ? 'md:hidden' : ''}`}>
              <p className="text-xs truncate" style={{ color: COLORES.texto }}>
                {perfil?.nombre || rolLabel[perfil?.rol] || 'Usuario'}
              </p>
              <p className="text-xs truncate" style={{ color: COLORES.textoMuted }}>
                {rolLabel[perfil?.rol] || ''}
              </p>
            </div>
          </div>

          <SelectorApariencia compacto={menuCompacto} />

          <button
            onClick={() => supabase.auth.signOut()}
            className={`w-full text-xs px-3 py-2 rounded-lg hover:opacity-80 ${menuCompacto ? 'md:text-center md:px-1' : 'text-left'}`}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            style={{
              backgroundColor: COLORES.fondoPagina,
              color: COLORES.textoSecundario,
              border: `1px solid ${COLORES.borde}`,
            }}
          >
            <span className={menuCompacto ? 'md:hidden' : ''}>Cerrar sesión</span>
            {menuCompacto && <span className="hidden md:inline" aria-hidden="true">⇥</span>}
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0 transition-all duration-200">{children}</div>
    </div>
  )
}

export default Layout
