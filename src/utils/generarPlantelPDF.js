import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'

const AZUL = [23, 23, 23]
const AZUL_CLARO = [251, 191, 36]
const NAVY = [26, 35, 50]
const GRIS = [107, 114, 128]
const GRIS_CLARO = [243, 244, 246]
const GRIS_PLACEHOLDER = [156, 163, 175]
const BLANCO = [255, 255, 255]
const NEGRO = [23, 28, 38]

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const ORDEN_POSICIONES = [
  'Delantero centro',
  'Extremo izquierdo',
  'Extremo derecho',
  'Volante ofensivo',
  'Mediocampista central',
  'Lateral izquierdo',
  'Lateral derecho',
  'Defensor central',
  'Arquero',
]

async function cargarImagenDataURL(url) {
  if (!url) return null
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

function dibujarEscudo(doc, cx, cy, size, colorFondo, letra, colorTexto) {
  doc.setFillColor(...colorFondo)
  doc.roundedRect(cx - size / 2, cy - size / 2, size, size, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size * 0.32)
  doc.setTextColor(...colorTexto)
  doc.text(letra, cx, cy + size * 0.11, { align: 'center' })
}

function dibujarAvatarCircular(doc, dataUrl, cx, cy, radio, iniciales) {
  if (dataUrl) {
    try {
      const formato = formatoDeDataUrl(dataUrl)
      doc.saveGraphicsState()
      doc.circle(cx, cy, radio, null)
      doc.clip()
      doc.discardPath()
      doc.addImage(dataUrl, formato, cx - radio, cy - radio, radio * 2, radio * 2)
      doc.restoreGraphicsState()
      return true
    } catch {
      // sigue al placeholder
    }
  }

  doc.setFillColor(...AZUL)
  doc.circle(cx, cy, radio, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(radio * 0.8)
  doc.setTextColor(...BLANCO)
  doc.text(iniciales || '–', cx, cy + radio * 0.28, { align: 'center' })
  return false
}

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ''}${apellido?.[0] || ''}`.toUpperCase()
}

export async function generarPlantelPDF() {
  const { data: jugadores, error } = await supabase
    .from('jugadores')
    .select('id, nombre, apellido, foto_url, posicion, categorias(nombre)')
    .order('apellido')

  if (error) {
    console.error(error)
    alert('No se pudo generar el PDF del plantel.')
    return
  }

  const plantel = (jugadores || []).filter((j) => j && (j.nombre || j.apellido || j.posicion))

  if (plantel.length === 0) {
    alert('Todavía no hay jugadoras cargadas para exportar.')
    return
  }

  const fotosPorJugador = {}
  await Promise.all(
    plantel.map(async (jugador) => {
      if (jugador.foto_url) {
        fotosPorJugador[jugador.id] = await cargarImagenDataURL(jugador.foto_url)
      }
    })
  )

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  const escudoClubDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  function nuevaPagina() {
    doc.addPage()
    dibujarHeader(doc, pageWidth, margin)
    return 85
  }

  function dibujarHeader(doc, width, leftMargin) {
    const headerH = 92
    doc.setFillColor(...AZUL)
    doc.rect(0, 0, width, headerH, 'F')
    doc.setFillColor(...AZUL_CLARO)
    doc.rect(0, headerH - 5, width, 5, 'F')

    const iconoSize = 46
    const iconoCX = leftMargin + iconoSize / 2
    const iconoCY = 38

    if (escudoClubDataUrl) {
      try {
        const formato = formatoDeDataUrl(escudoClubDataUrl)
        doc.addImage(escudoClubDataUrl, formato, iconoCX - iconoSize / 2, iconoCY - iconoSize / 2, iconoSize, iconoSize)
      } catch {
        dibujarEscudo(doc, iconoCX, iconoCY, iconoSize, NAVY, 'CC', BLANCO)
      }
    } else {
      dibujarEscudo(doc, iconoCX, iconoCY, iconoSize, NAVY, 'CC', BLANCO)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...BLANCO)
    doc.text('PLANTEL', leftMargin + iconoSize + 16, iconoCY - 2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(...AZUL_CLARO)
    doc.text('Club Comunicaciones', leftMargin + iconoSize + 16, iconoCY + 16)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setFillColor(...AZUL_CLARO)
    const totalTexto = `${plantel.length} jugadoras`
    const wTxt = doc.getTextWidth(totalTexto)
    const pillW = wTxt + 24
    const pillX = width - leftMargin - pillW
    doc.roundedRect(pillX, 30, pillW, 28, 14, 14, 'F')
    doc.setTextColor(...AZUL)
    doc.text(totalTexto, pillX + pillW / 2, 47, { align: 'center' })
  }

  dibujarHeader(doc, pageWidth, margin)

  let y = 125

  const secciones = []
  for (const posicion of ORDEN_POSICIONES) {
    const items = plantel.filter((j) => (j.posicion || '').trim() === posicion)
    if (items.length > 0) {
      secciones.push({ titulo: posicion, items })
    }
  }

  const sinPosicion = plantel.filter((j) => !j.posicion || !j.posicion.trim())
  if (sinPosicion.length > 0) {
    secciones.push({ titulo: 'Sin posición asignada', items: sinPosicion })
  }

  for (const seccion of secciones) {
    if (y > pageHeight - 90) {
      y = nuevaPagina()
    }

    doc.setFillColor(...NEGRO)
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 6, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...AZUL_CLARO)
    doc.text(seccion.titulo, margin + 12, y + 14)
    y += 32

    for (const jugador of seccion.items) {
      if (y > pageHeight - 64) {
        y = nuevaPagina()
      }

      const avatarCx = margin + 18
      const avatarCy = y + 16
      const avatarRadio = 16
      const fotoDataUrl = fotosPorJugador[jugador.id]

      dibujarAvatarCircular(doc, fotoDataUrl, avatarCx, avatarCy, avatarRadio, iniciales(jugador.nombre, jugador.apellido))

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...NEGRO)
      doc.text(`${jugador.apellido || ''}, ${jugador.nombre || ''}`.trim(), margin + 42, y + 19)

      y += 26
    }

    y += 10
  }

  doc.save('plantel.pdf')
}
