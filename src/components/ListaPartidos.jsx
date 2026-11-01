import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { generarCitacionPDF } from '../utils/generarCitacion'
import { generarImagenCitacion } from '../utils/generarImagenCitacion'
import { exportarEstadisticasPDF, exportarEstadisticasCSV } from '../utils/exportarEstadisticas'
import { COLORES } from '../theme'
import EncabezadoFotografico from './EncabezadoFotografico'
import TarjetaPartidoPremium from './TarjetaPartidoPremium'
import './partidosCalendarioPremium.css'

function ListaPartidos({ categoriaId, categoriaNombre, onVolver, onElegirPartido, onNuevoPartido, onGestionarEquipos, onVerEstadisticas, onEditarPartido, onVerComparativa, refrescar }) {
  const [partidos, setPartidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    async function cargarPartidos() {
      setCargando(true)
      const { data } = await supabase
        .from('partidos')
        .select('*')
        .eq('categoria_id', categoriaId)
        .order('fecha', { ascending: false })
      setPartidos(data || [])
      setCargando(false)
    }
    cargarPartidos()
  }, [categoriaId, refrescar])

  async function handleEliminar(e, partidoId) {
    e.stopPropagation()
    const confirmar = window.confirm('¿Seguro que querés eliminar este partido? También se borran sus citaciones y estadísticas asociadas.')
    if (!confirmar) return

    await supabase.from('citaciones').delete().eq('partido_id', partidoId)
    await supabase.from('estadisticas_jugador').delete().eq('partido_id', partidoId)
    await supabase.from('videos').update({ partido_id: null }).eq('partido_id', partidoId)
    await supabase.from('partidos').delete().eq('id', partidoId)

    setPartidos((prev) => prev.filter((p) => p.id !== partidoId))
  }

  async function handleExportar(formato) {
    setExportando(true)
    try {
      if (formato === 'pdf') {
        await exportarEstadisticasPDF(categoriaId, categoriaNombre)
      } else {
        await exportarEstadisticasCSV(categoriaId, categoriaNombre)
      }
    } finally {
      setExportando(false)
    }
  }

  function calcularResultado(p) {
    if (p.goles_local == null || p.goles_visitante == null) return null

    const golesPropios = p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
    const golesRivales = p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante

    let etiqueta
    if (golesPropios > golesRivales) {
      etiqueta = 'Victoria'
    } else if (golesPropios < golesRivales) {
      etiqueta = 'Derrota'
    } else {
      etiqueta = 'Empate'
    }

    if (golesPropios === golesRivales && p.penales_favor != null && p.penales_contra != null) {
      if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
      else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
    }

    let texto = `${etiqueta} (${golesPropios}-${golesRivales})`
    if (p.penales_favor != null && p.penales_contra != null) {
      texto += ` [Pen. ${p.penales_favor}-${p.penales_contra}]`
    }
    return { etiqueta, texto }
  }

  return (
    <div className="pc-premium">
      <div className="pc-contenido">
        {onVolver && (
          <button
            onClick={onVolver}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver
          </button>
        )}

        <EncabezadoFotografico titulo="Partidos" imagen="/images/fotos-comunicaciones/camiseta-escudo-comunicaciones.jpeg" descripcionImagen="Camiseta amarilla con el escudo de Club Comunicaciones">
          <div className="flex items-center gap-2 flex-wrap">
            {onGestionarEquipos && (
              <button
                onClick={onGestionarEquipos}
                className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
                style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
              >
                🛡️ Equipos
              </button>
            )}
            <button
              onClick={onNuevoPartido}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ backgroundColor: COLORES.acento, color: '#1A1A1A' }}
            >
              + Nuevo partido
            </button>
          </div>
        </EncabezadoFotografico>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs" style={{ color: COLORES.textoMuted }}>
            Estadísticas de la categoría:
          </span>
          <button
            onClick={() => handleExportar('pdf')}
            disabled={exportando}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
          >
            📄 PDF
          </button>
          <button
            onClick={() => handleExportar('csv')}
            disabled={exportando}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
          >
            ⬇️ CSV
          </button>
          <button
            onClick={onVerComparativa}
            className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
            style={{ backgroundColor: COLORES.fondoTarjeta, color: COLORES.textoSecundario, border: `1px solid ${COLORES.borde}` }}
          >
            📊 Ver comparativa
          </button>
        </div>

        {cargando && <p style={{ color: COLORES.textoMuted }}>Cargando...</p>}

        {!cargando && partidos.length === 0 && (
          <p style={{ color: COLORES.textoMuted }}>No hay partidos cargados para esta categoría todavía.</p>
        )}

        <div className="partidos-indicadores" aria-label="Resultados registrados de la categoría">
          {['Victoria', 'Empate', 'Derrota'].map((etiqueta, i) => <article key={etiqueta}><span>{['Victorias', 'Empates', 'Derrotas'][i]}</span><strong style={{ color: ['var(--ui-exito)', 'var(--ui-texto-acento)', 'var(--ui-peligro)'][i] }}>{cargando ? '—' : partidos.filter(p => calcularResultado(p)?.etiqueta === etiqueta).length}</strong></article>)}
        </div>
        <p className="partidos-contexto">{categoriaNombre || 'Categoría seleccionada'} · Resultados cargados{!cargando && ' · ' + partidos.filter(p => !calcularResultado(p)).length + ' pendientes de resultado'}</p>
        <div className="partidos-rejilla">
          {partidos.map(p => <TarjetaPartidoPremium key={p.id} partido={p} resultado={calcularResultado(p)} onAbrir={onElegirPartido}
            onPDF={generarCitacionPDF} onImagen={generarImagenCitacion} onEstadisticas={onVerEstadisticas} onEditar={onEditarPartido} onEliminar={handleEliminar} />)}
        </div>
      </div>
    </div>
  )
}

export default ListaPartidos
