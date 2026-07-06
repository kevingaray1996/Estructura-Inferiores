import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient'
import { FORMACIONES } from '../data/formaciones'

const NAVY = [26, 35, 50]
const NAVY_CLARO = [42, 53, 72]
const VERDE_CANCHA = [24, 58, 42]
const GRIS = [90, 100, 115]

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

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 32

  // ===== Barra superior =====
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageWidth, 8, 'F')

  // ===== Encabezado: club / categoría =====
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS)
  doc.text('ESTRUCTURA INFERIORES', margin, 36)

  if (partido.categorias?.nombre) {
    doc.setFontSize(10)
    doc.text(partido.categorias.nombre.toUpperCase(), pageWidth - margin, 36, { align: 'right' })
  }

  // ===== Caja de datos del partido =====
  const cajaY = 50
  const cajaH = 44
  doc.setFillColor(...NAVY)
  doc.roundedRect(margin, cajaY, pageWidth - margin * 2, cajaH, 6, 6, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text(`vs ${partido.rival}`, margin + 16, cajaY + 27)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(210, 215, 225)
  const infoLinea = [
    partido.fecha,
    partido.hora,
    partido.lugar,
    partido.local_visitante ? (partido.local_visitante === 'local' ? 'Local' : 'Visitante') : null,
  ]
    .filter(Boolean)
    .join('   ·   ')
  doc.text(infoLinea, pageWidth - margin - 16, cajaY + 27, { align: 'right' })

  // ===== Layout: suplentes a la izquierda, cancha a la derecha =====
  const contenidoY = cajaY + cajaH + 24
  const colIzqX = margin
  const colIzqW = 150
  const canchaX = colIzqX + colIzqW + 20
  const canchaW = pageWidth - margin - canchaX
  const canchaY = contenidoY
  const canchaH = 430

  const ordenados = [...citaciones].sort((a, b) => (a.dorsal || 99) - (b.dorsal || 99))
  const suplentes = ordenados.filter((c) => !c.titular)

  // --- Columna suplentes ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text('SUPLENTES', colIzqX, contenidoY)

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.5)
  doc.line(colIzqX, contenidoY + 6, colIzqX + colIzqW, contenidoY + 6)

  let ySup = contenidoY + 24
  doc.setFontSize(10)
  suplentes.forEach((c) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(c.dorsal ? String(c.dorsal) : '-', colIzqX, ySup)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.text(`${c.jugadores?.apellido || ''}, ${c.jugadores?.nombre || ''}`, colIzqX + 22, ySup)
    ySup += 18
  })
  if (suplentes.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRIS)
    doc.text('Sin suplentes cargados', colIzqX, ySup)
  }

  // --- Cancha ---
  doc.setFillColor(...VERDE_CANCHA)
  doc.roundedRect(canchaX, canchaY, canchaW, canchaH, 8, 8, 'F')

  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.6)
  doc.line(canchaX, canchaY + canchaH / 2, canchaX + canchaW, canchaY + canchaH / 2)
  doc.circle(canchaX + canchaW / 2, canchaY + canchaH / 2, canchaW * 0.16)

  // arco propio (abajo)
  const arcoW = canchaW * 0.4
  doc.rect(canchaX + (canchaW - arcoW) / 2, canchaY + canchaH - canchaH * 0.08, arcoW, canchaH * 0.08)

  const slots = FORMACIONES[partido.formacion] || []
  slots.forEach((slot) => {
    const citacion = citaciones.find(
      (c) => String(c.posicion_cancha) === String(slot.codigo) && c.titular
    )
    const px = canchaX + (slot.x / 100) * canchaW
    const py = canchaY + (slot.y / 100) * canchaH

    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...NAVY)
    doc.setLineWidth(1.2)
    doc.circle(px, py, 13, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    const numeroCirculo = citacion?.dorsal ? String(citacion.dorsal) : ''
    doc.text(numeroCirculo, px, py + 4, { align: 'center' })

    if (citacion) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(255, 255, 255)
      const nombreLinea = `${citacion.jugadores?.apellido || ''}`.toUpperCase().slice(0, 16)
      doc.text(nombreLinea, px, py + 22, { align: 'center' })
    }
  })

  // ===== Pie: formación =====
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  if (partido.formacion) {
    doc.text(partido.formacion, canchaX + canchaW / 2, canchaY + canchaH + 22, { align: 'center' })
  }

  doc.setDrawColor(...NAVY)
  doc.setFillColor(...NAVY)
  doc.rect(0, doc.internal.pageSize.getHeight() - 6, pageWidth, 6, 'F')

  doc.save(`Citacion_vs_${partido.rival.replace(/\s+/g, '_')}.pdf`)
}