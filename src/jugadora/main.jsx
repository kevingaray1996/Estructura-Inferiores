import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './jugadora.css'
import ProveedorApariencia from '../appearance/ProveedorApariencia'

// Entrada de la app de jugadoras (/jugadora/). Carga solo lo de la jugadora, no el sistema del staff.
const root = createRoot(document.getElementById('root'))

function mostrarError(texto) {
  root.render(<main className="jg-centro"><div className="jg-tarjeta" role="alert"><p className="jg-texto">{texto}</p></div></main>)
}

if (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) {
  mostrarError('Falta la configuración de la app. Avisale a coordinación.')
} else {
  Promise.all([import('./AppJugadora.jsx'), import('../supabaseClient')]).then(([{ default: AppJugadora }, { supabase }]) => {
    root.render(<StrictMode><ProveedorApariencia auth={supabase.auth}><AppJugadora /></ProveedorApariencia></StrictMode>)
  }).catch((error) => {
    console.error('No se pudo cargar la app de jugadoras:', error)
    mostrarError('No se pudo abrir la app. Revisá la conexión y volvé a abrirla.')
  })
}

// Service worker mínimo con scope /jugadora/: deja la app instalable y fija el scope que van a usar los avisos.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/jugadora/sw.js', { scope: '/jugadora/' }).catch(() => {})
}
