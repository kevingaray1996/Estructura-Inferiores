import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { eliminarPartidoSeguro } from '../utils/permisosAnalisis'
import { generarCitacionPDF } from '../utils/herramientasDiferidas'
import { generarImagenCitacion } from '../utils/herramientasDiferidas'
import { exportarEstadisticasPDF, exportarEstadisticasCSV } from '../utils/exportarEstadisticas'
import { COLORES } from '../theme'
import EncabezadoFotografico from './EncabezadoFotografico'
import Boton from './ui/Boton'
import Chips from './ui/Chips'
import FranjaNumeros from './ui/FranjaNumeros'
import EstadoVacio from './ui/EstadoVacio'
import TarjetaPartidoPremium from './TarjetaPartidoPremium'
import './partidosCalendarioPremium.css'

function ListaPartidos({ categoriaId, categoriaNombre, onVolver, onElegirPartido, onNuevoPartido, onGestionarEquipos, onVerEstadisticas, onEditarPartido, onVerComparativa, refrescar }) {
  const [partidos, setPartidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminacion, setErrorEliminacion] = useState('')
  const [filtroResultado, setFiltroResultado] = useState('todos')
  const [filtroCondicion, setFiltroCondicion] = useState('todas')

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

  // La confirmación se pide dentro de la tarjeta (menú "···"); acá solo se ejecuta el borrado seguro de siempre.
  async function handleEliminar(partidoId) {
    if (eliminando) return

    setEliminando(true); setErrorEliminacion('')
    try {
      await eliminarPartidoSeguro(supabase, partidoId)
      setPartidos((prev) => prev.filter((p) => p.id !== partidoId))
    } catch (error) {
      setErrorEliminacion(error?.code === '42501' ? 'No tenés permiso para eliminar este partido. Si tiene Análisis vinculado, solo pueden hacerlo sus dos administradores.' : 'No se pudo confirmar la eliminación. Actualizá el listado antes de reintentar; no se ejecutaron borrados separados desde esta pantalla.')
    } finally { setEliminando(false) }
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
    const penales = p.penales_favor != null && p.penales_contra != null ? `${p.penales_favor}-${p.penales_contra}` : null
    return { etiqueta, texto, golesPropios, golesRivales, penales }
  }

  // Resumen de presentación sobre los partidos ya cargados; se recalcula con los filtros.
  const conResultado = partidos.map(p => ({ partido: p, resultado: calcularResultado(p) }))
  const filtrados = conResultado.filter(({ partido, resultado }) =>
    (filtroResultado === 'todos' || resultado?.etiqueta === filtroResultado) &&
    (filtroCondicion === 'todas' || partido.local_visitante === filtroCondicion))
  const resumir = lista => {
    const jugados = lista.filter(x => x.resultado).map(x => x.resultado)
    const g = jugados.filter(r => r.etiqueta === 'Victoria').length, e = jugados.filter(r => r.etiqueta === 'Empate').length
    return { pj: jugados.length, g, e, p: jugados.length - g - e,
      gf: jugados.reduce((s, r) => s + r.golesPropios, 0), gc: jugados.reduce((s, r) => s + r.golesRivales, 0) }
  }
  const resumen = resumir(filtrados)
  const porCondicion = [['local', 'Local'], ['visitante', 'Visitante']].map(([id, nombre]) =>
    ({ id, nombre, ...resumir(conResultado.filter(x => x.partido.local_visitante === id && (filtroResultado === 'todos' || x.resultado?.etiqueta === filtroResultado))) }))
  const racha = filtrados.filter(x => x.resultado).slice(0, 10).reverse()

  return (
    <div className="pc-premium">
      <div className="pc-contenido">
        {errorEliminacion && <p role="alert">{errorEliminacion}</p>}
        {eliminando && <p role="status">Eliminando el partido de forma segura…</p>}
        {onVolver && (
          <button
            onClick={onVolver}
            className="text-sm mb-6 flex items-center gap-1 hover:opacity-70 transition-opacity"
            style={{ color: COLORES.textoSecundario }}
          >
            ← Volver
          </button>
        )}

        <EncabezadoFotografico eyebrowResaltado="Liga y amistosos" titulo="Partidos " resaltado="jugados" imagen="/images/fotos-comunicaciones/camiseta-escudo-comunicaciones.jpeg" descripcionImagen="Camiseta amarilla con el escudo de Club Comunicaciones">
          <div className="flex items-center gap-2 flex-wrap">
            {onGestionarEquipos && <Boton variante="secundario" onClick={onGestionarEquipos}>Equipos</Boton>}
            <Boton onClick={onNuevoPartido}>+ Nuevo partido</Boton>
          </div>
        </EncabezadoFotografico>

        <div className="partidos-exportar" role="group" aria-label="Estadísticas de la categoría">
          <span className="dp-eyebrow">{categoriaNombre || 'Categoría'} · <b>Estadísticas</b></span>
          <Boton variante="secundario" onClick={() => handleExportar('pdf')} disabled={exportando}>PDF</Boton>
          <Boton variante="secundario" onClick={() => handleExportar('csv')} disabled={exportando}>CSV</Boton>
          <Boton variante="secundario" onClick={onVerComparativa}>Comparativa</Boton>
        </div>

        <div className="partidos-filtros">
          <Chips etiqueta="Resultado" valor={filtroResultado} onCambiar={setFiltroResultado} opciones={[
            { valor: 'todos', etiqueta: 'Todos' }, { valor: 'Victoria', etiqueta: 'Victorias' },
            { valor: 'Empate', etiqueta: 'Empates' }, { valor: 'Derrota', etiqueta: 'Derrotas' }]} />
          <Chips etiqueta="Condición" valor={filtroCondicion} onCambiar={setFiltroCondicion} opciones={[
            { valor: 'todas', etiqueta: 'Todas' }, { valor: 'local', etiqueta: 'Local' }, { valor: 'visitante', etiqueta: 'Visitante' }]} />
        </div>

        <FranjaNumeros etiqueta="Resumen según los filtros" items={[
          { etiqueta: 'Partidos', valor: cargando ? null : resumen.pj },
          { etiqueta: 'G-E-P', valor: cargando ? null : `${resumen.g}-${resumen.e}-${resumen.p}` },
          { etiqueta: 'Goles a favor-en contra', valor: cargando ? null : `${resumen.gf}-${resumen.gc}` },
          { etiqueta: 'Efectividad', valor: cargando || !resumen.pj ? null : Math.round((resumen.g * 3 + resumen.e) / (resumen.pj * 3) * 100), unidad: '%' },
        ]} />

        {!cargando && partidos.length > 0 && <div className="partidos-resumen">
          <table className="partidos-condicion">
            <caption className="dp-eyebrow">Por condición</caption>
            <thead><tr><th scope="col">Condición</th><th scope="col">PJ</th><th scope="col">G</th><th scope="col">E</th><th scope="col">P</th><th scope="col">GF</th><th scope="col">GC</th></tr></thead>
            <tbody>{porCondicion.map(c => <tr key={c.id}><th scope="row">{c.nombre}</th><td>{c.pj}</td><td>{c.g}</td><td>{c.e}</td><td>{c.p}</td><td>{c.gf}</td><td>{c.gc}</td></tr>)}</tbody>
          </table>
          {racha.length > 0 && <div className="partidos-racha">
            <p className="dp-eyebrow">Racha · <b>Últimos {racha.length}</b></p>
            <ol aria-label="Resultados del más viejo al más reciente">{racha.map(({ partido, resultado }) =>
              <li key={partido.id} data-resultado={resultado.etiqueta.toLowerCase()} title={`vs ${partido.rival || 'Rival'} · ${resultado.texto}`}>
                <span aria-hidden="true">{resultado.etiqueta[0]}</span><span className="sr-only">{resultado.texto} vs {partido.rival}</span></li>)}</ol>
          </div>}
        </div>}

        {cargando && <EstadoVacio cargando mensaje="Cargando partidos…" />}
        {!cargando && partidos.length === 0 && <EstadoVacio mensaje="Todavía no hay partidos en esta categoría." accion={{ etiqueta: '+ Nuevo partido', onClick: onNuevoPartido }} />}
        {!cargando && partidos.length > 0 && filtrados.length === 0 && <EstadoVacio mensaje="Ningún partido con estos filtros."
          accion={{ etiqueta: 'Ver todos', onClick: () => { setFiltroResultado('todos'); setFiltroCondicion('todas') } }} />}

        <div className="partidos-rejilla club-grilla-foco">
          {filtrados.map(({ partido: p, resultado }) => <TarjetaPartidoPremium key={p.id} partido={p} resultado={resultado} onAbrir={onElegirPartido}
            onPDF={generarCitacionPDF} onImagen={generarImagenCitacion} onEstadisticas={onVerEstadisticas} onEditar={onEditarPartido} onEliminar={handleEliminar} eliminando={eliminando} />)}
        </div>
      </div>
    </div>
  )
}

export default ListaPartidos
