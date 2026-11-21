import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { resumenComunicaciones } from '../../utils/datafem'
import { mensajeErrorOPropio } from '../../utils/mensajesError'
import { prepararAcciones } from '../../utils/analisis/mapaAcciones'
import {
  accionesPorTramo, analisisCompleto, avisosInforme, filasExcel, hitosTiempo, informeParaGuardar, lecturaCuando, lecturaDonde,
  normalizarInforme, partidosTemporada, posicionAntesSugerida, promedioTemporada,
} from '../../utils/analisis/informePartido'
import { MARCAS, marcasDe } from '../../utils/analisis/eventosPartido'
import { cargarResumenDestinatarias } from '../../utils/destinatariasPases'
import { nombreJugadora } from '../../utils/analisis/formato'
import './partido.css'
import './informe.css'

const TIPOS_MARCA = MARCAS.map((m) => m.tipo)

// La columna «informe» de analisis_partidos todavía no existe en la base (falta correr el SQL).
const faltaColumna = (error) => error?.code === '42703' || error?.code === 'PGRST204' || /informe/.test(error?.message || '') && /column/i.test(error?.message || '')

// Pestaña Informe: datos que carga el analista (se guardan en analisis_partidos.informe), PDF de 5 páginas y Excel opcional.
export default function InformeAnalisis({
  analisis, calendario, calendarioLista, partidos, eventosTemporada, eventosPartido, eventosDelPartido, marcas,
  citaciones, minutos, jugadorasPorId, catalogo, etiquetaTipo, detallesPases, puedeEditar, onGuardado,
}) {
  const guardado = useMemo(() => normalizarInforme(analisis?.informe), [analisis?.informe])
  const [form, setForm] = useState(guardado)
  const [estado, setEstado] = useState({ tipo: '', texto: '' })
  const [ocupado, setOcupado] = useState('')
  const [avisos, setAvisos] = useState(null) // lista de avisos esperando «Generar igual»
  const [tablaDatafem, setTablaDatafem] = useState(null)

  // Posición actual en DataFem: sugerencia para «después».
  useEffect(() => {
    let cancelado = false
    supabase.from('datafem_tablas').select('zona_a, zona_b, updated_at').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (!cancelado && data) setTablaDatafem({ ...resumenComunicaciones(data), actualizada: data.updated_at }) })
    return () => { cancelado = true }
  }, [])

  const antesSugerida = useMemo(() => posicionAntesSugerida(partidos, analisis), [partidos, analisis])
  const despuesSugerida = tablaDatafem?.posicion ? Number(tablaDatafem.posicion) : null

  const nombreCortoDe = useMemo(() => (id) => {
    const j = id ? jugadorasPorId.get(id) : null
    return j ? (j.apellido || nombreJugadora(j)) : ''
  }, [jugadorasPorId])

  const partidosMapa = useMemo(() => new Map([[analisis.id, analisis]]), [analisis])
  const acciones = useMemo(() => prepararAcciones(eventosPartido.filter((e) => !e._cola), {
    partidos: partidosMapa, marcas: new Map([[analisis.id, marcas]]), detallesPases,
  }), [eventosPartido, partidosMapa, analisis.id, marcas, detallesPases])
  const tramos = useMemo(() => accionesPorTramo(acciones, marcas), [acciones, marcas])
  const hitos = useMemo(() => hitosTiempo(eventosDelPartido, marcas), [eventosDelPartido, marcas])
  const autoDonde = useMemo(() => lecturaDonde(acciones), [acciones])
  const autoCuando = useMemo(() => lecturaCuando(tramos, hitos), [tramos, hitos])

  // Lo que va al PDF: lo cargado y, donde está vacío, las sugerencias.
  const informeFinal = useMemo(() => ({
    ...form,
    posicion_antes: form.posicion_antes ?? antesSugerida,
    posicion_despues: form.posicion_despues ?? despuesSugerida,
  }), [form, antesSugerida, despuesSugerida])

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))
  const cambiarClave = (i, campo, valor) => setForm((f) => ({ ...f, claves: f.claves.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)) }))
  const numero = (v) => (v === '' ? null : Number(v))

  async function guardar() {
    if (!puedeEditar) return true
    const informe = informeParaGuardar(informeFinal)
    const { error } = await supabase.from('analisis_partidos').update({ informe }).eq('id', analisis.id)
    if (error) {
      setEstado({ tipo: 'error', texto: faltaColumna(error)
        ? 'Todavía no se pueden guardar los datos del informe: falta correr en la base el SQL de la columna «informe». El PDF sale igual con lo cargado.'
        : mensajeErrorOPropio(error, 'guardar los datos del informe') })
      return false
    }
    onGuardado?.(analisis.id, informe)
    setEstado({ tipo: 'ok', texto: 'Datos del informe guardados.' })
    return true
  }

  async function alGuardar() {
    setOcupado('guardar')
    try { await guardar() } finally { setOcupado('') }
  }

  // Partidos de la temporada con el análisis completo (marcas en orden y ninguna acción sin detallar): solo esos
  // entran en el promedio. Se leen sus marcas y los detalles de sus pases.
  async function completosTemporada() {
    const ids = partidosTemporada(eventosTemporada, partidos, analisis)
    if (!ids.length) return new Set()
    const { data, error } = await supabase.from('analisis_partido_eventos').select('partido_id, tipo, segundo')
      .in('partido_id', ids).in('tipo', TIPOS_MARCA)
    if (error) throw error
    const marcasPorPartido = new Map(ids.map((id) => [id, marcasDe((data || []).filter((f) => f.partido_id === id))]))
    const eventosOtros = eventosTemporada.filter((e) => ids.includes(e.partido_id))
    const { detalles } = await cargarResumenDestinatarias(supabase, eventosOtros)
    return new Set(ids.filter((id) => analisisCompleto({
      eventos: eventosOtros.filter((e) => e.partido_id === id), detalles, catalogo, marcas: marcasPorPartido.get(id),
    })))
  }

  async function generar(conAvisos = false) {
    if (!conAvisos) {
      const lista = avisosInforme({ eventos: eventosPartido.filter((e) => !e._cola), detalles: detallesPases, catalogo, marcas, partido: analisis })
      if (lista.length) { setAvisos(lista); return }
    }
    setAvisos(null)
    setOcupado('pdf')
    try {
      await guardar()
      const [{ generarInformePartidoPDF }, completos] = await Promise.all([
        import('../../utils/generarInformePartidoPDF'),
        completosTemporada().catch((e) => {
          console.error('Promedio de la temporada:', e)
          setEstado({ tipo: 'error', texto: 'No se pudo revisar qué partidos de la temporada están completos: el PDF sale sin la comparación con el promedio.' })
          return new Set()
        }),
      ])
      await generarInformePartidoPDF({
        analisis, calendario, calendarioLista, acciones, eventosPartido: eventosDelPartido, marcas, citaciones,
        minutos, nombreCortoDe, informe: informeFinal,
        promedio: promedioTemporada(eventosTemporada, partidos, analisis, completos),
        lecturaDondeAuto: autoDonde, lecturaCuandoAuto: autoCuando,
      })
    } catch (e) {
      console.error('Informe PDF:', e)
      setEstado({ tipo: 'error', texto: 'No se pudo armar el PDF. Probá de nuevo; si sigue, avisá con el partido que estabas usando.' })
    } finally {
      setOcupado('')
    }
  }

  async function excel() {
    setOcupado('excel')
    try {
      const XLSX = await import('xlsx')
      const hoja = XLSX.utils.json_to_sheet(filasExcel(acciones, { nombreDe: (id) => (id && jugadorasPorId.get(id) ? nombreJugadora(jugadorasPorId.get(id)) : ''), etiquetaTipo }))
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Acciones')
      XLSX.writeFile(libro, `Acciones ${analisis.rival || 'partido'} ${calendario?.fecha || analisis.fecha || ''}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-'))
    } catch (e) {
      console.error('Excel de acciones:', e)
      setEstado({ tipo: 'error', texto: 'No se pudo armar el Excel. Probá de nuevo.' })
    } finally {
      setOcupado('')
    }
  }

  const bloqueado = !puedeEditar || Boolean(ocupado)
  const figuras = citaciones.filter((c) => c.jugadora)

  return (
    <div className="pa inf">
      <header className="inf-cabecera">
        <div>
          <h2 className="az-titulo">Informe técnico de partido</h2>
          <p className="pa-nota">PDF horizontal de 5 páginas para el cuerpo técnico. Completá estos datos antes de generarlo.</p>
        </div>
        <div className="inf-acciones">
          <button type="button" className="pa-boton" data-principal disabled={Boolean(ocupado)} onClick={() => generar(false)}>
            {ocupado === 'pdf' ? 'Armando el PDF…' : 'Generar PDF'}
          </button>
          <button type="button" className="pa-boton" disabled={Boolean(ocupado) || !acciones.length} onClick={excel}>
            {ocupado === 'excel' ? 'Armando el Excel…' : 'Excel de acciones'}
          </button>
        </div>
      </header>

      {avisos && (
        <div className="inf-avisos" role="alert">
          <p className="pa-titulo">Antes de generar, revisá esto:</p>
          <ul>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <div className="inf-acciones">
            <button type="button" className="pa-boton" onClick={() => setAvisos(null)}>Volver a completar</button>
            <button type="button" className="pa-boton" data-principal onClick={() => generar(true)}>Generar igual</button>
          </div>
        </div>
      )}
      {estado.texto && <p className={estado.tipo === 'error' ? 'pa-alerta' : 'pa-aviso'} role="status">{estado.texto}</p>}
      {!puedeEditar && <p className="pa-nota">Modo consulta: podés generar el PDF, pero no guardar cambios en los datos.</p>}

      <section className="pa-seccion">
        <h3 className="pa-titulo">Portada</h3>
        <div className="inf-grilla">
          <label className="inf-campo">
            <span>Árbitra</span>
            <input value={form.arbitra} maxLength={80} disabled={bloqueado} onChange={(e) => cambiar('arbitra', e.target.value)} />
          </label>
          <label className="inf-campo">
            <span>Figura del partido</span>
            <select value={form.figura_id || ''} disabled={bloqueado} onChange={(e) => cambiar('figura_id', e.target.value || null)}>
              <option value="">Sin elegir</option>
              {figuras.map((c) => <option key={c.jugador_id} value={c.jugador_id}>{c.dorsal ?? '—'} · {nombreJugadora(c.jugadora)}</option>)}
            </select>
          </label>
          <label className="inf-campo">
            <span>Posición antes del partido</span>
            <input type="number" min="1" max="99" inputMode="numeric" disabled={bloqueado}
              value={form.posicion_antes ?? ''} placeholder={antesSugerida ? String(antesSugerida) : ''}
              onChange={(e) => cambiar('posicion_antes', numero(e.target.value))} />
            {form.posicion_antes == null && antesSugerida && <small className="pa-nota">Sale {antesSugerida}°, copiada del informe de la fecha anterior.</small>}
          </label>
          <label className="inf-campo">
            <span>Posición después del partido</span>
            <input type="number" min="1" max="99" inputMode="numeric" disabled={bloqueado}
              value={form.posicion_despues ?? ''} placeholder={despuesSugerida ? String(despuesSugerida) : ''}
              onChange={(e) => cambiar('posicion_despues', numero(e.target.value))} />
            {form.posicion_despues == null && despuesSugerida && <small className="pa-nota">Sale {despuesSugerida}°, de la tabla actual de DataFem ({tablaDatafem?.zona}).</small>}
          </label>
        </div>
        <p className="pa-nota">Los goles rivales muestran la autora si la escribís en las observaciones del gol (pestaña Partido).</p>
      </section>

      <section className="pa-seccion">
        <h3 className="pa-titulo">3 claves del partido</h3>
        {form.claves.map((c, i) => (
          <div className="inf-clave" key={i}>
            <span className="inf-numero" aria-hidden="true">{i + 1}</span>
            <label className="inf-campo">
              <span>Título de la clave {i + 1}</span>
              <input value={c.titulo} maxLength={60} disabled={bloqueado} onChange={(e) => cambiarClave(i, 'titulo', e.target.value)} />
            </label>
            <label className="inf-campo inf-ancho">
              <span>Explicación</span>
              <textarea rows={2} value={c.texto} maxLength={160} disabled={bloqueado} onChange={(e) => cambiarClave(i, 'texto', e.target.value)} />
            </label>
          </div>
        ))}
      </section>

      <section className="pa-seccion">
        <h3 className="pa-titulo">Frases de lectura <span className="pa-opcional">(si las dejás vacías, va la automática)</span></h3>
        <label className="inf-campo">
          <span>Dónde perdemos y recuperamos (página 3)</span>
          <textarea rows={2} value={form.lectura_donde} maxLength={200} placeholder={autoDonde} disabled={bloqueado} onChange={(e) => cambiar('lectura_donde', e.target.value)} />
        </label>
        <label className="inf-campo">
          <span>En qué momento caímos (página 4)</span>
          <textarea rows={2} value={form.lectura_cuando} maxLength={200} placeholder={autoCuando} disabled={bloqueado} onChange={(e) => cambiar('lectura_cuando', e.target.value)} />
        </label>
      </section>

      {puedeEditar && (
        <div className="inf-acciones">
          <button type="button" className="pa-boton" disabled={Boolean(ocupado)} onClick={alGuardar}>
            {ocupado === 'guardar' ? 'Guardando…' : 'Guardar datos del informe'}
          </button>
        </div>
      )}
    </div>
  )
}
