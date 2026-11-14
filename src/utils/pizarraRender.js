// Etapa K: dibujo de cada cuadro (cancha + cabecera + subtítulo + placas) en un canvas y codificación del MP4 con
// mediabunny. Se importa solo al exportar (import dinámico desde el editor), junto con mediabunny y react-dom/server.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PizarraCancha from '../components/PizarraCancha'
import { cuadroJugada, disposicion, ESCALA_PNG, FORMATOS_VIDEO, FPS, instanteVideo, lineaVideo, proporcionCancha, tieneSubtitulos, vistaDelFormato, zonaJugada } from './pizarraVideo.js'

const ESCUDO = '/Escudo simplificado.png'
const CLUB = 'Club Comunicaciones'
// Tipografía de respaldo dentro del SVG: una imagen SVG no ve las fuentes de la página.
const FUENTE_SVG = 'Arial Narrow, Arial, Helvetica, sans-serif'

// --- Recursos -----------------------------------------------------------------------------------------------------
const cargarImagen = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('No se pudo cargar una imagen.')); img.src = src })

async function aDataUrl(url) {
  const r = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!r.ok) throw Error('foto')
  const blob = await r.blob()
  return new Promise((resolve, reject) => { const f = new FileReader(); f.onload = () => resolve(f.result); f.onerror = reject; f.readAsDataURL(blob) })
}

// Colores y fuentes del tema leídos de la página (los tokens --ui-* y --pizarra-*), las fotos de las fichas como
// data: (una imagen SVG no carga recursos externos; si una foto no se puede leer, la ficha queda con su número) y
// el escudo del club.
export async function prepararRecursos(raiz, fotos = null) {
  const estilo = getComputedStyle(raiz || document.documentElement)
  const token = n => estilo.getPropertyValue(n).trim()
  const fotosData = {}
  await Promise.all(Object.entries(fotos || {}).map(async ([id, url]) => { try { fotosData[id] = await aDataUrl(url) } catch { /* sin foto: número */ } }))
  let escudo
  try { escudo = await cargarImagen(ESCUDO) } catch { escudo = null }
  const fuente = token('--pizarra-fuente') || token('--fuente-titulo') || 'sans-serif'
  const fuenteTexto = getComputedStyle(document.body).fontFamily || 'sans-serif'
  try { await Promise.all([document.fonts?.load(`700 64px ${fuente}`), document.fonts?.load(`600 32px ${fuenteTexto}`)]) } catch { /* fuente del sistema */ }
  return {
    token, fotos: fotosData, escudo, fuente, fuenteTexto,
    colores: {
      fondo: token('--ui-fondo-pagina'), superficie: token('--ui-superficie'), texto: token('--ui-texto'), secundario: token('--ui-texto-secundario'),
      acento: token('--ui-acento'), borde: token('--ui-borde'), cesped: token('--pizarra-cesped'),
      subFondo: token('--pizarra-subtitulo-fondo'), subTexto: token('--pizarra-subtitulo-texto'),
    },
  }
}

// --- Cancha -------------------------------------------------------------------------------------------------------
// SVG de la cancha en un instante, con los tokens reemplazados por sus valores (la imagen no ve las hojas de estilo).
export function svgCancha(vista, giro, cuadro, recursos, ancho, alto) {
  let texto = renderToStaticMarkup(createElement(PizarraCancha, {
    doc: vista, poses: cuadro.poses, giro, alturas: cuadro.alturas, estelas: cuadro.estelas, automaticas: cuadro.automaticas,
    opacidades: cuadro.opacidades, foco: cuadro.foco, camara: cuadro.camara, fotos: recursos.fotos,
  }))
  texto = texto.replace(/var\((--[\w-]+)\)/g, (todo, nombre) => {
    if (nombre === '--pizarra-fuente' || nombre === '--fuente-titulo') return FUENTE_SVG
    return recursos.token(nombre) || todo
  })
  return texto.replace(/^<svg /, `<svg width="${ancho}" height="${alto}" `)
}

async function imagenSvg(texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml;charset=utf-8' }))
  try { return await cargarImagen(url) } finally { URL.revokeObjectURL(url) }
}

// --- Dibujo del cuadro ----------------------------------------------------------------------------------------------
function redondeado(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h) }

// Corta el texto en renglones que entren en `ancho` (como mucho `maximo`, el último con "…").
export function renglones(ctx, texto, ancho, maximo = 3) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean), salida = []
  let linea = ''
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p
    if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba
    else { salida.push(linea); linea = p }
  }
  if (linea) salida.push(linea)
  if (salida.length > maximo) { salida.length = maximo; salida[maximo - 1] = `${salida[maximo - 1].replace(/\s+\S*$/, '')}…` }
  return salida
}

function dibujarEscudo(ctx, recursos, cx, cy, alto) {
  if (!recursos.escudo) return
  const w = alto * recursos.escudo.naturalWidth / recursos.escudo.naturalHeight
  ctx.drawImage(recursos.escudo, cx - w / 2, cy - alto / 2, w, alto)
}

