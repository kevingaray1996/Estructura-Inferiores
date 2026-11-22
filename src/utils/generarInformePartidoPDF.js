// Informe técnico de partido (Análisis): PDF armado con jsPDF, horizontal, 5 páginas, como el boceto
// docs/bocetos/Boceto_informe_partido.pdf. Se dibuja con las medidas del boceto (1456 x 816) y jsPDF
// las escala a una página de 842 pt de ancho (A4 acostada de ancho). Los cálculos están en utils/analisis/informePartido.js.

import { jsPDF } from 'jspdf'
import { ANALISTA, ESCUDO_URL, NOMBRE_CLUB, NOMBRE_CLUB_COMPLETO, TORNEO } from '../config/club'
import { cargarImagenDataURL } from './pdf/imagenes'
import { enCapa } from './analisis/mapaAcciones'
import {
  TRAMOS, accionesPorTramo, contraPromedio, formacionAcostada, golesInforme, hitosTiempo, jugadorasInforme,
  lecturaCuando, lecturaDonde, normalizarInforme, numerosPartido, proximoRival, resultadoInforme, textoMinuto, tramoDe, ultimosCinco,
} from './analisis/informePartido'

const W = 1456, H = 816, K = 842 / W
const M = 54, DER = 1402

// Colores (jsPDF necesita RGB). Amarillo y negro del club; rojo y verde solo para «a corregir» y el semáforo del promedio.
const C = {
  negro: [17, 17, 17], blanco: [255, 255, 255], amarillo: [244, 196, 0], amarilloTexto: [201, 152, 0], amarilloFuerte: [224, 172, 0],
  rojo: [214, 58, 58], rojoSuave: [236, 172, 175], verde: [30, 130, 60],
  texto: [20, 20, 20], gris: [105, 105, 105], grisClaro: [160, 160, 160], grisPista: [232, 232, 232], grisBarra: [212, 212, 212],
  fila: [248, 248, 248], linea: [228, 228, 228], lineaOscura: [55, 55, 55],
  cancha: [237, 242, 235], lineaCancha: [140, 168, 146],
}

// ---------- Letras (Barlow, la de la app) ----------

const ARCHIVOS_FUENTE = [
  ['BarlowCondensed-ExtraBoldItalic.ttf', 'BarlowCondensed', 'extrabolditalic'],
  ['BarlowCondensed-Bold.ttf', 'BarlowCondensed', 'bold'],
  ['BarlowCondensed-SemiBold.ttf', 'BarlowCondensed', 'semibold'],
  ['Barlow-Regular.ttf', 'Barlow', 'normal'],
  ['Barlow-SemiBold.ttf', 'Barlow', 'semibold'],
]
const RESPALDO = { 'BarlowCondensed/extrabolditalic': 'bolditalic', 'BarlowCondensed/bold': 'bold', 'BarlowCondensed/semibold': 'bold', 'Barlow/normal': 'normal', 'Barlow/semibold': 'bold' }

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

async function cargarFuentes(doc) {
  const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/')
  try {
    const datos = await Promise.all(ARCHIVOS_FUENTE.map(async ([archivo]) => {
      const res = await fetch(`${base}fonts/${archivo}`)
      if (!res.ok) throw new Error(archivo)
      return aBase64(await res.arrayBuffer())
    }))
    ARCHIVOS_FUENTE.forEach(([archivo, familia, estilo], i) => {
      doc.addFileToVFS(archivo, datos[i])
      doc.addFont(archivo, familia, estilo)
    })
    return true
  } catch {
    return false // sin las letras del club, sale con Helvetica
  }
}

// ---------- Ayudas de dibujo (medidas del boceto) ----------

