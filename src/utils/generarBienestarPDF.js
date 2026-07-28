import { jsPDF } from 'jspdf'
import { cargarDatosBienestar } from './bienestar'

const NEGRO = [23, 23, 23]
const AMARILLO = [251, 191, 36]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const TEXTO_OSCURO = [30, 30, 30]
const AMARILLO_CLARO = [255, 251, 235]
const AZUL_LINEA = [100, 160, 220]

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

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

function formatearFechaCorta(fechaStr) {
  const partes = (fechaStr || '').split('-')
  if (partes.length !== 3) return fechaStr || ''
  return `${partes[2]}/${partes[1]}`
}

function dibujarGraficoLinea(doc, serie, escalaMax, x, y, ancho, alto, color) {
  doc.setDrawColor(210, 210, 210)
  doc.setLineWidth(0.5)
  doc.rect(x, y, ancho, alto)

  if (serie.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text('Sin registros en este período', x + ancho / 2, y + alto / 2, { align: 'center' })
    return
  }

  const paddingX = 6
  const paddingY = 6
  const puntos = serie.map((s, i) => {
    const px = serie.length === 1 ? x + ancho / 2 : x + paddingX + (i / (serie.length - 1)) * (ancho - paddingX * 2)
    const py = y + paddingY + (1 - s.valor / escalaMax) * (alto - paddingY * 2)
    return { px, py, fecha: s.fecha }
  })

  doc.setDrawColor(...color)
  doc.setLineWidth(1.3)
  for (let i = 0; i < puntos.length - 1; i++) {
    doc.line(puntos[i].px, puntos[i].py, puntos[i + 1].px, puntos[i + 1].py)
  }

  doc.setFillColor(...color)
  puntos.forEach((p) => doc.circle(p.px, p.py, 1.6, 'F'))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...GRIS)
  const paso = Math.max(1, Math.ceil(puntos.length / 6))
  puntos.forEach((p, i) => {
    if (i % paso === 0 || i === puntos.length - 1) {
      doc.text(formatearFechaCorta(p.fecha), p.px, y + alto + 9, { align: 'center' })
    }
  })
}

export async function generarBienestarPDF(jugador, periodo) {
  const { metricas } = await cargarDatosBienestar(jugador.id, periodo)
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  // ===== Encabezado =====
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, pageWidth, 90, 'F')
  doc.setFillColor(...AMARILLO)
  doc.rect(0, 90, pageWidth, 4, 'F')

  if (escudoDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoDataUrl)
      doc.addImage(escudoDataUrl, formato, pageWidth - margin - 44, 22, 44, 44)
    } catch {
      // sin escudo si falla
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLANCO)
  doc.text('Bienestar y esfuerzo', margin, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...AMARILLO)
  const etiquetaPeriodo = periodo === 'mes' ? 'Últimos 30 días' : 'Últimos 7 días'
  doc.text(`${jugador.apellido}, ${jugador.nombre} — ${etiquetaPeriodo}`, margin, 58)

  const hoy = new Date()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text(
    `Club Comunicaciones — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    margin,
    76
  )

  let y = 120

  // ===== Tabla resumen =====
  doc.setFillColor(...NEGRO)
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...AMARILLO)
  const colX = [margin + 10, margin + 200, margin + 300, margin + 400]
  doc.text('Métrica', colX[0], y + 14)
  doc.text('Este período', colX[1], y + 14)
  doc.text('Período anterior', colX[2], y + 14)
  doc.text('Tendencia', colX[3], y + 14)
  y += 22

  metricas.forEach((m, i) => {
    doc.setFillColor(...(i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...NEGRO)
    doc.text(m.label, colX[0], y + 14)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(m.promedioActual !== null ? `${m.promedioActual.toFixed(1)} / ${m.escalaMax}` : '—', colX[1], y + 14)
    doc.text(m.promedioAnterior !== null ? `${m.promedioAnterior.toFixed(1)} / ${m.escalaMax}` : '—', colX[2], y + 14)

    let textoTendencia = '—'
    let colorTendencia = GRIS
    if (m.tendencia === 'sube') {
      textoTendencia = '↑ Subió'
      colorTendencia = m.clave === 'rpe' ? [200, 140, 0] : [200, 60, 60]
    } else if (m.tendencia === 'baja') {
      textoTendencia = '↓ Bajó'
      colorTendencia = [70, 150, 90]
    } else if (m.tendencia === 'estable') {
      textoTendencia = '→ Estable'
      colorTendencia = GRIS
    }
    doc.setTextColor(...colorTendencia)
    doc.text(textoTendencia, colX[3], y + 14)

    y += 22
  })

  y += 20

  // ===== Gráficos por métrica =====
  const anchoGrafico = pageWidth - margin * 2
  const altoGrafico = 90

  metricas.forEach((m) => {
    if (y + altoGrafico + 40 > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 40
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...NEGRO)
    doc.text(m.label, margin, y)
    y += 10
    const color = m.clave === 'rpe' ? [220, 160, 30] : AZUL_LINEA
    dibujarGraficoLinea(doc, m.serie, m.escalaMax, margin, y, anchoGrafico, altoGrafico, color)
    y += altoGrafico + 30
  })

  doc.save(`Bienestar_${jugador.apellido}_${jugador.nombre}_${periodo}`.replace(/\s+/g, '_') + '.pdf')
}
