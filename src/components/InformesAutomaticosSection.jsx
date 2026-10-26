import { textoGestion } from '../appearance/gestion'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { COLORES } from '../theme'

const ESTILOS = {
  panel: {
    backgroundColor: 'var(--informes-superficie, #0A0A0A)',
    border: `1px solid ${COLORES.borde}`,
    borderRadius: '14px',
  },
  texto: { color: COLORES.texto },
  secundario: { color: COLORES.textoSecundario },
  muted: { color: COLORES.textoMuted },
  boton: {
    backgroundColor: 'var(--informes-superficie, #0A0A0A)',
    color: COLORES.texto,
    border: `1px solid ${COLORES.borde}`,
  },
}

const CONSULTAS = [
  { id: 'minutos', titulo: 'Menos minutos', descripcion: 'Ordena de menor a mayor los minutos jugados.' },
  { id: 'sin_minutos', titulo: 'Sin participación', descripcion: 'Jugadoras sin minutos registrados en la temporada.' },
  { id: 'goles', titulo: 'Goles y asistencias', descripcion: 'Resumen ofensivo por jugadora.' },
  { id: 'medicos', titulo: 'Registros médicos activos', descripcion: 'Disponible únicamente para Coordinación.' },
]

function nombreCompleto(j) {
  return `${j.nombre || ''} ${j.apellido || ''}`.trim() || 'Sin nombre'
}

