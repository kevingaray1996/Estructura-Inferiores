// Etapas D + G: Biblioteca de Cancha (ejercicios y jugadas con pizarra) y de Gimnasio (ejercicios con demostración).
// Lógica pura: permisos, filtros, carpetas y demostraciones. La base (etapa C) aplica los mismos permisos con RLS.

export const AMBITOS = { cancha: 'Cancha', gimnasio: 'Gimnasio' }
export const TIPOS = { ejercicio: 'Ejercicio', jugada: 'Jugada' }
// Sugerencias para cargar rápido (se pueden escribir otras).
export const GRUPOS_MUSCULARES = ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores', 'Gemelos', 'Core', 'Pecho', 'Espalda', 'Hombros', 'Brazos', 'Cadera', 'Tobillo']
export const MATERIALES = ['Peso corporal', 'Barra', 'Mancuernas', 'Kettlebell', 'Banda elástica', 'Fitball', 'Cajón', 'Polea', 'TRX', 'Disco', 'Escalera', 'Conos']
export const DURACIONES = [['', 'Cualquier duración'], ['corta', 'Hasta 10 min'], ['media', '11 a 20 min'], ['larga', '21 a 30 min'], ['extensa', 'Más de 30 min']]

// Quién edita cada ámbito (igual que pizarra_privado.puede_editar_biblioteca). Leen coordinación, técnicos y PF.
export function puedeEditar(rol, ambito) {
  return rol === 'coordinacion' || (ambito === 'cancha' && rol === 'tecnico') || (ambito === 'gimnasio' && rol === 'preparador_fisico')
}
export const puedeVer = rol => ['coordinacion', 'tecnico', 'preparador_fisico'].includes(rol)