function cabecera(ctx, recursos, placa, d, ancho) {
  const { u, cabecera: alto, margen } = d, c = recursos.colores
  const escudo = alto * .62
  dibujarEscudo(ctx, recursos, margen + escudo / 2, alto / 2, escudo)
  const x = margen + (recursos.escudo ? escudo * .9 + 24 * u : 0)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = c.texto; ctx.font = `700 ${Math.round(52 * u)}px ${recursos.fuente}`
  const [titulo = ''] = renglones(ctx, placa.titulo || 'Jugada', ancho - x - margen, 1)
  ctx.fillText(titulo, x, alto / 2 + 6 * u)
  ctx.fillStyle = c.secundario; ctx.font = `600 ${Math.round(26 * u)}px ${recursos.fuenteTexto}`
  ctx.fillText([CLUB, placa.analista].filter(Boolean).join(' · '), x, alto / 2 + 44 * u)
  ctx.fillStyle = c.acento; ctx.fillRect(margen, alto - 6 * u, ancho - margen * 2, 4 * u)
}

function subtituloEn(ctx, recursos, texto, d) {
  if (!texto) return
  const { u, subtitulo: s } = d, c = recursos.colores
  ctx.font = `700 ${Math.round(42 * u)}px ${recursos.fuente}`
  const lineas = renglones(ctx, texto, s.ancho - 60 * u, d.vertical ? 3 : 2), alto = 50 * u
  const w = Math.min(s.ancho, Math.max(...lineas.map(l => ctx.measureText(l).width)) + 60 * u), h = lineas.length * alto + 24 * u
  const y = s.y - h / 2
  ctx.fillStyle = c.subFondo; redondeado(ctx, s.x - w / 2, y, w, h, 18 * u); ctx.fill()
  ctx.fillStyle = c.subTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  lineas.forEach((l, i) => ctx.fillText(l, s.x, y + 12 * u + alto * (i + .5)))
}

// Placa de inicio o de cierre: escudo, título y analista sobre el fondo del club.
export function dibujarPlaca(ctx, recursos, placa, tipo, ancho, alto) {
  const c = recursos.colores, u = Math.min(ancho, alto) / 1080, vertical = alto > ancho
  ctx.fillStyle = c.fondo; ctx.fillRect(0, 0, ancho, alto)
  const escudo = (tipo === 'inicio' ? 300 : 240) * u
  const cy = alto / 2 - (vertical ? 260 : 150) * u
  dibujarEscudo(ctx, recursos, ancho / 2, cy, escudo)
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  let y = cy + escudo / 2 + 110 * u
  const titulo = placa.titulo || 'Jugada'
  if (tipo === 'inicio') {
    ctx.fillStyle = c.texto; ctx.font = `700 ${Math.round(96 * u)}px ${recursos.fuente}`
    for (const l of renglones(ctx, titulo, ancho - 160 * u, 3)) { ctx.fillText(l, ancho / 2, y); y += 100 * u }
    ctx.fillStyle = c.acento; ctx.fillRect(ancho / 2 - 90 * u, y - 50 * u, 180 * u, 8 * u); y += 40 * u
    ctx.fillStyle = c.secundario; ctx.font = `600 ${Math.round(38 * u)}px ${recursos.fuenteTexto}`
    if (placa.analista) { ctx.fillText(`Análisis: ${placa.analista}`, ancho / 2, y); y += 54 * u }
    ctx.fillText(CLUB, ancho / 2, y)
  } else {
    ctx.fillStyle = c.texto; ctx.font = `700 ${Math.round(80 * u)}px ${recursos.fuente}`
    ctx.fillText(CLUB, ancho / 2, y); y += 70 * u
    ctx.fillStyle = c.acento; ctx.fillRect(ancho / 2 - 90 * u, y - 30 * u, 180 * u, 8 * u); y += 50 * u
    ctx.fillStyle = c.secundario; ctx.font = `600 ${Math.round(40 * u)}px ${recursos.fuenteTexto}`
    for (const l of renglones(ctx, titulo, ancho - 160 * u, 2)) { ctx.fillText(l, ancho / 2, y); y += 52 * u }
    if (placa.analista) ctx.fillText(`Análisis: ${placa.analista}`, ancho / 2, y + 6 * u)
  }
}

