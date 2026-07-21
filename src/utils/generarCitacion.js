import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'
import { FORMACIONES } from '../data/formaciones'

const AZUL = [37, 99, 235]
const AZUL_CLARO = [99, 143, 246]
const NAVY = [26, 35, 50]
const VERDE_CANCHA = [19, 66, 48]
const GRIS = [107, 114, 128]
const GRIS_CLARO = [243, 244, 246]
const GRIS_PLACEHOLDER = [156, 163, 175]
const BLANCO = [255, 255, 255]
const NEGRO = [23, 28, 38]

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

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

// Escudo cuadrado con esquinas redondeadas y una letra/sigla centrada.
function dibujarEscudo(doc, cx, cy, size, colorFondo, letra, colorTexto) {
  doc.setFillColor(...colorFondo)
  doc.roundedRect(cx - size / 2, cy - size / 2, size, size, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size * 0.32)
  doc.setTextColor(...colorTexto)
  doc.text(letra, cx, cy + size * 0.11, { align: 'center' })
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

  const escudoClubDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  const categoriaNombre = partido.categorias?.nombre || ''
  const nombreLocalVisitante = partido.local_visitante === 'visitante' ? 'de visitante' : 'de local'

  // ===== Encabezado azul =====
  const headerH = 108
  doc.setFillColor(...AZUL)
  doc.rect(0, 0, pageWidth, headerH, 'F')

  const iconoSize = 46
const iconoCX = margin + iconoSize / 2
const iconoCY = 40
if (escudoClubDataUrl) {
  try {
    const formato = formatoDeDataUrl(escudoClubDataUrl)
    doc.addImage(
      escudoClubDataUrl,
      formato,
      iconoCX - iconoSize / 2,
      iconoCY - iconoSize / 2,
      iconoSize,
      iconoSize
    )
  } catch {
    doc.setFillColor(...AZUL_CLARO)
    doc.roundedRect(iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize, 10, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...BLANCO)
    doc.text('CC', iconoCX, iconoCY + 4, { align: 'center' })
  }
} else {
  doc.setFillColor(...AZUL_CLARO)
  doc.roundedRect(iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize, 10, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...BLANCO)
  doc.text('CC', iconoCX, iconoCY + 4, { align: 'center' })
}

  const tituloX = margin + iconoSize + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.setTextColor(...BLANCO)
  doc.text('CITACIÓN', tituloX, iconoCY - 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(214, 224, 250)
  const subtituloHeader = categoriaNombre
    ? `Partido ${nombreLocalVisitante} · Categoría ${categoriaNombre}`
    : `Partido ${nombreLocalVisitante}`
  doc.text(subtituloHeader, tituloX, iconoCY + 16)

  if (categoriaNombre || partido.formacion) {
    const etiqueta = [categoriaNombre.toUpperCase(), partido.formacion].filter(Boolean).join(' · ')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const wTxt = doc.getTextWidth(etiqueta)
    const wPill = wTxt + 26
    const pillH = 26
    doc.setFillColor(...AZUL_CLARO)
    doc.roundedRect(pageWidth - margin - wPill, iconoCY - pillH / 2, wPill, pillH, 13, 13, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(etiqueta, pageWidth - margin - wPill / 2, iconoCY + 4, { align: 'center' })
  }

  // ===== Fila de equipos: escudo propio · VS · escudo rival =====
  const filaEquiposY = headerH + 48
  const shieldSize = 40

  const propioShieldCX = margin + shieldSize / 2
if (escudoClubDataUrl) {
  try {
    const formato = formatoDeDataUrl(escudoClubDataUrl)
    doc.addImage(
      escudoClubDataUrl,
      formato,
      propioShieldCX - shieldSize / 2,
      filaEquiposY - shieldSize / 2,
      shieldSize,
      shieldSize
    )
  } catch {
    dibujarEscudo(doc, propioShieldCX, filaEquiposY, shieldSize, NAVY, 'CC', BLANCO)
  }
} else {
  dibujarEscudo(doc, propioShieldCX, filaEquiposY, shieldSize, NAVY, 'CC', BLANCO)
}
doc.setFont('helvetica', 'bold')
doc.setFontSize(12)
doc.setTextColor(...NEGRO)
doc.text('Club Comunicaciones', propioShieldCX + shieldSize / 2 + 12, filaEquiposY + 4, {
  maxWidth: 210,
})

  const rivalShieldCX = pageWidth - margin - shieldSize / 2
  if (escudoRivalDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoRivalDataUrl)
      doc.addImage(
        escudoRivalDataUrl,
        formato,
        rivalShieldCX - shieldSize / 2,
        filaEquiposY - shieldSize / 2,
        shieldSize,
        shieldSize
      )
    } catch {
      dibujarEscudo(doc, rivalShieldCX, filaEquiposY, shieldSize, GRIS_PLACEHOLDER, (partido.rival?.[0] || '?').toUpperCase(), BLANCO)
    }
  } else {
    dibujarEscudo(doc, rivalShieldCX, filaEquiposY, shieldSize, GRIS_PLACEHOLDER, (partido.rival?.[0] || '?').toUpperCase(), BLANCO)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NEGRO)
  doc.text(partido.rival || 'Rival', rivalShieldCX - shieldSize / 2 - 12, filaEquiposY + 4, {
    align: 'right',
    maxWidth: 210,
  })

  const vsCX = pageWidth / 2
  doc.setFillColor(...NEGRO)
  doc.circle(vsCX, filaEquiposY, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BLANCO)
  doc.text('VS', vsCX, filaEquiposY + 4, { align: 'center' })

  // ===== Franja FECHA / HORA / LUGAR =====
  const { diaSemana, fechaCorta } = formatearFecha(partido.fecha)
  const franjaY = filaEquiposY + 42
  const franjaH = 46
  const gap = 12
  const franjaW = (pageWidth - margin * 2 - gap * 2) / 3
  const datosFranja = [
    { label: 'FECHA', valor: fechaCorta ? `${diaSemana.slice(0, 1)}${diaSemana.slice(1).toLowerCase()} ${fechaCorta}` : '—' },
    { label: 'HORA', valor: partido.hora ? `${partido.hora} hs` : '—' },
    { label: 'LUGAR', valor: partido.lugar || '—' },
  ]
  datosFranja.forEach((d, i) => {
    const bx = margin + i * (franjaW + gap)
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(bx, franjaY, franjaW, franjaH, 8, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AZUL)
    doc.text(d.label, bx + 12, franjaY + 17)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NEGRO)
    doc.text(String(d.valor), bx + 12, franjaY + 34, { maxWidth: franjaW - 22 })
  })

  // ===== Dos columnas: cancha (izq) + titulares (der) =====
  const ordenados = [...citaciones].sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
  const suplentes = ordenados.filter((c) => !c.titular)
  const slots = FORMACIONES[partido.formacion] || []

  const contenidoY = franjaY + franjaH + 26
  const canchaX = margin
  const canchaW = 190
  const titularesX = canchaX + canchaW + 24
  const titularesW = pageWidth - margin - titularesX

  const filaAltura = 32
  const filaGap = 5
  const canchaH = canchaW * 1.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...AZUL)
  doc.text('TITULARES', titularesX, contenidoY)

  // --- Cancha ---
  doc.setFillColor(...VERDE_CANCHA)
  doc.roundedRect(canchaX, contenidoY + 6, canchaW, canchaH, 10, 10, 'F')
  doc.setDrawColor(...BLANCO)
  doc.setLineWidth(0.7)
  doc.roundedRect(canchaX + 8, contenidoY + 14, canchaW - 16, canchaH - 16, 4, 4)
  doc.line(canchaX + 8, contenidoY + 6 + canchaH / 2, canchaX + canchaW - 8, contenidoY + 6 + canchaH / 2)
  doc.circle(canchaX + canchaW / 2, contenidoY + 6 + canchaH / 2, canchaW * 0.14)
  doc.setFillColor(...BLANCO)
  doc.circle(canchaX + canchaW / 2, contenidoY + 6 + canchaH / 2, 1.4, 'F')

  slots.forEach((slot) => {
    const citacion = citaciones.find(
      (c) => String(c.posicion_cancha) === String(slot.codigo) && c.titular
    )
    const px = canchaX + (slot.x / 100) * canchaW
    const py = contenidoY + 6 + (slot.y / 100) * canchaH

    const numero = citacion?.dorsal ? String(citacion.dorsal) : '–'
    doc.setFillColor(...AZUL)
    doc.circle(px, py, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BLANCO)
    doc.text(numero, px, py + 3, { align: 'center' })

    const inicialNombre = citacion?.jugadores?.nombre ? `${citacion.jugadores.nombre[0]}.` : ''
    const etiqueta = citacion ? `${citacion.jugadores?.apellido || ''} ${inicialNombre}`.trim() : '–'
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.3)
    const anchoTexto = Math.min(doc.getTextWidth(etiqueta) + 8, 60)
    doc.setFillColor(...BLANCO)
    doc.roundedRect(px - anchoTexto / 2, py + 13, anchoTexto, 11, 3, 3, 'F')
    doc.setTextColor(...NEGRO)
    doc.text(etiqueta.slice(0, 16), px, py + 21, { align: 'center', maxWidth: anchoTexto - 2 })
  })

  // --- Lista de titulares ---
  let yFila = contenidoY + 36
  slots.forEach((slot) => {
    const citacion = citaciones.find(
      (c) => String(c.posicion_cancha) === String(slot.codigo) && c.titular
    )

    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(titularesX, yFila - filaAltura + 8, titularesW, filaAltura, 8, 8, 'F')

    const badgeCX = titularesX + 20
    const badgeCY = yFila - filaAltura / 2 + 8
    doc.setFillColor(...AZUL)
    doc.circle(badgeCX, badgeCY, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BLANCO)
    doc.text(citacion?.dorsal ? String(citacion.dorsal) : '–', badgeCX, badgeCY + 3, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...NEGRO)
    const nombreJugador = citacion
      ? `${citacion.jugadores?.apellido || ''}, ${citacion.jugadores?.nombre || ''}`
      : '–'
    doc.text(nombreJugador, badgeCX + 20, badgeCY + 4, { maxWidth: titularesW * 0.5 })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(slot.label.toUpperCase(), titularesX + titularesW - 12, badgeCY + 3, { align: 'right' })

    yFila += filaAltura + filaGap
  })

  // ===== Suplentes =====
  const suplentesY = Math.max(contenidoY + 6 + canchaH, yFila - filaGap) + 30
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...AZUL)
  doc.text('SUPLENTES', margin, suplentesY)

  if (suplentes.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text('Sin suplentes cargados', margin, suplentesY + 20)
  } else {
    const columnas = 3
    const supGap = 12
    const supW = (pageWidth - margin * 2 - supGap * (columnas - 1)) / columnas
    const supH = 26

    suplentes.forEach((c, i) => {
      const col = i % columnas
      const fila = Math.floor(i / columnas)
      const bx = margin + col * (supW + supGap)
      const by = suplentesY + 16 + fila * (supH + 6)

      doc.setFillColor(...GRIS_CLARO)
      doc.roundedRect(bx, by, supW, supH, 7, 7, 'F')

      const numCX = bx + 17
      const numCY = by + supH / 2
      doc.setFillColor(...AZUL)
      doc.circle(numCX, numCY, 9, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...BLANCO)
      doc.text(c.dorsal ? String(c.dorsal) : '-', numCX, numCY + 3, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...NEGRO)
      const nombreCompleto = `${c.jugadores?.apellido || ''}, ${c.jugadores?.nombre || ''}`
      doc.text(nombreCompleto, numCX + 15, numCY + 3, { maxWidth: supW - 34 })
    })
  }

  doc.save(`Citacion_vs_${partido.rival.replace(/\s+/g, '_')}.pdf`)
}
