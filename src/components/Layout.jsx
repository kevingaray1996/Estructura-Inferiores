
import { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'
import SelectorApariencia from '../appearance/SelectorApariencia'
import { filtrarSeccionesVisibles, resolverSeccionVisible } from '../config/visibilidadSecciones'
import { puedePlanificar } from '../utils/planificacion'
import IconoNavegacion from './IconoNavegacion'
import './layout.css'

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
  const [esMovil, setEsMovil] = useState(() => typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 768px)').matches)
  const [ayuda, setAyuda] = useState(null)
  const panel = useRef(null)
  const abrirMenu = useRef(null)
  const cerrarMenu = useRef(null)
  const menuId = useId()
  const ayudaId = useId()
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

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(min-width: 768px)')
    const actualizar = () => {
      setEsMovil(!media.matches)
      setAyuda(null)
      if (media.matches) setMenuAbierto(false)
    }
    media.addEventListener?.('change', actualizar)
    return () => media.removeEventListener?.('change', actualizar)
  }, [])

  useEffect(() => {
    if (!esMovil || !menuAbierto) return
    const anterior = document.activeElement
    const panelActual = panel.current
    const botonApertura = abrirMenu.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarMenu.current?.focus()
    function teclado(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuAbierto(false)
        return
      }
      if (event.key !== 'Tab') return
      const controles = [...panelActual.querySelectorAll('button,select,summary,a[href],[tabindex="0"]')]
        .filter(el => !el.disabled && !el.closest('[inert]') && el.getClientRects().length > 0)
      const primero = controles[0], ultimo = controles.at(-1)
      if (!primero) { event.preventDefault(); panelActual.focus(); return }
      if (event.shiftKey && (document.activeElement === primero || !panelActual.contains(document.activeElement))) {
        event.preventDefault(); ultimo.focus()
      } else if (!event.shiftKey && (document.activeElement === ultimo || !panelActual.contains(document.activeElement))) {
        event.preventDefault(); primero.focus()
      }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      document.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflow
      if (botonApertura?.isConnected && botonApertura.getClientRects().length) botonApertura.focus()
      else if (anterior?.isConnected && anterior.getClientRects().length && !panelActual.contains(anterior)) anterior.focus()
      else if (panelActual.isConnected) (panelActual.querySelector('[aria-current="page"]') || panelActual.querySelector('nav button'))?.focus()
    }
  }, [esMovil, menuAbierto])

  function mostrarAyuda(event, id, texto) {
    if (!menuCompacto || esMovil) return
    const rect = event.currentTarget.getBoundingClientRect()
    setAyuda({ id, texto, left: rect.right + 10, top: Math.max(8, Math.min(rect.top, window.innerHeight - 44)) })
  }

  function propsAyuda(id, texto) {
    return {
      onMouseEnter: event => mostrarAyuda(event, id, texto), onMouseLeave: () => setAyuda(null),
      onFocus: event => mostrarAyuda(event, id, texto), onBlur: () => setAyuda(null),
      'aria-describedby': ayuda?.id === id && menuCompacto && !esMovil ? ayudaId : undefined,
    }
  }

  function alternarMenuCompacto() {
    setAyuda(null)
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
    setAyuda(null)
  }

  const seccionNombre = secciones.find(s => s.id === seccionActiva)?.label || (seccionActiva === 'buscar' ? 'Buscar' : 'Club Comunicaciones')
  const bloqueado = esMovil && menuAbierto

  return (
    <div className="club-layout">
      <header className="club-mobile-header md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-3 h-14" inert={bloqueado}>
        <button ref={abrirMenu} type="button" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"
          aria-expanded={menuAbierto} aria-controls={menuId} className="club-icon-button">
          <IconoNavegacion nombre="menu" />
        </button>
        <div className="min-w-0"><p className="text-[10px] uppercase tracking-widest truncate">Club Comunicaciones</p>
          <p className="club-section-name truncate">{seccionNombre}</p></div>
      </header>
      {menuAbierto && <div className="club-overlay md:hidden fixed inset-0 z-40" aria-hidden="true" onClick={() => setMenuAbierto(false)} />}
      <aside ref={panel} id={menuId} tabIndex={-1} aria-label="Menú principal"
        role={esMovil && menuAbierto ? 'dialog' : undefined} aria-modal={bloqueado || undefined}
        aria-hidden={esMovil && !menuAbierto ? true : undefined} inert={esMovil && !menuAbierto}
        onKeyDown={e => { if (e.key === 'Escape') setAyuda(null) }}
        className={'club-sidebar w-64 ' + (menuCompacto ? 'compacto md:w-[68px]' : 'md:w-56') + ' shrink-0 flex flex-col fixed md:static inset-y-0 left-0 z-50 ' + (menuAbierto ? 'translate-x-0' : '-translate-x-full') + ' md:translate-x-0'}>
        <div className="club-sidebar-header">
          <div className="club-identidad"><strong>Club Comunicaciones</strong>{subtitulo && <small>{subtitulo}</small>}</div>
          <button type="button" onClick={alternarMenuCompacto} data-solo-escritorio
            title={menuCompacto ? 'Expandir menú' : 'Plegar menú'} aria-label={menuCompacto ? 'Expandir menú lateral' : 'Plegar menú lateral'}
            aria-expanded={!menuCompacto} aria-controls={menuId + '-secciones'} className="club-icon-button hidden md:flex">
            <IconoNavegacion nombre={menuCompacto ? 'expandir' : 'plegar'} />
          </button>
          <button ref={cerrarMenu} type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú" className="club-icon-button club-mobile-close md:hidden">
            <IconoNavegacion nombre="cerrar" />
          </button>
        </div>
        <nav id={menuId + '-secciones'} aria-label="Secciones" onScroll={() => setAyuda(null)} className="club-nav flex-1 overflow-y-auto py-3 px-2">
          {secciones.map(s => <button key={s.id} type="button" onClick={() => seleccionarSeccion(s.id)}
            className="club-nav-item" title={s.label} aria-label={s.label}
            aria-current={seccionActiva === s.id ? 'page' : undefined} {...propsAyuda(s.id, s.label)}>
            <IconoNavegacion nombre={s.id} />
            <span className="club-nav-label" aria-hidden={menuCompacto && !esMovil}>{s.label}</span>
          </button>)}
        </nav>
        <footer className="club-sidebar-footer">
          <div className="club-footer-actions">
            <button type="button" onClick={() => seleccionarSeccion('buscar')} aria-label="Buscar" title="Buscar"
              aria-current={seccionActiva === 'buscar' ? 'page' : undefined} className="club-icon-button" {...propsAyuda('buscar', 'Buscar')}>
              <IconoNavegacion nombre="buscar" />
            </button>
            {(perfil?.rol === 'tecnico' || perfil?.rol === 'coordinacion') && <div className="relative">
              <button type="button" onClick={toggleLinkBienestar} aria-label="Link de bienestar" title="Copiar link de bienestar"
                aria-expanded={perfil?.rol === 'coordinacion' ? mostrarLinkBienestar : undefined}
                aria-controls={perfil?.rol === 'coordinacion' ? menuId + '-bienestar' : undefined}
                className="club-icon-button" {...propsAyuda('enlace', 'Link de bienestar')}><IconoNavegacion nombre="enlace" /></button>
              {mostrarLinkBienestar && perfil?.rol === 'coordinacion' && <div id={menuId + '-bienestar'} className="club-link-popover">
                <p className="text-[10px] uppercase px-2 pb-2" style={{ color: COLORES.textoMuted }}>Copiar link por categoría</p>
                {categoriasLink.map(c => <button key={c.id} type="button" onClick={() => copiarLink(c.id, c.nombre)}
                  className="block w-full text-left text-sm px-2 py-3 rounded-lg hover:opacity-80">{c.nombre}</button>)}
              </div>}
            </div>}
          </div>
          {linkCopiado && <p role="status" className="text-xs mb-2" style={{ color: COLORES.exito }}>Link de {linkCopiado} copiado</p>}
          <div className="club-perfil">
            <div className="club-avatar">{iniciales(perfil?.nombre || rolLabel[perfil?.rol])}</div>
            <div className="club-perfil-nombre"><p>{perfil?.nombre || rolLabel[perfil?.rol] || 'Usuario'}</p><p>{rolLabel[perfil?.rol] || ''}</p></div>
          </div>
          <SelectorApariencia compacto={menuCompacto} />
          <button type="button" onClick={() => supabase.auth.signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className="club-salir" {...propsAyuda('salir', 'Cerrar sesión')}>
            <IconoNavegacion nombre="salir" /><span className="club-nav-label" aria-hidden={menuCompacto && !esMovil}>Cerrar sesión</span>
          </button>
        </footer>
      </aside>
      {ayuda && menuCompacto && !esMovil && <div id={ayudaId} role="tooltip" className="club-tooltip" style={{ left: ayuda.left, top: ayuda.top }}>{ayuda.texto}</div>}
      <div className="club-contenido" inert={bloqueado}>{children}</div>
    </div>
  )
}

export default Layout
