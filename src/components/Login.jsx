import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Ajustá el path si el archivo del escudo tiene otro nombre en el bucket
const { data: escudoData } = supabase.storage
  .from('Biblioteca')
  .getPublicUrl('escudos/Escudo simplificado.png')
const ESCUDO_URL = escudoData.publicUrl

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [cargando, setCargando] = useState(false)

  const inputStyle = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #D9D2BF',
    color: '#1A1A1A',
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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="w-full max-w-sm flex flex-col items-center">
        <img
          src={ESCUDO_URL}
          alt="Escudo Club Comunicaciones"
          className="w-24 h-24 object-contain mb-4"
        />
        <h1
          className="text-xl mb-1 text-center"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#FFFFFF' }}
        >
          Club Comunicaciones
        </h1>
        <p
          className="text-xs tracking-widest uppercase mb-8 text-center"
          style={{ color: '#F2C230' }}
        >
          Primera División
        </p>

        <div
          className="w-full p-6 rounded-2xl"
          style={{ backgroundColor: '#F2EEE2' }}
        >
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#5F5E5A' }}>
                Email
              </label>
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
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#5F5E5A' }}>
                Contraseña
              </label>
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
            </div>
            {errorMsg && (
              <p className="text-sm" style={{ color: '#A32D2D' }}>
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={cargando}
              className="w-full p-3 rounded-xl font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#F2C230', color: '#1A1A1A' }}
            >
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-xs mt-4 text-center" style={{ color: '#5F5E5A' }}>
          ¿No tenés usuario y contraseña? Pediselo al cuerpo técnico.
        </p>
      </div>
    </div>
  )
}

export default Login