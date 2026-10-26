import { PARTIDOS as P } from '../appearance/partidos'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { calcularSemaforoJugador } from '../utils/semaforoRiesgo'
function AlertasDatosFisicos({ incluirCargaYCmj }) {
  const [cargando, setCargando] = useState(true)
  const [faltantes, setFaltantes] = useState({ wellness: [], carga: [], cmj: [] })
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const categoriaPrimera = await obtenerCategoriaPrimeraDivision()
      if (!categoriaPrimera) {
        setFaltantes({ wellness: [], carga: [], cmj: [] })
        setCargando(false)
        return
      }
      const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
      const { data: jugadoresPrimeraTodos } = await obtenerJugadoresDeCategoria(
        supabase,
        categoriaPrimera.id,
        categoriasData
      )
      const jugadoresPrimera = (jugadoresPrimeraTodos || []).filter((j) => j.estado !== 'no_disponible')
      const resultados = await Promise.all(
        jugadoresPrimera.map((j) => calcularSemaforoJugador(j.id, categoriaPrimera.id))
      )
      const wellness = []
      const carga = []
      const cmj = []
      jugadoresPrimera.forEach((j, i) => {
        const r = resultados[i]
        const nombre = `${j.apellido}, ${j.nombre}`
        if (r.wellness.nivel === null) wellness.push(nombre)
        if (r.carga.nivel === null) carga.push(nombre)
        if (r.cmj.nivel === null) cmj.push(nombre)
      })
      setFaltantes({ wellness, carga, cmj })
      setCargando(false)
    }
    cargar()
  }, [])
  const totalWellness = faltantes.wellness.length
  const totalCarga = incluirCargaYCmj ? faltantes.carga.length : 0
  const totalCmj = incluirCargaYCmj ? faltantes.cmj.length : 0
  const total = totalWellness + totalCarga + totalCmj
  if (cargando || total === 0) return null
  return (
    <div className="mb-6 rounded-xl overflow-hidden" style={{ border: "1px solid var(--plantel-aviso, #FBBF24)" }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium"
        style={{ backgroundColor: P.superficie, color: P.aviso }}
      >
        <span>⚠️ Alertas — datos insuficientes ({total})</span>
        <span>{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="p-3 space-y-3" style={{ backgroundColor: P.fondo }}>
          {totalWellness > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: P.secundario }}>
                Wellness ({totalWellness}) — menos de 15 respuestas en los últimos 28 días
              </p>
              <p className="text-sm" style={{ color: P.texto }}>{faltantes.wellness.join(' · ')}</p>
            </div>
          )}
          {incluirCargaYCmj && totalCarga > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: P.secundario }}>
                RPE / Carga ({totalCarga}) — sin ACWR calculable (falta RPE o minutos recientes)
              </p>
              <p className="text-sm" style={{ color: P.texto }}>{faltantes.carga.join(' · ')}</p>
            </div>
          )}
          {incluirCargaYCmj && totalCmj > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: P.secundario }}>
                CMJ ({totalCmj}) — menos de 2 mediciones cargadas
              </p>
              <p className="text-sm" style={{ color: P.texto }}>{faltantes.cmj.join(' · ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
export default AlertasDatosFisicos
