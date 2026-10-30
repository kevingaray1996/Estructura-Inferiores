import { useEffect, useState } from 'react'
import { CANAL_VENTANA_ANALISIS, ID_CONTENIDO_ANALISIS } from '../utils/rutaVentanaAnalisis'

export default function VentanaAuxiliarAnalisis() {
  const [estado, setEstado] = useState('esperando')
  useEffect(() => {
    const principal = window.opener
    if (!principal || principal.closed) {
      const id = window.setTimeout(() => setEstado('sin-principal'), 0)
      return () => window.clearTimeout(id)
    }
    const conectar = () => {
      if (principal.closed) { setEstado('sin-principal'); return }
      try { principal.postMessage({ canal: CANAL_VENTANA_ANALISIS, tipo: 'lista' }, window.location.origin) }
      catch { setEstado('sin-principal') }
    }
    const recibir = event => {
      if (event.source !== principal || event.origin !== window.location.origin || event.data?.canal !== CANAL_VENTANA_ANALISIS) return
      if (event.data.tipo === 'conectada') { setEstado('conectada'); window.clearInterval(intervalo) }
    }
    window.addEventListener('message', recibir)
    const intervalo = window.setInterval(conectar, 1000)
    conectar()
    return () => { window.removeEventListener('message', recibir); window.clearInterval(intervalo) }
  }, [])
  return <>
    {estado !== 'conectada' && <section className="analisis-auxiliar analisis-conexion" role="status">
      <h1>Club Comunicaciones · Videoanálisis</h1>
      <p>{estado === 'sin-principal' ? 'Abrí esta ventana desde Separar reproductor o Separar botonera en la ventana principal.' : 'Conectando con la sesión principal de Análisis…'}</p>
      <p>Mantené abierta la ventana principal. Esta página no registra acciones por su cuenta.</p>
    </section>}
    <main id={ID_CONTENIDO_ANALISIS} data-ventana-analisis="lista" />
  </>
}
