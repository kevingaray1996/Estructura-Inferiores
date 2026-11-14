// Etapa K: exportar la jugada. Lógica pura (sin navegador): formatos, línea de tiempo del video, zona de la jugada,
// cámara y lo que se dibuja en cada instante. El dibujo y la codificación están en pizarraRender.js.
import { duracionTotal, limitar, SUPERFICIES } from './pizarra.js'
import { alturas as calcularAlturas, animar, enMovimiento, estelas as calcularEstelas, flechasAutomaticas } from './pizarraAnimacion.js'
import { ACERCAMIENTO_FOCO, focoYCamara, opacidades, subtitulo } from './pizarraExplicar.js'

export const FORMATOS_VIDEO = {
  horizontal: { ancho: 1920, alto: 1080, nombre: 'Horizontal 16:9', sufijo: '16x9' },
  vertical: { ancho: 1080, alto: 1920, nombre: 'Vertical 9:16', sufijo: '9x16' },
}
// PNG en alta resolución: el doble del video.
export const ESCALA_PNG = 2
export const FPS = 30
export const PLACA_SEGUNDOS = 2.5 // placa de inicio y de cierre
export const QUIETO_INICIO = .8 // la jugada arranca quieta para que se lea el primer paso
export const QUIETO_FINAL = 1.5 // y termina quieta en el último
export const FUNDIDO = .4 // fundido desde y hacia negro en cada cambio de tramo
export const DURACION_MAXIMA = 180 // segundos de video (incluye placas)
export const ACERCAMIENTO_MAXIMO = 2.2 // la zona de la jugada nunca acerca más que esto

// Placa por defecto: la del documento o, sin título, el nombre del ejercicio.
export function placaDe(doc, nombre = '') {
  const p = doc.placa || {}
  return { titulo: (p.titulo || '').trim() || (nombre || '').trim().slice(0, 80), analista: (p.analista || '').trim() }
}

export function nombreArchivo(titulo, extension, sufijo = '') {
  const base = (titulo || 'jugada').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'jugada'
  return `${base}${sufijo ? `-${sufijo}` : ''}.${extension}`
}

// Tramos del video: placa de inicio, jugada (con un momento quieto al principio y al final) y placa de cierre.
export function lineaVideo(doc, { placas = true } = {}) {
  const velocidad = doc.velocidad > 0 ? doc.velocidad : 1
  const jugada = doc.pasos.length > 1 ? duracionTotal(doc) / velocidad : 0
  const tramos = []
  let t = 0
  const sumar = (tipo, largo) => { tramos.push({ tipo, desde: t, hasta: t + largo }); t += largo }
  if (placas) sumar('inicio', PLACA_SEGUNDOS)
  sumar('jugada', QUIETO_INICIO + jugada + QUIETO_FINAL)
  if (placas) sumar('cierre', PLACA_SEGUNDOS)
  const total = Math.min(t, DURACION_MAXIMA)
  return { tramos, total, cuadros: Math.max(1, Math.round(total * FPS)), velocidad, recortado: t > DURACION_MAXIMA }
}

// Qué se ve en el segundo `s` del video: el tramo, el tiempo de la jugada (en segundos del documento) y la
// opacidad del fundido (1 = imagen plena, 0 = negro).
export function instanteVideo(linea, s) {
  const tramo = linea.tramos.find(t => s < t.hasta) || linea.tramos.at(-1)
  const dentro = s - tramo.desde, largo = tramo.hasta - tramo.desde
  const conFundido = linea.tramos.length > 1
  const entrada = conFundido && tramo !== linea.tramos[0] ? limitar(dentro / FUNDIDO, 0, 1) : 1
  const salida = conFundido && tramo !== linea.tramos.at(-1) ? limitar((largo - dentro) / FUNDIDO, 0, 1) : 1
  const tiempo = tramo.tipo === 'jugada' ? Math.max(0, (dentro - QUIETO_INICIO) * linea.velocidad) : 0
  return { tipo: tramo.tipo, tiempo, opacidad: Math.min(entrada, salida) }
}

// Zona de la jugada: el rectángulo (en metros) que ocupan las fichas, materiales y trazos en todos los pasos, con
// margen, ajustado a la proporción de la cancha. Devuelve la cámara { x, y, escala } que la encuadra.
export function zonaJugada(doc, margen = 5) {
  const [w, h] = SUPERFICIES[doc.superficie]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const sumar = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py) }
  for (const paso of doc.pasos) for (const e of doc.elementos) {
    const p = paso.poses[e.id]
    if (!p || paso.ocultos?.includes(e.id)) continue
    const x = p.x * w / 100, y = p.y * h / 100
    sumar(x, y)
    if (e.dx || e.dy) sumar(x + e.dx * w / 100, y + e.dy * h / 100)
    for (const q of e.puntos || []) sumar(x + q.x * w / 100, y + q.y * h / 100)
  }
  if (!Number.isFinite(x0)) return { x: w / 2, y: h / 2, escala: 1 }
  const bw = Math.max(x1 - x0 + margen * 2, w / ACERCAMIENTO_MAXIMO), bh = Math.max(y1 - y0 + margen * 2, h / ACERCAMIENTO_MAXIMO)
  const escala = limitar(Math.min(w / bw, h / bh), 1, ACERCAMIENTO_MAXIMO)
  return encuadrar(w, h, (x0 + x1) / 2, (y0 + y1) / 2, escala)
}

