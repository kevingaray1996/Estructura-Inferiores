// Reproductor de playlists (etapa 2): decide qué hacer con el reproductor de YouTube. Lógica pura, sin React ni
// YouTube, para poder probar el paso de un clip a otro aunque sean de partidos (videos) distintos.
import { youtubeEmbed } from './formato.js'

export const VELOCIDADES = Object.freeze([0.5, 1, 2])

// Id de 11 letras de un enlace de YouTube, o '' si no es válido.
export function videoIdDe(url) {
  const embed = youtubeEmbed(url)
  const m = /\/embed\/([a-zA-Z0-9_-]{11})/.exec(embed)
  return m ? m[1] : ''
}

export function indiceValido(total, indice) {
  if (!total) return -1
  return Math.max(0, Math.min(total - 1, Math.floor(Number(indice) || 0)))
}

// Plan para mostrar un clip: si el video es otro, hay que cargarlo; si es el mismo, alcanza con saltar.
// clipActual: el que está cargado (o null). videoActual: id del video cargado en el reproductor.
export function planDeClip(clip, videoActual) {
  if (!clip) return { accion: 'nada' }
  if (!clip.videoId) return { accion: 'sin_video' }
  return clip.videoId === videoActual
    ? { accion: 'saltar', videoId: clip.videoId, inicio: clip.inicio, fin: clip.fin }
    : { accion: 'cargar', videoId: clip.videoId, inicio: clip.inicio, fin: clip.fin }
}

// Qué pasa cuando el video llega al fin del clip.
//   repetir: vuelve al inicio del mismo clip.
//   pausaAlFinal: se queda en pausa (el usuario decide cuándo seguir).
//   si no: pasa al siguiente; si era el último, termina en pausa.
export function alTerminarClip({ indice, total, repetir = false, pausaAlFinal = false }) {
  if (repetir) return { tipo: 'repetir', indice }
  if (pausaAlFinal) return { tipo: 'pausar', indice }
  if (indice + 1 < total) return { tipo: 'siguiente', indice: indice + 1 }
  return { tipo: 'terminar', indice }
}

// ¿Ya llegó al fin del clip? (con un margen chico para no saltearlo por el redondeo del reproductor)
export function llegoAlFin(segundoActual, clip) {
  return Number.isFinite(Number(segundoActual)) && clip && Number(segundoActual) >= clip.fin - 0.15
}

// Atajos del reproductor. Devuelve la orden o null.
export function ordenDeTecla(evento) {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null
  const destino = evento.target
  if (destino && (['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName) || destino.isContentEditable)) return null
  switch (evento.key) {
    case 'ArrowRight': case 'n': case 'N': return 'siguiente'
    case 'ArrowLeft': case 'b': case 'B': return 'anterior'
    case ' ': case 'k': case 'K': return 'pausa'
    case 'r': case 'R': return 'repetir'
    case 'p': case 'P': return 'pausaAlFinal'
    case 'f': case 'F': return 'pantallaCompleta'
    case '1': return 'velocidad:0.5'
    case '2': return 'velocidad:1'
    case '3': return 'velocidad:2'
    case 'Escape': return 'cerrar'
    default: return null
  }
}

// «Clip 3/12 · Salida · Estrella del Sur vs Camioneros · 2T 14'»
export function rotuloClip({ indice, total, etiqueta, partido, minuto }) {
  return [`Clip ${indice + 1}/${total}`, etiqueta, partido, minuto].filter(Boolean).join(' · ')
}

// Minuto para el rótulo: el real (con las marcas del partido) o, si faltan, el del video dentro del tiempo cargado.
export function minutoDelClip(clip, textoReal) {
  if (textoReal) return textoReal
  return `${clip.periodo === 2 ? '2T' : '1T'} ${Math.floor(clip.segundo / 60)}'`
}
