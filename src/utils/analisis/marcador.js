// Marcador tipo transmisión sobre el video de Análisis: reloj del partido, resultado y sigla del rival.
// También lee el minuto del partido escrito a mano («67'», «2T 22'», «45+2'») y lo pasa al segundo del video.
// Lógica pura: sale de las marcas de tiempo y los goles de analisis_partido_eventos.
import { MINUTOS_POR_TIEMPO, leerTiempo, minutoReal } from './eventosPartido.js'
import { formatearTiempo } from './formato.js'

const dosCifras = (n) => String(n).padStart(2, '0')

// Reloj del partido en un segundo del video.
// estado: 'sin_inicio' | 'previa' | 'juego' | 'entretiempo' | 'final'.
// reloj: «22:41» dentro del tiempo, «45+2'» en el descuento, '' fuera de juego.
// falta: la marca que conviene cargar ahí mismo ('inicio_1t' o 'inicio_2t'), o null.
export function relojPartido(segundo, marcas, minutosTiempo = MINUTOS_POR_TIEMPO) {
  const s = Math.max(0, Math.floor(Number(segundo) || 0))
  const m = marcas || {}
  const reglamentario = minutosTiempo * 60
  const enJuego = (periodo, desde) => {
    const pasados = s - desde
    if (pasados < reglamentario) {
      return { estado: 'juego', periodo, etiqueta: `${periodo}T`, reloj: `${dosCifras(Math.floor(pasados / 60))}:${dosCifras(pasados % 60)}`, descuento: 0, falta: null }
    }
    const extra = Math.floor((pasados - reglamentario) / 60) + 1
    return { estado: 'juego', periodo, etiqueta: `${periodo}T`, reloj: `${minutosTiempo}+${extra}'`, descuento: extra, falta: null }
  }
  if (m.inicio_2t != null && s >= m.inicio_2t) {
    if (m.fin_partido != null && s > m.fin_partido) return { estado: 'final', periodo: 2, etiqueta: 'Final', reloj: '', falta: null }
    return enJuego(2, m.inicio_2t)
  }
  if (m.inicio_1t == null) return { estado: 'sin_inicio', periodo: null, etiqueta: 'Marcá el inicio', reloj: '', falta: 'inicio_1t' }
  if (s < m.inicio_1t) return { estado: 'previa', periodo: null, etiqueta: 'Previa', reloj: '', falta: null }
  if (m.fin_1t != null && s > m.fin_1t) {
    return { estado: 'entretiempo', periodo: 1, etiqueta: 'Entretiempo', reloj: '', falta: m.inicio_2t == null ? 'inicio_2t' : null }
  }
  return enJuego(1, m.inicio_1t)
}

// Goles hasta ese segundo del video (inclusive): { propios, rivales }.
export function resultadoHasta(eventos, segundo) {
  const s = Number(segundo)
  let propios = 0
  let rivales = 0
  for (const e of eventos || []) {
    if (e.tipo !== 'gol' || !(Number(e.segundo) <= s)) continue
    if (e.equipo === 'rival') rivales += 1
    else propios += 1
  }
  return { propios, rivales }
}

// Palabras que no sirven para la sigla («Club Atlético Platense» → PLA).
const RELLENO = new Set(['club', 'atletico', 'asociacion', 'social', 'deportivo', 'deportiva', 'sportivo', 'ca', 'c.a.', 'cd', 'c.d.',
  'cs', 'c.s.', 'y', 'de', 'del', 'la', 'el', 'los', 'las', 'futbol', 'femenino'])
const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// Tres letras en mayúscula para el marcador («Estrella del Sur» → EST). '' si no hay nombre.
export function siglaEquipo(nombre) {
  const palabras = sinAcentos(nombre).trim().split(/\s+/).filter(Boolean)
  const util = palabras.find((p) => !RELLENO.has(p.toLowerCase()) && /[a-z0-9]/i.test(p)) || palabras[0] || ''
  return util.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()
}

