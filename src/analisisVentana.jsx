import { createRoot } from 'react-dom/client'
import VentanaAuxiliarAnalisis from './components/VentanaAuxiliarAnalisis'
import './index.css'
import './components/ventanasAnalisis.css'

// Sólo monta el marco de conexión. No inicia App, Supabase ni otra sesión de análisis.
createRoot(document.getElementById('root')).render(<VentanaAuxiliarAnalisis />)
