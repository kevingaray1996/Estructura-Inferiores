import { jsPDF } from 'jspdf'

const NEGRO = [23, 23, 23]
const AMARILLO = [251, 191, 36]
const BLANCO = [255, 255, 255]
const GRIS = [90, 100, 115]
const TEXTO_OSCURO = [30, 30, 30]
const AMARILLO_CLARO = [255, 251, 235]

const ESCUDO_CLUB_URL = 'https://qvjviyjkxyngiggoeqlj.supabase.co/storage/v1/object/public/Biblioteca/escudos/Escudo%20simplificado.png'

const NIVEL_COLOR = {
  normal: [74, 222, 128],
  moderado: [251, 191, 36],
  alerta: [248, 113, 113],
}
const NIVEL_LABEL = { normal: 'Normal', moderado: 'Moderado', alerta: 'Alerta' }

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

function promedio(valores) {
  const limpios = valores.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (limpios.length === 0) return null
  return limpios.reduce((a, b) => a + b, 0) / limpios.length
}

function fechaISO(date) {
  const anio = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function restarDias(fecha, dias) {
  const d = new Date(fecha)
  d.setDate(d.getDate() - dias)
  return d
}

function dibujarEncabezado(doc, pageWidth, titulo, subtitulo, escudoDataUrl) {
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, pageWidth, 90, 'F')
  doc.setFillColor(...AMARILLO)
  doc.rect(0, 90, pageWidth, 4, 'F')

  if (escudoDataUrl) {
    try {
      const formato = formatoDeDataUrl(escudoDataUrl)
      doc.addImage(escudoDataUrl, formato, pageWidth - 40 - 44, 22, 44, 44)
    } catch {
      // ignorar
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLANCO)
  doc.text(titulo, 40, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...AMARILLO)
  doc.text(subtitulo, 40, 58)

  const hoy = new Date()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text(
    `Club Comunicaciones — generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`,
    40,
    76
  )
}

export async function generarCMJIndividualPDF(jugador, historial, resultado) {
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  dibujarEncabezado(doc, pageWidth, 'Informe de CMJ', `${jugador.apellido}, ${jugador.nombre}`, escudoDataUrl)

  const hoy = new Date()
  const desdeSemana = fechaISO(restarDias(hoy, 6))
  const desdeMes = fechaISO(restarDias(hoy, 27))
  const promedioSemanal = promedio(historial.filter((h) => h.fecha >= desdeSemana).map((h) => h.valor_cm))
  const promedioMensual = promedio(historial.filter((h) => h.fecha >= desdeMes).map((h) => h.valor_cm))
  const ultimoValor = historial[0]?.valor_cm ?? null

  let y = 125

  const cardW = (pageWidth - margin * 2 - 20) / 3
  const cards = [
    { label: 'ÚLTIMO', valor: ultimoValor !== null ? `${ultimoValor} cm` : '—' },
    { label: 'PROM. SEMANAL', valor: promedioSemanal !== null ? `${promedioSemanal.toFixed(1)} cm` : '—' },
    { label: 'PROM. MENSUAL', valor: promedioMensual !== null ? `${promedioMensual.toFixed(1)} cm` : '—' },
  ]
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + 10)
    doc.setFillColor(...AMARILLO_CLARO)
    doc.roundedRect(x, y, cardW, 50, 8, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(c.label, x + 12, y + 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...NEGRO)
    doc.text(c.valor, x + 12, y + 38)
  })
  y += 70

  if (resultado) {
    const colorNivel = resultado.nivel ? NIVEL_COLOR[resultado.nivel] : GRIS
    doc.setFillColor(...colorNivel)
    doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 8, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NEGRO)
    const texto = resultado.nivel
      ? `Estado: ${NIVEL_LABEL[resultado.nivel]}${resultado.bajaConsecutiva ? ' — 3 mediciones seguidas en baja' : ''}`
      : 'Datos insuficientes para calcular el estado'
    doc.text(texto, pageWidth / 2, y + 20, { align: 'center' })
    y += 50
  }

  doc.setFillColor(...NEGRO)
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...AMARILLO)
  doc.text('Fecha', margin + 10, y + 14)
  doc.text('Valor (cm)', margin + 220, y + 14)
  y += 22

  historial.forEach((h, i) => {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage()
      y = 40
    }
    doc.setFillColor(...(i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(h.fecha, margin + 10, y + 15)
    doc.text(String(h.valor_cm), margin + 220, y + 15)
    y += 22
  })

  if (historial.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text('Sin mediciones cargadas.', margin, y + 14)
  }

  doc.save(`CMJ_${jugador.apellido}_${jugador.nombre}`.replace(/\s+/g, '_') + '.pdf')
}

export async function generarCMJCategoriaPDF(categoriaNombre, filas) {
  const escudoDataUrl = await cargarImagenDataURL(ESCUDO_CLUB_URL)
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  dibujarEncabezado(doc, pageWidth, 'Informe de CMJ', categoriaNombre || '', escudoDataUrl)

  let y = 120

  const columnas = [
    { label: 'Jugadora', x: margin },
    { label: 'Último (cm)', x: margin + 300 },
    { label: '% baja', x: margin + 460 },
    { label: 'Estado', x: margin + 600 },
  ]

  function dibujarCabecera() {
    doc.setFillColor(...NEGRO)
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...AMARILLO)
    columnas.forEach((c) => doc.text(c.label, c.x + 8, y + 14))
    y += 22
  }

  dibujarCabecera()

  doc.setFont('helvetica', 'normal')
  filas.forEach(({ jugador, resultado }, i) => {
    if (y > pageHeight - 60) {
      doc.addPage()
      y = 40
      dibujarCabecera()
    }
    doc.setFillColor(...(i % 2 === 0 ? AMARILLO_CLARO : [255, 255, 255]))
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F')

    doc.setFontSize(9.5)
    doc.setTextColor(...NEGRO)
    doc.text(`${jugador.apellido}, ${jugador.nombre}`, columnas[0].x + 8, y + 15)

    doc.setTextColor(...TEXTO_OSCURO)
    doc.text(resultado.ultimoValor !== null ? String(resultado.ultimoValor) : '—', columnas[1].x + 8, y + 15)
    doc.text(resultado.porcentaje !== null ? `${resultado.porcentaje.toFixed(1)}%` : '—', columnas[2].x + 8, y + 15)

    if (resultado.nivel) {
      const color = NIVEL_COLOR[resultado.nivel]
      doc.setFillColor(...color)
      doc.roundedRect(columnas[3].x + 8, y + 4, 90, 14, 6, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...NEGRO)
      const texto = NIVEL_LABEL[resultado.nivel] + (resultado.bajaConsecutiva ? ' ·3x' : '')
      doc.text(texto, columnas[3].x + 53, y + 14, { align: 'center' })
      doc.setFont('helvetica', 'normal')
    } else {
      doc.setTextColor(...GRIS)
      doc.text('Sin datos', columnas[3].x + 8, y + 15)
    }

    y += 22
  })

  doc.save(`CMJ_${(categoriaNombre || 'categoria').replace(/\s+/g, '_')}.pdf`)
}