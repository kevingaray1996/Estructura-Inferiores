import { useCallback, useEffect, useState } from 'react'
import { avisosEstado, avisosPreferencias } from './portal'
import { esInstalada, plataforma, soporte, tienePush } from './avisos'
import { activarAvisos, desactivarAvisos, suscripcionActual } from './avisosDispositivo'

const TIPOS = [
  { clave: 'wellness', etiqueta: 'Wellness', ayuda: 'Recordatorio a la mañana si no lo completaste.' },
  { clave: 'rpe', etiqueta: 'RPE', ayuda: 'Recordatorio después del entrenamiento si no lo cargaste.' },
  { clave: 'entrenamiento', etiqueta: 'Entrenamiento del día', ayuda: 'Cuando está publicado el entrenamiento de hoy.' },
  { clave: 'convocatoria', etiqueta: 'Convocatoria', ayuda: 'Cuando te convocan a un partido.' },
  { clave: 'mensajes', etiqueta: 'Mensajes del cuerpo técnico', ayuda: 'Avisos que manda el staff.' },
]

const TODAS = { wellness: true, rpe: true, entrenamiento: true, convocatoria: true, mensajes: true }

// Pestaña Avisos: activar o desactivar los avisos en este celular y elegir cuáles llegan.
// clavePublica: la clave VAPID pública (variable de Vercel). Sin ella, los avisos no están disponibles.
function AvisosJugadora({ clavePublica = import.meta.env.VITE_AVISOS_VAPID_PUBLICA }) {
  const [estado, setEstado] = useState('cargando')
  const [preferencias, setPreferencias] = useState(TODAS)
  // null mientras carga, 'ok' o 'error'. Con error no se muestran los interruptores (no se sabe cómo están).
  const [cargaPreferencias, setCargaPreferencias] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const cargarPreferencias = useCallback(async () => {
    setCargaPreferencias(null)
    const { data, error: fallo } = await avisosEstado()
    if (fallo || !data) { setCargaPreferencias('error'); return }
    setPreferencias({ ...TODAS, ...(data.preferencias || {}) })
    setCargaPreferencias('ok')
  }, [])

  useEffect(() => {
    let activo = true
    async function revisar() {
      if (!clavePublica) { setEstado('no_disponible'); return }
      const donde = plataforma()
      const permiso = globalThis.window?.Notification?.permission || 'default'
      const s = soporte({ plataforma: donde, standalone: esInstalada(), tienePush: tienePush(), permiso })
      if (s !== 'listo') { if (activo) setEstado(s); return }
      const suscripcion = await suscripcionActual().catch(() => null)
      if (!activo) return
      if (suscripcion && permiso === 'granted') {
        setEstado('activo')
        await cargarPreferencias()
      } else {
        setEstado('inactivo')
      }
    }
    void revisar()
    return () => { activo = false }
  }, [clavePublica, cargarPreferencias])

  async function activar() {
    setTrabajando(true); setError(''); setAviso('')
    const resultado = await activarAvisos({ clavePublica })
    setTrabajando(false)
    if (resultado.ok) {
      setEstado('activo'); setAviso('Avisos activados en este celular.')
      await cargarPreferencias()
    } else if (resultado.error === 'bloqueado') {
      setEstado('bloqueado')
    } else if (resultado.error === 'sin_permiso') {
      setError('Para recibir avisos tenés que tocar «Permitir» cuando el celular lo pregunta.')
    } else {
      setError('No se pudieron activar los avisos. Revisá la conexión y probá de nuevo.')
    }
  }

  async function desactivar() {
    setTrabajando(true); setError(''); setAviso('')
    await desactivarAvisos()
    setTrabajando(false)
    setEstado('inactivo'); setAviso('Avisos desactivados en este celular.')
  }

  // Un cambio por vez: mientras se guarda, los interruptores quedan deshabilitados (dos toques rápidos no pueden
  // llegar a la base en otro orden).
  async function cambiar(clave) {
    if (guardando) return
    const anterior = preferencias
    const nuevas = { ...preferencias, [clave]: !preferencias[clave] }
    setPreferencias(nuevas); setError(''); setAviso(''); setGuardando(true)
    const { error: fallo } = await avisosPreferencias(nuevas)
    setGuardando(false)
    if (fallo) {
      setPreferencias(anterior)
      setError('No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.')
    }
  }

  return (
    <div className="jg-pila">
      <section className="jg-tarjeta" aria-labelledby="jg-avisos-titulo">
        <h2 id="jg-avisos-titulo" className="jg-subtitulo">Avisos</h2>
        {estado === 'cargando' && <p className="jg-texto" role="status">Revisando este celular…</p>}
        {estado === 'no_disponible' && <p className="jg-texto">Los avisos todavía no están disponibles.</p>}
        {estado === 'instalar_iphone' && (
          <>
            <p className="jg-texto">En el iPhone los avisos funcionan solo con la app instalada (iOS 16.4 o más):</p>
            <ol className="jg-pasos">
              <li>Abrí esta página en Safari.</li>
              <li>Tocá Compartir y después «Agregar a pantalla de inicio».</li>
              <li>Abrí la app desde el ícono y volvé a esta pestaña.</li>
            </ol>
          </>
        )}
        {estado === 'actualizar_ios' && (
          <p className="jg-texto">Tu iPhone necesita iOS 16.4 o más para recibir avisos. Actualizalo desde Ajustes → General → Actualización de software.</p>
        )}
        {estado === 'sin_soporte' && (
          <p className="jg-texto">Este navegador no recibe avisos. En Android usá Chrome; en iPhone, la app instalada desde Safari.</p>
        )}
        {estado === 'bloqueado' && (
          <>
            <p className="jg-texto">Los avisos están bloqueados para esta app. Para volver a permitirlos:</p>
            <ul className="jg-pasos">
              <li>Android: en Chrome, menú ⋮ → Configuración → Configuración de sitios → Notificaciones.</li>
              <li>iPhone: Ajustes → Notificaciones → Comunicaciones.</li>
            </ul>
            <p className="jg-texto jg-texto-suave">Después volvé a abrir esta pestaña.</p>
          </>
        )}
        {estado === 'inactivo' && (
          <>
            <p className="jg-texto">Te avisamos del Wellness, el RPE, el entrenamiento, la convocatoria y los mensajes del cuerpo técnico.</p>
            <button type="button" className="jg-boton jg-boton-principal" onClick={activar} disabled={trabajando} aria-busy={trabajando}>
              {trabajando ? 'Activando…' : 'Activar avisos'}
            </button>
          </>
        )}
        {estado === 'activo' && (
          <>
            <p className="jg-texto jg-ok">Los avisos están activados en este celular.</p>
            <p className="jg-texto jg-texto-suave">Pueden tardar unos minutos y no llegan si el celular está sin conexión mucho tiempo.</p>
          </>
        )}
        <p className="jg-texto" role="status" aria-live="polite">{aviso}</p>
        {error && <p className="jg-error" role="alert">{error}</p>}
      </section>

      {estado === 'activo' && (
        <section className="jg-tarjeta" aria-labelledby="jg-avisos-tipos">
          <h2 id="jg-avisos-tipos" className="jg-subtitulo">Qué avisos querés recibir</h2>
          {cargaPreferencias === null && <p className="jg-texto" role="status">Cargando tus preferencias…</p>}
          {cargaPreferencias === 'error' && (
            <>
              <p className="jg-error" role="alert">No se pudieron cargar tus preferencias. Probá de nuevo.</p>
              <button type="button" className="jg-boton" onClick={() => { void cargarPreferencias() }}>Reintentar</button>
            </>
          )}
          {cargaPreferencias === 'ok' && <ul className="jg-interruptores" aria-busy={guardando}>
            {TIPOS.map((t) => (
              <li key={t.clave}>
                <label className="jg-interruptor">
                  <input type="checkbox" checked={preferencias[t.clave]} onChange={() => cambiar(t.clave)} disabled={guardando} />
                  <span>
                    <span className="jg-interruptor-etiqueta">{t.etiqueta}</span>
                    <span className="jg-interruptor-ayuda">{t.ayuda}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>}
          <button type="button" className="jg-boton" onClick={desactivar} disabled={trabajando} aria-busy={trabajando}>
            {trabajando ? 'Desactivando…' : 'Desactivar avisos en este celular'}
          </button>
        </section>
      )}
    </div>
  )
}

export default AvisosJugadora
