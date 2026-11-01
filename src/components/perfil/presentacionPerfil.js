import { PLANTEL as P } from '../../appearance/plantel'

export const COLORES = {
  fondo: P.fondoPerfil,
  tarjeta: P.tarjetaPerfil,
  borde: P.bordePerfil,
  texto: P.textoPerfil,
  secundario: P.secundarioPerfil,
  tenue: P.tenuePerfil,
  amarillo: P.amarilloPerfil,
  amarilloOscuro: P.amarilloSuave,
}

export const estadoConfig = {
  disponible: { color: '#4ADE80', label: 'Disponible' },
  lesionado: { color: '#FBBF24', label: 'Lesionado' },
  suspendido: { color: '#F87171', label: 'Suspendido' },
  no_disponible: { color: COLORES.secundario, label: 'No disponible' },
}

export const pieHabilLabel = {
  derecho: 'Derecho',
  izquierdo: 'Izquierdo',
  ambidiestro: 'Ambidiestro',
}

export const recomendacionLabel = {
  continuidad: 'Continuidad',
  a_evaluar: 'A evaluar',
  no_continuidad: 'No continuidad',
}

export function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null

  const hoy = new Date()
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`)

  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--

  return edad
}

export function formatearFecha(fecha) {
  if (!fecha) return null

  const [anio, mes, dia] = String(fecha).slice(0, 10).split('-')
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : fecha
}

export function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')

  return `${anio}-${mes}-${dia}`
}

export function nombrePeriodo(periodo, tipo) {
  if (tipo === 'final' || String(periodo).startsWith('final-')) {
    const anio = String(periodo).replace('final-', '')
    return `Temporada ${anio}`
  }

  const [anio, mes] = String(periodo).split('-')
  const numeroMes = Number(mes)

  if (!anio || numeroMes < 1 || numeroMes > 12) return periodo

  const fecha = new Date(Number(anio), numeroMes - 1, 1)

  return fecha.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  }).replace(/^\p{L}/u, (letra) => letra.toUpperCase())
}

export function valorPuntaje(valor) {
  if (valor === 'no_evaluo') return 'No evaluó'
  if (valor === null || valor === undefined || valor === '') return '—'
  return valor
}

export function calcularResumenEvaluacion(evaluaciones, criterios) {
  const porCriterio = criterios.map((criterio) => {
    const valores = evaluaciones
      .map((evaluacion) => evaluacion.puntajes?.[criterio.id])
      .filter((valor) => {
        if (valor === 'no_evaluo' || valor == null || valor === '') return false
        const numero = Number(valor)
        return Number.isFinite(numero) && numero >= 1 && numero <= 5
      })
      .map(Number)

    return {
      criterio,
      promedio: valores.length
        ? valores.reduce((total, valor) => total + valor, 0) / valores.length
        : null,
      cantidad: valores.length,
    }
  })

  const promedios = porCriterio
    .map((item) => item.promedio)
    .filter((valor) => valor !== null)

  const general = promedios.length
    ? promedios.reduce((total, valor) => total + valor, 0) / promedios.length
    : null

  return { porCriterio, general }
}


export function estadoErrorPerfil(error) {
 return ['42501', 'PGRST301', 'PGRST302'].includes(error?.code) || [401,403].includes(error?.status) ? 'denegado' : 'error'
}
