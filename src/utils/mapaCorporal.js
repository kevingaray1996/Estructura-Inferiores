// Derecha e izquierda siempre pertenecen a la jugadora, no al observador.
export const ZONAS_CORPORALES = [
  ['cuello', 'Cuello', 'ambas'], ['hombro', 'Hombros', 'ambas'],
  ['brazo', 'Brazos', 'ambas'], ['codo', 'Codos', 'ambas'],
  ['antebrazo', 'Antebrazos', 'ambas'], ['mano', 'Muñecas y manos', 'ambas'],
  ['pecho', 'Pecho', 'frente'], ['abdomen', 'Abdominales', 'frente'],
  ['espalda_alta', 'Espalda alta', 'espalda'], ['lumbar', 'Zona lumbar', 'espalda'],
  ['gluteo', 'Glúteos', 'espalda'], ['cadera', 'Cadera', 'ambas'],
  ['aductor', 'Ingle y aductores', 'frente'], ['cuadriceps', 'Cuádriceps', 'frente'],
  ['isquiotibial', 'Isquiotibiales', 'espalda'], ['rodilla', 'Rodillas', 'ambas'],
  ['pantorrilla', 'Gemelos y pantorrillas', 'espalda'], ['tobillo', 'Tobillos', 'ambas'],
  ['pie', 'Pies', 'ambas'],
].map(([id, nombre, vista]) => ({ id, nombre, vista }))
export const ESTADOS_CORPORALES = { seguimiento: 'En seguimiento', derivada: 'Derivada a evaluación profesional', resuelta: 'Resuelta' }
export const LADOS_CORPORALES = { derecha: 'Derecha', izquierda: 'Izquierda', ambos: 'Ambos lados', central: 'Zona central' }
export const CENTRALES = ['cuello', 'pecho', 'abdomen', 'espalda_alta', 'lumbar']
export const COLORES_CORPORALES = { lesion: '#DC2626', seguimiento: '#F2C230', antecedente: '#A78BFA', sin_registros: '#94A3B8' }
export const puedeVerMedicos = (perfil) => ['coordinacion', 'medico', 'preparador_fisico'].includes(perfil?.rol)
export const nombreZona = (id) => ZONAS_CORPORALES.find(z => z.id === id)?.nombre || 'Sin clasificar'
const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const fechaValida = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s

export function ubicacionFicha(ficha) {
  if (ficha.zona_corporal) return { zona: ficha.zona_corporal, lado: ficha.lateralidad, inferida: false }
  // Solo descripciones que sean EXACTAMENTE un nombre de zona y su lado.
  // No interpretar diagnósticos ni frases libres como posiciones anatómicas.
  const texto = normalizar(ficha.descripcion)
  for (const zona of ZONAS_CORPORALES) {
    if (CENTRALES.includes(zona.id) && texto === normalizar(zona.nombre)) return { zona: zona.id, lado: 'central', inferida: true }
    for (const lado of ['derecha', 'izquierda', 'ambos']) {
      if (texto === `${normalizar(zona.nombre)} ${lado}`) return { zona: zona.id, lado, inferida: true }
    }
  }
  return null
}
export function estadoFicha(ficha) {
  if (ficha.recuperado || ficha.estado_seguimiento === 'resuelta') return 'antecedente'
  return ficha.tipo_incidencia === 'lesion_informada' ? 'lesion' : 'seguimiento'
}
export function fichasZona(fichas, zona, lado) {
  return fichas.filter(f => { const u = ubicacionFicha(f); return u?.zona === zona && (u.lado === lado || u.lado === 'ambos' || lado === 'ambos') })
}
export function colorZona(fichas, zona, lado) {
  const estados = fichasZona(fichas, zona, lado).map(estadoFicha)
  return COLORES_CORPORALES[['lesion', 'seguimiento', 'antecedente'].find(e => estados.includes(e)) || 'sin_registros']
}
export function validarIncidencia(f) {
  if (!ZONAS_CORPORALES.some(z => z.id === f.zona_corporal)) return 'Seleccioná una zona corporal.'
  if (!(CENTRALES.includes(f.zona_corporal) ? ['central'] : ['derecha', 'izquierda', 'ambos']).includes(f.lateralidad)) return 'Revisá la lateralidad.'
  if (!['molestia', 'lesion_informada'].includes(f.tipo_incidencia)) return 'Seleccioná el tipo de situación.'
  if (!Object.hasOwn(ESTADOS_CORPORALES, f.estado_seguimiento)) return 'Seleccioná el estado de seguimiento.'
  if (!fechaValida(f.fecha)) return 'Indicá una fecha de inicio válida.'
  if (f.estado_seguimiento === 'resuelta' && (!fechaValida(f.fecha_resolucion) || f.fecha_resolucion < f.fecha)) return 'La fecha de resolución debe ser igual o posterior al inicio.'
  if (f.estado_seguimiento !== 'resuelta' && f.fecha_resolucion) return 'Solo una situación resuelta puede tener fecha de resolución.'
  return null
}