function fechaValida(fecha) {
  if (!fecha) return null
  const d = new Date(`${fecha}`.slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

function temporadaDe(fecha) {
  return fecha ? String(fecha).slice(0, 4) : null
}

function InformeTabla({ columnas, filas, vacio }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORES.borde}` }}>
            {columnas.map((c) => (
              <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap" style={ESTILOS.muted}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="px-4 py-8 text-center" style={ESTILOS.muted}>
                {vacio}
              </td>
            </tr>
          ) : filas.map((fila, i) => (
            <tr key={fila.id || `${fila.jugadorId || 'fila'}-${i}`} style={{ borderBottom: `1px solid ${COLORES.borde}` }}>
              {columnas.map((c) => (
                <td key={c.key} className="px-4 py-3" style={ESTILOS.texto}>
                  {c.render ? c.render(fila) : (fila[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InformesAutomaticosSection({ perfil }) {
  const [jugadoras, setJugadoras] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [fichasMedicas, setFichasMedicas] = useState([])
  const [temporada, setTemporada] = useState('todas')
  const [consulta, setConsulta] = useState('minutos')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [actualizado, setActualizado] = useState(false)

  const esCoordinacion = perfil?.rol === 'coordinacion'
  const esTecnico = perfil?.rol === 'tecnico'
  const puedeVerInformes = esCoordinacion || esTecnico

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError('')
    setActualizado(false)

    try {
      let consultaJugadoras = supabase
        .from('jugadores')
        .select('id,nombre,apellido,categoria_id,estado')

      // El cuerpo técnico solo consulta su propia categoría.
      if (esTecnico && perfil?.categoria_id) {
        consultaJugadoras = consultaJugadoras.eq('categoria_id', perfil.categoria_id)
      }

      const { data: listaJugadoras, error: errorJugadoras } = await consultaJugadoras
        .order('apellido', { ascending: true })

      if (errorJugadoras) throw errorJugadoras

      const ids = (listaJugadoras || []).map((j) => j.id)
      setJugadoras(listaJugadoras || [])

      if (ids.length === 0) {
        setEstadisticas([])
        setFichasMedicas([])
        setActualizado(true)
        return
      }

      const { data: stats, error: errorStats } = await supabase
        .from('estadisticas_jugador')
        .select('jugador_id,minutos_jugados,goles,asistencias,partidos(fecha,rival)')
        .in('jugador_id', ids)

      if (errorStats) throw errorStats
      setEstadisticas(stats || [])

      // Los datos médicos solo se solicitan para Coordinación.
      if (esCoordinacion) {
        const { data: fichas, error: errorFichas } = await supabase
          .from('fichas_medicas')
          .select('jugador_id,fecha,descripcion,recuperado')
          .in('jugador_id', ids)

        if (errorFichas) throw errorFichas
        setFichasMedicas(fichas || [])
      } else {
        setFichasMedicas([])
      }

      setActualizado(true)
    } catch (e) {
      console.error('Error cargando informes:', e)
      setError(e?.message || 'No se pudieron cargar los datos.')
    } finally {
      setCargando(false)
    }
  }, [esCoordinacion, esTecnico, perfil?.categoria_id])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const temporadas = useMemo(() => {
    const anios = new Set()
    estadisticas.forEach((s) => {
      const anio = temporadaDe(s.partidos?.fecha)
      if (anio) anios.add(anio)
    })
    fichasMedicas.forEach((f) => {
      const anio = temporadaDe(f.fecha)
      if (anio) anios.add(anio)
    })
    return [...anios].sort((a, b) => b.localeCompare(a))
  }, [estadisticas, fichasMedicas])

  const datosInforme = useMemo(() => {
    const statsFiltradas = estadisticas.filter((s) => {
      const anio = temporadaDe(s.partidos?.fecha)
      return temporada === 'todas' || anio === temporada
    })

    const fichasFiltradas = fichasMedicas.filter((f) => (
      temporada === 'todas' || temporadaDe(f.fecha) === temporada
    ))

    const resumen = jugadoras.map((j) => {
      const stats = statsFiltradas.filter((s) => s.jugador_id === j.id)
      const minutos = stats.reduce((total, s) => total + (Number(s.minutos_jugados) || 0), 0)
      const goles = stats.reduce((total, s) => total + (Number(s.goles) || 0), 0)
      const asistencias = stats.reduce((total, s) => total + (Number(s.asistencias) || 0), 0)
      const registrosActivos = fichasFiltradas.filter(
        (f) => f.jugador_id === j.id && f.recuperado === false
      ).length

      return {
        id: j.id,
        jugadorId: j.id,
        nombre: nombreCompleto(j),
        minutos,
        goles,
        asistencias,
        partidosRegistrados: stats.length,
        registrosActivos,
      }
    })

    if (consulta === 'minutos') {
      return resumen
        .filter((j) => j.partidosRegistrados > 0)
        .sort((a, b) => a.minutos - b.minutos)
    }

    if (consulta === 'sin_minutos') {
      return resumen.filter((j) => j.minutos === 0)
    }

    if (consulta === 'goles') {
      return resumen.sort((a, b) => (
        b.goles - a.goles || b.asistencias - a.asistencias
      ))
    }

    if (consulta === 'medicos' && esCoordinacion) {
      return resumen
        .filter((j) => j.registrosActivos > 0)
        .sort((a, b) => b.registrosActivos - a.registrosActivos)
    }

    return []
  }, [jugadoras, estadisticas, fichasMedicas, temporada, consulta, esCoordinacion])

  const tituloInforme = CONSULTAS.find((c) => c.id === consulta)?.titulo || 'Informe'

  const columnas = useMemo(() => {
    if (consulta === 'minutos') {
      return [
        { key: 'nombre', label: 'Jugadora' },
        { key: 'minutos', label: 'Minutos' },
        { key: 'partidosRegistrados', label: 'Registros de partidos' },
      ]
    }
    if (consulta === 'sin_minutos') {
      return [{ key: 'nombre', label: 'Jugadora' }, { key: 'minutos', label: 'Minutos' }]
    }
    if (consulta === 'goles') {
      return [
        { key: 'nombre', label: 'Jugadora' },
        { key: 'goles', label: 'Goles' },
        { key: 'asistencias', label: 'Asistencias' },
        { key: 'minutos', label: 'Minutos' },
      ]
    }
    return [
      { key: 'nombre', label: 'Jugadora' },
      { key: 'registrosActivos', label: 'Registros activos' },
    ]
  }, [consulta])

  if (!puedeVerInformes) {
    return (
      <div className="p-6">
        <div className="rounded-xl p-5" style={ESTILOS.panel}>
          <h2 className="text-lg font-semibold" style={ESTILOS.texto}>Informes automáticos</h2>
          <p className="mt-2 text-sm" style={ESTILOS.secundario}>
            Esta sección está disponible para Coordinación y Cuerpo Técnico.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: textoGestion(COLORES.acento) }}>
            Club Comunicaciones
          </p>
          <h1 className="text-2xl font-semibold" style={ESTILOS.texto}>Informes automáticos</h1>
          <p className="text-sm mt-2 max-w-2xl" style={ESTILOS.secundario}>
            Consultas sobre los datos cargados en la plataforma, sin inteligencia artificial ni servicios externos.
          </p>
        </div>
        <button
          onClick={cargarDatos}
          disabled={cargando}
          className="px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
        >
          {cargando ? 'Actualizando…' : 'Actualizar datos'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ ...ESTILOS.panel, color: 'var(--plantel-error-texto, #FCA5A5)' }}>
          No se pudo generar el informe: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {CONSULTAS.filter((c) => c.id !== 'medicos' || esCoordinacion).map((c) => {
          const activa = consulta === c.id
          return (
            <button
              key={c.id}
              onClick={() => setConsulta(c.id)}
              className="text-left p-4 rounded-xl transition-opacity hover:opacity-90"
              style={{
                backgroundColor: activa ? 'rgba(242,194,48,0.10)' : 'var(--informes-superficie, #0A0A0A)',
                border: `1px solid ${activa ? COLORES.acento : COLORES.borde}`,
              }}
            >
              <p className="font-medium text-sm" style={{ color: activa ? textoGestion(COLORES.acento) : COLORES.texto }}>
                {c.titulo}
              </p>
              <p className="text-xs mt-2 leading-relaxed" style={ESTILOS.secundario}>{c.descripcion}</p>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={ESTILOS.panel}>
        <div>
          <label className="text-xs block mb-1" style={ESTILOS.muted} htmlFor="temporada-informe">
            Temporada
          </label>
          <select
            id="temporada-informe"
            value={temporada}
            onChange={(e) => setTemporada(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm ui-control outline-none"
            style={ESTILOS.boton}
          >
            <option value="todas">Todas las temporadas</option>
            {temporadas.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
          </select>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-sm"
          style={ESTILOS.boton}
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      <section className="rounded-xl overflow-hidden" style={ESTILOS.panel}>
        <div className="p-5" style={{ borderBottom: `1px solid ${COLORES.borde}` }}>
          <h2 className="font-semibold" style={ESTILOS.texto}>{tituloInforme}</h2>
          <p className="text-xs mt-1" style={ESTILOS.muted}>
            {temporada === 'todas' ? 'Todas las temporadas cargadas' : `Temporada ${temporada}`}
            {' · '}{datosInforme.length} resultado(s)
          </p>
          {consulta === 'sin_minutos' && (
            <p className="text-xs mt-2" style={ESTILOS.secundario}>
              Se muestran jugadoras sin minutos acumulados en los registros encontrados. Revisá que los partidos de la temporada estén cargados antes de sacar conclusiones.
            </p>
          )}
          {consulta === 'medicos' && (
            <p className="text-xs mt-2" style={ESTILOS.secundario}>
              Cuenta registros con recuperado = false. No equivale necesariamente a cantidad de lesiones distintas.
            </p>
          )}
        </div>

        {cargando ? (
          <p className="p-8 text-center text-sm" style={ESTILOS.muted}>Cargando datos…</p>
        ) : (
          <InformeTabla
            columnas={columnas}
            filas={datosInforme}
            vacio={actualizado ? 'No hay resultados para esta consulta y temporada.' : 'Todavía no hay datos disponibles.'}
          />
        )}
      </section>

      <p className="text-xs" style={ESTILOS.muted}>
        Los informes dependen de que las estadísticas y los registros estén completos. Los minutos se suman desde los registros de partidos disponibles.
      </p>

      <style>{`
        @media print {
          aside, nav, button, select, label { display: none !important; }
          body { background: white !important; }
          main, section, div { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

export default InformesAutomaticosSection
