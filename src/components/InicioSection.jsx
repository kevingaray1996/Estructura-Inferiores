import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

const ESCUDO_CLUB_URL =
  'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const C = {
  fondo: '#101010',
  tarjeta: '#1B1B1B',
  tarjetaHover: '#232323',
  borde: '#303030',
  amarillo: '#F6C900',
  amarilloSuave: '#332B00',
  blanco: '#FAFAFA',
  gris: '#B5B5B5',
  tenue: '#858585',
  verde: '#72C58B',
  rojo: '#F07171',
}

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

function SeccionTitulo({ icono, titulo, detalle, cantidad }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{
            background: C.amarilloSuave,
            border: `1px solid ${C.amarillo}35`,
          }}
        >
          {icono}
        </div>
        <div>
          <h2
            className="text-lg md:text-xl font-bold"
            style={{ color: C.blanco }}
          >
            {titulo}
          </h2>
          {detalle && (
            <p className="text-sm mt-0.5" style={{ color: C.tenue }}>
              {detalle}
            </p>
          )}
        </div>
      </div>

      {cantidad != null && (
        <span
          className="px-3 py-1 rounded-full text-xs font-bold"
          style={{
            color: C.amarillo,
            background: C.amarilloSuave,
            border: `1px solid ${C.amarillo}35`,
          }}
        >
          {cantidad}
        </span>
      )}
    </div>
  )
}

function Tarjeta({ children, accent, onClick, className = '' }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`rounded-2xl p-5 md:p-6 transition-all duration-200 ${className}`}
      style={{
        background: C.tarjeta,
        border: `1px solid ${C.borde}`,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${C.borde}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = C.tarjetaHover
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = C.tarjeta
      }}
    >
      {children}
    </div>
  )
}

function EtiquetaEstado({ children, color = C.amarillo }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        background: `${color}16`,
        color,
        border: `1px solid ${color}45`,
      }}
    >
      {children}
    </span>
  )
}