// Demostración: YouTube (se muestra con el reproductor oficial sin cookies) o imagen subida a Biblioteca/gimnasio/.
// Mismas reglas que pizarra_privado.demo_url_valida en la base.
const YOUTUBE = /^https:\/\/((www|m)\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})([?&#][^\s]*)?$/
const IMAGEN_GIMNASIO = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/Biblioteca\/gimnasio\/[^/?#\s]+$/
export function idYoutube(url) { const m = typeof url === 'string' && url.length <= 500 ? url.trim().match(YOUTUBE) : null; return m ? m[5] : null }
export const embedYoutube = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0`
export const miniaturaYoutube = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export function demoValida(tipo, url) {
  if (tipo === 'youtube') return Boolean(idYoutube(url))
  if (tipo === 'imagen') return typeof url === 'string' && url.length <= 500 && IMAGEN_GIMNASIO.test(url)
  return false
}

const sinTildes = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function enDuracion(min, rango) {
  if (!rango) return true
  if (!min) return false
  return rango === 'corta' ? min <= 10 : rango === 'media' ? min > 10 && min <= 20 : rango === 'larga' ? min > 20 && min <= 30 : min > 30
}

// Filtros. `carpeta`: '' = todas, 'sin' = sin carpeta ("Sin clasificar" incluye las que no tienen), o un id.
export function filtrarEjercicios(lista, filtros = {}, favoritos = new Set(), carpetaFija = null) {
  const texto = sinTildes(filtros.texto).trim()
  return lista.filter(e => {
    if (filtros.ambito && e.ambito !== filtros.ambito) return false
    if (filtros.soloFavoritos && !favoritos.has(e.id)) return false
    if (texto && !sinTildes([e.contenido, e.descripcion, e.objetivo, e.tecnica, ...(e.musculos || []), ...(e.material || [])].join(' ')).includes(texto)) return false
    if (filtros.carpeta) {
      const sinCarpeta = !e.carpeta_id || e.carpeta_id === carpetaFija
      if (filtros.carpeta === 'sin' ? !sinCarpeta : e.carpeta_id !== filtros.carpeta) return false
    }
    if (filtros.tipo && e.tipo !== filtros.tipo) return false
    if (filtros.jugadoras && String(e.cantidad_jugadores || '') !== String(filtros.jugadoras)) return false
    if (!enDuracion(e.duracion_minutos, filtros.duracion)) return false
    if (filtros.objetivo && sinTildes(e.objetivo).trim() !== sinTildes(filtros.objetivo).trim()) return false
    if (filtros.musculo && !(e.musculos || []).some(m => sinTildes(m) === sinTildes(filtros.musculo))) return false
    if (filtros.material && !(e.material || []).some(m => sinTildes(m) === sinTildes(filtros.material))) return false
    return true
  }).sort((a, b) => Number(favoritos.has(b.id)) - Number(favoritos.has(a.id)) || (a.contenido || '').localeCompare(b.contenido || '', 'es'))
}

// Valores distintos (para los selectores de filtros), sin repetir mayúsculas/tildes.
export function valoresDistintos(lista, obtener) {
  const vistos = new Map()
  for (const e of lista) for (const v of [].concat(obtener(e) ?? [])) {
    const t = String(v ?? '').trim()
    if (t && !vistos.has(sinTildes(t))) vistos.set(sinTildes(t), t)
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

// Carpetas de un ámbito en orden; la fija ("Sin clasificar") primero. Cuenta los ejercicios de cada una.
export function carpetasDe(carpetas, ambito, ejercicios = []) {
  const propias = carpetas.filter(c => c.ambito === ambito).sort((a, b) => Number(b.sistema) - Number(a.sistema) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  return propias.map(c => ({ ...c, cantidad: ejercicios.filter(e => e.ambito === ambito && (e.carpeta_id === c.id || (c.sistema && !e.carpeta_id))).length }))
}
// Ejercicios sin carpeta en un ámbito sin carpeta fija (Gimnasio): se muestran en "Sin carpeta".
export const sinCarpeta = (ejercicios, ambito) => ejercicios.filter(e => e.ambito === ambito && !e.carpeta_id).length
// Nuevo orden al mover una carpeta (no la fija) un lugar arriba o abajo: devuelve [{ id, orden }] a guardar.
export function reordenar(carpetas, id, delta) {
  const movibles = carpetas.filter(c => !c.sistema)
  const i = movibles.findIndex(c => c.id === id), j = i + delta
  if (i < 0 || j < 0 || j >= movibles.length) return []
  const lista = [...movibles];[lista[i], lista[j]] = [lista[j], lista[i]]
  return lista.map((c, k) => ({ id: c.id, orden: (k + 1) * 10 })).filter(c => c.orden !== movibles.find(m => m.id === c.id).orden)
}
export function nombreCarpetaValido(nombre, carpetas, ambito, propioId = null) {
  const limpio = (nombre || '').trim()
  if (!limpio) return 'Escribí un nombre.'
  if (limpio.length > 60) return 'Hasta 60 caracteres.'
  if (carpetas.some(c => c.ambito === ambito && c.id !== propioId && sinTildes(c.nombre).trim() === sinTildes(limpio))) return 'Ya hay una carpeta con ese nombre.'
  return ''
}

// Datos que se mandan a guardar_ejercicio_pizarra (la RPC valida y controla la revisión).
export function datosParaGuardar(form) {
  const gimnasio = form.ambito === 'gimnasio', lista = v => (v || []).map(x => String(x).trim()).filter(Boolean).slice(0, 20)
  const demoTipo = gimnasio && form.demo_url ? form.demo_tipo : null
  return {
    ambito: form.ambito, tipo: gimnasio ? 'ejercicio' : form.tipo || 'ejercicio', carpeta_id: form.carpeta_id || null,
    fecha: form.fecha || undefined, contenido: (form.contenido || '').trim() || null, descripcion: (form.descripcion || '').trim(),
    cantidad_jugadores: gimnasio || form.cantidad_jugadores === '' || form.cantidad_jugadores == null ? null : Number(form.cantidad_jugadores),
    duracion_minutos: form.duracion_minutos === '' || form.duracion_minutos == null ? null : Number(form.duracion_minutos),
    objetivo: (form.objetivo || '').trim(),
    imagen_url: gimnasio ? null : form.imagen_url || null, link_video: gimnasio ? null : form.link_video || null,
    pizarra: gimnasio ? null : form.pizarra || null, pizarra_miniatura: gimnasio ? '' : form.pizarra_miniatura || '',
    musculos: gimnasio ? lista(form.musculos) : [], material: gimnasio ? lista(form.material) : [],
    tecnica: gimnasio ? (form.tecnica || '').trim() : '',
    demo_tipo: demoTipo, demo_url: demoTipo ? form.demo_url : null, demo_credito: demoTipo ? (form.demo_credito || '').trim() : '',
  }
}
// Errores a mostrar antes de guardar.
export function erroresEjercicio(form) {
  const errores = []
  if (!(form.contenido || '').trim()) errores.push('Poné un nombre.')
  if (form.duracion_minutos !== '' && form.duracion_minutos != null && !(Number(form.duracion_minutos) >= 1 && Number(form.duracion_minutos) <= 600)) errores.push('La duración va de 1 a 600 minutos.')
  if (form.ambito === 'gimnasio' && form.demo_url && !demoValida(form.demo_tipo, form.demo_url)) errores.push(form.demo_tipo === 'youtube' ? 'El link de YouTube no es válido.' : 'La imagen de demostración tiene que estar subida desde acá.')
  return errores
}
