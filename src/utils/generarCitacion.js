import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'
import { FORMACIONES } from '../data/formaciones'

const NAVY = [26, 35, 50]
const VERDE = [74, 222, 128]
const VERDE_OSCURO = [21, 61, 44]
const CANCHA_LINEA = [255, 255, 255]
const GRIS = [90, 100, 115]
const GRIS_CLARO = [235, 238, 243]
const BLANCO = [255, 255, 255]

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']

function formatearFecha(fechaStr) {
  if (!fechaStr) return { diaSemana: '', fechaCorta: '' }
  const [anio, mes, dia] = fechaStr.split('-')
  const d = new Date(Number(anio), Number(mes) - 1, Number(dia))
  const diaSemana = DIAS[d.getDay()] || ''
  return { diaSemana, fechaCorta: `${dia}/${mes}` }
}

async function cargarImagenDataURL(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function formatoDeDataUrl(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '')
  return match ? match[1].toUpperCase() : 'PNG'
}

// Escudo propio: escudo vectorial simple (pentágono tipo insignia)
function dibujarEscudoPropio(doc, cx, cy, hw = 15) {
  doc.setFillColor(...NAVY)
  doc.setDrawColor(...VERDE)
  doc.setLineWidth(1.3)
  doc.lines(
    [
      [2 * hw, 0],
      [0, hw * 2],
      [-hw, hw * 1.45],
      [-hw, -hw * 1.45],
    ],
    cx - hw,
    cy - hw * 1.65,
    [1, 1],
    'FD',
    true
  )
}

// Placeholder para escudo del rival cuando todavía no se cargó imagen
function dibujarEscudoPlaceholder(doc, cx, cy, hw = 15) {
  doc.setDrawColor(...GRIS)
  doc.setLineWidth(1)
  doc.lines(
    [
      [2 * hw, 0],
      [0, hw * 2],
      [-hw, hw * 1.45],
      [-hw, -hw * 1.45],
    ],
    cx - hw,
    cy - hw * 1.65,
    [1, 1],
    'D',
    true
  )
}

// Camiseta con número, en vez de un simple círculo
function dibujarCamiseta(doc, px, py, numero) {
  const hw = 12
  doc.setFillColor(...BLANCO)
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.1)
  // Mangas: casquetes redondeados
  doc.roundedRect(px - hw - 6, py - 9, 8, 11, 3, 3, 'FD')
  doc.roundedRect(px + hw - 2, py - 9, 8, 11, 3, 3, 'FD')
  // Cuerpo (tapa la unión con las mangas)
  doc.roundedRect(px - hw, py - 10, hw * 2, 26, 6, 6, 'FD')
  // Cuello (muesca)
  doc.setFillColor(...VERDE_OSCURO)
  doc.triangle(px - 4, py - 10, px + 4, py - 10, px, py - 4, 'F')
  // Número
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text(numero, px, py + 6, { align: 'center' })
}