// Un cuadro de la jugada completo: fondo, cabecera, cancha y subtítulo.
async function dibujarJugada(ctx, recursos, opciones, cuadro, ancho, alto, cache) {
  const { vista, giro, placa } = opciones, c = recursos.colores
  const d = { ...disposicion(ancho, alto, proporcionCancha(vista), opciones.conSubtitulo), vertical: alto > ancho }
  const clave = JSON.stringify([cuadro.poses, cuadro.alturas, cuadro.estelas, cuadro.opacidades, cuadro.foco, cuadro.camara, cuadro.automaticas])
  if (!cache || cache.clave !== clave) {
    const img = await imagenSvg(svgCancha(vista, giro, cuadro, recursos, d.cancha.w, d.cancha.h))
    if (cache) { cache.clave = clave; cache.img = img } else cache = { img }
  }
  ctx.fillStyle = c.fondo; ctx.fillRect(0, 0, ancho, alto)
  cabecera(ctx, recursos, placa, d, ancho)
  ctx.save(); redondeado(ctx, d.cancha.x, d.cancha.y, d.cancha.w, d.cancha.h, 24 * d.u); ctx.clip()
  ctx.fillStyle = c.cesped; ctx.fillRect(d.cancha.x, d.cancha.y, d.cancha.w, d.cancha.h)
  ctx.drawImage(cache.img, d.cancha.x, d.cancha.y, d.cancha.w, d.cancha.h)
  ctx.restore()
  subtituloEn(ctx, recursos, cuadro.subtitulo, d)
}

function opcionesDibujo(doc, formato, { placa, zona = true, estela = 'estela', flechas = false }) {
  const { vista, giro } = vistaDelFormato(doc, formato)
  return { vista, giro, placa, estela, flechas, zona: zona ? zonaJugada(doc) : null, conSubtitulo: tieneSubtitulos(doc) }
}

// --- PNG ------------------------------------------------------------------------------------------------------------
// Foto del paso `indice` en alta resolución, con cabecera y el subtítulo del paso.
export async function exportarPng(doc, { formato = 'horizontal', indice = 0, recursos, ...resto }) {
  const { ancho, alto } = FORMATOS_VIDEO[formato], W = ancho * ESCALA_PNG, H = alto * ESCALA_PNG
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const o = opcionesDibujo(doc, formato, resto)
  const cuadro = cuadroJugada(doc, { indice, zona: o.zona, estela: o.estela, flechas: o.flechas })
  await dibujarJugada(canvas.getContext('2d'), recursos, o, cuadro, W, H, null)
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('No se pudo generar la imagen.')), 'image/png'))
}

// --- Video ----------------------------------------------------------------------------------------------------------
// Preferimos H.264 (avc): es el que abren WhatsApp, iPhone y cualquier reproductor.
const PREFERENCIA_CODEC = ['avc', 'hevc', 'vp9', 'av1']

export async function exportarVideo(doc, { formato = 'horizontal', placas = true, recursos, progreso = () => {}, cancelado = () => false, ...resto }) {
  const mb = await import('mediabunny')
  const { ancho, alto } = FORMATOS_VIDEO[formato]
  const canvas = document.createElement('canvas'); canvas.width = ancho; canvas.height = alto
  const ctx = canvas.getContext('2d')
  const o = opcionesDibujo(doc, formato, resto)
  const linea = lineaVideo(doc, { placas })
  const salida = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
  const soportados = salida.format.getSupportedVideoCodecs()
  const codec = await mb.getFirstEncodableVideoCodec(PREFERENCIA_CODEC.filter(c => soportados.includes(c)), { width: ancho, height: alto })
  if (!codec) throw Error('Este navegador no puede generar video. Probá con Chrome, Edge o Safari actualizados.')
  const fuente = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 })
  salida.addVideoTrack(fuente, { frameRate: FPS })
  await salida.start()
  // Las placas son fijas: se dibujan una vez y en cada cuadro solo cambia el fundido.
  const placasListas = {}
  const placaEn = tipo => {
    if (!placasListas[tipo]) { const p = document.createElement('canvas'); p.width = ancho; p.height = alto; dibujarPlaca(p.getContext('2d'), recursos, o.placa, tipo, ancho, alto); placasListas[tipo] = p }
    return placasListas[tipo]
  }
  const cache = { clave: null, img: null }, jugada = document.createElement('canvas')
  jugada.width = ancho; jugada.height = alto
  try {
    for (let i = 0; i < linea.cuadros; i++) {
      if (cancelado()) { await salida.cancel(); return null }
      const s = i / FPS, ahora = instanteVideo(linea, s)
      let imagen
      if (ahora.tipo === 'jugada') {
        const cuadro = cuadroJugada(doc, { tiempo: ahora.tiempo, zona: o.zona, estela: o.estela, flechas: o.flechas })
        await dibujarJugada(jugada.getContext('2d'), recursos, o, cuadro, ancho, alto, cache)
        imagen = jugada
      } else imagen = placaEn(ahora.tipo)
      ctx.globalAlpha = 1; ctx.fillStyle = recursos.colores.fondo; ctx.fillRect(0, 0, ancho, alto)
      ctx.globalAlpha = ahora.opacidad; ctx.drawImage(imagen, 0, 0); ctx.globalAlpha = 1
      await fuente.add(s, 1 / FPS)
      progreso((i + 1) / linea.cuadros)
    }
    await salida.finalize()
  } catch (e) {
    if (salida.state !== 'canceled' && salida.state !== 'finalized') await salida.cancel().catch(() => {})
    throw e
  }
  return { blob: new Blob([salida.target.buffer], { type: 'video/mp4' }), segundos: linea.total, recortado: linea.recortado }
}