// Minuto del partido escrito a mano → segundo del video.
// Acepta «67'», «45+2'», «90+3'», «2T 22'», «1T 45+1'» (con ’ o ´ también). Sin apóstrofo ni «T» no es un minuto
// (los números sueltos siguen siendo segundos del video, como antes).
// Devuelve { segundo } o { error }; null si el texto no tiene forma de minuto.
export function leerMinutoPartido(texto, marcas, minutosTiempo = MINUTOS_POR_TIEMPO) {
  const limpio = String(texto ?? '').trim().toLowerCase().replace(/[’´`]/g, "'").replace(/\s+/g, ' ')
  let periodo
  let minuto
  const conTiempo = limpio.match(/^([12]) ?t ?(\d{1,3})(?: ?\+ ?(\d{1,2}))? ?'?$/)
  const corrido = limpio.match(/^(\d{1,3})(?: ?\+ ?(\d{1,2}))? ?'$/) || limpio.match(/^(\d{1,3}) ?\+ ?(\d{1,2})$/)
  if (conTiempo) {
    periodo = Number(conTiempo[1])
    minuto = Number(conTiempo[2]) + Number(conTiempo[3] || 0)
    if (conTiempo[3] && Number(conTiempo[2]) !== minutosTiempo) return { error: `El descuento se escribe desde el ${minutosTiempo}: por ejemplo ${periodo}T ${minutosTiempo}+2'.` }
  } else if (corrido) {
    const base = Number(corrido[1])
    const extra = Number(corrido[2] || 0)
    if (extra) {
      if (base !== minutosTiempo && base !== minutosTiempo * 2) return { error: `El descuento se escribe como ${minutosTiempo}+2' o ${minutosTiempo * 2}+3'.` }
      periodo = base === minutosTiempo ? 1 : 2
      minuto = minutosTiempo + extra
    } else {
      if (base > minutosTiempo * 2) return { error: `Para el descuento escribilo como ${minutosTiempo * 2}+${base - minutosTiempo * 2}'.` }
      periodo = base <= minutosTiempo ? 1 : 2
      minuto = base - (periodo === 2 ? minutosTiempo : 0)
    }
  } else {
    return null
  }
  if (!(minuto >= 1)) return { error: "El primer minuto de cada tiempo es el 1'." }
  const inicio = periodo === 1 ? marcas?.inicio_1t : marcas?.inicio_2t
  if (inicio == null) {
    return { error: `Para escribir el minuto del partido falta la marca «${periodo === 1 ? 'Inicio del partido' : 'Inicio del 2T'}». Podés escribir el tiempo del video (mm:ss).` }
  }
  return { segundo: inicio + (minuto - 1) * 60 }
}

// Minuto del partido o tiempo del video («12:34», «1:02:03» o segundos). Devuelve { segundo } o { error }.
export function leerTiempoPartido(texto, marcas) {
  const minuto = leerMinutoPartido(texto, marcas)
  if (minuto) return minuto
  const segundo = leerTiempo(texto)
  if (segundo == null) return { error: "Escribí el minuto del partido (67', 2T 22' o 45+2') o el tiempo del video (mm:ss)." }
  return { segundo }
}

// Para mostrar un momento: primero el minuto del partido y, chiquito, el tiempo del video.
// { partido: «2T 22'» | null, video: «58:40» }. Sin las marcas (o fuera de juego), partido queda null.
export function tiemposDe(segundo, marcas) {
  const real = minutoReal(segundo, marcas)
  return { partido: real?.estado === 'juego' ? real.texto : null, video: formatearTiempo(segundo) }
}

// Texto plano del mismo momento: «2T 22' (video 58:40)» o «58:40».
export function textoTiempos(segundo, marcas) {
  const t = tiemposDe(segundo, marcas)
  return t.partido ? `${t.partido} (video ${t.video})` : t.video
}
