
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'

const ESCUDO_CLUB_URL =
  'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const C = {
  fondo: 'var(--fondo-pagina)',
  tarjeta: 'var(--fondo-tarjeta)',
  tarjetaSecundaria: 'var(--fondo-secundario)',
  borde: 'var(--borde)',
  amarillo: '#F2C230',
  texto: 'var(--texto)',
  secundario: 'var(--texto-secundario)',
  verde: 'var(--exito)',
  rojo: 'var(--peligro)',
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

  return Math.round((proximo - hoy) / 86400000)
}

function agruparProximoPartido(partidos) {
  if (!partidos?.length) return null

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

  const propios =
    p.local_visitante === 'visitante'
      ? p.goles_visitante
      : p.goles_local

  const rivales =
    p.local_visitante === 'visitante'
      ? p.goles_local
      : p.goles_visitante

  let etiqueta =
    propios > rivales
      ? 'Victoria'
      : propios < rivales
        ? 'Derrota'
        : 'Empate'

  if (
    propios === rivales &&
    p.penales_favor != null &&
    p.penales_contra != null
  ) {
    if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
    else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
  }

  return {
    etiqueta,
    texto: `${etiqueta} (${propios}-${rivales})`,
  }
}

function calcularCuentaRegresiva(fecha, hora) {
  if (!fecha) return ''

  const horaFormateada = hora
    ? hora.length === 5
      ? `${hora}:00`
      : hora
    : '00:00:00'

  const fechaHora = new Date(`${fecha}T${horaFormateada}`)
  const diffMs = fechaHora - new Date()

  if (diffMs <= 0) return 'Es hoy'

  const totalHoras = diffMs / 3600000
  const dias = Math.floor(totalHoras / 24)
  const horas = Math.floor(totalHoras % 24)

  if (dias === 0) {
    return horas <= 1
      ? 'Falta menos de 1 hora'
      : `Faltan ${horas} horas`
  }

  if (dias === 1) {
    return horas > 0
      ? `Falta 1 día y ${horas} h`
      : 'Falta 1 día'
  }

  return horas > 0
    ? `Faltan ${dias} días y ${horas} h`
    : `Faltan ${dias} días`
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function fechaLegible(fecha) {
  if (!fecha) return ''

  const d = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(d.getTime())) return fecha

  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Panel({ children, className = '', style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl transition-all duration-200 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#575747]' : ''} ${className}`}
      style={{
        backgroundColor: C.tarjeta,
        border: `1px solid ${C.borde}`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function EtiquetaSeccion({ children, cantidad }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className="text-xs font-bold uppercase tracking-[0.16em]"
        style={{ color: C.secundario }}
      >
        {children}
      </span>
      {cantidad != null && (
        <span
          className="text-xs rounded-full px-2 py-0.5"
          style={{ backgroundColor: C.tarjetaSecundaria, color: C.amarillo }}
        >
          {cantidad}
        </span>
      )}
    </div>
  )
}

function PuntoEstado({ color = C.amarillo }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

function TarjetaIndicador({
  etiqueta,
  valor,
  detalle,
  color = C.amarillo,
  icono,
  onClick,
}) {
  return (
    <Panel onClick={onClick} className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: C.secundario }}
        >
          {etiqueta}
        </p>
        <span
          className="flex items-center justify-center rounded-xl w-9 h-9 text-lg"
          style={{
            backgroundColor: `${color}18`,
            color,
          }}
        >
          {icono}
        </span>
      </div>

      <p
        className="text-3xl font-bold mt-4 tracking-tight"
        style={{ color: C.texto, fontFamily: "'Archivo Black', sans-serif" }}
      >
        {valor}
      </p>

      {detalle && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: C.secundario }}>
          {detalle}
        </p>
      )}
    </Panel>
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
    let cancelado = false

    async function cargar() {
      setCargando(true)

      try {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const hoyISO = fechaISO(hoy)
        const alertasNuevas = []

        const { data: lesionadosData } = await supabase
          .from('jugadores')
          .select('*, categorias(nombre)')
          .eq('estado', 'lesionado')
          .order('apellido')

        if (cancelado) return
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

        if (cancelado) return
        setCumpleanieros(proximosCumples)

        if (perfil.rol !== 'medico') {
          const { data: partidosData } = await supabase
            .from('partidos')
            .select('*, categorias(nombre)')
            .gte('fecha', hoyISO)
            .order('fecha', { ascending: true })

          if (cancelado) return
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

          if (cancelado) return
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
                texto: `${f.jugadores?.apellido}, ${f.jugadores?.nombre} — el alta estimada (${f.fecha_estimada_alta}) ya venció; revisar estado`,
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

          const labels = {
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
                v !== null &&
                v !== undefined &&
                !Number.isNaN(Number(v))
            )

            if (camposValores.length === 0) return

            const promedioDia =
              camposValores.reduce((a, [, v]) => a + Number(v), 0) /
              camposValores.length

            const factoresAltos = camposValores
              .filter(([, v]) => Number(v) >= 4)
              .map(([clave, valor]) => ({
                label: labels[clave],
                valor: Number(valor),
              }))

            if (promedioDia <= 3 && factoresAltos.length === 0) return

            const esAlta =
              promedioDia > 4 ||
              factoresAltos.some((f) => f.valor === 5)

            let texto = `${j.apellido}, ${j.nombre} — Wellness del día: ${promedioDia.toFixed(1)}`

            if (factoresAltos.length > 0) {
              texto += ` (${factoresAltos
                .map((f) => `${f.label} ${f.valor}`)
                .join(', ')})`
            }

            alertasWellness.push({
              id: `wellness-${j.id}`,
              icono: esAlta ? '🔴' : '🟡',
              color: esAlta ? C.rojo : C.amarillo,
              texto,
              seccion: 'fisico',
            })
          })

          if (cancelado) return
          setAlertasWellnessDetalle(alertasWellness)

          const conEstresAlto = Object.values(bienestarPorJugador).filter(
            (b) => Number(b.estres) > 3
          ).length

          if (conEstresAlto >= 10) {
            alertasNuevas.push({
              id: 'estres-plantel',
              icono: '📊',
              color: C.amarillo,
              texto: `${conEstresAlto} jugadoras registraron valores elevados de estrés hoy. Conviene revisar el contexto con el cuerpo técnico.`,
              seccion: 'fisico',
            })
          }
        }

        if (cancelado) return
        setAlertas(alertasNuevas)
      } catch (error) {
        console.error('Error al cargar el inicio:', error)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    cargar()

    return () => {
      cancelado = true
    }
  }, [perfil.rol, perfil.categoria_id])

  const fechaHoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const resultadoUltimo = ultimoPartidoPrincipal
    ? calcularResultado(ultimoPartidoPrincipal)
    : null

  const colorUltimo = resultadoUltimo
    ? resultadoUltimo.etiqueta === 'Victoria'
      ? C.verde
      : resultadoUltimo.etiqueta === 'Derrota'
        ? C.rojo
        : C.amarillo
    : C.secundario

  const totalAlertas = alertas.length + alertasWellnessDetalle.length

  if (cargando) {
    return (
      <div
        className="min-h-full p-6 md:p-10"
        style={{ backgroundColor: C.fondo }}
      >
        <div className="max-w-6xl mx-auto animate-pulse">
          <div
            className="h-8 w-52 rounded-lg mb-3"
            style={{ backgroundColor: C.tarjetaSecundaria }}
          />
          <div
            className="h-4 w-72 rounded-lg mb-10"
            style={{ backgroundColor: C.tarjetaSecundaria }}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-36 rounded-2xl"
                style={{ backgroundColor: C.tarjeta }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-full relative overflow-hidden p-4 sm:p-6 lg:p-10"
      style={{ backgroundColor: C.fondo, color: C.texto }}
    >
      <img
        src={ESCUDO_CLUB_URL}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none fixed"
        style={{
          top: '50%',
          left: '55%',
          transform: 'translate(-50%, -50%)',
          width: 'min(65vw, 700px)',
          opacity: 0.025,
          zIndex: 0,
        }}
      />

      <div className="max-w-6xl mx-auto relative" style={{ zIndex: 1 }}>
        {/* Encabezado */}
        <header
          className="relative overflow-hidden rounded-2xl mb-7 p-5 sm:p-7"
          style={{
            background:
              'linear-gradient(115deg, var(--fondo-secundario) 0%, var(--fondo-tarjeta) 55%, var(--fondo-pagina) 100%)',
            border: `1px solid ${C.borde}`,
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5"
            style={{ backgroundColor: C.amarillo }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 p-2"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: `1px solid ${C.amarillo}`,
                }}
              >
                <img
                  src={ESCUDO_CLUB_URL}
                  alt="Escudo de Comunicaciones"
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <p
                  className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-1"
                  style={{ color: C.amarillo }}
                >
                  Club Comunicaciones
                </p>
                <h1
                  className="text-3xl sm:text-4xl leading-tight"
                  style={{ fontFamily: "'Archivo Black', sans-serif" }}
                >
                  Inicio
                </h1>
                <p className="text-sm mt-1 capitalize" style={{ color: C.secundario }}>
                  {fechaHoy}
                </p>
              </div>
            </div>

            <div
              className="inline-flex items-center gap-2 self-start sm:self-center rounded-full px-3 py-2 text-xs font-medium"
              style={{
                color: C.amarillo,
                backgroundColor: '#F2C23012',
                border: '1px solid #F2C23035',
              }}
            >
              <PuntoEstado />
              Panel de gestión deportiva
            </div>
          </div>
        </header>

        {/* Indicadores principales */}
        <section className="mb-8">
          <EtiquetaSeccion>Resumen del día</EtiquetaSeccion>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {perfil.rol !== 'medico' && (
              <TarjetaIndicador
                etiqueta="Próximo partido"
                valor={proximoPartido ? fechaLegible(proximoPartido.fecha) : '—'}
                detalle={
                  proximoPartido
                    ? `vs ${proximoPartido.rival || 'Rival a confirmar'}`
                    : 'No hay partidos próximos cargados'
                }
                icono="⚽"
                color={C.amarillo}
                onClick={() => onCambiarSeccion('partidos')}
              />
            )}

            <TarjetaIndicador
              etiqueta="Jugadoras lesionadas"
              valor={lesionados.length}
              detalle={
                lesionados.length
                  ? 'Revisar seguimiento del plantel'
                  : 'Sin jugadoras marcadas como lesionadas'
              }
              icono="✚"
              color={lesionados.length ? C.rojo : C.verde}
              onClick={() =>
                onCambiarSeccion(
                  perfil.rol === 'medico' ? 'medicos' : 'plantel'
                )
              }
            />

            {perfil.rol !== 'tecnico' && (
              <TarjetaIndicador
                etiqueta="Alertas de nutrición"
                valor={alertasNutricion.length}
                detalle="Registros que requieren revisión"
                icono="◉"
                color={alertasNutricion.length ? C.rojo : C.verde}
                onClick={() => onCambiarSeccion('nutricion')}
              />
            )}

            <TarjetaIndicador
              etiqueta="Avisos pendientes"
              valor={totalAlertas}
              detalle={
                totalAlertas
                  ? 'Hay avisos para revisar'
                  : 'No hay avisos registrados'
              }
              icono="⚑"
              color={totalAlertas ? C.amarillo : C.verde}
              onClick={() => {
                if (alertas.length) onCambiarSeccion(alertas[0].seccion)
                else if (alertasWellnessDetalle.length)
                  onCambiarSeccion('fisico')
              }}
            />
          </div>
        </section>

        {/* Alertas operativas */}
        {alertas.length > 0 && (
          <section className="mb-8">
            <EtiquetaSeccion cantidad={alertas.length}>
              Alertas y tareas pendientes
            </EtiquetaSeccion>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {alertas.map((a) => (
                <Panel
                  key={a.id}
                  onClick={() => onCambiarSeccion(a.seccion)}
                  className="p-4 flex items-start gap-3"
                  style={{ borderLeft: `3px solid ${a.color}` }}
                >
                  <span
                    className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
                    style={{
                      backgroundColor: `${a.color}18`,
                      color: a.color,
                    }}
                  >
                    {a.icono}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{a.texto}</p>
                    <p
                      className="text-xs mt-2 font-semibold"
                      style={{ color: C.amarillo }}
                    >
                      Ir al módulo →
                    </p>
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        )}

        {/* Wellness */}
        {alertasWellnessDetalle.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <EtiquetaSeccion cantidad={alertasWellnessDetalle.length}>
                Seguimiento de wellness
              </EtiquetaSeccion>

              {alertasWellnessDetalle.length > 3 && (
                <button
                  type="button"
                  onClick={() => setWellnessExpandido((v) => !v)}
                  className="text-xs font-semibold hover:opacity-75"
                  style={{ color: C.amarillo }}
                >
                  {wellnessExpandido ? 'Mostrar menos ↑' : 'Ver todas ↓'}
                </button>
              )}
            </div>

            <Panel className="overflow-hidden">
              <div
                className="flex items-center justify-between gap-3 p-4"
                style={{ borderBottom: `1px solid ${C.borde}` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: '#F2C23015',
                      color: C.amarillo,
                    }}
                  >
                    ◉
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Registros para revisar</p>
                    <p className="text-xs mt-1" style={{ color: C.secundario }}>
                      Datos reportados hoy; requieren interpretación contextual.
                    </p>
                  </div>
                </div>
                <span
                  className="text-xl font-bold"
                  style={{ color: C.amarillo }}
                >
                  {alertasWellnessDetalle.length}
                </span>
              </div>

              <div className="p-3 space-y-2">
                {alertasWellnessDetalle
                  .slice(
                    0,
                    wellnessExpandido ? alertasWellnessDetalle.length : 3
                  )
                  .map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => onCambiarSeccion(a.seccion)}
                      className="w-full flex items-start gap-3 text-left rounded-xl p-3 hover:brightness-110"
                      style={{ backgroundColor: C.tarjetaSecundaria }}
                    >
                      <PuntoEstado color={a.color} />
                      <span className="text-sm leading-relaxed flex-1">
                        {a.texto}
                      </span>
                      <span style={{ color: C.secundario }}>→</span>
                    </button>
                  ))}
              </div>
            </Panel>
          </section>
        )}

        {/* Partidos */}
        {perfil.rol !== 'medico' && (
          <section className="mb-8">
            <EtiquetaSeccion>Información deportiva</EtiquetaSeccion>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel
                onClick={() => onCambiarSeccion('partidos')}
                className="p-5"
                style={{
                  background:
                    'linear-gradient(135deg, var(--fondo-secundario) 0%, var(--fondo-tarjeta) 80%)',
                  borderTop: `3px solid ${C.amarillo}`,
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.secundario }}>
                      Próximo compromiso
                    </p>
                    <p className="text-lg font-bold mt-1">Agenda de partidos</p>
                  </div>
                  <span className="text-2xl">⚽</span>
                </div>

                {proximoPartido ? (
                  <div className="flex items-center gap-4">
                    {proximoPartido.escudo_url ? (
                      <img
                        src={proximoPartido.escudo_url}
                        alt={`Escudo de ${proximoPartido.rival || 'rival'}`}
                        className="w-14 h-14 rounded-xl object-contain p-1"
                        style={{ backgroundColor: '#FFFFFF' }}
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
                        style={{
                          backgroundColor: C.tarjetaSecundaria,
                          color: C.secundario,
                        }}
                      >
                        🛡️
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold">
                        vs {proximoPartido.rival || 'Rival a confirmar'}
                      </p>
                      <p className="text-sm mt-1" style={{ color: C.secundario }}>
                        {fechaLegible(proximoPartido.fecha)}
                        {proximoPartido.hora && ` · ${proximoPartido.hora}`}
                      </p>
                      <p className="text-xs mt-2 font-semibold" style={{ color: C.amarillo }}>
                        {calcularCuentaRegresiva(
                          proximoPartido.fecha,
                          proximoPartido.hora
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm py-3" style={{ color: C.secundario }}>
                    No hay partidos próximos cargados.
                  </p>
                )}

                <p className="text-xs mt-5 font-semibold" style={{ color: C.amarillo }}>
                  Abrir partidos →
                </p>
              </Panel>

              <Panel
                onClick={() => onCambiarSeccion('partidos')}
                className="p-5"
                style={{ borderTop: `3px solid ${colorUltimo}` }}
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.secundario }}>
                      Último encuentro cargado
                    </p>
                    <p className="text-lg font-bold mt-1">Resultado reciente</p>
                  </div>
                  <span className="text-2xl">◷</span>
                </div>

                {ultimoPartidoPrincipal ? (
                  <>
                    <div className="flex items-center gap-3">
                      {ultimoPartidoPrincipal.escudo_url ? (
                        <img
                          src={ultimoPartidoPrincipal.escudo_url}
                          alt={`Escudo de ${ultimoPartidoPrincipal.rival || 'rival'}`}
                          className="w-12 h-12 rounded-xl object-contain p-1"
                          style={{ backgroundColor: '#FFFFFF' }}
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                          style={{
                            backgroundColor: C.tarjetaSecundaria,
                            color: C.secundario,
                          }}
                        >
                          🛡️
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">
                          vs {ultimoPartidoPrincipal.rival || 'Rival'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: C.secundario }}>
                          {fechaLegible(ultimoPartidoPrincipal.fecha)}
                        </p>
                      </div>

                      {resultadoUltimo && (
                        <span
                          className="text-xs font-bold rounded-lg px-3 py-2 text-center"
                          style={{
                            color: colorUltimo,
                            backgroundColor: `${colorUltimo}15`,
                            border: `1px solid ${colorUltimo}45`,
                          }}
                        >
                          {resultadoUltimo.texto}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm py-3" style={{ color: C.secundario }}>
                    Todavía no hay resultados cargados.
                  </p>
                )}

                <p className="text-xs mt-5 font-semibold" style={{ color: C.amarillo }}>
                  Consultar partidos →
                </p>
              </Panel>
            </div>
          </section>
        )}

        {/* Estadísticas */}
        {perfil.rol !== 'medico' && (
          <section className="mb-8">
            <EtiquetaSeccion>Resultados registrados</EtiquetaSeccion>

            <Panel className="p-5">
              {estadisticasRapidas ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                      <p className="text-lg font-bold">Balance de partidos</p>
                      <p className="text-xs mt-1" style={{ color: C.secundario }}>
                        Resumen de los partidos con resultado cargado.
                      </p>
                    </div>
                    <div
                      className="rounded-xl px-4 py-3"
                      style={{ backgroundColor: C.tarjetaSecundaria }}
                    >
                      <span className="text-xs" style={{ color: C.secundario }}>
                        Partidos jugados
                      </span>
                      <span className="text-2xl font-bold ml-3">
                        {estadisticasRapidas.pj}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Victorias', valor: estadisticasRapidas.pg, color: C.verde },
                      { label: 'Empates', valor: estadisticasRapidas.pe, color: C.amarillo },
                      { label: 'Derrotas', valor: estadisticasRapidas.pp, color: C.rojo },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl p-3 sm:p-4"
                        style={{
                          backgroundColor: C.tarjetaSecundaria,
                          border: `1px solid ${C.borde}`,
                        }}
                      >
                        <p className="text-xs" style={{ color: C.secundario }}>
                          {item.label}
                        </p>
                        <p
                          className="text-2xl sm:text-3xl font-bold mt-2"
                          style={{ color: item.color }}
                        >
                          {item.valor}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-5">
                      <div>
                        <p className="text-xs" style={{ color: C.secundario }}>
                          Goles a favor
                        </p>
                        <p className="text-lg font-bold mt-1">
                          {estadisticasRapidas.gf}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: C.secundario }}>
                          Goles en contra
                        </p>
                        <p className="text-lg font-bold mt-1">
                          {estadisticasRapidas.gc}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: C.secundario }}>
                          Diferencia
                        </p>
                        <p
                          className="text-lg font-bold mt-1"
                          style={{
                            color:
                              estadisticasRapidas.gf - estadisticasRapidas.gc >= 0
                                ? C.verde
                                : C.rojo,
                          }}
                        >
                          {estadisticasRapidas.gf - estadisticasRapidas.gc > 0
                            ? '+'
                            : ''}
                          {estadisticasRapidas.gf - estadisticasRapidas.gc}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onCambiarSeccion('partidos')}
                      className="text-xs font-bold hover:opacity-75"
                      style={{ color: C.amarillo }}
                    >
                      Ver detalle →
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm py-2" style={{ color: C.secundario }}>
                  Todavía no hay partidos con resultado cargado.
                </p>
              )}
            </Panel>
          </section>
        )}

        {/* Plantel y nutrición */}
        <section className="mb-8">
          <EtiquetaSeccion>Seguimiento del plantel</EtiquetaSeccion>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel
              onClick={() =>
                onCambiarSeccion(
                  perfil.rol === 'medico' ? 'medicos' : 'plantel'
                )
              }
              className="p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-lg font-bold">Jugadoras lesionadas</p>
                  <p className="text-xs mt-1" style={{ color: C.secundario }}>
                    Estado registrado en el plantel
                  </p>
                </div>
                <span
                  className="rounded-xl px-3 py-2 text-lg font-bold"
                  style={{
                    color: lesionados.length ? C.rojo : C.verde,
                    backgroundColor: `${lesionados.length ? C.rojo : C.verde}15`,
                  }}
                >
                  {lesionados.length}
                </span>
              </div>

              {lesionados.length === 0 ? (
                <p className="text-sm py-2" style={{ color: C.secundario }}>
                  No hay jugadores marcados como lesionados.
                </p>
              ) : (
                <div className="space-y-2">
                  {lesionados.slice(0, 5).map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center gap-3 rounded-xl p-2.5"
                      style={{ backgroundColor: C.tarjetaSecundaria }}
                    >
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: '#3A2B27',
                          color: '#F0A097',
                        }}
                      >
                        {iniciales(j.nombre, j.apellido)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {j.apellido}, {j.nombre}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: C.secundario }}>
                          {j.categorias?.nombre || 'Categoría sin especificar'}
                        </p>
                      </div>
                      <PuntoEstado color={C.rojo} />
                    </div>
                  ))}

                  {lesionados.length > 5 && (
                    <p className="text-xs pt-1" style={{ color: C.secundario }}>
                      +{lesionados.length - 5} jugadoras más
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs mt-4 font-semibold" style={{ color: C.amarillo }}>
                Abrir seguimiento →
              </p>
            </Panel>

            {perfil.rol !== 'tecnico' && (
              <Panel
                onClick={() => onCambiarSeccion('nutricion')}
                className="p-5"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-lg font-bold">Alertas de nutrición</p>
                    <p className="text-xs mt-1" style={{ color: C.secundario }}>
                      Registros marcados para seguimiento
                    </p>
                  </div>
                  <span
                    className="rounded-xl px-3 py-2 text-lg font-bold"
                    style={{
                      color: alertasNutricion.length ? C.rojo : C.verde,
                      backgroundColor: `${alertasNutricion.length ? C.rojo : C.verde}15`,
                    }}
                  >
                    {alertasNutricion.length}
                  </span>
                </div>

                {alertasNutricion.length === 0 ? (
                  <p className="text-sm py-2" style={{ color: C.secundario }}>
                    No hay alertas de peso registradas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {alertasNutricion.slice(0, 5).map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 rounded-xl p-2.5"
                        style={{ backgroundColor: C.tarjetaSecundaria }}
                      >
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            backgroundColor: '#3A2B27',
                            color: '#F0A097',
                          }}
                        >
                          {iniciales(
                            f.jugadores?.nombre,
                            f.jugadores?.apellido
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {f.jugadores?.apellido}, {f.jugadores?.nombre}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: C.secundario }}>
                            {f.jugadores?.categorias?.nombre || 'Categoría sin especificar'}
                          </p>
                        </div>
                        <PuntoEstado color={C.rojo} />
                      </div>
                    ))}

                    {alertasNutricion.length > 5 && (
                      <p className="text-xs pt-1" style={{ color: C.secundario }}>
                        +{alertasNutricion.length - 5} registros más
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs mt-4 font-semibold" style={{ color: C.amarillo }}>
                  Abrir nutrición →
                </p>
              </Panel>
            )}
          </div>
        </section>

        {/* Cumpleaños */}
        {cumpleanieros.length > 0 && (
          <section className="mb-8">
            <EtiquetaSeccion cantidad={cumpleanieros.length}>
              Próximos cumpleaños
            </EtiquetaSeccion>

            <Panel className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{
                    backgroundColor: '#F2C23015',
                    color: C.amarillo,
                  }}
                >
                  🎂
                </span>
                <div>
                  <p className="font-bold">Cumpleaños de la semana</p>
                  <p className="text-xs mt-1" style={{ color: C.secundario }}>
                    Próximos seis días
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {cumpleanieros.map((j) => (
                  <div
                    key={j.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      backgroundColor: C.tarjetaSecundaria,
                      border: `1px solid ${C.borde}`,
                    }}
                  >
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: '#393523',
                        color: C.amarillo,
                      }}
                    >
                      {iniciales(j.nombre, j.apellido)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {j.apellido}, {j.nombre}
                      </p>
                      <p className="text-xs mt-1 truncate" style={{ color: C.secundario }}>
                        {j.categorias?.nombre || 'Categoría sin especificar'}
                      </p>
                    </div>

                    <span
                      className="text-[10px] font-bold rounded-full px-2 py-1 shrink-0"
                      style={{
                        backgroundColor: '#F2C23018',
                        color: C.amarillo,
                      }}
                    >
                      {j.diasFaltan === 0
                        ? 'HOY'
                        : j.diasFaltan === 1
                          ? 'MAÑANA'
                          : `${j.diasFaltan} DÍAS`}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {/* Pie */}
        <footer
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-5"
          style={{ borderTop: `1px solid ${C.borde}` }}
        >
          <div className="flex items-center gap-2">
            <img
              src={ESCUDO_CLUB_URL}
              alt=""
              className="w-6 h-6 object-contain"
            />
            <p className="text-xs" style={{ color: C.secundario }}>
              Club Comunicaciones · Gestión deportiva
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: C.secundario }}>
            Panel interno
          </p>
        </footer>
      </div>
    </div>
  )
}

export default InicioSection
