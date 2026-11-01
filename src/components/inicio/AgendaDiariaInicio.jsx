import { calcularCuentaRegresiva } from '../../utils/inicioAgenda'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { cargarSesionesAgenda, normalizarEventos } from '../../utils/calendario'
import { fechaArgentina, sumarDias, puedePlanificar } from '../../utils/planificacion'

const TIPOS = { partido: 'Partido', video: 'Video de entrenamiento', planificacion: 'Planificación' }
function Evento({ evento, abrirCalendario, onVerPlanificacion }) {
  const abrirPlan = evento.tipo === 'planificacion' && onVerPlanificacion
  return <button type="button" className="inicio-actividad" data-evento-id={evento.id} onClick={() => abrirPlan
    ? onVerPlanificacion(evento.fecha, evento.categoriaId, evento.originalId) : abrirCalendario(evento.fecha, evento.categoriaId)}>
    <span className="inicio-dia">{evento.fecha}<strong>{evento.hora || 'Ver horario y detalle'}</strong></span>
    <span><small>{TIPOS[evento.tipo]}{evento.estado ? ` · ${evento.estado === 'publicado' ? 'Publicado' : 'Borrador'}` : ''}</small>
      <strong>{evento.titulo}</strong>{evento.tipo === 'partido' && <small>{calcularCuentaRegresiva(evento.fecha, evento.hora)}</small>}<small>{[evento.categoria, evento.detalle].filter(Boolean).join(' · ')}</small><small>{abrirPlan ? 'Abrir planificación' : 'Ver en Calendario'} →</small></span>
  </button>
}

export default function AgendaDiariaInicio({ perfil, partidos, proximoPartido, cargandoPartidos, errorPartidos, abrirCalendario, onVerPlanificacion }) {
  const [lectura, setLectura] = useState(null)
  const [intento, setIntento] = useState(0)
  const hoy = fechaArgentina(), manana = sumarDias(hoy, 1)
  const { id, rol, categoria_id } = perfil
  const clave = [id, rol, categoria_id, hoy, intento].join(':')
  useEffect(() => {
    let activo = true
    async function cargar() {
      const resultados = await Promise.allSettled([
        cargarSesionesAgenda(supabase, { rol, categoria_id }, hoy, manana),
        supabase.from('videos').select('id,fecha,contenido,descripcion,categoria_id,categorias(nombre)')
          .eq('tipo', 'entrenamiento').gte('fecha', hoy).lte('fecha', manana),
      ])
      const errores = [], datos = { planificaciones: [], videos: [] }
      resultados.forEach((r, i) => {
        const error = r.status === 'rejected' ? r.reason : i === 1 ? r.value.error : null
        if (error) errores.push(i === 0 ? error.message : ['42501', 'PGRST301', 'PGRST302'].includes(error.code) || [401, 403].includes(error.status)
          ? 'Videos: tu sesión no tiene acceso.' : 'No se pudieron consultar los videos de entrenamiento. Reintentá.')
        else datos[i === 0 ? 'planificaciones' : 'videos'] = i === 0 ? r.value : r.value.data || []
      })
      if (activo) setLectura({ clave, datos, errores })
    }
    cargar()
    return () => { activo = false }
  }, [clave, rol, categoria_id, hoy, manana])
  const vigente = lectura?.clave === clave
  // Partidos proviene de la lectura existente de Inicio: no se vuelve a consultar.
  const eventos = normalizarEventos({ ...(vigente ? lectura.datos : {}), partidos: partidos.filter(p => p.fecha >= hoy && p.fecha <= manana) })
    .map(e => e.tipo === 'partido' ? { ...e, hora: partidos.find(p => p.id === e.originalId)?.hora?.slice(0, 5) || '' } : e)
  const delDia = eventos.filter(e => e.fecha === hoy), proximos = eventos.filter(e => e.fecha > hoy)
  const errores = [...(vigente ? lectura.errores : []), ...(errorPartidos ? [errorPartidos] : [])]
  const cargando = !vigente || cargandoPartidos
  const partidoPosterior = proximoPartido?.fecha > manana ? proximoPartido : null
  return <div className="inicio-agenda-paneles">
    <section className="inicio-bloque inicio-hoy" aria-labelledby="inicio-hoy-titulo">
      <div className="inicio-hoy-portada"><img src="/images/fotos-comunicaciones/pelotas-entrenamiento-comunicaciones.jpeg" alt="Pelotas de entrenamiento de Comunicaciones" loading="lazy" />
        <div><p className="inicio-antetitulo">AGENDA DEL CUERPO TÉCNICO</p><h2 id="inicio-hoy-titulo">Actividad de hoy</h2><p>{hoy}</p></div></div>
      {cargando && <p role="status">Consultando actividades…</p>}
      {errores.map((e, i) => <p role="alert" key={i}>{e}</p>)}
      {vigente && lectura.errores.length > 0 && <button type="button" disabled={cargando} onClick={() => setIntento(n => n + 1)}>Reintentar videos y planificación</button>}
      {errorPartidos && <p className="inicio-secundario">Para reintentar la lectura de partidos, volvé a abrir Inicio.</p>}
      <div className="inicio-agenda">{delDia.map(e => <Evento key={e.id} evento={e} abrirCalendario={abrirCalendario} onVerPlanificacion={puedePlanificar(perfil, e.categoriaId) ? onVerPlanificacion : undefined} />)}</div>
      {!cargando && !errores.length && !delDia.length && <p className="inicio-vacio">Sin actividades registradas para hoy.</p>}
      <button type="button" className="inicio-enlace" onClick={() => abrirCalendario(hoy)}><span>Consultar calendario</span> →</button>
    </section>
    <section className="inicio-bloque inicio-proximas" aria-labelledby="inicio-actividades">
      <div className="inicio-titulo"><h2 id="inicio-actividades">Próximas actividades</h2></div>
      <div className="inicio-agenda">{proximos.map(e => <Evento key={e.id} evento={e} abrirCalendario={abrirCalendario} onVerPlanificacion={puedePlanificar(perfil, e.categoriaId) ? onVerPlanificacion : undefined} />)}
        {partidoPosterior && <Evento evento={{ ...normalizarEventos({ partidos: [partidoPosterior] })[0], hora: partidoPosterior.hora?.slice(0, 5) || '', categoria: partidoPosterior.categoriasNombres?.join(', ') || partidoPosterior.categorias?.nombre }} abrirCalendario={abrirCalendario} />}</div>
      {!cargando && !errores.length && !proximos.length && !partidoPosterior && <p className="inicio-vacio">Sin próximas actividades registradas.</p>}
      <p className="inicio-secundario">Planificaciones y videos de mañana, y próximo partido posterior disponible. No se repiten las actividades de hoy.</p>
    </section>
  </div>
}
