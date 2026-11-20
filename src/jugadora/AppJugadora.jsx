import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerPerfil, rolStaff } from './portal'
import IngresoJugadora from './IngresoJugadora'
import InicioJugadora from './InicioJugadora'
import WellnessJugadora from './WellnessJugadora'
import MisNumeros from './MisNumeros'
import AvisosJugadora from './AvisosJugadora'
import { desactivarAvisos, sincronizarAvisos } from './avisosDispositivo'
import Icono from './iconos'

const SECCIONES = [
  { id: 'inicio', etiqueta: 'Inicio' },
  { id: 'wellness', etiqueta: 'Wellness' },
  { id: 'numeros', etiqueta: 'Mis números' },
  { id: 'avisos', etiqueta: 'Avisos' },
]

// Pestaña pedida por un aviso (/jugadora/?seccion=...). Se lee una sola vez y se limpia la dirección.
function leerPedido() {
  if (typeof window === 'undefined') return null
  const pedida = new URLSearchParams(window.location.search).get('seccion')
  if (!pedida) return null
  window.history.replaceState(null, '', window.location.pathname)
  if (pedida === 'rpe') return { seccion: 'wellness', vista: 'rpe' }
  if (['inicio', 'wellness', 'numeros', 'avisos'].includes(pedida)) return { seccion: pedida, vista: 'bienestar' }
  return null
}

function Iniciales({ perfil }) {
  return `${perfil.nombre?.[0] || ''}${perfil.apellido?.[0] || ''}`.toUpperCase()
}

// App de la jugadora: ingreso con código, y después su cuenta (Inicio, Wellness y Mis números).
// Más adelante se suman pestañas (videos, devoluciones) sin cambiar esta estructura.
function AppJugadora() {
  const [sesion, setSesion] = useState(undefined)
  const [cuenta, setCuenta] = useState({ estado: 'cargando' })
  const [seccion, setSeccion] = useState('inicio')
  const [vistaWellness, setVistaWellness] = useState('bienestar')
  const pedido = useRef(undefined)
  if (pedido.current === undefined) pedido.current = leerPedido()
  const usuarioId = sesion?.user?.id ?? null

  useEffect(() => {
    let activo = true
    let recibioEvento = false
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      recibioEvento = true
      if (!activo) return
      setSesion(nueva ?? null)
      // Al salir se olvida la cuenta anterior: un ingreso posterior nunca muestra, ni por un instante, su estado.
      if (!nueva) setCuenta({ estado: 'cargando' })
    })
    supabase.auth.getSession().then(({ data: resultado }) => {
      if (activo && !recibioEvento) setSesion(resultado?.session ?? null)
    })
    return () => { activo = false; data?.subscription?.unsubscribe() }
  }, [])

  const cargarCuenta = useCallback(async () => {
    setCuenta({ estado: 'cargando' })
    const { data, error } = await obtenerPerfil()
    if (!error && data) { setCuenta({ estado: 'ok', perfil: data }); return }
    if (error?.code === 'cuenta_inactiva') {
      const rol = await rolStaff()
      setCuenta({ estado: 'inactiva', esStaff: Boolean(rol) })
      return
    }
    setCuenta({ estado: 'error' })
  }, [])

  useEffect(() => {
    // Cada vez que cambia el usuario se vuelve a pedir su cuenta; el estado se actualiza cuando responde la base.
    if (usuarioId) {
      setSeccion(pedido.current?.seccion || 'inicio')
      setVistaWellness(pedido.current?.vista || 'bienestar')
      pedido.current = null
      cargarCuenta()
    }
  }, [usuarioId, cargarCuenta])

  // Con la cuenta abierta, si este celular ya tiene los avisos activados, se vuelve a asociar a esta cuenta.
  useEffect(() => {
    if (cuenta.estado === 'ok') void sincronizarAvisos()
  }, [cuenta.estado])

  // scope 'local': cierra solo este dispositivo; las otras sesiones de la jugadora siguen abiertas.
  // Antes de salir, este celular deja de recibir los avisos de esta cuenta (celular compartido).
  async function cerrarSesion() {
    await desactivarAvisos()
    await supabase.auth.signOut({ scope: 'local' })
  }

  if (sesion === undefined || (sesion && cuenta.estado === 'cargando')) {
    return <main className="jg-centro" aria-busy="true"><p className="jg-texto" role="status">Cargando…</p></main>
  }

  if (!sesion) return <IngresoJugadora />

  if (cuenta.estado === 'inactiva') {
    return (
      <main className="jg-centro">
        <div className="jg-tarjeta jg-form">
          {cuenta.esStaff ? (
            <>
              <h1 className="jg-subtitulo">Esta es la app de jugadoras</h1>
              <p className="jg-texto">Entraste con una cuenta del staff. Para trabajar, usá el sistema del club.</p>
              <a className="jg-boton jg-boton-principal" href="/">Abrir el sistema del club</a>
            </>
          ) : (
            <>
              <h1 className="jg-subtitulo">No podés entrar</h1>
              <p className="jg-texto">Esta cuenta no está activa. Hablá con coordinación.</p>
            </>
          )}
          <button type="button" className="jg-boton" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </main>
    )
  }

  if (cuenta.estado === 'error') {
    return (
      <main className="jg-centro">
        <div className="jg-tarjeta jg-form" role="alert">
          <h1 className="jg-subtitulo">No se pudo cargar tu cuenta</h1>
          <p className="jg-texto">Revisá la conexión y probá de nuevo.</p>
          <button type="button" className="jg-boton jg-boton-principal" onClick={cargarCuenta}>Reintentar</button>
          <button type="button" className="jg-boton" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </main>
    )
  }

  const { perfil } = cuenta
  return (
    <div className="jg-app">
      <header className="jg-cabecera">
        <div className="jg-cabecera-interior">
          <img src="/Escudo simplificado.png" alt="" className="jg-cabecera-escudo" width="32" height="32" />
          {perfil.foto_url
            ? <img src={perfil.foto_url} alt="" className="jg-avatar" width="44" height="44" />
            : <span className="jg-avatar jg-avatar-iniciales" aria-hidden="true"><Iniciales perfil={perfil} /></span>}
          <div className="jg-cabecera-textos">
            <p className="jg-nombre">{perfil.nombre} {perfil.apellido}</p>
            <p className="jg-categoria">{perfil.categoria}</p>
          </div>
          <button type="button" className="jg-boton jg-boton-salir" onClick={cerrarSesion}>Salir</button>
        </div>
      </header>

      <main className="jg-contenido">
        {seccion === 'inicio' && <InicioJugadora perfil={perfil} onIrAWellness={() => setSeccion('wellness')} />}
        {seccion === 'wellness' && <WellnessJugadora vistaInicial={vistaWellness} />}
        {seccion === 'numeros' && <MisNumeros />}
        {seccion === 'avisos' && <AvisosJugadora />}
      </main>

      <nav className="jg-navegacion" aria-label="Secciones de la jugadora">
        <div className="jg-navegacion-interior">
          {SECCIONES.map(s => (
            <button key={s.id} type="button" className="jg-pestana" aria-current={seccion === s.id ? 'page' : undefined}
              onClick={() => { setSeccion(s.id); setVistaWellness('bienestar') }}>
              <Icono nombre={s.id} className="jg-pestana-icono" />
              <span>{s.etiqueta}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default AppJugadora
