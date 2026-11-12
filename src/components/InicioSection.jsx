import './inicio.css'
import './inicio/inicioPremium.css'
import IconoNavegacion from './IconoNavegacion'
import { fechaArgentina, puedePlanificar } from '../utils/planificacion'
import AgendaDiariaInicio from './inicio/AgendaDiariaInicio'
import WellnessInicio from './inicio/WellnessInicio'
import { filtrarSeccionesVisibles } from '../config/visibilidadSecciones'

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { obtenerJugadoresDeCategoria } from '../utils/jugadoresCategoria'
import { obtenerCategoriaPrimeraDivision } from '../utils/categoriaPrimera'
import { calcularSemaforoGrupo, SEMAFORO_INFO } from '../utils/semaforoRiesgo'
import { agruparProximoPartido, diasHastaProximoCumple, iniciales } from '../utils/inicioDatos'
import TablaDataFem from './TablaDataFem'
import { PALETA_INICIO as C } from '../appearance/paletaInicio'
import FranjaNumeros from './ui/FranjaNumeros'
import EstadoVacio from './ui/EstadoVacio'
import './ui/panelDeportivo.css'
import { ESCUDO_URL } from '../config/club'
import { fechaCorta, fechaHora, fechaLarga } from '../utils/formatoFecha'

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
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


const LETRA_RESULTADO = { Victoria: 'V', Empate: 'E', Derrota: 'D' }
const NIVEL_RESULTADO = { Victoria: 'victoria', Empate: 'empate', Derrota: 'derrota' }

// Cuenta regresiva solo de presentación: usa la fecha y hora ya leídas del partido (hora de Argentina).
function ProximoPartido({ partido, cargando, onAbrir }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 60000)
    return () => clearInterval(intervalo)
  }, [])

  if (cargando) return <div className="inicio-proximo"><p className="dp-eyebrow">Próximo partido</p><p className="inicio-secundario">Consultando…</p></div>
  if (!partido) return <div className="inicio-proximo"><p className="dp-eyebrow">Próximo partido</p><p className="inicio-secundario">Sin partidos programados.</p></div>

  const hora = partido.hora?.slice(0, 5)
  const inicio = new Date(`${partido.fecha}T${hora || '00:00'}:00-03:00`).getTime()
  const falta = Math.max(0, inicio - ahora)
  const dias = Math.floor(falta / 864e5)
  const horas = Math.floor((falta % 864e5) / 36e5)
  const minutos = Math.floor((falta % 36e5) / 6e4)
  const partes = !Number.isFinite(falta) ? []
    : hora ? [[dias, 'd'], [horas, 'h'], [minutos, 'm']].filter(([v], i) => v > 0 || i > 0 || dias > 0)
      : [[dias, dias === 1 ? 'día' : 'días']]

  return <button type="button" className="inicio-proximo" onClick={onAbrir}>
    <p className="dp-eyebrow">Próximo partido · <b>{fechaHora(partido.fecha, partido.hora)}</b></p>
    <span className="inicio-proximo-rival">
      {partido.escudo_url && <img src={partido.escudo_url} alt="" />}
      <strong>vs {partido.rival}</strong>
    </span>
    {falta > 0 && partes.length > 0
      ? <span className="inicio-cuenta" aria-label={'Faltan ' + partes.map(([v, u]) => v + ' ' + u).join(' ')}>
        {partes.map(([v, u]) => <span key={u}><b>{String(v).padStart(hora && u !== 'd' ? 2 : 1, '0')}</b>{u}</span>)}
      </span>
      : <span className="inicio-cuenta"><span><b>Hoy</b></span></span>}
    <small>{[partido.local_visitante, partido.lugar, partido.categoriasNombres?.join(', ')].filter(Boolean).join(' · ')}</small>
  </button>
}