function InicioSection({ perfil, onCambiarSeccion }) {
  const [lesionados, setLesionados] = useState([])
  const [proximoPartido, setProximoPartido] = useState(null)
  const [ultimoPartidoPrincipal, setUltimoPartidoPrincipal] = useState(null)
  const [estadisticasRapidas, setEstadisticasRapidas] = useState(null)
  const [alertasNutricion, setAlertasNutricion] = useState([])
  const [cumpleanieros, setCumpleanieros] = useState([])
  const [alertas, setAlertas] = useState([])
  const [alertasWellnessDetalle, setAlertasWellnessDetalle] = useState([])
  const [wellnessExpandido, setWellnessExpandido] = useState(false)
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
                style={{ background: '#252525' }}
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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const tarjetasResumen = [
    {
      label: 'Próximo partido',
      icono: '⚽',
      valor: proximoPartido ? proximoPartido.rival || 'Rival por confirmar' : '—',
      detalle: proximoPartido
        ? `${fechaLegible(proximoPartido.fecha)}${proximoPartido.hora ? ` · ${proximoPartido.hora}` : ''}`
        : 'No hay partidos próximos cargados',
      accent: C.amarillo,
      visible: perfil.rol !== 'medico',
      seccion: 'partidos',
    },
    {
      label: 'Lesionados activos',
      icono: '🩺',
      valor: lesionados.length,
      detalle:
        lesionados.length === 1
          ? 'Jugador con estado lesionado'
          : 'Jugadores con estado lesionado',
      accent: lesionados.length ? C.rojo : C.verde,
      visible: true,
      seccion: perfil.rol === 'medico' ? 'medicos' : 'plantel',
    },
    {
      label: 'Alertas de nutrición',
      icono: '🥗',
      valor: perfil.rol === 'tecnico' ? '—' : alertasNutricion.length,
      detalle:
        perfil.rol === 'tecnico'
          ? 'No disponible para este perfil'
          : 'Jugadoras con alerta de peso',
      accent: alertasNutricion.length ? C.rojo : C.verde,
      visible: perfil.rol !== 'tecnico',
      seccion: 'nutricion',
    },
    {
      label: 'Último resultado',
      icono: '🏆',
      valor: resultadoUltimo
        ? resultadoUltimo.texto
        : 'Sin resultado',
      detalle: ultimoPartidoPrincipal
        ? `${ultimoPartidoPrincipal.rival || 'Rival'} · ${fechaLegible(ultimoPartidoPrincipal.fecha)}`
        : 'Todavía no hay resultados cargados',
      accent: colorUltimo,
      visible: perfil.rol !== 'medico',
      seccion: 'partidos',
    },
  ].filter((item) => item.visible)

  return (
    <div
      className="relative min-h-full p-4 sm:p-6 lg:p-8 xl:p-10"
      style={{ color: C.blanco }}
    >
      <style>{`
        .inicio-panel {
          animation: inicioAparecer .35s ease-out both;
        }
        @keyframes inicioAparecer {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .inicio-acento {
          height: 3px;
          background: linear-gradient(90deg, ${C.amarillo}, #8d7600 75%, transparent);
        }
        .inicio-numero {
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.04em;
        }
        .inicio-click:focus-visible {
          outline: 2px solid ${C.amarillo};
          outline-offset: 3px;
        }
      `}</style>

      <img
        src={ESCUDO_CLUB_URL}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(70vw, 820px)',
          minWidth: 280,
          opacity: 0.025,
          zIndex: 0,
        }}
      />

      <div className="max-w-[1600px] mx-auto relative" style={{ zIndex: 1 }}>
        {/* Encabezado */}
        <header
          className="inicio-panel relative overflow-hidden rounded-2xl md:rounded-3xl mb-7 md:mb-9"
          style={{
            background:
              'linear-gradient(115deg, #242000 0%, #191919 45%, #141414 100%)',
            border: `1px solid ${C.amarillo}40`,
          }}
        >
          <div className="inicio-acento" />

          <div className="relative p-5 sm:p-7 lg:p-9 flex flex-col sm:flex-row sm:items-center gap-5">
            <div
              className="w-[76px] h-[76px] md:w-24 md:h-24 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: '#0F0F0F',
                border: `1px solid ${C.amarillo}50`,
                boxShadow: '0 8px 30px #00000040',
              }}
            >
              <img
                src={ESCUDO_CLUB_URL}
                alt="Escudo Club Comunicaciones"
                className="w-[62px] h-[62px] md:w-20 md:h-20 object-contain"
              />
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-xs md:text-sm font-bold tracking-[0.22em] uppercase mb-2"
                style={{ color: C.amarillo }}
              >
                Club Comunicaciones · Fútbol femenino
              </p>

              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight"
                style={{
                  color: C.blanco,
                  fontFamily: "'Archivo Black', sans-serif",
                }}
              >
                Inicio
              </h1>

              <p className="text-sm md:text-base mt-2 capitalize" style={{ color: C.gris }}>
                {fechaActual}
              </p>
            </div>

            <div
              className="self-start sm:self-center rounded-xl px-4 py-3 min-w-[145px]"
              style={{
                background: '#0F0F0F75',
                border: `1px solid ${C.amarillo}30`,
              }}
            >
              <p
                className="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: C.tenue }}
              >
                Panel de gestión
              </p>
              <p className="text-sm font-bold mt-1" style={{ color: C.amarillo }}>
                Temporada actual
              </p>
            </div>
          </div>
        </header>

        {/* Alertas generales */}
        {alertas.length > 0 && (
          <section className="inicio-panel mb-8">
            <SeccionTitulo
              icono="🔔"
              titulo="Alertas y tareas pendientes"
              detalle="Situaciones que requieren atención"
              cantidad={alertas.length}
            />

            <div className="grid lg:grid-cols-2 gap-3">
              {alertas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onCambiarSeccion(a.seccion)}
                  className="inicio-click text-left flex items-start gap-4 p-4 md:p-5 rounded-xl transition-all hover:-translate-y-0.5"
                  style={{
                    background: C.tarjeta,
                    border: `1px solid ${a.color}70`,
                  }}
                >
                  <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${a.color}16` }}
                  >
                    {a.icono}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block text-sm md:text-base leading-relaxed"
                      style={{ color: C.blanco }}
                    >
                      {a.texto}
                    </span>
                    <span
                      className="inline-block mt-2 text-xs font-bold"
                      style={{ color: a.color }}
                    >
                      Ir a la sección →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Wellness */}
        {alertasWellnessDetalle.length > 0 && (
          <section className="inicio-panel mb-8">
            <SeccionTitulo
              icono="💛"
              titulo="Seguimiento de Wellness"
              detalle="Registros del día que conviene revisar"
              cantidad={alertasWellnessDetalle.length}
            />

            {alertasWellnessDetalle.length > 3 && (
              <button
                type="button"
                onClick={() => setWellnessExpandido(!wellnessExpandido)}
                className="inicio-click w-full text-left flex items-center justify-between gap-4 p-4 rounded-xl mb-3"
                style={{
                  background: C.tarjeta,
                  border: `1px solid ${
                    alertasWellnessDetalle.some((a) => a.icono === '🔴')
                      ? `${C.rojo}80`
                      : `${C.amarillo}70`
                  }`,
                }}
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl">
                    {alertasWellnessDetalle.some((a) => a.icono === '🔴')
                      ? '🔴'
                      : '🟡'}
                  </span>
                  <span className="text-sm md:text-base" style={{ color: C.blanco }}>
                    {alertasWellnessDetalle.length} jugadoras con indicadores para revisar
                  </span>
                </span>
                <span className="text-sm font-bold shrink-0" style={{ color: C.amarillo }}>
                  {wellnessExpandido ? 'Ver menos ↑' : 'Ver detalle ↓'}
                </span>
              </button>
            )}

            {(alertasWellnessDetalle.length <= 3 || wellnessExpandido) && (
              <div className="grid lg:grid-cols-2 gap-3">
                {alertasWellnessDetalle.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onCambiarSeccion(a.seccion)}
                    className="inicio-click text-left flex items-start gap-3 p-4 rounded-xl"
                    style={{
                      background: C.tarjeta,
                      border: `1px solid ${a.color}65`,
                    }}
                  >
                    <span className="text-lg shrink-0">{a.icono}</span>
                    <span className="text-sm leading-relaxed" style={{ color: C.blanco }}>
                      {a.texto}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Indicadores principales */}
        <section className="inicio-panel mb-8">
          <SeccionTitulo
            icono="📊"
            titulo="Resumen del equipo"
            detalle="Información principal para el seguimiento diario"
          />

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {tarjetasResumen.map((item) => (
              <Tarjeta
                key={item.label}
                accent={item.accent}
                onClick={() => onCambiarSeccion(item.seccion)}
                className="inicio-click min-w-0"
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <p
                    className="text-xs md:text-sm font-bold uppercase tracking-wider"
                    style={{ color: C.gris }}
                  >
                    {item.label}
                  </p>
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{
                      background: `${item.accent}16`,
                      border: `1px solid ${item.accent}30`,
                    }}
                  >
                    {item.icono}
                  </span>
                </div>

                <p
                  className="text-2xl md:text-3xl font-black leading-tight break-words"
                  style={{
                    color: item.accent,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.valor}
                </p>

                <p className="text-sm mt-3 leading-relaxed" style={{ color: C.tenue }}>
                  {item.detalle}
                </p>

                <div
                  className="mt-5 pt-4 flex items-center justify-between text-xs font-bold"
                  style={{ borderTop: `1px solid ${C.borde}`, color: C.gris }}
                >
                  <span>Ver información</span>
                  <span style={{ color: C.amarillo }}>→</span>
                </div>
              </Tarjeta>
            ))}
          </div>
        </section>

        {/* Partidos */}
        {perfil.rol !== 'medico' && (
          <section className="inicio-panel mb-8">
            <SeccionTitulo
              icono="⚽"
              titulo="Actualidad deportiva"
              detalle="Próximo compromiso, último resultado y rendimiento"
            />

            <div className="grid lg:grid-cols-2 gap-4">
              <Tarjeta
                accent={C.amarillo}
                onClick={() => onCambiarSeccion('partidos')}
                className="inicio-click"
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: C.gris }}
                  >
                    Próximo partido
                  </p>
                  <EtiquetaEstado>Agenda</EtiquetaEstado>
                </div>

                {proximoPartido ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          background: '#111111',
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        {proximoPartido.escudo_url ? (
                          <img
                            src={proximoPartido.escudo_url}
                            alt={`Escudo de ${proximoPartido.rival}`}
                            className="w-14 h-14 object-contain"
                          />
                        ) : (
                          <span className="text-3xl">🛡️</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs uppercase tracking-wider mb-1"
                          style={{ color: C.tenue }}
                        >
                          Rival
                        </p>
                        <h3 className="text-xl md:text-2xl font-bold break-words" style={{ color: C.blanco }}>
                          {proximoPartido.rival || 'Rival por confirmar'}
                        </h3>
                        <p className="text-sm mt-1" style={{ color: C.gris }}>
                          {fechaLegible(proximoPartido.fecha)}
                          {proximoPartido.hora && ` · ${proximoPartido.hora}`}
                        </p>
                      </div>
                    </div>

                    <div
                      className="mt-5 rounded-xl p-4 flex items-center justify-between gap-3"
                      style={{
                        background: C.amarilloSuave,
                        border: `1px solid ${C.amarillo}25`,
                      }}
                    >
                      <span className="text-sm font-medium" style={{ color: C.gris }}>
                        Cuenta regresiva
                      </span>
                      <span className="text-sm md:text-base font-bold text-right" style={{ color: C.amarillo }}>
                        {calcularCuentaRegresiva(
                          proximoPartido.fecha,
                          proximoPartido.hora
                        )}
                      </span>
                    </div>

                    {proximoPartido.categoriasNombres?.length > 0 && (
                      <p className="text-xs mt-4" style={{ color: C.tenue }}>
                        Categorías: {proximoPartido.categoriasNombres.join(', ')}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <span className="text-3xl">📅</span>
                    <p className="mt-3 font-semibold" style={{ color: C.blanco }}>
                      No hay partidos próximos cargados
                    </p>
                    <p className="text-sm mt-1" style={{ color: C.tenue }}>
                      Los próximos compromisos aparecerán acá.
                    </p>
                  </div>
                )}

                <div
                  className="mt-5 pt-4 flex items-center justify-between text-xs font-bold"
                  style={{ borderTop: `1px solid ${C.borde}`, color: C.gris }}
                >
                  <span>Consultar calendario</span>
                  <span style={{ color: C.amarillo }}>→</span>
                </div>
              </Tarjeta>

              <Tarjeta
                accent={colorUltimo}
                onClick={() => onCambiarSeccion('partidos')}
                className="inicio-click"
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: C.gris }}
                  >
                    Último resultado
                  </p>
                  {resultadoUltimo && (
                    <EtiquetaEstado color={colorUltimo}>
                      {resultadoUltimo.etiqueta}
                    </EtiquetaEstado>
                  )}
                </div>

                {ultimoPartidoPrincipal ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          background: '#111111',
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        {ultimoPartidoPrincipal.escudo_url ? (
                          <img
                            src={ultimoPartidoPrincipal.escudo_url}
                            alt={`Escudo de ${ultimoPartidoPrincipal.rival}`}
                            className="w-14 h-14 object-contain"
                          />
                        ) : (
                          <span className="text-3xl">🛡️</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs uppercase tracking-wider mb-1"
                          style={{ color: C.tenue }}
                        >
                          Último rival registrado
                        </p>
                        <h3 className="text-xl md:text-2xl font-bold break-words" style={{ color: C.blanco }}>
                          {ultimoPartidoPrincipal.rival || 'Rival'}
                        </h3>
                        <p className="text-sm mt-1" style={{ color: C.gris }}>
                          {fechaLegible(ultimoPartidoPrincipal.fecha)}
                        </p>
                      </div>
                    </div>

                    {resultadoUltimo && (
                      <div
                        className="mt-5 rounded-xl p-4 flex items-center justify-between gap-3"
                        style={{
                          background: `${colorUltimo}12`,
                          border: `1px solid ${colorUltimo}35`,
                        }}
                      >
                        <span className="text-sm" style={{ color: C.gris }}>
                          Resultado
                        </span>
                        <span
                          className="text-lg md:text-xl font-black"
                          style={{ color: colorUltimo }}
                        >
                          {resultadoUltimo.texto}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <span className="text-3xl">🏟️</span>
                    <p className="mt-3 font-semibold" style={{ color: C.blanco }}>
                      Todavía no hay resultados cargados
                    </p>
                    <p className="text-sm mt-1" style={{ color: C.tenue }}>
                      Los resultados aparecerán una vez registrados.
                    </p>
                  </div>
                )}

                <div
                  className="mt-5 pt-4 flex items-center justify-between text-xs font-bold"
                  style={{ borderTop: `1px solid ${C.borde}`, color: C.gris }}
                >
                  <span>Consultar partidos</span>
                  <span style={{ color: C.amarillo }}>→</span>
                </div>
              </Tarjeta>
            </div>
          </section>
        )}

        {/* Estadísticas */}
        {perfil.rol !== 'medico' && (
          <section className="inicio-panel mb-8">
            <SeccionTitulo
              icono="📈"
              titulo="Estadísticas de la temporada"
              detalle="Resumen de los partidos con resultado registrado"
            />

            <Tarjeta accent={C.amarillo}>
              {estadisticasRapidas ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    {[
                      { label: 'Jugados', valor: estadisticasRapidas.pj, color: C.blanco },
                      { label: 'Victorias', valor: estadisticasRapidas.pg, color: C.verde },
                      { label: 'Empates', valor: estadisticasRapidas.pe, color: C.amarillo },
                      { label: 'Derrotas', valor: estadisticasRapidas.pp, color: C.rojo },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-4 md:p-5"
                        style={{
                          background: '#111111',
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        <p className="text-xs md:text-sm font-medium" style={{ color: C.gris }}>
                          {stat.label}
                        </p>
                        <p
                          className="inicio-numero text-3xl md:text-4xl font-black mt-2"
                          style={{ color: stat.color }}
                        >
                          {stat.valor}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    {[
                      { label: 'Goles a favor', valor: estadisticasRapidas.gf, color: C.verde },
                      { label: 'Goles en contra', valor: estadisticasRapidas.gc, color: C.rojo },
                      {
                        label: 'Diferencia de gol',
                        valor:
                          estadisticasRapidas.gf - estadisticasRapidas.gc > 0
                            ? `+${estadisticasRapidas.gf - estadisticasRapidas.gc}`
                            : estadisticasRapidas.gf - estadisticasRapidas.gc,
                        color:
                          estadisticasRapidas.gf - estadisticasRapidas.gc >= 0
                            ? C.verde
                            : C.rojo,
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-4 flex items-center justify-between gap-3"
                        style={{
                          background: '#111111',
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        <span className="text-sm" style={{ color: C.gris }}>
                          {stat.label}
                        </span>
                        <span className="text-xl font-black" style={{ color: stat.color }}>
                          {stat.valor}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onCambiarSeccion('partidos')}
                    className="inicio-click w-full mt-4 rounded-xl p-4 flex items-center justify-between gap-3 text-left"
                    style={{
                      background: C.amarilloSuave,
                      border: `1px solid ${C.amarillo}30`,
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: C.blanco }}>
                      Ver detalle de los partidos
                    </span>
                    <span style={{ color: C.amarillo }}>→</span>
                  </button>
                </>
              ) : (
                <div className="py-7 text-center">
                  <p className="font-semibold" style={{ color: C.blanco }}>
                    Todavía no hay estadísticas disponibles
                  </p>
                  <p className="text-sm mt-2" style={{ color: C.tenue }}>
                    Se mostrarán cuando existan partidos con resultados cargados.
                  </p>
                </div>
              )}
            </Tarjeta>
          </section>
        )}

        {/* Plantel: lesionados y nutrición */}
        <section className="inicio-panel mb-8">
          <SeccionTitulo
            icono="👥"
            titulo="Seguimiento del plantel"
            detalle="Estado de salud y alertas para el equipo"
          />

          <div className="grid lg:grid-cols-2 gap-4">
            <Tarjeta
              accent={lesionados.length > 0 ? C.rojo : C.verde}
              onClick={() =>
                onCambiarSeccion(perfil.rol === 'medico' ? 'medicos' : 'plantel')
              }
              className="inicio-click"
            >
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.gris }}>
                    Estado físico
                  </p>
                  <h3 className="text-xl font-bold mt-2" style={{ color: C.blanco }}>
                    Lesionados activos
                  </h3>
                </div>
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${lesionados.length ? C.rojo : C.verde}16` }}
                >
                  🩺
                </span>
              </div>

              <div className="flex items-end gap-3 mb-5">
                <span
                  className="inicio-numero text-5xl font-black"
                  style={{ color: lesionados.length ? C.rojo : C.verde }}
                >
                  {lesionados.length}
                </span>
                <span className="text-sm pb-2" style={{ color: C.gris }}>
                  {lesionados.length === 1 ? 'jugador registrado' : 'jugadores registrados'}
                </span>
              </div>

              {lesionados.length === 0 ? (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{
                    background: '#111111',
                    border: `1px solid ${C.borde}`,
                    color: C.verde,
                  }}
                >
                  ✓ No hay jugadores marcados como lesionados.
                </div>
              ) : (
                <div className="space-y-2">
                  {lesionados.slice(0, 6).map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{
                        background: '#111111',
                        border: `1px solid ${C.borde}`,
                      }}
                    >
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: '#2D1919',
                          color: C.rojo,
                          border: `1px solid ${C.rojo}30`,
                        }}
                      >
                        {iniciales(j.nombre, j.apellido)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: C.blanco }}>
                          {j.apellido}, {j.nombre}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: C.tenue }}>
                          {j.categorias?.nombre || 'Categoría no indicada'}
                        </p>
                      </div>
                      <span className="text-xs shrink-0" style={{ color: C.rojo }}>
                        Lesionado
                      </span>
                    </div>
                  ))}

                  {lesionados.length > 6 && (
                    <p className="text-xs pt-2" style={{ color: C.tenue }}>
                      Y {lesionados.length - 6} más…
                    </p>
                  )}
                </div>
              )}

              <div
                className="mt-5 pt-4 flex items-center justify-between text-xs font-bold"
                style={{ borderTop: `1px solid ${C.borde}`, color: C.gris }}
              >
                <span>Consultar plantel</span>
                <span style={{ color: C.amarillo }}>→</span>
              </div>
            </Tarjeta>

            {perfil.rol !== 'tecnico' && (
              <Tarjeta
                accent={alertasNutricion.length > 0 ? C.rojo : C.verde}
                onClick={() => onCambiarSeccion('nutricion')}
                className="inicio-click"
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.gris }}>
                      Área nutricional
                    </p>
                    <h3 className="text-xl font-bold mt-2" style={{ color: C.blanco }}>
                      Alertas de nutrición
                    </h3>
                  </div>
                  <span
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{
                      background: `${alertasNutricion.length ? C.rojo : C.verde}16`,
                    }}
                  >
                    🥗
                  </span>
                </div>

                <div className="flex items-end gap-3 mb-5">
                  <span
                    className="inicio-numero text-5xl font-black"
                    style={{ color: alertasNutricion.length ? C.rojo : C.verde }}
                  >
                    {alertasNutricion.length}
                  </span>
                  <span className="text-sm pb-2" style={{ color: C.gris }}>
                    {alertasNutricion.length === 1
                      ? 'alerta de peso'
                      : 'alertas de peso'}
                  </span>
                </div>

                {alertasNutricion.length === 0 ? (
                  <div
                    className="rounded-xl p-4 text-sm"
                    style={{
                      background: '#111111',
                      border: `1px solid ${C.borde}`,
                      color: C.verde,
                    }}
                  >
                    ✓ Sin alertas de peso activas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertasNutricion.slice(0, 6).map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 rounded-xl p-3"
                        style={{
                          background: '#111111',
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: '#2D1919',
                            color: C.rojo,
                            border: `1px solid ${C.rojo}30`,
                          }}
                        >
                          {iniciales(f.jugadores?.nombre, f.jugadores?.apellido)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: C.blanco }}>
                            {f.jugadores?.apellido}, {f.jugadores?.nombre}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: C.tenue }}>
                            {f.jugadores?.categorias?.nombre || 'Categoría no indicada'}
                          </p>
                        </div>
                        <span className="text-xs shrink-0" style={{ color: C.rojo }}>
                          Revisar
                        </span>
                      </div>
                    ))}

                    {alertasNutricion.length > 6 && (
                      <p className="text-xs pt-2" style={{ color: C.tenue }}>
                        Y {alertasNutricion.length - 6} más…
                      </p>
                    )}
                  </div>
                )}

                <div
                  className="mt-5 pt-4 flex items-center justify-between text-xs font-bold"
                  style={{ borderTop: `1px solid ${C.borde}`, color: C.gris }}
                >
                  <span>Consultar nutrición</span>
                  <span style={{ color: C.amarillo }}>→</span>
                </div>
              </Tarjeta>
            )}
          </div>
        </section>

        {/* Cumpleaños */}
        {cumpleanieros.length > 0 && (
          <section className="inicio-panel mb-8">
            <SeccionTitulo
              icono="🎂"
              titulo="Cumpleaños de la semana"
              detalle="Jugadoras y jugadores que cumplen en los próximos días"
              cantidad={cumpleanieros.length}
            />

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {cumpleanieros.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{
                    background: C.tarjeta,
                    border: `1px solid ${C.borde}`,
                  }}
                >
                  <span
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: C.amarilloSuave,
                      color: C.amarillo,
                      border: `1px solid ${C.amarillo}35`,
                    }}
                  >
                    {iniciales(j.nombre, j.apellido)}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: C.blanco }}>
                      {j.apellido}, {j.nombre}
                    </p>
                    <p className="text-xs mt-1 truncate" style={{ color: C.tenue }}>
                      {j.categorias?.nombre || 'Categoría no indicada'}
                    </p>
                  </div>

                  <EtiquetaEstado>
                    {j.diasFaltan === 0
                      ? '¡Hoy!'
                      : j.diasFaltan === 1
                        ? 'Mañana'
                        : `En ${j.diasFaltan} días`}
                  </EtiquetaEstado>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pie */}
        <footer
          className="mt-10 pt-5 pb-3 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: `1px solid ${C.borde}` }}
        >
          <div className="flex items-center gap-3">
            <img
              src={ESCUDO_CLUB_URL}
              alt=""
              className="w-8 h-8 object-contain"
            />
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: C.gris }}>
                Club Comunicaciones
              </p>
              <p className="text-xs mt-1" style={{ color: C.tenue }}>
                Gestión deportiva · Fútbol femenino
              </p>
            </div>
          </div>

          <p className="text-xs" style={{ color: C.tenue }}>
            Panel interno del cuerpo técnico
          </p>
        </footer>
      </div>
    </div>
  )
}

export default InicioSection
