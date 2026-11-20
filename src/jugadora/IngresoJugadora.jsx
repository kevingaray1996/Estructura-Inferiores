import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { emailValido, normalizarEmail } from '../utils/cuentasJugadoras'

const MENSAJE_ENVIADO = 'Si tu mail está registrado, te llegó un link y un código de 6 dígitos.'

// Un error de red no tiene status HTTP; cualquier otra respuesta (mail sin cuenta incluido) se trata igual,
// para no revelar qué mails tienen cuenta.
function esErrorDeRed(error) {
  return Boolean(error) && !error.status && /fetch|network|conexi/i.test(error.message || '')
}

// Entrada sin contraseña: la jugadora pide un mail con link y código, y escribe el código acá.
// En el iPhone, el link del mail abre Safari y no la app instalada: por eso el código es el camino principal.
function IngresoJugadora() {
  const [paso, setPaso] = useState('mail')
  const [email, setEmail] = useState('')
  const [emailTocado, setEmailTocado] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const errorEmail = emailTocado && !emailValido(email) ? 'Escribí tu mail completo, por ejemplo nombre@gmail.com.' : ''

  async function pedirCodigo() {
    setEnviando(true)
    setError('')
    const { error: errorEnvio } = await supabase.auth.signInWithOtp({
      email: normalizarEmail(email),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/jugadora/` },
    })
    setEnviando(false)
    if (esErrorDeRed(errorEnvio)) {
      setError('No se pudo enviar. Revisá la conexión y probá de nuevo.')
      return false
    }
    if (errorEnvio?.status === 429) {
      setError('Pediste varios códigos seguidos. Esperá un minuto y probá de nuevo.')
      return false
    }
    return true
  }

  async function enviarMail(evento) {
    evento.preventDefault()
    setEmailTocado(true)
    if (!emailValido(email)) return
    if (await pedirCodigo()) {
      setPaso('codigo')
      setCodigo('')
      setAviso(MENSAJE_ENVIADO)
    }
  }

  async function pedirOtro() {
    setCodigo('')
    if (await pedirCodigo()) setAviso('Te mandamos un código nuevo. ' + MENSAJE_ENVIADO)
  }

  async function entrar(evento) {
    evento.preventDefault()
    const token = codigo.replace(/\D/g, '')
    if (token.length !== 6) {
      setError('El código tiene 6 números. Revisalo en el mail.')
      return
    }
    setEnviando(true)
    setError('')
    const { error: errorCodigo } = await supabase.auth.verifyOtp({ email: normalizarEmail(email), token, type: 'email' })
    setEnviando(false)
    if (errorCodigo) {
      setError(esErrorDeRed(errorCodigo)
        ? 'No se pudo verificar. Revisá la conexión y probá de nuevo.'
        : 'El código no es válido o venció. Pedí uno nuevo.')
    }
    // Si salió bien, AppJugadora recibe la sesión y cambia de pantalla.
  }

  function usarOtroMail() {
    setPaso('mail')
    setCodigo('')
    setError('')
    setAviso('')
  }

  return (
    <main className="jg-ingreso">
      <header className="jg-marca">
        <img src="/Escudo simplificado.png" alt="" className="jg-escudo" width="112" height="112" />
        <h1 className="jg-titulo">Jugadoras</h1>
        <p className="jg-club">Club Comunicaciones</p>
      </header>

      {paso === 'mail' && (
        <form className="jg-tarjeta jg-form" onSubmit={enviarMail} noValidate>
          <h2 className="jg-subtitulo">Entrá a tu cuenta</h2>
          <p className="jg-texto">Te mandamos un mail con un link y un código. No necesitás contraseña.</p>
          <label htmlFor="jg-email" className="jg-etiqueta">Tu email</label>
          <input id="jg-email" type="email" inputMode="email" autoComplete="email" className="jg-input"
            value={email} onChange={e => { setEmail(e.target.value); setEmailTocado(false); setError('') }}
            onBlur={() => setEmailTocado(true)}
            aria-invalid={errorEmail ? 'true' : undefined} aria-describedby={errorEmail ? 'jg-email-error' : undefined} />
          {errorEmail && <p id="jg-email-error" className="jg-error">{errorEmail}</p>}
          {error && <p className="jg-error" role="alert">{error}</p>}
          <button type="submit" className="jg-boton jg-boton-principal" disabled={enviando} aria-busy={enviando}>
            {enviando ? 'Enviando…' : 'Enviar link y código'}
          </button>
        </form>
      )}

      {paso === 'codigo' && (
        <form className="jg-tarjeta jg-form" onSubmit={entrar} noValidate>
          <h2 className="jg-subtitulo">Revisá tu mail</h2>
          <p className="jg-texto" role="status">{aviso}</p>
          <p className="jg-texto jg-texto-suave">Puede tardar un minuto. Si no aparece, mirá en Spam.</p>
          <p className="jg-texto jg-texto-suave">Si el código no anda y ya pediste uno nuevo, puede que tu cuenta no esté activa: hablá con coordinación.</p>
          <label htmlFor="jg-codigo" className="jg-etiqueta">Código de 6 dígitos</label>
          <input id="jg-codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
            className="jg-input jg-input-codigo" value={codigo}
            onChange={e => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} />
          {error && <p className="jg-error" role="alert">{error}</p>}
          <button type="submit" className="jg-boton jg-boton-principal" disabled={enviando} aria-busy={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <div className="jg-fila-botones">
            <button type="button" className="jg-boton" onClick={pedirOtro} disabled={enviando}>Pedir otro código</button>
            <button type="button" className="jg-boton" onClick={usarOtroMail} disabled={enviando}>Usar otro mail</button>
          </div>
        </form>
      )}

      <details className="jg-tarjeta jg-instalar">
        <summary>Instalar en el celular</summary>
        <div className="jg-instalar-cuerpo">
          <h3>iPhone</h3>
          <ol>
            <li>Abrí esta página en Safari (no desde otra app).</li>
            <li>Tocá Compartir y después «Agregar a pantalla de inicio».</li>
            <li>Abrí la app desde el ícono y entrá con el código del mail, no con el link.</li>
          </ol>
          <h3>Android</h3>
          <ol>
            <li>Abrí esta página en Chrome.</li>
            <li>Tocá el menú ⋮ y después «Instalar app» o «Agregar a pantalla de inicio».</li>
            <li>Entrá con el link o con el código del mail.</li>
          </ol>
        </div>
      </details>
    </main>
  )
}

export default IngresoJugadora
