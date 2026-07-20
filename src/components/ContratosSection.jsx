import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function formatearFecha(fecha) {
  if (!fecha) return null
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

function diasHasta(fecha) {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const destino = new Date(fecha)
  return Math.round((destino - hoy) / (1000 * 60 * 60 * 24))
}

function estadoColor(dias) {
  if (dias === null) return '#5B6B85'
  if (dias < 0) return '#F87171'
  if (dias <= 60) return '#FBBF24'
  return '#4ADE80'
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

function ContratosSection({ onVolver }) {
  const enSeisMeses = new Date()
  enSeisMeses.setMonth(enSeisMeses.getMonth() + 6)

  const [fechaDesde, setFechaDesde] = useState(hoyISO())
  const [fechaHasta, setFechaHasta] = useState(enSeisMeses.toISOString().slice(0, 10))
  const [jugadores, setJugadores] = useState([])
  const [cargando, setCargando] = useState(true)

  const inputStyle = {
    backgroundColor: '#1A2332',
    border: '1px solid #2A3548',
    color: '#F0F2F5',
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    let query = supabase
      .from('jugadores')
      .select('id, nombre, apellido, fecha_nacimiento, posicion, fecha_inicio_contrato, fecha_fin_contrato, categorias(nombre)')
      .not('fecha_fin_contrato', 'is', null)
      .order('fecha_fin_contrato', { ascending: true })
    if (fechaDesde) query = query.gte('fecha_fin_contrato', fechaDesde)
    if (fechaHasta) query = query.lte('fecha_fin_contrato', fechaHasta)
    const { data } = await query
    setJugadores(data || [])
    setCargando(false)
  }, [fechaDesde, fechaHasta])

  useEffect(() => {
    async function ejecutar() {
      await cargar()
    }
    ejecutar()
  }, [cargar])

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onVolver}
          className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: '#8A9BB8' }}
        >
          ← Volver
        </button>

        <h1
          className="text-2xl md:text-3xl mb-6"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Jugadores con contrato
        </h1>

        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Fin de contrato desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: '#5B6B85' }}>
              Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full p-2.5 rounded-xl outline-none text-sm"
              style={inputStyle}
            />
          </div>
        </div>

        {cargando && <p style={{ color: '#5B6B85' }}>Cargando...</p>}

        {!cargando && jugadores.length === 0 && (
          <p style={{ color: '#5B6B85' }}>No hay jugadores con contrato venciendo en ese rango.</p>
        )}

        <div className="space-y-2">
          {jugadores.map((j) => {
            const dias = diasHasta(j.fecha_fin_contrato)
            return (
              <div
                key={j.id}
                className="p-3 rounded-xl flex items-center justify-between gap-3"
                style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: estadoColor(dias) }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#F0F2F5' }}>
                      {j.apellido}, {j.nombre}
                    </p>
                    <p className="text-xs" style={{ color: '#8A9BB8' }}>
                      {j.categorias?.nombre}
                      {j.posicion && ` · ${j.posicion}`}
                      {calcularEdad(j.fecha_nacimiento) !== null && ` · ${calcularEdad(j.fecha_nacimiento)} años`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs" style={{ color: '#F0F2F5' }}>
                    {formatearFecha(j.fecha_inicio_contrato) || '—'} → {formatearFecha(j.fecha_fin_contrato)}
                  </p>
                  <p className="text-[10px]" style={{ color: estadoColor(dias) }}>
                    {dias < 0 ? 'Vencido' : `${dias} días`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ContratosSection