export async function generarCitacionPDF(partidoId) {
  const { data: partido } = await supabase
    .from('partidos')
    .select('*, categorias(nombre)')
    .eq('id', partidoId)
    .single()

  const { data: citaciones } = await supabase
    .from('citaciones')
    .select('*, jugadores(nombre, apellido)')
    .eq('partido_id', partidoId)

  if (!partido || !citaciones || citaciones.length === 0) {
    alert('Todavía no hay convocatoria cargada para este partido.')
    return
  }

  const escudoRivalDataUrl = partido.escudo_url ? await cargarImagenDataURL(partido.escudo_url) : null

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 34

  // ===== Barra superior (acento navy + verde) =====
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageWidth, 9, 'F')
  doc.setFillColor(...VERDE)
  doc.rect(0, 9, pageWidth, 3, 'F')

  // ===== Encabezado: club / categoría =====
  let y = 34
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text('ESTRUCTURA INFERIORES', margin, y)

  if (partido.categorias?.nombre) {
    const etiqueta = `${partido.categorias.nombre.toUpperCase()} DIVISIÓN`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const w = doc.getTextWidth(etiqueta) + 20
    doc.setFillColor(...NAVY)
    doc.roundedRect(pageWidth - margin - w, y - 13, w, 19, 9, 9, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(etiqueta, pageWidth - margin - w / 2, y, { align: 'center' })
  }

  // ===== Cartel de escudos: propio vs rival =====
  const cartelY = y + 20
  const cartelH = 90
  doc.setFillColor(...NAVY)
  doc.roundedRect(margin, cartelY, pageWidth - margin * 2, cartelH, 8, 8, 'F')

  const centroCartelY = cartelY + 40
  const escudoIzqX = margin + 60
  const escudoDerX = pageWidth - margin - 60

  dibujarEscudoPropio(doc, escudoIzqX, centroCartelY, 15)

  doc.setFillColor(...BLANCO)
  doc.circle(pageWidth / 2, centroCartelY, 15, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text('VS', pageWidth / 2, centroCartelY + 4, { align: 'center' })

  if (escudoRivalDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoRivalDataUrl)
      doc.addImage(escudoRivalDataUrl, formato, escudoDerX - 15, centroCartelY - 15, 30, 30)
    } catch {
      dibujarEscudoPlaceholder(doc, escudoDerX, centroCartelY, 15)
    }
  } else {
    dibujarEscudoPlaceholder(doc, escudoDerX, centroCartelY, 15)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BLANCO)
  doc.text('ESTRUCTURA INF.', escudoIzqX, centroCartelY + 32, { align: 'center', maxWidth: 100 })
  doc.text(partido.rival.toUpperCase(), escudoDerX, centroCartelY + 32, { align: 'center', maxWidth: 100 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 208, 220)
  const subtitulo = [
    partido.local_visitante ? (partido.local_visitante === 'local' ? 'Partido de local' : 'Partido de visitante') : null,
    partido.categorias?.nombre ? `Categoría ${partido.categorias.nombre}` : null,
  ]
    .filter(Boolean)
    .join('   ·   ')
  doc.text(subtitulo, pageWidth / 2, cartelY + cartelH - 10, { align: 'center' })

  // ===== Franja de datos rápidos: FECHA / HORA / LUGAR =====
  const { diaSemana, fechaCorta } = formatearFecha(partido.fecha)
  const franjaY = cartelY + cartelH + 14
  const franjaH = 44
  const gap = 10
  const franjaW = (pageWidth - margin * 2 - gap * 2) / 3
  const datosFranja = [
    { label: 'FECHA', valor: fechaCorta ? `${diaSemana} ${fechaCorta}` : '—' },
    { label: 'HORA', valor: partido.hora ? `${partido.hora} hs` : '—' },
    { label: 'LUGAR', valor: partido.lugar || '—' },
  ]
  datosFranja.forEach((d, i) => {
    const bx = margin + i * (franjaW + gap)
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(bx, franjaY, franjaW, franjaH, 6, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(d.label, bx + 10, franjaY + 15)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    doc.text(String(d.valor), bx + 10, franjaY + 32, { maxWidth: franjaW - 20 })
  })

  // ===== Layout: suplentes a la izquierda, cancha a la derecha =====
  const contenidoY = franjaY + franjaH + 20
  const colIzqX = margin
  const colIzqW = 148
  const canchaX = colIzqX + colIzqW + 18
  const canchaW = pageWidth - margin - canchaX
  const canchaY = contenidoY
  const footerReserva = 34
  const canchaH = pageHeight - footerReserva - 30 - canchaY

  const ordenados = [...citaciones].sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
  const suplentes = ordenados.filter((c) => !c.titular)

  // --- Columna suplentes ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...NAVY)
  doc.text('SUPLENTES', colIzqX, contenidoY)

  doc.setDrawColor(...VERDE)
  doc.setLineWidth(2)
  doc.line(colIzqX, contenidoY + 6, colIzqX + 28, contenidoY + 6)

  let ySup = contenidoY + 26
  const filaAltura = 22
  suplentes.forEach((c, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...GRIS_CLARO)
      doc.roundedRect(colIzqX - 4, ySup - 14, colIzqW + 4, filaAltura, 4, 4, 'F')
    }
    doc.setFillColor(...NAVY)
    doc.circle(colIzqX + 9, ySup - 4, 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...BLANCO)
    doc.text(c.dorsal ? String(c.dorsal) : '-', colIzqX + 9, ySup - 1, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(30, 35, 45)
    const nombreCompleto = `${c.jugadores?.apellido || ''}, ${c.jugadores?.nombre || ''}`
    doc.text(nombreCompleto, colIzqX + 24, ySup, { maxWidth: colIzqW - 26 })
    ySup += filaAltura
  })
  if (suplentes.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text('Sin suplentes cargados', colIzqX, ySup)
  }

  // --- Cancha ---
  doc.setFillColor(...VERDE_OSCURO)
  doc.roundedRect(canchaX, canchaY, canchaW, canchaH, 10, 10, 'F')

  doc.setDrawColor(...CANCHA_LINEA)
  doc.setLineWidth(0.7)
  doc.roundedRect(canchaX + 10, canchaY + 10, canchaW - 20, canchaH - 20, 4, 4)
  doc.line(canchaX + 10, canchaY + canchaH / 2, canchaX + canchaW - 10, canchaY + canchaH / 2)
  doc.circle(canchaX + canchaW / 2, canchaY + canchaH / 2, canchaW * 0.15)
  doc.setFillColor(...CANCHA_LINEA)
  doc.circle(canchaX + canchaW / 2, canchaY + canchaH / 2, 1.6, 'F')

  // arco propio (abajo) + área chica
  const arcoW = canchaW * 0.42
  const areaW = canchaW * 0.26
  doc.rect(canchaX + (canchaW - arcoW) / 2, canchaY + canchaH - 10 - canchaH * 0.09, arcoW, canchaH * 0.09)
  doc.rect(canchaX + (canchaW - areaW) / 2, canchaY + canchaH - 10 - canchaH * 0.035, areaW, canchaH * 0.035)

  // arco rival (arriba) + área chica
  doc.rect(canchaX + (canchaW - arcoW) / 2, canchaY + 10, arcoW, canchaH * 0.09)
  doc.rect(canchaX + (canchaW - areaW) / 2, canchaY + 10 + canchaH * 0.09 - canchaH * 0.005, areaW, canchaH * 0.005)

  const slots = FORMACIONES[partido.formacion] || []
  slots.forEach((slot) => {
    const citacion = citaciones.find(
      (c) => String(c.posicion_cancha) === String(slot.codigo) && c.titular
    )
    const px = canchaX + (slot.x / 100) * canchaW
    const py = canchaY + (slot.y / 100) * canchaH

    const numero = citacion?.dorsal ? String(citacion.dorsal) : '–'
    dibujarCamiseta(doc, px, py, numero)

    const inicialNombre = citacion?.jugadores?.nombre ? `${citacion.jugadores.nombre[0]}.` : ''
    const etiqueta = citacion
      ? `${citacion.jugadores?.apellido || ''} ${inicialNombre}`.trim().toUpperCase()
      : slot.label.toUpperCase()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    const anchoTexto = doc.getTextWidth(etiqueta) + 10
    doc.setFillColor(...NAVY)
    doc.roundedRect(px - anchoTexto / 2, py + 21, anchoTexto, 12, 3, 3, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(etiqueta.slice(0, 18), px, py + 29.5, { align: 'center' })
  })

  // ===== Pie de página =====
  const footerY = pageHeight - footerReserva
  doc.setFillColor(...NAVY)
  doc.rect(0, footerY, pageWidth, footerReserva, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BLANCO)
  doc.text('ESTRUCTURA INFERIORES', margin, footerY + footerReserva / 2 + 3)

  if (partido.formacion) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...VERDE)
    doc.text(partido.formacion, pageWidth - margin, footerY + footerReserva / 2 + 3, { align: 'right' })
  }

  doc.save(`Citacion_vs_${partido.rival.replace(/\s+/g, '_')}.pdf`)
}
