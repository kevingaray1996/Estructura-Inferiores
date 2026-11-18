import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import EncabezadoSeccion from '../ui/EncabezadoSeccion'
import PestanasAccesibles from '../ui/PestanasAccesibles'
import MandarAviso from './MandarAviso'
import HorariosAvisos from './HorariosAvisos'
import PausasAvisos from './PausasAvisos'
import JugadorasAvisos from './JugadorasAvisos'
import HistorialAvisos from './HistorialAvisos'
import { mensajeErrorAvisos } from '../../utils/avisos'
import './avisos.css'

// Sección Avisos. Coordinación: mandar, horarios, pausas, jugadoras e historial. Técnico y PF con categoría: mandar a
// su categoría e historial de su categoría. La base vuelve a controlar cada permiso.
function AvisosSection({ perfil }) {
  const esCoordinacion = perfil?.rol === 'coordinacion'
  const categoriaFija = esCoordinacion ? null : perfil?.categoria_id || null
  const puedeUsar = esCoordinacion || (['tecnico', 'preparador_fisico'].includes(perfil?.rol) && Boolean(categoriaFija))
  const [pestana, setPestana] = useState('mandar')
  const [categorias, setCategorias] = useState([])
  const [panel, setPanel] = useState(null)
  const [errorPanel, setErrorPanel] = useState('')

  useEffect(() => {
    if (!puedeUsar) return undefined
    let vigente = true
    supabase.from('categorias').select('id, nombre').order('orden').then(({ data }) => {
      if (!vigente) return
      const todas = data || []
      setCategorias(categoriaFija ? todas.filter((c) => c.id === categoriaFija) : todas)
    })
    return () => { vigente = false }
  }, [puedeUsar, categoriaFija])

  const cargarPanel = useCallback(async () => {
    const { data, error } = await supabase.rpc('avisos_panel')
    if (error) { setErrorPanel(mensajeErrorAvisos(error)); return }
    setErrorPanel(''); setPanel(data)
  }, [])

  useEffect(() => {
    // Solo coordinación pide el panel; el estado se actualiza cuando responde la base.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esCoordinacion) void cargarPanel()
  }, [esCoordinacion, cargarPanel])

  if (!puedeUsar) {
    return (
      <div className="dp-gestion" data-modulo="avisos">
        <div className="dp-gestion-contenido">
          <EncabezadoSeccion eyebrow="Equipo" eyebrowResaltado="Jugadoras" titulo="Avi" resaltado="sos" />
          <p className="av-texto">Para mandar avisos necesitás una categoría asignada. Hablá con coordinación.</p>
        </div>
      </div>
    )
  }

  const pestanas = [
    { id: 'mandar', etiqueta: 'Mandar aviso', contenido: <MandarAviso categorias={categorias} categoriaFija={categoriaFija} /> },
    ...(esCoordinacion ? [
      { id: 'horarios', etiqueta: 'Horarios', contenido: errorPanel ? <p className="av-error" role="alert">{errorPanel}</p> : <HorariosAvisos key={panel ? 'cargado' : 'vacio'} panel={panel} onCambio={cargarPanel} /> },
      { id: 'pausas', etiqueta: 'Pausas', contenido: <PausasAvisos panel={panel} categorias={categorias} onCambio={cargarPanel} /> },
      { id: 'jugadoras', etiqueta: 'Jugadoras', contenido: <JugadorasAvisos categorias={categorias} activo={pestana === 'jugadoras'} /> },
    ] : []),
    { id: 'historial', etiqueta: 'Historial', contenido: <HistorialAvisos categorias={categorias} categoriaFija={categoriaFija} activo={pestana === 'historial'} /> },
  ]

  return (
    <div className="dp-gestion" data-modulo="avisos">
      <div className="dp-gestion-contenido">
        <EncabezadoSeccion eyebrow="Equipo" eyebrowResaltado="Jugadoras" titulo="Avi" resaltado="sos" />
        <PestanasAccesibles etiqueta="Avisos" seleccionada={pestana} onSeleccionar={setPestana} pestanas={pestanas} />
      </div>
    </div>
  )
}

export default AvisosSection