function lienzo(doc, conFuentes) {
  const fuente = (familia, estilo, px) => {
    if (conFuentes) doc.setFont(familia, estilo)
    else doc.setFont('helvetica', RESPALDO[`${familia}/${estilo}`] || 'normal')
    doc.setFontSize(px * K)
  }
  const ancho = (t, espacio = 0) => doc.getTextWidth(t) + espacio * Math.max(0, t.length - 1)
  // Texto con alineación propia (jsPDF no cuenta el espaciado entre letras al alinear).
  const texto = (t, x, y, { color = C.texto, espacio = 0, alinear = 'left' } = {}) => {
    if (!t) return 0
    const w = ancho(t, espacio)
    const x0 = alinear === 'right' ? x - w : alinear === 'center' ? x - w / 2 : x
    doc.setTextColor(...color)
    doc.text(t, x0, y, espacio ? { charSpace: espacio } : undefined)
    return w
  }
  // Achica la letra hasta que entre en el ancho.
  const entrar = (t, familia, estilo, px, max, espacio = 0) => {
    let tam = px
    fuente(familia, estilo, tam)
    while (tam > 8 && ancho(t, espacio) > max) { tam -= 1; fuente(familia, estilo, tam) }
    return tam
  }
  const rect = (x, y, w, h, relleno, { radio = 0, borde = null, grosor = 1 } = {}) => {
    if (relleno) doc.setFillColor(...relleno)
    if (borde) { doc.setDrawColor(...borde); doc.setLineWidth(grosor) }
    const modo = relleno && borde ? 'FD' : relleno ? 'F' : 'S'
    if (radio) doc.roundedRect(x, y, w, h, radio, radio, modo)
    else doc.rect(x, y, w, h, modo)
  }
  const linea = (x1, y1, x2, y2, color, grosor = 1, guiones = null) => {
    doc.setDrawColor(...color); doc.setLineWidth(grosor)
    if (guiones) doc.setLineDashPattern(guiones, 0)
    doc.line(x1, y1, x2, y2)
    if (guiones) doc.setLineDashPattern([], 0)
  }
  const circulo = (x, y, r, relleno, borde = null, grosor = 1) => {
    if (relleno) doc.setFillColor(...relleno)
    if (borde) { doc.setDrawColor(...borde); doc.setLineWidth(grosor) }
    doc.circle(x, y, r, relleno && borde ? 'FD' : relleno ? 'F' : 'S')
  }
  const triangulo = (x, y, tam, arriba, color) => {
    doc.setFillColor(...color)
    if (arriba) doc.triangle(x, y, x + tam, y, x + tam / 2, y - tam * 0.9, 'F')
    else doc.triangle(x, y - tam * 0.9, x + tam, y - tam * 0.9, x + tam / 2, y, 'F')
  }
  const flecha = (x, y, largo, color, grosor = 1.4) => {
    linea(x, y, x + largo, y, color, grosor)
    doc.setFillColor(...color)
    doc.triangle(x + largo + 1, y, x + largo - 4, y - 3.2, x + largo - 4, y + 3.2, 'F')
  }
  const imagen = (dataUrl, x, y, w, h) => {
    if (!dataUrl) return false
    try {
      doc.addImage(dataUrl, /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG', x, y, w, h)
      return true
    } catch { return false }
  }
  const opacidad = (valor) => doc.setGState(new doc.GState({ opacity: valor, 'stroke-opacity': valor }))
  return { fuente, ancho, texto, entrar, rect, linea, circulo, triangulo, flecha, imagen, opacidad }
}

// Mapa de calor suave: manchas difuminadas de un color, más fuertes donde hay más puntos.
function calorPNG(puntos, rgb, w, h, { desdeX = 0 } = {}) {
  if (!puntos.length || typeof document === 'undefined') return null
  const escala = 600 / w
  const cw = Math.round(w * escala), ch = Math.round(h * escala)
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const radio = cw * 0.085 * (100 / (100 - desdeX))
  for (const p of puntos) {
    const x = ((p.x - desdeX) / (100 - desdeX)) * cw, y = (p.y / 100) * ch
    const g = ctx.createRadialGradient(x, y, 0, x, y, radio)
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.5, 'rgba(0,0,0,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - radio, y - radio, radio * 2, radio * 2)
  }
  const datos = ctx.getImageData(0, 0, cw, ch)
  let max = 0
  for (let i = 3; i < datos.data.length; i += 4) max = Math.max(max, datos.data[i])
  if (!max) return null
  for (let i = 0; i < datos.data.length; i += 4) {
    const a = datos.data[i + 3] / max
    datos.data[i] = rgb[0]; datos.data[i + 1] = rgb[1]; datos.data[i + 2] = rgb[2]
    datos.data[i + 3] = Math.round(Math.pow(a, 0.85) * 0.82 * 255)
  }
  ctx.putImageData(datos, 0, 0)
  return canvas.toDataURL('image/png')
}

// ---------- Textos ----------

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function partesFecha(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number)
  if (!a || !m || !d) return null
  const fecha = new Date(a, m - 1, d)
  const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0')
  return { dia: DIAS[fecha.getDay()], corta: `${dd}/${mm}`, larga: `${dd}/${mm}/${a}`, anio: a }
}
const horaCorta = (hora) => (hora ? String(hora).slice(0, 5) : '')
const condicionDe = (v) => ({ local: 'Local', visitante: 'Visitante' }[String(v || '').toLowerCase()] || '')
function iniciales(nombre) {
  const limpio = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').trim()
  return (limpio.split(/\s+/)[0] || 'RIV').slice(0, 3).toUpperCase()
}

// ---------- Armado ----------

