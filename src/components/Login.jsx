import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [cargando, setCargando] = useState(false)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  async function handleLogin(e) {
    e.preventDefault()
    setErrorMsg('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setCargando(false)
    if (error) {
      setErrorMsg('Email o contraseña incorrectos.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0F1419' }}>
      <div className="w-full max-w-sm">
        <p
          className="text-xs tracking-widest uppercase mb-1 text-center"
          style={{ color: '#5B6B85' }}
        >
          Club Comunicaciones
        </p>
        <h1
          className="text-2xl mb-8 text-center"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Iniciar sesión
        </h1>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full p-2.5 rounded-xl outline-none text-sm"
            style={inputStyle}
          />

          {errorMsg && (
            <p className="text-sm" style={{ color: '#F87171' }}>
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: '#4ADE80', color: '#0F1419' }}
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