function InicioSection({ perfil, onCambiarSeccion, onAbrirCalendario, onVerBienestar, onVerPlanificacion }) {
  const [lesionados, setLesionados] = useState([])
  const [proximoPartido, setProximoPartido] = useState(null)
  const [ultimoPartidoPrincipal, setUltimoPartidoPrincipal] = useState(null)
  const [ultimos, setUltimos] = useState([])
  const [resumenTabla, setResumenTabla] = useState(null)
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
          setUltimos(pasados.slice(0, 5))

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
                    color: 'var(--ui-alerta)',
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
                texto: `${f.jugadores?.apellido}, ${f.jugadores?.nombre} — el alta estimada (${fechaCorta(f.fecha_estimada_alta)}) ya venció, revisar estado`,
                seccion: 'medicos',
              })
            })
        }

        // Alerta de semáforo de riesgo (Wellness + sRPE/ACWR + CMJ) — solo Primera División.
        // Restaurada como estaba antes del commit 2a21a2d: cálculo en paralelo y resumen si son más de 3.
        const categoriaPrimera = await obtenerCategoriaPrimeraDivision()
        if (!activo) return
        const debeCalcularSemaforo =
          categoriaPrimera &&
          (perfil.rol === 'coordinacion' ||
            perfil.rol === 'preparador_fisico' ||
            (perfil.rol === 'tecnico' && perfil.categoria_id === categoriaPrimera.id))

        if (debeCalcularSemaforo) {
          const { data: categoriasData } = await supabase.from('categorias').select('id, es_reserva')
          const { data: jugadoresPrimera } = await obtenerJugadoresDeCategoria(
            supabase,
            categoriaPrimera.id,
            categoriasData
          )

          // Mismo cálculo que por jugadora, con pocas consultas para todo el plantel.
          const resultadosSemaforo = await calcularSemaforoGrupo(jugadoresPrimera || [], categoriaPrimera.id)
          if (!activo) return
          const alertasSemaforo = []
          ;(jugadoresPrimera || []).forEach((j) => {
            const resultado = resultadosSemaforo[j.id]
            if (resultado.semaforo === 'rojo' || resultado.semaforo === 'amarillo') {
              const info = SEMAFORO_INFO[resultado.semaforo]
              alertasSemaforo.push({
                id: `semaforo-${j.id}`,
                icono: resultado.semaforo === 'rojo' ? '🔴' : '🟡',
                color: resultado.semaforo === 'rojo' ? C.rojo : C.amarillo,
                nivel: resultado.semaforo,
                titulo: `${j.apellido}, ${j.nombre}`,
                motivo: `Semáforo ${info.label} · ${resultado.puntos}/6`,
                texto: `${j.apellido}, ${j.nombre} — Semáforo ${info.label} (${resultado.puntos}/6)`,
                seccion: 'fisico',
              })
            }
          })

          if (alertasSemaforo.length > 3) {
            alertasNuevas.push({
              id: 'semaforo-resumen',
              icono: '⚠️',
              color: C.amarillo,
              nivel: alertasSemaforo.some(a => a.nivel === 'rojo') ? 'rojo' : 'amarillo',
              texto: `${alertasSemaforo.length} jugadoras requieren atención (semáforo) — ver en Físico`,
              seccion: 'fisico',
            })
          } else {
            alertasNuevas.push(...alertasSemaforo)
          }
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

  const hoy = fechaArgentina()
  const esMedico = perfil.rol === 'medico'

  const abrirCalendario = (fecha, categoriaId) => onAbrirCalendario
    ? onAbrirCalendario(fecha, categoriaId) : onCambiarSeccion('calendario')

  // Requieren atención: lesionadas y avisos que Inicio ya leyó, en rojo o amarillo según la urgencia.
  const atencion = [
    ...lesionados.map(j => ({ id: 'lesionada-' + j.id, nivel: 'rojo', titulo: `${j.apellido}, ${j.nombre}`,
      motivo: 'Lesionada' + (j.categorias?.nombre ? ' · ' + j.categorias.nombre : ''), seccion: esMedico ? 'medicos' : 'plantel' })),
    ...alertas.map(a => ({ id: a.id, nivel: a.nivel || (a.seccion === 'medicos' ? 'rojo' : 'amarillo'), titulo: a.titulo || a.texto, motivo: a.motivo || null, seccion: a.seccion })),
  ].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'rojo' ? -1 : 1))

  const ultimosResultados = [...ultimos].reverse().map(p => ({ id: p.id, resultado: calcularResultado(p) })).filter(p => p.resultado)
  const datosNoDisponibles = cargando || errorDeportivo

  return (
    <div className="inicio-dashboard">
      <div className="inicio-contenido">
        <header className="inicio-cabecera">
          <img className="inicio-portada-foto" src="/images/fotos-comunicaciones/inicio-equipo-cuerpo-tecnico-original.jpeg" alt="Plantel femenino y cuerpo técnico de Comunicaciones reunidos en círculo" width="1280" height="959" decoding="async" />
          <div className="inicio-marca">
            <img className="inicio-marca-escudo" src={ESCUDO_URL} alt="Escudo Club Comunicaciones" />
            <div>
              <p className="dp-eyebrow">Fútbol femenino · <b>{fechaLarga(hoy)}</b></p>
              <h1 className="dp-titulo">Club<br /><em>Comunicaciones</em></h1>
            </div>
          </div>
          {!esMedico && <ProximoPartido partido={proximoPartido} cargando={cargando} onAbrir={() => onCambiarSeccion('partidos')} />}
        </header>

        <FranjaNumeros etiqueta="Resumen del club" items={[
          { etiqueta: resumenTabla?.zona ? 'Posición · ' + resumenTabla.zona : 'Posición', valor: resumenTabla ? Number(resumenTabla.posicion) : null, unidad: resumenTabla ? '°' : undefined },
          { etiqueta: 'Puntos', valor: resumenTabla ? Number(resumenTabla.puntos) : null },
          { etiqueta: 'Partidos jugados', valor: resumenTabla?.partidos != null ? Number(resumenTabla.partidos) : datosNoDisponibles ? null : estadisticasRapidas?.pj ?? 0 },
          { etiqueta: 'Lesionadas', valor: cargando || errorPlantel ? null : lesionados.length },
        ]} />
        {errorDeportivo && <p role="alert">{errorDeportivo}</p>}

        <div className="inicio-tres">
          <WellnessInicio key={'wellness-' + [perfil.id, perfil.rol, perfil.categoria_id].join(':')} perfil={perfil} onCambiarSeccion={onCambiarSeccion} onVerBienestar={onVerBienestar} />

          <section className="inicio-bloque inicio-atencion" aria-labelledby="inicio-atencion-titulo">
            <div className="inicio-titulo"><div><p className="dp-eyebrow">Semáforo · <b>{atencion.length}</b></p><h2 id="inicio-atencion-titulo">Requieren atención</h2></div></div>
            {errorPlantel && <p role="alert">{errorPlantel}</p>}
            {cargando ? <EstadoVacio cargando mensaje="Consultando el plantel…" />
              : atencion.length === 0 ? <EstadoVacio mensaje="Nada pendiente." detalle="Sin lesionadas ni avisos abiertos." />
                : <ul className="inicio-atencion-lista">{atencion.map(item => <li key={item.id}>
                  <button type="button" data-nivel={item.nivel} onClick={() => onCambiarSeccion(item.seccion)}>
                    <span className="inicio-semaforo" aria-hidden="true" />
                    <span><strong>{item.titulo}</strong>{item.motivo && <small>{item.motivo}</small>}</span>
                    <span className="sr-only">{item.nivel === 'rojo' ? 'Prioridad alta' : 'Revisar'}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>)}</ul>}
          </section>

          <section className="inicio-bloque inicio-ultimos" aria-labelledby="inicio-ultimos-titulo">
            {!esMedico && <>
              <div className="inicio-titulo"><div><p className="dp-eyebrow">Racha · <b>Todas las categorías</b></p><h2 id="inicio-ultimos-titulo">Últimos 5</h2></div>
                <button type="button" onClick={() => onCambiarSeccion('partidos')}>Partidos →</button></div>
              {cargando ? <EstadoVacio cargando mensaje="Consultando resultados…" />
                : !errorDeportivo && (ultimosResultados.length === 0
                  ? <EstadoVacio mensaje="Sin resultados cargados." />
                  : <>
                    <ol className="inicio-racha" aria-label="Últimos resultados, del más viejo al más reciente">
                      {ultimosResultados.map(({ id, resultado }) => <li key={id} data-resultado={NIVEL_RESULTADO[resultado.etiqueta]} title={resultado.texto}>
                        <span aria-hidden="true">{LETRA_RESULTADO[resultado.etiqueta]}</span><span className="sr-only">{resultado.texto}</span>
                      </li>)}
                    </ol>
                    {ultimoPartidoPrincipal && resultadoUltimo && <div className="inicio-ultimo" data-resultado={NIVEL_RESULTADO[resultadoUltimo.etiqueta]}>
                      {ultimoPartidoPrincipal.escudo_url && <img src={ultimoPartidoPrincipal.escudo_url} alt={'Escudo de ' + ultimoPartidoPrincipal.rival} />}
                      <span><small>Último · {fechaCorta(ultimoPartidoPrincipal.fecha)}{ultimoPartidoPrincipal.categorias?.nombre ? ' · ' + ultimoPartidoPrincipal.categorias.nombre : ''}</small>
                        <strong>{ultimoPartidoPrincipal.rival || 'Rival'}</strong></span>
                      <b>{resultadoUltimo.texto.replace(/^\S+ \((.*)\)$/, '$1')}</b>
                      {ultimoPartidoPrincipal.penales_favor != null && ultimoPartidoPrincipal.penales_contra != null && <small>Penales {ultimoPartidoPrincipal.penales_favor}-{ultimoPartidoPrincipal.penales_contra}</small>}
                    </div>}
                  </>)}
            </>}
            <div className="inicio-cumples">
              {esMedico ? <h2 id="inicio-ultimos-titulo">Cumpleaños</h2> : <p className="dp-eyebrow">Cumpleaños · <b>Esta semana</b></p>}
              {cumpleanieros.length === 0 ? <p className="inicio-vacio">Ninguno esta semana.</p>
                : <ul>{cumpleanieros.map(j => <li key={j.id}><span className="inicio-avatar" aria-hidden="true">{iniciales(j.nombre, j.apellido)}</span>
                  <span>{j.apellido}, {j.nombre}<small>{j.categorias?.nombre || 'Sin categoría'}</small></span>
                  <b>{j.diasFaltan === 0 ? '¡Hoy!' : j.diasFaltan === 1 ? 'Mañana' : 'En ' + j.diasFaltan + ' días'}</b></li>)}</ul>}
            </div>
          </section>
        </div>

        {!esMedico && <div className="inicio-agenda-fila">
          <AgendaDiariaInicio key={'agenda-' + [perfil.id, perfil.rol, perfil.categoria_id].join(':')}
            perfil={perfil} partidos={partidosAgenda} proximoPartido={proximoPartido} cargandoPartidos={cargando}
            errorPartidos={errorPartidosAgenda} abrirCalendario={abrirCalendario} onVerPlanificacion={onVerPlanificacion} />
        </div>}

        <TablaDataFem compacto onResumen={setResumenTabla} />

        <nav className="inicio-accesos" aria-label="Accesos rápidos">
          {filtrarSeccionesVisibles((esMedico
            ? [{ id: 'medicos', label: 'Médicos' }, { id: 'bienestar', label: 'Bienestar' }]
            : ['coordinacion', 'tecnico', 'preparador_fisico'].includes(perfil.rol)
              ? [{ id: 'plantel', label: 'Plantel y Rendimiento' }, { id: 'partidos', label: 'Partidos' }, { id: 'calendario', label: 'Calendario' },
                { id: 'fisico', label: 'Wellness' }, { id: 'entrenamientos', label: 'Entrenamientos' },
                ...(puedePlanificar(perfil) ? [{ id: 'planificacion', label: 'Planificación' }] : [])] : []), 'id')
            .map(a => <button type="button" key={a.id} onClick={() => onCambiarSeccion(a.id)}><IconoNavegacion nombre={a.id} />{a.label}</button>)}
        </nav>
      </div>
    </div>
  )
}

export default InicioSection
