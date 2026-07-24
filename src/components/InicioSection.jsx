import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

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
  let proximo = new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate())
  if (proximo < hoy) {
    proximo = new Date(hoy.getFullYear() + 1, nacimiento.getMonth(), nacimiento.getDate())
  }
  return Math.round((proximo - hoy) / (1000 * 60 * 60 * 24))
}

function agruparProximoPartido(partidos) {
  if (!partidos || partidos.length === 0) return null
  const primeraFecha = partidos[0].fecha
  const delMismoDia = partidos.filter((p) => p.fecha === primeraFecha)
  const rivalPrincipal = delMismoDia[0].rival
  const delMismoPartido = delMismoDia.filter(
    (p) => (p.rival || '').toLowerCase().trim() === (rivalPrincipal || '').toLowerCase().trim()
  )
  return {
    ...delMismoPartido[0],
    categoriasNombres: delMismoPartido.map((p) => p.categorias?.nombre).filter(Boolean),
  }
}

function calcularResultado(p) {
  if (p.goles_local == null || p.goles_visitante == null) return null
  const golesPropios = p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
  const golesRivales = p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante

  let etiqueta
  if (golesPropios > golesRivales) etiqueta = 'Victoria'
  else if (golesPropios < golesRivales) etiqueta = 'Derrota'
  else etiqueta = 'Empate'

  if (golesPropios === golesRivales && p.penales_favor != null && p.penales_contra != null) {
    if (p.penales_favor > p.penales_contra) etiqueta = 'Victoria'
    else if (p.penales_favor < p.penales_contra) etiqueta = 'Derrota'
  }

  return { etiqueta, texto: `${etiqueta} (${golesPropios}-${golesRivales})` }
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

function InicioSection({ perfil, onCambiarSeccion }) {
  const [lesionados, setLesionados] = useState([])
  const [proximoPartido, setProximoPartido] = useState(null)
  const [ultimoPartidoPrincipal, setUltimoPartidoPrincipal] = useState(null)
  const [estadisticasRapidas, setEstadisticasRapidas] = useState(null)
  const [alertasNutricion, setAlertasNutricion] = useState([])
  const [ultimosVideos, setUltimosVideos] = useState([])
  const [cumpleanieros, setCumpleanieros] = useState([])
  const [alertas, setAlertas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)

      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const hoyISO = fechaISO(hoy)

      const { data: lesionadosData } = await supabase
        .from('jugadores')
        .select('*, categorias(nombre)')
        .eq('estado', 'lesionado')
        .order('apellido')
      setLesionados(lesionadosData || [])

      const { data: jugadoresData } = await supabase
        .from('jugadores')
        .select('id, nombre, apellido, fecha_nacimiento, categorias(nombre)')
        .not('fecha_nacimiento', 'is', null)
      const proximosCumples = (jugadoresData || [])
        .map((j) => ({ ...j, diasFaltan: diasHastaProximoCumple(j.fecha_nacimiento) }))
        .filter((j) => j.diasFaltan !== null && j.diasFaltan <= 6)
        .sort((a, b) => a.diasFaltan - b.diasFaltan)
      setCumpleanieros(proximosCumples)

      const alertasNuevas = []

      if (perfil.rol !== 'medico') {
        const { data: partidosData } = await supabase
          .from('partidos')
          .select('*, categorias(nombre)')
          .gte('fecha', hoyISO)
          .order('fecha', { ascending: true })
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

        let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0
        pasados.forEach((p) => {
          const propios = p.local_visitante === 'visitante' ? p.goles_visitante : p.goles_local
          const rivales = p.local_visitante === 'visitante' ? p.goles_local : p.goles_visitante
          pj++
          gf += propios
          gc += rivales
          if (propios > rivales) pg++
          else if (propios < rivales) pp++
          else pe++
        })
        setEstadisticasRapidas(pj > 0 ? { pj, pg, pe, pp, gf, gc } : null)

        const { data: videosData } = await supabase
          .from('videos')
          .select('*, categorias(nombre), jugadores(nombre, apellido)')
          .order('fecha', { ascending: false })
          .limit(5)
        setUltimosVideos(videosData || [])

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
            const idsConCitacion = new Set((citacionesExistentes || []).map((c) => c.partido_id))
            partidosEn2Dias
              .filter((p) => !idsConCitacion.has(p.id))
              .forEach((p) => {
                alertasNuevas.push({
                  id: `citacion-${p.id}`,
                  icono: '📋',
                  color: '#FBBF24',
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
            const idsConSesion = new Set((sesionesExistentes || []).map((s) => s.partido_id))
            partidosAyer
              .filter((p) => !idsConSesion.has(p.id))
              .forEach((p) => {
                alertasNuevas.push({
                  id: `minutos-${p.id}`,
                  icono: '⏱️',
                  color: '#FB923C',
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
              color: '#F87171',
              texto: `${f.jugadores?.apellido}, ${f.jugadores?.nombre} — el alta estimada (${f.fecha_estimada_alta}) ya venció, revisar estado`,
              seccion: 'medicos',
            })
          })
      }

      setAlertas(alertasNuevas)
      setCargando(false)
    }
    cargar()
  }, [perfil.rol, perfil.categoria_id])

  if (cargando) {
    return (
      <div className="p-6 md:p-10">
        <p style={{ color: '#5B6B85' }}>Cargando...</p>
      </div>
    )
  }

  const resultadoUltimo = ultimoPartidoPrincipal ? calcularResultado(ultimoPartidoPrincipal) : null
  const colorUltimo = resultadoUltimo
    ? resultadoUltimo.etiqueta === 'Victoria'
      ? '#4ADE80'
      : resultadoUltimo.etiqueta === 'Derrota'
      ? '#F87171'
      : '#FBBF24'
    : null

  return (
    <div className="p-6 md:p-10 relative overflow-hidden">
      {/* Escudo grande de fondo, semi-transparente */}
      <img
        src={ESCUDO_CLUB_URL}
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{
          position: 'fixed',
          right: '-8%',
          bottom: '-8%',
          width: '55vw',
          maxWidth: 560,
          minWidth: 260,
          opacity: 0.06,
          zIndex: 0,
        }}
      />

      <div className="max-w-2xl mx-auto relative" style={{ zIndex: 1 }}>
        <h1
          className="text-3xl md:text-4xl mb-8"
          style={{ fontFamily: "'Archivo Black', sans-serif", color: '#F0F2F5' }}
        >
          Inicio
        </h1>

        {alertas.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
              🔔 Alertas
            </p>
            {alertas.map((a) => (
              <div
                key={a.id}
                onClick={() => onCambiarSeccion(a.seccion)}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
                style={{ backgroundColor: '#1A2332', border: `1px solid ${a.color}` }}
              >
                <span className="text-lg shrink-0">{a.icono}</span>
                <p className="text-sm" style={{ color: '#F0F2F5' }}>{a.texto}</p>
              </div>
            ))}
          </div>
        )}

        {cumpleanieros.length > 0 && (
          <div className="mb-6">
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
              🎂 Cumpleaños de la semana
            </p>
            <div className="flex flex-wrap gap-2">
              {cumpleanieros.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: '#0F1419', color: '#FBBF24' }}
                  >
                    {iniciales(j.nombre, j.apellido)}
                  </span>
                  <p className="text-sm" style={{ color: '#F0F2F5' }}>
                    {j.apellido}, {j.nombre}
                    <span style={{ color: '#5B6B85' }}> · {j.categorias?.nombre}</span>
                  </p>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: '#0F1419', color: '#FBBF24' }}
                  >
                    {j.diasFaltan === 0 ? '¡Hoy!' : j.diasFaltan === 1 ? 'Mañana' : `en ${j.diasFaltan} días`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {perfil.rol !== 'medico' && (
            <div
              onClick={() => onCambiarSeccion('partidos')}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
                Próximo partido
              </p>
              {proximoPartido ? (
                <div className="flex items-center gap-2.5">
                  {proximoPartido.escudo_url ? (
                    <img
                      src={proximoPartido.escudo_url}
                      alt={proximoPartido.rival}
                      className="w-9 h-9 rounded object-contain shrink-0"
                      style={{ backgroundColor: '#0F1419' }}
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
                    >
                      🛡️
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                      vs {proximoPartido.rival}
                    </p>
                    <p className="text-xs" style={{ color: '#8A9BB8' }}>
                      {proximoPartido.fecha} {proximoPartido.hora && `· ${proximoPartido.hora}`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#5B6B85' }}>No hay partidos próximos cargados.</p>
              )}
            </div>
          )}

          {perfil.rol !== 'medico' && (
            <div
              onClick={() => onCambiarSeccion('partidos')}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
                Último resultado
              </p>
              {ultimoPartidoPrincipal ? (
                <div className="flex items-center gap-2.5">
                  {ultimoPartidoPrincipal.escudo_url ? (
                    <img
                      src={ultimoPartidoPrincipal.escudo_url}
                      alt={ultimoPartidoPrincipal.rival}
                      className="w-9 h-9 rounded object-contain shrink-0"
                      style={{ backgroundColor: '#0F1419' }}
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: '#0F1419', color: '#5B6B85' }}
                    >
                      🛡️
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#F0F2F5' }}>
                      vs {ultimoPartidoPrincipal.rival}
                    </p>
                    <p className="text-xs" style={{ color: '#8A9BB8' }}>
                      {ultimoPartidoPrincipal.fecha}
                    </p>
                  </div>
                  {resultadoUltimo && (
                    <span
                      className="ml-auto text-xs font-mono px-2 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: '#0F1419', color: colorUltimo, border: `1px solid ${colorUltimo}40` }}
                    >
                      {resultadoUltimo.texto}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#5B6B85' }}>Todavía no hay resultados cargados.</p>
              )}
            </div>
          )}

          {perfil.rol !== 'medico' && (
            <div
              onClick={() => onCambiarSeccion('partidos')}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
                Estadísticas de la temporada
              </p>
              {estadisticasRapidas ? (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm" style={{ color: '#8A9BB8' }}>
                      PJ <b style={{ color: '#F0F2F5' }}>{estadisticasRapidas.pj}</b>
                    </span>
                    <span className="text-sm" style={{ color: '#4ADE80' }}>
                      PG <b>{estadisticasRapidas.pg}</b>
                    </span>
                    <span className="text-sm" style={{ color: '#FBBF24' }}>
                      PE <b>{estadisticasRapidas.pe}</b>
                    </span>
                    <span className="text-sm" style={{ color: '#F87171' }}>
                      PP <b>{estadisticasRapidas.pp}</b>
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: '#8A9BB8' }}>
                    Goles: {estadisticasRapidas.gf} a favor · {estadisticasRapidas.gc} en contra
                    <span style={{ color: estadisticasRapidas.gf - estadisticasRapidas.gc >= 0 ? '#4ADE80' : '#F87171' }}>
                      {' '}({estadisticasRapidas.gf - estadisticasRapidas.gc >= 0 ? '+' : ''}
                      {estadisticasRapidas.gf - estadisticasRapidas.gc})
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#5B6B85' }}>Todavía no hay partidos con resultado cargado.</p>
              )}
            </div>
          )}

          <div
            onClick={() => onCambiarSeccion(perfil.rol === 'medico' ? 'medicos' : 'plantel')}
            className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
            style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
          >
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
              Lesionados activos
            </p>
            {lesionados.length === 0 ? (
              <p className="text-sm" style={{ color: '#5B6B85' }}>No hay jugadores lesionados.</p>
            ) : (
              <div className="space-y-1">
                {lesionados.slice(0, 5).map((j) => (
                  <p key={j.id} className="text-sm" style={{ color: '#FBBF24' }}>
                    {j.apellido}, {j.nombre}
                    {j.categorias?.nombre && (
                      <span style={{ color: '#5B6B85' }}> · {j.categorias.nombre}</span>
                    )}
                  </p>
                ))}
                {lesionados.length > 5 && (
                  <p className="text-xs" style={{ color: '#5B6B85' }}>
                    +{lesionados.length - 5} más
                  </p>
                )}
              </div>
            )}
          </div>

          {perfil.rol !== 'tecnico' && (
            <div
              onClick={() => onCambiarSeccion('nutricion')}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
                Alertas de nutrición
              </p>
              {alertasNutricion.length === 0 ? (
                <p className="text-sm" style={{ color: '#5B6B85' }}>Sin alertas de peso activas.</p>
              ) : (
                <div className="space-y-1">
                  {alertasNutricion.slice(0, 5).map((f) => (
                    <p key={f.id} className="text-sm" style={{ color: '#F87171' }}>
                      {f.jugadores?.apellido}, {f.jugadores?.nombre}
                      {f.jugadores?.categorias?.nombre && (
                        <span style={{ color: '#5B6B85' }}> · {f.jugadores.categorias.nombre}</span>
                      )}
                    </p>
                  ))}
                  {alertasNutricion.length > 5 && (
                    <p className="text-xs" style={{ color: '#5B6B85' }}>
                      +{alertasNutricion.length - 5} más
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {perfil.rol !== 'medico' && (
            <div
              onClick={() => onCambiarSeccion('video')}
              className="p-4 rounded-xl cursor-pointer hover:-translate-y-0.5 transition-all duration-200"
              style={{ backgroundColor: '#1A2332', border: '1px solid #2A3548' }}
            >
              <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#5B6B85' }}>
                Últimos videos
              </p>
              {ultimosVideos.length === 0 ? (
                <p className="text-sm" style={{ color: '#5B6B85' }}>Todavía no hay videos cargados.</p>
              ) : (
                <div className="space-y-1">
                  {ultimosVideos.map((v) => (
                    <p key={v.id} className="text-sm truncate" style={{ color: '#8A9BB8' }}>
                      {v.descripcion || v.contenido || (v.jugadores ? `${v.jugadores.apellido}, ${v.jugadores.nombre}` : 'Video')}
                      <span style={{ color: '#5B6B85' }}> · {v.fecha}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InicioSection