function encuadrar(w, h, x, y, escala) {
  const mx = w / (2 * escala), my = h / (2 * escala)
  return { x: limitar(x, mx, w - mx), y: limitar(y, my, h - my), escala }
}

// Cámara del cuadro: parte de la zona de la jugada (o de la cancha entera) y, si el paso tiene foco, se acerca a esa
// jugadora como en el visor, nunca menos que la zona.
export function camaraCuadro(doc, explicacion, poses, zona) {
  const [w, h] = SUPERFICIES[doc.superficie]
  const base = zona || { x: w / 2, y: h / 2, escala: 1 }
  const peso = explicacion.foco?.peso || 0, pose = peso ? poses[explicacion.foco.id] : null
  if (!pose) return base
  const escala = base.escala + (Math.max(base.escala, ACERCAMIENTO_FOCO) - base.escala) * peso
  return encuadrar(w, h, base.x + (pose.x * w / 100 - base.x) * peso, base.y + (pose.y * h / 100 - base.y) * peso, escala)
}

// Todo lo que se dibuja en un cuadro de la jugada. `tiempo` en segundos del documento; con `indice` (y tiempo null)
// es la foto quieta de ese paso (PNG). Mismo cálculo que el editor al reproducir.
export function cuadroJugada(doc, { tiempo = null, indice = 0, zona = null, estela = 'estela', flechas = false } = {}) {
  const animado = tiempo !== null && doc.pasos.length > 1
  const total = duracionTotal(doc), ultimo = doc.pasos.length - 1
  const cuadro = animado ? animar(doc, Math.min(tiempo, total)) : null
  const poses = cuadro ? cuadro.poses : doc.pasos[Math.min(indice, ultimo)].poses
  const paso = cuadro ? (tiempo >= total ? ultimo : cuadro.indice) : Math.min(indice, ultimo)
  const instante = animado ? Math.min(tiempo, total) : null
  const explicacion = focoYCamara(doc, instante, paso, poses)
  let automaticas = null
  if (flechas) {
    const movimiento = animado ? enMovimiento(doc, instante) : null
    automaticas = flechasAutomaticas(doc, animado ? Math.min(movimiento.pausa ? movimiento.paso : movimiento.paso + 1, ultimo) : paso)
  }
  return {
    poses, paso,
    alturas: animado ? calcularAlturas(doc, instante) : null,
    estelas: animado ? calcularEstelas(doc, instante, estela) : null,
    automaticas,
    opacidades: opacidades(doc, instante, paso),
    foco: explicacion.foco,
    camara: camaraCuadro(doc, explicacion, poses, zona),
    subtitulo: subtitulo(doc, instante, paso),
  }
}

// Orientación de la cancha en el cuadro: en el video vertical la cancha va de pie (ataque hacia arriba), como en el
// celular; en el horizontal, acostada. Devuelve el documento a dibujar y el giro para PizarraCancha.
export function vistaDelFormato(doc, formato) {
  if (formato === 'vertical') return { vista: doc.orientacion === 'vertical' ? doc : { ...doc, orientacion: 'vertical' }, giro: doc.orientacion === 'vertical' ? 90 : -90 }
  return { vista: doc.orientacion === 'horizontal' ? doc : { ...doc, orientacion: 'horizontal' }, giro: 90 }
}

// Proporción (ancho / alto) del SVG de la cancha, igual que el viewBox de PizarraCancha (3 m de margen por lado).
export function proporcionCancha(vista) {
  const [w, h] = SUPERFICIES[vista.superficie]
  return vista.orientacion === 'vertical' ? (h + 6) / (w + 6) : (w + 6) / (h + 6)
}

// Dónde va la cancha y el subtítulo dentro del cuadro (en píxeles del cuadro).
// Con `conSubtitulo` (la jugada tiene textos), se reserva una franja debajo de la cancha: el subtítulo nunca tapa fichas.
export function disposicion(ancho, alto, proporcion, conSubtitulo = true) {
  const u = Math.min(ancho, alto) / 1080 // unidad: 1 px en 1080p
  const cabecera = Math.round(150 * u), margen = Math.round(28 * u), franja = conSubtitulo ? Math.round(118 * u) : 0
  const libreW = ancho - margen * 2, libreH = alto - cabecera - margen - franja
  let cw = libreW, ch = cw / proporcion
  if (ch > libreH) { ch = libreH; cw = ch * proporcion }
  // La cancha y la franja del subtítulo quedan centradas en el alto que sobra.
  const sobra = libreH - ch
  const cancha = { x: Math.round((ancho - cw) / 2), y: Math.round(cabecera + sobra / 2), w: Math.round(cw), h: Math.round(ch) }
  const subtitulo = { x: ancho / 2, y: cancha.y + cancha.h + franja / 2 + 6 * u, ancho: ancho - margen * 2, encima: false }
  return { u, cabecera, margen, cancha, subtitulo }
}
export const tieneSubtitulos = doc => doc.pasos.some(p => (p.texto || '').trim())
