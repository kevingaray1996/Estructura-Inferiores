import './inicio.css'
import './inicio/inicioPremium.css'
import IconoNavegacion from './IconoNavegacion'
import { fechaArgentina, puedePlanificar } from '../utils/planificacion'
import AgendaDiariaInicio from './inicio/AgendaDiariaInicio'
import WellnessInicio from './inicio/WellnessInicio'
import { filtrarSeccionesVisibles } from '../config/visibilidadSecciones'
import { tintePlantel } from '../appearance/plantel'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import TablaDataFem from './TablaDataFem'
import { PALETA_INICIO as C, textoInicio } from '../appearance/paletaInicio'

const ESCUDO_CLUB_URL =
  'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function diasHastaProximoCumple(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`)
  if (Number.isNaN(nacimiento.getTime())) return null

  let proximo = new Date(
    hoy.getFullYear(),
    nacimiento.getMonth(),
    nacimiento.getDate()
  )

  if (proximo < hoy) {
    proximo = new Date(
      hoy.getFullYear() + 1,
      nacimiento.getMonth(),
      nacimiento.getDate()
    )
  }

  return Math.round((proximo - hoy) / (1000 * 60 * 60 * 24))
}

function agruparProximoPartido(partidos) {
  if (!partidos || partidos.length === 0) return null

  const primeraFecha = partidos[0].fecha
  const delMismoDia = partidos.filter((p) => p.fecha === primeraFecha)
  const rivalPrincipal = delMismoDia[0].rival

  const delMismoPartido = delMismoDia.filter(
    (p) =>
      (p.rival || '').toLowerCase().trim() ===
      (rivalPrincipal || '').toLowerCase().trim()
  )

  return {
    ...delMismoPartido[0],
    categoriasNombres: delMismoPartido
      .map((p) => p.categorias?.nombre)
      .filter(Boolean),
  }
}

function calcularResultado(p) {
  if (p.goles_local == null || p.goles_visitante == null) return null

  const golesPropios =
    p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
  const golesRivales =
    p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante

  let etiqueta
  if (golesPropios > golesRivales) etiqueta = 'Victoria'
  else if (golesPropios < golesRivales) etiqueta = 'Derrota'
  else etiqueta = 'Empate'

  if (
    golesPropios === golesRivales &&
    p.penales_favor != null &&
    p.penales_contra != null
  ) {
    if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
    else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
  }

  return {
    etiqueta,
    texto: `${etiqueta} (${golesPropios}-${golesRivales})`,
  }
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function fechaLegible(fecha) {
  if (!fecha) return ''
  const date = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(date.getTime())) return fecha

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function EtiquetaEstado({ children, color = C.amarillo }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        background: tintePlantel(color, '16'),
        color: textoInicio(color),
        border: "1px solid " + tintePlantel(color, '45'),
      }}
    >
      {children}
    </span>
  )
}

