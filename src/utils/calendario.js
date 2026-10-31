import { fechaValida, puedePlanificar, sumarDias } from './planificacion.js'

// Fechas civiles: UTC sólo se usa para aritmética, nunca para convertir el horario argentino.
export function matrizMes(fecha) {
  if (!fechaValida(fecha)) throw new Error('Fecha inválida.')
  const primero = `${fecha.slice(0, 7)}-01`
  const ultimo = new Date(`${primero}T12:00:00Z`)
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0)
  const fin = ultimo.toISOString().slice(0, 10)
  const desde = sumarDias(primero, -new Date(`${primero}T12:00:00Z`).getUTCDay())
  const hasta = sumarDias(fin, 6 - ultimo.getUTCDay())
  const semanas = []
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => {
      const iso = sumarDias(dia, i)
      return { iso, numero: Number(iso.slice(8)), delMes: iso.slice(0, 7) === fecha.slice(0, 7) }
    }))
  }
  return semanas
}

export function cambiarMes(fecha, diferencia) {
  const dia = new Date(`${fecha.slice(0, 7)}-01T12:00:00Z`)
  dia.setUTCMonth(dia.getUTCMonth() + diferencia)
  return dia.toISOString().slice(0, 10)
}

export function normalizarEventos({ partidos = [], videos = [], planificaciones = [] }) {
  return [
    ...partidos.map(p => ({ id: `partido-${p.id}`, originalId: p.id, fecha: p.fecha,
      tipo: 'partido', titulo: `vs ${p.rival}`, rival: p.rival,
      detalle: [p.hora?.slice(0, 5), p.lugar].filter(Boolean).join(' · '),
      categoria: p.categorias?.nombre, categoriaId: p.categoria_id, escudo: p.escudo_url })),
    ...videos.map(v => ({ id: `video-${v.id}`, originalId: v.id, fecha: v.fecha,
      tipo: 'video', titulo: v.contenido || 'Video de entrenamiento', detalle: v.descripcion || '',
      categoria: v.categorias?.nombre, categoriaId: v.categoria_id })),
    ...planificaciones.map(s => ({ id: `planificacion-${s.id}`, originalId: s.id, fecha: s.fecha,
      tipo: 'planificacion', titulo: s.objetivo || `Planificación · ${s.tipo}`,
      hora: s.hora?.slice(0, 5) || '', estado: s.estado,
      detalle: [s.hora?.slice(0, 5), s.lugar].filter(Boolean).join(' · '),
      categoria: s.categorias?.nombre, categoriaId: s.categoria_id,
      entrenamientoRealId: s.entrenamiento_real_id })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || '') || a.id.localeCompare(b.id))
}

function errorFuente(fuente, fallo) {
  const permisos = ['42501', 'PGRST301', 'PGRST302'].includes(fallo?.code) || [401, 403].includes(fallo?.status)
  return `${fuente}: ${permisos ? 'tu sesión no tiene acceso; revisá tus permisos.' : 'no se pudo consultar; revisá la conexión o reintentá.'}`
}

export async function cargarEventosCalendario(cliente, perfil, desde, hasta) {
  const fuentes = [
    ['Partidos', 'partidos', () => cliente.from('partidos').select('*, categorias(nombre)').gte('fecha', desde).lte('fecha', hasta)],
    ['Videos', 'videos', () => cliente.from('videos').select('*, categorias(nombre)').eq('tipo', 'entrenamiento').gte('fecha', desde).lte('fecha', hasta)],
  ]
  // La interfaz no concede acceso: todas las lecturas siguen sujetas a RLS.
  if (puedePlanificar(perfil)) fuentes.push(['Planificación', 'planificaciones', () => {
    let q = cliente.from('planificacion_sesiones')
      .select('id,categoria_id,fecha,hora,tipo,estado,lugar,objetivo,entrenamiento_real_id,categorias(nombre)')
      .gte('fecha', desde).lte('fecha', hasta)
    if (perfil.rol !== 'coordinacion') q = q.eq('categoria_id', perfil.categoria_id)
    return q
  }])
  const resultados = await Promise.allSettled(fuentes.map(([, , leer]) => Promise.resolve().then(leer)))
  const datos = {}, errores = []
  resultados.forEach((r, i) => {
    const [nombre, clave] = fuentes[i]
    if (r.status === 'rejected' || r.value.error) errores.push(errorFuente(nombre, r.status === 'rejected' ? r.reason : r.value.error))
    else datos[clave] = (r.value.data || []).filter(e => clave !== 'planificaciones' || puedePlanificar(perfil, e.categoria_id))
  })
  return { eventos: normalizarEventos(datos), errores }
}