export async function generarInformePartidoPDF(entrada) {
  const {
    analisis, calendario = null, calendarioLista = [], acciones = [], eventosPartido = [], marcas = {},
    citaciones = [], minutos = null, nombreCortoDe = () => '', informe: informeCrudo = {},
    promedio = null, lecturaDondeAuto, lecturaCuandoAuto,
  } = entrada
  const informe = normalizarInforme(informeCrudo)
  const doc = new jsPDF({ orientation: 'landscape', unit: K, format: [W, H], compress: true })
  const conFuentes = await cargarFuentes(doc)
  const L = lienzo(doc, conFuentes)
  const [escudoClub, escudoRival] = await Promise.all([cargarImagenDataURL(ESCUDO_URL), cargarImagenDataURL(calendario?.escudo_url)])

  const rival = analisis?.rival || calendario?.rival || 'Rival'
  const resultado = resultadoInforme(calendario, eventosPartido)
  const fecha = partesFecha(calendario?.fecha || analisis?.fecha)
  const numeroFecha = calendario?.numero_fecha ? `Fecha ${calendario.numero_fecha}` : ''
  const condicion = condicionDe(calendario?.local_visitante)
  const hora = horaCorta(calendario?.hora)
  const marcador = resultado ? `${resultado.propios}-${resultado.rivales}` : 'vs'
  const contexto = {
    linea1: [numeroFecha, condicion].filter(Boolean).join(' · '),
    linea2: [fecha ? `${fecha.dia} ${fecha.corta}` : '', hora].filter(Boolean).join(' · '),
  }

  const pie = (pagina) => {
    L.fuente('BarlowCondensed', 'semibold', 11)
    L.texto(`${NOMBRE_CLUB_COMPLETO.toUpperCase()} · VIDEOANÁLISIS`, M, 795, { color: pagina === 1 ? C.gris : C.grisClaro, espacio: 2.4 })
    if (pagina === 1) L.texto(`ANALISTA: ${ANALISTA.toUpperCase()}`, DER, 795, { color: C.gris, espacio: 2.4, alinear: 'right' })
    else L.texto(`${pagina} / 5`, DER, 795, { color: C.grisClaro, espacio: 2.4, alinear: 'right' })
  }

  const escudoRivalEn = (cx, cy, r, borde) => {
    L.circulo(cx, cy, r, C.blanco, borde, borde ? r * 0.07 : 1)
    if (escudoRival && L.imagen(escudoRival, cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44)) return
    L.fuente('BarlowCondensed', 'extrabolditalic', r * 0.62)
    L.texto(iniciales(rival), cx, cy + r * 0.22, { color: C.negro, alinear: 'center' })
  }

  const cabecera = (seccion) => {
    L.rect(0, 0, W, 92, C.negro)
    L.rect(0, 92, W, 7, C.amarillo)
    L.imagen(escudoClub, M, 22, 64, 64)
    L.fuente('BarlowCondensed', 'semibold', 13)
    L.texto(`INFORME DE PARTIDO · ${seccion}`, 142, 30, { color: C.grisClaro, espacio: 3 })
    const partes = [[`${NOMBRE_CLUB.toUpperCase()} `, C.blanco], [marcador, C.amarillo], [` ${rival.toUpperCase()}`, C.blanco]]
    const tam = L.entrar(partes.map((p) => p[0]).join(''), 'BarlowCondensed', 'extrabolditalic', 46, 920)
    let x = 142
    for (const [t, color] of partes) { L.fuente('BarlowCondensed', 'extrabolditalic', tam); x += L.texto(t, x, 76, { color }) }
    escudoRivalEn(1208, 50, 28, null)
    L.fuente('Barlow', 'normal', 16)
    L.texto(contexto.linea1, DER, 42, { color: C.blanco, alinear: 'right' })
    L.texto(contexto.linea2, DER, 66, { color: C.blanco, alinear: 'right' })
  }

  // Título con una parte en amarillo, como el boceto.
  const titulo = (partes, x, y, px = 32) => {
    L.fuente('BarlowCondensed', 'extrabolditalic', px)
    let cx = x
    for (const [t, amarillo] of partes) cx += L.texto(t, cx, y, { color: amarillo ? C.amarilloTexto : C.texto })
  }
  const rotulo = (t, x, y, color = C.gris) => {
    L.fuente('BarlowCondensed', 'bold', 12.5)
    return L.texto(t, x, y, { color, espacio: 2.4 })
  }

  // Cancha acostada; mitad = solo el campo rival (para los remates).
  const cancha = (x, y, w, h, { mitad = false, calor = null, ataque = true } = {}) => {
    L.rect(x, y, w, h, C.cancha)
    if (calor) L.imagen(calor, x, y, w, h)
    const largo = mitad ? 52.5 : 105
    const mx = (m) => (m / largo) * w, my = (m) => (m / 68) * h
    const lc = C.lineaCancha, g = 1.3
    L.rect(x, y, w, h, null, { borde: lc, grosor: g })
    const areaAlto = my(40.3), chicaAlto = my(18.32)
    L.rect(x + w - mx(16.5), y + (h - areaAlto) / 2, mx(16.5), areaAlto, null, { borde: lc, grosor: g })
    L.rect(x + w - mx(5.5), y + (h - chicaAlto) / 2, mx(5.5), chicaAlto, null, { borde: lc, grosor: g })
    if (!mitad) {
      L.rect(x, y + (h - areaAlto) / 2, mx(16.5), areaAlto, null, { borde: lc, grosor: g })
      L.rect(x, y + (h - chicaAlto) / 2, mx(5.5), chicaAlto, null, { borde: lc, grosor: g })
      L.linea(x + w / 2, y, x + w / 2, y + h, lc, g)
      L.circulo(x + w / 2, y + h / 2, my(9.15), null, lc, g)
    }
    if (ataque) {
      L.fuente('BarlowCondensed', 'bold', 11)
      const t = 'ATAQUE'
      const tw = L.ancho(t, 2)
      L.texto(t, x + w - 34 - tw, y + 19, { color: C.gris, espacio: 2 })
      L.flecha(x + w - 28, y + 15, 14, C.gris, 1.2)
    }
  }
  const puntosDe = (capa, periodo = null) => acciones
    .filter((a) => a.punto && enCapa(a.evento, capa) && (periodo === null || a.periodo === periodo)).map((a) => a.punto)

  // ===== Página 1: portada =====
  L.rect(0, 0, W, H, C.negro)
  if (escudoClub) {
    L.opacidad(0.07)
    L.imagen(escudoClub, 925, 285, 640, 640)
    L.opacidad(1)
  }
  L.fuente('BarlowCondensed', 'semibold', 17)
  L.texto('INFORME DE PARTIDO', W / 2, 60, { color: C.amarillo, espacio: 5, alinear: 'center' })
  L.fuente('BarlowCondensed', 'semibold', 15)
  L.texto([`${TORNEO} ${fecha?.anio || ''}`.trim().toUpperCase(), numeroFecha.toUpperCase()].filter(Boolean).join(' · '), W / 2, 88, { color: C.grisClaro, espacio: 3.5, alinear: 'center' })

  L.circulo(461, 208, 84, C.blanco)
  if (!L.imagen(escudoClub, 461 - 70, 208 - 70, 140, 140)) {
    L.fuente('BarlowCondensed', 'extrabolditalic', 52)
    L.texto('COM', 461, 226, { color: C.negro, alinear: 'center' })
  }
  escudoRivalEn(1020, 208, 84, [200, 200, 200])
  L.entrar(NOMBRE_CLUB.toUpperCase(), 'BarlowCondensed', 'extrabolditalic', 38, 380)
  L.texto(NOMBRE_CLUB.toUpperCase(), 461, 346, { color: C.blanco, alinear: 'center' })
  L.entrar(rival.toUpperCase(), 'BarlowCondensed', 'extrabolditalic', 38, 380)
  L.texto(rival.toUpperCase(), 1020, 346, { color: C.blanco, alinear: 'center' })

  if (resultado) {
    L.fuente('BarlowCondensed', 'bold', 150)
    L.texto(String(resultado.propios), 690, 298, { color: C.blanco, alinear: 'right' })
    L.texto(String(resultado.rivales), 794, 298, { color: C.blanco })
    L.rect(718, 244, 48, 24, C.amarillo, { radio: 3 })
  } else {
    L.fuente('BarlowCondensed', 'bold', 90)
    L.texto('vs', 742, 270, { color: C.grisClaro, alinear: 'center' })
  }

  // Fila de datos del partido (solo los que están cargados).
  const datos = [
    ['FECHA', fecha ? `${fecha.dia} ${fecha.larga}` : ''], ['HORA', hora], ['LUGAR', calendario?.lugar || ''],
    ['CONDICIÓN', condicion], ['ÁRBITRA', informe.arbitra],
  ].filter(([, v]) => v)
  if (datos.length) {
    let tamValor = 18
    const medir = () => datos.reduce((s, [r, v]) => {
      L.fuente('BarlowCondensed', 'bold', 13); const a = L.ancho(r, 2)
      L.fuente('Barlow', 'normal', tamValor); return s + a + 10 + L.ancho(v) + 32
    }, -32)
    while (medir() > 1300 && tamValor > 11) tamValor -= 1
    let x = (W - medir()) / 2
    for (const [r, v] of datos) {
      L.fuente('BarlowCondensed', 'bold', 13); x += L.texto(r, x, 395, { color: C.amarillo, espacio: 2 }) + 10
      L.fuente('Barlow', 'normal', tamValor); x += L.texto(v, x, 395, { color: C.blanco }) + 32
    }
  }

  // Formación
  const formacion = formacionAcostada(citaciones)
  rotulo(`FORMACIÓN${calendario?.formacion ? ` · ${calendario.formacion}` : ''}`, 241, 446, C.grisClaro)
  cancha(241, 458, 300, 195, { ataque: false })
  if (formacion.length) {
    for (const j of formacion) {
      const cx = 241 + (Math.max(3, Math.min(97, j.x)) / 100) * 300, cy = 458 + (Math.max(5, Math.min(95, j.y)) / 100) * 195
      L.circulo(cx, cy, 10, C.amarillo, C.negro, 1.2)
      L.fuente('BarlowCondensed', 'bold', 11)
      L.texto(String(j.dorsal ?? ''), cx, cy + 4, { color: C.negro, alinear: 'center' })
    }
  } else {
    L.fuente('Barlow', 'normal', 13)
    L.texto('Sin formación en Convocados', 391, 560, { color: C.gris, alinear: 'center' })
  }

  // Goles
  rotulo('GOLES', 578, 446, C.grisClaro)
  const goles = golesInforme(eventosPartido, marcas, nombreCortoDe)
  if (goles.length) {
    const alto = Math.min(40, 195 / goles.length)
    goles.forEach((g, i) => {
      const y = 458 + i * alto
      const color = g.propio ? C.amarillo : [130, 130, 130]
      L.fuente('BarlowCondensed', 'bold', 22)
      L.texto(textoMinuto(g.minuto) || '—', 578, y + alto * 0.62, { color })
      L.circulo(645, y + alto * 0.5, 7, g.propio ? C.blanco : [150, 150, 150])
      L.circulo(645, y + alto * 0.5, 2.6, C.negro)
      L.fuente('Barlow', 'normal', 17)
      L.texto(g.texto, 662, y + alto * 0.62, { color: g.propio ? C.blanco : [150, 150, 150] })
      L.linea(578, y + alto, 880, y + alto, C.lineaOscura, 1)
    })
  } else {
    L.fuente('Barlow', 'normal', 17)
    L.texto(resultado ? 'Sin goles cargados en la pestaña Partido' : 'Sin goles', 578, 485, { color: [130, 130, 130] })
  }

  // Contexto
  rotulo('CONTEXTO', 914, 446, C.grisClaro)
  const ultimos = ultimosCinco(calendarioLista, calendario)
  const figura = informe.figura_id ? citaciones.find((c) => c.jugador_id === informe.figura_id) : null
  const proximo = proximoRival(calendarioLista, calendario)
  const filasContexto = [
    ['Posición en la tabla', 'posicion'],
    ['Últimos 5', ultimos.length ? ultimos.join(' ') : '—'],
    ['Figura (cuerpo técnico)', informe.figura_id ? `${nombreCortoDe(informe.figura_id) || 'Jugadora'}${figura?.dorsal ? ` #${figura.dorsal}` : ''}` : '—'],
    ['Próximo rival', proximo ? `vs ${proximo}` : '—'],
  ]
  filasContexto.forEach(([etiqueta, valor], i) => {
    const y = 458 + i * 40
    L.fuente('Barlow', 'normal', 17)
    L.texto(etiqueta, 914, y + 22, { color: [225, 225, 225] })
    L.fuente('BarlowCondensed', 'bold', 21)
    if (valor === 'posicion') {
      const antes = informe.posicion_antes ? `${informe.posicion_antes}°` : '—'
      const despues = informe.posicion_despues ? `${informe.posicion_despues}°` : '—'
      const wD = L.ancho(despues)
      L.texto(despues, 1215, y + 24, { color: C.blanco, alinear: 'right' })
      L.flecha(1215 - wD - 24, y + 17, 13, C.blanco, 1.3)
      L.texto(antes, 1215 - wD - 32, y + 24, { color: C.blanco, alinear: 'right' })
    } else {
      L.texto(valor, 1215, y + 24, { color: i === 2 && informe.figura_id ? C.amarillo : C.blanco, espacio: i === 1 ? 1 : 0, alinear: 'right' })
    }
    L.linea(914, y + 38, 1215, y + 38, C.lineaOscura, 1)
  })
  pie(1)

  // ===== Página 2: resumen =====
  doc.addPage([W, H], 'landscape')
  cabecera('RESUMEN')
  const n = numerosPartido(acciones)
  const fichas = [
    { valor: n.pctPases === null ? '—' : `${n.pctPases}%`, color: C.amarilloFuerte, rotulo: 'PASES CORRECTOS', bajada: `${n.correctos} de ${n.pases}`, comp: contraPromedio(n.pctPases, promedio?.pctPases), masEsMejor: true },
    { valor: String(n.perdidas), color: C.rojo, rotulo: 'PÉRDIDAS', bajada: `${n.perdidasPropio} en campo propio`, comp: contraPromedio(n.perdidas, promedio?.perdidas), masEsMejor: false },
    { valor: String(n.recuperaciones), color: C.negro, rotulo: 'RECUPERACIONES', bajada: `${n.recuperacionesRival} en campo rival`, comp: contraPromedio(n.recuperaciones, promedio?.recuperaciones), masEsMejor: true },
    { valor: `${n.alArco} / ${n.remates}`, color: C.negro, rotulo: 'REMATES AL ARCO', bajada: `${n.goles} ${n.goles === 1 ? 'gol' : 'goles'}`, comp: contraPromedio(n.alArco, promedio?.alArco), masEsMejor: true },
  ]
  fichas.forEach((f, i) => {
    const x = M + i * 343
    L.rect(x, 131, 5, 132, f.color)
    L.fuente('BarlowCondensed', 'extrabolditalic', 80)
    // «—» en gris: menos de 3 pases, sin porcentaje.
    L.texto(f.valor, x + 22, 207, { color: f.valor === '—' ? C.grisClaro : f.color === C.negro ? C.texto : f.color })
    L.fuente('BarlowCondensed', 'bold', 13.5)
    L.texto(f.rotulo, x + 24, 233, { color: C.texto, espacio: 2.6 })
    L.fuente('Barlow', 'normal', 15)
    // Sin promedio (ningún partido completo de la temporada) no hay comparación.
    let cx = x + 24 + L.texto(f.comp ? `${f.bajada} · ` : f.bajada, x + 24, 254, { color: C.gris })
    if (!f.comp) {
      // nada
    } else if (f.comp.signo === 'igual') {
      L.fuente('Barlow', 'semibold', 15)
      L.texto('= promedio', cx, 254, { color: C.texto })
    } else {
      const arriba = f.comp.signo === 'mas'
      const bueno = arriba === f.masEsMejor
      const color = bueno ? C.verde : C.rojo
      L.triangulo(cx + 1, 252, 11, arriba, color)
      cx += 17
      L.fuente('Barlow', 'semibold', 15)
      cx += L.texto(String(f.comp.diferencia), cx, 254, { color })
      L.fuente('Barlow', 'normal', 15)
      L.texto(' vs promedio', cx, 254, { color: C.gris })
    }
  })
  if (promedio?.partidos) {
    L.fuente('Barlow', 'normal', 13)
    L.texto(`Promedio de ${promedio.partidos} ${promedio.partidos === 1 ? 'partido' : 'partidos'} (solo los de la temporada con el análisis completo).`, M, 287, { color: C.gris })
  }

  const claves = informe.claves.filter((c) => c.titulo || c.texto)
  titulo([[claves.length === 3 ? '3 CLAVES ' : 'CLAVES ', false], ['DEL PARTIDO', true]], M, 330)
  if (claves.length) {
    let y = 372
    claves.forEach((c, i) => {
      L.fuente('BarlowCondensed', 'extrabolditalic', 46)
      L.texto(String(i + 1), M, y + 26, { color: C.amarilloFuerte })
      L.fuente('Barlow', 'semibold', 20)
      if (c.titulo) L.texto(c.titulo, 109, y + 4, { color: C.texto })
      L.fuente('Barlow', 'normal', 16)
      const lineas = doc.splitTextToSize(c.texto, 700 * 1).slice(0, 2)
      lineas.forEach((l, j) => L.texto(l, 109, y + (c.titulo ? 30 : 8) + j * 21, { color: [70, 70, 70] }))
      y += 72 + (lineas.length > 1 ? 14 : 0)
    })
  } else {
    L.fuente('Barlow', 'normal', 16)
    L.texto('Sin claves cargadas.', M, 372, { color: C.gris })
  }

  rotulo('PÉRDIDAS · PARTIDO COMPLETO', 892, 312)
  const perdidas = puntosDe('perdidas')
  cancha(892, 323, 508, 328, { calor: calorPNG(perdidas, C.rojo, 508, 328) })
  if (!perdidas.length) { L.fuente('Barlow', 'normal', 14); L.texto('Sin pérdidas con ubicación', 1146, 492, { color: C.gris, alinear: 'center' }) }
  L.fuente('Barlow', 'normal', 14)
  L.texto('Más rojo = más pelotas perdidas', 892, 677, { color: C.gris })
  L.texto('Siempre atacando', DER - 24, 677, { color: C.gris, alinear: 'right' })
  L.flecha(DER - 18, 672, 14, C.gris, 1.2)
  pie(2)

  // ===== Página 3: dónde =====
  doc.addPage([W, H], 'landscape')
  cabecera('DÓNDE')
  titulo([['¿DÓNDE PERDEMOS Y ', false], ['DÓNDE RECUPERAMOS', true], ['?', false]], M, 164)
  const cuadros = [
    ['PÉRDIDAS · 1T', 'perdidas', 1, 55, 198, C.rojo], ['PÉRDIDAS · 2T', 'perdidas', 2, 747, 198, C.rojo],
    ['RECUPERACIONES · 1T', 'recuperaciones', 1, 55, 480, C.amarillo], ['RECUPERACIONES · 2T', 'recuperaciones', 2, 747, 480, C.amarillo],
  ]
  for (const [nombre, capa, periodo, x, y, color] of cuadros) {
    const puntos = puntosDe(capa, periodo)
    const total = acciones.filter((a) => enCapa(a.evento, capa) && a.periodo === periodo).length
    const w = rotulo(`${nombre} `, x, y - 5)
    rotulo(String(total), x + w, y - 5, color === C.rojo ? C.rojo : C.amarilloTexto)
    cancha(x, y, 636, 244, { calor: calorPNG(puntos, color, 636, 244) })
    if (!puntos.length) { L.fuente('Barlow', 'normal', 14); L.texto('Sin acciones con ubicación', x + 318, y + 128, { color: C.gris, alinear: 'center' }) }
  }
  L.fuente('Barlow', 'normal', 16)
  L.texto(informe.lectura_donde || lecturaDondeAuto || lecturaDonde(acciones), M, 756, { color: C.texto })
  pie(3)

  // ===== Página 4: cuándo =====
  doc.addPage([W, H], 'landscape')
  cabecera('CUÁNDO')
  titulo([['¿EN QUÉ MOMENTO ', false], ['CAÍMOS', true], ['?', false]], M, 164)
  rotulo('ACCIONES BIEN / MAL CADA 15 MINUTOS', M, 189)
  const tramos = accionesPorTramo(acciones, marcas)
  const hitos = hitosTiempo(eventosPartido, marcas)
  const X0 = 110, ANCHO_TRAMO = (873 - 110) / 6, BASE = 425, ALTO_MAX = 118
  if (tramos) {
    const max = Math.max(1, ...tramos.flatMap((t) => [t.bien, t.mal]))
    // Goles y cambios sobre la línea de tiempo: en su tramo, proporcional al minuto (el descuento va al final del tramo).
    // Van primero (debajo de las barras) y con los nombres en una franja arriba, para no pisar los números.
    const xHito = (m) => {
      const i = tramoDe(m)
      const inicio = [0, 15, 30, 45, 60, 75][i]
      const frac = m.extra ? 1 : Math.max(0, Math.min(1, (m.valor - inicio) / 15))
      return X0 + ANCHO_TRAMO * (i + frac)
    }
    let ultimoX = -Infinity, nivel = 0
    for (const h of hitos) {
      const x = xHito(h.minuto)
      nivel = x - ultimoX < 130 ? (nivel + 1) % 3 : 0
      ultimoX = x
      const estilo = h.tipo === 'gol_rival' ? [C.texto, [5, 4], C.texto] : h.tipo === 'gol' ? [C.amarilloFuerte, [5, 4], C.amarilloTexto] : [C.grisClaro, [2, 3], C.gris]
      L.linea(x, 213 + nivel * 18, x, 596, estilo[0], 1.3, estilo[1])
      L.fuente('BarlowCondensed', 'bold', 12.5)
      L.texto(h.texto, x + 5, 225 + nivel * 18, { color: estilo[2] })
    }
    L.fuente('BarlowCondensed', 'bold', 13)
    L.texto('BIEN', M, BASE - 55, { color: C.amarilloTexto })
    L.texto('MAL', M, BASE + 63, { color: C.rojo })
    L.linea(X0, BASE, 873, BASE, [150, 150, 150], 1)
    tramos.forEach((t, i) => {
      const cx = X0 + ANCHO_TRAMO * (i + 0.5)
      const hb = (t.bien / max) * ALTO_MAX, hm = (t.mal / max) * ALTO_MAX
      if (hb) L.rect(cx - 24, BASE - hb, 48, hb, C.amarillo)
      if (hm) L.rect(cx - 24, BASE, 48, hm, t.mal > t.bien ? C.rojo : C.rojoSuave)
      L.fuente('BarlowCondensed', 'bold', 18)
      L.rect(cx - 20, BASE - hb - 26, 40, 21, C.blanco)
      L.texto(String(t.bien), cx, BASE - hb - 9, { color: C.texto, alinear: 'center' })
      L.rect(cx - 20, BASE + hm + 5, 40, 21, C.blanco)
      L.texto(String(t.mal), cx, BASE + hm + 22, { color: C.rojo, alinear: 'center' })
      L.fuente('BarlowCondensed', 'bold', 16)
      L.texto(TRAMOS[i], cx, 620, { color: [60, 60, 60], alinear: 'center' })
    })
    L.fuente('Barlow', 'normal', 16)
    L.texto(informe.lectura_cuando || lecturaCuandoAuto || lecturaCuando(tramos, hitos), M, 653, { color: C.texto })
  } else {
    L.fuente('Barlow', 'normal', 16)
    L.texto('Faltan las marcas de tiempo del partido (pestaña Partido): no se pueden armar los tramos.', M, 300, { color: C.gris })
  }

  // Remates (campo rival, atacando a la derecha)
  titulo([['REMATES', false]], 919, 164)
  const remates = acciones.filter((a) => a.remate)
  const alArco = remates.filter((a) => ['gol', 'arco'].includes(a.remate)).length
  const golesRemate = remates.filter((a) => a.remate === 'gol').length
  rotulo(`${remates.length} ${remates.length === 1 ? 'REMATE' : 'REMATES'} · ${alArco} AL ARCO · ${golesRemate} ${golesRemate === 1 ? 'GOL' : 'GOLES'}`, 919, 189)
  cancha(919, 208, 345, 445, { mitad: true, ataque: false })
  const ordenRemate = { afuera: 0, pendiente: 0, arco: 1, gol: 2 }
  for (const a of [...remates].filter((r) => r.punto).sort((p, q) => ordenRemate[p.remate] - ordenRemate[q.remate])) {
    const x = 919 + ((Math.max(50, a.punto.x) - 50) / 50) * 345, y = 208 + (a.punto.y / 100) * 445
    if (a.remate === 'gol') L.circulo(x, y, 9.5, C.amarillo, C.negro, 2.6)
    else if (a.remate === 'arco') L.circulo(x, y, 7, C.amarillo, C.blanco, 1.5)
    else L.circulo(x, y, 7, C.blanco, [120, 120, 120], 1.5)
  }
  L.fuente('Barlow', 'normal', 14)
  let lx = 919
  L.circulo(lx + 6, 672, 6, C.amarillo, C.negro, 2); lx += 16
  lx += L.texto('gol', lx, 677, { color: C.gris }) + 16
  L.circulo(lx + 6, 672, 6, C.amarillo); lx += 16
  lx += L.texto('al arco', lx, 677, { color: C.gris }) + 16
  L.circulo(lx + 6, 672, 6, C.blanco, [120, 120, 120], 1.4); lx += 16
  L.texto('afuera o bloqueado', lx, 677, { color: C.gris })
  pie(4)

  // ===== Página 5: jugadoras =====
  doc.addPage([W, H], 'landscape')
  cabecera('JUGADORAS')
  titulo([['RENDIMIENTO ', false], ['INDIVIDUAL', true]], M, 164)
  const filas = jugadorasInforme(acciones, { citaciones, minutos, nombreDe: nombreCortoDe })
  const columnas = [
    ['% pases', 'pctPases', 301, 100, C.amarillo, C.grisBarra],
    ['Pérdidas', 'perdidas', 582, null, C.rojo, C.rojoSuave],
    ['Recuperaciones', 'recuperaciones', 851, null, C.amarilloFuerte, C.grisBarra],
    ['% duelos ganados', 'pctDuelos', 1119, 100, C.amarillo, C.grisBarra],
  ]
  L.fuente('BarlowCondensed', 'bold', 13.5)
  L.texto('Jugadora', 62, 202, { color: [60, 60, 60], espacio: 1.4 })
  L.texto('Min', 244, 202, { color: [60, 60, 60], espacio: 1.4 })
  for (const [nombre, , x] of columnas) L.texto(nombre, x + 8, 202, { color: [60, 60, 60], espacio: 1.4 })
  L.linea(M, 213, DER, 213, C.texto, 2)
  if (filas.length) {
    const alto = Math.min(41, (735 - 215) / filas.length)
    const maximos = Object.fromEntries(columnas.map(([, clave, , tope]) => [clave, tope || Math.max(1, ...filas.map((f) => f[clave] || 0))]))
    filas.forEach((f, i) => {
      const y = 215 + i * alto
      if (i % 2 === 1) L.rect(M, y, DER - M, alto, C.fila)
      const medio = y + alto / 2
      L.fuente('BarlowCondensed', 'bold', Math.min(21, alto * 0.55))
      L.texto(f.dorsal != null ? String(f.dorsal) : '–', 62, medio + 7, { color: C.amarilloFuerte })
      L.entrar(f.nombre || 'Sin nombre', 'Barlow', 'semibold', Math.min(18, alto * 0.48), 140)
      L.texto(f.nombre || 'Sin nombre', 92, medio + 6, { color: C.texto })
      L.fuente('BarlowCondensed', 'bold', Math.min(17, alto * 0.45))
      L.texto(f.minutos != null ? `${f.minutos}'` : '—', 244, medio + 6, { color: C.gris })
      for (const [, clave, x, , fuerte, suave] of columnas) {
        const valor = f[clave]
        L.rect(x, medio - 4, 136, 8, C.grisPista, { radio: 4 })
        if (valor) L.rect(x, medio - 4, Math.max(8, (valor / maximos[clave]) * 136), 8, f[`${clave}Destacado`] ? fuerte : suave, { radio: 4 })
        L.fuente('BarlowCondensed', 'bold', Math.min(18, alto * 0.47))
        L.texto(valor === null ? '—' : String(valor), x + 146, medio + 6, { color: valor === null ? C.grisClaro : C.texto })
      }
      L.linea(M, y + alto, DER, y + alto, C.linea, 1)
    })
    L.fuente('Barlow', 'normal', 14)
    L.texto(minutos
      ? 'Color fuerte = valor destacado (en amarillo, los mejores; en rojo, más pérdidas que el promedio del equipo). «—» = menos de 3 acciones para el porcentaje. Mínimo 20 minutos para aparecer.'
      : 'Color fuerte = valor destacado (en rojo, más pérdidas que el promedio del equipo). «—» = menos de 3 acciones para el porcentaje. Faltan las marcas: aparecen todas las jugadoras con acciones, sin minutos.',
    M, 215 + filas.length * alto + 26, { color: C.gris })
  } else {
    L.fuente('Barlow', 'normal', 16)
    L.texto('No hay jugadoras para mostrar (mínimo 20 minutos, con las marcas y las titulares cargadas).', M, 250, { color: C.gris })
  }
  pie(5)

  const nombreArchivo = `Informe ${rival} ${calendario?.fecha || analisis?.fecha || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '-')
  if (entrada.guardar !== false) doc.save(`${nombreArchivo}.pdf`)
  return doc
}
