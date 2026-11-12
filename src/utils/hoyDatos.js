import { supabase } from '../supabaseClient'
import { obtenerCategoriaPrimeraDivision } from './categoriaPrimera'
import { obtenerJugadoresDeCategoria } from './jugadoresCategoria'
import { fechaArgentina } from './planificacion'
import { puedeConsultarWellnessInicio, resumirWellnessInicio, mensajeErrorWellness } from './inicioWellness'
import { calcularSemaforoGrupo, motivoPrincipalSemaforo } from './semaforoRiesgo'
import { agruparProximoPartido, diasHastaProximoCumple } from './inicioDatos'

// Tablero "Hoy": lo que el cuerpo técnico mira antes de entrenar.
// Reúne lecturas que ya hacen Inicio, Wellness y el semáforo; no escribe nada.

export const ROLES_HOY = ['coordinacion', 'tecnico', 'preparador_fisico']
export const puedeVerHoy = perfil => ROLES_HOY.includes(perfil?.rol)

export const DIAS_CUMPLEANOS = 7
const SELECT_JUGADORA = 'id,nombre,apellido,foto_url,estado,estado_detalle,fecha_nacimiento,posicion'

export const GRUPOS_NO_DISPONIBLES = [
  { estado: 'lesionado', titulo: 'Lesionadas', motivo: 'Lesión' },
  { estado: 'suspendido', titulo: 'Suspendidas', motivo: 'Suspendida' },
  { estado: 'no_disponible', titulo: 'No disponibles', motivo: 'No disponible' },
]

