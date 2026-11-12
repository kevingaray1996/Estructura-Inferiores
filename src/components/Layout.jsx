
import { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import SelectorApariencia from '../appearance/SelectorApariencia'
import { filtrarSeccionesVisibles, resolverSeccionVisible } from '../config/visibilidadSecciones'
import { puedePlanificar } from '../utils/planificacion'
import IconoNavegacion from './IconoNavegacion'
import { ESCUDO_URL } from '../config/club'
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
      { id: 'hoy', label: 'Hoy' },
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
      { id: 'hoy', label: 'Hoy' },
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
    { id: 'hoy', label: 'Hoy' },
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

// Agrupación del menú "Secciones": solo ordena lo que seccionesParaRol ya permite.
// Una sección sin grupo propio (hoy ninguna visible) cae en Gestión para no perder accesos.
const GRUPOS = [
  { id: 'equipo', label: 'Equipo', secciones: ['inicio', 'hoy', 'plantel', 'asistencia', 'evaluaciones'] },
  { id: 'partidos', label: 'Partidos', secciones: ['partidos', 'video', 'analisis'] },
  { id: 'rendimiento', label: 'Rendimiento', secciones: ['fisico', 'medicos', 'bienestar', 'nutricion', 'psicologia'] },
  { id: 'planificacion', label: 'Planificación', secciones: ['calendario', 'entrenamientos', 'planificacion'] },
  { id: 'gestion', label: 'Gestión', secciones: ['captacion', 'pases', 'informes', 'usuarios', 'representantes', 'pensiones', 'seleccion', 'contratos'] },
]

function agruparSecciones(secciones) {
  const conocidas = new Set(GRUPOS.flatMap(g => g.secciones))
  const sueltas = secciones.filter(s => !conocidas.has(s.id))
  let numero = 0
  return GRUPOS.map(g => ({
    ...g,
    items: [
      ...g.secciones.map(id => secciones.find(s => s.id === id)).filter(Boolean),
      ...(g.id === 'gestion' ? sueltas : []),
    ],
  })).filter(g => g.items.length > 0)
    .map(g => ({ ...g, items: g.items.map(s => ({ ...s, numero: ++numero })) }))
}

// El indicador recibido controla navegación; las escrituras se autorizan aparte en RLS/RPC.
function Layout({ seccionActiva, onCambiarSeccion, perfil, children, puedeAdministrarAnalisis = false }) {
  const secciones = filtrarSeccionesVisibles(seccionesParaRol(perfil?.rol), 'id')
    .filter(s => s.id !== 'planificacion' || puedePlanificar(perfil))
    .filter(s => s.id !== 'analisis' || puedeAdministrarAnalisis && perfil?.rol === 'coordinacion')
  const grupos = agruparSecciones(secciones)

  const subtitulo =
    perfil?.rol === 'tecnico' && perfil?.categorias?.nombre
      ? `${rolLabel[perfil.rol]} · ${perfil.categorias.nombre}`
      : rolLabel[perfil?.rol] || ''

  const [mostrarLinkBienestar, setMostrarLinkBienestar] = useState(false)
  const [categoriasLink, setCategoriasLink] = useState([])
  const [linkCopiado, setLinkCopiado] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [usuarioAbierto, setUsuarioAbierto] = useState(false)
  const panel = useRef(null)
  const abrirMenu = useRef(null)
  const cerrarMenu = useRef(null)
  const zonaUsuario = useRef(null)
  const zonaBienestar = useRef(null)
  const menuId = useId()

  // Menú a pantalla completa: foco atrapado, Esc cierra y el foco vuelve al botón "Secciones".
  useEffect(() => {
    if (!menuAbierto) return
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
      const controles = [...panelActual.querySelectorAll('button,a[href],[tabindex="0"]')]
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
      if (botonApertura?.isConnected) botonApertura.focus()
    }
  }, [menuAbierto])

  // Desplegables de la barra (usuario y link de bienestar): se cierran con Esc o al tocar afuera.
  useEffect(() => {
    if (!usuarioAbierto && !mostrarLinkBienestar) return
    function afuera(event) {
      if (!zonaUsuario.current?.contains(event.target)) setUsuarioAbierto(false)
      if (!zonaBienestar.current?.contains(event.target)) setMostrarLinkBienestar(false)
    }
    function teclado(event) {
      if (event.key !== 'Escape') return
      setUsuarioAbierto(false)
      setMostrarLinkBienestar(false)
    }
    document.addEventListener('pointerdown', afuera)
    document.addEventListener('keydown', teclado)
    return () => {
      document.removeEventListener('pointerdown', afuera)
      document.removeEventListener('keydown', teclado)
    }
  }, [usuarioAbierto, mostrarLinkBienestar])

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
    setUsuarioAbierto(false)
  }

  const seccionNombre = secciones.find(s => s.id === seccionActiva)?.label || (seccionActiva === 'buscar' ? 'Buscar' : 'Inicio')
  const nombreUsuario = perfil?.nombre || rolLabel[perfil?.rol] || 'Usuario'

  return (
    <div className="club-layout">
      <header className="club-barra" inert={menuAbierto}>
        <div className="club-barra-interior">
          <button ref={abrirMenu} type="button" onClick={() => setMenuAbierto(true)} aria-label="Abrir secciones"
            aria-expanded={menuAbierto} aria-controls={menuId} className="club-boton-secciones">
            <span className="club-hamburguesa" aria-hidden="true"><b /><b /><b /></span>Secciones
          </button>
          <p className="club-ubicacion"><span className="club-ubicacion-club">Comunicaciones · </span><b>{seccionNombre}</b></p>
          <div className="club-barra-acciones">
            <button type="button" onClick={() => seleccionarSeccion('buscar')} aria-label="Buscar" title="Buscar"
              aria-current={seccionActiva === 'buscar' ? 'page' : undefined} className="club-icon-button">
              <IconoNavegacion nombre="buscar" />
            </button>
            {(perfil?.rol === 'tecnico' || perfil?.rol === 'coordinacion') && <div ref={zonaBienestar} className="club-barra-zona">
              <button type="button" onClick={toggleLinkBienestar} aria-label="Link de bienestar" title="Copiar link de bienestar"
                aria-expanded={perfil?.rol === 'coordinacion' ? mostrarLinkBienestar : undefined}
                aria-controls={perfil?.rol === 'coordinacion' ? menuId + '-bienestar' : undefined}
                className="club-icon-button"><IconoNavegacion nombre="enlace" /></button>
              {mostrarLinkBienestar && perfil?.rol === 'coordinacion' && <div id={menuId + '-bienestar'} className="club-desplegable">
                <p className="club-desplegable-titulo">Copiar link por categoría</p>
                {categoriasLink.map(c => <button key={c.id} type="button" onClick={() => copiarLink(c.id, c.nombre)}
                  className="club-desplegable-opcion">{c.nombre}</button>)}
              </div>}
            </div>}
            <div ref={zonaUsuario} className="club-barra-zona">
              <button type="button" onClick={() => setUsuarioAbierto(v => !v)} aria-label="Usuario y apariencia" title={nombreUsuario}
                aria-expanded={usuarioAbierto} aria-controls={menuId + '-usuario'} className="club-usuario">
                <span className="club-avatar" aria-hidden="true">{iniciales(perfil?.nombre || rolLabel[perfil?.rol])}</span>
                <span className="club-usuario-nombre">{nombreUsuario}</span>
              </button>
              {usuarioAbierto && <div id={menuId + '-usuario'} className="club-desplegable club-desplegable-usuario">
                <div className="club-perfil-nombre"><p>{nombreUsuario}</p>{subtitulo && <p>{subtitulo}</p>}</div>
                <SelectorApariencia />
                <button type="button" onClick={() => supabase.auth.signOut()} aria-label="Cerrar sesión" className="club-salir">
                  <IconoNavegacion nombre="salir" /><span>Cerrar sesión</span>
                </button>
              </div>}
            </div>
          </div>
        </div>
        {linkCopiado && <p role="status" className="club-aviso-copiado">Link de {linkCopiado} copiado</p>}
      </header>

      <div ref={panel} id={menuId} tabIndex={-1} role="dialog" aria-modal={menuAbierto || undefined} aria-label="Secciones"
        aria-hidden={menuAbierto ? undefined : true} inert={!menuAbierto} className={'club-menu' + (menuAbierto ? ' abierto' : '')}>
        <button ref={cerrarMenu} type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú" className="club-menu-cerrar">
          Cerrar <IconoNavegacion nombre="cerrar" size={18} />
        </button>
        <nav aria-label="Secciones" className="club-menu-grupos">
          {grupos.map(g => <section key={g.id} className="club-menu-grupo" aria-labelledby={menuId + '-' + g.id}>
            <h2 id={menuId + '-' + g.id} className="club-menu-grupo-titulo">{g.label}</h2>
            <ul className="club-menu-lista">
              {g.items.map(s => <li key={s.id} className="club-menu-item" style={{ transitionDelay: menuAbierto ? `${120 + s.numero * 40}ms` : '0ms' }}>
                <button type="button" onClick={() => seleccionarSeccion(s.id)} aria-label={s.label}
                  aria-current={seccionActiva === s.id ? 'page' : undefined}>
                  <span className="club-menu-numero" aria-hidden="true">{String(s.numero).padStart(2, '0')}</span>
                  <IconoNavegacion nombre={s.id} />
                  <span className="club-menu-texto">{s.label}</span>
                </button>
              </li>)}
            </ul>
          </section>)}
        </nav>
      </div>

      <img src={ESCUDO_URL} alt="" aria-hidden="true" className="club-escudo-fondo" />
      <div className="club-contenido" inert={menuAbierto}><div key={seccionActiva} className="club-seccion">{children}</div></div>
    </div>
  )
}

export default Layout
