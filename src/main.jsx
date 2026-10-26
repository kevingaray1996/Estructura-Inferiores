import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
const root = createRoot(document.getElementById('root'))

function mostrarErrorInicio(sinConfiguracion) {
  root.render(
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-amber-400 p-6">
        <h1 className="text-xl font-bold">Club Comunicaciones</h1>
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
  root.render(<p role="status" className="p-8">Cargando Comunicaciones…</p>)
  import('./App.jsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>)
  }).catch((error) => {
    console.error('No se pudo cargar la aplicación:', error)
    mostrarErrorInicio(false)
  })
}
