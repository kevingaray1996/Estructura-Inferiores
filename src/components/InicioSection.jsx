import './inicio.css'
import IconoNavegacion from './IconoNavegacion'
import { fechaArgentina, sumarDias, puedePlanificar } from '../utils/planificacion'
import { cargarSesionesAgenda } from '../utils/calendario'
import { filtrarSeccionesVisibles } from '../config/visibilidadSecciones'
import { tintePlantel } from '../appearance/plantel'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
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

function calcularCuentaRegresiva(fecha, hora) {
  if (!fecha) return ''

  const horaFormateada = hora
    ? hora.length === 5
      ? `${hora}:00`
      : hora
    : '00:00:00'

  const fechaHoraPartido = new Date(`${fecha}T${horaFormateada}`)
  const diffMs = fechaHoraPartido - new Date()

  if (diffMs <= 0) return 'Es hoy'

  const totalHoras = diffMs / (1000 * 60 * 60)
  const dias = Math.floor(totalHoras / 24)
  const horas = Math.floor(totalHoras % 24)

  if (dias === 0) {
    return horas <= 1 ? 'Falta menos de 1 hora' : `Faltan ${horas} horas`
  }

  if (dias === 1) {
    return horas > 0 ? `Falta 1 día y ${horas}h` : 'Falta 1 día'
  }

  return horas > 0
    ? `Faltan ${dias} días y ${horas}h`
    : `Faltan ${dias} días`
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

function InicioSection({ perfil, onCambiarSeccion, onAbrirCalendario }) {
  const [lesionados, setLesionados] = useState([])
  const [proximoPartido, setProximoPartido] = useState(null)
  const [ultimoPartidoPrincipal, setUltimoPartidoPrincipal] = useState(null)
  const [estadisticasRapidas, setEstadisticasRapidas] = useState(null)
  const [, setAlertasNutricion] = useState([])
  const [cumpleanieros, setCumpleanieros] = useState([])
  const [alertasRegistradas, setAlertas] = useState([])
  const alertas = filtrarSeccionesVisibles(alertasRegistradas)
  const [alertasWellnessDetalle, setAlertasWellnessDetalle] = useState([])

  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function cargar() {
      setCargando(true)

      try {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const hoyISO = fechaISO(hoy)

        const { data: lesionadosData } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('estado', 'lesionado')
          .order('apellido')

        if (!activo) return
        setLesionados(lesionadosData || [])

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
          const { data: partidosData } = await supabase
            .from('partidos')
            .select('*, categorias(nombre)')
            .gte('fecha', hoyISO)
            .order('fecha', { ascending: true })

          if (!activo) return
          setProximoPartido(agruparProximoPartido(partidosData))

          const { data: partidosPasadosData } = await supabase
            .from('partidos')
            .select('*, categorias(nombre)')
            .lt('fecha', hoyISO)
            .not('goles_local', 'is', null)
            .not('goles_visitante', 'is', null)
            .order('fecha', { ascending: false })

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

        const categoriaPrimera = await obtenerCategoriaPrimeraDivision()

        const debeCalcularWellness =
          categoriaPrimera &&
          (perfil.rol === 'coordinacion' ||
            perfil.rol === 'preparador_fisico' ||
            (perfil.rol === 'tecnico' &&
              perfil.categoria_id === categoriaPrimera.id))

        if (debeCalcularWellness) {
          const { data: categoriasData } = await supabase
            .from('categorias')
            .select('id, es_reserva')

          const { data: jugadoresPrimera } = await obtenerJugadoresDeCategoria(
            supabase,
            categoriaPrimera.id,
            categoriasData
          )

          const idsPrimera = (jugadoresPrimera || []).map((j) => j.id)
          let bienestarHoy = []

          if (idsPrimera.length > 0) {
            const { data: bienestarData } = await supabase
              .from('bienestar')
              .select(
                'jugador_id, sueno, dolor_muscular, fatiga, estres, animo_entrenar'
              )
              .eq('fecha', hoyISO)
              .in('jugador_id', idsPrimera)

            bienestarHoy = bienestarData || []
          }

          const bienestarPorJugador = {}
          bienestarHoy.forEach((b) => {
            bienestarPorJugador[b.jugador_id] = b
          })

          const LABELS_WELLNESS = {
            sueno: 'Sueño',
            dolor_muscular: 'Dolor muscular',
            fatiga: 'Fatiga',
            estres: 'Estrés',
            animo_entrenar: 'Ánimo para entrenar',
          }

          const alertasWellness = []

          ;(jugadoresPrimera || []).forEach((j) => {
            const b = bienestarPorJugador[j.id]
            if (!b) return

            const camposValores = [
              ['sueno', b.sueno],
              ['dolor_muscular', b.dolor_muscular],
              ['fatiga', b.fatiga],
              ['estres', b.estres],
              ['animo_entrenar', b.animo_entrenar],
            ].filter(
              ([, v]) =>
                v !== null && v !== undefined && !Number.isNaN(Number(v))
            )

            if (camposValores.length === 0) return

            const promedioDia =
              camposValores.reduce((a, [, v]) => a + Number(v), 0) /
              camposValores.length

            const factoresAltos = camposValores
              .filter(([, v]) => Number(v) >= 4)
              .map(([clave, v]) => ({
                label: LABELS_WELLNESS[clave],
                valor: Number(v),
              }))

            if (promedioDia <= 3 && factoresAltos.length === 0) return

            const esAlta =
              promedioDia > 4 || factoresAltos.some((f) => f.valor === 5)
            const color = esAlta ? C.rojo : C.amarillo
            const icono = esAlta ? '🔴' : '🟡'

            let texto = `${j.apellido}, ${j.nombre} — Wellness del día: ${promedioDia.toFixed(1)}`

            if (factoresAltos.length > 0) {
              texto += ` (${factoresAltos
                .map((f) => `${f.label} ${f.valor}`)
                .join(', ')})`
            }

            alertasWellness.push({
              id: `wellness-${j.id}`,
              icono,
              color,
              texto,
              seccion: 'fisico',
            })
          })

          if (!activo) return
          setAlertasWellnessDetalle(alertasWellness)

          const conEstresAlto = Object.values(bienestarPorJugador).filter(
            (b) => Number(b.estres) > 3
          ).length

          if (conEstresAlto >= 10) {
            alertasNuevas.push({
              id: 'estres-plantel',
              icono: '😤',
              color: C.rojo,
              texto: `${conEstresAlto} jugadoras con estrés alto hoy — conviene revisar el bienestar grupal`,
              seccion: 'fisico',
            })
          }
        }

        if (!activo) return
        setAlertas(alertasNuevas)
      } catch (error) {
        console.error('Error al cargar el inicio:', error)
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()

    return () => {
      activo = false
    }
  }, [perfil.rol, perfil.categoria_id])

  if (cargando) {
    return (
      <div className="p-6 md:p-10">
        <div
          className="max-w-7xl mx-auto rounded-2xl p-8 md:p-12"
          style={{
            background: C.tarjeta,
            border: `1px solid ${C.borde}`,
          }}
        >
          <div className="flex items-center gap-4">
            <img
              src={ESCUDO_CLUB_URL}
              alt="Club Comunicaciones"
              className="w-14 h-14 object-contain"
            />
            <div>
              <h1
                className="text-2xl md:text-3xl font-bold"
                style={{ color: C.blanco }}
              >
                Inicio
              </h1>
              <p className="mt-1" style={{ color: C.gris }}>
                Cargando información del club…
              </p>
            </div>
          </div>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-28 rounded-xl animate-pulse"
                style={{ background: 'var(--inicio-esqueleto, #252525)' }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

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
          <img src={ESCUDO_CLUB_URL} alt="Escudo Club Comunicaciones" />
          <div><p className="inicio-marca-texto">Club Comunicaciones · Fútbol femenino</p>
            <h1>Inicio</h1><p className="inicio-secundario capitalize">{fechaActual}</p></div>
          <span className="inicio-insignia">Panel de gestión deportiva</span>
        </header>

        <div className="inicio-avisos">
          {alertas.length > 0 && <AvisoCompacto titulo="Alertas y tareas pendientes" cantidad={alertas.length} icono="medicos">
            {alertas.map(a => <button type="button" key={a.id} className="inicio-fila" onClick={() => onCambiarSeccion(a.seccion)}>
              <span style={{ color: textoInicio(a.color) }}>{a.icono}</span><span>{a.texto}</span><span aria-hidden="true">→</span>
            </button>)}
          </AvisoCompacto>}
          {alertasWellnessDetalle.length > 0 && <AvisoCompacto titulo="Wellness" cantidad={alertasWellnessDetalle.length} icono="fisico">
            {alertasWellnessDetalle.map(a => <button type="button" key={a.id} className="inicio-fila" onClick={() => onCambiarSeccion(a.seccion)}>
              <span>{a.icono}</span><span>{a.texto}</span><span aria-hidden="true">→</span>
            </button>)}
          </AvisoCompacto>}
          {cumpleanieros.length > 0 && <AvisoCompacto titulo="Cumpleaños de la semana" cantidad={cumpleanieros.length} icono="usuarios">
            {cumpleanieros.map(j => <div key={j.id} className="inicio-fila"><span className="inicio-avatar">{iniciales(j.nombre, j.apellido)}</span>
              <span>{j.apellido}, {j.nombre}<small>{j.categorias?.nombre || 'Categoría no indicada'}</small></span>
              <EtiquetaEstado>{j.diasFaltan === 0 ? '¡Hoy!' : j.diasFaltan === 1 ? 'Mañana' : 'En ' + j.diasFaltan + ' días'}</EtiquetaEstado>
            </div>)}
          </AvisoCompacto>}
        </div>

        {perfil.rol !== 'medico' && <AgendaInicio key={[perfil.id, perfil.rol, perfil.categoria_id].join(':')}
          perfil={perfil} proximoPartido={proximoPartido} abrirCalendario={abrirCalendario} />}

        {perfil.rol !== 'medico' && <section className="inicio-bloque" aria-labelledby="inicio-deportivo">
          <div className="inicio-titulo"><h2 id="inicio-deportivo">Resumen deportivo</h2>
            <button type="button" onClick={() => onCambiarSeccion('partidos')}><span>Consultar partidos</span> →</button></div>
          <div className="inicio-resultado">
            <span>Último resultado</span>{ultimoPartidoPrincipal?.escudo_url && <img className="inicio-rival" src={ultimoPartidoPrincipal.escudo_url} alt={'Escudo de ' + ultimoPartidoPrincipal.rival} />}<strong style={{color: textoInicio(colorUltimo)}}>{resultadoUltimo?.texto || 'Sin resultado'}</strong>
            <span>{ultimoPartidoPrincipal ? (ultimoPartidoPrincipal.rival || 'Rival') + ' · ' + fechaLegible(ultimoPartidoPrincipal.fecha) : 'Todavía no hay resultados cargados'}</span>
            {resultadoUltimo && <EtiquetaEstado color={colorUltimo}>{resultadoUltimo.etiqueta}</EtiquetaEstado>}
          </div>
          <div className="inicio-estadisticas">
            {[
              ['Jugados', estadisticasRapidas?.pj ?? '—', C.blanco], ['Victorias', estadisticasRapidas?.pg ?? '—', C.verde],
              ['Empates', estadisticasRapidas?.pe ?? '—', C.amarillo], ['Derrotas', estadisticasRapidas?.pp ?? '—', C.rojo],
              ['Goles a favor', estadisticasRapidas?.gf ?? '—', C.verde], ['Goles en contra', estadisticasRapidas?.gc ?? '—', C.rojo],
              ['Diferencia de gol', !estadisticasRapidas ? '—' : estadisticasRapidas.gf - estadisticasRapidas.gc > 0 ? '+' + (estadisticasRapidas.gf - estadisticasRapidas.gc) : estadisticasRapidas.gf - estadisticasRapidas.gc,
                !estadisticasRapidas || estadisticasRapidas.gf - estadisticasRapidas.gc >= 0 ? C.verde : C.rojo],
            ].map(([label, valor, color]) => <div className="inicio-indicador" key={label}><span>{label}</span>
              <strong style={{color: textoInicio(color)}}>{valor}</strong></div>)}
          </div>
          {!estadisticasRapidas && <p className="inicio-vacio">Todavía no hay estadísticas disponibles. Se mostrarán cuando existan partidos con resultados cargados.</p>}
        </section>}

        <section className="inicio-bloque" aria-labelledby="inicio-plantel">
          <div className="inicio-titulo"><h2 id="inicio-plantel">Estado del plantel</h2><EtiquetaEstado color={lesionados.length ? C.rojo : C.verde}>{lesionados.length} lesionados activos</EtiquetaEstado></div>
          {lesionados.length === 0 ? <p className="inicio-vacio">No hay jugadores marcados como lesionados.</p> :
            <div className="inicio-plantel-lista">{lesionados.slice(0, 3).map(j => <div key={j.id} className="inicio-fila">
              <span className="inicio-avatar">{iniciales(j.nombre, j.apellido)}</span><span>{j.apellido}, {j.nombre}<small>{j.categorias?.nombre || 'Categoría no indicada'}</small></span>
              <EtiquetaEstado color={C.rojo}>Lesionado</EtiquetaEstado></div>)}</div>}
          {lesionados.length > 3 && <p className="inicio-secundario">Y {lesionados.length - 3} más en el listado completo.</p>}
          <button type="button" className="inicio-enlace" onClick={() => onCambiarSeccion(perfil.rol === 'medico' ? 'medicos' : 'plantel')}>
            {perfil.rol === 'medico' ? 'Consultar Médicos' : 'Consultar plantel'} →</button>
        </section>
        <TablaDataFem />
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

function AgendaInicio({ perfil, proximoPartido, abrirCalendario }) {
  const [lectura, setLectura] = useState(null)
  const [expandido, setExpandido] = useState(false)
  const [intento, setIntento] = useState(0)
  const hoy = fechaArgentina()
  const manana = sumarDias(hoy, 1)
  const { rol, categoria_id } = perfil
  const autorizado = puedePlanificar(perfil)
  const clave = [perfil.id, perfil.rol, perfil.categoria_id, hoy].join(':')
  useEffect(() => {
    let activo = true
    if (autorizado) cargarSesionesAgenda(supabase, { rol, categoria_id }, hoy, manana, true)
      .then(sesiones => { if (activo) setLectura({ clave, sesiones }) })
      .catch(error => { if (activo) setLectura({ clave, sesiones: [], error: error.message || 'No se pudo consultar Planificación. Reintentá.' }) })
    return () => { activo = false }
  }, [clave, autorizado, hoy, manana, rol, categoria_id, intento])
  const vigente = lectura?.clave === clave
  const sesiones = autorizado && vigente ? lectura.sesiones : []
  return <section className="inicio-bloque" aria-labelledby="inicio-actividades">
    <div className="inicio-titulo"><h2 id="inicio-actividades">Próximas actividades</h2>
      <button type="button" onClick={() => abrirCalendario(hoy)}><span>Consultar calendario</span> →</button></div>
    {autorizado && !vigente && <p role="status">Consultando entrenamientos…</p>}
    {autorizado && vigente && lectura.error && <div role="alert"><p>{lectura.error}</p><button type="button" onClick={() => setIntento(n => n + 1)}>Reintentar</button></div>}
    <div className="inicio-agenda">
      {(expandido ? sesiones : sesiones.slice(0, 4)).map(s => <button type="button" className="inicio-actividad" key={s.id} onClick={() => abrirCalendario(s.fecha, s.categoria_id)}>
        <span className="inicio-dia">{s.fecha === hoy ? 'Hoy' : 'Mañana'} · {fechaLegible(s.fecha)}<strong>{s.hora?.slice(0, 5) || 'Horario a confirmar'}</strong></span>
        <span><strong>{s.objetivo || 'Entrenamiento'}</strong><small>{s.categorias?.nombre || 'Categoría no informada'}</small></span>
        <EtiquetaEstado>{s.estado === 'publicado' ? 'Publicado' : 'Borrador'}</EtiquetaEstado>
      </button>)}
      {proximoPartido && <button type="button" className="inicio-actividad" onClick={() => abrirCalendario(proximoPartido.fecha, proximoPartido.categoria_id)}>
        {proximoPartido.escudo_url && <img className="inicio-rival" src={proximoPartido.escudo_url} alt={'Escudo de ' + proximoPartido.rival} />}<span className="inicio-dia">{fechaLegible(proximoPartido.fecha)}<strong>{proximoPartido.hora?.slice(0, 5) || 'Horario a confirmar'}</strong></span>
        <span><strong>Próximo partido · {proximoPartido.rival || 'Rival por confirmar'}</strong><small>{[proximoPartido.lugar, proximoPartido.categoriasNombres?.join(', ')].filter(Boolean).join(' · ')}</small>
          <small>{calcularCuentaRegresiva(proximoPartido.fecha, proximoPartido.hora)}</small></span><span aria-hidden="true">→</span>
      </button>}
    </div>
    {sesiones.length > 4 && <button type="button" aria-expanded={expandido} onClick={() => setExpandido(v => !v)}>{expandido ? 'Ver menos entrenamientos' : 'Ver todos los entrenamientos (' + sesiones.length + ')'}</button>}
    {(!autorizado || vigente && !lectura.error) && sesiones.length === 0 && !proximoPartido && <p className="inicio-vacio">Sin próximas actividades registradas.</p>}
  </section>
}

export default InicioSection