function InicioSection({ perfil, onCambiarSeccion, onAbrirCalendario, onVerBienestar, onVerPlanificacion }) {
  const [lesionados, setLesionados] = useState([])
  const [proximoPartido, setProximoPartido] = useState(null)
  const [ultimoPartidoPrincipal, setUltimoPartidoPrincipal] = useState(null)
  const [estadisticasRapidas, setEstadisticasRapidas] = useState(null)
  const [, setAlertasNutricion] = useState([])
  const [cumpleanieros, setCumpleanieros] = useState([])
  const [alertasRegistradas, setAlertas] = useState([])
  const alertas = filtrarSeccionesVisibles(alertasRegistradas)
  const [partidosAgenda, setPartidosAgenda] = useState([])
  const [errorDeportivo, setErrorDeportivo] = useState('')
  const [errorPlantel, setErrorPlantel] = useState('')
  const [errorPartidosAgenda, setErrorPartidosAgenda] = useState('')

  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function cargar() {
      setCargando(true)
      setErrorDeportivo('')
      setErrorPlantel('')
      setErrorPartidosAgenda('')

      try {
        const hoyISO = fechaArgentina()
        const hoy = new Date(`${hoyISO}T12:00:00`)

        const { data: lesionadosData, error: errorLesiones } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('estado', 'lesionado')
          .order('apellido')

        if (!activo) return
        setLesionados(lesionadosData || [])
        if (errorLesiones) setErrorPlantel('No se pudo consultar el estado del plantel. Revisá tu acceso o conexión.')

        const { data: jugadoresData } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, fecha_nacimiento, categorias(nombre)')
          .not('fecha_nacimiento', 'is', null)

        const proximosCumples = (jugadoresData || [])
          .map((j) => ({
            ...j,
            diasFaltan: diasHastaProximoCumple(j.fecha_nacimiento),
          }))
          .filter((j) => j.diasFaltan !== null && j.diasFaltan <= 6)
          .sort((a, b) => a.diasFaltan - b.diasFaltan)

        if (!activo) return
        setCumpleanieros(proximosCumples)

        const alertasNuevas = []

        if (perfil.rol !== 'medico') {
          const { data: partidosData, error: errorProximos } = await supabase
            .from('partidos')
            .select('*, categorias(nombre)')
            .gte('fecha', hoyISO)
            .order('fecha', { ascending: true })

          if (!activo) return
          setProximoPartido(agruparProximoPartido(partidosData))
          setPartidosAgenda(partidosData || [])
          if (errorProximos) setErrorPartidosAgenda('No se pudieron consultar los partidos. Revisá tu acceso o conexión.')

          const { data: partidosPasadosData, error: errorPasados } = await supabase
            .from('partidos')
            .select('*, categorias(nombre)')
            .lt('fecha', hoyISO)
            .not('goles_local', 'is', null)
            .not('goles_visitante', 'is', null)
            .order('fecha', { ascending: false })

          if (!activo) return
          if (errorPasados) setErrorDeportivo('No se pudieron consultar los resultados. Revisá tu acceso o conexión.')
          const pasados = partidosPasadosData || []
          setUltimoPartidoPrincipal(pasados[0] || null)

          let pj = 0
          let pg = 0
          let pe = 0
          let pp = 0
          let gf = 0
          let gc = 0

          pasados.forEach((p) => {
            const propios =
              p.local_visitante === 'visitante'
                ? p.goles_visitante
                : p.goles_local
            const rivales =
              p.local_visitante === 'visitante'
                ? p.goles_local
                : p.goles_visitante

            pj++
            gf += propios
            gc += rivales

            if (propios > rivales) pg++
            else if (propios < rivales) pp++
            else pe++
          })

          setEstadisticasRapidas(
            pj > 0 ? { pj, pg, pe, pp, gf, gc } : null
          )

          if (perfil.rol === 'tecnico' && perfil.categoria_id) {
            const en2Dias = new Date(hoy)
            en2Dias.setDate(en2Dias.getDate() + 2)
            const en2DiasISO = fechaISO(en2Dias)

            const { data: partidosEn2Dias } = await supabase
              .from('partidos')
              .select('*, categorias(nombre)')
              .eq('fecha', en2DiasISO)
              .eq('categoria_id', perfil.categoria_id)

            if (partidosEn2Dias?.length) {
              const idsPartidos = partidosEn2Dias.map((p) => p.id)
              const { data: citacionesExistentes } = await supabase
                .from('citaciones')
                .select('partido_id')
                .in('partido_id', idsPartidos)

              const idsConCitacion = new Set(
                (citacionesExistentes || []).map((c) => c.partido_id)
              )

              partidosEn2Dias
                .filter((p) => !idsConCitacion.has(p.id))
                .forEach((p) => {
                  alertasNuevas.push({
                    id: `citacion-${p.id}`,
                    icono: '📋',
                    color: C.amarillo,
                    texto: `Falta cargar la citación vs ${p.rival} — juega en 2 días`,
                    seccion: 'partidos',
                  })
                })
            }

            const ayer = new Date(hoy)
            ayer.setDate(ayer.getDate() - 1)
            const ayerISO = fechaISO(ayer)

            const { data: partidosAyer } = await supabase
              .from('partidos')
              .select('*, categorias(nombre)')
              .eq('fecha', ayerISO)
              .eq('categoria_id', perfil.categoria_id)

            if (partidosAyer?.length) {
              const idsPartidosAyer = partidosAyer.map((p) => p.id)
              const { data: sesionesExistentes } = await supabase
                .from('sesiones_fisicas')
                .select('partido_id')
                .eq('tipo', 'partido')
                .in('partido_id', idsPartidosAyer)

              const idsConSesion = new Set(
                (sesionesExistentes || []).map((s) => s.partido_id)
              )

              partidosAyer
                .filter((p) => !idsConSesion.has(p.id))
                .forEach((p) => {
                  alertasNuevas.push({
                    id: `minutos-${p.id}`,
                    icono: '⏱️',
                    color: '#EF9F27',
                    texto: `Falta cargar los minutos/GPS del partido vs ${p.rival} de ayer`,
                    seccion: 'fisico',
                  })
                })
            }
          }
        }

        if (perfil.rol !== 'tecnico') {
          const { data: nutricionData } = await supabase
            .from('fichas_nutricion')
            .select('*, jugadores(nombre, apellido, categorias(nombre))')
            .order('fecha', { ascending: false })

          const vistos = new Set()
          const alertasUnicas = (nutricionData || []).filter((f) => {
            if (vistos.has(f.jugador_id)) return false
            vistos.add(f.jugador_id)
            return !!f.alerta_peso
          })

          if (!activo) return
          setAlertasNutricion(alertasUnicas)

          const { data: fichasVencidas } = await supabase
            .from('fichas_medicas')
            .select('*, jugadores(nombre, apellido, categorias(nombre))')
            .eq('recuperado', false)
            .not('fecha_estimada_alta', 'is', null)
            .lte('fecha_estimada_alta', hoyISO)
            .order('fecha_estimada_alta', { ascending: true })

          const vistosLesion = new Set()

          ;(fichasVencidas || [])
            .filter((f) => {
              if (!f.jugador_id || vistosLesion.has(f.jugador_id)) return false
              vistosLesion.add(f.jugador_id)
              return true
            })
            .forEach((f) => {
              alertasNuevas.push({
                id: `lesion-${f.id}`,
                icono: '🩺',
                color: C.rojo,
                texto: `${f.jugadores?.apellido}, ${f.jugadores?.nombre} — el alta estimada (${f.fecha_estimada_alta}) ya venció, revisar estado`,
                seccion: 'medicos',
              })
            })
        }

        if (!activo) return
        setAlertas(alertasNuevas)
      } catch (error) {
        console.error('Error al cargar el inicio:', error)
        if (activo) setErrorDeportivo('No se pudo completar la lectura de Inicio. Revisá tu conexión o acceso.')
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()

    return () => {
      activo = false
    }
  }, [perfil.rol, perfil.categoria_id])

  const resultadoUltimo = ultimoPartidoPrincipal
    ? calcularResultado(ultimoPartidoPrincipal)
    : null

  const colorUltimo = resultadoUltimo
    ? resultadoUltimo.etiqueta === 'Victoria'
      ? C.verde
      : resultadoUltimo.etiqueta === 'Derrota'
        ? C.rojo
        : C.amarillo
    : C.tenue

  const fechaActual = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const abrirCalendario = (fecha, categoriaId) => onAbrirCalendario
    ? onAbrirCalendario(fecha, categoriaId) : onCambiarSeccion('calendario')

  return (
    <div className="inicio-dashboard" style={{ color: C.blanco }}>
      <img src={ESCUDO_CLUB_URL} alt="" aria-hidden="true" className="inicio-marca" />
      <div className="inicio-contenido">
        <header className="inicio-cabecera">
          <img className="inicio-portada-foto" src="/images/fotos-comunicaciones/inicio-equipo-cuerpo-tecnico-original.jpeg" alt="Plantel femenino y cuerpo técnico de Comunicaciones reunidos en círculo" width="1280" height="959" decoding="async" />
          <img src={ESCUDO_CLUB_URL} alt="Escudo Club Comunicaciones" />
          <div><p className="inicio-marca-texto">Club Comunicaciones · Fútbol femenino</p>
            <h1>Inicio</h1><p className="inicio-subtitulo">Centro de operaciones del cuerpo técnico</p><p className="inicio-secundario capitalize">{fechaActual}</p></div>
          <span className="inicio-insignia">COMUNICACIONES · GESTIÓN DEPORTIVA</span>
        </header>

        <div className="inicio-operaciones">
          <WellnessInicio key={'wellness-' + [perfil.id, perfil.rol, perfil.categoria_id].join(':')} perfil={perfil} onCambiarSeccion={onCambiarSeccion} onVerBienestar={onVerBienestar} />
          {perfil.rol !== 'medico' && <AgendaDiariaInicio key={'agenda-' + [perfil.id, perfil.rol, perfil.categoria_id].join(':')}
            perfil={perfil} partidos={partidosAgenda} proximoPartido={proximoPartido} cargandoPartidos={cargando}
            errorPartidos={errorPartidosAgenda} abrirCalendario={abrirCalendario} onVerPlanificacion={onVerPlanificacion} />}
        </div>
        {cargando && <p role="status">Cargando información del club…</p>}
        {errorDeportivo && <p role="alert">{errorDeportivo}</p>}
        <div className="inicio-resumen-inferior">
        {perfil.rol !== 'medico' && <section className="inicio-bloque" aria-labelledby="inicio-deportivo">
          <div className="inicio-titulo"><h2 id="inicio-deportivo">Último resultado registrado</h2>
            <button type="button" onClick={() => onCambiarSeccion('partidos')}><span>Consultar partidos</span> →</button></div>
          {cargando ? <p role="status">Consultando resultados…</p> : errorDeportivo ? <p role="alert">{errorDeportivo}</p> : <>
          <div className="inicio-resultado">
            <img className="inicio-rival" src={ESCUDO_CLUB_URL} alt="Escudo de Comunicaciones" /><span>Comunicaciones</span>{ultimoPartidoPrincipal?.escudo_url && <img className="inicio-rival" src={ultimoPartidoPrincipal.escudo_url} alt={'Escudo de ' + ultimoPartidoPrincipal.rival} />}<strong style={{color: textoInicio(colorUltimo)}}>{resultadoUltimo?.texto || 'Sin resultado'}</strong>
            <span>{ultimoPartidoPrincipal ? (ultimoPartidoPrincipal.rival || 'Rival') + ' · ' + fechaLegible(ultimoPartidoPrincipal.fecha) : 'Todavía no hay resultados cargados'}</span>
            {resultadoUltimo && <EtiquetaEstado color={colorUltimo}>{resultadoUltimo.etiqueta}</EtiquetaEstado>}
            {ultimoPartidoPrincipal?.categorias?.nombre && <span>{ultimoPartidoPrincipal.categorias.nombre}</span>}
            {ultimoPartidoPrincipal?.penales_favor != null && ultimoPartidoPrincipal?.penales_contra != null && <span>Penales {ultimoPartidoPrincipal.penales_favor}-{ultimoPartidoPrincipal.penales_contra}</span>}
          </div>
          <details className="inicio-resumen-historico"><summary>Resumen deportivo acumulado</summary><div className="inicio-estadisticas">
            {[
              ['Jugados', estadisticasRapidas?.pj ?? '—', C.blanco], ['Victorias', estadisticasRapidas?.pg ?? '—', C.verde],
              ['Empates', estadisticasRapidas?.pe ?? '—', C.amarillo], ['Derrotas', estadisticasRapidas?.pp ?? '—', C.rojo],
              ['Goles a favor', estadisticasRapidas?.gf ?? '—', C.verde], ['Goles en contra', estadisticasRapidas?.gc ?? '—', C.rojo],
              ['Diferencia de gol', !estadisticasRapidas ? '—' : estadisticasRapidas.gf - estadisticasRapidas.gc > 0 ? '+' + (estadisticasRapidas.gf - estadisticasRapidas.gc) : estadisticasRapidas.gf - estadisticasRapidas.gc,
                !estadisticasRapidas || estadisticasRapidas.gf - estadisticasRapidas.gc >= 0 ? C.verde : C.rojo],
            ].map(([label, valor, color]) => <div className="inicio-indicador" key={label}><span>{label}</span>
              <strong style={{color: textoInicio(color)}}>{valor}</strong></div>)}
          </div>
          </details>
          {!estadisticasRapidas && <p className="inicio-vacio">Todavía no hay estadísticas disponibles. Se mostrarán cuando existan partidos con resultados cargados.</p>}
          </>}
        </section>}

        <TablaDataFem compacto />
        </div>
        <section className="inicio-bloque inicio-estado-compacto" aria-labelledby="inicio-plantel">
          <div className="inicio-titulo"><h2 id="inicio-plantel">Estado del plantel</h2><EtiquetaEstado color={lesionados.length ? C.rojo : C.verde}>{errorPlantel || cargando ? 'Estado pendiente de confirmar' : lesionados.length + ' lesionados activos'}</EtiquetaEstado></div>
          {errorPlantel ? <p role="alert">{errorPlantel}</p> : cargando ? <p role="status">Consultando disponibilidad…</p> : lesionados.length === 0 ? <p className="inicio-vacio">No hay jugadores marcados como lesionados.</p> :
            <div className="inicio-plantel-lista">{lesionados.slice(0, 3).map(j => <div key={j.id} className="inicio-fila">
              <span className="inicio-avatar">{iniciales(j.nombre, j.apellido)}</span><span>{j.apellido}, {j.nombre}<small>{j.categorias?.nombre || 'Categoría no indicada'}</small></span>
              <EtiquetaEstado color={C.rojo}>Lesionado</EtiquetaEstado></div>)}</div>}
          {lesionados.length > 3 && <p className="inicio-secundario">Y {lesionados.length - 3} más en el listado completo.</p>}
          <button type="button" className="inicio-enlace" onClick={() => onCambiarSeccion(perfil.rol === 'medico' ? 'medicos' : 'plantel')}>
            {perfil.rol === 'medico' ? 'Consultar Médicos' : 'Consultar plantel'} →</button>
        </section>
        <div className="inicio-avisos">
          {alertas.length > 0 && <AvisoCompacto titulo="Alertas y tareas pendientes" cantidad={alertas.length} icono="medicos">
            {alertas.map(a => <button type="button" key={a.id} className="inicio-fila" onClick={() => onCambiarSeccion(a.seccion)}>
              <span style={{ color: textoInicio(a.color) }}>{a.icono}</span><span>{a.texto}</span><span aria-hidden="true">→</span>
            </button>)}
          </AvisoCompacto>}
          {cumpleanieros.length > 0 && <AvisoCompacto titulo="Cumpleaños de la semana" cantidad={cumpleanieros.length} icono="usuarios">
            {cumpleanieros.map(j => <div key={j.id} className="inicio-fila"><span className="inicio-avatar">{iniciales(j.nombre, j.apellido)}</span>
              <span>{j.apellido}, {j.nombre}<small>{j.categorias?.nombre || 'Categoría no indicada'}</small></span>
              <EtiquetaEstado>{j.diasFaltan === 0 ? '¡Hoy!' : j.diasFaltan === 1 ? 'Mañana' : 'En ' + j.diasFaltan + ' días'}</EtiquetaEstado>
            </div>)}
          </AvisoCompacto>}
        </div>

        <nav className="inicio-accesos" aria-label="Accesos rápidos">
          {filtrarSeccionesVisibles((perfil.rol === 'medico'
            ? [{ id: 'medicos', label: 'Médicos' }, { id: 'bienestar', label: 'Bienestar' }]
            : ['coordinacion', 'tecnico', 'preparador_fisico'].includes(perfil.rol)
              ? [{ id: 'plantel', label: 'Plantel y Rendimiento' }, { id: 'partidos', label: 'Partidos' }, { id: 'calendario', label: 'Calendario' },
                { id: 'fisico', label: 'Wellness' }, { id: 'entrenamientos', label: 'Entrenamientos' },
                ...(puedePlanificar(perfil) ? [{ id: 'planificacion', label: 'Planificación' }] : [])] : []), 'id')
            .map(a => <button type="button" key={a.id} onClick={() => onCambiarSeccion(a.id)}><IconoNavegacion nombre={a.id} />{a.label}</button>)}
        </nav>
        <footer className="inicio-pie">Club Comunicaciones · Panel de gestión deportiva</footer>
      </div>
    </div>
  )
}

function AvisoCompacto({ titulo, cantidad, icono, children }) {
  const [abierto, setAbierto] = useState(false)
  return <section className="inicio-aviso"><button type="button" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
    <IconoNavegacion nombre={icono} /><span>{titulo}</span><strong>{cantidad}</strong><span aria-hidden="true">{abierto ? '−' : '+'}</span>
  </button>{abierto && <div className="inicio-aviso-detalle">{children}</div>}</section>
}

export default InicioSection