const porApellido = (a, b) => `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(`${b.apellido || ''} ${b.nombre || ''}`, 'es')

// Agrupa por estado y arma el motivo. `altas`: { [jugadorId]: 'AAAA-MM-DD' } de fichas médicas abiertas.
export function agruparNoDisponibles(jugadoras, altas = {}) {
  return GRUPOS_NO_DISPONIBLES.map(g => ({
    ...g,
    jugadoras: (jugadoras || []).filter(j => j.estado === g.estado).sort(porApellido)
      .map(j => ({ jugadora: j, motivo: j.estado_detalle?.trim() || g.motivo, alta: altas[j.id] || null })),
  })).filter(g => g.jugadoras.length > 0)
}

export function cumpleanosProximos(jugadoras, dias = DIAS_CUMPLEANOS) {
  return (jugadoras || [])
    .map(j => ({ jugadora: j, diasFaltan: diasHastaProximoCumple(j.fecha_nacimiento) }))
    .filter(c => c.diasFaltan !== null && c.diasFaltan <= dias)
    .sort((a, b) => a.diasFaltan - b.diasFaltan || porApellido(a.jugadora, b.jugadora))
}

// Rojas primero, después más puntos y por apellido. Solo rojo y amarillo.
export function jugadorasEnRiesgo(jugadoras, resultados) {
  return (jugadoras || [])
    .map(j => ({ jugadora: j, resultado: resultados?.[j.id] }))
    .filter(({ resultado }) => resultado && (resultado.semaforo === 'rojo' || resultado.semaforo === 'amarillo'))
    .map(item => ({ ...item, motivo: motivoPrincipalSemaforo(item.resultado) }))
    .sort((a, b) => (a.resultado.semaforo === b.resultado.semaforo ? 0 : a.resultado.semaforo === 'rojo' ? -1 : 1)
      || b.resultado.puntos - a.resultado.puntos || porApellido(a.jugadora, b.jugadora))
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fechaEnPalabras(iso) {
  const [a, m, d] = String(iso).split('-').map(Number)
  const fecha = new Date(a, m - 1, d)
  if (Number.isNaN(fecha.getTime())) return ''
  return `${DIAS_SEMANA[fecha.getDay()]} ${d} de ${MESES[m - 1]}`
}

// Texto para pegar en WhatsApp con las que todavía no completaron Wellness.
export function textoPendientesWellness(pendientes, fechaISO) {
  const lista = [...(pendientes || [])].sort(porApellido)
  if (!lista.length) return ''
  return [
    `*Wellness de hoy* (${fechaEnPalabras(fechaISO)})`,
    `Faltan completar ${lista.length === 1 ? '1 jugadora' : lista.length + ' jugadoras'}:`,
    ...lista.map(j => `• ${[j.apellido, j.nombre].filter(Boolean).join(', ')}`),
    '',
    'Por favor, completalo antes del entrenamiento. ¡Gracias!',
  ].join('\n')
}

const ERROR_CONEXION = 'No se pudo leer. Revisá la conexión y volvé a intentar.'

async function leerPlantel(jugadorasP, perfil) {
  const { data, error } = await jugadorasP
  if (error) throw error
  const jugadoras = data || []
  const lesionadas = jugadoras.filter(j => j.estado === 'lesionado').map(j => j.id)
  // El técnico no lee fichas médicas (igual que en Inicio): sus lesionadas muestran solo el motivo.
  const altas = {}
  if (perfil.rol !== 'tecnico' && lesionadas.length) {
    const fichas = await supabase.from('fichas_medicas').select('jugador_id, fecha_estimada_alta')
      .eq('recuperado', false).in('jugador_id', lesionadas).not('fecha_estimada_alta', 'is', null)
      .order('fecha_estimada_alta', { ascending: true })
    for (const f of fichas.data || []) if (!altas[f.jugador_id]) altas[f.jugador_id] = f.fecha_estimada_alta
  }
  return {
    estado: 'ok',
    noDisponibles: agruparNoDisponibles(jugadoras, altas),
    cumpleanos: cumpleanosProximos(jugadoras),
  }
}

async function leerProximoPartido(hoy, categoriaId) {
  if (!categoriaId) return { estado: 'ok', partido: null }
  const { data, error } = await supabase.from('partidos').select('*, categorias(nombre)')
    .eq('categoria_id', categoriaId).gte('fecha', hoy).order('fecha', { ascending: true }).limit(30)
  if (error) throw error
  return { estado: 'ok', partido: agruparProximoPartido(data) }
}

async function leerWellness(jugadoras, hoy) {
  const ids = jugadoras.map(j => j.id)
  const respuesta = ids.length ? await supabase.from('bienestar')
    .select('jugador_id,sueno,dolor_muscular,fatiga,estres,animo_entrenar').eq('fecha', hoy).in('jugador_id', ids) : { data: [] }
  if (respuesta.error) throw respuesta.error
  return { estado: 'ok', fecha: hoy, resumen: resumirWellnessInicio(jugadoras, respuesta.data || []) }
}

async function leerSemaforo(jugadoras, categoriaId) {
  const resultados = await calcularSemaforoGrupo(jugadoras, categoriaId)
  return { estado: 'ok', enRiesgo: jugadorasEnRiesgo(jugadoras, resultados), total: jugadoras.length }
}

// Lanza todas las lecturas en paralelo y llama a `publicar` con cada bloque apenas llega,
// para que una lectura lenta o fallida no frene a las demás.
export async function cargarTableroHoy(perfil, publicar) {
  const hoy = fechaArgentina()
  const fallo = (bloque, mensaje = ERROR_CONEXION) => error => {
    console.error(`Hoy: no se pudo leer ${bloque}`, error)
    publicar({ [bloque]: { estado: 'error', error: mensaje } })
  }

  let categorias, primera
  try {
    const [respuesta, primeraLeida] = await Promise.all([
      supabase.from('categorias').select('id, nombre, es_reserva'),
      obtenerCategoriaPrimeraDivision({ exigirLectura: true }),
    ])
    if (respuesta.error) throw respuesta.error
    categorias = respuesta.data || []
    primera = primeraLeida
  } catch (error) {
    for (const bloque of ['plantel', 'partido', 'wellness', 'semaforo']) fallo(bloque)(error)
    return
  }

  // Cada usuario mira su categoría; quien no tiene una asignada ve Primera.
  const categoriaId = perfil.categoria_id || primera?.id || null
  const categoria = categorias.find(c => c.id === categoriaId) || null
  publicar({ categoria: categoria ? { id: categoria.id, nombre: categoria.nombre } : null })

  const partidoP = leerProximoPartido(hoy, categoriaId).then(partido => publicar({ partido }), fallo('partido'))

  // Promise.resolve: la consulta de Supabase se dispara una sola vez aunque la usen dos bloques.
  const plantelJugadorasP = Promise.resolve(categoriaId
    ? obtenerJugadoresDeCategoria(supabase, categoriaId, categorias, { select: SELECT_JUGADORA })
    : { data: [] })
  const plantelP = leerPlantel(plantelJugadorasP, perfil).then(plantel => publicar({ plantel }), fallo('plantel'))

  // Wellness y semáforo: solo Primera y con las mismas reglas de acceso que Inicio.
  let primeraP
  if (!primera) {
    publicar({ wellness: { estado: 'sin_categoria' }, semaforo: { estado: 'sin_categoria' } })
  } else if (!puedeConsultarWellnessInicio(perfil, primera.id)) {
    publicar({ wellness: { estado: 'restringido' }, semaforo: { estado: 'restringido' } })
  } else {
    const jugadorasPrimeraP = (primera.id === categoriaId ? plantelJugadorasP
      : Promise.resolve(obtenerJugadoresDeCategoria(supabase, primera.id, categorias, { select: SELECT_JUGADORA })))
      .then(({ data, error }) => { if (error) throw error; return data || [] })
    primeraP = Promise.all([
      jugadorasPrimeraP.then(j => leerWellness(j, hoy)).then(wellness => publicar({ wellness }),
        error => fallo('wellness', mensajeErrorWellness(error))(error)),
      jugadorasPrimeraP.then(j => leerSemaforo(j, primera.id)).then(semaforo => publicar({ semaforo }), fallo('semaforo')),
    ])
  }

  await Promise.all([partidoP, plantelP, primeraP])
}
