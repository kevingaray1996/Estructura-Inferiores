import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ProveedorApariencia from './appearance/ProveedorApariencia'
import PantallaCarga from './components/ui/PantallaCarga'
import { importarConRecarga, recargarUnaVez } from './utils/cargaDiferida'
const root = createRoot(document.getElementById('root'))

// Vite avisa con este evento cuando no puede bajar un archivo que una sección necesita (por ejemplo, después de un
// deploy). Se recarga una sola vez para tomar la versión nueva; si ya se recargó hace poco, el error sigue su curso
// y la sección muestra el aviso con «Recargar».
window.addEventListener('vite:preloadError', (evento) => {
  if (recargarUnaVez()) evento.preventDefault()
})

function mostrarErrorInicio(sinConfiguracion) {
  root.render(
    <main className="min-h-screen p-8" style={{ backgroundColor: 'var(--ui-fondo-pagina)', color: 'var(--ui-texto)' }}>
      <div role="alert" className="mx-auto max-w-xl border p-6" style={{ borderColor: 'var(--ui-alerta)' }}>
        <h1 className="club-display text-4xl">Club Comunicaciones</h1>
        <p className="mt-4">{sinConfiguracion
          ? 'Falta la configuración local de Supabase.'
          : 'No se pudo iniciar la aplicación. Revisá la consola del navegador.'}</p>
        {sinConfiguracion && <>
          <p className="mt-3">Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.local del proyecto y reiniciá el servidor de desarrollo.</p>
          <p className="mt-3">Usá la URL y la clave pública del proyecto correcto. No uses una clave service_role ni una clave secreta.</p>
        </>}
      </div>
    </main>,
  )
}

// App importa el cliente Supabase y otros modulos que lo usan al inicializarse.
// Validar antes de importar evita que createClient impida renderizar el aviso.
if (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) {
  mostrarErrorInicio(true)
} else {
  root.render(<PantallaCarga />)
  Promise.all([importarConRecarga(() => import('./App.jsx')), importarConRecarga(() => import('./supabaseClient'))]).then(([{ default: App }, { supabase }]) => {
    root.render(<StrictMode><ProveedorApariencia auth={supabase.auth}><App /></ProveedorApariencia></StrictMode>)
  }).catch((error) => {
    console.error('No se pudo cargar la aplicación:', error)
    mostrarErrorInicio(false)
  })
}
